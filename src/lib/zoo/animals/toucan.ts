import { c } from './copy';
import type { Animal } from './types';

export const toucan: Animal = {
  id: 'toucan',
  name: c('Toucan', 'Tucán'),
  area: 'rainforest',
  diet: 'omnivore',
  foods: ['fruit', 'insects'],
  foodYes: c('Yes. Toucans eat fruit, and sometimes insects. They are omnivores.', 'Sí. Los tucanes comen fruta y a veces insectos. Son omnívoros.'),
  foodHint: c('Toucans mostly eat fruit. Try the fruit.', 'Los tucanes comen sobre todo fruta. Prueba la fruta.'),
  facts: [
    {
      easy: c("A toucan's big beak helps it reach fruit on thin branches.", 'El pico grande ayuda al tucán a alcanzar fruta en ramas finas.'),
      hard: c('The beak looks heavy, but it is light, and it also helps the toucan cool down.', 'El pico parece pesado, pero es liviano, y también ayuda a refrescarse.'),
    },
    {
      easy: c('Toucans live in the rainforest canopy.', 'Los tucanes viven en las copas de la selva.'),
      hard: c('They nest in tree holes and often travel in small flocks.', 'Anidan en huecos de árboles y suelen viajar en grupos pequeños.'),
    },
  ],
  behaviors: [
    {
      id: 'beak',
      easy: c('The toucan shows its beak. That long reach picks fruit.', 'El tucán muestra el pico. Así alcanza la fruta.'),
      hard: c('Tossing a berry and catching it is a real toucan habit.', 'Lanzar una baya y atraparla es una costumbre real del tucán.'),
    },
  ],
  enrichment: {
    prompt: {
      easy: c('Set fruit where the toucan can reach it with its beak.', 'Pon fruta donde el tucán la alcance con el pico.'),
      hard: c('A hanging fruit skewer matches how a toucan feeds in the canopy.', 'Una brocheta de fruta imita cómo come en las copas.'),
    },
    spots: [c('Fruit branch', 'Rama'), c('Ground', 'Suelo'), c('Water', 'Agua')],
    correct: 0,
    hint: c('Toucans reach into the branches. Try the fruit branch.', 'Los tucanes buscan en las ramas. Prueba la rama.'),
    found: {
      easy: c('The toucan reached the fruit with its beak.', 'El tucán alcanzó la fruta con el pico.'),
      hard: c('Using the beak this way is the behavior the feeder is for.', 'Usar el pico así es el comportamiento que el comedero busca.'),
    },
  },
  health: {
    heart: {
      easy: c('Thump, thump. The toucan has a small, quick heart.', 'Tum, tum. El tucán tiene un corazón pequeño y rápido.'),
      hard: c('Birds usually have faster heartbeats than big mammals.', 'Las aves suelen tener el corazón más rápido que los mamíferos grandes.'),
    },
    teeth: {
      easy: c('Toucans have no teeth. The beak snips fruit instead.', 'Los tucanes no tienen dientes. El pico corta la fruta.'),
      hard: c('A serrated edge on the beak helps slice soft fruit.', 'El borde aserrado del pico ayuda a cortar fruta blanda.'),
    },
    weight: {
      easy: c('A toucan weighs about as much as a big mango.', 'Un tucán pesa casi como un mango grande.'),
      hard: c('A toco toucan often weighs about 500 to 800 grams.', 'Un tucán toco suele pesar entre 500 y 800 gramos.'),
    },
  },
  water: {
    easy: c('A clean birdbath gives the toucan a drink and a splash.', 'Una pila limpia le da de beber y lo refresca.'),
    hard: c('Toucans drink and bathe from rainwater caught in the trees.', 'Beben y se bañan con agua de lluvia en los árboles.'),
  },
  habitat: { name: c('Amazon rainforest', 'Selva amazónica'), x: 34, y: 60 },
  sound: {
    name: c('Croak', 'Graznido'),
    say: c('A toucan croaks.', 'Un tucán grazna.'),
    notes: [
      { at: 0, freq: 360, dur: 0.16, gain: 0.045, wave: 'triangle' },
      { at: 0.2, freq: 300, dur: 0.18, gain: 0.04, wave: 'sawtooth' },
    ],
  },
  sprite: null,
  playable: false,
  visible: true,
  unlock: { starter: false, areaStars: 8, after: ['sloth'] },
};
