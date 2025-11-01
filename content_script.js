// Content script: listens for messages from the extension and shows a toast
// indicate content script loaded
console.log('[anki-content] content_script.js loaded');
(function(){
  function escapeHtml(str) {
    return String(str).replace(/[&"'<>]/g, function (s) {
      return ({ '&': '&amp;', '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;' })[s];
    });
  }

  function showToast(front, back, isHtmlFront = false, isHtmlBack = false) {
    try {
      // avoid duplicating multiple times
      const existing = document.getElementById('anki-ext-toast-container');
      if (existing) existing.remove();

      // create a host and attach a shadow root to isolate styles from the page
  const container = document.createElement('div');
  container.id = 'anki-ext-toast-container';
  container.style.position = 'fixed';
  container.style.right = '20px';
  container.style.bottom = '20px';
  container.style.zIndex = 2147483647;
  container.style.width = '280px';
  // ensure the host clips children so rounded corners are visible
  container.style.overflow = 'hidden';
  container.style.borderRadius = '12px';

      const shadow = container.attachShadow({ mode: 'open' });

      // inside shadow, create our own styles and structure so page CSS can't force vertical text
      const style = document.createElement('style');
      style.textContent = `
        :host { all: initial; }
        .toast { width:100%; height:120px; perspective:1000px; }
  .card { width:100%; height:100%; position:relative; transform-style:preserve-3d; -webkit-transform-style:preserve-3d; transition:transform 0.6s; box-shadow:0 8px 24px rgba(0,0,0,0.2); border-radius:12px; cursor:pointer; }
        .faceFront { position:absolute; width:100%; height:100%; backface-visibility:hidden; -webkit-backface-visibility:hidden; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; text-overflow:ellipsis; white-space:normal; padding:12px; box-sizing:border-box; background:#fff; color:#111; font-weight:600; align-items:flex-start; justify-content:flex-start; }
        .faceBack { position:absolute; width:100%; height:100%; backface-visibility:hidden; -webkit-backface-visibility:hidden; transform:rotateY(180deg); display:flex; flex-direction:column; align-items:flex-start; justify-content:flex-start; padding:12px; box-sizing:border-box; background:#f7f7f7; color:#111; overflow:auto; }
        .back-word { font-weight:700; margin-bottom:6px; }
        .back-sentence { color:#444; font-weight:400; font-size:0.95em; }
        strong { color: red !important; display:inline-block !important; white-space:normal !important; writing-mode: horizontal-tb !important; text-orientation: mixed !important; vertical-align:baseline !important; }
      `;

      const toast = document.createElement('div');
      toast.className = 'toast';

      const card = document.createElement('div');
      card.className = 'card';

      const faceFront = document.createElement('div');
      faceFront.className = 'faceFront';
      // truncate front content to a reasonable character limit for the toast,
      // but try to keep the highlighted word visible when possible.
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
            if (idx === -1) {
              snippet = fullText.slice(0, limit) + '…';
            } else {
              // include the strong word in the middle of the snippet where possible
              const start = Math.max(0, idx - 40);
              let end = start + limit;
              if (end > fullText.length) { end = fullText.length; }
              snippet = (start > 0 ? '…' : '') + fullText.slice(start, end) + (end < fullText.length ? '…' : '');
            }
          } else {
            snippet = fullText.slice(0, limit) + '…';
          }
        }
        // escape and re-insert highlighted strong if present
        const esc = (s) => String(s).replace(/[&"'<>]/g, function (c) { return ({ '&': '&amp;', '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;' })[c]; });
        let outHtml = esc(snippet);
        if (strongText) {
          const re = new RegExp(esc(strongText).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
          outHtml = outHtml.replace(re, `<strong>${esc(strongText)}</strong>`);
        }
        faceFront.innerHTML = outHtml;
      } catch (e) { if (isHtmlFront) faceFront.innerHTML = front; else faceFront.textContent = front; }

      const faceBack = document.createElement('div');
      faceBack.className = 'faceBack';
      // normalize back HTML into structured parts: word+translation and sentence translation
      try {
        if (isHtmlBack) {
          // assume back is HTML already containing strong for the word and a div for sentence translation
          faceBack.innerHTML = back;
        } else {
          // plain text back: put it into a word line
          const w = document.createElement('div'); w.className = 'back-word'; w.textContent = back; faceBack.appendChild(w);
        }
      } catch (e) { if (isHtmlBack) faceBack.innerHTML = back; else faceBack.textContent = back; }

      card.appendChild(faceFront);
      card.appendChild(faceBack);
      toast.appendChild(card);
      shadow.appendChild(style);
      shadow.appendChild(toast);
      document.body.appendChild(container);

      let flipped = false;
      card.addEventListener('click', () => {
        flipped = !flipped;
        card.style.transform = flipped ? 'rotateY(180deg)' : 'none';
        card.style.webkitTransform = flipped ? 'rotateY(180deg)' : 'none';
      });

      setTimeout(() => {
        try { container.style.transition = 'opacity 0.5s, transform 0.5s'; container.style.opacity = '0'; container.style.transform = 'translateY(12px) scale(0.98)'; } catch (e) {}
        setTimeout(() => { try { container.remove(); } catch (e){} }, 600);
      }, 3800);
    } catch (e) {
      console.warn('anki content script showToast failed', e);
    }
  }

  // Return the first sentence from a block of text. Handles English and
  // Japanese sentence terminators (., !, ?, 。, ！, ？) and the ellipsis.
  function firstSentence(text) {
    try {
      if (!text) return '';
      // Match up to and including the first sentence terminator (unicode aware)
      const m = String(text).match(/[^.!?。！？]+[.!?。！？…]?/u);
      return m ? m[0].trim() : String(text).trim();
    } catch (e) { return String(text).trim(); }
  }

  function escapeRegExp(string) {
    return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    try {
      if (!msg) return;
      if (msg.type === 'show_anki_toast') {
        showToast(msg.front || '', msg.back || '', !!msg.isHtmlFront, !!msg.isHtmlBack);
        sendResponse({ok:true});
        return;
      }

      if (msg.type === 'get_selection_context') {
        // Build a simple sentence context around the current selection and
        // return both plain text and an HTML version with the selected text
        // wrapped in <strong> for highlighting.
        try {
          const sel = window.getSelection();
          if (!sel || sel.isCollapsed) { sendResponse({ ok: false, error: 'no selection' }); return; }
          const selected = sel.toString().trim();
          console.log('[anki-content] selection detected:', { selected });
          // find nearest block container
          let node = sel.anchorNode;
          while (node && node.nodeType !== Node.ELEMENT_NODE) node = node.parentElement;
          let container = node;
          while (container && !/^(P|DIV|LI|TD|PRE|BLOCKQUOTE|SECTION|ARTICLE|MAIN|BODY)$/i.test(container.nodeName)) container = container.parentElement;
          const containerText = (container ? container.innerText : document.body.innerText) || '';
          // split into sentences including Japanese terminators
          const sentences = containerText.match(/[^.!?。！？]+[.!?。！？…]?/gu) || [containerText];
          let sentence = sentences.find(s => s.indexOf(selected) !== -1) || sentences.find(s => s.trim().length>0) || containerText;
          sentence = firstSentence(sentence);
          const escSelected = escapeHtml(selected);
          const escSentence = escapeHtml(sentence);
          // highlight first occurrence of selected in sentence
          const idx = sentence.indexOf(selected);
          let sentenceHtml;
          if (idx !== -1) {
            sentenceHtml = escSentence.replace(escSelected, `<strong>${escSelected}</strong>`);
          } else {
            // fallback: wrap the first matching word occurrence case-insensitive
            const re = new RegExp(escapeRegExp(selected), 'i');
            sentenceHtml = escSentence.replace(re, (m) => `<strong>${m}</strong>`);
          }
          console.log('[anki-content] sentence extracted:', { sentence, sentenceHtml });
          sendResponse({ ok: true, selected, sentence, sentenceHtml });
        } catch (e) { sendResponse({ ok:false, error: String(e) }); }
        return;
      }
    } catch (e) {
      console.warn('content_script onMessage error', e);
      sendResponse({ok:false, error: String(e)});
    }
    // indicate async response possible
    return true;
  });
})();
