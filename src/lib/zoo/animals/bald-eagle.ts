import { c } from './copy';
import type { Animal } from './types';

export const baldEagle: Animal = {
  id: 'bald-eagle',
  name: c('Bald eagle', 'Águila calva'),
  area: 'birds',
  diet: 'carnivore',
  foods: ['fish', 'meat'],
  foodYes: c('Yes. Bald eagles eat fish and meat. They are carnivores.', 'Sí. Las águilas calvas comen pescado y carne. Son carnívoras.'),
  foodHint: c('Bald eagles eat fish and meat. Try fish or meat.', 'Las águilas calvas comen pescado y carne. Prueba el pescado o la carne.'),
  facts: [
    {
      easy: c('A bald eagle is not bald. The white head feathers make it look that way.', 'El águila calva no es calva. Las plumas blancas de la cabeza la hacen ver así.'),
      hard: c('Young eagles are mostly brown. The white head and tail come in after about four or five years.', 'Las águilas jóvenes son casi todas pardas. La cabeza y la cola blancas llegan después de unos cuatro o cinco años.'),
    },
    {
      easy: c('Eagles see very well and hunt from high in the sky.', 'Las águilas ven muy bien y cazan desde lo alto del cielo.'),
      hard: c('Fish is the main food. They also take other animals and sometimes eat carrion.', 'El pescado es la comida principal. También toman otros animales y a veces comen carroña.'),
    },
  ],
  behaviors: [
    {
      id: 'soar',
      easy: c('The eagle watches from a high perch. Sharp eyes find fish below.', 'El águila mira desde una percha alta. Los ojos agudos encuentran peces abajo.'),
      hard: c('Soaring on wide wings saves energy while the eagle searches.', 'Planear con las alas abiertas ahorra energía mientras busca.'),
    },
  ],
  enrichment: {
    prompt: {
      easy: c('Set the fish where the eagle can spot it from the perch.', 'Pon el pescado donde el águila lo vea desde la percha.'),
      hard: c('A high perch and a visible meal match how eagles hunt.', 'Una percha alta y una comida visible imitan cómo cazan.'),
    },
    spots: [c('High perch', 'Percha'), c('Ground', 'Suelo'), c('Nest bowl', 'Nido')],
    correct: 0,
    hint: c('Eagles look down from up high. Try the high perch.', 'Las águilas miran desde arriba. Prueba la percha.'),
    found: {
      easy: c('The eagle spotted the fish from above.', 'El águila vio el pescado desde arriba.'),
      hard: c('Hunting from a perch is a real bald eagle behavior.', 'Cazar desde una percha es un comportamiento real del águila calva.'),
    },
  },
  health: {
    heart: {
      easy: c('Thump, thump. The eagle has a strong flight heart.', 'Tum, tum. El águila tiene un corazón fuerte para volar.'),
      hard: c('A soaring bird keeps a steady beat while the wings do most of the work.', 'Un ave que planea mantiene un latido parejo mientras las alas hacen el trabajo.'),
    },
    teeth: {
      easy: c('Eagles have no teeth. A hooked beak tears fish.', 'Las águilas no tienen dientes. Un pico ganchudo desgarra el pescado.'),
      hard: c('Strong feet grab the fish first. The beak does the tearing after that.', 'Las patas fuertes agarran el pescado primero. El pico desgarra después.'),
    },
    weight: {
      easy: c('A bald eagle weighs about as much as a house cat, with a much wider wingspan.', 'Un águila calva pesa casi como un gato de casa, con las alas mucho más anchas.'),
      hard: c('Adults often weigh about 3 to 6 kilograms. Females are usually larger than males.', 'Los adultos suelen pesar entre 3 y 6 kilogramos. Las hembras suelen ser más grandes que los machos.'),
    },
  },
  water: {
    easy: c('A clean bath and a drink belong near the perch.', 'Un baño limpio y agua para beber van cerca de la percha.'),
    hard: c('Bathing keeps the flight feathers in shape for soaring.', 'Bañarse mantiene las plumas de vuelo listas para planear.'),
  },
  habitat: { name: c('North American lakes', 'Lagos de América del Norte'), x: 20, y: 30 },
  sound: {
    name: c('Call', 'Grito'),
    say: c('A bald eagle calls.', 'Un águila calva grita.'),
    notes: [
      { at: 0, freq: 1400, dur: 0.1, gain: 0.03, wave: 'triangle' },
      { at: 0.12, freq: 1600, dur: 0.1, gain: 0.028, wave: 'sine' },
      { at: 0.24, freq: 1200, dur: 0.12, gain: 0.025, wave: 'triangle' },
    ],
  },
  sprite: null,
  playable: false,
  visible: true,
  unlock: { starter: false, areaStars: 12, after: ['parrot'] },
};
