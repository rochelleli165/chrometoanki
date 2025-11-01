// genai + Translator wrapper used by popup.js
// Exports: init(apiKey, opts), run(prompt, opts), detectLanguage(text), translate(text, targetLanguage)

let _genAI = null;
let _modelHandle = null;
let _savedApiKey = null;

export const hasPlatformTranslator = (typeof self !== 'undefined' && !!(self.Translator && typeof self.Translator.create === 'function'));
export const hasPlatformDetector = (typeof self !== 'undefined' && !!(self.LanguageDetector && typeof self.LanguageDetector.create === 'function'));

export async function init(apiKey, generationConfig = { temperature: 0.2, model: 'gemini-1.5' }) {
  // This wrapper intentionally DOES NOT import or use a bundled genai client.
  // It prefers the platform Translator/LanguageDetector if available. If those
  // are not present, callers should use a backend or provide an alternative.
  _savedApiKey = apiKey || null;
  // no vendor import; just return true to indicate the wrapper is ready to use
  return true;
}

function _extractTextFromResult(res) {
  try {
    if (!res) return '';
    if (typeof res === 'string') return res;
    if (res.text) return String(res.text);
    if (res.output && Array.isArray(res.output) && res.output.length) {
      const first = res.output[0];
      if (typeof first === 'string') return first;
      if (first.content) return String(first.content);
      if (first.text) return String(first.text);
      if (Array.isArray(first.contents)) return first.contents.map(c => c.text || c).join('');
    }
    if (res.response && typeof res.response.text === 'function') return res.response.text();
    return String(res);
  } catch (e) {
    return '';
  }
}

export async function run(prompt, opts = {}) {
  // This wrapper does not include a bundled model by default. If a bundled
  // client was never attached via some external mechanism, we surface a
  // clear error so callers fall back to Translator or a remote backend.
  if (!_genAI) throw new Error('No in-extension model available. This wrapper does not use a bundled genai client. Use platform Translator or provide a backend.');

  const generationOpts = Object.assign({}, opts);
  try {
    if (_modelHandle && typeof _modelHandle.generate === 'function') {
      const out = await _modelHandle.generate(Object.assign({ prompt }, generationOpts));
      return await _extractTextFromResult(out);
    }
    if (_modelHandle && typeof _modelHandle.generateText === 'function') {
      const out = await _modelHandle.generateText(prompt, generationOpts);
      return await _extractTextFromResult(out);
    }
    if (_genAI && typeof _genAI.generate === 'function') {
      const out = await _genAI.generate(Object.assign({ prompt, model: (generationOpts.model || 'gemini-1.5') }, generationOpts));
      return await _extractTextFromResult(out);
    }
    if (_genAI && _genAI.text && typeof _genAI.text.generate === 'function') {
      const out = await _genAI.text.generate(Object.assign({ prompt, model: (generationOpts.model || 'gemini-1.5') }, generationOpts));
      return await _extractTextFromResult(out);
    }

    if (_genAI && _genAI.__clientCtor) {
      const C = _genAI.__clientCtor;
      const instance = new C({ apiKey: _genAI.__apiKey });
      if (instance.generate) {
        const out = await instance.generate({ prompt, model: (generationOpts.model || 'gemini-1.5') });
        return await _extractTextFromResult(out);
      }
    }

    throw new Error('No supported generation method found on the bundled genai client.');
  } catch (e) {
    console.error('GenAI generate failed', e);
    throw e;
  }
}

export async function detectLanguage(text) {
  if (!text) return null;
  // Prefer platform LanguageDetector
  try {
    if (typeof self !== 'undefined' && self.LanguageDetector && typeof self.LanguageDetector.create === 'function') {
      const detector = await self.LanguageDetector.create();
      const out = await detector.detect(text);
      return out && out[0] ? out[0] : null;
    }
  } catch (e) {
    // ignore and fall back
  }
  // If platform detector is not available, we don't attempt model-based
  // detection here because this wrapper intentionally avoids a bundled
  // genai client. Return null so callers can fall back to other strategies.
  return null;
}

export async function translate(text, targetLanguage = 'en') {
  if (!text) return '';
  // Prefer platform Translator
  try {
    if (typeof self !== 'undefined' && self.Translator && typeof self.Translator.create === 'function') {
      let source = null;
      try {
        if (self.LanguageDetector && typeof self.LanguageDetector.create === 'function') {
          const detector = await self.LanguageDetector.create();
          const d = await detector.detect(text);
          if (d && d[0] && d[0].detectedLanguage) source = d[0].detectedLanguage;
        }
      } catch (e) { /* ignore */ }

      const avail = await self.Translator.availability({ sourceLanguage: source || 'auto', targetLanguage });
      if (avail === 'unavailable') throw new Error('Translation pair unavailable');
      const translator = await self.Translator.create({ sourceLanguage: source || 'auto', targetLanguage });
      const out = await translator.translate(text);
      return out;
    }
  } catch (e) {
    // ignore and fallback
  }

  // Fallback: ask the model to translate
  // No platform Translator and no bundled model: return the original text as a
  // graceful fallback. Callers may choose to notify the user to provide a
  // backend or install a bundled client for better translations.
  console.warn('No platform Translator available and no model bundled — returning original text');
  return text;
}