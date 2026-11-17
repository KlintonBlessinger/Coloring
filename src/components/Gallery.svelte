<script lang="ts">
  import { APP_NAME } from '../lib/brand';
  import { listPuzzles } from '../lib/catalog';
  import { drawThumbnail, filledFromSave, progressRatio } from '../lib/thumb';
  import type { ProgressSave } from '../lib/storage';
  import { CATEGORIES, type Category, type DecodedPuzzle } from '../lib/types';

  let {
    progress,
    onOpen,
    onSettings,
  }: {
    progress: Record<string, ProgressSave>;
    onOpen: (id: string) => void;
    onSettings: () => void;
  } = $props();

  let tab = $state<'all' | 'progress' | 'done'>('all');
  let category = $state<'All' | Category>('All');

  const visible = $derived.by(() => {
    const items = listPuzzles().filter((puzzle) => {
      if (category !== 'All' && puzzle.category !== category) return false;
      const ratio = ratioOf(puzzle);
      if (tab === 'progress') return ratio > 0 && ratio < 1;
      if (tab === 'done') return ratio >= 1;
      return true;
    });
    if (tab !== 'all') {
      items.sort(
        (a, b) => (progress[b.id]?.updatedAt ?? 0) - (progress[a.id]?.updatedAt ?? 0),
      );
    }
    return items;
  });

  function ratioOf(puzzle: DecodedPuzzle): number {
    return progressRatio(filledFromSave(puzzle, progress[puzzle.id]), puzzle.regionColors.length);
  }

  function paint(node: HTMLCanvasElement, params: { puzzle: DecodedPuzzle; save: ProgressSave | undefined }) {
    const draw = (current: { puzzle: DecodedPuzzle; save: ProgressSave | undefined }) => {
      const filled = filledFromSave(current.puzzle, current.save);
      drawThumbnail(node, current.puzzle, filled);
    };
    draw(params);
    return { update: draw };
  }

  const empty = $derived(
    tab === 'progress'
      ? 'Nothing in progress. Open a picture and tap a color.'
      : tab === 'done'
        ? 'Finished pictures will wait here.'
        : 'No pictures on this shelf.',
  );
</script>

<div class="screen" data-testid="gallery">
  <header class="gallery-head">
    <div class="brand">
      <span class="logo" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      <div>
        <h1>{APP_NAME}</h1>
        <p class="lede">Color by number, offline.</p>
      </div>
    </div>
    <button class="icon-btn" type="button" aria-label="Settings" data-testid="open-settings" onclick={onSettings}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2" />
        <path
          d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        />
      </svg>
    </button>
  </header>

  <div class="tabs" role="tablist">
    <button type="button" role="tab" data-testid="tab-all" aria-selected={tab === 'all'} onclick={() => (tab = 'all')}>All</button>
    <button type="button" role="tab" data-testid="tab-in-progress" aria-selected={tab === 'progress'} onclick={() => (tab = 'progress')}>In progress</button>
    <button type="button" role="tab" data-testid="tab-finished" aria-selected={tab === 'done'} onclick={() => (tab = 'done')}>Finished</button>
  </div>

  <div class="chips">
    <button type="button" class="chip" class:on={category === 'All'} data-testid="category-chip" data-category="All" onclick={() => (category = 'All')}>All</button>
    {#each CATEGORIES as name (name)}
      <button
        type="button"
        class="chip"
        class:on={category === name}
        data-testid="category-chip"
        data-category={name}
        onclick={() => (category = name)}
      >{name}</button>
    {/each}
  </div>

  {#snippet picture(puzzle: DecodedPuzzle)}
    {@const ratio = ratioOf(puzzle)}
    <button
      type="button"
      class="card"
      data-testid="puzzle-card"
      data-id={puzzle.id}
      aria-label="{puzzle.title}, {puzzle.difficulty}, {Math.round(ratio * 100)}% colored"
      onclick={() => onOpen(puzzle.id)}
    >
      <div class="thumb-wrap">
        <canvas
          class="thumb"
          width="280"
          height="280"
          use:paint={{ puzzle, save: progress[puzzle.id] }}
        ></canvas>
      </div>
      <span class="card-title">{puzzle.title}</span>
      <span class="meta">
        <span>{puzzle.category}</span>
        <span class="badge {puzzle.difficulty}">{puzzle.difficulty}</span>
      </span>
      {#if ratio > 0}
        <span class="meter" class:done={ratio >= 1}><span style="width: {Math.round(ratio * 100)}%"></span></span>
      {/if}
    </button>
  {/snippet}

  {#if tab === 'all' && category === 'All'}
    <div class="shelves">
      {#each CATEGORIES as name (name)}
        {@const items = visible.filter((puzzle) => puzzle.category === name)}
        {#if items.length}
          <section class="shelf" data-shelf={name}>
            <h2 class="shelf-title">{name}</h2>
            <div class="shelf-row">
              {#each items as puzzle (puzzle.id)}
                {@render picture(puzzle)}
              {/each}
            </div>
          </section>
        {/if}
      {/each}
    </div>
  {:else}
    <div class="grid">
      {#each visible as puzzle (puzzle.id)}
        {@render picture(puzzle)}
      {:else}
        <p class="empty">{empty}</p>
      {/each}
    </div>
  {/if}
</div>
