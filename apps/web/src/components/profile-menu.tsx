"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDownIcon, LockIcon } from "@/components/icons";

/**
 * The signed-in person, and the things that belong to them rather than to a
 * portal: their account, and leaving.
 *
 * A disclosure like the portal menus, for the same reason -- these are places
 * and one form, not commands -- and it opens on a press only. A profile menu
 * that opened on hover would drop over the Sign out button's old position
 * every time the pointer crossed the header.
 */
export function ProfileMenu({
  name,
  email,
  role,
  previewRole,
  logout,
}: {
  name: string;
  email?: string;
  role: string;
  previewRole: string | null;
  logout: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    }
  };

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div
      ref={root}
      className="relative"
      onKeyDown={onKey}
      onBlur={(event) => {
        if (open && !root.current?.contains(event.relatedTarget as Node)) {
          setOpen(false);
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((shown) => !shown)}
        className="flex items-center gap-2.5 rounded-lg border border-transparent px-2 py-1.5 text-left transition select-none hover:border-ink-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass-500 aria-expanded:border-ink-700"
      >
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-full bg-brass-500/15 font-mono text-xs font-semibold text-brass-500"
        >
          {initials || "?"}
        </span>
        <span className="hidden sm:block">
          <span className="block text-sm font-medium leading-tight">
            {name}
          </span>
          <span className="block font-mono text-[11px] uppercase tracking-wide text-brass-500">
            {role}
            {previewRole ? (
              <span className="text-signal-amber"> · viewing {previewRole}</span>
            ) : null}
          </span>
        </span>
        <ChevronDownIcon
          className={`size-3.5 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="absolute right-0 top-full z-50 mt-1.5 w-64 rounded-xl border border-ink-800 bg-ink-900 p-1.5 shadow-xl shadow-black/10"
      >
        <div className="border-b border-ink-800 px-3 pt-2 pb-2.5">
          <p className="truncate text-sm font-medium">{name}</p>
          {email ? (
            <p className="truncate text-xs text-ink-400">{email}</p>
          ) : null}
          <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-brass-500">
            {role}
          </p>
        </div>

        <ul className="py-1">
          <li>
            <Link
              href="/account/profile"
              aria-current={
                pathname.startsWith("/account/profile") ? "page" : undefined
              }
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-100 transition hover:bg-ink-800/70 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brass-500"
            >
              <span aria-hidden className="flex size-4 items-center justify-center text-ink-400">
                ◉
              </span>
              <span>
                Profile
                <span className="block text-xs text-ink-400">
                  Organisation, role and contact details
                </span>
              </span>
            </Link>
          </li>
          <li>
            <Link
              href="/account/security"
              aria-current={
                pathname.startsWith("/account/security") ? "page" : undefined
              }
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-100 transition hover:bg-ink-800/70 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brass-500"
            >
              <LockIcon className="size-4 text-ink-400" />
              <span>
                Account &amp; security
                <span className="block text-xs text-ink-400">
                  Password and sign-in protection
                </span>
              </span>
            </Link>
          </li>
        </ul>

        <form action={logout} className="border-t border-ink-800 pt-1">
          <button
            type="submit"
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-signal-red transition hover:bg-signal-red/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brass-500"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
