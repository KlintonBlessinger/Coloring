import assert from 'node:assert/strict';
import test from 'node:test';
import { ANIMALS, animalsInArea, getAnimal } from '../../src/lib/zoo/animals/index';
import {
  areaStars,
  beginSession,
  careNeed,
  completeCare,
  emptyProgress,
  happiness,
  impossibleUnlocks,
  isUnlocked,
  parseProgress,
  unlockedIds,
  type ZooProgress,
} from '../../src/lib/zoo/animals/progression';
import { judgeFood } from '../../src/lib/zoo/care/feed';
import { earnedStickers } from '../../src/lib/zoo/journal/stickers';
import { AREAS, CARE_TASKS, FOODS, type Animal, type CareTaskId } from '../../src/lib/zoo/animals/types';

const PLANTS = new Set(['leaves', 'fruit']);
const ANIMALS_FOOD = new Set(['meat', 'fish', 'insects']);

function allTasks(progress: ZooProgress, id: string, animals: readonly Animal[] = ANIMALS): ZooProgress {
  return CARE_TASKS.reduce((state, task) => completeCare(state, id, task, animals), progress);
}

test('lion and giraffe start unlocked, and the other savannah animals stay locked', () => {
  const progress = emptyProgress();
  const open = unlockedIds(progress, ANIMALS);
  assert.ok(open.includes('lion'));
  assert.ok(open.includes('giraffe'));
  assert.equal(isUnlocked(progress, 'zebra', ANIMALS), false);
  assert.equal(isUnlocked(progress, 'elephant', ANIMALS), false);
  assert.deepEqual(
    animalsInArea('savannah').filter((animal) => animal.unlock.starter).map((animal) => animal.id),
    ['lion', 'giraffe'],
  );
});

test('four care stars unlock the zebra and leave the elephant locked', () => {
  let progress = allTasks(emptyProgress(), 'lion');
  assert.equal(happiness(progress, 'lion').stars, 4);
  assert.equal(areaStars(progress, 'savannah', ANIMALS), 4);
  assert.equal(isUnlocked(progress, 'zebra', ANIMALS), true);
  assert.equal(isUnlocked(progress, 'elephant', ANIMALS), false);

  progress = allTasks(progress, 'giraffe');
  assert.equal(areaStars(progress, 'savannah', ANIMALS), 8);
  assert.equal(isUnlocked(progress, 'zebra', ANIMALS), true);
  assert.equal(isUnlocked(progress, 'elephant', ANIMALS), false);
});

test('three stars are not enough, and a locked animal cannot spend its way open', () => {
  let progress = emptyProgress();
  for (const task of CARE_TASKS.slice(0, 3) as CareTaskId[]) progress = completeCare(progress, 'lion', task, ANIMALS);
  assert.equal(isUnlocked(progress, 'zebra', ANIMALS), false);
  const cheated = completeCare(progress, 'zebra', 'feed', ANIMALS);
  assert.equal(cheated, progress);
  assert.equal(isUnlocked(cheated, 'zebra', ANIMALS), false);
  assert.equal(completeCare(progress, 'no-such-animal', 'feed', ANIMALS), progress);
});

test('the elephant opens only after the zebra, and only with enough stars', () => {
  let progress = allTasks(allTasks(emptyProgress(), 'lion'), 'giraffe');
  assert.equal(isUnlocked(progress, 'elephant', ANIMALS), false);
  progress = allTasks(progress, 'zebra');
  assert.equal(areaStars(progress, 'savannah', ANIMALS), 12);
  assert.equal(isUnlocked(progress, 'elephant', ANIMALS), true);
});

test('stars from another area do not unlock the zebra', () => {
  const progress = allTasks(emptyProgress(), 'monkey');
  assert.equal(areaStars(progress, 'rainforest', ANIMALS), 4);
  assert.equal(areaStars(progress, 'savannah', ANIMALS), 0);
  assert.equal(isUnlocked(progress, 'zebra', ANIMALS), false);
});

test('a new session asks for care again without taking stars or unlocks', () => {
  const cared = allTasks(emptyProgress(), 'lion');
  assert.equal(careNeed(cared, 'lion'), 'resting');
  const next = beginSession(cared);
  assert.equal(next.session, 2);
  assert.deepEqual(next.tended, {});
  assert.equal(happiness(next, 'lion').stars, 4);
  assert.equal(isUnlocked(next, 'zebra', ANIMALS), true);
  assert.equal(careNeed(next, 'lion'), 'ready');
  assert.equal('sick' in next, false);
  assert.equal('sad' in next, false);
});

test('duplicate care does not add stars, and a saved mood penalty is dropped', () => {
  const once = completeCare(emptyProgress(), 'lion', 'feed', ANIMALS);
  const twice = completeCare(once, 'lion', 'feed', ANIMALS);
  assert.equal(happiness(twice, 'lion').stars, 1);
  assert.equal(twice.tasks.lion?.length, 1);
  const parsed = parseProgress({
    version: 1,
    tasks: { lion: ['feed', 'feed', 'sick', 'nap'] },
    tended: { lion: ['sad'] },
    harderFacts: 'yes',
    session: 0,
    sick: true,
    sad: true,
    mood: 'sad',
  });
  assert.deepEqual(parsed.tasks.lion, ['feed']);
  assert.deepEqual(parsed.tended, {});
  assert.equal(parsed.harderFacts, false);
  assert.equal(parsed.session, 1);
  assert.equal('sick' in parsed, false);
  assert.equal('sad' in parsed, false);
  assert.equal(parseProgress(null).session, 1);
});

test('the roster has no impossible unlocks', () => {
  assert.deepEqual(impossibleUnlocks(ANIMALS), []);
});

