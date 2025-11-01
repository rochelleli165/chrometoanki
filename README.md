# AI → Anki Chrome extension (local)

This project contains:
- `extension/` — Chrome extension (manifest + popup UI + background script)

Flow
1. Select text in Chrome, right-click and pick "Create flashcard with AI".
2. Popup opens with the selection. Click "Generate with AI" to call the local backend.
3. Review the generated front/back fields and click "Add to Anki". The backend calls AnkiConnect (running inside Anki) to add the note.

Requirements
- Chrome (or Chromium-based browser) for loading the extension.
- Python 3.10+ (recommended) for the backend.
- Anki with the AnkiConnect add-on installed and running (default URL: http://localhost:8765).

Load extension in Chrome
1. Open chrome://extensions
2. Enable Developer mode
3. Click "Load unpacked" and select the `extension/` folder

Notes
- The code calls AnkiConnect at the URL set by `ANKI_CONNECT_URL` in `.env` (defaults to http://localhost:8765).
# chrometoanki
