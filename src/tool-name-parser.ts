// src/tool-name-parser.ts

/** Parsed tool name components */
export interface ParsedToolName {
  server: string;
  tool: string;
}

/**
 * Parse a Cursor tool_name into server and tool components.
 *
 * "MCP:github:get_file_contents" → { server: "github", tool: "get_file_contents" }
 * "MCP:filesystem:read:nested"   → { server: "filesystem", tool: "read:nested" }
 * "Bash"                         → { server: "cursor", tool: "Bash" }
 */
export function parseToolName(raw: string): ParsedToolName {
  if (raw.startsWith("MCP:")) {
    const withoutPrefix = raw.slice(4);
    const firstColon = withoutPrefix.indexOf(":");
    if (firstColon === -1) {
      return { server: withoutPrefix, tool: withoutPrefix };
    }
    return {
      server: withoutPrefix.slice(0, firstColon),
      tool: withoutPrefix.slice(firstColon + 1),
    };
  }
  return { server: "cursor", tool: raw };
}
