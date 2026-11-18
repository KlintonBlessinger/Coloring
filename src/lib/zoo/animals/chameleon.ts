import { c } from './copy';
import type { Animal } from './types';

export const chameleon: Animal = {
  id: 'chameleon',
  name: c('Chameleon', 'Camaleón'),
  area: 'reptile-house',
  diet: 'carnivore',
  foods: ['insects'],
  foodYes: c('Yes. Chameleons eat insects. Eating animals makes them carnivores.', 'Sí. Los camaleones comen insectos. Comer animales los hace carnívoros.'),
  foodHint: c('Chameleons eat insects. They are carnivores. Try the insects.', 'Los camaleones comen insectos. Son carnívoros. Prueba los insectos.'),
  facts: [
    {
      easy: c('A chameleon can change color. Color can help it hide or show how it feels.', 'Un camaleón puede cambiar de color. El color ayuda a esconderse o a mostrar cómo se siente.'),
      hard: c('Color is mostly a message and a way to manage heat, not a perfect copy of the background.', 'El color es sobre todo un mensaje y una forma de manejar el calor, no una copia perfecta del fondo.'),
    },
    {
      easy: c('Each eye can look in a different direction.', 'Cada ojo puede mirar hacia un lado distinto.'),
      hard: c('The eyes move on their own, then both aim when the tongue shoots.', 'Los ojos se mueven por separado y luego apuntan juntos cuando sale la lengua.'),
    },
  ],
  behaviors: [
    {
      id: 'color',
      easy: c('The chameleon shifts color as it rests. It is talking with color.', 'El camaleón cambia de color mientras descansa. Habla con el color.'),
      hard: c('A bright show can mean a claim on a branch. A darker tone can mean rest.', 'Un color vivo puede marcar una rama. Un tono oscuro puede ser descanso.'),
    },
  ],
  enrichment: {
    prompt: {
      easy: c('Set a branch where the chameleon can hunt a moving insect.', 'Pon una rama donde el camaleón pueda cazar un insecto que se mueve.'),
      hard: c('Moving prey triggers the tongue. A still bowl does not.', 'La presa que se mueve dispara la lengua. Un cuenco quieto no.'),
    },
    spots: [c('Branch', 'Rama'), c('Ground', 'Suelo'), c('Water dish', 'Agua')],
    correct: 0,
    hint: c('Chameleons hunt in the branches. Try the branch.', 'Los camaleones cazan en las ramas. Prueba la rama.'),
    found: {
      easy: c('The tongue found the insect. That is how chameleons hunt.', 'La lengua encontró el insecto. Así cazan los camaleones.'),
      hard: c('A tongue can be longer than the body, and it sticks to the insect.', 'La lengua puede ser más larga que el cuerpo y se pega al insecto.'),
    },
  },
  health: {
    heart: {
      easy: c('Thump, thump. The chameleon has a small, quiet heart.', 'Tum, tum. El camaleón tiene un corazón pequeño y silencioso.'),
      hard: c('A warm, calm chameleon keeps a steady beat. Cool air slows it down.', 'Si está tibio y tranquilo, el latido es parejo. El frío lo hace más lento.'),
    },
    teeth: {
      easy: c('Chameleons do not chew. The tongue brings the insect in whole.', 'Los camaleones no mastican. La lengua trae el insecto entero.'),
      hard: c('Tiny teeth help hold the insect before it is swallowed.', 'Unos dientes diminutos ayudan a sujetar el insecto antes de tragarlo.'),
    },
    weight: {
      easy: c('Many chameleons weigh less than a cup of water.', 'Muchos camaleones pesan menos que una taza de agua.'),
      hard: c('Weight is watched carefully. A thin tail can mean the animal needs more food.', 'El peso se mira con cuidado. Una cola delgada puede indicar que necesita más comida.'),
    },
  },
  water: {
    easy: c('Chameleons often drink droplets. A gentle mist is their water.', 'Los camaleones suelen beber gotas. Una llovizna suave es su agua.'),
    hard: c('In the wild they lick dew off leaves, so keepers mist the branches.', 'En la naturaleza lamen el rocío de las hojas, así que los cuidadores rocían las ramas.'),
  },
  habitat: { name: c('Madagascar forest', 'Bosque de Madagascar'), x: 62, y: 62 },
  sound: {
    name: c('Hiss', 'Soplido'),
    say: c('A chameleon is mostly quiet, with a tiny hiss.', 'Un camaleón es casi silencioso, con un soplido diminuto.'),
    notes: [{ at: 0, freq: 1800, dur: 0.12, gain: 0.015, wave: 'sine' }],
  },
  sprite: null,
  playable: false,
  visible: true,
  unlock: { starter: false, areaStars: 8, after: ['snake'] },
};
