/** Little-endian run-length encoding for puzzle grids and save data. */

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x4000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(bytes.length, i + chunk));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** RLE of small integers. Each run is a uint16 count and a uint16 value, little-endian. */
export function encodeRLE(cells: ArrayLike<number>): string {
  const runs: number[] = [];
  let i = 0;
  while (i < cells.length) {
    const value = cells[i] ?? 0;
    let count = 1;
    while (i + count < cells.length && cells[i + count] === value && count < 65535) count++;
    runs.push(count, value & 65535);
    i += count;
  }
  const buf = new Uint16Array(runs);
  return bytesToBase64(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
}

export function decodeRLE(b64: string, length: number): Uint8Array {
  const view = decodeRuns(b64);
  const out = new Uint8Array(length);
  fillRuns(view, out);
  return out;
}

export function decodeRLE16(b64: string, length: number): Uint16Array {
  const view = decodeRuns(b64);
  const out = new Uint16Array(length);
  fillRuns(view, out);
  return out;
}

function decodeRuns(b64: string): Uint16Array {
  const bytes = base64ToBytes(b64);
  if (bytes.byteLength % 2 !== 0) throw new Error('Puzzle data is damaged.');
  const aligned = new Uint8Array(bytes);
  return new Uint16Array(aligned.buffer, aligned.byteOffset, aligned.byteLength / 2);
}

function fillRuns(view: Uint16Array, out: Uint8Array | Uint16Array): void {
  let cursor = 0;
  for (let i = 0; i < view.length; i += 2) {
    const count = view[i] ?? 0;
    const value = view[i + 1] ?? 0;
    const end = cursor + count;
    if (end > out.length) throw new Error('Puzzle data is damaged.');
    out.fill(value, cursor, end);
    cursor = end;
  }
  if (cursor !== out.length) throw new Error('Puzzle data is damaged.');
}

export function encodeOrder(order: number[]): string {
  const buf = new Uint32Array(order.length);
  for (let i = 0; i < order.length; i++) buf[i] = order[i] ?? 0;
  return bytesToBase64(new Uint8Array(buf.buffer));
}

export function decodeOrder(b64: string): number[] {
  if (!b64) return [];
  const bytes = base64ToBytes(b64);
  const len = bytes.byteLength - (bytes.byteLength % 4);
  if (len === 0) return [];
  const aligned = new Uint8Array(bytes.subarray(0, len));
  const view = new Uint32Array(aligned.buffer);
  return Array.from(view);
}
