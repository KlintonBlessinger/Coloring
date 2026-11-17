import { holdMusicForSpeech } from './audio';
import type { Language } from './settings';

/**
 * Speak from the same turn as the tap. iOS Safari, including an installed
 * PWA, ignores speech that starts after an await.
 */
export function speak(text: string, language: Language, rate = 0.85): void {
  const textToSay = text.trim();
  if (!textToSay || typeof window === 'undefined') return;
  const synth = window.speechSynthesis;
  const Utterance = window.SpeechSynthesisUtterance;
  if (!synth || !Utterance) return;
  const utterance = new Utterance(textToSay);
  utterance.lang = language === 'es' ? 'es-MX' : 'en-US';
  utterance.rate = rate;
  try {
    const voices = synth.getVoices();
    const prefixes = language === 'es' ? ['es-mx', 'es-us'] : ['en-us'];
    for (const prefix of prefixes) {
      const voice = voices.find((item) => item.lang.toLowerCase().replace('_', '-').startsWith(prefix));
      if (!voice) continue;
      utterance.voice = voice;
      utterance.lang = voice.lang.toLowerCase().replace('_', '-').startsWith('es-us') ? 'es-US' : utterance.lang;
      break;
    }
  } catch {
    /* The utterance lang is enough when the voice list is not ready. */
  }
  const release = holdMusicForSpeech();
  utterance.onend = release;
  utterance.onerror = release;
  synth.cancel();
  try {
    synth.resume();
  } catch {
    /* resume is missing on a few older engines. */
  }
  synth.speak(utterance);
}
