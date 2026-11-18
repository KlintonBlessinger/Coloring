import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { SITE_DESCRIPTION, SITE_NAME } from './src/lib/brand.ts';

const base = process.env.PAGES_BASE || '/';

/** GitHub Pages has no SPA fallback. Copy the shell so / and /color/ both boot. */
function spaCopies(): Plugin {
  let outDir = resolve('dist');
  return {
    name: 'games-spa-copies',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle: {
      sequential: true,
      order: 'pre',
      handler() {
        const index = resolve(outDir, 'index.html');
        for (const fileName of ['color/index.html', '404.html']) {
          const file = resolve(outDir, fileName);
          mkdirSync(dirname(file), { recursive: true });
          copyFileSync(index, file);
        }
      },
    },
  };
}

export default defineConfig({
  base,
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png', 'games/word-search-cover.svg'],
      manifest: {
        name: SITE_NAME,
        short_name: SITE_NAME,
        description: SITE_DESCRIPTION,
        theme_color: '#f4efe6',
        background_color: '#f4efe6',
        display: 'standalone',
        orientation: 'portrait',
        // The shelf. Scope stays the site root so /color/ is inside the same app.
        start_url: base,
        scope: base,
        id: base,
        lang: 'en',
        categories: ['games'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,jpeg,woff2,webmanifest}'],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /\/puzzles\/.*\.json\.(gz|br)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'puzzles',
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
    spaCopies(),
  ],
});