test('a cycle or a star goal nobody can earn is impossible', () => {
  const say = { en: 'Hi.', es: 'Hola.' };
  const leveled = { easy: say, hard: say };
  const base = {
    name: say,
    diet: 'herbivore' as const,
    foods: ['leaves' as const],
    foodYes: say,
    foodHint: say,
    facts: [leveled, leveled] as Animal['facts'],
    behaviors: [{ id: 'rest', easy: say, hard: say }],
    enrichment: {
      prompt: leveled,
      spots: [say, say, say] as Animal['enrichment']['spots'],
      correct: 0 as const,
      hint: say,
      found: leveled,
    },
    health: { heart: leveled, teeth: leveled, weight: leveled },
    water: leveled,
    habitat: { name: say, x: 10, y: 10 },
    sound: { name: say, say, notes: [] },
    sprite: null,
    playable: false,
    visible: true,
  };
  const cycle: Animal[] = [
    { ...base, id: 'a', area: 'desert', unlock: { starter: false, areaStars: 0, after: ['b'] } },
    { ...base, id: 'b', area: 'desert', unlock: { starter: false, areaStars: 0, after: ['a'] } },
  ];
  assert.deepEqual(impossibleUnlocks(cycle).sort(), ['a', 'b']);
  const tooMany: Animal[] = [
    { ...base, id: 'starter', area: 'arctic', unlock: { starter: true, areaStars: 0, after: [] } },
    { ...base, id: 'too-big', area: 'arctic', unlock: { starter: false, areaStars: 5, after: [] } },
  ];
  assert.deepEqual(impossibleUnlocks(tooMany), ['too-big']);
  const missing: Animal[] = [
    { ...base, id: 'cub', area: 'birds', unlock: { starter: false, areaStars: 0, after: ['missing-parent'] } },
  ];
  assert.deepEqual(impossibleUnlocks(missing), ['cub']);
});

test('only lion and giraffe are playable, and each area has its roster', () => {
  assert.deepEqual(
    ANIMALS.filter((animal) => animal.playable).map((animal) => animal.id),
    ['lion', 'giraffe'],
  );
  assert.deepEqual(
    animalsInArea('savannah').map((animal) => animal.id),
    ['lion', 'giraffe', 'zebra', 'elephant'],
  );
  assert.deepEqual(animalsInArea('rainforest').map((animal) => animal.id), ['monkey', 'sloth', 'toucan', 'jaguar']);
  assert.deepEqual(animalsInArea('desert').map((animal) => animal.id), ['camel', 'meerkat', 'fennec-fox']);
  assert.deepEqual(animalsInArea('reptile-house').map((animal) => animal.id), ['tortoise', 'snake', 'chameleon', 'crocodile']);
  assert.deepEqual(animalsInArea('aquarium').map((animal) => animal.id), ['sea-turtle', 'penguin', 'shark', 'clownfish']);
  assert.deepEqual(animalsInArea('arctic').map((animal) => animal.id), ['polar-bear', 'seal', 'arctic-fox']);
  assert.deepEqual(animalsInArea('birds').map((animal) => animal.id), ['owl', 'flamingo', 'parrot', 'bald-eagle']);
  assert.equal(ANIMALS.length, 26);
  assert.equal(new Set(ANIMALS.map((animal) => animal.id)).size, 26);
  for (const area of AREAS) assert.ok(animalsInArea(area).some((animal) => animal.unlock.starter));
  for (const area of AREAS) {
    if (area === 'savannah') continue;
    assert.equal(animalsInArea(area).filter((animal) => animal.sprite).length >= 1, true);
  }
});

test('diets match the foods, and the owl explains nocturnal sleep', () => {
  for (const animal of ANIMALS) {
    assert.ok(animal.foods.length > 0);
    for (const food of animal.foods) assert.ok(FOODS.includes(food));
    const plants = animal.foods.some((food) => PLANTS.has(food));
    const meaty = animal.foods.some((food) => ANIMALS_FOOD.has(food));
    if (animal.diet === 'herbivore') assert.equal(plants && !meaty, true, animal.id);
    if (animal.diet === 'carnivore') assert.equal(meaty && !plants, true, animal.id);
    if (animal.diet === 'omnivore') assert.equal(plants && meaty, true, animal.id);
    assert.ok(getAnimal(animal.id));
  }
  const owl = getAnimal('owl');
  assert.ok(owl);
  assert.equal(owl?.behaviors[0]?.id, 'nocturnal');
  assert.match(owl?.behaviors[0]?.easy.en ?? '', /nocturnal/i);
  assert.match(owl?.behaviors[0]?.easy.en ?? '', /night/i);
});

test('a wrong food is only a hint, and the right food teaches the diet', () => {
  const lion = getAnimal('lion');
  const giraffe = getAnimal('giraffe');
  assert.ok(lion && giraffe);
  const leaves = judgeFood(lion, 'leaves');
  assert.equal(leaves.ok, false);
  assert.match(leaves.say.en, /meat/i);
  assert.match(leaves.say.en, /carnivore/i);
  assert.equal(judgeFood(lion, 'meat').ok, true);
  assert.equal(judgeFood(giraffe, 'leaves').ok, true);
  assert.equal(judgeFood(giraffe, 'meat').ok, false);
});

test('journal stickers fill in as care is learned', () => {
  const start = emptyProgress();
  assert.deepEqual(earnedStickers(start, 'lion'), []);
  const fed = completeCare(start, 'lion', 'feed', ANIMALS);
  assert.deepEqual(earnedStickers(fed, 'lion'), ['diet', 'fact', 'sound']);
  const done = allTasks(start, 'lion');
  for (const sticker of ['diet', 'fact', 'habitat', 'sound', 'behavior', 'size']) {
    assert.ok(earnedStickers(done, 'lion').includes(sticker as 'fact'));
  }
});
