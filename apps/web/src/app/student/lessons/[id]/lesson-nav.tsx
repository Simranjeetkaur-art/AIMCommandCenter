"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDownIcon } from "@/components/icons";

export interface OutlineModule {
  id: string;
  code: string | null;
  title: string;
  position: number;
  lessons: Array<{
    id: string;
    title: string;
    estimatedMinutes: number;
    completed: boolean;
  }>;
}

/**
 * Jumping anywhere in the track without going back to the track page.
 *
 * A disclosure rather than a `<select>`: the list carries a completion mark
 * and a module heading per group, and an option element can carry neither.
 */
export function LessonJump({
  outline,
  currentId,
}: {
  outline: OutlineModule[];
  currentId: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const total = outline.reduce((n, m) => n + m.lessons.length, 0);
  const done = outline.reduce(
    (n, m) => n + m.lessons.filter((l) => l.completed).length,
    0,
  );

  return (
    <div
      ref={root}
      className="relative"
      onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-ink-800 px-3 py-2 text-xs transition hover:border-brass-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass-500"
      >
        <span className="text-ink-200">Jump to module</span>
        <span className="font-mono tabular-nums text-ink-400">
          {done}/{total}
        </span>
        <ChevronDownIcon
          className={`size-3.5 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="absolute right-0 top-full z-40 mt-1.5 max-h-[28rem] w-80 overflow-y-auto rounded-xl border border-ink-800 bg-ink-900 p-1.5 shadow-xl shadow-black/10"
      >
        {outline.map((module) => (
          <div key={module.id} className="mt-2 first:mt-0">
            <p className="rule-label px-3 pt-1 pb-1">
              {module.code ?? `Module ${module.position}`}
              <span className="ml-1.5 normal-case text-ink-400">
                {module.title}
              </span>
            </p>
            <ul className="space-y-0.5">
              {module.lessons.map((lesson) => {
                const here = lesson.id === currentId;
                return (
                  <li key={lesson.id}>
                    <Link
                      href={`/student/lessons/${lesson.id}`}
                      aria-current={here ? "page" : undefined}
                      onClick={() => setOpen(false)}
                      className={`flex items-start gap-2 rounded-lg px-3 py-1.5 text-xs transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brass-500 ${
                        here
                          ? "bg-brass-500/10 text-brass-500"
                          : "text-ink-100 hover:bg-ink-800/70"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`mt-px shrink-0 font-mono ${
                          lesson.completed ? "text-signal-green" : "text-ink-600"
                        }`}
                      >
                        {lesson.completed ? "✓" : "○"}
                      </span>
                      <span className="flex-1">{lesson.title}</span>
                      {lesson.completed ? (
                        <span className="sr-only">Completed</span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
