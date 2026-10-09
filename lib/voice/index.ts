/** Optional voice adapters. Browser recognition may send audio to the browser vendor. */
export interface SpeechInput {
  supported(): boolean;
  /**
   * Start dictation and keep listening until the returned stop function is called or
   * `SILENCE_STOP_MS` passes without any new speech results.
   *
   * `onText` receives the COMPLETE transcript of the current dictation on every update,
   * including interim recognitions. Callers must replace earlier text with the value
   * given here — never append it — so repeated browser results cannot duplicate words.
   */
  start(
    onText: (text: string) => void,
    onEnd: () => void,
    onError: (message: string) => void,
  ): () => void;
}
export interface SpeechOutput {
  supported(): boolean;
  speak(text: string): void;
  stop(): void;
}
export type RecognitionEventLike = {
  results: ArrayLike<ArrayLike<{ transcript?: string }>>;
};
export type RecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
export type VoiceTimers = {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};
type RecognitionConstructor = { new (): RecognitionLike };
const recognitionConstructor = (): RecognitionConstructor | undefined => {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
};
export const SILENCE_STOP_MS = 5000;
const RESTART_MS = 250;
const STOP_FALLBACK_MS = 1000;
const MAX_TRANSCRIPT = 5000;
const defaultTimers: VoiceTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
/** Join transcript parts with single spacing and a hard length cap. */
export const joinTranscript = (...parts: string[]) =>
  parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, MAX_TRANSCRIPT);
const errorMessage = (code: string) =>
  code === 'not-allowed' || code === 'service-not-allowed'
    ? 'Microphone access was declined. Please type instead.'
    : code === 'audio-capture'
      ? 'No microphone was found. Please type your observation.'
      : 'Voice input stopped. Please try again or type your observation.';
const FATAL_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'network']);
/**
 * Core dictation session: continuous recognition with interim results, an in-place
 * transcript (rebuilt from the browser's cumulative result list so repeat events never
 * duplicate text), automatic restart when the browser ends recognition on its own, and
 * a stop on manual request or `silenceMs` without new results.
 */
export function startDictation(
  create: () => RecognitionLike,
  onText: (text: string) => void,
  onEnd: () => void,
  onError: (message: string) => void,
  options: { silenceMs?: number; restartMs?: number; timers?: VoiceTimers } = {},
): () => void {
  const silenceMs = options.silenceMs ?? SILENCE_STOP_MS;
  const restartMs = options.restartMs ?? RESTART_MS;
  const timers = options.timers ?? defaultTimers;
  /** Text carried over from recognition instances the browser already closed. */
  let committed = '';
  /** Transcript of the active instance, rebuilt from its cumulative results. */
  let spoken = '';
  let lastEmitted = '';
  let recognition: RecognitionLike | null = null;
  let live = false;
  let stopping = false;
  let failed = false;
  let finished = false;
  let silenceHandle: unknown;
  let restartHandle: unknown;
  let fallbackHandle: unknown;
  const emit = () => {
    const full = joinTranscript(committed, spoken);
    if (full === lastEmitted) return;
    lastEmitted = full;
    if (full) onText(full);
  };
  const finish = () => {
    if (finished) return;
    finished = true;
    timers.clear(silenceHandle);
    timers.clear(restartHandle);
    timers.clear(fallbackHandle);
    onEnd();
  };
  const commitInstance = () => {
    committed = joinTranscript(committed, spoken);
    spoken = '';
  };
  const stopListening = () => {
    if (stopping || finished) return;
    stopping = true;
    timers.clear(silenceHandle);
    timers.clear(restartHandle);
    emit();
    if (live && recognition) {
      try {
        recognition.stop();
      } catch {}
      // Some browsers may never fire onend after stop(); do not leave the UI listening.
      fallbackHandle = timers.set(finish, STOP_FALLBACK_MS);
    } else finish();
  };
  const armSilence = () => {
    timers.clear(silenceHandle);
    silenceHandle = timers.set(stopListening, silenceMs);
  };
  const startInstance = () => {
    try {
      const r = create();
      r.lang = 'en-IN';
      r.interimResults = true;
      r.continuous = true;
      r.onresult = (event) => {
        if (finished) return;
        // Rebuild from the instance's cumulative results: browsers may re-fire or revise
        // interim text, and appending would repeat phrases.
        let text = '';
        const results = event.results;
        for (let i = 0; i < results.length; i++) {
          const alternative = results[i]?.[0];
          if (alternative?.transcript) text += alternative.transcript;
        }
        spoken = text;
        emit();
        if (!stopping) armSilence();
      };
      r.onerror = (event) => {
        if (finished || !FATAL_ERRORS.has(event.error)) return;
        stopping = true;
        if (!failed) {
          failed = true;
          onError(errorMessage(event.error));
        }
        emit();
        try {
          r.stop();
        } catch {}
        finish();
      };
      r.onend = () => {
        live = false;
        if (finished) return;
        commitInstance();
        if (stopping || failed) {
          finish();
          return;
        }
        // The browser closed recognition on its own (service pauses, long sessions).
        // Keep listening until the user stops or the silence window expires.
        restartHandle = timers.set(() => {
          if (stopping || finished) return;
          startInstance();
        }, restartMs);
      };
      recognition = r;
      r.start();
      live = true;
    } catch {
      stopping = true;
      if (!failed) {
        failed = true;
        onError(errorMessage('start-failed'));
      }
      finish();
    }
  };
  startInstance();
  armSilence();
  return stopListening;
}
export const browserSpeechInput: SpeechInput = {
  supported: () => !!recognitionConstructor(),
  start(onText, onEnd, onError) {
    const C = recognitionConstructor();
    if (!C) {
      onError('Voice input is not supported here. You can always type your observation.');
      return () => {};
    }
    return startDictation(() => new C(), onText, onEnd, onError);
  },
};
export const browserSpeechOutput: SpeechOutput = {
  supported: () => typeof window !== 'undefined' && 'speechSynthesis' in window,
  speak(text) {
    if (!this.supported()) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  },
  stop() {
    if (this.supported()) window.speechSynthesis.cancel();
  },
};
