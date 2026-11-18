import manifest from '../../../art/manifest.json' with { type: 'json' };
import type { Language } from '../../settings';

export type WordLevel = 'easy' | 'medium' | 'hard';

export interface Animal {
  id: string;
  /** Public realistic art id. The private picture pack is not used. */
  art: string;
  en: string;
  es: string;
  sayEn: string;
  sayEs: string;
  facts: string[];
  factsEs: string[];
}

const pictures = new Set(
  ((manifest as { pictures: { id: string }[] }).pictures).map((picture) => picture.id),
);

/** Facts never include the grid word. The child just spelled it. */
function knownAnimal(animal: Animal): Animal {
  if (!pictures.has(animal.art)) throw new Error(`Missing public art ${animal.art}`);
  if (animal.facts.length === 0 || animal.factsEs.length === 0) throw new Error(`Missing facts for ${animal.id}`);
  return animal;
}

/** One spoken name, one grid spelling. Pictures are the public realistic set. */
export const ANIMALS: readonly Animal[] = [
  knownAnimal({
    id: 'fox', art: 'realistic-red-fox-snow', en: 'FOX', es: 'ZORRO', sayEn: 'Fox', sayEs: 'Zorro',
    facts: ['Those ears can hear a squeak under the snow, and then comes a pounce.', 'A bushy tail wraps around the body like a blanket in the cold.'],
    factsEs: ['Esas orejas oyen un chillido bajo la nieve, y luego viene un salto.', 'La cola espesa se enrolla como una manta contra el frío.'],
  }),
  knownAnimal({
    id: 'owl', art: 'realistic-snowy-owl', en: 'OWL', es: 'BUHO', sayEn: 'Owl', sayEs: 'Búho',
    facts: ['Most relatives hunt at night. This one hunts while the sun is up.', 'Feathers on the feet work like cozy slippers.'],
    factsEs: ['Casi todos los parientes cazan de noche. Este caza con el sol.', 'Las plumas de las patas funcionan como pantuflas.'],
  }),
  knownAnimal({
    id: 'wolf', art: 'realistic-gray-wolf', en: 'WOLF', es: 'LOBO', sayEn: 'Wolf', sayEs: 'Lobo',
    facts: ['The family hunts together in a group called a pack.', 'A long howl helps the family find each other, even miles apart.'],
    factsEs: ['La familia caza junta, en un grupo llamado manada.', 'Un aullido largo ayuda a la familia a encontrarse lejos.'],
  }),
  knownAnimal({
    id: 'lion', art: 'realistic-lion-portrait', en: 'LION', es: 'LEON', sayEn: 'Lion', sayEs: 'León',
    facts: ['A roar can be heard up to 5 miles (8 km) away.', 'These are the only big cats that live in family groups called prides.'],
    factsEs: ['El rugido se oye hasta a 8 km.', 'Son los únicos grandes felinos que viven en familias llamadas manadas.'],
  }),
  knownAnimal({
    id: 'frog', art: 'realistic-poison-dart-frogs', en: 'FROG', es: 'RANA', sayEn: 'Frog', sayEs: 'Rana',
    facts: ['Bright colors can mean a poisonous skin. Looking is safer than touching.', 'Each bright pattern is its own warning.'],
    factsEs: ['Los colores vivos pueden avisar de una piel venenosa. Mirar es más seguro que tocar.', 'Cada dibujo de colores es una advertencia distinta.'],
  }),
  knownAnimal({
    id: 'panda', art: 'realistic-giant-panda', en: 'PANDA', es: 'PANDA', sayEn: 'Panda', sayEs: 'Panda',
    facts: ['Eating can take 10 to 16 hours a day, almost all of it bamboo.', 'A wrist bone works like a thumb for holding bamboo.'],
    factsEs: ['Comer puede llevar de 10 a 16 horas al día, casi todo bambú.', 'Un hueso de la muñeca funciona como un pulgar para sujetar el bambú.'],
  }),
  knownAnimal({
    id: 'koala', art: 'realistic-koala', en: 'KOALA', es: 'KOALA', sayEn: 'Koala', sayEs: 'Koala',
    facts: ['Sleep can last 18 to 22 hours a day.', 'Almost every meal is eucalyptus leaves.'],
    factsEs: ['El sueño puede durar de 18 a 22 horas al día.', 'Casi toda la comida son hojas de eucalipto.'],
  }),
  knownAnimal({
    id: 'zebra', art: 'realistic-zebras', en: 'ZEBRA', es: 'CEBRA', sayEn: 'Zebra', sayEs: 'Cebra',
    facts: ['No two stripe patterns are the same.', 'The stripes may help the group confuse a chasing hunter.'],
    factsEs: ['No hay dos dibujos de rayas iguales.', 'Las rayas pueden confundir a quien persigue al grupo.'],
  }),
  knownAnimal({
    id: 'tiger', art: 'realistic-tiger-walking', en: 'TIGER', es: 'TIGRE', sayEn: 'Tiger', sayEs: 'Tigre',
    facts: ['No two stripe patterns match, just like fingerprints.', 'These are the biggest cats, and they like to swim.'],
    factsEs: ['No hay dos dibujos de rayas iguales, como las huellas de los dedos.', 'Son los felinos más grandes, y les gusta nadar.'],
  }),
  knownAnimal({
    id: 'horse', art: 'realistic-horse-galloping', en: 'HORSE', es: 'CABALLO', sayEn: 'Horse', sayEs: 'Caballo',
    facts: ['Sleep can happen standing up.', 'At a gallop, all four hooves leave the ground for a moment.'],
    factsEs: ['Puede dormir de pie.', 'Al galope, las cuatro patas se levantan del suelo un momento.'],
  }),
  knownAnimal({
    id: 'eagle', art: 'realistic-bald-eagle', en: 'EAGLE', es: 'AGUILA', sayEn: 'Eagle', sayEs: 'Águila',
    facts: ['The head is not bare. It is covered in white feathers.', 'The nest can be the biggest of any bird in North America, sometimes heavier than a car.'],
    factsEs: ['La cabeza no está pelada. La cubren plumas blancas.', 'El nido puede ser el más grande de las aves de América del Norte, a veces más pesado que un coche.'],
  }),
  knownAnimal({
    id: 'shark', art: 'realistic-great-white-shark', en: 'SHARK', es: 'TIBURON', sayEn: 'Shark', sayEs: 'Tiburón',
    facts: ['Teeth keep growing in rows for a whole life.', 'A tiny trace of blood can be smelled from far away.'],
    factsEs: ['Los dientes siguen saliendo en filas durante toda la vida.', 'Una pizca de sangre se huele desde muy lejos.'],
  }),
  knownAnimal({
    id: 'gecko', art: 'realistic-leopard-gecko', en: 'GECKO', es: 'GECKO', sayEn: 'Gecko', sayEs: 'Gecko',
    facts: ['A tail can drop off to escape, then grow back.', 'Toes can grip a smooth wall.'],
    factsEs: ['La cola puede soltarse para escapar y luego volver a crecer.', 'Los dedos se pegan a una pared lisa.'],
  }),
  knownAnimal({
    id: 'whale', art: 'realistic-humpback-breaching', en: 'WHALE', es: 'BALLENA', sayEn: 'Whale', sayEs: 'Ballena',
    facts: ['Songs can travel for miles through the water.', 'The whole body can leap clear of the sea.'],
    factsEs: ['Los cantos viajan kilómetros por el agua.', 'El cuerpo entero puede salir del agua de un salto.'],
  }),
  knownAnimal({
    id: 'macaw', art: 'realistic-scarlet-macaw-flight', en: 'MACAW', es: 'GUACAMAYO', sayEn: 'Macaw', sayEs: 'Guacamayo',
    facts: ['A life in the wild can last 40 to 50 years.', 'The beak works like a third foot while climbing.'],
    factsEs: ['En libertad, la vida puede durar de 40 a 50 años.', 'El pico sirve como un tercer pie al trepar.'],
  }),
  knownAnimal({
    id: 'turtle', art: 'realistic-sea-turtle-reef', en: 'TURTLE', es: 'TORTUGA', sayEn: 'Turtle', sayEs: 'Tortuga',
    facts: ['Some journeys across the ocean last thousands of miles.', 'The shell is part of the skeleton.'],
    factsEs: ['Algunos viajes por el océano duran miles de kilómetros.', 'El caparazón forma parte del esqueleto.'],
  }),
  knownAnimal({
    id: 'iguana', art: 'realistic-green-iguana', en: 'IGUANA', es: 'IGUANA', sayEn: 'Iguana', sayEs: 'Iguana',
    facts: ['A long tail can break off if a grab is too tight, then grow again.', 'Spines along the back stand up when it is time to look big.'],
    factsEs: ['La cola larga puede romperse si la sujetan, y luego crece otra vez.', 'Las púas de la espalda se levantan para verse más grande.'],
  }),
  knownAnimal({
    id: 'jaguar', art: 'realistic-jaguar', en: 'JAGUAR', es: 'JAGUAR', sayEn: 'Jaguar', sayEs: 'Jaguar',
    facts: ['The bite is the strongest of the big cats.', 'The spots are called rosettes, and the center is often darker.'],
    factsEs: ['La mordida es la más fuerte de los grandes felinos.', 'Las manchas se llaman rosetas, y el centro suele ser más oscuro.'],
  }),
  knownAnimal({
    id: 'python', art: 'realistic-green-tree-python', en: 'PYTHON', es: 'PITON', sayEn: 'Python', sayEs: 'Pitón',
    facts: ['A meal can be as wide as the head, thanks to a stretchy jaw.', 'The whole body squeezes, instead of using venom.'],
    factsEs: ['Una comida puede ser tan ancha como la cabeza, gracias a una mandíbula elástica.', 'El cuerpo aprieta, en vez de usar veneno.'],
  }),
  knownAnimal({
    id: 'leopard', art: 'realistic-leopard-tree', en: 'LEOPARD', es: 'LEOPARDO', sayEn: 'Leopard', sayEs: 'Leopardo',
    facts: ['A tail helps with balance on a high branch.', 'Those spots hide the body in dappled shade.'],
    factsEs: ['La cola ayuda a guardar el equilibrio en una rama alta.', 'Esas manchas esconden el cuerpo entre luces y sombras.'],
  }),
  knownAnimal({
    id: 'dolphin', art: 'realistic-dolphins-sunset', en: 'DOLPHIN', es: 'DELFIN', sayEn: 'Dolphin', sayEs: 'Delfín',
    facts: ['Each one has a whistle the group can recognize.', 'Sleep happens with one eye open.'],
    factsEs: ['Cada uno tiene un silbido que el grupo reconoce.', 'Duermen con un ojo abierto.'],
  }),
  knownAnimal({
    id: 'giraffe', art: 'realistic-giraffe-browsing', en: 'GIRAFFE', es: 'JIRAFA', sayEn: 'Giraffe', sayEs: 'Jirafa',
    facts: ['This is the tallest animal on land.', 'The tongue can be about 18 to 20 inches (45 to 50 cm) long, handy for pulling leaves.'],
    factsEs: ['Es el animal más alto en tierra.', 'La lengua puede medir unos 45 a 50 cm, perfecta para agarrar hojas.'],
  }),
  knownAnimal({
    id: 'flamingo', art: 'realistic-flamingos', en: 'FLAMINGO', es: 'FLAMENCO', sayEn: 'Flamingo', sayEs: 'Flamenco',
    facts: ['The bend in the leg is an ankle. The knee is hidden higher up.', 'The pink color comes from the food.'],
    factsEs: ['La curva de la pata es un tobillo. La rodilla está más arriba.', 'El color rosado viene de la comida.'],
  }),
  knownAnimal({
    id: 'cheetah', art: 'realistic-cheetah', en: 'CHEETAH', es: 'GUEPARDO', sayEn: 'Cheetah', sayEs: 'Guepardo',
    facts: ['This is the fastest land animal, for a short sprint.', 'The claws stay out a little, like running spikes.'],
    factsEs: ['Es el animal terrestre más rápido, en una carrera corta.', 'Las garras se quedan un poco afuera, como clavos de carrera.'],
  }),
  knownAnimal({
    id: 'elephant', art: 'realistic-african-elephant', en: 'ELEPHANT', es: 'ELEFANTE', sayEn: 'Elephant', sayEs: 'Elefante',
    facts: ['This is the largest animal on land.', 'The trunk has tens of thousands of muscles and can pick up one peanut.'],
    factsEs: ['Es el animal terrestre más grande.', 'La trompa tiene decenas de miles de músculos y puede recoger un solo cacahuete.'],
  }),
  knownAnimal({
    id: 'crocodile', art: 'realistic-nile-crocodile', en: 'CROCODILE', es: 'COCODRILO', sayEn: 'Crocodile', sayEs: 'Cocodrilo',
    facts: ['The eyes and the nose sit on top, so a peek above the water is enough.', 'A bite can hold on with tremendous force.'],
    factsEs: ['Los ojos y la nariz quedan arriba, así que basta asomar un poco del agua.', 'La mordida puede sujetar con muchísima fuerza.'],
  }),
  knownAnimal({
    id: 'chameleon', art: 'realistic-chameleon', en: 'CHAMELEON', es: 'CAMALEON', sayEn: 'Chameleon', sayEs: 'Camaleón',
    facts: ['Skin can shift color with mood, light, and heat.', 'Each eye can look in its own direction.'],
    factsEs: ['La piel puede cambiar de color según el ánimo, la luz y el calor.', 'Cada ojo puede mirar hacia un lado distinto.'],
  }),
  knownAnimal({
    id: 'orangutan', art: 'realistic-orangutan-mother-baby', en: 'ORANGUTAN', es: 'ORANGUTAN', sayEn: 'Orangutan', sayEs: 'Orangután',
    facts: ['The arms can stretch longer than the legs, handy for swinging.', 'A nest of branches is built for sleeping, often a new one each night.'],
    factsEs: ['Los brazos pueden ser más largos que las piernas, útiles para columpiarse.', 'Cada noche se arma un nido de ramas para dormir.'],
  }),
  knownAnimal({
    id: 'tortoise', art: 'realistic-galapagos-tortoise', en: 'TORTOISE', es: 'TORTUGA', sayEn: 'Tortoise', sayEs: 'Tortuga',
    facts: ['Some live for more than 100 years.', 'The heavy shell is home, and it goes everywhere.'],
    factsEs: ['Algunos viven más de 100 años.', 'El caparazón pesado es la casa, y va a todas partes.'],
  }),
  knownAnimal({
    id: 'alligator', art: 'realistic-alligator-swamp', en: 'ALLIGATOR', es: 'ALIGATOR', sayEn: 'Alligator', sayEs: 'Aligátor',
    facts: ['The snout is wide and round at the tip.', 'Mothers guard the nest and carry the hatchlings to the water.'],
    factsEs: ['El hocico es ancho y redondo en la punta.', 'Las madres cuidan el nido y llevan a las crías al agua.'],
  }),
];

