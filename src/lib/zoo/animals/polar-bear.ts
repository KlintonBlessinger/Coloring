import { c } from './copy';
import type { Animal } from './types';

export const polarBear: Animal = {
  id: 'polar-bear',
  name: c('Polar bear', 'Oso polar'),
  area: 'arctic',
  diet: 'carnivore',
  foods: ['meat', 'fish'],
  foodYes: c('Yes. Polar bears eat meat and fish. They are carnivores.', 'Sí. Los osos polares comen carne y pescado. Son carnívoros.'),
  foodHint: c('Polar bears eat meat and fish. Try meat or fish.', 'Los osos polares comen carne y pescado. Prueba la carne o el pescado.'),
  facts: [
    {
      easy: c('Polar bear fur looks white. The skin underneath is black.', 'El pelo del oso polar se ve blanco. La piel de abajo es negra.'),
      hard: c('The hairs are hollow and clear. They scatter light, so the coat looks white.', 'Los pelos son huecos y transparentes. Dispersan la luz, por eso el abrigo se ve blanco.'),
    },
    {
      easy: c('Polar bears hunt seals on the sea ice.', 'Los osos polares cazan focas en el hielo del mar.'),
      hard: c('They wait by a breathing hole, then pull a seal up through the ice.', 'Esperan junto a un agujero para respirar y luego sacan a la foca por el hielo.'),
    },
  ],
  behaviors: [
    {
      id: 'sniff',
      easy: c('The polar bear sniffs the air. Smell helps it find seals.', 'El oso polar olfatea el aire. El olfato lo ayuda a encontrar focas.'),
      hard: c('A polar bear can smell a seal from a long way across the ice.', 'Puede oler una foca desde muy lejos sobre el hielo.'),
    },
  ],
  enrichment: {
    prompt: {
      easy: c('Hide a frozen snack for the polar bear to find by smell.', 'Esconde una merienda congelada para que el oso la encuentre por el olor.'),
      hard: c('Scent searches copy how polar bears hunt across the ice.', 'Buscar por el olor imita cómo cazan sobre el hielo.'),
    },
    spots: [c('Ice pile', 'Hielo'), c('Rock', 'Roca'), c('Water edge', 'Orilla')],
    correct: 0,
    hint: c('Sniff the ice pile. Try there.', 'Olfatea el hielo. Prueba ahí.'),
    found: {
      easy: c('The polar bear found it with its nose.', 'El oso polar lo encontró con la nariz.'),
      hard: c('A scent hunt is closer to seal hunting than a bowl set on the ground.', 'Una búsqueda por el olor se parece más a cazar focas que a un cuenco en el suelo.'),
    },
  },
  health: {
    heart: {
      easy: c('Thump, thump. The polar bear has a big, strong heart.', 'Tum, tum. El oso polar tiene un corazón grande y fuerte.'),
      hard: c('A thick fat layer and dense fur keep the body warm so the heart can stay steady.', 'Una capa de grasa y el pelo denso mantienen el calor para que el corazón siga parejo.'),
    },
    teeth: {
      easy: c('Big canine teeth help a polar bear eat meat.', 'Los colmillos grandes ayudan a comer carne.'),
      hard: c('The teeth and jaws are built for blubber and meat, the polar bear diet.', 'Los dientes y la mandíbula están hechos para la grasa y la carne, su dieta.'),
    },
    weight: {
      easy: c('A polar bear is a huge bear. A big male can weigh as much as a small car.', 'El oso polar es un oso enorme. Un macho grande puede pesar como un auto pequeño.'),
      hard: c('Adult males often weigh about 350 to 700 kilograms.', 'Los machos adultos suelen pesar entre 350 y 700 kilogramos.'),
    },
  },
  water: {
    easy: c('Polar bears drink fresh water and swim in cold water.', 'Los osos polares beben agua dulce y nadan en agua fría.'),
    hard: c('They swim far between ice floes, so a deep cold pool is part of care.', 'Nadan lejos entre los hielos, así que un estanque frío y hondo es parte del cuidado.'),
  },
  habitat: { name: c('Arctic sea ice', 'Hielo del Ártico'), x: 42, y: 14 },
  sound: {
    name: c('Chuff', 'Resoplido'),
    say: c('A polar bear chuffs.', 'Un oso polar resopla.'),
    notes: [
      { at: 0, freq: 140, dur: 0.16, gain: 0.04, wave: 'triangle' },
      { at: 0.18, freq: 110, dur: 0.2, gain: 0.035, wave: 'sine' },
    ],
  },
  sprite: 'polar-bear',
  playable: false,
  visible: true,
  unlock: { starter: true, areaStars: 0, after: [] },
};
