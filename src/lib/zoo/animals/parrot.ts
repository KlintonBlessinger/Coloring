import { c } from './copy';
import type { Animal } from './types';

export const parrot: Animal = {
  id: 'parrot',
  name: c('Parrot', 'Loro'),
  area: 'birds',
  diet: 'herbivore',
  foods: ['fruit'],
  foodYes: c('Yes. Parrots eat fruit, nuts, and seeds. Fruit is the plant food on this tray. They are herbivores.', 'Sí. Los loros comen fruta, nueces y semillas. La fruta es la comida de planta en esta bandeja. Son herbívoros.'),
  foodHint: c('Parrots eat fruit and seeds. They are herbivores. Try the fruit.', 'Los loros comen fruta y semillas. Son herbívoros. Prueba la fruta.'),
  facts: [
    {
      easy: c('Parrots can copy sounds they hear.', 'Los loros pueden copiar sonidos que oyen.'),
      hard: c('They learn calls from the flock, and some learn human words too.', 'Aprenden llamados de la bandada, y algunos aprenden palabras de las personas.'),
    },
    {
      easy: c('Bright colors help parrots find each other in the trees.', 'Los colores vivos ayudan a los loros a encontrarse entre los árboles.'),
      hard: c('A hooked beak cracks seeds and also climbs, like an extra hand.', 'El pico ganchudo abre semillas y también trepa, como una mano extra.'),
    },
  ],
  behaviors: [
    {
      id: 'flock',
      easy: c('The parrot calls from the branches. Flock calls keep the group together.', 'El loro llama desde las ramas. Los llamados mantienen unido al grupo.'),
      hard: c('Chewing wood and foraging are daily needs, not bad habits.', 'Morder madera y buscar comida son necesidades diarias, no malas costumbres.'),
    },
  ],
  enrichment: {
    prompt: {
      easy: c('Tuck fruit into a toy so the parrot has to forage.', 'Mete fruta en un juguete para que el loro tenga que buscarla.'),
      hard: c('Foraging toys replace the work of finding fruit in a forest.', 'Los juguetes de búsqueda reemplazan el trabajo de hallar fruta en el bosque.'),
    },
    spots: [c('Toy', 'Juguete'), c('Floor', 'Suelo'), c('Water', 'Agua')],
    correct: 0,
    hint: c('Parrots search their toys. Try the toy.', 'Los loros buscan en sus juguetes. Prueba el juguete.'),
    found: {
      easy: c('The parrot found the fruit. Foraging keeps parrots busy.', 'El loro encontró la fruta. Buscar comida los mantiene ocupados.'),
      hard: c('A parrot that forages is using its beak and its brain.', 'Un loro que busca usa el pico y el cerebro.'),
    },
  },
  health: {
    heart: {
      easy: c('Thump, thump. The parrot has a quick, bright heart.', 'Tum, tum. El loro tiene un corazón rápido y vivo.'),
      hard: c('Bird hearts beat fast. A calm parrot still has a quicker heart than a lion.', 'El corazón de las aves late rápido. Un loro tranquilo igual late más que un león.'),
    },
    teeth: {
      easy: c('Parrots have no teeth. The beak cracks fruit and seeds.', 'No tienen dientes. El pico abre fruta y semillas.'),
      hard: c('The beak keeps growing, so chewing wood wears it down in a healthy way.', 'El pico sigue creciendo, así que morder madera lo gasta de forma sana.'),
    },
    weight: {
      easy: c('Parrots come in many sizes, from tiny to macaw-big.', 'Hay loros de muchos tamaños, desde diminutos hasta el tamaño de un guacamayo.'),
      hard: c('A macaw can weigh about a kilogram. A budgie weighs only about 30 grams.', 'Un guacamayo puede pesar cerca de un kilogramo. Un periquito pesa unos 30 gramos.'),
    },
  },
  water: {
    easy: c('A clean bowl is for drinking, and a separate spray is for a bath.', 'Un cuenco limpio es para beber, y un rocío aparte es para el baño.'),
    hard: c('Bathing keeps feathers flexible for flight and for showy displays.', 'Bañarse mantiene las plumas flexibles para volar y para lucirse.'),
  },
  habitat: { name: c('Tropical forests', 'Bosques tropicales'), x: 33, y: 64 },
  sound: {
    name: c('Squawk', 'Graznido'),
    say: c('A parrot squawks.', 'Un loro grazna.'),
    notes: [
      { at: 0, freq: 980, dur: 0.12, gain: 0.04, wave: 'triangle' },
      { at: 0.14, freq: 760, dur: 0.14, gain: 0.035, wave: 'sawtooth' },
    ],
  },
  sprite: null,
  playable: false,
  visible: true,
  unlock: { starter: false, areaStars: 8, after: ['flamingo'] },
};
