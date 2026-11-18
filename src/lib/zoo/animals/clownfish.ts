import { c } from './copy';
import type { Animal } from './types';

export const clownfish: Animal = {
  id: 'clownfish',
  name: c('Clownfish', 'Pez payaso'),
  area: 'aquarium',
  diet: 'omnivore',
  foods: ['leaves', 'insects'],
  foodYes: c('Yes. Clownfish eat tiny plants and tiny animals. They are omnivores.', 'Sí. El pez payaso come plantitas y animalitos. Es omnívoro.'),
  foodHint: c('Clownfish eat tiny plants and tiny animals. Try leaves or insects.', 'El pez payaso come plantitas y animalitos. Prueba las hojas o los insectos.'),
  facts: [
    {
      easy: c('A clownfish lives in a sea anemone. The anemone is its home.', 'El pez payaso vive en una anémona. La anémona es su casa.'),
      hard: c('A coat of mucus lets the clownfish rest in the stinging tentacles without getting hurt.', 'Una capa de mucus le permite descansar entre los tentáculos que pican sin lastimarse.'),
    },
    {
      easy: c('Clownfish stay close to their anemone and dart back in a flash.', 'El pez payaso se queda cerca de su anémona y vuelve de un salto.'),
      hard: c('The fish may bring scraps that feed the anemone, and the anemone offers a hiding place.', 'El pez puede traer restos que alimentan a la anémona, y la anémona le da un escondite.'),
    },
  ],
  behaviors: [
    {
      id: 'home',
      easy: c('The clownfish darts into the anemone. That is home base.', 'El pez payaso se mete en la anémona. Esa es su base.'),
      hard: c('Staying with one anemone is the daily pattern, not roaming the whole reef.', 'Quedarse con una anémona es el ritmo del día, no recorrer todo el arrecife.'),
    },
  ],
  enrichment: {
    prompt: {
      easy: c('Tuck a tiny snack by the anemone, where the clownfish feels at home.', 'Pon una merienda diminuta junto a la anémona, donde el pez se siente en casa.'),
      hard: c('Feeding at the anemone keeps the fish using its real shelter.', 'Alimentar junto a la anémona hace que el pez use su refugio real.'),
    },
    spots: [c('Anemone', 'Anémona'), c('Open sand', 'Arena'), c('Glass', 'Vidrio')],
    correct: 0,
    hint: c('Look by the anemone. That is the clownfish home.', 'Mira junto a la anémona. Esa es su casa.'),
    found: {
      easy: c('The clownfish found the snack at home.', 'El pez payaso encontró la merienda en casa.'),
      hard: c('Home-base foraging is the natural clownfish pattern.', 'Buscar comida desde su base es el patrón natural.'),
    },
  },
  health: {
    heart: {
      easy: c('Thump, thump. A tiny fish has a very quick heart.', 'Tum, tum. Un pez diminuto tiene un corazón muy rápido.'),
      hard: c('Small fish hearts beat fast. That is healthy for their size.', 'El corazón de un pez pequeño late rápido. Es sano para su tamaño.'),
    },
    teeth: {
      easy: c('A small mouth nibbles tiny plants and tiny animals.', 'Una boca pequeña mordisquea plantitas y animalitos.'),
      hard: c('Clownfish pick plankton, algae, and leftovers around the anemone.', 'Picotean plancton, algas y restos alrededor de la anémona.'),
    },
    weight: {
      easy: c('A clownfish is small, about as long as a grown-up finger.', 'El pez payaso es pequeño, más o menos del largo de un dedo de una persona adulta.'),
      hard: c('Many clownfish are about 8 to 12 centimeters long.', 'Muchos peces payaso miden entre 8 y 12 centímetros.'),
    },
  },
  water: {
    easy: c('The reef tank stays warm, salty, and very clean.', 'El tanque del arrecife se mantiene tibio, salado y muy limpio.'),
    hard: c('Anemones need stable water. A sudden change is hard on them and the fish.', 'Las anémonas necesitan agua estable. Un cambio brusco les cuesta, y también al pez.'),
  },
  habitat: { name: c('Indo-Pacific reefs', 'Arrecifes del Indo-Pacífico'), x: 80, y: 56 },
  sound: {
    name: c('Pop', 'Chasquido'),
    say: c('A clownfish makes a tiny pop.', 'El pez payaso hace un chasquido diminuto.'),
    notes: [
      { at: 0, freq: 900, dur: 0.04, gain: 0.03, wave: 'triangle' },
      { at: 0.12, freq: 700, dur: 0.05, gain: 0.025, wave: 'triangle' },
    ],
  },
  sprite: null,
  playable: false,
  visible: true,
  unlock: { starter: false, areaStars: 12, after: ['shark'] },
};
