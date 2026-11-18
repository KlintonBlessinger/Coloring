import { c } from './copy';
import type { Animal } from './types';

export const jaguar: Animal = {
  id: 'jaguar',
  name: c('Jaguar', 'Jaguar'),
  area: 'rainforest',
  diet: 'carnivore',
  foods: ['meat'],
  foodYes: c('Yes. Jaguars eat meat. They are carnivores.', 'Sí. Los jaguares comen carne. Son carnívoros.'),
  foodHint: c('Jaguars eat meat. They are carnivores. Try the meat.', 'Los jaguares comen carne. Son carnívoros. Prueba la carne.'),
  facts: [
    {
      easy: c('Jaguars can swim, and they hunt near rivers.', 'Los jaguares saben nadar y cazan cerca de los ríos.'),
      hard: c('A jaguar has a very strong bite for its size, strong enough to crack a turtle shell.', 'El jaguar tiene una mordida muy fuerte para su tamaño, capaz de romper un caparazón.'),
    },
    {
      easy: c('Spots help a jaguar hide in dappled light.', 'Las manchas ayudan al jaguar a esconderse entre las luces del bosque.'),
      hard: c('The spots are rosettes, and the ones on a jaguar often have a dot in the middle.', 'Las manchas son rosetas, y las del jaguar suelen tener un punto en el centro.'),
    },
  ],
  behaviors: [
    {
      id: 'river',
      easy: c('The jaguar rests by the water. Rivers are hunting places.', 'El jaguar descansa junto al agua. Los ríos son lugares de caza.'),
      hard: c('Jaguars will swim after prey. Water is part of the hunt, not just a drink.', 'El jaguar nada detrás de la presa. El agua es parte de la caza.'),
    },
  ],
  enrichment: {
    prompt: {
      easy: c('Hide a treat near the water. Jaguars hunt along rivers.', 'Esconde una golosina cerca del agua. Los jaguares cazan junto a los ríos.'),
      hard: c('A scent trail by the pool invites stalking, a jaguar behavior.', 'Un rastro junto al agua invita al acecho, un comportamiento del jaguar.'),
    },
    spots: [c('River edge', 'Orilla'), c('Open sand', 'Arena'), c('High nest', 'Nido')],
    correct: 0,
    hint: c('Look by the water. That is jaguar country.', 'Mira junto al agua. Ese es el lugar del jaguar.'),
    found: {
      easy: c('The jaguar found it by the water.', 'El jaguar lo encontró junto al agua.'),
      hard: c('Stalking a riverbank is closer to a wild hunt than a bowl of food.', 'Acechar la orilla se parece más a la caza real que a un cuenco.'),
    },
  },
  health: {
    heart: {
      easy: c('Thump, thump. The jaguar has a strong heart.', 'Tum, tum. El jaguar tiene un corazón fuerte.'),
      hard: c('After a swim, a healthy jaguar settles into a slow, steady beat.', 'Después de nadar, un jaguar sano vuelve a un latido lento y parejo.'),
    },
    teeth: {
      easy: c("A jaguar's teeth are made for meat.", 'Los dientes del jaguar están hechos para la carne.'),
      hard: c('The big canine teeth and strong jaws give the jaguar its famous bite.', 'Los colmillos y la mandíbula fuerte dan esa mordida famosa.'),
    },
    weight: {
      easy: c('A jaguar is a big cat, heavier than a leopard and built for power.', 'El jaguar es un gran felino, más pesado que un leopardo y hecho para la fuerza.'),
      hard: c('A large jaguar can weigh about 80 to 120 kilograms.', 'Un jaguar grande puede pesar entre 80 y 120 kilogramos.'),
    },
  },
  water: {
    easy: c('Jaguars need clean water to drink and a pool deep enough to swim.', 'Los jaguares necesitan agua limpia para beber y un estanque para nadar.'),
    hard: c('Swimming is enrichment and exercise, so the water has to stay fresh.', 'Nadar es juego y ejercicio, así que el agua debe estar fresca.'),
  },
  habitat: { name: c('Amazon rainforest', 'Selva amazónica'), x: 30, y: 56 },
  sound: {
    name: c('Saw', 'Rugido ronco'),
    say: c('A jaguar makes a deep, sawing call.', 'Un jaguar hace un llamado grave, como una sierra.'),
    notes: [
      { at: 0, freq: 140, dur: 0.18, gain: 0.045, wave: 'sawtooth' },
      { at: 0.2, freq: 120, dur: 0.18, gain: 0.04, wave: 'triangle' },
      { at: 0.4, freq: 110, dur: 0.2, gain: 0.035, wave: 'sine' },
    ],
  },
  sprite: null,
  playable: false,
  visible: true,
  unlock: { starter: false, areaStars: 12, after: ['toucan'] },
};
