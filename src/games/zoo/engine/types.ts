import type { ZooKeeperSave, ZooSave } from '../save/shape';

export interface ZooControls {
  joyX: number;
  joyY: number;
  joy: boolean;
  /** Panels swallow the map so a tap does not walk. */
  paused: boolean;
}

export interface ZooHooks {
  controls: ZooControls;
  save: ZooSave;
  onArea: (areaId: string, name: string) => void;
  onNote: (text: string) => void;
  onSpeak: (text: string) => void;
  onKeeper: (keeper: ZooKeeperSave) => void;
}

export function createControls(): ZooControls {
  return { joyX: 0, joyY: 0, joy: false, paused: false };
}
