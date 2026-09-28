"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronDownIcon } from "@/components/icons";
import { buttonClass } from "@/components/ui";

interface Notice {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

/**
 * Unread messages and notices, in the header.
 *
 * Counts are fetched rather than rendered on the server, because the header
 * is on every page and a per-request count would make every page wait on a
 * query nobody navigated for. It refreshes when the tab is looked at and
 * every couple of minutes, which is the right frequency for "somebody has
 * written to you" and far short of anything worth calling live.
 */
export function NoticeBell({ messagesHref }: { messagesHref: string }) {
  const [counts, setCounts] = useState({ messages: 0, notices: 0 });
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const pathname = usePathname();
  const router = useRouter();

  const refresh = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const response = await fetch("/api/unread", { cache: "no-store" });
      if (!response.ok) return;
      setCounts(await response.json());
    } catch {
      // A count nobody can fetch is not worth an error on screen.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(refresh, 120_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh, pathname]);

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next) return;
    try {
      const response = await fetch("/api/notices", { cache: "no-store" });
      if (response.ok) {
        const body = (await response.json()) as { items: Notice[] };
        setNotices(body.items);
      }
    } catch {
      setNotices([]);
    }
  }

  async function open_(notice: Notice) {
    setOpen(false);
    try {
      await fetch(`/api/notices/${notice.id}/read`, { method: "POST" });
    } catch {
      // Marking it read is a convenience; going where it points is the point.
    }
    void refresh();
    if (notice.href) router.push(notice.href);
  }

  const total = counts.messages + counts.notices;

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        aria-label={
          total > 0 ? `Notifications, ${total} unread` : "Notifications"
        }
        className="relative flex items-center gap-1.5 rounded-lg border border-transparent px-2 py-1.5 text-sm transition hover:border-ink-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass-500"
      >
        <span aria-hidden="true" className="text-base leading-none">
          &#9993;
        </span>
        {total > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-brass-500 px-1 text-center font-mono text-[10px] font-semibold leading-4 text-ink-950">
            {total > 99 ? "99+" : total}
          </span>
        ) : null}
        <ChevronDownIcon
          className={`size-3 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="absolute right-0 top-full z-50 mt-1.5 w-80 rounded-xl border border-ink-800 bg-ink-900 p-1.5 shadow-xl shadow-black/10"
      >
        {/*
          A row, not one big link: the count beside it is a reading, not a
          control, and "Open all" says where pressing it goes. A link nested
          inside a link would be invalid anyway.
        */}
        <div className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm">
          <span>Messages</span>
          <span className="flex items-center gap-2">
            <Link
              href={messagesHref}
              onClick={() => setOpen(false)}
              className={buttonClass("secondary", "sm")}
            >
              Open all
            </Link>
            {counts.messages > 0 ? (
              <span className="rounded-full bg-brass-500 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink-950">
                {counts.messages}
              </span>
            ) : (
              <span className="text-xs text-ink-500">nothing unread</span>
            )}
          </span>
        </div>

        <div className="mt-1 border-t border-ink-800 pt-1">
          <p className="rule-label px-3 pt-1 pb-1">Notices</p>
          {notices === null ? (
            <p className="px-3 py-3 text-xs text-ink-400">Loading…</p>
          ) : notices.length === 0 ? (
            <p className="px-3 py-3 text-xs text-ink-400">Nothing yet.</p>
          ) : (
            <ul className="max-h-72 space-y-0.5 overflow-y-auto">
              {notices.map((notice) => (
                <li key={notice.id}>
                  <button
                    type="button"
                    onClick={() => open_(notice)}
                    className={`w-full rounded-lg px-3 py-2 text-left transition hover:bg-ink-800/70 ${
                      notice.readAt ? "opacity-60" : ""
                    }`}
                  >
                    <span className="flex items-start gap-2">
                      {!notice.readAt ? (
                        <span
                          aria-hidden="true"
                          className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brass-500"
                        />
                      ) : (
                        <span className="mt-1.5 size-1.5 shrink-0" />
                      )}
                      <span className="min-w-0">
                        <span className="block text-sm">{notice.title}</span>
                        {notice.body ? (
                          <span className="mt-0.5 block text-xs text-ink-400">
                            {notice.body}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
