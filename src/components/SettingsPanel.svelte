<script lang="ts">
  import { listPuzzles } from '../lib/catalog';
  import { formatFavoritesShare, sharePlainText } from '../lib/favorites-share';
  import { downloadBlob } from '../lib/download';
  import { t } from '../lib/i18n';
  import { LABEL_MODES, LANGUAGES, NUMBER_STYLES, type MathRange, type NumberStyle, type Settings } from '../lib/settings';
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
  const practiceRanges = $derived(
    settings.numberStyle === 'adding' ? (['add10', 'add20'] as const) : (['times5', 'times10'] as const),
  );

  function toggle(key: 'sound' | 'haptics' | 'bigNumbers') {
    onChange({ ...settings, [key]: !settings[key] });
  }

  function pick<K extends 'numberStyle' | 'labels' | 'language' | 'mathRange'>(key: K, value: Settings[K]) {
    onChange({ ...settings, [key]: value });
  }

  function pickStyle(style: NumberStyle) {
    let mathRange: MathRange = settings.mathRange;
    if (style === 'adding' && !mathRange.startsWith('add')) mathRange = 'add10';
    if (style === 'times' && !mathRange.startsWith('times')) mathRange = 'times5';
    onChange({ ...settings, numberStyle: style, mathRange });
  }

  async function shareFavorites() {
    const text = formatFavoritesShare(favorites, progress, listPuzzles());
    const how = await sharePlainText(text);
    status = how === 'shared' ? t(settings.language, 'favoritesShared') : t(settings.language, 'favoritesCopied');
  }

  async function exportFile() {
    const backup = await exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    downloadBlob(blob, 'color-cozy-backup.json');
    status = t(settings.language, 'backupDownloaded');
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
      status = t(settings.language, 'backupImported');
    } catch (error) {
      status = error instanceof Error ? error.message : t(settings.language, 'importFailed');
    }
  }

  async function erase() {
    await resetAllProgress();
    onProgress({});
    confirmReset = false;
    status = t(settings.language, 'progressCleared');
  }
</script>

<div class="screen settings" data-testid="settings">
  <header class="topbar">
    <button class="icon-btn" type="button" aria-label={t(settings.language, 'back')} data-testid="back" onclick={onBack}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
    <div class="titles">
      <h1>{t(settings.language, 'settings')}</h1>
      <p class="sub">{t(settings.language, 'justThisDevice')}</p>
    </div>
  </header>

  <div class="stack">
    <div class="choice-block">
      <p class="choice-label">{t(settings.language, 'numberStyle')}</p>
      <div class="choices" role="group" aria-label={t(settings.language, 'numberStyle')}>
        {#each NUMBER_STYLES as style (style)}
          <button type="button" data-testid="number-{style}" aria-pressed={settings.numberStyle === style} onclick={() => pickStyle(style)}>{t(settings.language, style)}</button>
        {/each}
      </div>
    </div>
    {#if settings.numberStyle === 'adding' || settings.numberStyle === 'times'}
      <div class="choice-block">
        <p class="choice-label">{t(settings.language, 'practice')}</p>
        <div class="choices" role="group" aria-label={t(settings.language, 'practice')}>
          {#each practiceRanges as range (range)}
            <button type="button" data-testid="math-{range}" aria-pressed={settings.mathRange === range} onclick={() => pick('mathRange', range)}>{t(settings.language, range)}</button>
          {/each}
        </div>
      </div>
    {/if}
    <div class="choice-block">
      <p class="choice-label">{t(settings.language, 'labels')}</p>
      <div class="choices" role="group" aria-label={t(settings.language, 'labels')}>
        {#each LABEL_MODES as mode (mode)}
          <button type="button" data-testid="labels-{mode}" aria-pressed={settings.labels === mode} onclick={() => pick('labels', mode)}>{t(settings.language, mode)}</button>
        {/each}
      </div>
    </div>
    <div class="choice-block">
      <p class="choice-label">{t(settings.language, 'language')}</p>
      <div class="choices" role="group" aria-label={t(settings.language, 'language')}>
        {#each LANGUAGES as language (language)}
          <button type="button" data-testid="language-{language}" aria-pressed={settings.language === language} onclick={() => pick('language', language)}>{language === 'es' ? t(settings.language, 'espanol') : t(settings.language, 'english')}</button>
        {/each}
      </div>
    </div>
    <button class="row" type="button" data-testid="big-numbers-toggle" role="switch" aria-checked={settings.bigNumbers} onclick={() => toggle('bigNumbers')}>
      <span><strong>{t(settings.language, 'bigNumbers')}</strong><small>{t(settings.language, 'bigNumbersHint')}</small></span>
      <i class="switch" class:on={settings.bigNumbers}></i>
    </button>
    <button class="row" type="button" data-testid="sound-toggle" role="switch" aria-checked={settings.sound} onclick={() => toggle('sound')}>
      <span><strong>{t(settings.language, 'sound')}</strong><small>{t(settings.language, 'soundHint')}</small></span>
      <i class="switch" class:on={settings.sound}></i>
    </button>
    <button class="row" type="button" data-testid="haptics-toggle" role="switch" aria-checked={settings.haptics} onclick={() => toggle('haptics')}>
      <span><strong>{t(settings.language, 'haptics')}</strong><small>{t(settings.language, 'hapticsHint')}</small></span>
      <i class="switch" class:on={settings.haptics}></i>
    </button>

    <button class="btn wide" type="button" data-testid="share-favorites" onclick={shareFavorites}>{t(settings.language, 'shareFavorites')}</button>
    <button class="btn wide" type="button" data-testid="export-backup" onclick={exportFile}>{t(settings.language, 'exportBackup')}</button>
    <label class="file-btn">
      {t(settings.language, 'importBackup')}
      <input type="file" accept="application/json,.json" data-testid="import-backup" onchange={onImport} />
    </label>

    {#if !confirmReset}
      <button class="btn danger wide" type="button" data-testid="reset-progress" onclick={() => (confirmReset = true)}>{t(settings.language, 'resetProgress')}</button>
    {:else}
      <div class="confirm">
        <p>{t(settings.language, 'eraseQuestion')}</p>
        <div class="actions">
          <button class="btn danger" type="button" data-testid="reset-confirm" onclick={erase}>{t(settings.language, 'erase')}</button>
          <button class="btn secondary" type="button" data-testid="reset-cancel" onclick={() => (confirmReset = false)}>{t(settings.language, 'cancel')}</button>
        </div>
      </div>
    {/if}

    {#if status}<p class="status" data-testid="settings-status">{status}</p>{/if}
    <p class="note">{t(settings.language, 'backupNote')}</p>
  </div>
</div>
