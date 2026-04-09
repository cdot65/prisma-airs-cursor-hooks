# Scanning Flow

## Prompt Scanning

```mermaid
sequenceDiagram
    participant C as Cursor IDE
    participant H as beforeSubmitPrompt Hook
    participant S as Scanner
    participant CB as Circuit Breaker
    participant A as AIRS Sync API

    C->>H: stdin JSON { prompt, user_email, ... }
    H->>S: scanPrompt(config, prompt, logger)
    S->>CB: shouldAllow()
    alt Circuit Open
        CB-->>S: false (bypass)
        S-->>H: { action: "pass" }
    else Circuit Closed/Half-Open
        CB-->>S: true
        S->>A: POST /v1/scan/sync/request { prompt }
        A-->>S: { action, prompt_detected }
        S->>CB: recordSuccess() / recordFailure()
        alt Enforce + Block Verdict
            S-->>H: { action: "block", message }
            H-->>C: { continue: false, user_message }
        else Allow / Observe
            S-->>H: { action: "pass" }
            H-->>C: { continue: true }
        end
    end
```

## Response Scanning (observe-only)

!!! warning "Cursor limitation"
    `afterAgentResponse` is **observe-only** — Cursor displays the AI response before the hook fires. The scan still runs for audit and compliance purposes, but violations cannot block or retract the response.

```mermaid
sequenceDiagram
    participant C as Cursor IDE
    participant U as Developer
    participant H as afterAgentResponse Hook
    participant X as Code Extractor
    participant S as Scanner
    participant A as AIRS Sync API

    C->>U: Display AI response (already visible)
    C->>H: stdin JSON { text, ... }
    H->>S: scanResponse(config, text, logger)
    S->>X: extractCode(text)
    X-->>S: { naturalLanguage, codeBlocks[] }
    S->>A: POST /v1/scan/sync/request { response, code_response }
    A-->>S: { action, response_detected }
    alt Enforce + Block Verdict
        S-->>H: { action: "block", message }
        H-->>C: Log violation + emit warning (cannot block)
    else Allow / Observe
        S-->>H: { action: "pass" }
        H-->>C: { permission: "allow" }
    end
```

## Code Extraction Strategy

The code extractor processes AI responses using three strategies in priority order:

1. **Fenced code blocks** -- ` ```language ... ``` ` with language detection
2. **Indented code blocks** -- 4+ leading spaces
3. **Heuristic fallback** -- content matching code indicators (imports, function definitions, braces) above a character threshold

Extracted code is joined with `\n\n---\n\n` separators and sent in the `code_response` field, which triggers WildFire/ATP malicious code scanning on the AIRS side.

## MCP Tool Scanning (beforeMCPExecution — can block)

```mermaid
sequenceDiagram
    participant C as Cursor IDE
    participant H as beforeMCPExecution Hook
    participant CL as Content Limits
    participant S as Scanner
    participant CB as Circuit Breaker
    participant A as AIRS Sync API

    C->>H: stdin JSON { tool_name, tool_input, ... }
    H->>CL: checkLimits(tool_input)
    alt Exceeds max_scan_bytes
        CL-->>H: skip (fail-open)
        H-->>C: { continue: true }
    else Within limits
        H->>S: scanToolEvent(config, tool_input, logger)
        S->>CB: shouldAllow()
        alt Circuit Open
            CB-->>S: false (bypass)
            S-->>H: { action: "pass" }
        else Circuit Closed/Half-Open
            CB-->>S: true
            S->>A: POST /v1/scan/sync/request { tool_event }
            A-->>S: { action, prompt_detected }
            S->>CB: recordSuccess() / recordFailure()
            alt Enforce + Block Verdict
                S-->>H: { action: "block", message }
                H-->>C: { continue: false, user_message }
            else Allow / Observe
                S-->>H: { action: "pass" }
                H-->>C: { continue: true }
            end
        end
    end
```

## Tool Output Scanning (postToolUse — observe-only)

!!! warning "Cursor limitation"
    `postToolUse` is **observe-only** — the tool has already executed before the hook fires. Violations are logged and warnings emitted, but tool output cannot be blocked or retracted.

```mermaid
sequenceDiagram
    participant C as Cursor IDE
    participant H as postToolUse Hook
    participant P as Tool Name Parser
    participant S as Scanner
    participant A as AIRS Sync API

    C->>H: stdin JSON { tool_name, tool_input, tool_output, ... }
    H->>P: parse(tool_name)
    P-->>H: { type: MCP|Bash|Write|Edit|Skip }
    alt MCP:* tool
        H->>S: scanToolEvent(input + output)
        S->>A: POST { tool_event }
    else Bash tool
        H->>S: scanResponse(tool_output)
        S->>A: POST { response }
    else Write / Edit tool
        H->>S: scanPrompt(new_content)
        S->>A: POST { prompt }
    else Skip list
        H-->>C: { permission: "allow" }
    end
    A-->>S: { action, detected }
    alt Violation
        S-->>H: { action: "block", message }
        H-->>C: Log violation + emit warning (cannot block)
    else Clean
        S-->>H: { action: "pass" }
        H-->>C: { permission: "allow" }
    end
```

## Content Splitting

| AIRS Field | Content | Detections |
|-----------|---------|------------|
| `prompt` | User's prompt text or Write/Edit content | Prompt injection, DLP, toxicity, custom topics |
| `response` | Natural language from AI response or Bash output | DLP, toxicity, URL categorization |
| `code_response` | Extracted code blocks from AI response | Malicious code (WildFire/ATP) |
| `tool_event` | MCP tool inputs and outputs | Prompt injection, DLP, malicious parameters |

!!! info "Why split content?"
    Sending code separately in `code_response` enables dedicated malicious code detection engines (WildFire, ATP) that don't run on natural language content. This catches things like reverse shells, credential stealers, and obfuscated payloads in generated code. Similarly, `tool_event` is routed to a security profile tuned for tool-call patterns.
