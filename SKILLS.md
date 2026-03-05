# What is a Skill on Edge?

A **Skill on Edge** is a lightweight, composable workflow definition that runs AI tasks directly in your browser. It is inspired by [Claude Code skills](https://docs.anthropic.com/en/docs/claude-code) — but adapted for the browser context, where the goal is to orchestrate light workloads on web page content without a backend server.

Where Claude Code skills orchestrate complex development tasks across files, terminals, and APIs, Skills on Edge orchestrate simpler read-and-respond workflows: summarize a page, review a code snippet, translate selected text, query a local service. They share the same philosophy of user-defined, composable definitions — but Skills on Edge are designed to be minimal, portable, and browser-native.

## How Skills Work

A skill is a JSON file that defines a pipeline of **actions**. When you trigger a skill, the extension runs each action in sequence, passing results between steps via a template engine.

```
page content → action 1 → action 2 → ... → result displayed to user
```

### Action Types

| Type | What it does |
|------|-------------|
| `llm-chat` | Sends messages to your AI provider and streams the response to the user |
| `llm-build-prompt` | Calls the LLM silently (no streaming) and stores the result for later steps |
| `http-call` | Calls any HTTP endpoint (local or remote) and stores the response |
| `transform` | Combines previous step results using templates |
| `loop` | Repeats sub-actions until a condition is met (max iterations capped) |

### Template Engine

All string values in actions support `{{path}}` expressions:

| Expression | Resolves to |
|-----------|-------------|
| `{{context.title}}` | Page title |
| `{{context.url}}` | Page URL |
| `{{context.text}}` | Full page text |
| `{{context.selection}}` | Selected text on the page |
| `{{context.selectionOrText}}` | Selection if available, otherwise full page text |
| `{{settings.userInput}}` | Text the user typed/pasted in the input prompt |
| `{{settings.outputLang}}` | User's selected output language |
| `{{langInstruction}}` | Expands to " Respond in {lang}." if a language is set, empty otherwise |
| `{{steps.actionId.result}}` | Result from a previous action (by its `id`) |
| `{{loop.iteration}}` | Current iteration number (inside loops) |

### Content-Script Skills

Beyond JSON workflow skills, Skills on Edge also supports **content-script skills** — skills that inject executable JavaScript into the page. These are defined in a folder under `user-skills/` with a `skill.json` (metadata + config) and a `content.js` (the script to inject). Content-script skills are dynamically injected only when the user enables them from the popup, and they run in the page context with full DOM access.

Example: the C# Symbol Hover skill injects a content script that detects hover over C# symbols and queries a local Roslyn service for type information.

### Error Handling

Each action can set `onError` to control what happens on failure:

- `"abort"` (default) — stop the workflow and show the error
- `"skip"` — continue to the next action, store empty result
- `"fallback"` — continue, store the value from `config.fallbackValue`

## Skill JSON Format

```json
{
  "id": "my-skill",
  "name": "My Skill",
  "icon": "⚡",
  "description": "What this skill does",
  "enabled": true,
  "needsSelection": false,
  "needsUserInput": false,
  "inputPlaceholder": "Tell me what to do...",
  "tags": ["example"],
  "actions": [
    {
      "id": "step1",
      "type": "llm-chat",
      "config": { ... }
    }
  ]
}
```

**Flags:**
- `needsSelection: true` — skill only activates when text is selected on the page
- `needsUserInput: true` — shows a text input prompt before running (user types or pastes content)

## Examples

### 1. Simple LLM Skill — Summarize

The simplest skill: send page content to an LLM, stream the response.

```json
{
  "id": "summarize",
  "name": "Summarize",
  "icon": "📝",
  "description": "Summarize any page in a few bullet points",
  "enabled": true,
  "actions": [
    {
      "id": "summarize",
      "type": "llm-chat",
      "config": {
        "stream": true,
        "messages": [
          {
            "role": "system",
            "content": "Summarize in 3-7 brief bullet points.{{langInstruction}}"
          },
          {
            "role": "user",
            "content": "Summarize this:\n\n{{context.text}}"
          }
        ]
      }
    }
  ]
}
```

### 2. HTTP + LLM — Query a Local Service, Then Analyze

Call a local endpoint (e.g., a code analysis service, database, file reader) and feed its response to an LLM.

```json
{
  "id": "local-analysis",
  "name": "Analyze Local Data",
  "icon": "🔬",
  "description": "Fetch data from a local service and analyze with AI",
  "enabled": true,
  "needsUserInput": true,
  "inputPlaceholder": "Enter the query term...",
  "actions": [
    {
      "id": "fetch-data",
      "type": "http-call",
      "onError": "fallback",
      "config": {
        "url": "http://localhost:8080/api/search?q={{settings.userInput}}",
        "method": "GET",
        "fallbackValue": "Service unavailable"
      }
    },
    {
      "id": "analyze",
      "type": "llm-chat",
      "config": {
        "stream": true,
        "messages": [
          {
            "role": "system",
            "content": "Analyze the following data and provide insights."
          },
          {
            "role": "user",
            "content": "Query: {{settings.userInput}}\n\nData from service:\n{{steps.fetch-data.result}}"
          }
        ]
      }
    }
  ]
}
```

This pattern works for any local service — a Roslyn code analyzer, a grep tool, a database query proxy, a file system reader. The extension's service worker can reach `localhost`, so any local HTTP endpoint is fair game.

### 3. Multi-Step Pipeline — Extract, Research, Write

Use `llm-build-prompt` (non-streaming) to do silent intermediate work, then stream the final result.

```json
{
  "id": "research-report",
  "name": "Research Report",
  "icon": "📊",
  "description": "Extract key claims, look up supporting data, write a report",
  "enabled": true,
  "actions": [
    {
      "id": "extract-claims",
      "type": "llm-build-prompt",
      "config": {
        "messages": [
          {
            "role": "user",
            "content": "Extract the top 3 factual claims from this text as a JSON array of strings:\n\n{{context.text}}"
          }
        ]
      }
    },
    {
      "id": "fetch-context",
      "type": "http-call",
      "onError": "fallback",
      "config": {
        "url": "http://localhost:3000/lookup",
        "method": "POST",
        "body": "{\"claims\": {{steps.extract-claims.result}}}",
        "fallbackValue": "No additional context available"
      }
    },
    {
      "id": "write-report",
      "type": "llm-chat",
      "config": {
        "stream": true,
        "messages": [
          {
            "role": "system",
            "content": "Write a brief research report. Use the original claims and supporting data."
          },
          {
            "role": "user",
            "content": "Claims:\n{{steps.extract-claims.result}}\n\nSupporting data:\n{{steps.fetch-context.result}}\n\nOriginal text:\n{{context.text}}"
          }
        ]
      }
    }
  ]
}
```

### 4. Loop — Iterative Refinement

Run an LLM in a loop until the output meets a quality check.

```json
{
  "id": "iterative-improve",
  "name": "Improve Writing",
  "icon": "✨",
  "description": "Iteratively improve selected text until quality check passes",
  "enabled": true,
  "needsSelection": true,
  "actions": [
    {
      "id": "improve-loop",
      "type": "loop",
      "config": {
        "maxIterations": 3,
        "until": {
          "step": "quality-check",
          "contains": "PASS"
        },
        "actions": [
          {
            "id": "rewrite",
            "type": "llm-build-prompt",
            "config": {
              "messages": [
                {
                  "role": "user",
                  "content": "Improve this text for clarity and conciseness (iteration {{loop.iteration}}):\n\n{{context.selection}}"
                }
              ]
            }
          },
          {
            "id": "quality-check",
            "type": "llm-build-prompt",
            "config": {
              "messages": [
                {
                  "role": "user",
                  "content": "Rate this text. Reply PASS if it's clear and concise, FAIL if it needs more work:\n\n{{steps.rewrite.result}}"
                }
              ]
            }
          }
        ]
      }
    },
    {
      "id": "show-result",
      "type": "llm-chat",
      "config": {
        "stream": true,
        "messages": [
          {
            "role": "user",
            "content": "Here is the improved version:\n\n{{steps.rewrite.result}}"
          }
        ]
      }
    }
  ]
}
```

### 5. Local File Writer — Save LLM Output to Disk

Pair with a tiny local HTTP server that writes files. The skill generates content with an LLM, then POSTs it to localhost to save.

```json
{
  "id": "save-notes",
  "name": "Save Page Notes",
  "icon": "💾",
  "description": "Summarize the page and save notes to a local file",
  "enabled": true,
  "actions": [
    {
      "id": "generate-notes",
      "type": "llm-build-prompt",
      "config": {
        "messages": [
          {
            "role": "user",
            "content": "Write concise study notes for this page:\n\nTitle: {{context.title}}\nURL: {{context.url}}\n\n{{context.text}}"
          }
        ]
      }
    },
    {
      "id": "save-to-disk",
      "type": "http-call",
      "config": {
        "url": "http://localhost:9090/write-file",
        "method": "POST",
        "body": "{\"path\": \"notes/{{context.title}}.md\", \"content\": \"{{steps.generate-notes.result}}\"}",
        "headers": {
          "Content-Type": "application/json"
        }
      }
    },
    {
      "id": "confirm",
      "type": "llm-chat",
      "config": {
        "stream": true,
        "messages": [
          {
            "role": "user",
            "content": "Notes saved. Here's what was written:\n\n{{steps.generate-notes.result}}"
          }
        ]
      }
    }
  ]
}
```

## Creating Skills

The fastest way to create skills is with [Claude Code](https://claude.com/claude-code). Open this repo and use:

```
/create-edge-user-skill
```

Describe what you want in plain English — Claude Code understands the skill format and will generate the JSON, validate it, and install it.

You can also create skills manually:

1. Write a JSON file following the format above
2. Place it in `user-skills/` or import via **Settings > User Skills > Import**
3. Reload the extension
