# Skills on Edge

Chrome/Edge Manifest V3 browser extension that runs AI skills on web pages to help users read and understand content.

## Project Structure

- `manifest.json` - Extension manifest (MV3)
- `background/` - Service worker for message routing and context menus
- `content/` - Content scripts injected into pages (content extraction, UI overlay)
- `popup/` - Extension popup UI (skill launcher)
- `icons/` - Extension icons (16, 48, 128px)

## Development

Load as unpacked extension in `edge://extensions` or `chrome://extensions` with Developer Mode enabled.

## Architecture

- Content script extracts page text/selection
- Popup provides skill buttons (summarize, explain, translate, key points)
- Background service worker relays messages between popup and content scripts
- AI backend integration via Claude API (TODO)
