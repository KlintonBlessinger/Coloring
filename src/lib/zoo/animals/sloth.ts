import { c } from './copy';
import type { Animal } from './types';

export const sloth: Animal = {
  id: 'sloth',
  name: c('Sloth', 'Perezoso'),
  area: 'rainforest',
  diet: 'herbivore',
  foods: ['leaves'],
  foodYes: c('Yes. Sloths eat leaves. They are herbivores.', 'Sí. Los perezosos comen hojas. Son herbívoros.'),
  foodHint: c('Sloths eat leaves. They are herbivores. Try the leaves.', 'Los perezosos comen hojas. Son herbívoros. Prueba las hojas.'),
  facts: [
    {
      easy: c('Sloths move slowly, and that helps them hide.', 'Los perezosos se mueven despacio, y así se esconden.'),
      hard: c('A sloth may come down to the ground about once a week.', 'Un perezoso puede bajar al suelo más o menos una vez por semana.'),
    },
    {
      easy: c('Sloths hang upside down in the trees.', 'Los perezosos cuelgan boca abajo de los árboles.'),
      hard: c("Green algae can grow in a sloth's fur and help it blend into the leaves.", 'Unas algas verdes pueden crecer en el pelo y ayudar a camuflarse.'),
    },
  ],
  behaviors: [
    {
      id: 'slow',
      easy: c('The sloth barely moves. Slow is its way to stay safe.', 'El perezoso casi no se mueve. Ir despacio lo mantiene a salvo.'),
      hard: c('A slow metabolism matches a diet of tough leaves.', 'Un metabolismo lento va con una dieta de hojas duras.'),
    },
  ],
  enrichment: {
    prompt: {
      easy: c('Clip leaves where the sloth can reach without rushing.', 'Pon hojas donde el perezoso llegue sin apurarse.'),
      hard: c('A quiet browse, not a chase, matches sloth behavior.', 'Ramonear en calma, no una carrera, es lo propio del perezoso.'),
    },
    spots: [c('Leaf branch', 'Rama'), c('Open ground', 'Suelo'), c('Rock', 'Roca')],
    correct: 0,
    hint: c('Sloths stay in the branches. Try the leaf branch.', 'Los perezosos se quedan en las ramas. Prueba la rama.'),
    found: {
      easy: c('The sloth found the leaves. Slow and steady.', 'El perezoso encontró las hojas. Despacio y seguro.'),
      hard: c('Letting a sloth take its time is the right kind of care.', 'Dejar que el perezoso se tome su tiempo es cuidarlo bien.'),
    },
  },
  health: {
    heart: {
      easy: c('Thump... thump. A sloth heart beats slowly, and that is healthy.', 'Tum... tum. El corazón del perezoso late despacio, y así está sano.'),
      hard: c('A resting sloth can have a very slow heartbeat for a mammal its size.', 'En reposo, el corazón puede latir muy despacio para un mamífero de su tamaño.'),
    },
    teeth: {
      easy: c('Sloth teeth grow for life because leaves wear them down.', 'Los dientes crecen toda la vida porque las hojas los gastan.'),
      hard: c('They do not have true baby teeth the way people do. The molars keep growing.', 'No tienen dientes de leche como las personas. Las muelas siguen creciendo.'),
    },
    weight: {
      easy: c('A sloth weighs about as much as a small dog.', 'Un perezoso pesa casi como un perro pequeño.'),
      hard: c('A three-toed sloth often weighs about 4 to 5 kilograms.', 'Un perezoso de tres dedos suele pesar entre 4 y 5 kilogramos.'),
    },
  },
  water: {
    easy: c('Sloths get a lot of water from leaves, and a clean drink helps too.', 'Los perezosos sacan mucha agua de las hojas, y un trago limpio también ayuda.'),
    hard: c('They rarely climb down, so rain on the leaves is an important drink.', 'Casi no bajan, así que la lluvia en las hojas es una bebida importante.'),
  },
  habitat: { name: c('Amazon rainforest', 'Selva amazónica'), x: 33, y: 62 },
  sound: {
    name: c('Call', 'Llamado'),
    say: c('A sloth makes a soft call.', 'Un perezoso hace un llamado suave.'),
    notes: [
      { at: 0, freq: 520, dur: 0.25, gain: 0.03, wave: 'sine' },
      { at: 0.3, freq: 480, dur: 0.3, gain: 0.025, wave: 'sine' },
    ],
  },
  sprite: null,
  playable: false,
  visible: true,
  unlock: { starter: false, areaStars: 4, after: [] },
};
