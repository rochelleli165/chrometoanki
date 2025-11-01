import * as gemini from './gemini_wrapper.js';

// small helpers
const q = (s) => document.querySelector(s);
let savedApiKey = null;
function escapeHtml(str) {
  return String(str).replace(/[&"'<>]/g, function (s) { return ({ '&': '&amp;', '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;' })[s]; });
}
function getQueryParam(name) {
  try { return new URLSearchParams(window.location.search).get(name); }
  catch (e) { return null; }
}

// Extract the first sentence from text. Supports English and Japanese
// terminators (., !, ?, 。, ！, ？) and ellipsis.
function firstSentence(text) {
  try {
    if (!text) return '';
    const m = String(text).match(/[^.!?。！？]+[.!?。！？…]?/u);
    return m ? m[0].trim() : String(text).trim();
  } catch (e) { return String(text).trim(); }
}

function showPopupToast(front, back, isHtmlFront = false, isHtmlBack = false) {
  try {
    const existing = document.getElementById('anki-popup-toast');
    if (existing) existing.remove();
    const container = document.createElement('div');
    container.id = 'anki-popup-toast';
    Object.assign(container.style, { position: 'fixed', right: '12px', bottom: '12px', zIndex: '2147483647', width: '260px' });

  const card = document.createElement('div');
  Object.assign(card.style, { width: '100%', height: '120px', perspective: '1000px', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 6px 18px rgba(0,0,0,0.12)', cursor: 'pointer', transformStyle: 'preserve-3d', webkitTransformStyle: 'preserve-3d', transition: 'transform 0.5s' });

  const inner = document.createElement('div');
  Object.assign(inner.style, { width: '100%', height: '100%', position: 'relative' });

    const faceFront = document.createElement('div');
    // clamp front text to a few lines and show ellipsis for long sentences
    Object.assign(faceFront.style, { position: 'absolute', width: '100%', height: '100%', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', display: '-webkit-box', WebkitLineClamp: '3', WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'normal', padding: '12px', boxSizing: 'border-box', background: '#fff', color: '#111', fontWeight: '600', alignItems: 'flex-start', justifyContent: 'flex-start' });
    if (isHtmlFront) faceFront.innerHTML = front; else faceFront.textContent = front;

    const faceBack = document.createElement('div');
  Object.assign(faceBack.style, { position: 'absolute', width: '100%', height: '100%', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', boxSizing: 'border-box', background: '#f7f7f7', color: '#111' });
    if (isHtmlBack) faceBack.innerHTML = back; else faceBack.textContent = back;

    inner.appendChild(faceFront);
    inner.appendChild(faceBack);
    card.appendChild(inner);
    container.appendChild(card);
    document.body.appendChild(container);

  let flipped = false;
  card.addEventListener('click', () => { flipped = !flipped; card.style.transform = flipped ? 'rotateY(180deg)' : 'none'; card.style.webkitTransform = flipped ? 'rotateY(180deg)' : 'none'; });
    setTimeout(() => { container.style.transition = 'opacity 0.5s, transform 0.5s'; container.style.opacity = '0'; container.style.transform = 'translateY(12px) scale(0.98)'; setTimeout(() => { try { container.remove(); } catch (e) {} }, 600); }, 3800);
  } catch (e) { console.warn('showPopupToast failed', e); }
}

async function directAddToAnki(deck, front, back, model = 'Basic') {
  const payload = { action: 'addNote', version: 6, params: { note: { deckName: deck, modelName: model, fields: { Front: front, Back: back }, tags: [] } } };
  const url = 'http://127.0.0.1:8765';
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const text = await res.text();
    try { return JSON.parse(text); } catch (e) { return { error: 'Non-JSON response from AnkiConnect', raw: text }; }
  } catch (e) { return { error: 'Network error contacting AnkiConnect: ' + e.message }; }
}

document.addEventListener('DOMContentLoaded', async () => {
  const selected = q('#selected');
  const front = q('#front');
  const back = q('#back');
  const generateBtn = q('#generate');
  const addBtn = q('#add');
  const deckInput = q('#deck');
  const status = q('#status');
  const useGemini = q('#useGemini');
  const apiKeyInput = q('#apiKey');
  const saveKeyBtn = q('#saveKey');

  const initialText = getQueryParam('text'); if (initialText) selected.value = decodeURIComponent(initialText);
  const srcTabIdParam = getQueryParam('srcTabId'); const srcTabId = srcTabIdParam ? Number(srcTabIdParam) : null;

  // load saved apiKey/useGemini
//   if (chrome && chrome.storage && chrome.storage.local) chrome.storage.local.get(['apiKey','useGemini'], (items) => { if (items.apiKey) { savedApiKey = items.apiKey; apiKeyInput.value = items.apiKey; } if (items.useGemini) useGemini.checked = true; });

//   saveKeyBtn.addEventListener('click', () => { const k = apiKeyInput.value.trim(); savedApiKey = k; if (chrome && chrome.storage && chrome.storage.local) chrome.storage.local.set({ apiKey: k }, () => { status.textContent = 'API key saved.'; }); else status.textContent = 'Saved to memory for session.'; });

  // Auto-generate front/back using local Translator whenever selection changes
  const debounce = (fn, wait = 350) => {
    let t = null;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
  };

  async function autoFillFromSelectionText(textVal) {
    const text = (textVal || '').trim(); if (!text) return;
    status.textContent = 'Auto-generating via Translator...';
    try {
      await gemini.init(savedApiKey);
      // detect language (best-effort)
      let detected = null; try { detected = await gemini.detectLanguage(text); } catch (e) { detected = null; }
      let srcLang = null; try { if (detected) srcLang = detected.detectedLanguage || detected.language || detected.lang || (Array.isArray(detected) && detected[0] && (detected[0].language || detected[0].detectedLanguage)); } catch (e) { srcLang = null; }
      const targetLang = 'en';
      let translated = text;
      try { translated = await gemini.translate(text, targetLang); } catch (e) { console.warn('translate failed', e); translated = text; }

      // If there's a selection in the source tab, prefer using its full sentence
      // as the Front; otherwise use a short snippet of the text.
      let sentence = text;
      try {
        // attempt to query the source tab for selection context
        let tab = null;
        if (srcTabId) {
          try { tab = await new Promise((res, rej) => chrome.tabs.get(srcTabId, (t) => { if (chrome.runtime.lastError) return rej(chrome.runtime.lastError); res(t); })); } catch (e) { tab = null; }
        }
        if (!tab) { const tabs = await new Promise((res) => chrome.tabs.query({ active: true, currentWindow: true }, res)); tab = (tabs && tabs.length) ? tabs[0] : null; }
        if (tab && /^https?:\/\//i.test(tab.url || '')) {
          try {
            const ctx = await new Promise((res, rej) => chrome.tabs.sendMessage(tab.id, { type: 'get_selection_context' }, (r) => { if (chrome.runtime.lastError) return rej(chrome.runtime.lastError); res(r); }));
            if (ctx && ctx.ok && ctx.sentence) { sentence = firstSentence(ctx.sentence); }
          } catch (e) { /* ignore */ }
        }
      } catch (e) { /* ignore */ }

      // fill fields: Front = sentence (plain), Back = translated sentence
      front.value = sentence;
      back.value = translated;
      status.textContent = 'Auto-filled via Translator — review before adding.';
    } catch (e) {
      console.error('autoFillFromSelectionText failed', e);
      status.textContent = 'Translator autofill failed';
    }
  }

  const debouncedAutoFill = debounce(autoFillFromSelectionText, 350);

  // Auto-run on load if initial text exists
  if (initialText) debouncedAutoFill(decodeURIComponent(initialText));

  // Auto-run when user edits the selected text area (paste/modify)
  selected.addEventListener('input', () => debouncedAutoFill(selected.value));

  addBtn.addEventListener('click', async () => {
    const f = (front.value || '').trim(); const b = (back.value || '').trim(); const deck = (deckInput.value || '').trim() || 'Default';
    if (!f && !b) { status.textContent = 'Front and/or Back are required.'; return; }
    status.textContent = 'Preparing card...';

  // Try to get the full sentence and an HTML-highlighted version from the
  // source tab if possible. We'll put the sentence (with the selected
  // word wrapped in <strong>) on the Front and keep the Back as the
  // existing Back field (or selected word if Back is empty).
  let frontToSend = f;
  let backToSend = b;
  let frontIsHtml = false;
  let backIsHtml = false;
    try {
      // resolve src tab
      let tab = null;
      if (srcTabId) {
        try { tab = await new Promise((res, rej) => chrome.tabs.get(srcTabId, (t) => { if (chrome.runtime.lastError) return rej(chrome.runtime.lastError); res(t); })); }
        catch (e) { tab = null; }
      }
      if (!tab) { const tabs = await new Promise((res) => chrome.tabs.query({ active: true, currentWindow: true }, res)); tab = (tabs && tabs.length) ? tabs[0] : null; }

      if (tab && /^https?:\/\//i.test(tab.url || '')) {
        try {
          console.log('[anki-popup] sending get_selection_context to tab', tab.id);
          let ctx = null;
          try {
            ctx = await new Promise((res, rej) => chrome.tabs.sendMessage(tab.id, { type: 'get_selection_context' }, (r) => { if (chrome.runtime.lastError) return rej(chrome.runtime.lastError); res(r); }));
            console.log('[anki-popup] received selection context from tab (message):', ctx);
          } catch (msgErr) {
            console.warn('[anki-popup] sendMessage failed, will try executeScript fallback', msgErr);
            try {
              // executeScript fallback: run selection extraction directly in page
              const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                  function escapeHtmlLocal(s) { return String(s).replace(/[&"'<>]/g, function (c) { return ({ '&': '&amp;', '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;' })[c]; }); }
                  function escapeRegExpLocal(s) { return String(s).replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'); }
                  try {
                    const sel = window.getSelection();
                    if (!sel || sel.isCollapsed) return { ok: false, error: 'no selection' };
                    const selected = sel.toString().trim();
                    let node = sel.anchorNode; while (node && node.nodeType !== Node.ELEMENT_NODE) node = node.parentElement;
                    let container = node; while (container && !/^(P|DIV|LI|TD|PRE|BLOCKQUOTE|SECTION|ARTICLE|MAIN|BODY)$/i.test(container.nodeName)) container = container.parentElement;
                    const containerText = (container ? container.innerText : document.body.innerText) || '';
                    const sentences = containerText.match(/[^.!?。！？]+[.!?。！？…]?/gu) || [containerText];
                    let sentence = sentences.find(s => s.indexOf(selected) !== -1) || sentences.find(s => s.trim().length>0) || containerText;
                    sentence = String(sentence).trim();
                    try { const m = String(sentence).match(/[^.!?。！？]+[.!?。！？…]?/u); if (m && m[0]) sentence = m[0].trim(); } catch (e) {}
                    const escSelected = escapeHtmlLocal(selected);
                    const escSentence = escapeHtmlLocal(sentence);
                    const idx = sentence.indexOf(selected);
                    let sentenceHtml;
                    if (idx !== -1) sentenceHtml = escSentence.replace(escSelected, `<strong>${escSelected}</strong>`);
                    else { const re = new RegExp(escapeRegExpLocal(selected), 'i'); sentenceHtml = escSentence.replace(re, (m) => `<strong>${m}</strong>`); }
                    return { ok: true, selected, sentence, sentenceHtml };
                  } catch (e) { return { ok: false, error: String(e) }; }
                }
              });
              if (results && results.length && results[0].result) {
                ctx = results[0].result;
                console.log('[anki-popup] received selection context from tab (executeScript):', ctx);
              }
            } catch (execErr) {
              console.warn('[anki-popup] executeScript fallback failed', execErr);
            }
          }

          // show debug in UI for easier visibility
          try { status.textContent = 'Selection context: ' + (ctx && ctx.ok ? (ctx.sentenceHtml || ctx.sentence || ctx.selected) : JSON.stringify(ctx)); } catch (e) { /* ignore UI set errors */ }
          if (ctx && ctx.ok && ctx.sentence) {
            // Use the sentenceHtml (highlighted) as the Front if available.
            // Also style the highlighted <strong> so it appears red in Anki.
            const sentence = firstSentence(ctx.sentence || '');
            const selectedWord = ctx.selected || '';
            if (ctx.sentenceHtml) {
              try {
                // add inline style to the first <strong> occurrence
                frontToSend = ctx.sentenceHtml.replace(/<strong>([\s\S]*?)<\/strong>/i, '<strong style="color:red;display:inline;white-space:normal;writing-mode:horizontal-tb;text-orientation:mixed">$1</strong>');
                frontIsHtml = true;
              } catch (e) {
                frontToSend = ctx.sentenceHtml;
                frontIsHtml = true;
              }
            } else {
              frontToSend = escapeHtml(sentence).replace(new RegExp(escapeHtml(selectedWord), 'i'), (m) => `<strong style="color:red">${m}</strong>`);
              frontIsHtml = true;
            }

            // Build the Back as HTML: highlighted word (red) + its translation,
            // then the sentence translation underneath.
            try {
              const targetLang = 'en';
              let wordTranslation = '';
              let sentenceTranslation = '';
              try { wordTranslation = selectedWord ? await gemini.translate(selectedWord, targetLang) : ''; } catch (e) { console.warn('word translate failed', e); wordTranslation = selectedWord; }
              try { sentenceTranslation = sentence ? await gemini.translate(sentence, targetLang) : ''; } catch (e) { console.warn('sentence translate failed', e); sentenceTranslation = sentence; }

              const highlighted = `<strong style="color:red;display:inline;white-space:normal;writing-mode:horizontal-tb;text-orientation:mixed">${escapeHtml(selectedWord || '')}</strong>`;
              const wordPart = (selectedWord ? `${highlighted}${wordTranslation ? ' — ' + escapeHtml(wordTranslation) : ''}` : (b ? escapeHtml(b) : ''));
              const sentencePart = sentenceTranslation ? `<div style="margin-top:8px;color:#444">${escapeHtml(sentenceTranslation)}</div>` : '';
              if (wordPart || sentencePart) {
                backToSend = `${wordPart}${sentencePart}`;
                backIsHtml = true;
              } else {
                // fallback to plain back field
                backToSend = b || selectedWord || sentence;
                backIsHtml = false;
              }
            } catch (e) {
              console.warn('Failed to build HTML back', e);
              backToSend = b || selectedWord || sentence;
              backIsHtml = false;
            }
          }
        } catch (e) {
          // ignore selection context errors — fall back to existing front/back
          console.warn('Could not get selection context', e);
        }
      }

    } catch (err) { console.warn('prepare card failed', err); }

    status.textContent = 'Adding to Anki...';
    try {
      const resp = await directAddToAnki(deck, frontToSend, backToSend);
      if (resp && resp.result) {
        status.textContent = 'Added to Anki (direct)!';
        const frontText = frontToSend, backText = backToSend;
        let injectedOnPage = false;
        try {
          // prefer srcTabId
          let tab = null;
          if (srcTabId) {
            try { tab = await new Promise((res, rej) => chrome.tabs.get(srcTabId, (t) => { if (chrome.runtime.lastError) return rej(chrome.runtime.lastError); res(t); })); }
            catch (e) { tab = null; }
          }
          if (!tab) { const tabs = await new Promise((res) => chrome.tabs.query({ active: true, currentWindow: true }, res)); tab = (tabs && tabs.length) ? tabs[0] : null; }
          if (!tab) { showPopupToast(frontText, backText, frontIsHtml, backIsHtml); }
          else {
            const url = tab.url || ''; const allowed = /^https?:\/\//i.test(url);
            if (!allowed) { showPopupToast(frontText, backText, frontIsHtml, backIsHtml); }
            else {
              try {
                // try messaging content script
                await new Promise((res, rej) => chrome.tabs.sendMessage(tab.id, { type: 'show_anki_toast', front: frontText, back: backText, isHtmlFront: !!frontIsHtml, isHtmlBack: !!backIsHtml }, (r) => { if (chrome.runtime.lastError) return rej(chrome.runtime.lastError); res(r); }));
                injectedOnPage = true;
              } catch (msgErr) {
                // fallback to executeScript
                try {
                  await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: (front, back, isHtmlFront, isHtmlBack) => {
                    const existing = document.getElementById('anki-ext-toast-container'); if (existing) existing.remove();
                    const container = document.createElement('div'); container.id = 'anki-ext-toast-container'; container.style.position = 'fixed'; container.style.right = '20px'; container.style.bottom = '20px'; container.style.zIndex = 2147483647; container.style.width = '280px';
                    // make sure host clips children so the rounded corners show
                    container.style.overflow = 'hidden'; container.style.borderRadius = '12px';
                    const shadow = container.attachShadow({ mode: 'open' });
                    const style = document.createElement('style');
                    style.textContent = `
                      :host { all: initial; }
                      .toast { width:100%; height:120px; perspective:1000px; }
                      .card { width:100%; height:100%; position:relative; transform-style:preserve-3d; -webkit-transform-style:preserve-3d; transition:transform 0.6s; box-shadow:0 8px 24px rgba(0,0,0,0.2); border-radius:12px; cursor:pointer; }
                      .faceFront { position:absolute; width:100%; height:100%; backface-visibility:hidden; -webkit-backface-visibility:hidden; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; text-overflow:ellipsis; white-space:normal; padding:12px; box-sizing:border-box; background:#fff; color:#111; font-weight:600; align-items:flex-start; justify-content:flex-start; }
                      .faceBack { position:absolute; width:100%; height:100%; backface-visibility:hidden; -webkit-backface-visibility:hidden; transform:rotateY(180deg); display:flex; flex-direction:column; align-items:flex-start; justify-content:flex-start; padding:12px; box-sizing:border-box; background:#f7f7f7; color:#111; overflow:auto; }
                      .back-word { font-weight:700; margin-bottom:6px; }
                      .back-sentence { color:#444; font-weight:400; font-size:0.95em; }
                      strong { color:red !important; display:inline-block !important; white-space:normal !important; writing-mode:horizontal-tb !important; text-orientation:mixed !important; vertical-align:baseline !important; }
                    `;
                    const toast = document.createElement('div'); toast.className = 'toast';
                    const card = document.createElement('div'); card.className = 'card';
                    const faceFront = document.createElement('div'); faceFront.className = 'faceFront';
                    // try to truncate front for the popup fallback similarly to content script
                    try {
                      const tmp = document.createElement('div'); tmp.innerHTML = front || '';
                      const fullText = tmp.innerText || '';
                      const strongEl = tmp.querySelector && tmp.querySelector('strong');
                      const strongText = strongEl ? strongEl.innerText : null;
                      const limit = 140;
                      let snippet = fullText;
                      if (fullText.length > limit) {
                        if (strongText) {
                          const idx = fullText.indexOf(strongText);
                          if (idx === -1) { snippet = fullText.slice(0, limit) + '…'; }
                          else {
                            const start = Math.max(0, idx - 40); let end = start + limit; if (end > fullText.length) end = fullText.length;
                            snippet = (start > 0 ? '…' : '') + fullText.slice(start, end) + (end < fullText.length ? '…' : '');
                          }
                        } else { snippet = fullText.slice(0, limit) + '…'; }
                      }
                      const esc = (s) => String(s).replace(/[&"'<>]/g, function (c) { return ({ '&': '&amp;', '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;' })[c]; });
                      let outHtml = esc(snippet);
                      if (strongText) { const re = new RegExp(esc(strongText).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); outHtml = outHtml.replace(re, `<strong>${esc(strongText)}</strong>`); }
                      faceFront.innerHTML = outHtml;
                    } catch (e) { if (isHtmlFront) faceFront.innerHTML = front; else faceFront.textContent = front; }
                    const faceBack = document.createElement('div'); faceBack.className = 'faceBack';
                    try { if (isHtmlBack) faceBack.innerHTML = back; else { const w = document.createElement('div'); w.className = 'back-word'; w.textContent = back; faceBack.appendChild(w); } } catch (e) { if (isHtmlBack) faceBack.innerHTML = back; else faceBack.textContent = back; }
                    card.appendChild(faceFront); card.appendChild(faceBack); toast.appendChild(card); shadow.appendChild(style); shadow.appendChild(toast); document.body.appendChild(container);
                    let flipped = false; card.addEventListener('click', () => { flipped = !flipped; card.style.transform = flipped ? 'rotateY(180deg)' : 'none'; card.style.webkitTransform = flipped ? 'rotateY(180deg)' : 'none'; });
                    setTimeout(() => { try { container.style.transition = 'opacity 0.5s, transform 0.5s'; container.style.opacity = '0'; container.style.transform = 'translateY(12px) scale(0.98)'; } catch (e) {} setTimeout(() => { try { container.remove(); } catch (e) {} }, 600); }, 3800);
                  }, args: [frontText, backText, frontIsHtml, backIsHtml] });
                  injectedOnPage = true;
                } catch (execErr) { console.warn('executeScript failed', execErr); showPopupToast(frontText, backText, frontIsHtml, backIsHtml); }
              }
              if (injectedOnPage) { try { window.close(); } catch (e) {} }
            }
          }
  } catch (e) { console.warn('Failed to show toast', e); showPopupToast(frontText, backText, frontIsHtml, backIsHtml); }
      } else { status.textContent = 'AnkiConnect error: ' + (resp && (resp.error || JSON.stringify(resp)) || 'unknown'); }
    } catch (err) { console.error('Direct AnkiConnect add failed', err); status.textContent = 'Error contacting AnkiConnect: ' + (err.message || err); }
  });
});
