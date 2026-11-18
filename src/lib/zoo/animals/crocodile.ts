import { c } from './copy';
import type { Animal } from './types';

export const crocodile: Animal = {
  id: 'crocodile',
  name: c('Crocodile', 'Cocodrilo'),
  area: 'reptile-house',
  diet: 'carnivore',
  foods: ['meat', 'fish'],
  foodYes: c('Yes. Crocodiles eat meat and fish. They are carnivores.', 'Sí. Los cocodrilos comen carne y pescado. Son carnívoros.'),
  foodHint: c('Crocodiles eat meat and fish. Try meat or fish.', 'Los cocodrilos comen carne y pescado. Prueba la carne o el pescado.'),
  facts: [
    {
      easy: c('A crocodile can rest with just its eyes and nose above the water.', 'Un cocodrilo puede descansar con solo los ojos y la nariz fuera del agua.'),
      hard: c('Eyes and nostrils sit on top of the head, so the body can hide below.', 'Los ojos y la nariz están arriba de la cabeza, así el cuerpo se esconde abajo.'),
    },
    {
      easy: c('Crocodiles are ancient hunters. They warm up in the sun.', 'Los cocodrilos son cazadores muy antiguos. Se calientan al sol.'),
      hard: c('They are reptiles, so they borrow heat from the sun instead of making all of it inside.', 'Son reptiles, así que toman calor del sol en vez de producirlo todo por dentro.'),
    },
  ],
  behaviors: [
    {
      id: 'bask',
      easy: c('The crocodile rests at the surface. It is watching and warming up.', 'El cocodrilo descansa en la superficie. Mira y se calienta.'),
      hard: c('Basking raises body temperature so the crocodile can digest a meal.', 'Tomar el sol sube la temperatura para poder digerir la comida.'),
    },
  ],
  enrichment: {
    prompt: {
      easy: c('Float a snack near the bank. Crocodiles hunt from the water.', 'Deja flotar una merienda cerca de la orilla. Cazan desde el agua.'),
      hard: c('A floating feed encourages a natural lunge from the water.', 'Una comida que flota invita a un avance natural desde el agua.'),
    },
    spots: [c('Water edge', 'Orilla'), c('Hot rock', 'Roca'), c('High branch', 'Rama')],
    correct: 0,
    hint: c('Look at the water edge. That is where crocodiles wait.', 'Mira la orilla. Ahí esperan los cocodrilos.'),
    found: {
      easy: c('The crocodile found the snack at the water.', 'El cocodrilo encontró la merienda en el agua.'),
      hard: c('Waiting at the edge is the hunt, more than chasing on land.', 'Esperar en la orilla es la caza, más que correr en tierra.'),
    },
  },
  health: {
    heart: {
      easy: c('Thump, thump. The crocodile has a strong, slow heart.', 'Tum, tum. El cocodrilo tiene un corazón fuerte y lento.'),
      hard: c('A crocodile can slow its heart even more when it dives.', 'Puede bajar aún más el ritmo del corazón cuando se sumerge.'),
    },
    teeth: {
      easy: c('Many teeth grab food. New teeth grow in when old ones fall out.', 'Muchos dientes sujetan la comida. Salen dientes nuevos cuando caen los viejos.'),
      hard: c('A crocodile can grow thousands of teeth over a long life, a few at a time.', 'A lo largo de la vida puede tener miles de dientes, unos pocos a la vez.'),
    },
    weight: {
      easy: c('A big crocodile can weigh as much as a small car.', 'Un cocodrilo grande puede pesar como un auto pequeño.'),
      hard: c('A large Nile crocodile can weigh about 400 to 700 kilograms.', 'Un cocodrilo del Nilo grande puede pesar entre 400 y 700 kilogramos.'),
    },
  },
  water: {
    easy: c('The pool has to be clean. A crocodile lives in its water.', 'El estanque tiene que estar limpio. El cocodrilo vive en su agua.'),
    hard: c('Keepers filter and change the water so the animal can see, swim, and stay well.', 'Los cuidadores filtran y cambian el agua para que pueda ver, nadar y estar bien.'),
  },
  habitat: { name: c('Nile River', 'Río Nilo'), x: 56, y: 46 },
  sound: {
    name: c('Bellow', 'Bramido'),
    say: c('A crocodile bellows.', 'Un cocodrilo brama.'),
    notes: [
      { at: 0, freq: 90, dur: 0.4, gain: 0.05, wave: 'sawtooth' },
      { at: 0.2, freq: 70, dur: 0.5, gain: 0.045, wave: 'triangle' },
    ],
  },
  sprite: null,
  playable: false,
  visible: true,
  unlock: { starter: false, areaStars: 12, after: ['chameleon'] },
};
