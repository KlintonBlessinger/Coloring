import { c } from './copy';
import type { Animal } from './types';

export const lion: Animal = {
  id: 'lion',
  name: c('Lion', 'León'),
  area: 'savannah',
  diet: 'carnivore',
  foods: ['meat'],
  foodYes: c('Yes. Lions eat meat. They are carnivores.', 'Sí. Los leones comen carne. Son carnívoros.'),
  foodHint: c('Lions eat meat. They are carnivores. Try the meat.', 'Los leones comen carne. Son carnívoros. Prueba la carne.'),
  facts: [
    {
      easy: c('Lions live together in a family called a pride.', 'Los leones viven juntos en una familia llamada manada.'),
      hard: c('Lionesses do most of the hunting, and they hunt as a team.', 'Las leonas cazan casi siempre, y cazan en equipo.'),
    },
    {
      easy: c("A lion's roar is loud enough to cross the grass.", 'El rugido del león es tan fuerte que cruza la hierba.'),
      hard: c("A lion's roar can travel about eight kilometers.", 'El rugido de un león puede viajar unos ocho kilómetros.'),
    },
  ],
  behaviors: [
    {
      id: 'stalk',
      easy: c('The lion walks low in the grass. That is how lions practice hunting.', 'El león camina bajo entre la hierba. Así practican la caza.'),
      hard: c('Lions stalk before a short rush. They are sprinters, not long runners.', 'Los leones acechan y luego corren un trecho corto. No son corredores de fondo.'),
    },
  ],
  enrichment: {
    prompt: {
      easy: c('Hide a treat in the tall grass. Lions sneak before they pounce.', 'Esconde una golosina en la hierba alta. Los leones se acercan despacio.'),
      hard: c('A hidden treat lets the lion practice stalking, the way it hunts.', 'Una golosina escondida ayuda al león a practicar el acecho.'),
    },
    spots: [c('Tall grass', 'Hierba alta'), c('Rock', 'Roca'), c('Log', 'Tronco')],
    correct: 0,
    hint: c('Keep looking. Try the tall grass.', 'Sigue buscando. Prueba la hierba alta.'),
    found: {
      easy: c('The lion found it. Tall grass is a hunting place.', 'El león la encontró. La hierba alta es un lugar de caza.'),
      hard: c('Stalking through cover is how a pride gets close to a meal.', 'Acechar entre la cobertura es como la manada se acerca a la comida.'),
    },
  },
  health: {
    heart: {
      easy: c('Thump, thump. The lion has a strong, calm heart.', 'Tum, tum. El león tiene un corazón fuerte y tranquilo.'),
      hard: c('A resting lion breathes slowly, and the heartbeat stays steady.', 'Un león en reposo respira despacio y el corazón sigue parejo.'),
    },
    teeth: {
      easy: c('Long canine teeth help a lion eat meat.', 'Los colmillos largos ayudan al león a comer carne.'),
      hard: c('Those canine teeth hold prey. The back teeth shear meat.', 'Esos colmillos sujetan la presa. Las muelas cortan la carne.'),
    },
    weight: {
      easy: c('A lion can weigh about as much as a motorcycle.', 'Un león puede pesar casi como una moto.'),
      hard: c('A male lion often weighs about 150 to 250 kilograms.', 'Un león macho suele pesar entre 150 y 250 kilogramos.'),
    },
  },
  water: {
    easy: c('Fresh water is part of lion care. Scoop, sweep, and refill.', 'El agua fresca es parte del cuidado del león. Saca, barre y llena.'),
    hard: c('Lions drink often and rest near water when the grass is dry.', 'Los leones beben a menudo y descansan cerca del agua cuando la hierba está seca.'),
  },
  habitat: { name: c('African savannah', 'Sabana africana'), x: 54, y: 52 },
  sound: {
    name: c('Roar', 'Rugido'),
    say: c('A lion roars.', 'Un león ruge.'),
    notes: [
      { at: 0, freq: 170, dur: 0.4, gain: 0.05, wave: 'triangle' },
      { at: 0.1, freq: 105, dur: 0.65, gain: 0.06, wave: 'sine' },
      { at: 0.28, freq: 78, dur: 0.5, gain: 0.04, wave: 'sine' },
    ],
  },
  sprite: 'lion',
  playable: true,
  visible: true,
  unlock: { starter: true, areaStars: 0, after: [] },
};
