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

  rec.onresult = (e) => {
    interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      const t = r[0].transcript;
      if (r.isFinal) finalText += (finalText && !finalText.endsWith(" ") ? " " : "") + t.trim();
      else interim += t;
    }
    opts.onText((finalText + (interim ? " " + interim : "")).trim());
  };
  rec.onerror = (e) => {
    // "no-speech" after a pause is normal; keep listening until stopped.
    if (e.error !== "no-speech" && e.error !== "aborted") error = e.error;
  };
  rec.onend = () => {
    // Some browsers end continuous mode after a pause: restart until the
    // person taps stop.
    if (!stopped && !error) {
      try {
        rec.start();
        return;
      } catch {
        // fall through to finish
      }
    }
    opts.onEnd((finalText + (interim ? " " + interim : "")).trim(), error);
  };
  rec.start();

  return {
    stop: () => {
      stopped = true;
      rec.stop();
    },
    abort: () => {
      stopped = true;
      rec.abort();
    },
  };
}
