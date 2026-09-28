import "server-only";

/**
 * Which build of this app a page was rendered by.
 *
 * Evaluated once when the server process starts, so it changes exactly when
 * the app is redeployed and never in between. A page carries the id it was
 * rendered with; `BuildWatch` compares that against the running server and
 * tells the reader when their tab has gone stale.
 *
 * Not a secret, and nothing is decided by it: it is a cache-busting token,
 * so an opaque random value is the right shape rather than a version number
 * that would invite someone to read meaning into it.
 */
export const BUILD_ID =
  process.env.BUILD_ID ??
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
