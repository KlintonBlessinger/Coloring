import { c } from './copy';
import type { Animal } from './types';

export const fennecFox: Animal = {
  id: 'fennec-fox',
  name: c('Fennec fox', 'Zorro fénec'),
  area: 'desert',
  diet: 'omnivore',
  foods: ['insects', 'fruit'],
  foodYes: c('Yes. Fennec foxes eat insects and fruit. They are omnivores.', 'Sí. Los zorros fénec comen insectos y fruta. Son omnívoros.'),
  foodHint: c('Fennec foxes eat insects and fruit. Try insects or fruit.', 'Los zorros fénec comen insectos y fruta. Prueba los insectos o la fruta.'),
  facts: [
    {
      easy: c('A fennec fox has huge ears. Big ears help it stay cool.', 'El zorro fénec tiene orejas enormes. Las orejas grandes lo ayudan a refrescarse.'),
      hard: c('Those ears dump heat, and they also hear insects moving under the sand.', 'Esas orejas sueltan calor y también oyen insectos bajo la arena.'),
    },
    {
      easy: c('Fennec foxes rest in a burrow during the hot day.', 'Los zorros fénec descansan en una madriguera durante el día caluroso.'),
      hard: c('They hunt mostly at night, when the desert is cooler.', 'Cazan sobre todo de noche, cuando el desierto está más fresco.'),
    },
  ],
  behaviors: [
    {
      id: 'ears',
      easy: c('The fennec turns its huge ears. It is listening under the sand.', 'El fénec gira las orejas enormes. Escucha bajo la arena.'),
      hard: c('Night hunting and huge ears are how a fennec lives in open desert.', 'Cazar de noche y tener orejas enormes es su modo de vivir en el desierto.'),
    },
  ],
  enrichment: {
    prompt: {
      easy: c('Hide a snack in the sand for the fennec to hear and dig.', 'Esconde una merienda en la arena para que el fénec la oiga y escarbe.'),
      hard: c('A sand dig copies how fennec foxes hunt insects at night.', 'Escarbar arena imita cómo cazan insectos de noche.'),
    },
    spots: [c('Sand', 'Arena'), c('Rock', 'Roca'), c('Water', 'Agua')],
    correct: 0,
    hint: c('Listen in the sand. Try the sand.', 'Escucha en la arena. Prueba la arena.'),
    found: {
      easy: c('The fennec found it. Big ears help it hunt.', 'El fénec lo encontró. Las orejas grandes ayudan a cazar.'),
      hard: c('Digging for hidden food is real fennec foraging.', 'Escarbar comida escondida es una búsqueda real del fénec.'),
    },
  },
  health: {
    heart: {
      easy: c('Thump, thump. The fennec has a small, quick heart.', 'Tum, tum. El fénec tiene un corazón pequeño y rápido.'),
      hard: c('A small desert fox has a faster heartbeat than a camel.', 'Un zorro pequeño del desierto late más rápido que un camello.'),
    },
    teeth: {
      easy: c('Small sharp teeth crunch insects and nibble fruit.', 'Los dientes pequeños trituran insectos y mordisquean fruta.'),
      hard: c('That mix fits an omnivore that hunts and also eats plants.', 'Esa mezcla va con un omnívoro que caza y también come plantas.'),
    },
    weight: {
      easy: c('A fennec fox weighs about as much as a small cat.', 'Un zorro fénec pesa casi como un gato pequeño.'),
      hard: c('A fennec often weighs about 1 to 1.5 kilograms.', 'Un fénec suele pesar entre 1 y 1,5 kilogramos.'),
    },
  },
  water: {
    easy: c('A clean water dish belongs in the cool part of the habitat.', 'Un plato de agua limpia va en la parte fresca del hogar.'),
    hard: c('Fennec foxes get moisture from food, and they still drink when they can.', 'Sacan humedad de la comida y también beben cuando pueden.'),
  },
  habitat: { name: c('Sahara Desert', 'Desierto del Sahara'), x: 48, y: 40 },
  sound: {
    name: c('Yip', 'Ladrido corto'),
    say: c('A fennec fox yips.', 'Un zorro fénec da un ladrido corto.'),
    notes: [
      { at: 0, freq: 900, dur: 0.08, gain: 0.035, wave: 'triangle' },
      { at: 0.14, freq: 1100, dur: 0.1, gain: 0.03, wave: 'sine' },
    ],
  },
  sprite: null,
  playable: false,
  visible: true,
  unlock: { starter: false, areaStars: 8, after: ['meerkat'] },
};
