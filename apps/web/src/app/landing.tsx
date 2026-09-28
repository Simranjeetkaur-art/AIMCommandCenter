import Link from "next/link";
import { AIM_PASS_MARK, AIM_TRACKS, AIM_TRACK_META } from "@aim/contracts";
import { Wordmark } from "@/components/brand";
import { Gauge } from "@/components/charts";
import {
  AdminIcon,
  ArrowRightIcon,
  CheckIcon,
  LockIcon,
  LogIcon,
} from "@/components/icons";
import { AAI_ARC } from "@/components/overview-tiles";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge, buttonClass } from "@/components/ui";
import { ROLE_DIRECTORY } from "@/lib/role-directory";

/** The method, in the order it runs. Same four routes as the command dashboard. */
const METHOD = [
  {
    eyebrow: "Assess",
    title: "AIM™ Dx",
    glyph: "⌕",
    blurb:
      "Evaluate each agent's autonomy across eleven dimensions and calculate its AIM™ Autonomy Index.",
    tint: "border-signal-blue/30",
  },
  {
    eyebrow: "Prescribe",
    title: "AIM™ Rx",
    glyph: "◇",
    blurb:
      "Translate risk into an authority envelope, A/G/H/X boundaries and Last Command controls.",
    tint: "border-signal-amber/30",
  },
  {
    eyebrow: "Qualify",
    title: "AIM™ Academy",
    glyph: "◆",
    blurb:
      "Train the people who hold that authority through command missions, scenarios and assessments.",
    tint: "border-signal-green/30",
  },
  {
    eyebrow: "Certify",
    title: "Certification",
    glyph: "◎",
    blurb:
      "Demonstrate competency and earn an AIM™ credential, with its own serial and history.",
    tint: "border-brass-500/30",
  },
];

/**
 * The seeded register, as the administrator's overview shows it. Illustrative
 * only: nothing on this page reads from the API, because nobody here is signed
 * in to be shown anything real.
 */
const SAMPLE_AGENTS = [
  {
    code: "OPS-AI-07",
    name: "Operations Optimisation Agent",
    band: "Critical",
    tone: "red",
    score: 81.8,
  },
  {
    code: "SOC-AI-03",
    name: "Security Response Agent",
    band: "Critical",
    tone: "red",
    score: 78.2,
  },
  {
    code: "AP-AI-01",
    name: "Accounts Payable Agent",
    band: "Elevated",
    tone: "amber",
    score: 60,
  },
] as const;

const TRACKS = Object.values(AIM_TRACKS);

const PRINCIPLES = [
  {
    Icon: LockIcon,
    title: "Sessions held server-side",
    text: "Credentials are exchanged on the server. The browser never holds a token it could replay.",
  },
  {
    Icon: LogIcon,
    title: "An append-only audit log",
    text: "Every action is recorded, and a refused attempt is recorded exactly as a successful one is.",
  },
  {
    Icon: AdminIcon,
    title: "Enforced, not hidden",
    text: "What a role cannot do is refused by the server, not merely left out of the interface.",
  },
];

const SECTIONS = [
  { href: "#method", label: "How it works" },
  { href: "#certification", label: "Certification" },
  { href: "#portals", label: "Portals" },
];

/**
 * Every card on the page answers the pointer the same way: the border warms
 * to brass and the card lifts a step. A colour and a lift, never a size
 * change, so nothing beside it moves.
 */
const CARD_HOVER =
  "transition duration-200 hover:-translate-y-0.5 hover:border-brass-500/60 hover:shadow-lg hover:shadow-brass-500/5 motion-reduce:transition-none motion-reduce:hover:translate-y-0";

/** Underline that draws in from the left, for text links in the header and footer. */
const LINK_HOVER =
  "relative transition hover:text-brass-500 after:absolute after:inset-x-0 after:-bottom-1 after:h-px after:origin-left after:scale-x-0 after:bg-brass-500 after:transition-transform hover:after:scale-x-100 focus-visible:text-brass-500 focus-visible:after:scale-x-100 focus-visible:outline-none";

