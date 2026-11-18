import { c } from './copy';
import type { Animal } from './types';

export const owl: Animal = {
  id: 'owl',
  name: c('Owl', 'Búho'),
  area: 'birds',
  diet: 'carnivore',
  foods: ['meat'],
  foodYes: c('Yes. Owls eat meat, such as mice. They are carnivores.', 'Sí. Los búhos comen carne, como ratones. Son carnívoros.'),
  foodHint: c('Owls eat meat. They are carnivores. Try the meat.', 'Los búhos comen carne. Son carnívoros. Prueba la carne.'),
  facts: [
    {
      easy: c('Why is the owl sleeping? It is nocturnal. Owls rest in the day and fly at night.', '¿Por qué duerme el búho? Es nocturno. Descansa de día y vuela de noche.'),
      hard: c('Nocturnal means active at night. Soft feathers let an owl fly quietly while it hunts.', 'Nocturno significa activo de noche. Las plumas suaves le dejan volar en silencio mientras caza.'),
    },
    {
      easy: c('An owl can turn its head a long way because its eyes do not move like ours.', 'Un búho puede girar mucho la cabeza porque sus ojos no se mueven como los nuestros.'),
      hard: c('The eyes are tubes fixed in the skull, so the neck does the looking.', 'Los ojos son tubos fijos en el cráneo, así que el cuello es el que mira.'),
    },
  ],
  behaviors: [
    {
      id: 'nocturnal',
      easy: c('Why is the owl sleeping? It is nocturnal. Owls hunt at night and rest by day.', '¿Por qué duerme el búho? Es nocturno. Caza de noche y descansa de día.'),
      hard: c('A daytime nap is healthy owl behavior, not a sign that something is wrong.', 'Una siesta de día es un comportamiento sano, no una señal de que algo va mal.'),
    },
  ],
  enrichment: {
    prompt: {
      easy: c('The owl is nocturnal, so the treat goes in a dim perch for a night hunt.', 'El búho es nocturno, así que la golosina va en una percha oscura, como una caza de noche.'),
      hard: c('A dusk feeding matches the nocturnal hunt. Bright midday play does not.', 'Alimentar al anochecer imita la caza nocturna. El juego del mediodía no.'),
    },
    spots: [c('Dim perch', 'Percha'), c('Sunny floor', 'Suelo'), c('Water', 'Agua')],
    correct: 0,
    hint: c('Owls hunt from a perch. Try the dim perch.', 'Los búhos cazan desde una percha. Prueba la percha.'),
    found: {
      easy: c('The owl found it. Night is hunting time because owls are nocturnal.', 'El búho lo encontró. La noche es hora de cazar porque es nocturno.'),
      hard: c('Quiet perches and dusk meals respect a nocturnal body clock.', 'Perchas tranquilas y comidas al anochecer respetan un reloj nocturno.'),
    },
  },
  health: {
    heart: {
      easy: c('Thump, thump. The sleeping owl still has a calm, healthy heart.', 'Tum, tum. El búho dormido igual tiene un corazón tranquilo y sano.'),
      hard: c('A daytime rest is normal. The heart stays steady while the owl sleeps.', 'Descansar de día es normal. El corazón sigue parejo mientras duerme.'),
    },
    teeth: {
      easy: c('Owls have no teeth. A hooked beak tears meat.', 'Los búhos no tienen dientes. Un pico ganchudo desgarra la carne.'),
      hard: c('They swallow prey in pieces and later cough up a pellet of fur and bones.', 'Tragan la presa en trozos y luego escupen una egagrópila de pelo y huesos.'),
    },
    weight: {
      easy: c('An owl is lighter than it looks. Feathers add size, not much weight.', 'Un búho es más liviano de lo que parece. Las plumas suman tamaño, no mucho peso.'),
      hard: c('A great horned owl often weighs about 1 to 2.5 kilograms.', 'Un búho cornudo suele pesar entre 1 y 2,5 kilogramos.'),
    },
  },
  water: {
    easy: c('A clean birdbath gives the owl a drink when it wakes.', 'Una pila limpia le da de beber cuando despierta.'),
    hard: c('Owls get moisture from food too, and a bath helps keep the feathers ready for a quiet flight.', 'También sacan humedad de la comida, y un baño prepara las plumas para un vuelo silencioso.'),
  },
  habitat: { name: c('Northern forests', 'Bosques del norte'), x: 22, y: 28 },
  sound: {
    name: c('Hoot', 'Ulular'),
    say: c('An owl hoots.', 'Un búho ulula.'),
    notes: [
      { at: 0, freq: 330, dur: 0.18, gain: 0.04, wave: 'sine' },
      { at: 0.22, freq: 280, dur: 0.22, gain: 0.045, wave: 'sine' },
      { at: 0.48, freq: 310, dur: 0.16, gain: 0.035, wave: 'triangle' },
    ],
  },
  sprite: 'owl',
  playable: false,
  visible: true,
  unlock: { starter: true, areaStars: 0, after: [] },
};
