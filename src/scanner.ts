import { execSync } from "node:child_process";
import type { AirsConfig, HookResult, ScanDirection } from "./types.js";
import { executeScan, AISecSDKException, type ScanRequest } from "./airs-client.js";
import type { ScanResponse } from "@cdot65/prisma-airs-sdk";
import { parseToolName } from "./tool-name-parser.js";
import { extractCode, joinCodeBlocks } from "./code-extractor.js";
import { Logger } from "./logger.js";
import { getEnforcementAction, DEFAULT_ENFORCEMENT } from "./dlp-masking.js";
import { applyContentLimits, DEFAULT_CONTENT_LIMITS } from "./content-limits.js";

// ---------------------------------------------------------------------------
// Human-readable detection labels for UX messages
// ---------------------------------------------------------------------------
const DETECTION_LABELS: Record<string, string> = {
  prompt_injection: "Prompt Injection",
  dlp: "Data Loss Prevention (DLP)",
  toxicity: "Toxic Content",
  url_categorization: "Suspicious URL",
  malicious_code: "Malicious Code",
  custom_topic: "Topic Policy Violation",
};

function friendlyDetectionName(key: string): string {
  return DETECTION_LABELS[key] ?? key;
}

/** Comma-joined friendly names, with a fallback when AIRS reports no per-service detail */
function detectionList(detections: string[]): string {
  if (detections.length === 0) return "Security Policy";
  return detections.map(friendlyDetectionName).join(", ");
}

// ---------------------------------------------------------------------------
// Detection extraction from SDK ScanResponse
// ---------------------------------------------------------------------------

interface DetectionInfo {
  services: string[];
  findings: { detection_service: string; verdict: string; detail: string }[];
}

function extractDetections(result: ScanResponse): DetectionInfo {
  const services: string[] = [];
  const findings: { detection_service: string; verdict: string; detail: string }[] = [];
  const pd = result.prompt_detected;
  if (pd) {
    if (pd.injection) {
      services.push("prompt_injection");
      findings.push({ detection_service: "prompt_injection", verdict: "malicious", detail: "Prompt injection detected" });
    }
    if (pd.dlp) {
      services.push("dlp");
      findings.push({ detection_service: "dlp", verdict: "detected", detail: "Sensitive data detected in prompt" });
    }
    if (pd.toxic_content) {
      services.push("toxicity");
      findings.push({ detection_service: "toxicity", verdict: "toxic", detail: "Toxic content detected" });
    }
    if (pd.url_cats) {
      services.push("url_categorization");
      findings.push({ detection_service: "url_categorization", verdict: "suspicious", detail: "Suspicious URL detected" });
    }
    if (pd.malicious_code) {
      services.push("malicious_code");
      findings.push({ detection_service: "malicious_code", verdict: "malicious", detail: "Malicious code detected" });
    }
    if (pd.topic_violation) {
      services.push("custom_topic");
      findings.push({ detection_service: "custom_topic", verdict: "violation", detail: "Topic policy violation" });
    }
  }
  const rd = result.response_detected;
  if (rd) {
    if (rd.malicious_code) {
      services.push("malicious_code");
      findings.push({ detection_service: "malicious_code", verdict: "malicious", detail: "Malicious code detected in response" });
    }
    if (rd.dlp) {
      services.push("dlp");
      findings.push({ detection_service: "dlp", verdict: "detected", detail: "Sensitive data detected in response" });
    }
    if (rd.toxic_content) {
      services.push("toxicity");
      findings.push({ detection_service: "toxicity", verdict: "toxic", detail: "Toxic content in response" });
    }
    if (rd.url_cats) {
      services.push("url_categorization");
      findings.push({ detection_service: "url_categorization", verdict: "suspicious", detail: "Suspicious URL in response" });
    }
  }
  return { services, findings };
}

// ---------------------------------------------------------------------------
// Resolve the developer's identity
// Cursor provides CURSOR_USER_EMAIL; fall back to git config then OS user.
// ---------------------------------------------------------------------------

