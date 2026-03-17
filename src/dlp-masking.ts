/** Enforcement action per detection service */
export type EnforcementAction = "block" | "mask" | "allow";

/** Default enforcement configuration */
export const DEFAULT_ENFORCEMENT: Record<string, EnforcementAction> = {
  prompt_injection: "block",
  dlp: "block",
  malicious_code: "block",
  url_categorization: "block",
  toxicity: "block",
  custom_topic: "block",
};

interface Finding {
  detection_service: string;
  verdict: string;
  detail: string;
}

/** Determine the enforcement action for a set of findings */
export function getEnforcementAction(
  findings: Finding[],
  enforcement: Record<string, EnforcementAction> = DEFAULT_ENFORCEMENT,
): EnforcementAction {
  let hasMask = false;

  for (const finding of findings) {
    const action = enforcement[finding.detection_service] ?? "block";
    if (action === "block") return "block";
    if (action === "mask") hasMask = true;
  }

  return hasMask ? "mask" : "allow";
}

/** Simple masking: replace sensitive substrings with asterisks */
export function maskContent(
  content: string,
  patterns: string[],
): string {
  let masked = content;
  for (const pattern of patterns) {
    if (pattern && masked.includes(pattern)) {
      masked = masked.replaceAll(pattern, "*".repeat(pattern.length));
    }
  }
  return masked;
}
