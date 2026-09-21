export interface SpeechNotification {
  kind: "startingSoon" | "started" | "ended";
  body: string;
}

const english: Record<SpeechNotification["kind"], string> = {
  startingSoon: "Your next lesson starts in one minute.",
  started: "Your lesson has already started.",
  ended: "Your lesson has ended.",
};

let clearPending: (() => void) | undefined;

export function stopSpeech(): void {
  clearPending?.();
  try { window.speechSynthesis?.cancel(); } catch { /* Unsupported WebView. */ }
}

export function speak(message: SpeechNotification, enabled = false): boolean {
  stopSpeech();
  if (!enabled || !message.body.trim()) return false;
  try {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return false;
    const synthesis = window.speechSynthesis;
    const attempt = (): boolean => {
      const voices = synthesis.getVoices();
      const armenian = voices.find((voice) => /^hy(?:[-_]|$)/i.test(voice.lang));
      const voice = armenian
        ?? voices.find((voice) => /^en[-_]US$/i.test(voice.lang))
        ?? voices.find((voice) => /^en[-_]GB$/i.test(voice.lang))
        ?? voices.find((voice) => /^en(?:[-_]|$)/i.test(voice.lang));
      if (!voice) return false;
      const text = armenian ? message.body.replace(/1 րոպե/g, "Մեկ րոպե") : english[message.kind];
      if (!text) return false;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = 0.95;
      utterance.onerror = (event) => console.warn("Speech unavailable:", event.error);
      synthesis.speak(utterance);
      return true;
    };
    if (attempt()) return true;
    // Retry late-loaded voices briefly; never replay an old reminder much later.
    const onVoicesChanged = () => {
      try { if (attempt()) cleanup(); } catch { cleanup(); }
    };
    const cleanup = () => {
      clearTimeout(timer);
      synthesis.removeEventListener("voiceschanged", onVoicesChanged);
      if (clearPending === cleanup) clearPending = undefined;
    };
    synthesis.addEventListener("voiceschanged", onVoicesChanged);
    const timer = setTimeout(cleanup, 5000);
    clearPending = cleanup;
    return false;
  } catch {
    return false;
  }
}
