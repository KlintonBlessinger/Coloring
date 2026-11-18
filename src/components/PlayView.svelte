<script lang="ts">
  import { untrack } from 'svelte';
  import { Game, type Snapshot } from '../lib/game';
  import { inkOn } from '../lib/color';
  import { shareOrDownload } from '../lib/download';
  import { getPuzzle, loadPuzzle } from '../lib/catalog';
  import type { DecodedPuzzle } from '../lib/types';
  import { categoryLabel, fill, t } from '../lib/i18n';
  import { markText, paletteMarks } from '../lib/labels';
  import { applyPictureMode, hasFills, type PictureMode } from '../lib/picture-mode';
  import type { Settings } from '../lib/settings';
  import { speak } from '../lib/speech';
  import { loadPictureModes, loadProgress, saveLastMode, savePictureMode, type ProgressSave } from '../lib/storage';

  let {
    puzzleId,
    settings,
    favorite,
    onBack,
    onToggleFavorite,
    onSaved,
  }: {
    puzzleId: string;
    settings: Settings;
    favorite: boolean;
    onBack: () => void;
    onToggleFavorite: () => void;
    onSaved: (id: string, save: ProgressSave) => void;
  } = $props();

  const entry = untrack(() => getPuzzle(puzzleId));
  let puzzle = $state<DecodedPuzzle | null>(null);
  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let paletteEl = $state<HTMLDivElement | null>(null);
  let gameRef = $state<Game | null>(null);
  let snapshot = $state<Snapshot | null>(null);
  let celebrate = $state(false);
  let shaking = $state(false);
  let saveError = $state(false);
  let saving = $state(false);
  let lastSel = -1;
  let committed = $state<PictureMode | null>(null);
  let draft = $state<PictureMode>('normal');
  let pickerOpen = $state(false);
  let decided = $state(false);

  const live = untrack(() => ({ ...settings, mathMode: false }));
  const playSettings = $derived(applyPictureMode(settings, committed ?? draft));
  const copy = $derived(committed ? playSettings.language : settings.language);

  const pieces = $derived.by(() => {
    const book = puzzle;
    if (!book) return [];
    return Array.from({ length: 26 }, (_, i) => ({
      x: (i * 37) % 100,
      color: book.palette[i % book.palette.length] ?? '#e07a5f',
      delay: (i % 7) * 0.12,
      dur: 2.6 + (i % 5) * 0.28,
    }));
  });

  $effect(() => {
    const id = puzzleId;
    let gone = false;
    puzzle = null;
    void loadPuzzle(id).then((loaded) => {
      if (!gone) puzzle = loaded;
    });
    return () => {
      gone = true;
    };
  });

  $effect(() => {
    const id = puzzleId;
    const regions = entry?.regionCount ?? 0;
    let gone = false;
    decided = false;
    pickerOpen = false;
    committed = null;
    void (async () => {
      const [save, modes] = await Promise.all([loadProgress(id), loadPictureModes()]);
      if (gone) return;
      if (hasFills(save, regions)) {
        const mode = modes[id] ?? 'normal';
        draft = mode;
        committed = mode;
        pickerOpen = false;
      } else {
        draft = 'normal';
        committed = null;
        pickerOpen = true;
      }
      decided = true;
    })();
    return () => {
      gone = true;
    };
  });

  $effect(() => {
    live.sound = settings.sound;
    live.haptics = settings.haptics;
    live.mathMode = committed === 'math';
    live.bigNumbers = settings.bigNumbers;
    live.numberStyle = playSettings.numberStyle;
    live.labels = playSettings.labels;
    live.language = playSettings.language;
    live.mathRange = playSettings.mathRange;
    gameRef?.setLearning(playSettings);
  });

  $effect(() => {
    const canvas = canvasEl;
    const book = puzzle;
    if (!canvas || !book) return;
    let gone = false;
    let opened: Game | null = null;
    void Game.open(canvas, book.id, live.bigNumbers, {
      getSound: () => live.sound,
      getHaptics: () => live.haptics,
      getMathMode: () => live.mathMode,
      onChange: (next) => {
        if (!gone) snapshot = next;
      },
      onComplete: () => {
        celebrate = true;
        opened?.replay();
      },
      onUncomplete: () => {
        celebrate = false;
      },
      onSaved: (save) => {
        saveError = false;
        onSaved(book.id, save);
      },
      onSaveError: () => {
        saveError = true;
      },
      onShake: () => {
        shaking = false;
        requestAnimationFrame(() => {
          shaking = true;
          window.setTimeout(() => {
            shaking = false;
          }, 280);
        });
      },
    }).then((game) => {
      if (!game || gone) {
        game?.destroy();
        return;
      }
      opened = game;
      game.setLearning(live);
      gameRef = game;
      if (canvasEl) (canvasEl as HTMLCanvasElement & { clearColor?: () => void }).clearColor = () => game.clearColor();
    });
    return () => {
      gone = true;
      opened?.destroy();
      gameRef = null;
    };
  });

  $effect(() => {
    const selected = snapshot?.selected ?? -1;
    if (selected < 0 || selected === lastSel) return;
    lastSel = selected;
    paletteEl?.querySelector<HTMLElement>(`[data-index="${selected}"]`)?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
    });
  });

  const quiet = $derived(!!snapshot?.complete && !celebrate);
  const hiddenTitle = $derived(!!entry?.mystery && !snapshot?.complete);
  const overall = $derived(snapshot && snapshot.total ? Math.round((snapshot.filledCount / snapshot.total) * 100) : 0);
  const factList = $derived(playSettings.language === 'es' ? (entry?.factsEs ?? []) : (entry?.facts ?? []));
  const swatchMarks = $derived(puzzle ? paletteMarks(puzzle.palette, playSettings, puzzle.id) : []);
  const modeName = $derived(committed === 'math' ? 'modeMath' : committed === 'espanol' ? 'modeEspanol' : 'modeNormal');
  const pickerTitle = $derived(entry?.mystery ? t(settings.language, 'mystery') : (entry?.title ?? ''));

  function openPicker() {
    if (committed) draft = committed;
    pickerOpen = true;
  }

  async function confirmMode() {
    if (!entry) return;
    const next = draft;
    try {
      await Promise.all([savePictureMode(entry.id, next), saveLastMode(next)]);
    } catch {
      saveError = true;
    }
    committed = next;
    pickerOpen = false;
  }

  async function saveImage() {
    if (!gameRef || saving) return;
    saving = true;
    try {
      const blob = await gameRef.renderBlob();
      await shareOrDownload(blob, `${puzzle?.id ?? 'picture'}.png`, puzzle?.title ?? 'Color Cozy');
    } finally {
      saving = false;
    }
  }
