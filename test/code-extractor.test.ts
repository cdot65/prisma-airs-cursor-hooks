import { describe, it, expect } from "vitest";
import { extractCode, joinCodeBlocks } from "../src/code-extractor.js";

describe("extractCode", () => {
  it("extracts fenced python code block", () => {
    const input = "Here's a function:\n\n```python\ndef hello():\n    print('hi')\n```\n\nThat's it.";
    const result = extractCode(input);
    expect(result.codeBlocks).toHaveLength(1);
    expect(result.codeBlocks[0]).toContain("def hello()");
    expect(result.languages[0]).toBe("python");
    expect(result.naturalLanguage).toContain("Here's a function:");
    expect(result.naturalLanguage).not.toContain("def hello()");
  });

  it("extracts fenced JS with inline explanation", () => {
    const input = "Check this:\n\n```javascript\nconst x = 1;\n```\n\nThis sets x to 1.";
    const result = extractCode(input);
    expect(result.codeBlocks).toHaveLength(1);
    expect(result.languages[0]).toBe("javascript");
    expect(result.naturalLanguage).toContain("Check this:");
    expect(result.naturalLanguage).toContain("This sets x to 1.");
  });

  it("extracts multiple fenced blocks in different languages", () => {
    const input =
      "Python:\n\n```python\nprint('a')\n```\n\nJavaScript:\n\n```javascript\nconsole.log('b')\n```";
    const result = extractCode(input);
    expect(result.codeBlocks).toHaveLength(2);
    expect(result.languages).toEqual(["python", "javascript"]);
  });

  it("returns pure NL when no code blocks", () => {
    const input = "This is just a normal explanation with no code at all.";
    const result = extractCode(input);
    expect(result.codeBlocks).toHaveLength(0);
    expect(result.naturalLanguage).toBe(input);
  });

  it("detects indented code blocks", () => {
    const input = "Here's code:\n\n    const x = 1;\n    const y = 2;\n\nDone.";
    const result = extractCode(input);
    expect(result.codeBlocks).toHaveLength(1);
    expect(result.codeBlocks[0]).toContain("const x = 1;");
  });

  it("handles mixed NL + code + NL + code", () => {
    const input =
      "First:\n\n```python\na = 1\n```\n\nThen:\n\n```python\nb = 2\n```\n\nEnd.";
    const result = extractCode(input);
    expect(result.codeBlocks).toHaveLength(2);
    expect(result.naturalLanguage).toContain("First:");
    expect(result.naturalLanguage).toContain("Then:");
    expect(result.naturalLanguage).toContain("End.");
  });

  it("treats code-like unfenced content as code via heuristic", () => {
    const input =
      'import os\nimport sys\n\ndef main():\n    x = os.getenv("FOO")\n    if x:\n        sys.exit(0)\n';
    const result = extractCode(input);
    expect(result.codeBlocks).toHaveLength(1);
    expect(result.naturalLanguage).toBe("");
  });

  it("handles fence with no language tag", () => {
    const input = "Code:\n\n```\nfoo bar\n```";
    const result = extractCode(input);
    expect(result.codeBlocks).toHaveLength(1);
    expect(result.languages[0]).toBe("unknown");
  });
});

describe("joinCodeBlocks", () => {
  it("joins blocks with separator", () => {
    const result = joinCodeBlocks(["a = 1", "b = 2"]);
    expect(result).toBe("a = 1\n\n---\n\nb = 2");
  });

  it("returns single block unchanged", () => {
    expect(joinCodeBlocks(["only one"])).toBe("only one");
  });
});
