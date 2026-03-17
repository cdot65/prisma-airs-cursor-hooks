import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { CursorHookOutput, BeforeSubmitPromptOutput, BeforeSubmitPromptInput, AfterAgentResponseInput } from "../src/types.js";

const TMP_DIR = join(import.meta.dirname, ".tmp-hooks-test");
const CONFIG_DIR = join(TMP_DIR, ".cursor", "hooks");
const CONFIG_PATH = join(CONFIG_DIR, "airs-config.json");

const AIRS_CONFIG = {
  endpoint: "https://test.api.prismacloud.io",
  apiKeyEnvVar: "AIRS_API_KEY",
  profiles: { prompt: "test-prompt", response: "test-response" },
  mode: "observe",
  timeout_ms: 3000,
  retry: { enabled: false, max_attempts: 0, backoff_base_ms: 50 },
  logging: { path: join(TMP_DIR, "scan.log"), include_content: false },
};

/**
 * Runs a hook script with JSON piped to stdin, returns parsed stdout.
 * Sets env vars and cwd so the hook finds our test config.
 */
function runHook(
  scriptPath: string,
  stdinJson: object,
  env: Record<string, string> = {},
): CursorHookOutput {
  const input = JSON.stringify(stdinJson);
  const fullEnv = {
    ...process.env,
    AIRS_API_KEY: "test-key-123",
    AIRS_API_ENDPOINT: "https://test.api.prismacloud.io",
    ...env,
  };

  // The hook will fail to reach AIRS (no real API) and should fail-open
  const result = execSync(
    `echo '${input.replace(/'/g, "'\\''")}' | npx tsx ${scriptPath}`,
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
            AIRS_API_KEY: "test",
            AIRS_API_ENDPOINT: "https://test.api.prismacloud.io",
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
});
