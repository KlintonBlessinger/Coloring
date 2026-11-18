import { arcticFox } from './arctic-fox';
import { baldEagle } from './bald-eagle';
import { camel } from './camel';
import { chameleon } from './chameleon';
import { clownfish } from './clownfish';
import { crocodile } from './crocodile';
import { elephant } from './elephant';
import { fennecFox } from './fennec-fox';
import { flamingo } from './flamingo';
import { giraffe } from './giraffe';
import { jaguar } from './jaguar';
import { lion } from './lion';
import { meerkat } from './meerkat';
import { monkey } from './monkey';
import { owl } from './owl';
import { parrot } from './parrot';
import { penguin } from './penguin';
import { polarBear } from './polar-bear';
import { seaTurtle } from './sea-turtle';
import { seal } from './seal';
import { shark } from './shark';
import { sloth } from './sloth';
import { snake } from './snake';
import { tortoise } from './tortoise';
import { toucan } from './toucan';
import type { Animal, AreaId } from './types';
import { zebra } from './zebra';

/** One entry per animal. Adding an animal is a new file plus a line here. */
export const ANIMALS: readonly Animal[] = [
  lion,
  giraffe,
  zebra,
  elephant,
  monkey,
  sloth,
  toucan,
  jaguar,
  camel,
  meerkat,
  fennecFox,
  tortoise,
  snake,
  chameleon,
  crocodile,
  seaTurtle,
  penguin,
  shark,
  clownfish,
  polarBear,
  seal,
  arcticFox,
  owl,
  flamingo,
  parrot,
  baldEagle,
];

const byId = new Map(ANIMALS.map((animal) => [animal.id, animal]));

export function getAnimal(id: string): Animal | undefined {
  return byId.get(id);
}

export function animalsInArea(area: AreaId): Animal[] {
  return ANIMALS.filter((animal) => animal.area === area);
}

export function playableAnimals(): Animal[] {
  return ANIMALS.filter((animal) => animal.playable);
}
