import manifest from '../../../art/manifest.json' with { type: 'json' };
import type { Language } from '../../settings';

export type WordLevel = 'easy' | 'medium' | 'hard';

export interface Animal {
  id: string;
  /** Public realistic art id. The private picture pack is not used. */
  art: string;
  en: string;
  es: string;
  sayEn: string;
  sayEs: string;
  facts: string[];
  factsEs: string[];
}

interface ManifestPicture {
  id: string;
  facts?: string[];
  factsEs?: string[];
}

const pictures = new Map(
  ((manifest as { pictures: ManifestPicture[] }).pictures).map((picture) => [picture.id, picture]),
);

function withFacts(animal: Omit<Animal, 'facts' | 'factsEs'>): Animal {
  const picture = pictures.get(animal.art);
  const facts = picture?.facts ?? [];
  const factsEs = picture?.factsEs ?? [];
  if (facts.length === 0 || factsEs.length === 0) {
    throw new Error(`Missing kids' facts for ${animal.art}`);
  }
  return { ...animal, facts, factsEs };
}

/** One spoken name, one grid spelling. Pictures are the public realistic set. */
export const ANIMALS: readonly Animal[] = [
  withFacts({ id: 'fox', art: 'realistic-red-fox-snow', en: 'FOX', es: 'ZORRO', sayEn: 'Fox', sayEs: 'Zorro' }),
  withFacts({ id: 'owl', art: 'realistic-snowy-owl', en: 'OWL', es: 'BUHO', sayEn: 'Owl', sayEs: 'Búho' }),
  withFacts({ id: 'wolf', art: 'realistic-gray-wolf', en: 'WOLF', es: 'LOBO', sayEn: 'Wolf', sayEs: 'Lobo' }),
  withFacts({ id: 'lion', art: 'realistic-lion-portrait', en: 'LION', es: 'LEON', sayEn: 'Lion', sayEs: 'León' }),
  withFacts({ id: 'frog', art: 'realistic-poison-dart-frogs', en: 'FROG', es: 'RANA', sayEn: 'Frog', sayEs: 'Rana' }),
  withFacts({ id: 'panda', art: 'realistic-giant-panda', en: 'PANDA', es: 'PANDA', sayEn: 'Panda', sayEs: 'Panda' }),
  withFacts({ id: 'koala', art: 'realistic-koala', en: 'KOALA', es: 'KOALA', sayEn: 'Koala', sayEs: 'Koala' }),
  withFacts({ id: 'zebra', art: 'realistic-zebras', en: 'ZEBRA', es: 'CEBRA', sayEn: 'Zebra', sayEs: 'Cebra' }),
  withFacts({ id: 'tiger', art: 'realistic-tiger-walking', en: 'TIGER', es: 'TIGRE', sayEn: 'Tiger', sayEs: 'Tigre' }),
  withFacts({ id: 'horse', art: 'realistic-horse-galloping', en: 'HORSE', es: 'CABALLO', sayEn: 'Horse', sayEs: 'Caballo' }),
  withFacts({ id: 'eagle', art: 'realistic-bald-eagle', en: 'EAGLE', es: 'AGUILA', sayEn: 'Eagle', sayEs: 'Águila' }),
  withFacts({ id: 'shark', art: 'realistic-great-white-shark', en: 'SHARK', es: 'TIBURON', sayEn: 'Shark', sayEs: 'Tiburón' }),
  withFacts({ id: 'gecko', art: 'realistic-leopard-gecko', en: 'GECKO', es: 'GECKO', sayEn: 'Gecko', sayEs: 'Gecko' }),
  withFacts({ id: 'whale', art: 'realistic-humpback-breaching', en: 'WHALE', es: 'BALLENA', sayEn: 'Whale', sayEs: 'Ballena' }),
  withFacts({ id: 'macaw', art: 'realistic-scarlet-macaw-flight', en: 'MACAW', es: 'GUACAMAYO', sayEn: 'Macaw', sayEs: 'Guacamayo' }),
  withFacts({ id: 'turtle', art: 'realistic-sea-turtle-reef', en: 'TURTLE', es: 'TORTUGA', sayEn: 'Turtle', sayEs: 'Tortuga' }),
  withFacts({ id: 'iguana', art: 'realistic-green-iguana', en: 'IGUANA', es: 'IGUANA', sayEn: 'Iguana', sayEs: 'Iguana' }),
  withFacts({ id: 'jaguar', art: 'realistic-jaguar', en: 'JAGUAR', es: 'JAGUAR', sayEn: 'Jaguar', sayEs: 'Jaguar' }),
  withFacts({ id: 'python', art: 'realistic-green-tree-python', en: 'PYTHON', es: 'PITON', sayEn: 'Python', sayEs: 'Pitón' }),
  withFacts({ id: 'leopard', art: 'realistic-leopard-tree', en: 'LEOPARD', es: 'LEOPARDO', sayEn: 'Leopard', sayEs: 'Leopardo' }),
  withFacts({ id: 'dolphin', art: 'realistic-dolphins-sunset', en: 'DOLPHIN', es: 'DELFIN', sayEn: 'Dolphin', sayEs: 'Delfín' }),
  withFacts({ id: 'giraffe', art: 'realistic-giraffe-browsing', en: 'GIRAFFE', es: 'JIRAFA', sayEn: 'Giraffe', sayEs: 'Jirafa' }),
  withFacts({ id: 'flamingo', art: 'realistic-flamingos', en: 'FLAMINGO', es: 'FLAMENCO', sayEn: 'Flamingo', sayEs: 'Flamenco' }),
  withFacts({ id: 'cheetah', art: 'realistic-cheetah', en: 'CHEETAH', es: 'GUEPARDO', sayEn: 'Cheetah', sayEs: 'Guepardo' }),
  withFacts({ id: 'elephant', art: 'realistic-african-elephant', en: 'ELEPHANT', es: 'ELEFANTE', sayEn: 'Elephant', sayEs: 'Elefante' }),
  withFacts({ id: 'crocodile', art: 'realistic-nile-crocodile', en: 'CROCODILE', es: 'COCODRILO', sayEn: 'Crocodile', sayEs: 'Cocodrilo' }),
  withFacts({ id: 'chameleon', art: 'realistic-chameleon', en: 'CHAMELEON', es: 'CAMALEON', sayEn: 'Chameleon', sayEs: 'Camaleón' }),
  withFacts({ id: 'orangutan', art: 'realistic-orangutan-mother-baby', en: 'ORANGUTAN', es: 'ORANGUTAN', sayEn: 'Orangutan', sayEs: 'Orangután' }),
  withFacts({ id: 'tortoise', art: 'realistic-galapagos-tortoise', en: 'TORTOISE', es: 'TORTUGA', sayEn: 'Tortoise', sayEs: 'Tortuga' }),
  withFacts({ id: 'alligator', art: 'realistic-alligator-swamp', en: 'ALLIGATOR', es: 'ALIGATOR', sayEn: 'Alligator', sayEs: 'Aligátor' }),
];

