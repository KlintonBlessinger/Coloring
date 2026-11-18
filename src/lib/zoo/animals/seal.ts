import { c } from './copy';
import type { Animal } from './types';

export const seal: Animal = {
  id: 'seal',
  name: c('Seal', 'Foca'),
  area: 'arctic',
  diet: 'carnivore',
  foods: ['fish'],
  foodYes: c('Yes. Seals eat fish. They are carnivores.', 'Sí. Las focas comen pescado. Son carnívoras.'),
  foodHint: c('Seals eat fish. They are carnivores. Try the fish.', 'Las focas comen pescado. Son carnívoras. Prueba el pescado.'),
  facts: [
    {
      easy: c('Seals are clumsy on land and swift in the water.', 'Las focas son torpes en tierra y rápidas en el agua.'),
      hard: c('Rear flippers push them on shore. In the water the whole body becomes a swimmer.', 'Las aletas traseras las empujan en la orilla. En el agua todo el cuerpo nada.'),
    },
    {
      easy: c('A thick layer of fat, called blubber, keeps a seal warm.', 'Una capa gruesa de grasa mantiene a la foca caliente.'),
      hard: c('Blubber is insulation and also an energy store between meals.', 'La grasa aísla del frío y también guarda energía entre comidas.'),
    },
  ],
  behaviors: [
    {
      id: 'slide',
      easy: c('The seal slides on the ice, then slips into the water to hunt.', 'La foca se desliza en el hielo y luego entra al agua para cazar.'),
      hard: c('Hauling out to rest, then diving for fish, is the daily rhythm.', 'Salir a descansar y luego bucear por peces es el ritmo del día.'),
    },
  ],
  enrichment: {
    prompt: {
      easy: c('Drop fish into the water so the seal can dive for them.', 'Suelta pescado en el agua para que la foca bucee por él.'),
      hard: c('Scatter feeds underwater encourage natural diving.', 'Repartir comida bajo el agua anima el buceo natural.'),
    },
    spots: [c('Water', 'Agua'), c('Ice', 'Hielo'), c('Rock', 'Roca')],
    correct: 0,
    hint: c('Seals hunt in the water. Try the water.', 'Las focas cazan en el agua. Prueba el agua.'),
    found: {
      easy: c('The seal found the fish underwater.', 'La foca encontró el pescado bajo el agua.'),
      hard: c('Diving for food is the behavior this pool is built for.', 'Bucear por comida es el comportamiento para el que está el estanque.'),
    },
  },
  health: {
    heart: {
      easy: c('Thump, thump. The seal has a strong diving heart.', 'Tum, tum. La foca tiene un corazón fuerte para bucear.'),
      hard: c('During a dive the heart slows, and blood goes first to the brain and heart.', 'Durante un buceo el corazón se hace más lento y la sangre va primero al cerebro y al corazón.'),
    },
    teeth: {
      easy: c('Pointy teeth grab slippery fish.', 'Los dientes puntiagudos sujetan el pescado resbaloso.'),
      hard: c('Seals do not chew much. They grip a fish and swallow it.', 'Casi no mastican. Sujetan el pescado y lo tragan.'),
    },
    weight: {
      easy: c('A seal is bigger than it looks in the water. Blubber adds weight.', 'Una foca es más grande de lo que parece en el agua. La grasa suma peso.'),
      hard: c('A harbor seal often weighs about 60 to 170 kilograms. Bigger seals weigh much more.', 'Una foca común suele pesar entre 60 y 170 kilogramos. Otras focas pesan mucho más.'),
    },
  },
  water: {
    easy: c('Seals need cold, clean salt water and a dry place to rest.', 'Las focas necesitan agua salada fría y limpia, y un lugar seco para descansar.'),
    hard: c('The haul-out ledge lets the coat dry, which keeps the skin healthy.', 'La plataforma para salir deja secar el pelo, y eso cuida la piel.'),
  },
  habitat: { name: c('Arctic coasts', 'Costas del Ártico'), x: 70, y: 18 },
  sound: {
    name: c('Bark', 'Ladrido'),
    say: c('A seal barks.', 'Una foca ladra.'),
    notes: [
      { at: 0, freq: 320, dur: 0.12, gain: 0.04, wave: 'triangle' },
      { at: 0.16, freq: 280, dur: 0.14, gain: 0.04, wave: 'sine' },
    ],
  },
  sprite: null,
  playable: false,
  visible: true,
  unlock: { starter: false, areaStars: 4, after: [] },
};
