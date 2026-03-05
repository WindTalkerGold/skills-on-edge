# Skills on Edge

A Chrome/Edge browser extension that runs AI skills on web pages to help you read, understand, and interact with content. Built to be customized with Claude Code.

## Installation

This extension is designed to be used directly from source — no build step, no store listing.

1. Clone or download this repository
2. Open `edge://extensions` (Edge) or `chrome://extensions` (Chrome)
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked** and select the repository folder
5. The extension icon appears in your toolbar — click it to start using skills

## Customizing with Claude Code

The recommended way to use this extension is with [Claude Code](https://claude.com/claude-code). Open the repo in Claude Code and ask it to:

- Create new skills tailored to your workflow (use `/create-edge-user-skill`)
- Modify existing skill prompts to match your preferences
- Add new AI providers or adjust model settings
- Build entirely new features on top of the extension

Skills are defined as simple JSON files in `predefined-skills/` and `user-skills/`. Claude Code understands the skill format and can generate new ones from a plain English description.

## Built-in Skills

- **Summarize** — Ultra-concise bullet-point summary of any page
- **Translate** — Faithful sentence-by-sentence translation to your selected language
- **Am I Right?** — Verify your understanding against page content
- **C# Simple Check** — Review selected C# code for common issues
- **C# Symbol Hover** — Hover over C# symbols to get type info from a local Roslyn service

## Project Structure

```
manifest.json          Extension manifest (MV3)
background/            Service worker (message routing, API calls)
content/               Content scripts (page extraction, hover modal)
popup/                 Extension popup UI (skill launcher, settings)
options/               Options page (provider configuration)
output/                Pop-out output page
lib/                   Shared libraries (providers, skills, templates)
predefined-skills/     Built-in JSON skill definitions
user-skills/           Your custom JSON skill definitions
icons/                 Extension icons
```

## Configuration

Click **Settings** in the popup footer to configure AI providers (OpenAI-compatible, Anthropic, Azure OpenAI). Each provider needs a base URL and API key.