function getAppUser(): string {
  const cursorEmail = process.env.CURSOR_USER_EMAIL;
  if (cursorEmail) return cursorEmail;

  try {
    const email = execSync("git config user.email", { encoding: "utf-8" }).trim();
    if (email) return email;
  } catch {
    // no git or no configured email — fall through
  }
  return process.env.USER ?? process.env.USERNAME ?? "unknown";
}

// ---------------------------------------------------------------------------
// Build UX-friendly block messages
// ---------------------------------------------------------------------------

const BANNER_BAR = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";

function buildBanner(title: string, body: string[]): string {
  return ["", BANNER_BAR, `  ${title}`, BANNER_BAR, "", ...body, "", BANNER_BAR, ""].join("\n");
}

/** Context for a block message: what was flagged, by which profile, and how to follow up */
interface BlockContext {
  detections: string[];
  category: string;
  profileName: string;
  scanId: string;
}

function buildPromptBlockMessage(ctx: BlockContext): string {
  return buildBanner("Prisma AIRS — Prompt Blocked", [
    `  What happened:  Your prompt was flagged by the ${detectionList(ctx.detections)} security check.`,
    `  Category:       ${ctx.category}`,
    `  Profile:        ${ctx.profileName}`,
    "",
    "  What to do:",
    "    - Review your prompt for sensitive data, injection patterns, or policy violations.",
    "    - Modify the prompt and try again.",
    "    - If you believe this is a false positive, contact your security team",
    `      and reference Scan ID: ${ctx.scanId}`,
  ]);
}

function buildFileReadBlockMessage(filePath: string, ctx: BlockContext): string {
  return buildBanner("Prisma AIRS — File Read Blocked", [
    `  File:           ${filePath}`,
    `  What happened:  The file contents were flagged by the ${detectionList(ctx.detections)} security check.`,
    `  Category:       ${ctx.category}`,
    `  Profile:        ${ctx.profileName}`,
    "",
    "  What to do:",
    "    - The file may contain secrets, PII, or other sensitive data.",
    "    - Remove or redact the sensitive content, or exclude the file from context.",
    "    - If you believe this is a false positive, contact your security team",
    `      and reference Scan ID: ${ctx.scanId}`,
  ]);
}

function buildSubagentBlockMessage(subagentType: string, ctx: BlockContext): string {
  return buildBanner("Prisma AIRS — Subagent Blocked", [
    `  Subagent:       ${subagentType}`,
    `  What happened:  The subagent task was flagged by the ${detectionList(ctx.detections)} security check.`,
    `  Category:       ${ctx.category}`,
    `  Profile:        ${ctx.profileName}`,
    "",
    "  What to do:",
    "    - The task text may contain injection patterns or policy violations.",
    "    - If you believe this is a false positive, contact your security team",
    `      and reference Scan ID: ${ctx.scanId}`,
  ]);
}

function buildResponseBlockMessage(ctx: BlockContext): string {
  return buildBanner("Prisma AIRS — Response Flagged (observe-only)", [
    `  What happened:  The AI response was flagged by the ${detectionList(ctx.detections)} security check.`,
    `  Category:       ${ctx.category}`,
    `  Profile:        ${ctx.profileName}`,
    "",
    "  Note: Cursor's afterAgentResponse hook is observe-only.",
    "  The response has already been displayed and cannot be retracted.",
    "",
    "  What to do:",
    "    - Do NOT use the flagged content (it may contain sensitive data or unsafe code).",
    "    - If you believe this is a false positive, contact your security team",
    `      and reference Scan ID: ${ctx.scanId}`,
  ]);
}

function buildToolBlockMessage(toolName: string, ctx: BlockContext): string {
  return buildBanner("Prisma AIRS — MCP Tool Call Blocked", [
    `  Tool:       ${toolName}`,
    `  What happened:  The tool input was flagged by the ${detectionList(ctx.detections)} security check.`,
    `  Category:       ${ctx.category}`,
    `  Profile:        ${ctx.profileName}`,
    "",
    "  What to do:",
    "    - The tool input may contain injection patterns or malicious parameters.",
    "    - If you believe this is a false positive, contact your security team",
    `      and reference Scan ID: ${ctx.scanId}`,
  ]);
}

