import type { Language } from '../../settings';
import type { CareNeed } from './progression';
import type { Animal, AreaId, Copy, Diet, Food } from './types';

export function c(en: string, es: string): Copy {
  return { en, es };
}

export function line(copy: Copy, language: Language): string {
  return language === 'es' ? copy.es : copy.en;
}

export function leveled(copy: { easy: Copy; hard: Copy }, harder: boolean): Copy {
  return harder ? copy.hard : copy.easy;
}

export const AREA_NAME: Record<AreaId, Copy> = {
  savannah: c('Savannah', 'Sabana'),
  rainforest: c('Rainforest', 'Selva'),
  desert: c('Desert', 'Desierto'),
  'reptile-house': c('Reptile House', 'Casa de reptiles'),
  aquarium: c('Aquarium', 'Acuario'),
  arctic: c('Arctic', 'Ártico'),
  birds: c('Birds', 'Aves'),
};

export const FOOD_LABEL: Record<Food, Copy> = {
  meat: c('Meat', 'Carne'),
  fish: c('Fish', 'Pescado'),
  leaves: c('Leaves', 'Hojas'),
  insects: c('Insects', 'Insectos'),
  fruit: c('Fruit', 'Fruta'),
};

export const DIET_LABEL: Record<Diet, Copy> = {
  carnivore: c('Carnivore', 'Carnívoro'),
  herbivore: c('Herbivore', 'Herbívoro'),
  omnivore: c('Omnivore', 'Omnívoro'),
};

export const TASK_LABEL: Record<string, Copy> = {
  feed: c('Feeding', 'Comida'),
  water: c('Fresh water', 'Agua fresca'),
  enrich: c('Enrichment', 'Juego'),
  health: c('Health check', 'Revisión'),
};

export const WATER_STEPS = [
  { id: 'scoop', label: c('Scoop', 'Sacar'), say: c('Scoop out the old water.', 'Saca el agua vieja.') },
  { id: 'sweep', label: c('Sweep', 'Barrer'), say: c('Sweep the habitat clean.', 'Barre el hogar del animal.') },
  { id: 'refill', label: c('Refill', 'Llenar'), say: c('Pour in fresh water.', 'Echa agua fresca.') },
] as const;

/** Gentle need. Animals ask for care again later. They never get sick or sad. */
export function needCopy(animal: Animal, need: CareNeed): Copy {
  if (need === 'resting') {
    return c(
      `${animal.name.en} is cozy for now. Next visit, we can care again.`,
      `${animal.name.es} está a gusto por ahora. En la próxima visita podemos cuidar otra vez.`,
    );
  }
  return c(
    `${animal.name.en} is ready for care.`,
    `Toca cuidar a ${animal.name.es}.`,
  );
}