</script>

{#if !entry}
  <div class="screen">
    <p class="empty">{t(copy, 'missing')}</p>
    <button class="btn" type="button" onclick={onBack}>{t(copy, 'back')}</button>
  </div>
{:else}
  <div class="screen" data-testid="play" data-ready={snapshot && committed && !pickerOpen ? '1' : '0'} data-mode={committed ?? ''}>
    <header class="topbar">
      <button class="icon-btn" type="button" aria-label={t(copy, 'back')} data-testid="back" onclick={onBack}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <div class="titles">
        <h1 class:unveil={!!entry.mystery && !!snapshot?.complete}>{hiddenTitle ? t(copy, 'mystery') : entry.title}</h1>
        <p class="sub">
          <span>{snapshot ? Math.round((snapshot.filledCount / snapshot.total) * 100) : 0}% · {hiddenTitle ? t(copy, 'mystery') : (entry.shelfName ?? categoryLabel(copy, entry.category))}</span>
          {#if committed}
            <button class="mode-chip" type="button" data-testid="mode-chip" data-mode={committed} onclick={openPicker}>{t(copy, modeName)}</button>
          {/if}
        </p>
      </div>
      <button
        class="icon-btn fave"
        class:on={favorite}
        type="button"
        data-testid="favorite-play"
        aria-pressed={favorite}
        aria-label={favorite ? t(copy, 'removeFavorite') : t(copy, 'addFavorite')}
        onclick={onToggleFavorite}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            d="M12 19.4 4.8 12.6a4.2 4.2 0 0 1 5.9-6 3.6 3.6 0 0 1 1.3 1.3 3.6 3.6 0 0 1 1.3-1.3 4.2 4.2 0 0 1 5.9 6Z"
            fill={favorite ? 'currentColor' : 'none'}
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <button class="icon-btn hint" type="button" data-testid="hint" onclick={() => gameRef?.hint()}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <circle cx="12" cy="12" r="3.1" fill="currentColor" />
          <path d="M12 3.2v2.2M12 18.6v2.2M3.2 12h2.2M18.6 12h2.2M6 6l1.5 1.5M16.5 16.5 18 18M18 6l-1.5 1.5M7.5 16.5 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
        {t(copy, 'hint')}
      </button>
      <button class="icon-btn" type="button" aria-label={t(copy, 'undo')} data-testid="undo" disabled={!snapshot?.canUndo} onclick={() => gameRef?.undo()}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M8 8H4.2V4.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M5.2 9.2a7.2 7.2 0 1 1-.6 4.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
        </svg>
      </button>
    </header>

    <div class="play-body">
    <div class="stage">
      <div class="shake-host" class:shake={shaking}>
        {#if decided}
          <canvas bind:this={canvasEl} class="surface"></canvas>
        {/if}
      </div>
      {#if celebrate}
        <div class="celebrate" data-testid="complete" role="status">
          <div class="confetti" aria-hidden="true">
            {#each pieces as piece, i (i)}
              <i style="left:{piece.x}%; background:{piece.color}; animation-delay:{piece.delay}s; animation-duration:{piece.dur}s"></i>
            {/each}
          </div>
          <div class="card-pop">
            <p class="eyebrow">{t(copy, 'finished')}</p>
            <h2>{entry.mystery ? entry.title : t(copy, 'beauty')}</h2>
            <p>{entry.mystery ? fill(t(copy, 'mysteryReveal'), { title: entry.title }) : fill(t(copy, 'everySpot'), { title: entry.title })}</p>
            {#if factList.length}
              <div class="facts-row">
                <ul class="facts">
                  {#each factList as fact, factIndex (factIndex)}
                    <li>{fact}</li>
                  {/each}
                </ul>
                <button
                  class="speaker"
                  type="button"
                  data-testid="read-facts"
                  aria-label={t(copy, 'readFacts')}
                  onclick={() => speak(factList.join(' '), copy, 0.85)}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path d="M4 9.5v5h3.2L12 19V5L7.2 9.5H4Z" fill="currentColor" />
                    <path d="M15.2 9.2a3.6 3.6 0 0 1 0 5.6M17.6 6.8a7 7 0 0 1 0 10.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                  </svg>
                  {t(copy, 'listen')}
                </button>
              </div>
            {/if}
            <div class="actions">
              <button class="btn secondary" type="button" data-testid="replay" onclick={() => gameRef?.replay()}>{t(copy, 'replay')}</button>
              <button
                class="btn secondary fave-text"
                class:on={favorite}
                type="button"
                data-testid="favorite-complete"
                aria-pressed={favorite}
                onclick={onToggleFavorite}
              >{favorite ? t(copy, 'favorited') : t(copy, 'favorite')}</button>
              <button class="btn" type="button" data-testid="save-image" disabled={saving} onclick={saveImage}>{t(copy, 'saveImage')}</button>
            </div>
            <button class="linkish" type="button" data-testid="back-gallery" onclick={onBack}>{t(copy, 'backToShelf')}</button>
          </div>
        </div>
      {:else if quiet}
        <div class="finished-bar">
          <strong>{t(copy, 'finished')}</strong>
          <button class="btn secondary" type="button" data-testid="replay" onclick={() => gameRef?.replay()}>{t(copy, 'replay')}</button>
          <button
            class="btn secondary fave-text"
            class:on={favorite}
            type="button"
            data-testid="favorite-complete"
            aria-pressed={favorite}
            onclick={onToggleFavorite}
          >{favorite ? t(copy, 'favorited') : t(copy, 'favorite')}</button>
          <button class="btn" type="button" data-testid="save-image" disabled={saving} onclick={saveImage}>{t(copy, 'saveImage')}</button>
        </div>
      {/if}
    </div>

    {#if saveError}
      <p class="save-error">{t(copy, 'saveError')}</p>
    {/if}

    <div class="palette-dock" data-testid="palette-bar">
      <div class="overall" aria-hidden="true">
        <span class="overall-track"><span style="width: {overall}%"></span></span>
        <em>{overall}%</em>
      </div>
    <div class="palette" class:words={playSettings.labels !== 'numbers'} class:loading={!snapshot} bind:this={paletteEl} data-testid="palette" role="listbox" aria-label={t(copy, 'palette')}>
      {#each puzzle?.palette ?? [] as color, index (index)}
        {@const total = snapshot?.totals[index] ?? 0}
        {@const have = snapshot?.done[index] ?? 0}
        {@const pct = total ? have / total : 0}
        {@const finished = total > 0 && have >= total}
        {@const mark = swatchMarks[index] ?? { kind: 'text' as const, text: String(index + 1) }}
        <button
          type="button"
          class="swatch"
          class:selected={snapshot?.selected === index}
          class:done={finished}
          role="option"
          aria-selected={snapshot?.selected === index}
          aria-label={markText(mark)}
          data-testid="swatch"
          data-index={index}
          data-label={markText(mark)}
          style="--pct: {pct}"
          onclick={() => {
            if (playSettings.labels !== 'numbers') speak(markText(mark), playSettings.language, 0.9);
            gameRef?.select(index);
          }}
        >
          <span class="face" style="background:{color}; color:{inkOn(color)}">
            {#if finished}
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <path d="M5 12.5 10 17.5 19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            {:else if mark.kind === 'dots'}
              <span class="dots" aria-hidden="true">{#each Array(mark.count) as _, dot (dot)}<i></i>{/each}</span>
            {:else if mark.kind === 'tally'}
              <span class="tally" aria-hidden="true">
                {#each Array(mark.count) as _, stick (stick)}
                  <i class:slash={stick % 5 === 4}></i>
                {/each}
              </span>
            {:else}
              {mark.text}
            {/if}
          </span>
        </button>
      {/each}
    </div>
    </div>
    {#if pickerOpen}
      <div class="mode-overlay" data-testid="mode-picker" role="dialog" aria-modal="true" aria-label={t(settings.language, 'howToColor')}>
        <div class="mode-card">
          <p class="eyebrow">{pickerTitle}</p>
          <h2>{t(settings.language, 'howToColor')}</h2>
          <div class="segment" role="group" aria-label={t(settings.language, 'howToColor')}>
            <button type="button" data-testid="mode-normal" aria-pressed={draft === 'normal'} onclick={() => (draft = 'normal')}>{t(settings.language, 'modeNormal')}</button>
            <button type="button" data-testid="mode-math" aria-pressed={draft === 'math'} onclick={() => (draft = 'math')}>{t(settings.language, 'modeMath')}</button>
            <button type="button" data-testid="mode-espanol" aria-pressed={draft === 'espanol'} onclick={() => (draft = 'espanol')}>{t(settings.language, 'modeEspanol')}</button>
          </div>
          <p class="mode-note">
            {#if draft === 'math'}
              {t(settings.language, 'modeMathNote')} {t(settings.language, settings.mathRange)}
            {:else if draft === 'espanol'}
              {t(settings.language, 'modeEspanolNote')}
            {:else}
              {t(settings.language, 'modeNormalNote')}
            {/if}
          </p>
          <button class="btn wide start" type="button" data-testid="mode-start" onclick={confirmMode}>{t(settings.language, 'start')}</button>
        </div>
      </div>
    {/if}
    </div>
  </div>
{/if}
