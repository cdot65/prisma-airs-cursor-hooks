// Re-export SDK types we use directly
export type {
  ScanResponse,
  Metadata,
} from "@cdot65/prisma-airs-sdk";

/** Operational mode */
export type Mode = "observe" | "enforce" | "bypass";

/** Retry configuration */
export interface RetryConfig {
  enabled: boolean;
  max_attempts: number;
  backoff_base_ms: number;
}

/** Logging configuration */
export interface LoggingConfig {
  path: string;
  include_content: boolean;
}

/** Profile configuration */
export interface ProfileConfig {
  prompt: string;
  response: string;
  tool: string;
}

/** Per-detection-service enforcement action */
export type EnforcementAction = "block" | "mask" | "allow";

/** Per-service enforcement overrides (Phase 3) */
export interface EnforcementConfig {
  [detectionService: string]: EnforcementAction;
}

/** Circuit breaker configuration */
export interface CircuitBreakerConfig {
  enabled: boolean;
  failure_threshold: number;
  cooldown_ms: number;
}

/** Content size limits for scanning */
export interface ContentLimitsConfig {
  max_scan_bytes: number;
  truncate_bytes: number;
}

/** Top-level AIRS configuration (airs-config.json) */
export interface AirsConfig {
  endpoint: string;
  apiKeyEnvVar: string;
  profiles: ProfileConfig;
  mode: Mode;
  timeout_ms: number;
  retry: RetryConfig;
  logging: LoggingConfig;
  /** Per-service enforcement actions (only applies in enforce mode) */
  enforcement?: EnforcementConfig;
  /** Circuit breaker settings */
  circuit_breaker?: CircuitBreakerConfig;
  /** Content size limits for scanning */
  content_limits?: ContentLimitsConfig;
}

/** Scan direction */
export type ScanDirection = "prompt" | "response" | "tool";

/** Log entry written by the structured logger */
export interface ScanLogEntry {
  timestamp: string;
  event: string;
  scan_id: string;
  direction: ScanDirection;
  verdict: "allow" | "block";
  action_taken: "allowed" | "blocked" | "observed" | "bypassed" | "error";
  latency_ms: number;
  detection_services_triggered: string[];
  error: string | null;
  content?: string;
}

/** Result from code extraction */
export interface ExtractedContent {
  naturalLanguage: string;
  codeBlocks: string[];
  languages: string[];
}

/** Internal hook result from scanner logic */
export interface HookResult {
  action: "pass" | "block";
  message?: string;
}

// ---------------------------------------------------------------------------
// Cursor Hooks API types (v1)
// See: https://docs.cursor.com/configuration/hooks
// ---------------------------------------------------------------------------

/** Common fields Cursor injects into every hook's stdin JSON */
export interface CursorHookInput {
  conversation_id?: string;
  generation_id?: string;
  model?: string;
  hook_event_name: string;
  cursor_version?: string;
  workspace_roots?: string[];
  user_email?: string;
  transcript_path?: string;
}

/** stdin for beforeSubmitPrompt hook */
export interface BeforeSubmitPromptInput extends CursorHookInput {
  prompt: string;
  attachments?: unknown[];
}

/** stdin for afterAgentResponse hook */
export interface AfterAgentResponseInput extends CursorHookInput {
  text: string;
}

/** stdin for beforeMCPExecution hook */
export interface BeforeMCPExecutionInput extends CursorHookInput {
  tool_name: string;
  tool_input: unknown;
}

/** stdin for postToolUse hook */
export interface PostToolUseInput extends CursorHookInput {
  tool_name: string;
  tool_input: unknown;
  tool_output: unknown;
  tool_use_id?: string;
}

/**
 * Cursor hook stdout JSON for beforeSubmitPrompt.
 * Uses continue: true/false to allow/block the prompt.
 */
export interface BeforeSubmitPromptOutput {
  continue: boolean;
  user_message?: string;
}

/**
 * Cursor hook stdout JSON for most other hooks.
 * Uses permission: "allow"|"deny" to allow/block.
 */
export interface CursorHookOutput {
  /** "allow" passes through, "deny" blocks */
  permission: "allow" | "deny";
  /** Message shown to the user in Cursor's UI */
  userMessage?: string;
  /** Message injected into the agent context (invisible to the user) */
  agentMessage?: string;
}

/** Cursor hooks.json file format */
export interface CursorHooksConfig {
  version: 1;
  hooks: {
    [eventName: string]: CursorHookEntry[];
  };
}

/** Single hook entry inside hooks.json */
export interface CursorHookEntry {
  command: string;
  timeout?: number;
  /** true = block the action if the hook fails; false = fail-open (default) */
  failClosed?: boolean;
}
