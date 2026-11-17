import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import test from 'node:test';
import { parsePack, shelfNames } from '../../src/lib/packs';

test('private is a marker, not a shelf name', () => {
  assert.deepEqual(shelfNames(["Blue House", 'Private', ' private ']), ['Blue House']);
  assert.deepEqual(shelfNames(['Private']), []);
});

function puzzle(id: string, title: string) {
  return {
    id,
    title,
    category: 'Shows',
    difficulty: 'easy',
    mode: 'lineart',
    w: 32,
    h: 32,
    palette: [{ n: 1, hex: '#3d6ec9' }],
    regions: [{ id: 0, n: 1, d: 'M0 0L32 0L32 32L0 32Z', label: { x: 16, y: 16, r: 8 } }],
    ink: '',
    art: '',
  };
}

test('a json pack keeps each tag shelf and drops Private', async () => {
  const pack = {
    format: 'color-cozy-pack',
    version: 1,
    id: 'sample',
    title: 'Sample pack',
    pictures: [
      {
        id: 'blue-house',
        title: 'Blue House',
        difficulty: 'easy',
        tags: ['Blue House', 'Private'],
        facts: ['A house with a blue door.'],
        factsEs: ['Una casa con una puerta azul.'],
        puzzle: puzzle('blue-house', 'Blue House'),
        thumb: 'data:image/jpeg;base64,AA==',
      },
    ],
  };
  const installed = await parsePack(new TextEncoder().encode(JSON.stringify(pack)));
  assert.equal(installed.id, 'sample');
  assert.equal(installed.pictures.length, 1);
  assert.deepEqual(installed.pictures[0]?.shelves, ['Blue House']);
  assert.equal(installed.pictures[0]?.puzzle.regions.length, 1);
});

function zipStored(name: string, data: Uint8Array): Buffer {
  const nameBytes = Buffer.from(name);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(nameBytes.length, 26);
  return Buffer.concat([header, nameBytes, data]);
}

function zipDeflated(name: string, data: Uint8Array): Buffer {
  const nameBytes = Buffer.from(name);
  const compressed = deflateRawSync(data);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(8, 8);
  header.writeUInt32LE(compressed.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(nameBytes.length, 26);
  return Buffer.concat([header, nameBytes, compressed]);
}

test('a zip pack reads puzzles, thumbs, and art', async () => {
  const manifest = {
    format: 'color-cozy-pack',
    version: 1,
    id: 'zip-sample',
    title: 'Zip sample',
    pictures: [{ id: 'red-yard', title: 'Red Yard', difficulty: 'medium', tags: ['Red Yard', 'Private'], facts: [], factsEs: [] }],
  };
  const puzzleBytes = Buffer.from(JSON.stringify(puzzle('red-yard', 'Red Yard')));
  const bytes = Buffer.concat([
    zipDeflated('pack.json', Buffer.from(JSON.stringify(manifest))),
    zipStored('puzzles/red-yard.json', puzzleBytes),
    zipStored('thumbs/red-yard.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xd9])),
    zipStored('art/red-yard.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xd9])),
  ]);
  const installed = await parsePack(new Uint8Array(bytes));
  assert.equal(installed.pictures[0]?.title, 'Red Yard');
  assert.equal(installed.pictures[0]?.difficulty, 'medium');
  assert.ok(installed.pictures[0]?.thumb.startsWith('data:image/jpeg;base64,'));
  assert.ok(installed.pictures[0]?.art.startsWith('data:image/jpeg;base64,'));
});
