"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { ChevronDownIcon, CrossIcon, MenuIcon } from "@/components/icons";

export interface NavLink {
  label: string;
  href: string;
  /** One line under the label inside a menu: what is behind it. */
  hint?: string;
}

export interface NavGroup {
  label: string;
  items: readonly NavLink[];
}

export type NavEntry = NavLink | NavGroup;

const isGroup = (entry: NavEntry): entry is NavGroup => "items" in entry;

const linksOf = (entry: NavEntry): readonly NavLink[] =>
  isGroup(entry) ? entry.items : [entry];

/**
 * Longest match wins, so /admin/users lights "Users" rather than lighting
 * "Overview" (/admin) as well, and /governance/rx/<id> still lights Rx.
 */
function currentLink(
  entries: readonly NavEntry[],
  pathname: string,
): NavLink | null {
  let current: NavLink | null = null;
  for (const link of entries.flatMap(linksOf)) {
    const onIt = pathname === link.href || pathname.startsWith(`${link.href}/`);
    if (onIt && (current === null || link.href.length > current.href.length)) {
      current = link;
    }
  }
  return current;
}

const TAB =
  "inline-flex items-center gap-1.5 border-b-2 px-3 py-3 text-sm transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brass-500";
const TAB_ACTIVE = "border-brass-500 font-medium text-brass-500";
const TAB_IDLE =
  "border-transparent text-ink-400 hover:border-ink-700 hover:text-ink-100";

function MenuItem({
  link,
  active,
  onPick,
}: {
  link: NavLink;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <Link
      href={link.href}
      onClick={onPick}
      aria-current={active ? "page" : undefined}
      className={`block rounded-lg px-3 py-2 transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brass-500 ${
        active ? "bg-brass-500/10" : "hover:bg-ink-800/70"
      }`}
    >
      <span
        className={`block text-sm ${
          active ? "font-medium text-brass-500" : "text-ink-100"
        }`}
      >
        {link.label}
      </span>
      {link.hint ? (
        <span className="mt-0.5 block text-xs text-ink-400">{link.hint}</span>
      ) : null}
    </Link>
  );
}

/**
 * One group: a trigger in the bar and the destinations beneath it.
 *
 * Built as a disclosure -- a button that shows and hides a list of links --
 * rather than an ARIA menu, because these are places to go, not commands to
 * run, and a screen reader should announce them as links. A mouse opens it by
 * hovering; a press pins it open until something else is chosen; a keyboard
 * opens it with Enter, Space or the down arrow and leaves with Escape.
 */
function Group({
  group,
  current,
  open,
  alignEnd,
  onOpen,
  onClose,
}: {
  group: NavGroup;
  current: NavLink | null;
  open: boolean;
  /** For the last groups in the bar, so a menu never runs off the right edge. */
  alignEnd: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const panelId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLUListElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  // Whether the pointer merely passed over it, or somebody asked for it.
  // Only a menu that opened on hover closes when the pointer leaves.
  const openedBy = useRef<"hover" | "press">("press");
  const focusFirst = useRef(false);
  const holdsCurrent = group.items.some((item) => item.href === current?.href);

  useEffect(() => {
    if (open && focusFirst.current) {
      focusFirst.current = false;
      panel.current?.querySelector<HTMLElement>("a")?.focus();
    }
  }, [open]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const onPointerEnter = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    window.clearTimeout(closeTimer.current);
    if (!open) {
      openedBy.current = "hover";
      onOpen();
    }
  };

  const onPointerLeave = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || openedBy.current !== "hover") return;
    closeTimer.current = window.setTimeout(onClose, 200);
  };

  const onPress = () => {
    window.clearTimeout(closeTimer.current);
    if (!open) {
      openedBy.current = "press";
      onOpen();
    } else if (openedBy.current === "hover") {
      // Already showing because the pointer is over it: a press means "keep
      // it", not "close the thing I am about to click in".
      openedBy.current = "press";
    } else {
      onClose();
    }
  };

  const onTriggerKey = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openedBy.current = "press";
      focusFirst.current = true;
      if (open) panel.current?.querySelector<HTMLElement>("a")?.focus();
      else onOpen();
    } else if (event.key === "Escape" && open) {
      onClose();
    }
  };

  const onPanelKey = (event: KeyboardEvent) => {
    const links = Array.from(
      panel.current?.querySelectorAll<HTMLElement>("a") ?? [],
    );
    const at = links.indexOf(document.activeElement as HTMLElement);
    const move: Record<string, number> = {
      ArrowDown: (at + 1) % links.length,
      ArrowUp: (at - 1 + links.length) % links.length,
      Home: 0,
      End: links.length - 1,
    };
    if (event.key in move) {
      event.preventDefault();
      links[move[event.key]]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      trigger.current?.focus();
    }
  };

  // Tabbing out past the last link closes it, as leaving any menu should.
  const onBlur = (event: FocusEvent<HTMLLIElement>) => {
    if (open && !event.currentTarget.contains(event.relatedTarget as Node)) {
      onClose();
    }
  };

  return (
    <li
      className="relative"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onBlur={onBlur}
    >
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onPress}
        onKeyDown={onTriggerKey}
        className={`${TAB} ${
          holdsCurrent
            ? TAB_ACTIVE
            : open
              ? "border-ink-700 text-ink-100"
              : TAB_IDLE
        }`}
      >
        {group.label}
        <ChevronDownIcon
          className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <ul
        ref={panel}
        id={panelId}
        hidden={!open}
        onKeyDown={onPanelKey}
        className={`absolute top-full z-40 mt-1 w-72 space-y-0.5 rounded-xl border border-ink-800 bg-ink-900 p-1.5 shadow-xl shadow-black/10 ${
          alignEnd ? "right-0" : "left-0"
        }`}
      >
        {group.items.map((item) => (
          <li key={item.href}>
            <MenuItem
              link={item}
              active={item.href === current?.href}
              onPick={onClose}
            />
          </li>
        ))}
      </ul>
    </li>
  );
}

