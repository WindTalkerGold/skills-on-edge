# Skills on Edge

A Chrome/Edge browser extension that runs AI skills on web pages. Skills are composable JSON workflows that chain LLM calls, HTTP requests, and data transforms — all running locally in the browser with no backend needed (beyond your AI provider).

## Installation

1. Clone or download this repository
2. Open `edge://extensions` (Edge) or `chrome://extensions` (Chrome)
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked** and select the repository folder
5. The extension icon appears in your toolbar — click it to start using skills

No build step. No store listing. Just load and go.

## How It Works

The extension reads skill definitions (JSON files) and executes them as action pipelines. When you click a skill in the popup, it:

1. Extracts the current page content (or your text selection)
2. Runs the skill's actions in sequence — LLM calls, HTTP requests, transforms
3. Streams the final result back to you in the popup

Everything happens locally. Your page content goes directly from the browser to the AI provider you configure — there is no intermediary server, no telemetry, no data collection. The entire mechanism is transparent: all source code is right here in the repo, and you can ask Claude Code to inspect any file for safety concerns.

For the full skill format, action types, template engine, and examples, see **[SKILLS.md](SKILLS.md)**.

## Safety and Transparency

This extension is designed to be fully transparent and safe to use:

- **No backend server.** All logic runs in the browser extension. LLM calls go directly to your configured AI provider.
- **No telemetry.** No usage data, page content, or personal information is sent anywhere except to the AI provider you choose.
- **No obfuscation.** The entire source is plain JavaScript and JSON — no bundling, no minification, no hidden code. What you see is what runs.
- **User skills are local.** Custom skills in `user-skills/` are just JSON files and optional content scripts on your machine. You control what's installed.
- **Auditable.** You can ask Claude Code (or read the source yourself) to verify that the extension does exactly what it claims — nothing more.

## Skill Types

### JSON Workflow Skills

Defined as `.json` files in `predefined-skills/` (built-in) or `user-skills/` (custom). These orchestrate LLM calls and HTTP requests in a pipeline. See [SKILLS.md](SKILLS.md) for the full reference.

### Content-Script Skills

Defined as folders in `user-skills/{skill-id}/` containing a `skill.json` and a `content.js`. These inject executable code into web pages — for example, the C# Symbol Hover skill injects a script that detects hover over C# symbols and queries a local Roslyn service. Content-script skills are only injected when you explicitly enable them from the popup.

## Creating Skills

The fastest way is with [Claude Code](https://claude.com/claude-code):

```
/create-edge-user-skill
```

Describe what you want in plain English. Claude Code understands the skill format and will generate, validate, and install it.

Or create skills manually — see [SKILLS.md](SKILLS.md) for the JSON format and examples.

## Project Structure

```
manifest.json          Extension manifest (MV3)
background/            Service worker (message routing, API calls)
content/               Content scripts (page extraction)
popup/                 Extension popup UI (skill launcher, settings)
options/               Options page (provider config, skill management)
output/                Pop-out output page
lib/                   Shared libraries
  ├── providers.js     AI provider config (OpenAI, Anthropic, Azure, etc.)
  ├── skills.js        Built-in hardcoded skills
  ├── skill-loader.js  Loads predefined + user skills from JSON
  ├── skill-executor.js Runs skill action pipelines
  ├── template-engine.js  {{expression}} resolver
  └── stats.js         Token usage tracking
predefined-skills/     Built-in JSON skill definitions
user-skills/           Your custom skills (gitignored except examples)
icons/                 Extension icons
SKILLS.md              Full skill format reference and examples
```

## Configuration

Click **Settings** in the popup footer to configure AI providers. Supported provider types:

- **OpenAI-compatible** (OpenAI, local LLMs via LM Studio/Ollama, etc.)
- **Anthropic** (Claude API)
- **Azure OpenAI** (enterprise deployments)

Each provider needs a base URL and API key.
