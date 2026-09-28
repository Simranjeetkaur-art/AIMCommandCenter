import { PORTAL_HOME, type Role } from "@aim/contracts";
import { logout } from "@/app/login/actions";
import { PreviewBanner } from "@/components/preview-banner";
import { GlobalHelp } from "@/components/global-help";
import { PortalNav, type NavEntry, type NavLink } from "@/components/portal-nav";
import { NoticeBell } from "@/components/notice-bell";
import { ProfileMenu } from "@/components/profile-menu";
import { ThemeToggle } from "@/components/theme-toggle";

/** Governance is the same three places for every role that reaches it. */
const REGISTRY: NavLink = {
  label: "Agent registry",
  href: "/governance/registry",
  hint: "Every governed agent and who owns it",
};
const DX: NavLink = {
  label: "AIM™ Dx",
  href: "/governance/dx",
  hint: "Diagnose how much authority an agent holds",
};
const RX: NavLink = {
  label: "AIM™ Rx",
  href: "/governance/rx",
  hint: "Prescribe the controls that bound it",
};
const PROGRAMMES: NavLink = {
  label: "Programmes",
  href: "/authoring",
  hint: "Tracks, modules, lessons and assessments",
};
const BADGES: NavLink = {
  label: "Badges",
  href: "/authoring/badges",
  hint: "Badge artwork and the rules that award them",
};

/**
 * Each portal's destinations, grouped.
 *
 * The portal's own home and the command dashboard stay one click away; the
 * rest are grouped by the job they belong to, so the bar reads as a handful
 * of areas instead of a row of every screen there is.
 */
const NAV: Record<Role, NavEntry[]> = {
  STUDENT: [
    // The Command Dashboard's four routes live on the student dashboard, so a
    // candidate has one home instead of two.
    { label: "Dashboard", href: "/student" },
    {
      label: "Learning",
      items: [
        { label: "Academy", href: "/student/academy", hint: "Your lessons, module by module" },
        { label: "Assessments", href: "/student/assessments", hint: "Module assessments and results" },
        { label: "Simulator", href: "/student/simulator", hint: "Command missions and scenarios" },
        { label: "Submissions", href: "/student/submissions", hint: "Written work sent to an examiner, and their decisions" },
        { label: "Dx practice", href: "/governance/dx", hint: "Practise the Authority Diagnostic" },
      ],
    },
    {
      label: "Achievements",
      items: [
        { label: "Grade book", href: "/student/grades", hint: "Every mark on your record" },
        { label: "Badges", href: "/student/badges", hint: "What you have earned so far" },
        { label: "Certification", href: "/student/certification", hint: "The requirements, and where you stand" },
        { label: "Credentials", href: "/student/credentials", hint: "Credentials issued to you" },
      ],
    },
    { label: "Messages", href: "/student/messages" },
    { label: "My review", href: "/performance" },
  ],
  INSTRUCTOR: [
    { label: "Command", href: "/command" },
    { label: "Review queue", href: "/instructor" },
    { label: "My learners", href: "/instructor/learners" },
    { label: "Messages", href: "/instructor/messages" },
    { label: "Governance", items: [REGISTRY, DX] },
  ],
  MANAGER: [
    { label: "Command", href: "/command" },
    { label: "Overview", href: "/manager" },
    { label: "Academy", items: [PROGRAMMES, BADGES] },
    {
      label: "Delivery",
      items: [
        { label: "Cohorts & enrolment", href: "/manager/cohorts", hint: "Put candidates on a course, and withdraw them" },
        { label: "Learners", href: "/manager/learners", hint: "Every candidate across the academy" },
        { label: "Grade book", href: "/manager/grades", hint: "Where every candidate stands" },
        { label: "Turnaround", href: "/manager/turnaround", hint: "Reviews that are running late" },
        { label: "Certificates", href: "/manager/credentials", hint: "Certificate register and serial check" },
      ],
    },
    { label: "Messages", href: "/manager/messages" },
    { label: "Governance", items: [REGISTRY, DX, RX] },
    { label: "Performance", href: "/performance" },
  ],
  ADMIN: [
    { label: "Command", href: "/command" },
    { label: "Overview", href: "/admin" },
    { label: "Academy", items: [PROGRAMMES, BADGES] },
    {
      label: "Certification",
      items: [
        { label: "Grade book", href: "/admin/grades", hint: "Where every candidate stands" },
        { label: "Certificates", href: "/admin/credentials", hint: "Register, serial check, suspend and revoke" },
        { label: "Certificate design", href: "/authoring/certificates", hint: "The certificate candidates receive" },
      ],
    },
    { label: "Messages", href: "/admin/messages" },
    { label: "Governance", items: [REGISTRY, DX, RX] },
    {
      label: "People",
      items: [
        { label: "Users", href: "/admin/users", hint: "Accounts, roles and sign-in security" },
        { label: "Cohorts & enrolment", href: "/admin/cohorts", hint: "Put candidates on a course, and withdraw them" },
        { label: "Performance", href: "/performance", hint: "Performance reviews" },
      ],
    },
    {
      label: "System",
      items: [
        { label: "Email", href: "/admin/mail", hint: "Mail provider and candidate enrolment" },
        { label: "Audit log", href: "/admin/audit", hint: "Every action, append-only" },
        { label: "Settings", href: "/admin/settings", hint: "Portal and branding settings" },
      ],
    },
  ],
};

const ROLE_NOTE: Record<Role, string> = {
  STUDENT:
    "The candidate. Your own record, and nothing belonging to anyone else.",
  INSTRUCTOR: "The examiner. Only the learners assigned to you.",
  MANAGER:
    "The programme manager. Builds the academy, never judges a candidate.",
  ADMIN:
    "The institution. Full authority, and every action written to the audit log.",
};

export function Shell({
  role,
  name,
  email,
  previewRole = null,
  children,
}: {
  /** The signed-in person's own role. Never the previewed one. */
  role: Role;
  name: string;
  email?: string;
  previewRole?: Role | null;
  children: React.ReactNode;
}) {
  // The navigation belongs to the portal on screen; the identity below it
  // belongs to the person. Showing an administrator's nav over the instructor
  // portal would make the preview useless for checking the instructor portal.
  const standing = previewRole ?? role;

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      {previewRole ? (
        <PreviewBanner previewRole={previewRole} name={name} ownRole={role} />
      ) : null}
      <header className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="rule-label">AIM Command Center</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            {standing.charAt(0) + standing.slice(1).toLowerCase()} portal
          </h1>
          <p className="mt-1 max-w-xl text-xs text-ink-400">
            {ROLE_NOTE[standing]}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <ThemeToggle />
          {/* Unread messages and notices, wherever you are. */}
          <NoticeBell messagesHref={`${PORTAL_HOME[standing]}/messages`} />
          {/* The person, and what is theirs rather than the portal's: their
              account, and signing out. */}
          <ProfileMenu
            name={name}
            email={email}
            role={role}
            previewRole={previewRole}
            logout={logout}
          />
        </div>
      </header>

      <PortalNav entries={NAV[standing]} />

      {children}

      {/* The formula guide follows the person, because the terms this product
          is written in are needed wherever a number turns up, not only on the
          screen that produced it. */}
      <GlobalHelp />
    </div>
  );
}
