import type { AreaId } from '../map/areas';

export const FOODS = ['meat', 'leaves', 'fish', 'insects', 'fruit'] as const;
export type Food = (typeof FOODS)[number];

export const FOOD_LABELS: Record<Food, string> = {
  meat: 'Meat',
  leaves: 'Leaves',
  fish: 'Fish',
  insects: 'Bugs',
  fruit: 'Fruit',
};

export interface ZooAnimal {
  id: string;
  name: string;
  areaId: AreaId;
  eats: Food;
  /** Spoken when the food is right. */
  fact: string;
  /** Spoken when the food is something else. Never a fail. */
  hint: string;
}

export const ANIMALS: ZooAnimal[] = [
  { id: 'lion', name: 'Lion', areaId: 'savannah', eats: 'meat', fact: 'A lion is a carnivore. It eats meat.', hint: 'A lion eats meat.' },
  { id: 'giraffe', name: 'Giraffe', areaId: 'savannah', eats: 'leaves', fact: 'A giraffe is a herbivore. It eats leaves.', hint: 'A giraffe eats leaves.' },
  { id: 'zebra', name: 'Zebra', areaId: 'savannah', eats: 'leaves', fact: 'A zebra is a herbivore. It eats grass and leaves.', hint: 'A zebra eats leaves.' },
  { id: 'elephant', name: 'Elephant', areaId: 'savannah', eats: 'fruit', fact: 'An elephant is a herbivore. It eats fruit and plants.', hint: 'An elephant eats fruit.' },
  { id: 'monkey', name: 'Monkey', areaId: 'rainforest', eats: 'fruit', fact: 'A monkey is an omnivore. Fruit is a favorite food.', hint: 'A monkey likes fruit.' },
  { id: 'sloth', name: 'Sloth', areaId: 'rainforest', eats: 'leaves', fact: 'A sloth eats leaves and moves slowly on purpose.', hint: 'A sloth eats leaves.' },
  { id: 'toucan', name: 'Toucan', areaId: 'rainforest', eats: 'fruit', fact: 'A toucan uses its big beak to reach fruit.', hint: 'A toucan eats fruit.' },
  { id: 'jaguar', name: 'Jaguar', areaId: 'rainforest', eats: 'meat', fact: 'A jaguar is a carnivore. It hunts for meat.', hint: 'A jaguar eats meat.' },
  { id: 'camel', name: 'Camel', areaId: 'desert', eats: 'leaves', fact: 'A camel stores fat in its hump and eats desert plants.', hint: 'A camel eats leaves.' },
  { id: 'meerkat', name: 'Meerkat', areaId: 'desert', eats: 'insects', fact: 'A meerkat stands tall to watch for danger, then eats bugs.', hint: 'A meerkat eats bugs.' },
  { id: 'fennec', name: 'Fennec fox', areaId: 'desert', eats: 'insects', fact: 'A fennec fox has huge ears that keep it cool.', hint: 'A fennec fox eats bugs.' },
  { id: 'tortoise', name: 'Tortoise', areaId: 'reptile-house', eats: 'leaves', fact: 'A tortoise is a herbivore with a heavy shell.', hint: 'A tortoise eats leaves.' },
  { id: 'snake', name: 'Snake', areaId: 'reptile-house', eats: 'meat', fact: 'A snake is a carnivore. It swallows food whole.', hint: 'A snake eats meat.' },
  { id: 'chameleon', name: 'Chameleon', areaId: 'reptile-house', eats: 'insects', fact: 'A chameleon changes color and catches bugs.', hint: 'A chameleon eats bugs.' },
  { id: 'crocodile', name: 'Crocodile', areaId: 'reptile-house', eats: 'meat', fact: 'A crocodile is a carnivore and waits very still.', hint: 'A crocodile eats meat.' },
  { id: 'sea-turtle', name: 'Sea turtle', areaId: 'aquarium', eats: 'leaves', fact: 'A sea turtle grazes on plants in the sea.', hint: 'A sea turtle eats leaves.' },
  { id: 'penguin', name: 'Penguin', areaId: 'aquarium', eats: 'fish', fact: 'A penguin is a bird that swims and eats fish.', hint: 'A penguin eats fish.' },
  { id: 'shark', name: 'Shark', areaId: 'aquarium', eats: 'fish', fact: 'A shark is a fish that eats other fish.', hint: 'A shark eats fish.' },
  { id: 'clownfish', name: 'Clownfish', areaId: 'aquarium', eats: 'leaves', fact: 'A clownfish lives safe inside a sea anemone.', hint: 'A clownfish nibbles plants.' },
  { id: 'polar-bear', name: 'Polar bear', areaId: 'arctic', eats: 'meat', fact: 'A polar bear is a carnivore of the ice.', hint: 'A polar bear eats meat.' },
  { id: 'seal', name: 'Seal', areaId: 'arctic', eats: 'fish', fact: 'A seal swims with flippers and eats fish.', hint: 'A seal eats fish.' },
  { id: 'arctic-fox', name: 'Arctic fox', areaId: 'arctic', eats: 'meat', fact: 'An arctic fox grows a white coat in the snow.', hint: 'An arctic fox eats meat.' },
  { id: 'owl', name: 'Owl', areaId: 'birds', eats: 'meat', fact: 'An owl sleeps by day because it is nocturnal.', hint: 'An owl eats meat.' },
  { id: 'flamingo', name: 'Flamingo', areaId: 'birds', eats: 'insects', fact: 'A flamingo gets its pink color from its food.', hint: 'A flamingo eats tiny water bugs.' },
  { id: 'parrot', name: 'Parrot', areaId: 'birds', eats: 'fruit', fact: 'A parrot is bright and eats fruit.', hint: 'A parrot eats fruit.' },
  { id: 'eagle', name: 'Bald eagle', areaId: 'birds', eats: 'fish', fact: 'A bald eagle hunts fish with sharp eyes.', hint: 'A bald eagle eats fish.' },
];

export function isAnimalId(value: string): boolean {
  return ANIMALS.some((animal) => animal.id === value);
}

export function animalsIn(areaId: AreaId): ZooAnimal[] {
  return ANIMALS.filter((animal) => animal.areaId === areaId);
}

export function animalById(id: string): ZooAnimal | undefined {
  return ANIMALS.find((animal) => animal.id === id);
}
