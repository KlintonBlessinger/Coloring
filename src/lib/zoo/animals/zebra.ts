import { c } from './copy';
import type { Animal } from './types';

export const zebra: Animal = {
  id: 'zebra',
  name: c('Zebra', 'Cebra'),
  area: 'savannah',
  diet: 'herbivore',
  foods: ['leaves'],
  foodYes: c('Yes. Zebras eat grass. Grass is a plant, like leaves. They are herbivores.', 'Sí. Las cebras comen pasto. El pasto es una planta, como las hojas. Son herbívoras.'),
  foodHint: c('Zebras eat grass. Grass is a plant. Try the leaves.', 'Las cebras comen pasto. El pasto es una planta. Prueba las hojas.'),
  facts: [
    {
      easy: c('Every zebra has its own stripe pattern.', 'Cada cebra tiene su propio diseño de rayas.'),
      hard: c('Stripes may help zebras confuse biting flies and stay with the herd.', 'Las rayas pueden confundir a las moscas y ayudar a la cebra a seguir a la manada.'),
    },
    {
      easy: c('Zebras stay close together in a herd.', 'Las cebras se quedan juntas en una manada.'),
      hard: c("A zebra's stripes are like a fingerprint. No two are the same.", 'Las rayas de una cebra son como una huella. No hay dos iguales.'),
    },
  ],
  behaviors: [
    {
      id: 'herd',
      easy: c('The zebra stands with the herd. Together they watch for danger.', 'La cebra se queda con la manada. Juntas vigilan el peligro.'),
      hard: c('Herds mix looking up and grazing, so someone is always watching.', 'En la manada unas miran y otras pastan, así siempre hay quien vigila.'),
    },
  ],
  enrichment: {
    prompt: {
      easy: c('Scatter grass for the zebra to find. Zebras graze with their herd.', 'Esparce pasto para que la cebra lo encuentre. Las cebras pastan en manada.'),
      hard: c('A scatter of hay lets a zebra graze the way it would on the savannah.', 'Un poco de heno esparcido deja que la cebra paste como en la sabana.'),
    },
    spots: [c('Grass patch', 'Pasto'), c('Rock', 'Roca'), c('Tree', 'Árbol')],
    correct: 0,
    hint: c('Zebras look down in the grass. Try the grass patch.', 'Las cebras miran el pasto. Prueba el pasto.'),
    found: {
      easy: c('The zebra found the grass. Grazing is how zebras eat.', 'La cebra encontró el pasto. Pastar es como comen las cebras.'),
      hard: c('Grazing most of the day is normal zebra behavior.', 'Pastar casi todo el día es normal para una cebra.'),
    },
  },
  health: {
    heart: {
      easy: c('Thump, thump. The zebra has a steady heart.', 'Tum, tum. La cebra tiene un corazón parejo.'),
      hard: c('A calm zebra has a steady heartbeat after it grazes.', 'Una cebra tranquila tiene el corazón parejo después de pastar.'),
    },
    teeth: {
      easy: c('Zebra teeth grind grass all day.', 'Los dientes de la cebra muelen pasto todo el día.'),
      hard: c('Zebra teeth wear down from grit in the grass, and they keep growing for a while.', 'Los dientes se desgastan con la tierra del pasto y siguen creciendo un tiempo.'),
    },
    weight: {
      easy: c('A zebra is about the size of a horse.', 'Una cebra es más o menos del tamaño de un caballo.'),
      hard: c('A plains zebra often weighs about 200 to 350 kilograms.', 'Una cebra de llanura suele pesar entre 200 y 350 kilogramos.'),
    },
  },
  water: {
    easy: c('Zebras drink clean water with the herd.', 'Las cebras beben agua limpia con la manada.'),
    hard: c('Herds often walk to water together, then graze nearby.', 'Las manadas suelen ir juntas al agua y luego pastan cerca.'),
  },
  habitat: { name: c('African savannah', 'Sabana africana'), x: 53, y: 58 },
  sound: {
    name: c('Bark', 'Ladrido'),
    say: c('A zebra barks.', 'Una cebra ladra.'),
    notes: [
      { at: 0, freq: 420, dur: 0.12, gain: 0.05, wave: 'triangle' },
      { at: 0.18, freq: 380, dur: 0.14, gain: 0.05, wave: 'triangle' },
      { at: 0.36, freq: 340, dur: 0.16, gain: 0.04, wave: 'sine' },
    ],
  },
  sprite: 'zebra',
  playable: false,
  visible: true,
  unlock: { starter: false, areaStars: 4, after: [] },
};
