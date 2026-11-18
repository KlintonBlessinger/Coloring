import { c } from './copy';
import type { Animal } from './types';

export const elephant: Animal = {
  id: 'elephant',
  name: c('Elephant', 'Elefante'),
  area: 'savannah',
  diet: 'herbivore',
  foods: ['leaves', 'fruit'],
  foodYes: c('Yes. Elephants eat plants. Leaves and fruit both count. They are herbivores.', 'Sí. Los elefantes comen plantas. Las hojas y la fruta valen. Son herbívoros.'),
  foodHint: c('Elephants eat plants, not meat. Try leaves or fruit.', 'Los elefantes comen plantas, no carne. Prueba las hojas o la fruta.'),
  facts: [
    {
      easy: c('An elephant eats a lot of plants every day.', 'Un elefante come muchas plantas cada día.'),
      hard: c("An elephant's trunk has about forty thousand muscles.", 'La trompa de un elefante tiene unos cuarenta mil músculos.'),
    },
    {
      easy: c('Elephants live in family herds led by a grandmother.', 'Los elefantes viven en familias guiadas por una abuela.'),
      hard: c('The oldest female, the matriarch, remembers where to find water.', 'La hembra mayor, la matriarca, recuerda dónde encontrar agua.'),
    },
  ],
  behaviors: [
    {
      id: 'ears',
      easy: c('The elephant flaps its ears. That helps it cool down.', 'El elefante mueve las orejas. Así se refresca.'),
      hard: c('Ear flapping and mud baths are how elephants shed heat.', 'Mover las orejas y bañarse de lodo ayuda a soltar el calor.'),
    },
  ],
  enrichment: {
    prompt: {
      easy: c('Hide fruit for the elephant to find with its trunk.', 'Esconde fruta para que el elefante la encuentre con la trompa.'),
      hard: c('A buried snack invites trunk foraging, a real elephant behavior.', 'Una merienda enterrada invita a buscar con la trompa, algo real.'),
    },
    spots: [c('Hay pile', 'Heno'), c('Mud bath', 'Lodo'), c('Rock', 'Roca')],
    correct: 0,
    hint: c('Keep looking. Try the hay pile.', 'Sigue buscando. Prueba el heno.'),
    found: {
      easy: c('The trunk found the snack. Elephants forage with their trunks.', 'La trompa encontró la merienda. Los elefantes buscan así.'),
      hard: c('Trunk foraging keeps the muscles busy and the mind curious.', 'Buscar con la trompa ejercita los músculos y la curiosidad.'),
    },
  },
  health: {
    heart: {
      easy: c('Thump, thump. The elephant has a big, calm heart.', 'Tum, tum. El elefante tiene un corazón grande y tranquilo.'),
      hard: c('An elephant heart beats slowly. A big body does not need a fast heart.', 'El corazón del elefante late despacio. Un cuerpo grande no necesita un latido rápido.'),
    },
    teeth: {
      easy: c('Wide teeth grind plants. New ones grow in as old ones wear down.', 'Los dientes anchos muelen plantas. Salen nuevos cuando los viejos se gastan.'),
      hard: c('Elephants get only a few sets of molars in a lifetime.', 'Los elefantes solo tienen unos pocos juegos de muelas en toda la vida.'),
    },
    weight: {
      easy: c('An elephant is the heaviest land animal. It can weigh as much as a small truck.', 'El elefante es el animal terrestre más pesado. Puede pesar como un camión pequeño.'),
      hard: c('An African elephant can weigh about 4,000 to 6,000 kilograms.', 'Un elefante africano puede pesar entre 4.000 y 6.000 kilogramos.'),
    },
  },
  water: {
    easy: c('Elephants love clean water for drinking and spraying.', 'A los elefantes les gusta el agua limpia para beber y echarse encima.'),
    hard: c('A trunk can hold several liters, then spray it into the mouth.', 'La trompa guarda varios litros y luego los echa en la boca.'),
  },
  habitat: { name: c('African savannah', 'Sabana africana'), x: 55, y: 55 },
  sound: {
    name: c('Rumble', 'Retumbo'),
    say: c('An elephant rumbles.', 'Un elefante retumba.'),
    notes: [
      { at: 0, freq: 70, dur: 0.8, gain: 0.06, wave: 'sine' },
      { at: 0.2, freq: 55, dur: 0.9, gain: 0.05, wave: 'sine' },
    ],
  },
  sprite: null,
  playable: false,
  visible: true,
  unlock: { starter: false, areaStars: 12, after: ['zebra'] },
};
