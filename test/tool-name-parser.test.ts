// test/tool-name-parser.test.ts
import { describe, it, expect } from "vitest";
import { parseToolName } from "../src/tool-name-parser.js";

describe("parseToolName", () => {
  it("parses MCP tool with server and tool name", () => {
    const result = parseToolName("MCP:github:get_file_contents");
    expect(result).toEqual({ server: "github", tool: "get_file_contents" });
  });

  it("parses MCP tool with nested colons in tool name", () => {
    const result = parseToolName("MCP:filesystem:read:nested");
    expect(result).toEqual({ server: "filesystem", tool: "read:nested" });
  });

  it("returns cursor server for non-MCP tools", () => {
    const result = parseToolName("Bash");
    expect(result).toEqual({ server: "cursor", tool: "Bash" });
  });

  it("returns cursor server for Write tool", () => {
    const result = parseToolName("Write");
    expect(result).toEqual({ server: "cursor", tool: "Write" });
  });

  it("returns cursor server for Edit tool", () => {
    const result = parseToolName("Edit");
    expect(result).toEqual({ server: "cursor", tool: "Edit" });
  });

  it("handles empty string", () => {
    const result = parseToolName("");
    expect(result).toEqual({ server: "cursor", tool: "" });
  });

  it("handles MCP prefix with no tool", () => {
    const result = parseToolName("MCP:server");
    expect(result).toEqual({ server: "server", tool: "server" });
  });
});
