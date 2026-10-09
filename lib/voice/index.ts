/** Optional voice adapters. Browser recognition may send audio to the browser vendor. */
export interface SpeechInput {
  supported(): boolean;
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
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: { transcript: string }[][] }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
const recognitionConstructor = () => {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
};
export const browserSpeechInput: SpeechInput = {
  supported: () => !!recognitionConstructor(),
  start(onText, onEnd, onError) {
    const C = recognitionConstructor();
    if (!C) {
      onError('Voice input is not supported here. You can always type your observation.');
      return () => {};
    }
    const r = new C();
    r.lang = 'en-IN';
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e) => onText(e.results[0][0].transcript);
    r.onerror = (e) =>
      onError(
        e.error === 'not-allowed'
          ? 'Microphone access was declined. Please type instead.'
          : 'Voice input stopped. Please try again or type your observation.',
      );
    r.onend = onEnd;
    r.start();
    return () => r.stop();
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
