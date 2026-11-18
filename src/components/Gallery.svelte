<script lang="ts">
  import { APP_NAME } from '../lib/brand';
  import { listPuzzles, type CatalogEntry } from '../lib/catalog';
  import { ANIMAL_HABITATS, GROWNUP_GROUPS, REALISTIC_GROUPS, categoryLabel, grownupGroupLabel, habitatLabel, realisticGroupLabel, t, type AnimalHabitat, type GrownupGroup } from '../lib/i18n';
  import type { Settings } from '../lib/settings';
  import { asset } from '../lib/vector';
  import { saveRatio } from '../lib/thumb';
  import type { ProgressSave } from '../lib/storage';
  import { CATEGORIES, type Category } from '../lib/types';

  type Shelf = 'All' | 'Favorites' | 'Mystery' | Category;

  let {
    progress,
    favorites,
    settings,
    packTick = 0,
    onOpen,
    onSettings,
    onToggleFavorite,
  }: {
    progress: Record<string, ProgressSave>;
    favorites: string[];
    settings: Settings;
    /** Changes when an imported pack is added or removed, so the shelves refresh. */
    packTick?: number;
    onOpen: (id: string) => void;
    onSettings: () => void;
    onToggleFavorite: (id: string) => void;
  } = $props();

  let tab = $state<'all' | 'progress' | 'done'>('all');
  let category = $state<Shelf>('All');
  let habitat = $state<'all' | AnimalHabitat>('all');
  let grownGroup = $state<'all' | GrownupGroup>('all');

  function pickShelf(next: Shelf) {
    category = next;
    habitat = 'all';
    grownGroup = 'all';
  }

  const visible = $derived.by(() => {
    packTick;
    const items = listPuzzles().filter((puzzle: CatalogEntry) => {
      if (category === 'Favorites' && !favorites.includes(puzzle.id)) return false;
      if (category === 'Mystery' && !puzzle.mystery) return false;
      if (category !== 'All' && category !== 'Favorites' && category !== 'Mystery') {
        if (puzzle.packId || puzzle.mystery || puzzle.category !== category) return false;
      }
      if (category === 'Animals' && habitat !== 'all' && !puzzle.tags.setting.includes(habitat)) return false;
      if (category === 'Grown-ups' && grownGroup !== 'all' && !puzzle.tags.subject.includes(grownGroup)) return false;
      const ratio = ratioOf(puzzle);
      if (tab === 'progress') return ratio > 0 && ratio < 1;
      if (tab === 'done') return ratio >= 1;
      return true;
    });
    if (tab !== 'all') {
      items.sort((a, b) => (progress[b.id]?.updatedAt ?? 0) - (progress[a.id]?.updatedAt ?? 0));
    }
    return items;
  });

  function ratioOf(puzzle: CatalogEntry): number {
    return saveRatio(progress[puzzle.id], puzzle.regionCount);
  }

  function labelFor(puzzle: CatalogEntry, ratio: number): string {
    if (puzzle.mystery && ratio < 1) return t(settings.language, 'mysteryPicture');
    return puzzle.title;
  }

  const mysteryShelf = $derived(visible.filter((puzzle) => puzzle.mystery && !puzzle.packId));

  const grownUpCount = $derived.by(() => {
    packTick;
    return listPuzzles().filter((puzzle) => !puzzle.packId && !puzzle.mystery && puzzle.category === 'Grown-ups').length;
  });

  const packShelves = $derived.by(() => {
    const order: string[] = [];
    const groups = new Map<string, CatalogEntry[]>();
    for (const puzzle of visible) {
      if (!puzzle.packId) continue;
      for (const shelf of puzzle.shelves ?? []) {
        const items = groups.get(shelf);
        if (items) items.push(puzzle);
        else {
          groups.set(shelf, [puzzle]);
          order.push(shelf);
        }
      }
    }
    return order.map((shelf) => ({ shelf, items: groups.get(shelf) ?? [] }));
  });

  const empty = $derived(
    category === 'Favorites'
      ? t(settings.language, 'emptyFavorites')
      : tab === 'progress'
        ? t(settings.language, 'emptyProgress')
        : tab === 'done'
          ? t(settings.language, 'emptyDone')
          : t(settings.language, 'emptyShelf'),
  );
