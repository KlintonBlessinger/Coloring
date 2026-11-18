import { c } from './copy';
import type { Animal } from './types';

export const snake: Animal = {
  id: 'snake',
  name: c('Snake', 'Serpiente'),
  area: 'reptile-house',
  diet: 'carnivore',
  foods: ['meat'],
  foodYes: c('Yes. Snakes eat other animals. They are carnivores.', 'Sí. Las serpientes comen otros animales. Son carnívoras.'),
  foodHint: c('Snakes eat meat. They are carnivores. Try the meat.', 'Las serpientes comen carne. Son carnívoras. Prueba la carne.'),
  facts: [
    {
      easy: c('A snake smells with its tongue.', 'Una serpiente huele con la lengua.'),
      hard: c('The tongue carries scents to a special organ in the roof of the mouth.', 'La lengua lleva los olores a un órgano especial en el techo de la boca.'),
    },
    {
      easy: c('Snakes have no legs. Strong muscles do the walking.', 'Las serpientes no tienen patas. Los músculos fuertes las hacen avanzar.'),
      hard: c('Belly scales grip the ground so the body can push forward.', 'Las escamas del vientre se agarran al suelo para empujar el cuerpo.'),
    },
  ],
  behaviors: [
    {
      id: 'tongue',
      easy: c('The snake flicks its tongue. It is smelling the room.', 'La serpiente saca la lengua. Está oliendo el lugar.'),
      hard: c('A busy tongue means the snake is gathering scent, not feeling scared.', 'Una lengua activa junta olores. No significa que tenga miedo.'),
    },
  ],
  enrichment: {
    prompt: {
      easy: c('Leave a scent trail for the snake to follow with its tongue.', 'Deja un rastro para que la serpiente lo siga con la lengua.'),
      hard: c('Scent trails encourage natural tongue-flicking and exploring.', 'Los rastros animan el movimiento de la lengua y la exploración.'),
    },
    spots: [c('Warm hide', 'Escondite'), c('Open floor', 'Suelo'), c('Water', 'Agua')],
    correct: 0,
    hint: c('Snakes like a cozy hide. Try the warm hide.', 'A las serpientes les gusta un escondite. Prueba el escondite.'),
    found: {
      easy: c('The snake followed the trail to the hide.', 'La serpiente siguió el rastro hasta el escondite.'),
      hard: c('Exploring by scent is healthier than staying in one corner.', 'Explorar con el olfato es mejor que quedarse en un rincón.'),
    },
  },
  health: {
    heart: {
      easy: c('Thump, thump. The snake has a quiet, steady heart.', 'Tum, tum. La serpiente tiene un corazón silencioso y parejo.'),
      hard: c('A snake heart sits farther forward in the body than you might guess.', 'El corazón está más adelante en el cuerpo de lo que parece.'),
    },
    teeth: {
      easy: c('Small teeth point backward to hold food. This snake is calm and cared for.', 'Los dientes pequeños apuntan atrás para sujetar la comida. Esta serpiente está tranquila y cuidada.'),
      hard: c('Most snakes swallow food whole. The teeth hold, they do not chew.', 'Casi todas tragan la comida entera. Los dientes sujetan, no mastican.'),
    },
    weight: {
      easy: c('Snakes come in many sizes. This one is a steady, healthy weight for its kind.', 'Hay serpientes de muchos tamaños. Esta tiene un peso sano para su especie.'),
      hard: c('Keepers track weight over time. A slow change tells more than one number.', 'Los cuidadores miran el peso con el tiempo. Un cambio lento dice más que un solo número.'),
    },
  },
  water: {
    easy: c('A clean water bowl is big enough for a drink and a soak.', 'Un cuenco limpio alcanza para beber y remojarse.'),
    hard: c('Many snakes soak before a shed. Fresh water helps that.', 'Muchas se remojan antes de mudar la piel. El agua fresca ayuda.'),
  },
  habitat: { name: c('Warm grasslands', 'Pastizales cálidos'), x: 52, y: 48 },
  sound: {
    name: c('Hiss', 'Siseo'),
    say: c('A snake hisses softly.', 'Una serpiente sisea bajito.'),
    notes: [{ at: 0, freq: 2400, dur: 0.28, gain: 0.02, wave: 'sawtooth' }],
  },
  sprite: null,
  playable: false,
  visible: true,
  unlock: { starter: false, areaStars: 4, after: [] },
};
