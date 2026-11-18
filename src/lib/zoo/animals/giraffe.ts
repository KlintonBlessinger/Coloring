import { c } from './copy';
import type { Animal } from './types';

export const giraffe: Animal = {
  id: 'giraffe',
  name: c('Giraffe', 'Jirafa'),
  area: 'savannah',
  diet: 'herbivore',
  foods: ['leaves'],
  foodYes: c('Yes. Giraffes eat leaves. They are herbivores.', 'Sí. Las jirafas comen hojas. Son herbívoras.'),
  foodHint: c('Giraffes eat leaves from trees. They are herbivores. Try the leaves.', 'Las jirafas comen hojas de los árboles. Son herbívoras. Prueba las hojas.'),
  facts: [
    {
      easy: c('Giraffes eat leaves high up in the trees.', 'Las jirafas comen hojas en lo alto de los árboles.'),
      hard: c("A giraffe's tongue is about as long as a grown-up's forearm.", 'La lengua de una jirafa es casi tan larga como el antebrazo de una persona adulta.'),
    },
    {
      easy: c('No two giraffes have the same spots.', 'No hay dos jirafas con las mismas manchas.'),
      hard: c('Giraffes sleep only a little, in short naps, and they can doze standing up.', 'Las jirafas duermen poco, en siestas cortas, y pueden dormitar de pie.'),
    },
  ],
  behaviors: [
    {
      id: 'browse',
      easy: c('The giraffe reaches up. Eating high leaves is called browsing.', 'La jirafa se estira hacia arriba. Comer hojas altas se llama ramonear.'),
      hard: c('Browsing up high means giraffes rarely compete with grass eaters below.', 'Comer arriba hace que casi no compitan con los animales que comen pasto.'),
    },
  ],
  enrichment: {
    prompt: {
      easy: c('Hang a snack up high. Giraffes like leaves in tall trees.', 'Cuelga una merienda bien alto. A las jirafas les gustan las hojas altas.'),
      hard: c('A high feeder matches how a giraffe browses in the wild.', 'Un comedero alto imita cómo la jirafa ramonea en la naturaleza.'),
    },
    spots: [c('High branch', 'Rama alta'), c('Low bush', 'Arbusto bajo'), c('Rock', 'Roca')],
    correct: 0,
    hint: c('That spot is too low. Try the high branch.', 'Ese lugar está muy bajo. Prueba la rama alta.'),
    found: {
      easy: c('The giraffe found the leaves. This is browsing.', 'La jirafa encontró las hojas. Esto es ramonear.'),
      hard: c("A tall feeder keeps a giraffe's neck and tongue doing their real job.", 'Un comedero alto deja que el cuello y la lengua trabajen como en la vida real.'),
    },
  },
  health: {
    heart: {
      easy: c('Thump, thump. The giraffe has a strong heart for a long neck.', 'Tum, tum. La jirafa tiene un corazón fuerte para un cuello largo.'),
      hard: c('A giraffe has a very large heart, to pump blood all the way up the neck.', 'La jirafa tiene un corazón muy grande, para subir la sangre por el cuello.'),
    },
    teeth: {
      easy: c('Flat teeth help a giraffe grind leaves.', 'Los dientes planos ayudan a la jirafa a moler hojas.'),
      hard: c('Giraffes have a tough palate and a long tongue for thorny branches.', 'Las jirafas tienen el paladar duro y una lengua larga para las ramas con espinas.'),
    },
    weight: {
      easy: c('A giraffe is the tallest animal here. It could look into a high window.', 'La jirafa es el animal más alto de aquí. Podría mirar una ventana alta.'),
      hard: c('A tall giraffe can stand about 5 meters high, and weigh about 800 to 1,200 kilograms.', 'Una jirafa alta puede medir unos 5 metros y pesar entre 800 y 1.200 kilogramos.'),
    },
  },
  water: {
    easy: c('Giraffes drink fresh water too. The pool should be clean.', 'Las jirafas también beben agua fresca. El estanque debe estar limpio.'),
    hard: c('A giraffe spreads its front legs to reach down for a drink.', 'La jirafa abre las patas delanteras para llegar al agua.'),
  },
  habitat: { name: c('African savannah', 'Sabana africana'), x: 56, y: 48 },
  sound: {
    name: c('Hum', 'Zumbido'),
    say: c('A giraffe hums softly.', 'Una jirafa zumba bajito.'),
    notes: [
      { at: 0, freq: 140, dur: 0.7, gain: 0.03, wave: 'sine' },
      { at: 0.35, freq: 160, dur: 0.5, gain: 0.025, wave: 'sine' },
    ],
  },
  sprite: 'giraffe',
  playable: true,
  visible: true,
  unlock: { starter: true, areaStars: 0, after: [] },
};
