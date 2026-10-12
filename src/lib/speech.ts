// Live dictation through the browser's own speech recognition (Chrome,
// Android, Safari on iPhone/Mac). The person sees the words appear while
// speaking and can correct them before anything is matched to the catalog.
// Where it isn't available, the quick-order page records audio and sends it
// to the AI model instead (src/lib/media.ts).

type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> };

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function liveDictationSupported() {
  return !!ctor();
}

export type Dictation = { stop: () => void; abort: () => void };

// Starts dictation. onText gets the whole text so far (final + interim) on
// every update; onEnd fires once with the final text (or an error code).
export function startDictation(opts: {
  lang?: string;
  onText: (text: string) => void;
  onEnd: (finalText: string, error?: string) => void;
}): Dictation {
  const Ctor = ctor();
  if (!Ctor) throw new Error("unsupported");
  const rec = new Ctor();
  rec.lang = opts.lang ?? "uk-UA";
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let finalText = "";
  let interim = "";
  let error: string | undefined;
  let stopped = false;
  let done = false;
  // Safari ends a session on a pause and refuses to start a new one
  // without a tap ("not-allowed"). That is the end of dictation, not a
  // missing microphone, once some words were heard.
  let over = false;
  let heardSinceStart = false;
  let lastError = "";
  let guard: ReturnType<typeof setTimeout> | null = null;

  const text = () => (finalText + (interim ? " " + interim : "")).trim();

  // onEnd fires exactly once. Safari on iPhone sometimes never sends "end"
  // after stop() (especially after an automatic restart), which left the
  // button spinning forever: finish() is also called by a short timer.
  function finish() {
    if (done) return;
    done = true;
    if (guard) clearTimeout(guard);
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    try {
      rec.abort();
    } catch {
      // already stopped
    }
    opts.onEnd(text(), error);
  }

  rec.onresult = (e) => {
    interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      const t = r[0].transcript;
      if (r.isFinal) finalText += (finalText && !finalText.endsWith(" ") ? " " : "") + t.trim();
      else interim += t;
    }
    heardSinceStart = true;
    opts.onText(text());
  };
  rec.onerror = (e) => {
    lastError = e.error;
    // "no-speech" after a pause is normal; keep listening until stopped.
    if (e.error === "no-speech" || e.error === "aborted") return;
    if (text()) over = true;
    else error = e.error;
  };
  rec.onend = () => {
    // Some browsers end continuous mode after a pause: restart until the
    // person taps stop, but only if the last session heard something (or
    // was plain silence), so a refused restart can't loop.
    const canRestart = heardSinceStart || lastError === "no-speech";
    if (!stopped && !error && !over && canRestart) {
      if (interim) {
        finalText += (finalText ? " " : "") + interim.trim();
        interim = "";
      }
      heardSinceStart = false;
      lastError = "";
      try {
        rec.start();
        return;
      } catch {
        // fall through to finish
      }
    }
    finish();
  };
  rec.start();

  return {
    stop: () => {
      if (done) return;
      stopped = true;
      // Give the browser a moment to deliver the last words, then finish
      // anyway.
      guard = setTimeout(finish, 1200);
      try {
        rec.stop();
      } catch {
        finish();
      }
    },
    abort: () => {
      stopped = true;
      finish();
    },
  };
}