function SectionHeading({
  eyebrow,
  title,
  lead,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="font-mono text-[11px] tracking-[0.12em] text-brass-500 uppercase">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        {title}
      </h2>
      {lead ? (
        <p className="mt-4 text-base leading-relaxed text-pretty text-ink-400">
          {lead}
        </p>
      ) : null}
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-ink-800 bg-ink-950/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/"
          aria-label="AIM Command Center home"
          className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brass-500"
        >
          <Wordmark />
        </Link>

        <nav
          aria-label="Sections"
          className="hidden items-center gap-7 text-sm text-ink-300 md:flex"
        >
          {SECTIONS.map((section) => (
            <a
              key={section.href}
              href={section.href}
              className={LINK_HOVER}
            >
              {section.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden lg:block">
            <ThemeToggle />
          </div>
          <Link href="/login" className={buttonClass("secondary", "lg")}>
            Log in
          </Link>
          <Link href="/register" className={buttonClass("primary", "lg")}>
            Sign up
          </Link>
        </div>
      </div>
    </header>
  );
}

/** What the inside looks like, drawn with the portal's own components. */
function CommandPreview() {
  return (
    <div
      role="img"
      aria-label="An example AIM Dx register: three governed agents with a mean autonomy index of 73.3, beside a newly issued AIM Certified Practitioner credential."
      className="relative mx-auto w-full max-w-md lg:max-w-lg"
    >
      <div
        aria-hidden="true"
        className="absolute -inset-8 -z-10 rounded-[2.5rem] bg-brass-500/10 blur-3xl"
      />

      <div className="rounded-2xl border border-ink-800 bg-ink-900 p-5 shadow-2xl shadow-black/10 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="rule-label">AIM Dx — the register</p>
            <p className="mt-1 text-sm font-semibold">3 governed agents</p>
          </div>
          <Badge tone="amber">Watch</Badge>
        </div>

        <div className="mt-4 flex justify-center">
          <Gauge
            value={73.3}
            label="mean AAI across the register"
            bands={AAI_ARC}
            size={190}
          />
        </div>

        <ul className="mt-5 space-y-2">
          {SAMPLE_AGENTS.map((agent) => (
            <li
              key={agent.code}
              className="flex items-center gap-3 rounded-lg border border-ink-800 bg-ink-950/60 px-3 py-2 text-xs"
            >
              <span className="font-mono text-brass-500">{agent.code}</span>
              <span className="min-w-0 flex-1 truncate text-ink-200">
                {agent.name}
              </span>
              <Badge tone={agent.tone}>{agent.band}</Badge>
              <span className="w-9 text-right font-mono text-ink-100 tabular-nums">
                {agent.score}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Tucked under the register by exactly its bottom padding, so it
          overlaps the card's edge and none of what the card says. */}
      <div className="relative -mt-6 ml-4 w-64 rounded-xl border border-ink-800 bg-ink-900 p-4 shadow-xl shadow-black/10 sm:-ml-8">
        <div className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-full bg-signal-green/15 text-signal-green">
            <CheckIcon className="size-3.5" strokeWidth={3} />
          </span>
          <span className="rule-label">Credential issued</span>
        </div>
        <p className="mt-2 text-sm font-semibold">
          {AIM_TRACK_META["AIM-CP"].title}
        </p>
        <p className="mt-0.5 font-mono text-[11px] text-ink-400">
          AIM-2026-7C1E4A9B
        </p>
      </div>
    </div>
  );
}

function Hero() {
  return (
    // minmax(0, …) columns: a plain auto or fr track grows to fit the widest
    // unbreakable line inside it, and the agent names would push the preview
    // off the side of a phone.
    <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-16 px-4 pt-12 pb-20 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:pt-20 lg:pb-28">
      <div>
        <p className="inline-flex items-center gap-2 rounded-full border border-brass-500/40 bg-brass-500/10 px-3 py-1 font-mono text-[11px] tracking-[0.18em] text-brass-500 uppercase">
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full bg-brass-500"
          />
          The Last Command
        </p>
        {/* One sentence to a line, as the brand banner sets it. Left to wrap,
            "A" strands itself at the end of the second line. */}
        <h1 className="mt-6 text-4xl leading-[1.08] font-semibold tracking-tight sm:text-5xl lg:text-6xl">
          <span className="block">Human judgment.</span>
          <span className="block">AI capability.</span>
          <span className="block text-brass-500">A safer tomorrow.</span>
        </h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-pretty text-ink-300 sm:text-lg">
          AIM™ separates human command readiness from machine authority risk.
          Assess the authority your AI agents hold, prescribe the controls that
          bound it, and train and certify the people who keep the last command.
        </p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <Link href="/register" className={buttonClass("primary", "lg")}>
            Create an account
            <ArrowRightIcon className="size-4" />
          </Link>
          <Link href="/login" className={buttonClass("secondary", "lg")}>
            Log in
          </Link>
        </div>
        <p className="mt-5 text-xs leading-relaxed text-ink-400">
          Candidates enrol themselves in a minute. Instructor, manager and
          administrator roles are granted by an administrator.
        </p>
      </div>

      <CommandPreview />
    </section>
  );
}

function Method() {
  return (
    <section
      id="method"
      className="scroll-mt-16 border-y border-ink-800 bg-ink-900/40"
    >
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <SectionHeading
          eyebrow="How it works"
          title="Four routes, in the order the method runs."
          lead="Assess the authority that already exists, prescribe the controls that bound it, qualify the people who will hold it, and certify that they can."
        />
        <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {METHOD.map((step, index) => (
            <li
              key={step.title}
              className={`rounded-xl border bg-ink-900/80 p-5 ${step.tint} ${CARD_HOVER}`}
            >
              <div className="flex items-center justify-between">
                <span
                  aria-hidden="true"
                  className="flex size-10 items-center justify-center rounded-full border border-ink-700 text-lg text-brass-500"
                >
                  {step.glyph}
                </span>
                <span className="font-mono text-xs text-ink-500">
                  0{index + 1}
                </span>
              </div>
              <p className="rule-label mt-5">{step.eyebrow}</p>
              <h3 className="mt-1 text-lg font-semibold tracking-tight">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-400">
                {step.blurb}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Certification() {
  return (
    <section
      id="certification"
      className="mx-auto max-w-6xl scroll-mt-16 px-4 py-20 sm:px-6 lg:py-24"
    >
      <SectionHeading
        eyebrow="Certification"
        title="Three levels. One standard."
        lead={`Each level is its own programme of modules, lessons and assessments. Every assessment passes at ${AIM_PASS_MARK}%, and every credential carries its own serial and an auditable history.`}
      />
      <ol className="mt-12 grid gap-6 lg:grid-cols-3">
        {TRACKS.map((code, index) => (
          <li
            key={code}
            className={`relative rounded-xl border border-ink-700 bg-ink-900/80 p-6 ${CARD_HOVER}`}
          >
            <div className="flex items-center justify-between">
              <Badge>Level {index + 1}</Badge>
              {/* Rank pips: how far up the ladder this level sits. */}
              <span aria-hidden="true" className="flex gap-1">
                {TRACKS.map((_, pip) => (
                  <span
                    key={pip}
                    className={`h-1.5 w-5 rounded-full ${
                      pip <= index ? "bg-brass-500" : "bg-ink-800"
                    }`}
                  />
                ))}
              </span>
            </div>
            <p className="mt-5 font-mono text-sm font-semibold text-brass-500">
              {code}
            </p>
            <h3 className="mt-1 text-xl font-semibold tracking-tight">
              {AIM_TRACK_META[code].title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-400">
              {AIM_TRACK_META[code].subtitle}
            </p>
            {index < TRACKS.length - 1 ? (
              <ArrowRightIcon className="absolute top-1/2 -right-5 z-10 hidden size-4 -translate-y-1/2 text-ink-500 lg:block" />
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Portals() {
  return (
    <section
      id="portals"
      className="scroll-mt-16 border-y border-ink-800 bg-ink-900/40"
    >
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <SectionHeading
          eyebrow="Who it is for"
          title="One platform, four portals."
          lead="Everybody signs in at the same door and lands in the portal their role allows. The server decides what each role may do, and records every attempt either way."
        />
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ROLE_DIRECTORY.map(({ role, scope, detail, Icon }) => (
            <li
              key={role}
              className={`rounded-xl border border-ink-700 bg-ink-900/80 p-5 ${CARD_HOVER}`}
            >
              <span className="flex size-10 items-center justify-center rounded-lg border border-ink-700 bg-ink-950/60 text-brass-500">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-5 text-base font-semibold">{role}</h3>
              <p className="mt-1 font-mono text-[11px] tracking-wide text-brass-500 uppercase">
                {scope}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink-400">
                {detail}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Principles() {
  return (
    <section className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.3fr] lg:gap-16 lg:py-24">
      <SectionHeading
        eyebrow="Built to be trusted"
        title="Authority you can audit."
        lead="AI provides the intelligence. AIM™ governs the authority. Humans retain the command."
      />
      <ul className="space-y-4">
        {PRINCIPLES.map(({ Icon, title, text }) => (
          <li
            key={title}
            className={`flex gap-4 rounded-xl border border-ink-700 bg-ink-900/80 p-5 ${CARD_HOVER}`}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brass-500/10 text-brass-500">
              <Icon className="size-5" />
            </span>
            <div>
              <h3 className="text-base font-semibold">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-400">
                {text}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

const FOOTER_COLUMNS = [
  {
    heading: "Explore",
    links: SECTIONS,
  },
  {
    heading: "Account",
    links: [
      { href: "/login", label: "Log in" },
      { href: "/register", label: "Create an account" },
      { href: "/login/forgot", label: "Forgotten password" },
    ],
  },
];

/**
 * The footer: the brand and its promise on the left, the ways around the site
 * on the right, and a bottom rule carrying the copyright and the theme.
 *
 * A brass hairline across the top marks where the page ends, since the call to
 * action that used to sit above it is gone.
 */
function Footer() {
  return (
    <footer className="relative border-t border-ink-800 bg-ink-900/40">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 -top-px h-px bg-linear-to-r from-transparent via-brass-500/60 to-transparent"
      />
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-10 py-14 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] md:gap-12">
          <div className="max-w-sm">
            <Link
              href="/"
              aria-label="AIM Command Center home"
              className="inline-block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brass-500"
            >
              <Wordmark />
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-ink-400">
              AI provides the intelligence. AIM™ governs the authority. Humans
              retain the command.
            </p>
            <ul className="mt-6 flex flex-wrap gap-2">
              {PRINCIPLES.map(({ Icon, title }) => (
                <li
                  key={title}
                  className="inline-flex items-center gap-1.5 rounded-full border border-ink-700 px-2.5 py-1 text-[11px] text-ink-300 transition hover:border-brass-500/60 hover:text-brass-500"
                >
                  <Icon className="size-3.5" />
                  {title}
                </li>
              ))}
            </ul>
          </div>

          {FOOTER_COLUMNS.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <p className="font-mono text-[11px] tracking-[0.12em] text-brass-500 uppercase">
                {column.heading}
              </p>
              <ul className="mt-4 space-y-3 text-sm text-ink-300">
                {column.links.map((link) => (
                  <li key={link.href}>
                    {link.href.startsWith("#") ? (
                      <a href={link.href} className={LINK_HOVER}>
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href} className={LINK_HOVER}>
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="flex flex-col gap-4 border-t border-ink-800 py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-ink-400">
            © {new Date().getFullYear()} AIM™ Academy. All rights reserved.
          </p>
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}

/**
 * The landing page: what this is, and the two ways in.
 *
 * `overflow-x-clip` rather than `hidden` on the root, so the preview's glow
 * cannot widen a phone's page without also breaking the sticky header.
 */
export function Landing() {
  return (
    <div className="overflow-x-clip">
      <Header />
      <main>
        <Hero />
        <Method />
        <Certification />
        <Portals />
        <Principles />
      </main>
      <Footer />
    </div>
  );
}
