/** Phaser 3.90 is vendored for this lane so package.json stays untouched. */

export function getPhaser(): any {
  const value = (globalThis as { Phaser?: unknown }).Phaser;
  if (!value) throw new Error('Phaser did not load. Open the zoo preview page.');
  return value;
}