/**
 * The portal's navigation.
 *
 * Deliberately not styled as buttons. Bordered pills sat next to the Reset
 * and baseline buttons on the diagnostic screen and read as the same kind of
 * thing, which made a row of destinations look like a row of actions. A ruled
 * bar with an underlined current tab says "these are places" instead.
 *
 * Related destinations are grouped under one tab each, so an administrator
 * reads seven places rather than fourteen, and the tab that holds the page
 * you are on is the one underlined. On a phone the bar folds into one menu.
 *
 * It is a client component because it has to know where you are and which
 * menu is open. A navigation that cannot mark the current page is a list of
 * links.
 */
export function PortalNav({ entries }: { entries: readonly NavEntry[] }) {
  const pathname = usePathname();
  const current = currentLink(entries, pathname);
  const [open, setOpen] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const bar = useRef<HTMLElement>(null);
  const mobileId = useId();

  // Arriving somewhere closes whatever was open on the way.
  useEffect(() => {
    setOpen(null);
    setMobileOpen(false);
  }, [pathname]);

  // A press anywhere outside the bar closes an open menu.
  useEffect(() => {
    if (open === null) return;
    const away = (event: globalThis.PointerEvent) => {
      if (!bar.current?.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  return (
    <>
      <nav
        ref={bar}
        aria-label="Portal"
        className="mb-6 hidden border-b border-ink-800 md:block"
      >
        <ul className="-mb-px flex flex-wrap">
          {entries.map((entry, index) =>
            isGroup(entry) ? (
              <Group
                key={entry.label}
                group={entry}
                current={current}
                open={open === entry.label}
                alignEnd={index >= entries.length - 2}
                onOpen={() => setOpen(entry.label)}
                onClose={() =>
                  setOpen((shown) => (shown === entry.label ? null : shown))
                }
              />
            ) : (
              <li key={entry.href}>
                <Link
                  href={entry.href}
                  aria-current={entry.href === current?.href ? "page" : undefined}
                  className={`${TAB} ${entry.href === current?.href ? TAB_ACTIVE : TAB_IDLE}`}
                >
                  {entry.label}
                </Link>
              </li>
            ),
          )}
        </ul>
      </nav>

      <nav aria-label="Portal" className="mb-6 md:hidden">
        <button
          type="button"
          aria-expanded={mobileOpen}
          aria-controls={mobileId}
          onClick={() => setMobileOpen((shown) => !shown)}
          className="flex w-full items-center justify-between gap-3 rounded-lg border border-ink-800 bg-ink-900/80 px-3 py-2.5 text-sm transition hover:border-ink-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass-500"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            {mobileOpen ? (
              <CrossIcon className="size-4 shrink-0 text-ink-300" />
            ) : (
              <MenuIcon className="size-4 shrink-0 text-ink-300" />
            )}
            <span className="text-ink-400">Menu</span>
            {current ? (
              <span className="truncate font-medium text-brass-500">
                {current.label}
              </span>
            ) : null}
          </span>
          <ChevronDownIcon
            className={`size-4 shrink-0 text-ink-400 transition-transform ${
              mobileOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        <div
          id={mobileId}
          hidden={!mobileOpen}
          className="mt-2 rounded-xl border border-ink-800 bg-ink-900 p-2 shadow-xl shadow-black/10"
        >
          {entries.map((entry) =>
            isGroup(entry) ? (
              <div key={entry.label} className="mt-2 first:mt-0">
                <p className="rule-label px-3 pt-2 pb-1">{entry.label}</p>
                <ul className="space-y-0.5">
                  {entry.items.map((item) => (
                    <li key={item.href}>
                      <MenuItem
                        link={item}
                        active={item.href === current?.href}
                        onPick={() => setMobileOpen(false)}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <MenuItem
                key={entry.href}
                link={entry}
                active={entry.href === current?.href}
                onPick={() => setMobileOpen(false)}
              />
            ),
          )}
        </div>
      </nav>
    </>
  );
}
