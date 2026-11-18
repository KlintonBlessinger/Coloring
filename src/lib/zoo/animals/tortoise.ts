import { c } from './copy';
import type { Animal } from './types';

export const tortoise: Animal = {
  id: 'tortoise',
  name: c('Tortoise', 'Tortuga'),
  area: 'reptile-house',
  diet: 'herbivore',
  foods: ['leaves', 'fruit'],
  foodYes: c('Yes. Tortoises eat leaves and fruit. They are herbivores.', 'Sí. Las tortugas comen hojas y fruta. Son herbívoras.'),
  foodHint: c('Tortoises eat plants. Try leaves or fruit.', 'Las tortugas comen plantas. Prueba las hojas o la fruta.'),
  facts: [
    {
      easy: c('A tortoise carries its shell. The shell is part of its body.', 'La tortuga carga su caparazón. El caparazón es parte de su cuerpo.'),
      hard: c('The shell is bone covered by scutes. A tortoise cannot leave it behind.', 'El caparazón es hueso cubierto de placas. La tortuga no puede dejarlo.'),
    },
    {
      easy: c('Some tortoises can live for more than a hundred years.', 'Algunas tortugas pueden vivir más de cien años.'),
      hard: c('Giant tortoises grow slowly and keep growing for many years.', 'Las tortugas gigantes crecen despacio y siguen creciendo muchos años.'),
    },
  ],
  behaviors: [
    {
      id: 'slow',
      easy: c('The tortoise walks slowly. The shell is its traveling house.', 'La tortuga camina despacio. El caparazón es su casa móvil.'),
      hard: c('Basking under a warm lamp is how a tortoise warms up for the day.', 'Tomar el sol bajo una lámpara es como se calienta para el día.'),
    },
  ],
  enrichment: {
    prompt: {
      easy: c('Scatter leaves for the tortoise to find on a slow walk.', 'Esparce hojas para que la tortuga las encuentre en su paseo lento.'),
      hard: c('A scatter feed keeps a tortoise moving, which helps its joints.', 'Repartir la comida hace que camine, y eso ayuda a las patas.'),
    },
    spots: [c('Leaf pile', 'Hojas'), c('Cool rock', 'Roca'), c('Water', 'Agua')],
    correct: 0,
    hint: c('Tortoises look for plants. Try the leaf pile.', 'Las tortugas buscan plantas. Prueba las hojas.'),
    found: {
      easy: c('The tortoise found the leaves.', 'La tortuga encontró las hojas.'),
      hard: c('Slow foraging is the right pace for a tortoise.', 'Buscar despacio es el ritmo correcto para una tortuga.'),
    },
  },
  health: {
    heart: {
      easy: c('Thump, thump. The tortoise has a slow, steady heart.', 'Tum, tum. La tortuga tiene un corazón lento y parejo.'),
      hard: c('Reptile hearts beat more slowly when the body is cool.', 'El corazón de un reptil late más despacio cuando el cuerpo está fresco.'),
    },
    teeth: {
      easy: c('A tortoise has no teeth. A beak snips plants.', 'La tortuga no tiene dientes. Un pico corta las plantas.'),
      hard: c('The beak keeps growing, so crunchy plants help wear it down.', 'El pico sigue creciendo, así que las plantas duras ayudan a gastarlo.'),
    },
    weight: {
      easy: c('A giant tortoise can weigh as much as a person.', 'Una tortuga gigante puede pesar como una persona.'),
      hard: c('A large Galapagos tortoise can weigh about 200 kilograms or more.', 'Una tortuga grande de Galápagos puede pesar unos 200 kilogramos o más.'),
    },
  },
  water: {
    easy: c('A shallow, clean soaking pan lets the tortoise drink and rest.', 'Una bandeja baja y limpia sirve para beber y descansar.'),
    hard: c('Soaking helps a tortoise stay hydrated and keep its shell healthy.', 'Remojarse ayuda a hidratarse y a cuidar el caparazón.'),
  },
  habitat: { name: c('Galapagos Islands', 'Islas Galápagos'), x: 22, y: 54 },
  sound: {
    name: c('Hiss', 'Soplido'),
    say: c('A tortoise makes a soft hiss.', 'Una tortuga hace un soplido suave.'),
    notes: [{ at: 0, freq: 220, dur: 0.35, gain: 0.03, wave: 'sine' }],
  },
  sprite: 'tortoise',
  playable: false,
  visible: true,
  unlock: { starter: true, areaStars: 0, after: [] },
};
