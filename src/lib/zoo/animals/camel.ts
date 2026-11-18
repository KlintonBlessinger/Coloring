import { c } from './copy';
import type { Animal } from './types';

export const camel: Animal = {
  id: 'camel',
  name: c('Camel', 'Camello'),
  area: 'desert',
  diet: 'herbivore',
  foods: ['leaves'],
  foodYes: c('Yes. Camels eat tough plants. They are herbivores.', 'Sí. Los camellos comen plantas duras. Son herbívoros.'),
  foodHint: c('Camels eat plants. They are herbivores. Try the leaves.', 'Los camellos comen plantas. Son herbívoros. Prueba las hojas.'),
  facts: [
    {
      easy: c("A camel's hump stores fat, not water.", 'La joroba del camello guarda grasa, no agua.'),
      hard: c('That fat is an energy store. Water is kept in the body, not in the hump.', 'Esa grasa es energía. El agua se guarda en el cuerpo, no en la joroba.'),
    },
    {
      easy: c('Camels can walk a long way on sand.', 'Los camellos pueden caminar mucho sobre la arena.'),
      hard: c('Wide feet spread their weight so they do not sink as easily.', 'Las patas anchas reparten el peso para no hundirse tanto.'),
    },
  ],
  behaviors: [
    {
      id: 'hump',
      easy: c('The camel walks slowly across the sand. The hump is a fat store.', 'El camello camina despacio por la arena. La joroba guarda grasa.'),
      hard: c('A soft hump can mean the fat store is low. A firm hump means it is well fed.', 'Una joroba blanda puede indicar poca reserva. Una firme indica que come bien.'),
    },
  ],
  enrichment: {
    prompt: {
      easy: c('Hang browse where the camel can nibble. Camels eat tough plants.', 'Cuelga ramas para que el camello mordisquee. Come plantas duras.'),
      hard: c('Scattered browse is better than one pile. Camels forage as they walk.', 'Ramas repartidas son mejor que un solo montón. El camello busca mientras camina.'),
    },
    spots: [c('Browse', 'Ramas'), c('Sand pile', 'Arena'), c('Rock', 'Roca')],
    correct: 0,
    hint: c('Look at the browse. Camels eat plants.', 'Mira las ramas. Los camellos comen plantas.'),
    found: {
      easy: c('The camel found the plants.', 'El camello encontró las plantas.'),
      hard: c('Nibbling browse wears the teeth the way desert shrubs would.', 'Mordisquear ramas gasta los dientes como los arbustos del desierto.'),
    },
  },
  health: {
    heart: {
      easy: c('Thump, thump. The camel has a calm, steady heart.', 'Tum, tum. El camello tiene un corazón tranquilo y parejo.'),
      hard: c('Camels are built to stay steady in heat, with a calm resting heartbeat.', 'Están hechos para el calor, con un latido tranquilo en reposo.'),
    },
    teeth: {
      easy: c('Tough teeth grind dry plants.', 'Los dientes fuertes muelen plantas secas.'),
      hard: c("A camel's canine teeth can look pointy, but the food is still plants.", 'Los caninos pueden verse puntiagudos, pero la comida sigue siendo plantas.'),
    },
    weight: {
      easy: c('A camel can weigh as much as a small car.', 'Un camello puede pesar como un auto pequeño.'),
      hard: c('A dromedary often weighs about 400 to 600 kilograms.', 'Un dromedario suele pesar entre 400 y 600 kilogramos.'),
    },
  },
  water: {
    easy: c('Camels drink a lot when they reach water, so the trough must be clean.', 'Los camellos beben mucho cuando llegan al agua, así que el bebedero debe estar limpio.'),
    hard: c('They can go days without drinking, then drink tens of liters at once.', 'Pueden pasar días sin beber y luego tomar decenas de litros de una vez.'),
  },
  habitat: { name: c('Sahara Desert', 'Desierto del Sahara'), x: 50, y: 42 },
  sound: {
    name: c('Grunt', 'Gruñido'),
    say: c('A camel grunts.', 'Un camello gruñe.'),
    notes: [
      { at: 0, freq: 150, dur: 0.22, gain: 0.045, wave: 'triangle' },
      { at: 0.24, freq: 120, dur: 0.28, gain: 0.04, wave: 'sine' },
    ],
  },
  sprite: 'camel',
  playable: false,
  visible: true,
  unlock: { starter: true, areaStars: 0, after: [] },
};
