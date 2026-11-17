import { createStore, del, get, keys, set } from 'idb-keyval';
import { APP_NAME } from './brand';
import { DEFAULT_SETTINGS, LABEL_MODES, LANGUAGES, NUMBER_STYLES, pickSetting, type Settings } from './settings';

const store = createStore('color-cozy', 'book');

export interface ProgressSave {
  filled: string;
  order: string;
  selected: number;
  updatedAt: number;
}

export interface BackupFile {
  app: string;
  version: 1;
  exportedAt: string;
  settings: Settings;
  progress: Record<string, ProgressSave>;
  favorites: string[];
}

function normalizeSettings(value: Partial<Settings> | undefined): Settings {
  return {
    sound: value?.sound === true,
    haptics: value?.haptics !== false,
    bigNumbers: value?.bigNumbers === true,
    numberStyle: pickSetting(value?.numberStyle, NUMBER_STYLES, DEFAULT_SETTINGS.numberStyle),
    labels: pickSetting(value?.labels, LABEL_MODES, DEFAULT_SETTINGS.labels),
    language: pickSetting(value?.language, LANGUAGES, DEFAULT_SETTINGS.language),
  };
}

export async function loadSettings(): Promise<Settings> {
  try {
    const stored = await get<Partial<Settings>>('settings', store);
    return stored ? normalizeSettings(stored) : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await set('settings', settings, store);
}

export async function loadProgress(id: string): Promise<ProgressSave | null> {
  try {
    return (await get<ProgressSave>(`progress:${id}`, store)) ?? null;
  } catch {
    return null;
  }
}

export async function saveProgress(id: string, save: ProgressSave): Promise<void> {
  await set(`progress:${id}`, save, store);
}

export async function loadAllProgress(): Promise<Record<string, ProgressSave>> {
  const out: Record<string, ProgressSave> = {};
  try {
    const all = await keys(store);
    await Promise.all(
      all.map(async (key) => {
        if (typeof key !== 'string' || !key.startsWith('progress:')) return;
        const value = await get<ProgressSave>(key, store);
        if (value && typeof value.filled === 'string') out[key.slice('progress:'.length)] = value;
      }),
    );
  } catch {
    return out;
  }
  return out;
}

export async function loadFavorites(): Promise<string[]> {
  try {
    const stored = await get<unknown>('favorites', store);
    if (!Array.isArray(stored)) return [];
    return stored.filter((id): id is string => typeof id === 'string');
  } catch {
    return [];
  }
}

export async function saveFavorites(ids: string[]): Promise<void> {
  await set('favorites', [...new Set(ids)], store);
}

export async function resetAllProgress(): Promise<void> {
  const all = await keys(store);
  await Promise.all(
    all.map((key) =>
      typeof key === 'string' && key.startsWith('progress:') ? del(key, store) : Promise.resolve(),
    ),
  );
}

export async function exportBackup(): Promise<BackupFile> {
  return {
    app: APP_NAME,
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: await loadSettings(),
    progress: await loadAllProgress(),
    favorites: await loadFavorites(),
  };
}

export function parseBackup(text: string): BackupFile {
  const data = JSON.parse(text) as Partial<BackupFile>;
  if (data.version !== 1 || !data.progress || typeof data.progress !== 'object') {
    throw new Error('This file is not a Color Cozy backup.');
  }
  return {
    app: typeof data.app === 'string' ? data.app : APP_NAME,
    version: 1,
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : new Date().toISOString(),
    settings: normalizeSettings(data.settings),
    progress: data.progress,
    favorites: Array.isArray(data.favorites) ? data.favorites.filter((id): id is string => typeof id === 'string') : [],
  };
}

export async function importBackup(data: BackupFile): Promise<void> {
  await resetAllProgress();
  for (const [id, save] of Object.entries(data.progress)) {
    if (!save || typeof save.filled !== 'string' || typeof save.order !== 'string') continue;
    if (!Number.isFinite(save.selected)) continue;
    await saveProgress(id, {
      filled: save.filled,
      order: save.order,
      selected: save.selected,
      updatedAt: Number.isFinite(save.updatedAt) ? save.updatedAt : Date.now(),
    });
  }
  await saveSettings(normalizeSettings(data.settings));
  await saveFavorites(data.favorites);
}
