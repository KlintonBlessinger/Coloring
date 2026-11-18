/** Join a Vite base (`/` or `/Coloring/`) with an app path such as `/color/`. */
export function joinSite(base: string, path: string): string {
  const root = base.endsWith('/') ? base : `${base}/`;
  return `${root}${path.replace(/^\/+/, '')}`;
}

/**
 * App path for a browser pathname.
 * `/` and `/Coloring/` both become `/`.
 * `/color/` and `/Coloring/color/` both become `/color/`.
 */
export function stripSite(base: string, pathname: string): string {
  const root = base.endsWith('/') ? base : `${base}/`;
  const prefix = root === '/' ? '' : root.slice(0, -1);
  let path = pathname || '/';
  if (prefix && (path === prefix || path.startsWith(`${prefix}/`))) {
    path = path.slice(prefix.length) || '/';
  }
  if (!path.startsWith('/')) path = `/${path}`;
  if (path === '/index.html' || path === '/index.html/') return '/';
  if (path.length > 1 && !path.endsWith('/')) path = `${path}/`;
  return path;
}

export function siteBase(): string {
  const value = import.meta.env?.BASE_URL || '/';
  return value.endsWith('/') ? value : `${value}/`;
}

export function siteUrl(path: string): string {
  return joinSite(siteBase(), path);
}

export function currentPath(): string {
  return stripSite(siteBase(), window.location.pathname);
}

/**
 * Color Cozy used to live at the site root. Links such as `/?open=<puzzle id>`
 * still open the book, now under `/color/`, with the query kept.
 */
export function legacyColorTarget(base: string, pathname: string, search: string): string | null {
  if (stripSite(base, pathname) !== '/') return null;
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  if (!params.get('open')) return null;
  const query = search ? (search.startsWith('?') ? search : `?${search}`) : '';
  return `${joinSite(base, '/color/')}${query}`;
}