const byId = new Map(ANIMALS.map((animal) => [animal.id, animal]));

/**
 * Easy stays short and across/down. Spanish names that grow past the grid
 * move up a level. Tortoise shares a Spanish name with turtle, so it stays
 * on English puzzles only.
 */
const PLANS: Record<Language, Record<WordLevel, readonly (readonly string[])[]>> = {
  en: {
    easy: [
      ['fox', 'owl', 'wolf'],
      ['lion', 'frog', 'panda'],
      ['koala', 'zebra'],
      ['tiger', 'horse', 'gecko'],
      ['eagle', 'shark'],
      ['whale', 'macaw', 'frog'],
    ],
    medium: [
      ['turtle', 'iguana', 'jaguar', 'python'],
      ['leopard', 'dolphin', 'giraffe', 'fox'],
      ['flamingo', 'cheetah', 'eagle', 'wolf'],
      ['horse', 'panda', 'macaw', 'whale'],
    ],
    hard: [
      ['elephant', 'crocodile', 'owl', 'fox', 'frog'],
      ['chameleon', 'orangutan', 'tiger', 'wolf', 'gecko'],
      ['alligator', 'tortoise', 'lion', 'panda', 'zebra'],
      ['giraffe', 'dolphin', 'leopard', 'jaguar', 'python'],
      ['flamingo', 'cheetah', 'elephant', 'eagle', 'koala'],
    ],
  },
  es: {
    easy: [
      ['fox', 'owl', 'wolf'],
      ['lion', 'frog', 'panda'],
      ['koala', 'zebra'],
      ['tiger', 'gecko'],
      ['panda', 'frog', 'owl'],
    ],
    medium: [
      ['turtle', 'iguana', 'jaguar', 'python'],
      ['leopard', 'dolphin', 'giraffe', 'fox'],
      ['flamingo', 'cheetah', 'eagle', 'wolf'],
      ['horse', 'panda', 'whale', 'shark'],
    ],
    hard: [
      ['elephant', 'crocodile', 'owl', 'fox', 'frog'],
      ['chameleon', 'orangutan', 'tiger', 'wolf', 'gecko'],
      ['alligator', 'lion', 'panda', 'zebra', 'eagle'],
      ['giraffe', 'dolphin', 'leopard', 'jaguar', 'python'],
      ['flamingo', 'cheetah', 'elephant', 'macaw', 'koala'],
    ],
  },
};

export function foldName(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^A-Za-z]/g, '').toUpperCase();
}

export function animalById(id: string): Animal {
  const animal = byId.get(id);
  if (!animal) throw new Error(`Unknown animal ${id}`);
  return animal;
}

export function wordFor(animal: Animal, language: Language): string {
  return language === 'es' ? animal.es : animal.en;
}

export function sayFor(animal: Animal, language: Language): string {
  return language === 'es' ? animal.sayEs : animal.sayEn;
}

export function factsFor(animal: Animal, language: Language): string[] {
  return language === 'es' ? animal.factsEs : animal.facts;
}

export function plansFor(language: Language, level: WordLevel): readonly (readonly string[])[] {
  return PLANS[language][level];
}

export function puzzleCount(language: Language, level: WordLevel): number {
  return PLANS[language][level].length;
}
