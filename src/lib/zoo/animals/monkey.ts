import { c } from './copy';
import type { Animal } from './types';

export const monkey: Animal = {
  id: 'monkey',
  name: c('Monkey', 'Mono'),
  area: 'rainforest',
  diet: 'omnivore',
  foods: ['fruit', 'insects'],
  foodYes: c('Yes. Monkeys eat fruit and insects. They are omnivores.', 'Sí. Los monos comen fruta e insectos. Son omnívoros.'),
  foodHint: c('Monkeys eat fruit and insects. They are omnivores. Try fruit or insects.', 'Los monos comen fruta e insectos. Son omnívoros. Prueba la fruta o los insectos.'),
  facts: [
    {
      easy: c('Monkeys climb with hands, feet, and sometimes a tail.', 'Los monos trepan con las manos, los pies y a veces la cola.'),
      hard: c('A capuchin tail can wrap a branch, but the hands do the careful work.', 'La cola de un capuchino puede rodear una rama, pero las manos hacen el trabajo fino.'),
    },
    {
      easy: c('Monkeys live in noisy groups in the trees.', 'Los monos viven en grupos ruidosos en los árboles.'),
      hard: c('Group calls warn the family about eagles and other hunters.', 'Los gritos del grupo avisan a la familia de águilas y otros cazadores.'),
    },
  ],
  behaviors: [
    {
      id: 'climb',
      easy: c("The monkey climbs. Trees are the monkey's road.", 'El mono trepa. Los árboles son su camino.'),
      hard: c("Climbing and foraging take most of a monkey's day.", 'Trepar y buscar comida ocupan casi todo el día de un mono.'),
    },
  ],
  enrichment: {
    prompt: {
      easy: c('Hide fruit up in the branches for the monkey.', 'Esconde fruta en las ramas para el mono.'),
      hard: c('A raised puzzle feeder copies how monkeys forage in the canopy.', 'Un comedero alto imita cómo buscan comida en las copas.'),
    },
    spots: [c('High branch', 'Rama alta'), c('Ground', 'Suelo'), c('Rock', 'Roca')],
    correct: 0,
    hint: c('Look up. Monkeys search the branches.', 'Mira arriba. Los monos buscan en las ramas.'),
    found: {
      easy: c('The monkey found the fruit. Climbing is how monkeys travel.', 'El mono encontró la fruta. Trepar es como viajan.'),
      hard: c("Foraging up high keeps a monkey's hands and mind busy.", 'Buscar arriba mantiene ocupadas las manos y la mente.'),
    },
  },
  health: {
    heart: {
      easy: c('Thump, thump. The monkey has a quick, healthy heart.', 'Tum, tum. El mono tiene un corazón rápido y sano.'),
      hard: c('A small body has a faster heartbeat than a lion or an elephant.', 'Un cuerpo pequeño late más rápido que un león o un elefante.'),
    },
    teeth: {
      easy: c('Monkey teeth can bite fruit and crunch insects.', 'Los dientes del mono muerden fruta y trituran insectos.'),
      hard: c('That mix of teeth matches an omnivore diet.', 'Esa mezcla de dientes va con una dieta omnívora.'),
    },
    weight: {
      easy: c('A capuchin monkey weighs about as much as a house cat.', 'Un mono capuchino pesa casi como un gato de casa.'),
      hard: c('A capuchin often weighs about 2 to 4 kilograms.', 'Un capuchino suele pesar entre 2 y 4 kilogramos.'),
    },
  },
  water: {
    easy: c('Monkeys drink fresh water from a clean bowl or leaf cup.', 'Los monos beben agua fresca de un cuenco limpio.'),
    hard: c('In the forest they drink from tree holes and streams.', 'En el bosque beben de huecos en los árboles y de arroyos.'),
  },
  habitat: { name: c('Amazon rainforest', 'Selva amazónica'), x: 32, y: 58 },
  sound: {
    name: c('Chatter', 'Charla'),
    say: c('A monkey chatters.', 'Un mono parlotea.'),
    notes: [
      { at: 0, freq: 680, dur: 0.08, gain: 0.04, wave: 'triangle' },
      { at: 0.1, freq: 820, dur: 0.08, gain: 0.04, wave: 'triangle' },
      { at: 0.2, freq: 740, dur: 0.1, gain: 0.035, wave: 'sine' },
    ],
  },
  sprite: 'monkey',
  playable: false,
  visible: true,
  unlock: { starter: true, areaStars: 0, after: [] },
};
