import { c } from './copy';
import type { Animal } from './types';

export const meerkat: Animal = {
  id: 'meerkat',
  name: c('Meerkat', 'Suricato'),
  area: 'desert',
  diet: 'omnivore',
  foods: ['insects', 'fruit'],
  foodYes: c('Yes. Meerkats eat insects and some fruit. They are omnivores.', 'Sí. Los suricatos comen insectos y algo de fruta. Son omnívoros.'),
  foodHint: c('Meerkats eat insects and a little fruit. Try insects or fruit.', 'Los suricatos comen insectos y un poco de fruta. Prueba los insectos o la fruta.'),
  facts: [
    {
      easy: c('A meerkat stands up tall to look out for the family.', 'Un suricato se pone de pie para vigilar a la familia.'),
      hard: c('One meerkat is the sentry. It watches while the others forage.', 'Un suricato hace de centinela. Vigila mientras los otros buscan comida.'),
    },
    {
      easy: c('Meerkats live in groups in underground burrows.', 'Los suricatos viven en grupos, en túneles bajo tierra.'),
      hard: c('The burrow stays cooler than the desert surface at midday.', 'La madriguera está más fresca que la superficie del desierto al mediodía.'),
    },
  ],
  behaviors: [
    {
      id: 'lookout',
      easy: c('Why is the meerkat standing up? It is on lookout duty.', '¿Por qué el suricato está de pie? Está de guardia.'),
      hard: c('Sentries give an alarm call, and the group dives for the burrow.', 'El centinela da una alarma y el grupo se mete en la madriguera.'),
    },
  ],
  enrichment: {
    prompt: {
      easy: c('Hide insects in the sand for the meerkats to dig up.', 'Esconde insectos en la arena para que los suricatos escarben.'),
      hard: c('A dig box copies foraging while one meerkat can still play sentry.', 'Una caja de arena imita la búsqueda, mientras otro puede vigilar.'),
    },
    spots: [c('Sand', 'Arena'), c('Rock top', 'Roca'), c('Water', 'Agua')],
    correct: 0,
    hint: c('Meerkats dig in the sand. Try the sand.', 'Los suricatos escarban la arena. Prueba la arena.'),
    found: {
      easy: c('They found the insects. Digging is how meerkats forage.', 'Encontraron los insectos. Escarbar es como buscan comida.'),
      hard: c('Foraging in a group, with a sentry up, is the real pattern.', 'Buscar en grupo, con un centinela, es el patrón real.'),
    },
  },
  health: {
    heart: {
      easy: c('Thump, thump. The meerkat has a quick little heart.', 'Tum, tum. El suricato tiene un corazón pequeño y rápido.'),
      hard: c('Small mammals have faster heartbeats than camels and lions.', 'Los mamíferos pequeños laten más rápido que los camellos y los leones.'),
    },
    teeth: {
      easy: c('Sharp little teeth crunch insects.', 'Los dientes pequeños y afilados trituran insectos.'),
      hard: c('Meerkats can eat scorpions. They are quick, and they learn from the group.', 'Pueden comer escorpiones. Son rápidos y aprenden del grupo.'),
    },
    weight: {
      easy: c('A meerkat weighs about as much as a squirrel.', 'Un suricato pesa casi como una ardilla.'),
      hard: c('A meerkat often weighs under one kilogram.', 'Un suricato suele pesar menos de un kilogramo.'),
    },
  },
  water: {
    easy: c('Meerkats need a shallow, clean dish of water.', 'Los suricatos necesitan un plato bajo con agua limpia.'),
    hard: c('They get moisture from food, and they still drink when water is there.', 'Sacan humedad de la comida y también beben cuando hay agua.'),
  },
  habitat: { name: c('Kalahari Desert', 'Desierto del Kalahari'), x: 54, y: 64 },
  sound: {
    name: c('Chirp', 'Pío'),
    say: c('A meerkat chirps.', 'Un suricato pía.'),
    notes: [
      { at: 0, freq: 1400, dur: 0.06, gain: 0.03, wave: 'sine' },
      { at: 0.1, freq: 1700, dur: 0.06, gain: 0.03, wave: 'sine' },
      { at: 0.2, freq: 1500, dur: 0.07, gain: 0.025, wave: 'sine' },
    ],
  },
  sprite: null,
  playable: false,
  visible: true,
  unlock: { starter: false, areaStars: 4, after: [] },
};
