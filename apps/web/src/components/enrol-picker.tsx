"use client";

import { useMemo, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui";

export interface Candidate {
  id: string;
  name: string;
  email: string;
  /** Already on this cohort. Shown, ticked and locked, never hidden. */
  enrolled: boolean;
  /**
   * On a different cohort of this same course, which the server refuses. The
   * cohort is named, because "you cannot" without "because" sends somebody
   * hunting through three screens for the reason.
   */
  blockedBy: string | null;
}

/**
 * Choosing who goes on a cohort.
 *
 * A single-select dropdown was the whole of this before, and it had two
 * faults that are really one fault: it showed only people who could be added,
 * so there was no way to tell whether somebody was already on the cohort or
 * simply absent from a list of two hundred; and adding ten people meant ten
 * round trips through a collapsed menu.
 *
 * So: everybody is listed. Those already on the roll are ticked and fixed,
 * those blocked by another cohort of the same course say which one, and the
 * rest can be selected in any number and placed in one act.
 */
export function EnrolPicker({
  candidates,
  action,
}: {
  candidates: Candidate[];
  action: (formData: FormData) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const shown = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return candidates;
    return candidates.filter((c) =>
      `${c.name} ${c.email}`.toLowerCase().includes(term),
    );
  }, [candidates, query]);

  const selectable = shown.filter((c) => !c.enrolled && !c.blockedBy);
  const allShownPicked =
    selectable.length > 0 && selectable.every((c) => picked.has(c.id));

  function toggle(id: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const already = candidates.filter((c) => c.enrolled).length;

  return (
    <form action={action} className="space-y-3">
      {[...picked].map((id) => (
        <input key={id} type="hidden" name="userIds" value={id} />
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name or email"
          className="min-w-56 flex-1 rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-sm outline-none focus:border-brass-500"
        />
        <button
          type="button"
          onClick={() =>
            setPicked((current) => {
              const next = new Set(current);
              if (allShownPicked) selectable.forEach((c) => next.delete(c.id));
              else selectable.forEach((c) => next.add(c.id));
              return next;
            })
          }
          disabled={selectable.length === 0}
          className="rounded-lg border border-ink-700 px-3 py-2 text-xs transition hover:border-brass-500 hover:text-brass-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {allShownPicked ? "Clear these" : `Select these ${selectable.length}`}
        </button>
      </div>

      <ul className="max-h-80 space-y-1 overflow-y-auto rounded-lg border border-ink-800 p-1.5">
        {shown.length === 0 ? (
          <li className="px-3 py-6 text-center text-xs text-ink-400">
            Nobody matches &ldquo;{query}&rdquo;.
          </li>
        ) : (
          shown.map((candidate) => {
            const locked = candidate.enrolled || Boolean(candidate.blockedBy);
            const chosen = picked.has(candidate.id);
            return (
              <li key={candidate.id}>
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition ${
                    candidate.enrolled
                      ? "cursor-default border-signal-green/40 bg-signal-green/10"
                      : candidate.blockedBy
                        ? "cursor-not-allowed border-ink-800 opacity-60"
                        : chosen
                          ? "border-brass-500 bg-brass-500/10"
                          : "border-ink-800 hover:border-brass-500/60 hover:bg-ink-800/50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={candidate.enrolled || chosen}
                    disabled={locked}
                    onChange={() => toggle(candidate.id)}
                    className="h-4 w-4 shrink-0 accent-[var(--color-brass-500)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">
                      {candidate.name}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-ink-500">
                      {candidate.email}
                    </span>
                  </span>
                  {candidate.enrolled ? (
                    <Badge tone="green">On this cohort</Badge>
                  ) : candidate.blockedBy ? (
                    <Badge tone="amber">On {candidate.blockedBy}</Badge>
                  ) : null}
                </label>
              </li>
            );
          })
        )}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton size="md" disabled={picked.size === 0} pendingLabel="Enrolling…">
          {picked.size === 0
            ? "Select candidates to enrol"
            : `Enrol ${picked.size} candidate${picked.size === 1 ? "" : "s"}`}
        </SubmitButton>
        {picked.size > 0 ? (
          <button
            type="button"
            onClick={() => setPicked(new Set())}
            className="text-xs text-ink-400 hover:text-ink-100"
          >
            Clear selection
          </button>
        ) : null}
        <span className="text-xs text-ink-400">
          {already} already on this cohort &middot; {candidates.length - already}{" "}
          not
        </span>
      </div>
    </form>
  );
}
