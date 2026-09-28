"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Empty, Panel } from "@/components/ui";
import { LocalTime } from "@/components/local-time";

export interface Person {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface InboxRow {
  id: string;
  with: Person;
  lastMessageAt: string;
  unread: number;
  preview: { body: string; mine: boolean; at: string } | null;
}

const ROLE_TONE: Record<
  string,
  "green" | "amber" | "blue" | "red" | "neutral"
> = {
  ADMIN: "red",
  MANAGER: "amber",
  INSTRUCTOR: "blue",
  STUDENT: "neutral",
};

const matches = (person: Person, term: string) =>
  `${person.name} ${person.email} ${person.role}`.toLowerCase().includes(term);

/**
 * The left column of the inbox: who you may write to, and who you have.
 *
 * One search box over both lists rather than one each, because the question
 * somebody actually has is "where is Mei" -- and whether Mei is an open
 * conversation or a name they have never written to is the answer, not the
 * question. Filtering happens here rather than on the server: both lists are
 * already in hand, and a round trip per keystroke to re-sift a list this size
 * would be slower than the typing.
 */
export function MessageLists({
  basePath,
  book,
  inbox,
  openId,
}: {
  basePath: string;
  book: Person[];
  inbox: InboxRow[];
  openId?: string;
}) {
  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();

  const shownBook = useMemo(
    () => (term ? book.filter((p) => matches(p, term)) : book),
    [book, term],
  );
  const shownInbox = useMemo(
    () => (term ? inbox.filter((row) => matches(row.with, term)) : inbox),
    [inbox, term],
  );

  return (
    <div className="space-y-4">
      <div>
        <label className="sr-only" htmlFor="people-search">
          Search people and conversations
        </label>
        <input
          id="people-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name, email or role"
          className="w-full rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-sm outline-none transition focus:border-brass-500"
        />
        {term ? (
          <p className="mt-1.5 text-[11px] text-ink-500">
            {shownInbox.length} conversation
            {shownInbox.length === 1 ? "" : "s"} &middot; {shownBook.length}{" "}
            {shownBook.length === 1 ? "person" : "people"} to write to
          </p>
        ) : null}
      </div>

      <Panel
        title="Start a conversation"
        hint={
          book.length === 0
            ? "There is nobody you can write to first."
            : "The people your role lets you write to."
        }
      >
        {book.length === 0 ? (
          <Empty>Nobody yet. Whoever needs to reach you will write first.</Empty>
        ) : shownBook.length === 0 ? (
          <Empty>Nobody you can write to matches that.</Empty>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {shownBook.map((person) => (
              <li key={person.id}>
                <Link
                  href={`${basePath}?to=${person.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-ink-800 px-3 py-2 text-sm transition hover:border-brass-500"
                >
                  <span className="min-w-0">
                    <span className="block truncate">{person.name}</span>
                    <span className="block truncate font-mono text-[11px] text-ink-500">
                      {person.email}
                    </span>
                  </span>
                  <Badge tone={ROLE_TONE[person.role] ?? "neutral"}>
                    {person.role}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel
        title="Conversations"
        hint={term ? `Matching “${query.trim()}”.` : undefined}
      >
        {inbox.length === 0 ? (
          <Empty>Nothing yet.</Empty>
        ) : shownInbox.length === 0 ? (
          <Empty>No conversation with anybody matching that.</Empty>
        ) : (
          <ul className="space-y-1">
            {shownInbox.map((row) => (
              <li key={row.id}>
                <Link
                  href={`${basePath}?c=${row.id}`}
                  aria-current={row.id === openId ? "page" : undefined}
                  className={`block rounded-lg border px-3 py-2 transition ${
                    row.id === openId
                      ? "border-brass-500 bg-brass-500/10"
                      : "border-ink-800 hover:border-brass-500/60"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">
                      {row.with.name}
                    </span>
                    {row.unread > 0 ? (
                      <span className="shrink-0 rounded-full bg-brass-500 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink-950">
                        {row.unread}
                      </span>
                    ) : null}
                  </span>
                  {row.preview ? (
                    <span className="mt-0.5 block truncate text-xs text-ink-400">
                      {row.preview.mine ? "You: " : ""}
                      {row.preview.body}
                    </span>
                  ) : null}
                  <span className="mt-0.5 block text-[11px] text-ink-500">
                    <LocalTime value={row.lastMessageAt} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

    </div>
  );
}
