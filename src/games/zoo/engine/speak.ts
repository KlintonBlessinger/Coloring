/** Speak from the same tap. iOS Safari ignores speech that starts after an await. */

export function speak(text: string): void {
  const line = text.trim();
  if (!line || typeof window === 'undefined') return;
  const synth = window.speechSynthesis;
  const Utterance = window.SpeechSynthesisUtterance;
  if (!synth || !Utterance) return;
  const utterance = new Utterance(line);
  utterance.lang = 'en-US';
  utterance.rate = 0.92;
  synth.cancel();
  try {
    synth.resume();
  } catch {
    /* Older engines omit resume. */
  }
  synth.speak(utterance);
}
