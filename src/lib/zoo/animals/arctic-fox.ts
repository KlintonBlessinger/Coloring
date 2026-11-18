import { c } from './copy';
import type { Animal } from './types';

export const arcticFox: Animal = {
  id: 'arctic-fox',
  name: c('Arctic fox', 'Zorro ártico'),
  area: 'arctic',
  diet: 'omnivore',
  foods: ['meat', 'fruit'],
  foodYes: c('Yes. Arctic foxes eat meat and berries. They are omnivores.', 'Sí. Los zorros árticos comen carne y bayas. Son omnívoros.'),
  foodHint: c('Arctic foxes eat meat and fruit. Try meat or fruit.', 'Los zorros árticos comen carne y fruta. Prueba la carne o la fruta.'),
  facts: [
    {
      easy: c('An arctic fox coat turns white in winter and brown in summer.', 'El pelaje del zorro ártico se vuelve blanco en invierno y pardo en verano.'),
      hard: c('The color change is camouflage. White matches snow. Brown matches summer ground.', 'El cambio de color es camuflaje. El blanco va con la nieve. El pardo va con el suelo de verano.'),
    },
    {
      easy: c('Thick fur, even on the paws, keeps an arctic fox warm.', 'El pelo grueso, incluso en las patas, mantiene caliente al zorro ártico.'),
      hard: c('It has the warmest coat of any fox, plus a short nose and small ears to save heat.', 'Tiene el abrigo más cálido de los zorros, más un hocico corto y orejas pequeñas para guardar calor.'),
    },
  ],
  behaviors: [
    {
      id: 'coat',
      easy: c('The arctic fox curls its tail over its nose when it rests.', 'El zorro ártico enrosca la cola sobre la nariz cuando descansa.'),
      hard: c('The tail is a blanket. Pouncing into snow is how it hunts lemmings.', 'La cola es una manta. Saltar sobre la nieve es como caza lemmings.'),
    },
  ],
  enrichment: {
    prompt: {
      easy: c('Hide a snack under a snow pile for the fox to pounce on.', 'Esconde una merienda bajo la nieve para que el zorro salte encima.'),
      hard: c('A snow pounce copies how arctic foxes hunt small animals.', 'Saltar sobre la nieve imita cómo cazan animalitos.'),
    },
    spots: [c('Snow', 'Nieve'), c('Rock', 'Roca'), c('Water', 'Agua')],
    correct: 0,
    hint: c('Try the snow. Foxes pounce there.', 'Prueba la nieve. Los zorros saltan ahí.'),
    found: {
      easy: c('The fox found it under the snow.', 'El zorro lo encontró bajo la nieve.'),
      hard: c('That pounce is a real hunting move, called mousing.', 'Ese salto es una caza real, llamada caza de ratones.'),
    },
  },
  health: {
    heart: {
      easy: c('Thump, thump. The arctic fox has a quick, warm heart.', 'Tum, tum. El zorro ártico tiene un corazón rápido y cálido.'),
      hard: c('A small body loses heat fast, so the coat matters as much as the heartbeat.', 'Un cuerpo pequeño pierde calor rápido, así que el pelaje importa tanto como el corazón.'),
    },
    teeth: {
      easy: c('Sharp teeth eat meat, and smaller teeth help with berries.', 'Los dientes afilados comen carne, y otros más pequeños ayudan con las bayas.'),
      hard: c('An omnivore mouth handles both a lemming and summer fruit.', 'Una boca omnívora sirve tanto para un lemming como para la fruta de verano.'),
    },
    weight: {
      easy: c('An arctic fox weighs about as much as a house cat.', 'Un zorro ártico pesa casi como un gato de casa.'),
      hard: c('Adults often weigh about 3 to 8 kilograms, heavier in winter.', 'Los adultos suelen pesar entre 3 y 8 kilogramos, más en invierno.'),
    },
  },
  water: {
    easy: c('A clean water bowl stays unfrozen in the habitat.', 'Un cuenco de agua limpia se mantiene sin congelar en el hogar.'),
    hard: c('In the wild they eat snow for water. Here a bowl is easier to keep clean.', 'En la naturaleza comen nieve para beber. Aquí un cuenco es más fácil de mantener limpio.'),
  },
  habitat: { name: c('Arctic tundra', 'Tundra ártica'), x: 60, y: 16 },
  sound: {
    name: c('Bark', 'Ladrido'),
    say: c('An arctic fox barks.', 'Un zorro ártico ladra.'),
    notes: [
      { at: 0, freq: 700, dur: 0.1, gain: 0.035, wave: 'triangle' },
      { at: 0.16, freq: 860, dur: 0.1, gain: 0.03, wave: 'sine' },
    ],
  },
  sprite: null,
  playable: false,
  visible: true,
  unlock: { starter: false, areaStars: 8, after: ['seal'] },
};
