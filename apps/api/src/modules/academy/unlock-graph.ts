/**
 * One track's credential requirements, as edges.
 *
 * `code` is the track; `requires` are the tracks whose credentials open it.
 * Both active and inactive rules belong here -- see `reachesOrigin`.
 */
export interface TrackEdges {
  code: string;
  requires: readonly string[];
}

/** How far the walk will follow a chain before giving up. */
export const MAX_LADDER_DEPTH = 12;

/**
 * Would requiring `target` eventually lead back to `origin`?
 *
 * Walks forward from the track being required and reports whether the chain
 * arrives back at the track doing the requiring. If it does, neither track can
 * ever be entered: each is waiting on a credential the other gates.
 *
 * `lookup` is asked for one batch of tracks at a time so the caller can answer
 * it with a single query per level rather than one per node.
 */
export async function reachesOrigin(
  originCode: string,
  targetCode: string,
  lookup: (codes: readonly string[]) => Promise<readonly TrackEdges[]>,
): Promise<boolean> {
  if (originCode === targetCode) return true;

  const seen = new Set<string>([originCode]);
  let frontier: string[] = [targetCode];

  for (
    let depth = 0;
    depth < MAX_LADDER_DEPTH && frontier.length > 0;
    depth += 1
  ) {
    const nodes = await lookup(frontier);
    const next: string[] = [];

    for (const node of nodes) {
      if (node.code === originCode) return true;
      // A track already walked contributes nothing new, and revisiting it
      // would make a diamond-shaped ladder loop forever.
      if (seen.has(node.code)) continue;
      seen.add(node.code);
      next.push(...node.requires);
    }

    frontier = next.filter((code) => !seen.has(code) || code === originCode);
  }

  return false;
}
