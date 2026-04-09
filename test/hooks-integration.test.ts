import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import type { CursorHookOutput, BeforeSubmitPromptOutput, BeforeSubmitPromptInput, AfterAgentResponseInput, BeforeMCPExecutionInput, PostToolUseInput } from "../src/types.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "..");
const TMP_DIR = join(import.meta.dirname, ".tmp-hooks-test");
const CONFIG_DIR = join(TMP_DIR, ".cursor", "hooks");
const CONFIG_PATH = join(CONFIG_DIR, "airs-config.json");

const AIRS_CONFIG = {
  endpoint: "https://test.api.prismacloud.io",
  apiKeyEnvVar: "PRISMA_AIRS_API_KEY",
  profiles: { prompt: "test-prompt", response: "test-response", tool: "test-tool" },
  mode: "observe",
  timeout_ms: 3000,
  retry: { enabled: false, max_attempts: 0, backoff_base_ms: 50 },
  logging: { path: join(TMP_DIR, "scan.log"), include_content: false },
  content_limits: { max_scan_bytes: 51200, truncate_bytes: 20000 },
};

/**
 * Runs a hook script with JSON piped to stdin, returns parsed stdout.
 * Sets env vars and cwd so the hook finds our test config.
 */
function runHook(
  scriptPath: string,
  stdinJson: object,
  env: Record<string, string> = {},
  runner = "npx tsx",
): CursorHookOutput {
  const input = JSON.stringify(stdinJson);
  const fullEnv = {
    ...process.env,
    PRISMA_AIRS_API_KEY: "test-key-123",
    PRISMA_AIRS_API_ENDPOINT: "https://test.api.prismacloud.io",
    NODE_PATH: join(PROJECT_ROOT, "node_modules"),
    ...env,
  };

  // The hook will fail to reach AIRS (no real API) and should fail-open
  const result = execSync(
    `echo '${input.replace(/'/g, "'\\''")}' | ${runner} ${scriptPath}`,
    {
      encoding: "utf-8",
      cwd: TMP_DIR,
      env: fullEnv,
      timeout: 10000,
    },
  );

  return JSON.parse(result.trim());
}

