export interface Settings {
  sound: boolean;
  haptics: boolean;
  bigNumbers: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  sound: false,
  haptics: true,
  bigNumbers: false,
};
