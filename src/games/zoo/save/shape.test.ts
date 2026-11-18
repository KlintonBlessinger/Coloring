// @ts-nocheck — node test runner types are outside this lane's tsconfig.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_KEEPER } from '../map/areas';
import {
  defaultZooSave,
  loadZooSave,
  memoryBucket,
  normalizeZooSave,
  profileIdFromSearch,
  writeZooSave,
  zooSaveKey,
} from './shape';

test('the save shape keeps savannah open and one record per child', async () => {
  const store = memoryBucket();
  const ada = defaultZooSave('ada', 10);
  ada.learned = [{ animalId: 'lion', fact: 'A lion is a carnivore. It eats meat.' }];
  ada.progress = { stars: { lion: 1 } };
  const ben = defaultZooSave('ben', 10);
  ben.keeper = { x: DEFAULT_KEEPER.x + 64, y: DEFAULT_KEEPER.y, facing: 'left' };
  await writeZooSave(ada, store);
  await writeZooSave(ben, store);
  await writeZooSave({ ...ada, keeper: { ...ada.keeper, x: DEFAULT_KEEPER.x + 32 }, updatedAt: 11 }, store);

  assert.deepEqual(store.keys(), [zooSaveKey('ada'), zooSaveKey('ben')]);
  const loadedAda = await loadZooSave('ada', store, 11);
  const loadedBen = await loadZooSave('ben', store, 10);
  assert.equal(loadedAda.profileId, 'ada');
  assert.equal(loadedAda.v, 1);
  assert.deepEqual(loadedAda.openAreaIds, ['savannah']);
  assert.equal(loadedAda.learned[0]?.animalId, 'lion');
  assert.deepEqual(loadedAda.progress, { stars: { lion: 1 } });
  assert.equal(loadedAda.keeper.x, DEFAULT_KEEPER.x + 32);
  assert.equal(loadedBen.keeper.facing, 'left');
  assert.equal(loadedBen.profileId, 'ben');
});

test('a bad save falls back and unknown areas cannot drop savannah', () => {
  const repaired = normalizeZooSave(
    'default',
    {
      v: 1,
      profileId: 'other',
      openAreaIds: ['aquarium', 'savannah', 'nope'],
      keeper: { x: 10, y: 20, facing: 'left' },
      learned: [{ animalId: 'zebra', fact: 'no' }, { animalId: 'missing', fact: 'no' }],
      progress: { note: 'hi', bad: undefined },
      updatedAt: 5,
    },
    99,
  );
  assert.equal(repaired.profileId, 'default');
  assert.deepEqual(repaired.openAreaIds, ['savannah', 'aquarium']);
  assert.equal(repaired.keeper.facing, 'left');
  assert.equal(repaired.learned.length, 1);
  assert.equal(repaired.learned[0]?.animalId, 'zebra');
  assert.deepEqual(repaired.progress, { note: 'hi' });
  assert.equal(repaired.updatedAt, 5);

  const reset = normalizeZooSave('sam', { v: 2, keeper: { x: 1, y: 1, facing: 'left' } }, 3);
  assert.equal(reset.v, 1);
  assert.equal(reset.keeper.x, DEFAULT_KEEPER.x);
  assert.deepEqual(reset.openAreaIds, ['savannah']);
  assert.equal(profileIdFromSearch('?profile=Ada Kid'), 'adakid');
  assert.equal(profileIdFromSearch(''), 'default');
});
