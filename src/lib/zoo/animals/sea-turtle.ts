import { c } from './copy';
import type { Animal } from './types';

export const seaTurtle: Animal = {
  id: 'sea-turtle',
  name: c('Sea turtle', 'Tortuga marina'),
  area: 'aquarium',
  diet: 'herbivore',
  foods: ['leaves'],
  foodYes: c('Yes. Adult sea turtles eat seagrass. Seagrass is a plant, like leaves. They are herbivores.', 'Sí. Las tortugas marinas adultas comen pasto marino. Es una planta, como las hojas. Son herbívoras.'),
  foodHint: c('Sea turtles eat seagrass, a kind of plant. Try the leaves.', 'Las tortugas marinas comen pasto marino, una planta. Prueba las hojas.'),
  facts: [
    {
      easy: c('Sea turtles swim very far across the ocean.', 'Las tortugas marinas nadan muy lejos por el océano.'),
      hard: c('Some travel hundreds of kilometers between feeding grounds and nesting beaches.', 'Algunas recorren cientos de kilómetros entre las zonas de comida y las playas de anidación.'),
    },
    {
      easy: c('Flippers are for swimming, not for walking far on land.', 'Las aletas sirven para nadar, no para caminar mucho en tierra.'),
      hard: c('A female still comes ashore to dig a nest and lay eggs.', 'La hembra igual sale a la playa para cavar un nido y poner huevos.'),
    },
  ],
  behaviors: [
    {
      id: 'glide',
      easy: c('The sea turtle glides. Long flippers pull it through the water.', 'La tortuga marina planea. Las aletas largas la impulsan en el agua.'),
      hard: c('A smooth shell and long front flippers are built for open-ocean swimming.', 'Un caparazón liso y aletas delanteras largas sirven para nadar en mar abierto.'),
    },
  ],
  enrichment: {
    prompt: {
      easy: c('Clip seagrass where the turtle can graze as it swims.', 'Sujeta pasto marino donde la tortuga pueda pastar mientras nada.'),
      hard: c('Grazing while swimming matches how green sea turtles feed on reefs.', 'Pastar nadando es como comen las tortugas verdes en los arrecifes.'),
    },
    spots: [c('Seagrass', 'Pasto marino'), c('Rock', 'Roca'), c('Sand', 'Arena')],
    correct: 0,
    hint: c('Look in the seagrass. That is the meal.', 'Mira el pasto marino. Esa es la comida.'),
    found: {
      easy: c('The turtle found the seagrass.', 'La tortuga encontró el pasto marino.'),
      hard: c('Grazing seagrass is the adult green sea turtle diet.', 'Pastar pasto marino es la dieta de la tortuga verde adulta.'),
    },
  },
  health: {
    heart: {
      easy: c('Thump, thump. The sea turtle has a calm heart for long swims.', 'Tum, tum. La tortuga marina tiene un corazón tranquilo para nadar lejos.'),
      hard: c('A diving turtle can slow its heart to save oxygen.', 'Al bucear puede bajar el ritmo del corazón para ahorrar oxígeno.'),
    },
    teeth: {
      easy: c('Sea turtles have no teeth. A beak snips seagrass.', 'No tienen dientes. Un pico corta el pasto marino.'),
      hard: c('The beak has a serrated edge, a little like a saw, for tough plants.', 'El pico tiene un borde aserrado, un poco como una sierra, para plantas duras.'),
    },
    weight: {
      easy: c('A grown sea turtle can weigh as much as a person.', 'Una tortuga marina adulta puede pesar como una persona.'),
      hard: c('A large green sea turtle can weigh about 100 to 200 kilograms.', 'Una tortuga verde grande puede pesar entre 100 y 200 kilogramos.'),
    },
  },
  water: {
    easy: c('The tank water has to stay clean and salty, like the ocean.', 'El agua del tanque tiene que estar limpia y salada, como el océano.'),
    hard: c('Filters and water checks keep the turtle swimming in healthy seawater.', 'Los filtros y las pruebas mantienen un agua de mar sana.'),
  },
  habitat: { name: c('Warm oceans', 'Océanos cálidos'), x: 30, y: 52 },
  sound: {
    name: c('Splash', 'Chapoteo'),
    say: c('Sea turtles are quiet. This is a soft splash.', 'Las tortugas marinas son silenciosas. Esto es un chapoteo suave.'),
    notes: [
      { at: 0, freq: 300, dur: 0.08, gain: 0.03, wave: 'sine' },
      { at: 0.1, freq: 180, dur: 0.16, gain: 0.025, wave: 'triangle' },
    ],
  },
  sprite: 'sea-turtle',
  playable: false,
  visible: true,
  unlock: { starter: true, areaStars: 0, after: [] },
};
