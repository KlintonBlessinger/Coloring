import type { Language } from '../../lib/settings';

export interface WordSearchCopy {
  title: string;
  hint: string;
  easy: string;
  medium: string;
  hard: string;
  back: string;
  hear: string;
  hearFound: string;
  doneEyebrow: string;
  done: string;
  next: string;
  again: string;
  listen: string;
  readFacts: string;
  levels: string;
  grid: string;
}

const EN: WordSearchCopy = {
  title: 'Find them',
  hint: 'Tap a picture. Drag the letters.',
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  back: 'Back',
  hear: 'Hear this animal',
  hearFound: 'Found. Hear this animal again.',
  doneEyebrow: 'Finished',
  done: 'You found them!',
  next: 'Another',
  again: 'Play again',
  listen: 'Listen',
  readFacts: 'Read the fact',
  levels: 'How big is the puzzle?',
  grid: 'Letter grid',
};

const ES: WordSearchCopy = {
  title: 'Encuéntralos',
  hint: 'Toca la foto. Arrastra las letras.',
  easy: 'Fácil',
  medium: 'Media',
  hard: 'Difícil',
  back: 'Volver',
  hear: 'Escuchar este animal',
  hearFound: 'Encontrado. Escuchar otra vez.',
  doneEyebrow: 'Listo',
  done: '¡Los encontraste!',
  next: 'Otra',
  again: 'Otra vez',
  listen: 'Escuchar',
  readFacts: 'Escuchar el dato',
  levels: '¿Qué tan grande es el juego?',
  grid: 'Cuadrícula de letras',
};

export function wordSearchCopy(language: Language): WordSearchCopy {
  return language === 'es' ? ES : EN;
}
