import {
  lessonChips,
  type LessonBlock,
  type LessonContent,
} from "@aim/contracts";

const BLOCK_TONE: Record<string, string> = {
  KEY_INSIGHT: "border-l-signal-green bg-signal-green/5",
  CASE: "border-l-signal-blue bg-signal-blue/5",
  RULE: "border-l-brass-500 bg-brass-500/5",
  FORMULA: "border-l-brass-500 bg-ink-950/40",
  PRACTICE: "border-l-signal-amber bg-signal-amber/5",
  LIST: "border-l-ink-700",
  TERMS: "border-l-signal-blue bg-ink-950/40",
  REFERENCE: "border-l-ink-600 bg-ink-950/40",
  LINK: "border-l-brass-500",
  EXAMPLE: "border-l-signal-blue bg-signal-blue/5",
  NOTE: "border-l-ink-700 bg-ink-950/40",
};

/**
 * A link an author put in a lesson.
 *
 * Rendered as a link only for http(s). Anything else — a `javascript:` URL
 * being the one that matters — renders as text, so an author cannot put script
 * into a page through the address field.
 */
function SafeLink({ url, label }: { url: string; label: string }) {
  const safe = /^https?:\/\//i.test(url);
  if (!safe) return <span className="text-ink-300">{label}</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="text-brass-500 underline underline-offset-2 hover:text-brass-400"
    >
      {label}
    </a>
  );
}

function Callout({ block }: { block: LessonBlock }) {
  return (
    <div
      className={`my-3 rounded-lg border border-ink-800 border-l-2 px-4 py-3 ${
        BLOCK_TONE[block.kind] ?? "border-l-ink-700"
      }`}
    >
      {block.title ? <p className="rule-label mb-1.5">{block.title}</p> : null}
      {block.body ? (
        <p className="text-sm leading-relaxed text-ink-200">{block.body}</p>
      ) : null}

      {block.terms?.length ? (
        <dl className="mt-1 space-y-1.5">
          {block.terms.map((term, i) => (
            <div
              key={i}
              className="flex flex-wrap gap-x-2 text-sm leading-relaxed"
            >
              <dt className="font-medium text-brass-500">{term.term}</dt>
              <dd className="flex-1 text-ink-300">{term.definition}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {block.url || block.label ? (
        <p className="mt-1 text-sm">
          {block.url ? (
            <SafeLink url={block.url} label={block.label || block.url} />
          ) : (
            <span className="text-ink-300">{block.label}</span>
          )}
        </p>
      ) : null}

      {block.items?.length ? (
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink-200">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Renders a lesson from structure.
 *
 * Nothing here is markup from the database, so a lesson cannot carry styling,
 * script or layout of its own into the page: an author edits text, and the
 * interface decides how text looks.
 */
export function LessonView({ content }: { content: LessonContent }) {
  // Composed in contracts, so the author's live preview and the candidate's
  // page cannot disagree about what a header shows.
  const chips = lessonChips(content);

  return (
    <article className="space-y-5">
      {content.path?.length ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tracking-wide text-ink-400">
          {content.path.map((step, i) => (
            <span key={i} className="flex items-center gap-2">
              {step}
              {i < content.path!.length - 1 ? (
                <span className="text-ink-700">→</span>
              ) : null}
            </span>
          ))}
        </p>
      ) : null}

      {content.lead ? (
        <p className="text-sm leading-relaxed text-ink-200">{content.lead}</p>
      ) : null}

      {chips.length ? (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((stat) => (
            <span
              key={stat}
              className="rounded-md border border-ink-800 px-2.5 py-1 text-[11px] text-ink-400"
            >
              {stat}
            </span>
          ))}
        </div>
      ) : null}

      {content.overview ? (
        <section className="panel p-5">
          <h2 className="mb-2 text-sm font-semibold">Course Overview</h2>
          <p className="text-sm leading-relaxed text-ink-200">
            {content.overview}
          </p>
        </section>
      ) : null}

      {content.objectives?.length ? (
        <section className="panel p-5">
          <h2 className="mb-2 text-sm font-semibold">Learning Objectives</h2>
          {content.objectivesIntro ? (
            <p className="mb-2 text-sm text-ink-400">
              {content.objectivesIntro}
            </p>
          ) : null}
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-200">
            {content.objectives.map((objective, i) => (
              <li key={i}>{objective}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {content.sections.map((section, i) => (
        <section key={i} className="panel p-5">
          <div className="flex gap-4">
            {section.number ? (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-ink-800 font-mono text-xs text-brass-500">
                {section.number}
              </span>
            ) : null}
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold tracking-tight">
                {section.heading}
              </h2>
              {section.paragraphs?.map((paragraph, p) => (
                <p
                  key={p}
                  className="mt-2 text-sm leading-relaxed text-ink-200"
                >
                  {paragraph}
                </p>
              ))}
              {section.blocks?.map((block, b) => (
                <Callout key={b} block={block} />
              ))}
            </div>
          </div>
        </section>
      ))}
    </article>
  );
}
