import { base64ToBytes } from './codec';
import { SAVE_VERSION } from './progress';
import type { ProgressSave } from './storage';

/** How much of a picture a save has colored. Old saves count as not started. */
export function saveRatio(save: ProgressSave | undefined, total: number): number {
  if (!save || save.v !== SAVE_VERSION || total <= 0) return 0;
  try {
    const bytes = base64ToBytes(save.filled);
    if (bytes.length !== total) return 0;
    let count = 0;
    for (const value of bytes) if (value) count++;
    return count / total;
  } catch {
    return 0;
  }
}
