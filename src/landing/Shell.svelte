<script lang="ts">
  import { SITE_NAME } from '../lib/brand';
  import { asset } from '../lib/vector';
  import { games, gameForPath } from '../lib/games/registry';
  import { currentPath, siteUrl } from '../lib/games/paths';
  import './shelf.css';

  let path = $state(currentPath());

  $effect(() => {
    const onPop = () => {
      path = currentPath();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  });

  const game = $derived(gameForPath(path));

  $effect(() => {
    document.title = game?.title ?? SITE_NAME;
  });
</script>

{#if game?.load}
  {#key game.id}
    {#await game.load()}
      <div class="screen">
        <p class="lede shelf-wait">Opening {game.title}…</p>
      </div>
    {:then module}
      <module.default />
    {:catch}
      <div class="shelf">
        <header class="gallery-head">
          <div class="brand">
            <span class="logo" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
            <div>
              <h1>{game.title}</h1>
              <p class="lede">Couldn’t open this game.</p>
            </div>
          </div>
        </header>
        <div class="game-list">
          <a class="btn wide" href={siteUrl('/')}>All games</a>
        </div>
      </div>
    {/await}
  {/key}
{:else if path === '/'}
  <div class="shelf" data-testid="game-shelf">
    <header class="gallery-head">
      <div class="brand">
        <span class="logo" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        <div>
          <h1>{SITE_NAME}</h1>
          <p class="lede">Tap a game. It works offline.</p>
        </div>
      </div>
    </header>
    <nav class="game-list" aria-label="Games">
      {#each games as item (item.id)}
        <a class="game-card" href={siteUrl(item.path)} data-testid="game-card" data-game={item.id}>
          <img src={asset(item.cover)} alt="" width="800" height="500" />
          <span class="game-copy">
            <span class="game-title">{item.title}</span>
            <span class="game-tag">{item.tagline}</span>
          </span>
        </a>
      {/each}
    </nav>
  </div>
{:else if game}
  <div class="shelf" data-testid="game-soon">
    <header class="gallery-head">
      <a class="icon-btn" href={siteUrl('/')} aria-label="All games" data-testid="all-games">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M4 11.5 12 4l8 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M7 10.5V20h10v-9.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
        </svg>
      </a>
      <div class="brand">
        <div>
          <h1>{game.title}</h1>
          <p class="lede">{game.tagline}</p>
        </div>
      </div>
    </header>
    <div class="game-list">
      <p class="game-tag">This game is almost ready.</p>
    </div>
  </div>
{:else}
  <div class="shelf">
    <header class="gallery-head">
      <div class="brand">
        <span class="logo" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        <div>
          <h1>{SITE_NAME}</h1>
          <p class="lede">That game is not on the shelf.</p>
        </div>
      </div>
    </header>
    <div class="game-list">
      <a class="btn wide" href={siteUrl('/')}>All games</a>
    </div>
  </div>
{/if}
