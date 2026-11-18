/** True for /word-search and /word-search/, including a mounted base path. */
export function isWordSearchPath(pathname: string, base = '/'): boolean {
  const root = base.endsWith('/') ? base.slice(0, -1) : base;
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return path === `${root}/word-search` || path.endsWith('/word-search');
}
