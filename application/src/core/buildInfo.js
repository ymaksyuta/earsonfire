// __COMMIT_HASH__ / __COMMIT_TIME__ are replaced at build time (see
// vite.config.js, which shells out to `git rev-parse` / `git log`) —
// there's no runtime fallback needed here since vite.config.js itself
// already falls back to 'unknown' / '' when git isn't available.
export const COMMIT_HASH = __COMMIT_HASH__
export const COMMIT_TIME = __COMMIT_TIME__

// Human-readable "<hash> · <local date/time>" for display, or just the
// hash if the commit time couldn't be determined.
export function formatBuildInfo() {
  if (!COMMIT_TIME) return COMMIT_HASH
  const d = new Date(COMMIT_TIME)
  if (Number.isNaN(d.getTime())) return COMMIT_HASH
  return `${COMMIT_HASH} · ${d.toLocaleString()}`
}
