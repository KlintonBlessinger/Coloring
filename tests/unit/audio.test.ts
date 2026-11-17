import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MUSIC_LOOP_SECONDS, musicScore } from '../../src/lib/audio';
import { clampUnit, DEFAULT_SETTINGS } from '../../src/lib/settings';

test('the calm loop is about a minute and a quarter, and volumes stay in range', () => {
  assert.ok(MUSIC_LOOP_SECONDS >= 60 && MUSIC_LOOP_SECONDS <= 90);
  const notes = musicScore();
  assert.ok(notes.length > 40);
  assert.ok(notes.every((note) => note.time >= 0 && note.time < MUSIC_LOOP_SECONDS));
  assert.equal(notes[0]?.freq, 130.81);
  assert.equal(clampUnit(undefined, 0.55), 0.55);
  assert.equal(clampUnit(2, 0.55), 1);
  assert.equal(clampUnit(-0.2, 0.55), 0);
  assert.equal(DEFAULT_SETTINGS.sound, true);
  assert.equal(DEFAULT_SETTINGS.music, false);
  assert.equal(DEFAULT_SETTINGS.haptics, true);
});
