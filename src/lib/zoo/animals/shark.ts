import { c } from './copy';
import type { Animal } from './types';

export const shark: Animal = {
  id: 'shark',
  name: c('Shark', 'Tiburón'),
  area: 'aquarium',
  diet: 'carnivore',
  foods: ['fish', 'meat'],
  foodYes: c('Yes. Sharks eat other animals. Fish is a favorite. They are carnivores.', 'Sí. Los tiburones comen otros animales. El pescado es un favorito. Son carnívoros.'),
  foodHint: c('Sharks eat fish and meat. They are carnivores. Try fish or meat.', 'Los tiburones comen pescado y carne. Son carnívoros. Prueba el pescado o la carne.'),
  facts: [
    {
      easy: c('A shark skeleton is cartilage, the same stuff as the tip of your nose.', 'El esqueleto del tiburón es cartílago, lo mismo que la punta de tu nariz.'),
      hard: c('Cartilage is lighter than bone, which helps a shark stay buoyant.', 'El cartílago es más liviano que el hueso y ayuda a flotar.'),
    },
    {
      easy: c('Many sharks must keep swimming so water moves over their gills.', 'Muchos tiburones tienen que seguir nadando para que el agua pase por las branquias.'),
      hard: c('That is called ram ventilation. Some other sharks can pump water while they rest.', 'Se llama ventilación por empuje. Otros tiburones pueden bombear agua mientras descansan.'),
    },
  ],
  behaviors: [
    {
      id: 'swim',
      easy: c('The shark keeps a smooth swim. The water is its air.', 'El tiburón nada suave y seguido. El agua es su aire.'),
      hard: c('A steady cruise lets water flow across the gills so the shark can breathe.', 'Un nado constante hace pasar el agua por las branquias para respirar.'),
    },
  ],
  enrichment: {
    prompt: {
      easy: c('Offer the meal on a gentle swim-by, so the shark hunts a little.', 'Ofrece la comida en un paseo suave, para que el tiburón cace un poco.'),
      hard: c('Target feeding on the move is calmer and closer to a natural hunt.', 'Alimentar en movimiento es más tranquilo y más parecido a la caza real.'),
    },
    spots: [c('Open water', 'Agua'), c('Sand', 'Arena'), c('Coral', 'Coral')],
    correct: 0,
    hint: c('The shark is in the open water. Try there.', 'El tiburón está en el agua abierta. Prueba ahí.'),
    found: {
      easy: c('The shark took the fish while swimming.', 'El tiburón tomó el pescado mientras nadaba.'),
      hard: c('Feeding on the move matches ram-ventilating sharks.', 'Comer en movimiento va con los tiburones que respiran nadando.'),
    },
  },
  health: {
    heart: {
      easy: c('Thump, thump. The shark has a steady swimming heart.', 'Tum, tum. El tiburón tiene un corazón parejo para nadar.'),
      hard: c('Fish hearts move blood in a single loop, out to the gills and then the body.', 'El corazón de un pez manda la sangre en un solo circuito, a las branquias y luego al cuerpo.'),
    },
    teeth: {
      easy: c('Shark teeth grow in rows. When one falls out, another moves up.', 'Los dientes crecen en hileras. Si uno se cae, otro avanza.'),
      hard: c('A shark may use thousands of teeth in a lifetime.', 'Un tiburón puede usar miles de dientes en su vida.'),
    },
    weight: {
      easy: c('Sharks come in many sizes, from small reef sharks to giants.', 'Hay tiburones de muchos tamaños, desde los del arrecife hasta los gigantes.'),
      hard: c('Keepers learn one animal at a time. A reef shark is much lighter than a great white.', 'Los cuidadores conocen a cada animal. Un tiburón de arrecife pesa mucho menos que un tiburón blanco.'),
    },
  },
  water: {
    easy: c('Sharks need clean, moving salt water with plenty of oxygen.', 'Los tiburones necesitan agua salada limpia, en movimiento y con oxígeno.'),
    hard: c('The life-support system checks salt, temperature, and oxygen every day.', 'El sistema revisa cada día la sal, la temperatura y el oxígeno.'),
  },
  habitat: { name: c('Open ocean', 'Mar abierto'), x: 78, y: 48 },
  sound: {
    name: c('Quiet', 'Silencio'),
    say: c('Sharks are quiet. This is the sound of water moving.', 'Los tiburones son silenciosos. Esto es el sonido del agua.'),
    notes: [
      { at: 0, freq: 160, dur: 0.4, gain: 0.02, wave: 'sine' },
      { at: 0.15, freq: 220, dur: 0.25, gain: 0.015, wave: 'triangle' },
    ],
  },
  sprite: null,
  playable: false,
  visible: true,
  unlock: { starter: false, areaStars: 8, after: ['penguin'] },
};
