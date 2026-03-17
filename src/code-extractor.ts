import type { ExtractedContent } from "./types.js";

/** Regex matching fenced code blocks: ```lang\n...\n``` */
const FENCED_BLOCK_RE = /^```(\w*)\n([\s\S]*?)^```$/gm;

/** Heuristic: high density of syntax chars suggests code */
const CODE_INDICATORS = [
  /^import\s+/m,
  /^from\s+\S+\s+import/m,
  /^(?:function|const|let|var|class|def|async|export)\s/m,
  /[{};]\s*$/m,
  /^\s*(?:if|for|while|return|try|catch)\s*[\s(]/m,
];

const CODE_CHAR_THRESHOLD = 0.15;

/** Extract code blocks from a mixed agent response */
export function extractCode(agentResponse: string): ExtractedContent {
  const codeBlocks: string[] = [];
  const languages: string[] = [];
  let naturalLanguage = agentResponse;

  // Extract fenced code blocks
  const matches = [...agentResponse.matchAll(FENCED_BLOCK_RE)];

  if (matches.length > 0) {
    for (const match of matches) {
      const lang = match[1] || "unknown";
      const code = match[2];
      languages.push(lang);
      codeBlocks.push(code);
      naturalLanguage = naturalLanguage.replace(match[0], "");
    }
    naturalLanguage = naturalLanguage.replace(/\n{3,}/g, "\n\n").trim();
    return { naturalLanguage, codeBlocks, languages };
  }

  // Secondary: detect indented code blocks (4+ spaces or tab after blank line)
  const lines = agentResponse.split("\n");
  let inBlock = false;
  let currentBlock: string[] = [];
  const nlLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isIndented = /^(?:    |\t)/.test(line);
    const prevBlank = i === 0 || lines[i - 1].trim() === "";

    if (isIndented && (inBlock || prevBlank)) {
      inBlock = true;
      currentBlock.push(line.replace(/^(?:    |\t)/, ""));
    } else {
      if (inBlock && currentBlock.length > 0) {
        codeBlocks.push(currentBlock.join("\n"));
        languages.push("unknown");
        currentBlock = [];
      }
      inBlock = false;
      nlLines.push(line);
    }
  }
  if (currentBlock.length > 0) {
    codeBlocks.push(currentBlock.join("\n"));
    languages.push("unknown");
  }

  if (codeBlocks.length > 0) {
    return {
      naturalLanguage: nlLines.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
      codeBlocks,
      languages,
    };
  }

  // Fallback heuristic: if response looks like code, treat it all as code
  if (looksLikeCode(agentResponse)) {
    return {
      naturalLanguage: "",
      codeBlocks: [agentResponse],
      languages: ["unknown"],
    };
  }

  return { naturalLanguage: agentResponse, codeBlocks: [], languages: [] };
}

/** Heuristic check: does the text look like source code? */
function looksLikeCode(text: string): boolean {
  const indicatorHits = CODE_INDICATORS.filter((re) => re.test(text)).length;
  if (indicatorHits >= 2) return true;

  const syntaxChars = (text.match(/[{}();=<>[\]]/g) || []).length;
  return syntaxChars / text.length > CODE_CHAR_THRESHOLD;
}

/** Join multiple code blocks for the code_response field */
export function joinCodeBlocks(blocks: string[]): string {
  return blocks.join("\n\n---\n\n");
}