const byId = new Map(ANIMALS.map((animal) => [animal.id, animal]));

/**
 * Easy stays short and across/down. Spanish names that grow past the grid
 * move up a level. Tortoise shares a Spanish name with turtle, so it stays
 * on English puzzles only.
 */
const PLANS: Record<Language, Record<WordLevel, readonly (readonly string[])[]>> = {
  en: {
    easy: [
      ['fox', 'owl', 'wolf'],
      ['lion', 'frog', 'panda'],
      ['koala', 'zebra'],
      ['tiger', 'horse', 'gecko'],
      ['eagle', 'shark'],
      ['whale', 'macaw', 'frog'],
    ],
    medium: [
      ['turtle', 'iguana', 'jaguar', 'python'],
      ['leopard', 'dolphin', 'giraffe', 'fox'],
      ['flamingo', 'cheetah', 'eagle', 'wolf'],
      ['horse', 'panda', 'macaw', 'whale'],
    ],
    hard: [
      ['elephant', 'crocodile', 'owl', 'fox', 'frog'],
      ['chameleon', 'orangutan', 'tiger', 'wolf', 'gecko'],
      ['alligator', 'tortoise', 'lion', 'panda', 'zebra'],
      ['giraffe', 'dolphin', 'leopard', 'jaguar', 'python'],
      ['flamingo', 'cheetah', 'elephant', 'eagle', 'koala'],
    ],
  },
  es: {
    easy: [
      ['fox', 'owl', 'wolf'],
      ['lion', 'frog', 'panda'],
      ['koala', 'zebra'],
      ['tiger', 'gecko'],
      ['panda', 'frog', 'owl'],
    ],
    medium: [
      ['turtle', 'iguana', 'jaguar', 'python'],
      ['leopard', 'dolphin', 'giraffe', 'fox'],
      ['flamingo', 'cheetah', 'eagle', 'wolf'],
      ['horse', 'panda', 'whale', 'shark'],
    ],
    hard: [
      ['elephant', 'crocodile', 'owl', 'fox', 'frog'],
      ['chameleon', 'orangutan', 'tiger', 'wolf', 'gecko'],
      ['alligator', 'lion', 'panda', 'zebra', 'eagle'],
      ['giraffe', 'dolphin', 'leopard', 'jaguar', 'python'],
      ['flamingo', 'cheetah', 'elephant', 'macaw', 'koala'],
    ],
  },
};

export function foldName(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^A-Za-z]/g, '').toUpperCase();
}

export function animalById(id: string): Animal {
  const animal = byId.get(id);
  if (!animal) throw new Error(`Unknown animal ${id}`);
  return animal;
}

export function wordFor(animal: Animal, language: Language): string {
  return language === 'es' ? animal.es : animal.en;
}

export function sayFor(animal: Animal, language: Language): string {
  return language === 'es' ? animal.sayEs : animal.sayEn;
}

export function factsFor(animal: Animal, language: Language): string[] {
  return language === 'es' ? animal.factsEs : animal.facts;
}

export function plansFor(language: Language, level: WordLevel): readonly (readonly string[])[] {
  return PLANS[language][level];
}

export function puzzleCount(language: Language, level: WordLevel): number {
  return PLANS[language][level].length;
}
