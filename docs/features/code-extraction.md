# Code Extraction

The code extractor separates code blocks from natural language in AI responses, enabling dedicated malicious code scanning via the AIRS `code_response` field.

## Extraction Strategy

The extractor uses three strategies in priority order:

### 1. Fenced Code Blocks

````markdown
```python
def example():
    return "hello"
```
````

Detects language from the fence annotation. Supports all common programming languages.

### 2. Indented Code Blocks

```markdown
    function example() {
        return "hello";
    }
```

Lines with 4+ leading spaces are treated as code.

### 3. Heuristic Fallback

When no fenced or indented blocks are found, the extractor looks for code indicators:

- Import/require statements
- Function/class definitions
- Braces, semicolons, arrow functions
- Shell commands (pipes, redirects)

Content is classified as code if the ratio of code-like characters exceeds 15% (`CODE_CHAR_THRESHOLD = 0.15`).

## Output

```typescript
interface ExtractedContent {
  naturalLanguage: string;   // Text portions
  codeBlocks: string[];      // Extracted code blocks
  languages: string[];       // Detected languages
}
```

Multiple code blocks are joined with `\n\n---\n\n` separators before being sent in the `code_response` field.

## AIRS Field Mapping

| Extracted Content | AIRS Field | Detection Engines |
|------------------|------------|-------------------|
| Natural language | `response` | DLP, toxicity, URL categorization |
| Code blocks | `code_response` | WildFire, ATP (malicious code) |

!!! tip "Why separate fields matter"
    The `code_response` field activates WildFire and Advanced Threat Prevention engines that specifically analyze code for malicious patterns. These engines don't run on natural language content, so splitting the response ensures comprehensive coverage.
