import { describe, it, expect } from "vitest";
import { getEnforcementAction, maskContent } from "../src/dlp-masking.js";

interface Finding {
  detection_service: string;
  verdict: string;
  detail: string;
}

describe("getEnforcementAction", () => {
  it("returns block when any finding maps to block", () => {
    const findings: Finding[] = [
      { detection_service: "prompt_injection", verdict: "malicious", detail: "" },
    ];
    expect(getEnforcementAction(findings)).toBe("block");
  });

  it("returns mask when DLP is set to mask", () => {
    const findings: Finding[] = [
      { detection_service: "dlp", verdict: "detected", detail: "API key found" },
    ];
    expect(getEnforcementAction(findings, { dlp: "mask" })).toBe("mask");
  });

  it("returns block over mask when both present", () => {
    const findings: Finding[] = [
      { detection_service: "dlp", verdict: "detected", detail: "" },
      { detection_service: "prompt_injection", verdict: "malicious", detail: "" },
    ];
    expect(
      getEnforcementAction(findings, {
        dlp: "mask",
        prompt_injection: "block",
      }),
    ).toBe("block");
  });

  it("returns allow when all findings map to allow", () => {
    const findings: Finding[] = [
      { detection_service: "toxicity", verdict: "low", detail: "" },
    ];
    expect(getEnforcementAction(findings, { toxicity: "allow" })).toBe("allow");
  });

  it("defaults unknown services to block", () => {
    const findings: Finding[] = [
      { detection_service: "new_service", verdict: "detected", detail: "" },
    ];
    expect(getEnforcementAction(findings, {})).toBe("block");
  });
});

describe("maskContent", () => {
  it("replaces sensitive patterns with asterisks", () => {
    const result = maskContent("My API key is sk-12345 and secret is abc", [
      "sk-12345",
      "abc",
    ]);
    expect(result).toBe("My API key is ******** and secret is ***");
  });

  it("handles empty patterns array", () => {
    const result = maskContent("nothing to mask", []);
    expect(result).toBe("nothing to mask");
  });

  it("handles patterns not found in content", () => {
    const result = maskContent("safe text", ["not-here"]);
    expect(result).toBe("safe text");
  });
});
