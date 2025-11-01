# AI → Anki Chrome extension (local)

This project contains:
- `extension/` — Chrome extension (manifest + popup UI + background script)
- `backend/` — Python Flask backend that talks to an AI model and AnkiConnect

Flow
1. Select text in Chrome, right-click and pick "Create flashcard with AI".
2. Popup opens with the selection. Click "Generate with AI" to call the local backend.
3. Review the generated front/back fields and click "Add to Anki". The backend calls AnkiConnect (running inside Anki) to add the note.

Requirements
- Chrome (or Chromium-based browser) for loading the extension.
- Python 3.10+ (recommended) for the backend.
- Anki with the AnkiConnect add-on installed and running (default URL: http://localhost:8765).

Backend setup (local dev)
1. cd backend
2. python -m venv .venv
3. source .venv/bin/activate
4. pip install -r requirements.txt
5. Copy `.env.example` to `.env` and add your `OPENAI_API_KEY`.
6. Start Anki and ensure AnkiConnect is enabled.
7. Run the backend: `python app.py`

Load extension in Chrome
1. Open chrome://extensions
2. Enable Developer mode
3. Click "Load unpacked" and select the `extension/` folder

Notes
- The backend expects OpenAI credentials in `OPENAI_API_KEY`. You can also set `OPENAI_MODEL` to another model id.
- The code calls AnkiConnect at the URL set by `ANKI_CONNECT_URL` in `.env` (defaults to http://localhost:8765).
# chrometoanki
