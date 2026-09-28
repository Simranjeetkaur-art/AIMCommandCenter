import Link from "next/link";
import type { Role } from "@aim/contracts";

/**
 * The four routes of the method: assess, prescribe, qualify, certify.
 *
 * One component for the Command Dashboard and the student dashboard, so the
 * cards cannot drift apart. Where each card leads depends on the role, because
 * "the Academy" is a syllabus to a manager and a set of lessons to a candidate.
 */
interface Route {
  eyebrow: string;
  title: string;
  glyph: string;
  blurb: string;
  action: string;
  href: string;
  tint: string;
}

export function routesFor(role: Role): Route[] {
  const academy =
    role === "STUDENT"
      ? "/student/academy"
      : role === "INSTRUCTOR"
        ? "/instructor/learners"
        : "/authoring";

  const certification =
    role === "STUDENT"
      ? "/student/certification"
      : role === "ADMIN"
        ? "/admin/credentials"
        : role === "MANAGER"
          ? "/manager/credentials"
          : "/instructor/learners";

  return [
    {
      eyebrow: "Assess",
      title: "AIM™ Dx",
      glyph: "⌕",
      blurb:
        "Evaluate autonomy across eleven dimensions and calculate the AIM™ Autonomy Index.",
      action: "Start assessment",
      href: "/governance/dx",
      tint: "border-signal-blue/30 hover:border-signal-blue/70",
    },
    {
      eyebrow: "Prescribe",
      title: "AIM™ Rx",
      glyph: "◇",
      blurb:
        "Translate risk into an authority envelope, A/G/H/X boundaries and Last Command controls.",
      action: "Build controls",
      href: "/governance/rx",
      tint: "border-signal-amber/30 hover:border-signal-amber/70",
    },
    {
      eyebrow: "Qualify",
      title: "AIM™ Academy",
      glyph: "◆",
      blurb: "Train through command missions, scenarios and assessments.",
      action: "Enter academy",
      href: academy,
      tint: "border-signal-green/30 hover:border-signal-green/70",
    },
    {
      eyebrow: "Certify",
      title: "Certification",
      glyph: "◎",
      blurb: "Demonstrate competency and earn the AIM™ credential.",
      action: "View certification",
      href: certification,
      tint: "border-brass-500/30 hover:border-brass-500/70",
    },
  ];
}

/** The four cards. `compact` fits them in one row above a dashboard. */
export function CommandRoutes({
  role,
  compact = false,
}: {
  role: Role;
  compact?: boolean;
}) {
  return (
    <div
      className={`grid gap-4 ${compact ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2"}`}
    >
      {routesFor(role).map((route) => (
        <Link
          key={route.title}
          href={route.href}
          className={`panel flex gap-4 transition ${compact ? "p-4" : "p-5"} ${route.tint}`}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-ink-700 text-lg text-brass-500">
            {route.glyph}
          </span>
          <span className="min-w-0">
            <span className="rule-label block">{route.eyebrow}</span>
            <span
              className={`mt-1 block font-semibold tracking-tight ${compact ? "text-base" : "text-lg"}`}
            >
              {route.title}
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-ink-400">
              {route.blurb}
            </span>
            <span className="mt-3 block text-xs font-medium text-brass-500">
              {route.action} &rarr;
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
