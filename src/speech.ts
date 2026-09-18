export function stopSpeech(): void {
  try { window.speechSynthesis?.cancel(); } catch { /* Unsupported WebView. */ }
}

export function hasArmenianVoice(): boolean {
  try {
    return window.speechSynthesis?.getVoices().some((voice) => /^hy(?:[-_]|$)/i.test(voice.lang)) ?? false;
  } catch { return false; }
}

export function speak(text: string, enabled = false): boolean {
  if (!enabled || !text.trim()) return false;
  try {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return false;
    const voice = window.speechSynthesis.getVoices().find((voice) => /^hy(?:[-_]|$)/i.test(voice.lang));
    if (!voice) return false;
    const utterance = new SpeechSynthesisUtterance(text.replace(/1 րոպե/g, "Մեկ րոպե"));
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = 0.95;
    utterance.onerror = (event) => console.warn("Speech unavailable:", event.error);
    // Keep catch-up bursts bounded; the latest reminder replaces stale speech.
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}