function buildMaskedMessage(maskedServices: string[]): string {
  const names = maskedServices.map(friendlyDetectionName).join(", ");
  return buildBanner("Prisma AIRS — Sensitive Data Masked", [
    `  ${names} detected sensitive data in your content.`,
    "  The flagged patterns have been masked with asterisks.",
  ]);
}

// ---------------------------------------------------------------------------
// Core scan flow — shared by all directions
// ---------------------------------------------------------------------------

/** True (and logged) when scanning is bypassed by config mode */
function bypassed(config: AirsConfig, direction: ScanDirection, logger: Logger): boolean {
  if (config.mode !== "bypass") return false;
  logger.logEvent("scan_bypassed", { direction });
  return true;
}

/**
 * Apply configured size limits to one piece of scan content.
 * Returns the (possibly truncated) content, or null when the content
 * exceeds max_scan_bytes and the scan must be skipped (fail-open).
 */
function limitContent(
  config: AirsConfig,
  direction: ScanDirection,
  content: string,
  logger: Logger,
): string | null {
  const limits = config.content_limits ?? DEFAULT_CONTENT_LIMITS;
  const limited = applyContentLimits(content, limits);
  if (limited.skipped) {
    logger.logEvent("scan_skipped_size_limit", { direction });
    return null;
  }
  return limited.content;
}

/**
 * Run one scan end-to-end: call AIRS, log the outcome, and translate the
 * verdict into a HookResult according to mode and per-service enforcement.
 * Fails open (pass) on any transport error.
 */
async function runScan(
  config: AirsConfig,
  request: ScanRequest,
  logger: Logger,
  blockMessage: (ctx: BlockContext) => string,
): Promise<HookResult> {
  const direction = request.direction;
  const appUser = getAppUser();

  try {
    const { result, latencyMs } = await executeScan(config, request, appUser, logger);

    const verdict = result.action === "block" ? "block" : "allow";
    const { services: detections, findings } = extractDetections(result);

    const actionTaken =
      config.mode === "observe"
        ? "observed"
        : verdict === "block"
          ? "blocked"
          : "allowed";

    logger.logScan({
      event: "scan_complete",
      scan_id: result.scan_id ?? "",
      direction,
      verdict,
      action_taken: actionTaken,
      latency_ms: latencyMs,
      detection_services_triggered: detections,
      error: null,
    });

    if (config.mode === "enforce" && verdict === "block") {
      // Check per-service enforcement — some services may be set to "mask" or "allow".
      // A block verdict with no parsed detection services (e.g. tool_event scans)
      // must still block: per-service overrides can't apply to unknown services.
      const enforcement = config.enforcement ?? DEFAULT_ENFORCEMENT;
      const enforcementAction =
        findings.length > 0 ? getEnforcementAction(findings, enforcement) : "block";

      if (enforcementAction === "allow") {
        return { action: "pass" };
      }

      if (enforcementAction === "mask") {
        // DLP masking: content already left the editor, so we can't rewrite it —
        // log the event and warn the user instead
        const maskedServices = findings
          .filter((f) => (enforcement[f.detection_service] ?? "block") === "mask")
          .map((f) => f.detection_service);
        logger.logEvent("dlp_mask_applied", { direction, services: maskedServices });
        return { action: "pass", message: buildMaskedMessage(maskedServices) };
      }

      return {
        action: "block",
        message: blockMessage({
          detections,
          category: result.category ?? "policy violation",
          profileName: config.profiles[direction],
          scanId: result.scan_id ?? "unknown",
        }),
      };
    }

    return { action: "pass" };
  } catch (err) {
    const isAuth =
      err instanceof AISecSDKException && err.message.includes("401");

    const message = isAuth
      ? "AIRS authentication failed. Check your API key."
      : `AIRS scan failed — allowing ${direction === "tool" ? "tool event" : direction} (fail-open)`;

    logger.logScan({
      event: "scan_error",
      scan_id: "",
      direction,
      verdict: "allow",
      action_taken: "error",
      latency_ms: 0,
      detection_services_triggered: [],
      error: message,
    });

    if (isAuth) {
      return { action: "pass", message: `Warning: ${message}` };
    }
    return { action: "pass" };
  }
}

