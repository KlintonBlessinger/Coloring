<script lang="ts">
  import { listPuzzles } from '../lib/catalog';
  import { formatFavoritesShare, sharePlainText } from '../lib/favorites-share';
  import { downloadBlob } from '../lib/download';
  import type { Settings } from '../lib/settings';
  import {
    exportBackup,
    importBackup,
    loadAllProgress,
    loadFavorites,
    parseBackup,
    resetAllProgress,
    type ProgressSave,
  } from '../lib/storage';

  let {
    settings,
    progress,
    favorites,
    onBack,
    onChange,
    onProgress,
    onFavorites,
    onSettings,
  }: {
    settings: Settings;
    progress: Record<string, ProgressSave>;
    favorites: string[];
    onBack: () => void;
    onChange: (settings: Settings) => void;
    onProgress: (progress: Record<string, ProgressSave>) => void;
    onFavorites: (favorites: string[]) => void;
    onSettings: (settings: Settings) => void;
  } = $props();

  let confirmReset = $state(false);
  let status = $state('');

  function toggle(key: keyof Settings) {
    onChange({ ...settings, [key]: !settings[key] });
  }

  async function shareFavorites() {
    const text = formatFavoritesShare(favorites, progress, listPuzzles());
    const how = await sharePlainText(text);
    status = how === 'shared' ? 'Favorites shared.' : 'Favorites copied.';
  }

  async function exportFile() {
    const backup = await exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    downloadBlob(blob, 'color-cozy-backup.json');
    status = 'Backup downloaded.';
  }

  async function onImport(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const data = parseBackup(await file.text());
      await importBackup(data);
      onProgress(await loadAllProgress());
      onFavorites(await loadFavorites());
      onSettings(data.settings);
      status = 'Backup imported.';
    } catch (error) {
      status = error instanceof Error ? error.message : 'Could not import that file.';
    }
  }

  async function erase() {
    await resetAllProgress();
    onProgress({});
    confirmReset = false;
    status = 'Progress cleared on this device.';
  }
</script>

<div class="screen settings" data-testid="settings">
  <header class="topbar">
    <button class="icon-btn" type="button" aria-label="Back" data-testid="back" onclick={onBack}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
    <div class="titles">
      <h1>Settings</h1>
      <p class="sub">Just this device.</p>
    </div>
  </header>

  <div class="stack">
    <button class="row" type="button" data-testid="big-numbers-toggle" role="switch" aria-checked={settings.bigNumbers} onclick={() => toggle('bigNumbers')}>
      <span><strong>Big numbers</strong><small>Easier to read when you zoom out</small></span>
      <i class="switch" class:on={settings.bigNumbers}></i>
    </button>
    <button class="row" type="button" data-testid="sound-toggle" role="switch" aria-checked={settings.sound} onclick={() => toggle('sound')}>
      <span><strong>Sound</strong><small>Off unless you turn it on</small></span>
      <i class="switch" class:on={settings.sound}></i>
    </button>
    <button class="row" type="button" data-testid="haptics-toggle" role="switch" aria-checked={settings.haptics} onclick={() => toggle('haptics')}>
      <span><strong>Haptics</strong><small>A tiny buzz when a spot fills</small></span>
      <i class="switch" class:on={settings.haptics}></i>
    </button>

    <button class="btn wide" type="button" data-testid="share-favorites" onclick={shareFavorites}>Share favorites</button>
    <button class="btn wide" type="button" data-testid="export-backup" onclick={exportFile}>Export backup</button>
    <label class="file-btn">
      Import backup
      <input type="file" accept="application/json,.json" data-testid="import-backup" onchange={onImport} />
    </label>

    {#if !confirmReset}
      <button class="btn danger wide" type="button" data-testid="reset-progress" onclick={() => (confirmReset = true)}>Reset progress</button>
    {:else}
      <div class="confirm">
        <p>Erase every saved picture on this device?</p>
        <div class="actions">
          <button class="btn danger" type="button" data-testid="reset-confirm" onclick={erase}>Erase</button>
          <button class="btn secondary" type="button" data-testid="reset-cancel" onclick={() => (confirmReset = false)}>Cancel</button>
        </div>
      </div>
    {/if}

    {#if status}<p class="status" data-testid="settings-status">{status}</p>{/if}
    <p class="note">
      iOS can clear saved pictures if the app sits unused. Export a backup when you want a copy you can bring back.
    </p>
  </div>
</div>