describe("hook entry points — Cursor JSON contract", () => {
  beforeEach(() => {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify(AIRS_CONFIG));
  });

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  describe("before-submit-prompt", () => {
    const SCRIPT = join(import.meta.dirname, "..", "src", "hooks", "before-submit-prompt.ts");

    it("returns valid Cursor JSON with continue field", () => {
      const input: BeforeSubmitPromptInput = {
        hook_event_name: "beforeSubmitPrompt",
        prompt: "What is 2+2?",
        user_email: "test@example.com",
      };

      const output = runHook(SCRIPT, input) as unknown as BeforeSubmitPromptOutput;
      expect(output).toHaveProperty("continue");
      expect(output.continue).toBe(true);
    });

    it("allows benign prompts through (fail-open on unreachable API)", () => {
      const input: BeforeSubmitPromptInput = {
        hook_event_name: "beforeSubmitPrompt",
        prompt: "Help me write a sorting function",
      };

      const output = runHook(SCRIPT, input) as unknown as BeforeSubmitPromptOutput;
      expect(output.continue).toBe(true);
    });

    it("allows through on empty prompt", () => {
      const input: BeforeSubmitPromptInput = {
        hook_event_name: "beforeSubmitPrompt",
        prompt: "   ",
      };

      const output = runHook(SCRIPT, input) as unknown as BeforeSubmitPromptOutput;
      expect(output.continue).toBe(true);
    });

    it("allows through on invalid stdin JSON", () => {
      const result = execSync(
        `echo 'not json' | npx tsx ${SCRIPT}`,
        {
          encoding: "utf-8",
          cwd: TMP_DIR,
          env: {
            ...process.env,
            PRISMA_AIRS_API_KEY: "test",
            PRISMA_AIRS_API_ENDPOINT: "https://test.api.prismacloud.io",
          },
          timeout: 10000,
        },
      );

      const output: BeforeSubmitPromptOutput = JSON.parse(result.trim());
      expect(output.continue).toBe(true);
    });
  });

  describe("after-agent-response", () => {
    const SCRIPT = join(import.meta.dirname, "..", "src", "hooks", "after-agent-response.ts");

    it("returns valid Cursor JSON with permission field", () => {
      const input: AfterAgentResponseInput = {
        hook_event_name: "afterAgentResponse",
        text: "The answer is 4.",
      };

      const output = runHook(SCRIPT, input);
      expect(output).toHaveProperty("permission");
      expect(["allow", "deny", "ask"]).toContain(output.permission);
    });

    it("scans responses with code blocks (fail-open on unreachable API)", () => {
      const input: AfterAgentResponseInput = {
        hook_event_name: "afterAgentResponse",
        text: "Here's the code:\n\n```python\ndef sort(arr):\n    return sorted(arr)\n```\n\nThat should work.",
      };

      const output = runHook(SCRIPT, input);
      expect(output.permission).toBe("allow");
    });
  });

  describe("before-mcp-execution", () => {
    const SCRIPT = join(import.meta.dirname, "..", "src", "hooks", "before-mcp-execution.ts");

    it("returns valid Cursor JSON with permission field", () => {
      const input: BeforeMCPExecutionInput = {
        hook_event_name: "beforeMCPExecution",
        tool_name: "MCP:github:get_file_contents",
        tool_input: { path: "README.md" },
      };

      const output = runHook(SCRIPT, input);
      expect(output).toHaveProperty("permission");
      expect(["allow", "deny"]).toContain(output.permission);
    });

    it("allows through on empty tool_input", () => {
      const input: BeforeMCPExecutionInput = {
        hook_event_name: "beforeMCPExecution",
        tool_name: "MCP:github:get_file_contents",
        tool_input: {},
      };

      const output = runHook(SCRIPT, input);
      expect(output.permission).toBe("allow");
    });

    it("allows through on missing tool_name", () => {
      const input = {
        hook_event_name: "beforeMCPExecution",
        tool_input: { path: "test" },
      };

      const output = runHook(SCRIPT, input);
      expect(output.permission).toBe("allow");
    });
  });

  describe("post-tool-use", () => {
    const SCRIPT = join(import.meta.dirname, "..", "src", "hooks", "post-tool-use.ts");

    it("returns empty JSON for MCP tool", () => {
      const input: PostToolUseInput = {
        hook_event_name: "postToolUse",
        tool_name: "MCP:github:get_file_contents",
        tool_input: { path: "README.md" },
        tool_output: "# My Project\nHello world",
      };

      const output = runHook(SCRIPT, input);
      expect(output).toEqual({});
    });

    it("skips Grep tool (built-in)", () => {
      const input: PostToolUseInput = {
        hook_event_name: "postToolUse",
        tool_name: "Grep",
        tool_input: { pattern: "test" },
        tool_output: "file.ts:1:test",
      };

      const output = runHook(SCRIPT, input);
      expect(output).toEqual({});
    });

    it("skips Read tool (built-in)", () => {
      const input: PostToolUseInput = {
        hook_event_name: "postToolUse",
        tool_name: "Read",
        tool_input: { file_path: "/tmp/test.txt" },
        tool_output: "file contents",
      };

      const output = runHook(SCRIPT, input);
      expect(output).toEqual({});
    });

    it("scans Write tool for DLP (fail-open on unreachable API)", () => {
      const input: PostToolUseInput = {
        hook_event_name: "postToolUse",
        tool_name: "Write",
        tool_input: { file_path: "/tmp/test.txt", content: "some content to scan" },
        tool_output: "File written successfully",
      };

      const output = runHook(SCRIPT, input);
      expect(output).toEqual({});
    });
  });

  describe("compiled JS hooks (dist/)", () => {
    const PROMPT_JS = join(import.meta.dirname, "..", "dist", "hooks", "before-submit-prompt.js");
    const RESPONSE_JS = join(import.meta.dirname, "..", "dist", "hooks", "after-agent-response.js");
    const MCP_JS = join(import.meta.dirname, "..", "dist", "hooks", "before-mcp-execution.js");
    const POST_TOOL_JS = join(import.meta.dirname, "..", "dist", "hooks", "post-tool-use.js");

    it("compiled beforeSubmitPrompt allows benign prompt", () => {
      const input: BeforeSubmitPromptInput = {
        hook_event_name: "beforeSubmitPrompt",
        prompt: "What is 2+2?",
      };

      const output = runHook(PROMPT_JS, input, {}, "node") as unknown as BeforeSubmitPromptOutput;
      expect(output.continue).toBe(true);
    });

    it("compiled afterAgentResponse allows benign response", () => {
      const input: AfterAgentResponseInput = {
        hook_event_name: "afterAgentResponse",
        text: "The answer is 4.",
      };

      const output = runHook(RESPONSE_JS, input, {}, "node");
      expect(output.permission).toBe("allow");
    });

    it("compiled beforeMCPExecution allows benign input", () => {
      const input: BeforeMCPExecutionInput = {
        hook_event_name: "beforeMCPExecution",
        tool_name: "MCP:github:get_file_contents",
        tool_input: { path: "README.md" },
      };

      const output = runHook(MCP_JS, input, {}, "node");
      expect(output.permission).toBe("allow");
    });

    it("compiled postToolUse returns empty JSON", () => {
      const input: PostToolUseInput = {
        hook_event_name: "postToolUse",
        tool_name: "MCP:test:tool",
        tool_input: {},
        tool_output: "safe output",
      };

      const output = runHook(POST_TOOL_JS, input, {}, "node");
      expect(output).toEqual({});
    });
  });
});
