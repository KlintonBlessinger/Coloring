import { c } from './copy';
import type { Animal } from './types';

export const penguin: Animal = {
  id: 'penguin',
  name: c('Penguin', 'Pingüino'),
  area: 'aquarium',
  diet: 'carnivore',
  foods: ['fish'],
  foodYes: c('Yes. Penguins eat fish. They are carnivores.', 'Sí. Los pingüinos comen pescado. Son carnívoros.'),
  foodHint: c('Penguins eat fish. They are carnivores. Try the fish.', 'Los pingüinos comen pescado. Son carnívoros. Prueba el pescado.'),
  facts: [
    {
      easy: c('Penguins waddle on land and swim fast in the water.', 'Los pingüinos caminan torpes en tierra y nadan rápido en el agua.'),
      hard: c('Their wings are flippers. They fly through water, not through air.', 'Las alas son aletas. Vuelan en el agua, no en el aire.'),
    },
    {
      easy: c('A penguin coat is waterproof feathers over a warm layer.', 'El abrigo del pingüino son plumas impermeables sobre una capa tibia.'),
      hard: c('They oil their feathers to keep the cold water out.', 'Aceitan las plumas para que el agua fría no entre.'),
    },
  ],
  behaviors: [
    {
      id: 'swim',
      easy: c('The penguin dives. Water is where it hunts.', 'El pingüino se zambulle. En el agua es donde caza.'),
      hard: c('On land a penguin hops and waddles. Underwater it is quick and smooth.', 'En tierra salta y se balancea. Bajo el agua es rápido y suave.'),
    },
  ],
  enrichment: {
    prompt: {
      easy: c('Drop a fish toy in the water for the penguin to chase.', 'Suelta un pez de juguete en el agua para que el pingüino lo persiga.'),
      hard: c('Chasing food in the water matches how penguins hunt.', 'Perseguir comida en el agua es como cazan los pingüinos.'),
    },
    spots: [c('Water', 'Agua'), c('Rock', 'Roca'), c('Nest', 'Nido')],
    correct: 0,
    hint: c('Penguins hunt in the water. Try the water.', 'Los pingüinos cazan en el agua. Prueba el agua.'),
    found: {
      easy: c('The penguin caught the fish in the water.', 'El pingüino atrapó el pez en el agua.'),
      hard: c('Pursuit in the water is the natural hunt.', 'Perseguir en el agua es la caza natural.'),
    },
  },
  health: {
    heart: {
      easy: c('Thump, thump. The penguin has a strong heart for diving.', 'Tum, tum. El pingüino tiene un corazón fuerte para bucear.'),
      hard: c('Divers can slow the heart underwater to save oxygen.', 'Los buceadores pueden bajar el ritmo del corazón bajo el agua para ahorrar oxígeno.'),
    },
    teeth: {
      easy: c('Penguins have no teeth. Little spines in the mouth hold slippery fish.', 'No tienen dientes. Unas espinitas en la boca sujetan el pescado resbaloso.'),
      hard: c('The tongue and palate have backward-facing papillae that grip fish.', 'La lengua y el paladar tienen papilas hacia atrás que agarran el pescado.'),
    },
    weight: {
      easy: c('Penguins come in many sizes. A little penguin is about as heavy as a cat. An emperor is much bigger.', 'Hay pingüinos de muchos tamaños. Uno pequeño pesa casi como un gato. El emperador es mucho más grande.'),
      hard: c('An emperor penguin can weigh about 20 to 40 kilograms. Smaller kinds weigh just a kilogram or two.', 'Un pingüino emperador puede pesar entre 20 y 40 kilogramos. Los pequeños pesan uno o dos kilogramos.'),
    },
  },
  water: {
    easy: c('Penguins need cold, clean water deep enough to swim.', 'Los pingüinos necesitan agua fría y limpia, bastante profunda para nadar.'),
    hard: c('Filters keep fish oils from building up so the feathers stay waterproof.', 'Los filtros evitan que la grasa del pescado se acumule y las plumas sigan impermeables.'),
  },
  habitat: { name: c('Southern oceans', 'Océanos del sur'), x: 52, y: 86 },
  sound: {
    name: c('Honk', 'Graznido'),
    say: c('A penguin honks.', 'Un pingüino grazna.'),
    notes: [
      { at: 0, freq: 480, dur: 0.16, gain: 0.04, wave: 'triangle' },
      { at: 0.18, freq: 360, dur: 0.18, gain: 0.04, wave: 'sawtooth' },
    ],
  },
  sprite: null,
  playable: false,
  visible: true,
  unlock: { starter: false, areaStars: 4, after: [] },
};