</script>

<div class="screen" data-testid="gallery">
  <header class="gallery-head">
    <div class="brand">
      <span class="logo" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      <div>
        <h1>{APP_NAME}</h1>
        <p class="lede">{t(settings.language, 'lede')}</p>
      </div>
    </div>
    <button class="icon-btn" type="button" aria-label={t(settings.language, 'openSettings')} data-testid="open-settings" onclick={onSettings}>
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
    <button type="button" role="tab" data-testid="tab-all" aria-selected={tab === 'all'} onclick={() => (tab = 'all')}>{t(settings.language, 'tabAll')}</button>
    <button type="button" role="tab" data-testid="tab-in-progress" aria-selected={tab === 'progress'} onclick={() => (tab = 'progress')}>{t(settings.language, 'tabProgress')}</button>
    <button type="button" role="tab" data-testid="tab-finished" aria-selected={tab === 'done'} onclick={() => (tab = 'done')}>{t(settings.language, 'tabFinished')}</button>
  </div>

  <div class="chips">
    <button type="button" class="chip" class:on={category === 'All'} data-testid="category-chip" data-category="All" onclick={() => pickShelf('All')}>{t(settings.language, 'all')}</button>
    <button type="button" class="chip" class:on={category === 'Favorites'} data-testid="category-chip" data-category="Favorites" onclick={() => pickShelf('Favorites')}>{t(settings.language, 'favorites')}</button>
    <button type="button" class="chip" class:on={category === 'Mystery'} data-testid="category-chip" data-category="Mystery" onclick={() => pickShelf('Mystery')}>{t(settings.language, 'mystery')}</button>
    {#each CATEGORIES as name (name)}
      {#if name !== 'Grown-ups' || grownUpCount > 0}
        <button
          type="button"
          class="chip"
          class:on={category === name}
          data-testid="category-chip"
          data-category={name}
          onclick={() => pickShelf(name)}
        >{categoryLabel(settings.language, name)}</button>
      {/if}
    {/each}
  </div>

  {#if category === 'Animals'}
    <div class="chips">
      <button type="button" class="chip" class:on={habitat === 'all'} data-testid="habitat-all" onclick={() => (habitat = 'all')}>{t(settings.language, 'all')}</button>
      {#each ANIMAL_HABITATS as name (name)}
        <button
          type="button"
          class="chip"
          class:on={habitat === name}
          data-testid="habitat-{name}"
          onclick={() => (habitat = name)}
        >{habitatLabel(settings.language, name)}</button>
      {/each}
    </div>
  {/if}

  {#if category === 'Grown-ups'}
    <div class="chips">
      <button type="button" class="chip" class:on={grownGroup === 'all'} data-testid="grownup-all" onclick={() => (grownGroup = 'all')}>{t(settings.language, 'all')}</button>
      {#each GROWNUP_GROUPS as name (name)}
        <button
          type="button"
          class="chip"
          class:on={grownGroup === name}
          data-testid="grownup-{name}"
          onclick={() => (grownGroup = name)}
        >{grownupGroupLabel(settings.language, name)}</button>
      {/each}
    </div>
  {/if}

  {#snippet picture(puzzle: CatalogEntry)}
    {@const ratio = ratioOf(puzzle)}
    {@const hidden = puzzle.mystery && ratio < 1}
    {@const loved = favorites.includes(puzzle.id)}
    <article class="card" data-testid="puzzle-card" data-id={puzzle.id} data-mystery={puzzle.mystery ? '1' : '0'}>
      <button
        type="button"
        class="heart"
        class:on={loved}
        data-testid="favorite"
        data-favorite={puzzle.id}
        data-on={loved ? '1' : '0'}
        aria-pressed={loved}
        aria-label={loved ? `${t(settings.language, 'removeFavorite')}: ${hidden ? t(settings.language, 'mysteryPicture') : puzzle.title}` : `${t(settings.language, 'addFavorite')}: ${hidden ? t(settings.language, 'mysteryPicture') : puzzle.title}`}
        onclick={(event) => {
          event.stopPropagation();
          onToggleFavorite(puzzle.id);
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M12 19.4 4.8 12.6a4.2 4.2 0 0 1 5.9-6 3.6 3.6 0 0 1 1.3 1.3 3.6 3.6 0 0 1 1.3-1.3 4.2 4.2 0 0 1 5.9 6Z"
            fill={loved ? 'currentColor' : 'none'}
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <button
        type="button"
        class="card-hit"
        aria-label="{labelFor(puzzle, ratio)}, {puzzle.difficulty}, {Math.round(ratio * 100)}% colored"
        onclick={() => onOpen(puzzle.id)}
      >
        <div class="thumb-wrap">
          <img class="thumb" alt="" width="280" height="280" src={puzzle.thumbUrl ?? asset(`thumbs/${puzzle.file}.jpg`)} />
        </div>
        <span class="card-title">{hidden ? t(settings.language, 'mystery') : puzzle.title}</span>
        <span class="meta">
          <span>{hidden ? t(settings.language, 'mystery') : (puzzle.shelfName ?? categoryLabel(settings.language, puzzle.category))}</span>
          <span class="badge {puzzle.difficulty}">{t(settings.language, puzzle.difficulty)}</span>
        </span>
        {#if ratio > 0}
          <span class="meter" class:done={ratio >= 1}><span style="width: {Math.round(ratio * 100)}%"></span></span>
        {/if}
      </button>
    </article>
  {/snippet}

  {#if tab === 'all' && category === 'All'}
    <div class="shelves">
      {#each CATEGORIES as name (name)}
        {#if name === 'Animals'}
          {#each ANIMAL_HABITATS as habitatName (habitatName)}
            {#if habitatName === 'realistic'}
              {@const realisticItems = visible.filter((puzzle) => !puzzle.packId && !puzzle.mystery && puzzle.category === 'Animals' && puzzle.tags.setting.includes('realistic'))}
              {#if realisticItems.length}
                {@const rest = realisticItems.filter((puzzle) => !REALISTIC_GROUPS.some((group) => puzzle.tags.subject.includes(group)))}
                <section class="shelf" data-shelf="realistic">
                  <h2 class="shelf-title">{habitatLabel(settings.language, 'realistic')}</h2>
                  {#each REALISTIC_GROUPS as group (group)}
                    {@const items = realisticItems.filter((puzzle) => puzzle.tags.subject.includes(group))}
                    {#if items.length}
                      <h3 class="shelf-sub" data-group={group}>{realisticGroupLabel(settings.language, group)}</h3>
                      <div class="shelf-row" data-shelf={group}>
                        {#each items as puzzle (puzzle.id)}
                          {@render picture(puzzle)}
                        {/each}
                      </div>
                    {/if}
                  {/each}
                  {#if rest.length}
                    <h3 class="shelf-sub">{t(settings.language, 'moreAnimals')}</h3>
                    <div class="shelf-row" data-shelf="realistic-more">
                      {#each rest as puzzle (puzzle.id)}
                        {@render picture(puzzle)}
                      {/each}
                    </div>
                  {/if}
                </section>
              {/if}
            {:else}
              {@const items = visible.filter((puzzle) => !puzzle.packId && !puzzle.mystery && puzzle.category === 'Animals' && puzzle.tags.setting.includes(habitatName))}
              {#if items.length}
                <section class="shelf" data-shelf={habitatName}>
                  <h2 class="shelf-title">{habitatLabel(settings.language, habitatName)}</h2>
                  <div class="shelf-row">
                    {#each items as puzzle (puzzle.id)}
                      {@render picture(puzzle)}
                    {/each}
                  </div>
                </section>
              {/if}
            {/if}
          {/each}
          {@const rest = visible.filter((puzzle) => !puzzle.packId && !puzzle.mystery && puzzle.category === 'Animals' && !ANIMAL_HABITATS.some((habitatName) => puzzle.tags.setting.includes(habitatName)))}
          {#if rest.length}
            <section class="shelf" data-shelf="Animals">
              <h2 class="shelf-title">{categoryLabel(settings.language, 'Animals')}</h2>
              <div class="shelf-row">
                {#each rest as puzzle (puzzle.id)}
                  {@render picture(puzzle)}
                {/each}
              </div>
            </section>
          {/if}
        {:else if name === 'Grown-ups'}
          {@const grownItems = visible.filter((puzzle) => !puzzle.packId && !puzzle.mystery && puzzle.category === 'Grown-ups')}
          {#if grownItems.length}
            <section class="shelf" data-shelf="grown-ups">
              <h2 class="shelf-title">{categoryLabel(settings.language, 'Grown-ups')}</h2>
              {#each GROWNUP_GROUPS as groupName (groupName)}
                {@const items = grownItems.filter((puzzle) => puzzle.tags.subject.includes(groupName))}
                {#if items.length}
                  <h3 class="shelf-sub" data-group={groupName}>{grownupGroupLabel(settings.language, groupName)}</h3>
                  <div class="shelf-row" data-shelf={groupName}>
                    {#each items as puzzle (`${groupName}-${puzzle.id}`)}
                      {@render picture(puzzle)}
                    {/each}
                  </div>
                {/if}
              {/each}
            </section>
          {/if}
        {:else}
          {@const items = visible.filter((puzzle) => !puzzle.packId && !puzzle.mystery && puzzle.category === name)}
          {#if items.length}
            <section class="shelf" data-shelf={name}>
              <h2 class="shelf-title">{categoryLabel(settings.language, name)}</h2>
              <div class="shelf-row">
                {#each items as puzzle (puzzle.id)}
                  {@render picture(puzzle)}
                {/each}
              </div>
            </section>
          {/if}
        {/if}
      {/each}
      {#each packShelves as group (group.shelf)}
        <section class="shelf" data-shelf={group.shelf} data-pack-shelf={group.shelf}>
          <h2 class="shelf-title">{group.shelf}</h2>
          <div class="shelf-row">
            {#each group.items as puzzle (puzzle.id)}
              {@render picture(puzzle)}
            {/each}
          </div>
        </section>
      {/each}
      {#if mysteryShelf.length}
        <section class="shelf" data-shelf="Mystery">
          <h2 class="shelf-title">{t(settings.language, 'mystery')}</h2>
          <div class="shelf-row">
            {#each mysteryShelf as puzzle (puzzle.id)}
              {@render picture(puzzle)}
            {/each}
          </div>
        </section>
      {/if}
    </div>
  {:else}
    <div class="grid">
      {#if category === 'Favorites' || category === 'Mystery'}
        <h2 class="shelf-title span">{category === 'Favorites' ? t(settings.language, 'favorites') : t(settings.language, 'mystery')}</h2>
      {:else if category === 'Grown-ups' && grownGroup !== 'all'}
        <h2 class="shelf-title span">{grownupGroupLabel(settings.language, grownGroup)}</h2>
      {:else if category !== 'All'}
        <h2 class="shelf-title span">{category === 'Animals' && habitat !== 'all' ? habitatLabel(settings.language, habitat) : categoryLabel(settings.language, category)}</h2>
      {/if}
      {#each visible as puzzle (puzzle.id)}
        {@render picture(puzzle)}
      {:else}
        <p class="empty">{empty}</p>
      {/each}
    </div>
  {/if}
</div>
