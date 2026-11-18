import { c } from './copy';
import type { Animal } from './types';

export const flamingo: Animal = {
  id: 'flamingo',
  name: c('Flamingo', 'Flamenco'),
  area: 'birds',
  diet: 'omnivore',
  foods: ['leaves', 'insects'],
  foodYes: c('Yes. Flamingos eat tiny plants and tiny shrimp. Shrimp are little animals, like the insects on this tray. They are omnivores.', 'Sí. Los flamencos comen plantitas y camarones diminutos. Los camarones son animalitos, como los insectos de esta bandeja. Son omnívoros.'),
  foodHint: c('Not a big fish. Flamingos eat tiny plants and tiny shrimp. Try leaves or insects.', 'No es un pez grande. Los flamencos comen plantitas y camarones diminutos. Prueba las hojas o los insectos.'),
  facts: [
    {
      easy: c('Flamingos are pink because of the food they eat.', 'Los flamencos son rosados por la comida que comen.'),
      hard: c('Shrimp and algae hold pigments that settle in the feathers.', 'Los camarones y las algas tienen pigmentos que se quedan en las plumas.'),
    },
    {
      easy: c('A flamingo often rests on one leg.', 'Un flamenco suele descansar sobre una pata.'),
      hard: c('Standing on one leg may save heat and also saves a little energy.', 'Estar sobre una pata puede guardar calor y también un poco de energía.'),
    },
  ],
  behaviors: [
    {
      id: 'one-leg',
      easy: c('The flamingo stands on one leg. That is a resting pose.', 'El flamenco se para en una pata. Es una pose de descanso.'),
      hard: c('A flock resting on one leg is calm behavior, not an injury.', 'Una bandada en una pata es un descanso, no una herida.'),
    },
  ],
  enrichment: {
    prompt: {
      easy: c('Stir the shallow pool so the flamingo can sweep tiny food with its beak.', 'Mueve el agua baja para que el flamenco barra comida diminuta con el pico.'),
      hard: c('Filter feeding upside down in the bill is the real flamingo hunt.', 'Filtrar con el pico al revés es la búsqueda real del flamenco.'),
    },
    spots: [c('Shallow pool', 'Agua baja'), c('Dry sand', 'Arena'), c('High perch', 'Percha')],
    correct: 0,
    hint: c('Flamingos feed in shallow water. Try the pool.', 'Los flamencos comen en agua baja. Prueba el agua.'),
    found: {
      easy: c('The flamingo swept up its food.', 'El flamenco barrió su comida.'),
      hard: c('The beak works like a filter, pumping water and keeping the tiny bits.', 'El pico funciona como un filtro: mueve el agua y se queda con lo diminuto.'),
    },
  },
  health: {
    heart: {
      easy: c('Thump, thump. The flamingo has a healthy bird heart.', 'Tum, tum. El flamenco tiene un corazón de ave sano.'),
      hard: c('Long legs and a long neck do not change the need for a steady heartbeat.', 'Las patas y el cuello largos no cambian la necesidad de un latido parejo.'),
    },
    teeth: {
      easy: c('Flamingos have no teeth. The beak filters tiny food from the water.', 'No tienen dientes. El pico filtra comida diminuta del agua.'),
      hard: c('Lamellae inside the beak work like a comb.', 'Unas laminillas dentro del pico funcionan como un peine.'),
    },
    weight: {
      easy: c('A flamingo is tall and light, about as heavy as a house cat.', 'Un flamenco es alto y liviano, casi tan pesado como un gato de casa.'),
      hard: c('A greater flamingo often weighs about 2 to 4 kilograms.', 'Un flamenco común suele pesar entre 2 y 4 kilogramos.'),
    },
  },
  water: {
    easy: c('Flamingos need a shallow, clean pool for feeding and wading.', 'Los flamencos necesitan un estanque bajo y limpio para comer y caminar.'),
    hard: c('The water is part of the meal, so keepers change it before it gets murky.', 'El agua es parte de la comida, así que los cuidadores la cambian antes de que se enturbie.'),
  },
  habitat: { name: c('Shallow lakes', 'Lagos poco profundos'), x: 48, y: 58 },
  sound: {
    name: c('Honk', 'Graznido'),
    say: c('A flamingo honks.', 'Un flamenco grazna.'),
    notes: [
      { at: 0, freq: 520, dur: 0.14, gain: 0.04, wave: 'triangle' },
      { at: 0.16, freq: 640, dur: 0.12, gain: 0.035, wave: 'sine' },
    ],
  },
  sprite: null,
  playable: false,
  visible: true,
  unlock: { starter: false, areaStars: 4, after: [] },
};