// ---------------------------------------------------------------------------
// Public scan entry points — one per direction
// ---------------------------------------------------------------------------

/** Scan a developer prompt (beforeSubmitPrompt hook) */
export async function scanPrompt(
  config: AirsConfig,
  prompt: string,
  logger: Logger,
): Promise<HookResult> {
  if (bypassed(config, "prompt", logger)) return { action: "pass" };
  if (!prompt.trim()) return { action: "pass" };

  const limited = limitContent(config, "prompt", prompt, logger);
  if (limited === null) return { action: "pass" };

  return runScan(config, { direction: "prompt", prompt: limited }, logger, buildPromptBlockMessage);
}

/** Scan file contents before they reach the model (beforeReadFile and beforeTabFileRead hooks) */
export async function scanFileRead(
  config: AirsConfig,
  content: string,
  filePath: string,
  logger: Logger,
): Promise<HookResult> {
  if (bypassed(config, "prompt", logger)) return { action: "pass" };
  if (!content.trim()) return { action: "pass" };

  const limited = limitContent(config, "prompt", content, logger);
  if (limited === null) return { action: "pass" };

  return runScan(
    config,
    { direction: "prompt", prompt: limited },
    logger,
    (ctx) => buildFileReadBlockMessage(filePath, ctx),
  );
}

/** Scan a subagent task description before the subagent spawns (subagentStart hook) */
export async function scanSubagentTask(
  config: AirsConfig,
  task: string,
  subagentType: string,
  logger: Logger,
): Promise<HookResult> {
  if (bypassed(config, "prompt", logger)) return { action: "pass" };
  if (!task.trim()) return { action: "pass" };

  const limited = limitContent(config, "prompt", task, logger);
  if (limited === null) return { action: "pass" };

  return runScan(
    config,
    { direction: "prompt", prompt: limited },
    logger,
    (ctx) => buildSubagentBlockMessage(subagentType, ctx),
  );
}

/** Scan an AI response, splitting code from natural language (afterAgentResponse hook) */
export async function scanResponse(
  config: AirsConfig,
  responseText: string,
  logger: Logger,
): Promise<HookResult> {
  if (bypassed(config, "response", logger)) return { action: "pass" };
  if (!responseText.trim()) return { action: "pass" };

  const limitedText = limitContent(config, "response", responseText, logger);
  if (limitedText === null) return { action: "pass" };
  responseText = limitedText;

  const extracted = extractCode(responseText);
  const codeResponse =
    extracted.codeBlocks.length > 0
      ? joinCodeBlocks(extracted.codeBlocks)
      : undefined;

  const nlText = codeResponse ? extracted.naturalLanguage : responseText;

  return runScan(
    config,
    { direction: "response", response: nlText, codeResponse },
    logger,
    buildResponseBlockMessage,
  );
}

/** Scan an MCP tool input/output (beforeMCPExecution and postToolUse hooks) */
export async function scanToolEvent(
  config: AirsConfig,
  toolName: string,
  input: string | undefined,
  output: string | undefined,
  logger: Logger,
): Promise<HookResult> {
  if (bypassed(config, "tool", logger)) return { action: "pass" };
  if (!input?.trim() && !output?.trim()) return { action: "pass" };

  // Limit input and output independently; skip only when nothing scannable remains
  const limitedInput = input?.trim() ? limitContent(config, "tool", input, logger) : null;
  const limitedOutput = output?.trim() ? limitContent(config, "tool", output, logger) : null;
  if (limitedInput === null && limitedOutput === null) return { action: "pass" };
  input = limitedInput ?? undefined;
  output = limitedOutput ?? undefined;

  const parsed = parseToolName(toolName);

  return runScan(
    config,
    {
      direction: "tool",
      serverName: parsed.server,
      toolInvoked: parsed.tool,
      input,
      output,
    },
    logger,
    (ctx) => buildToolBlockMessage(toolName, ctx),
  );
}
