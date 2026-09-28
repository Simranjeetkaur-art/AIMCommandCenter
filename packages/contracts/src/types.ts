import type { Permission } from "./permissions";
import type { Role } from "./roles";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: "ACTIVE" | "SUSPENDED";
}

export interface SessionEnvelope {
  user: SessionUser;
  /**
   * What the caller holds right now. During a role preview this is the
   * previewed role's reads, which is narrower than `ownPermissions`.
   */
  permissions: Permission[];
  expiresAt: string;
  /** The portal being looked at, or null when the caller is simply themselves. */
  previewRole?: Role | null;
  /** What they hold when not previewing, so the interface can say what is set aside. */
  ownPermissions?: Permission[];
  /**
   * True while this account is held at the password screen.
   *
   * Set when an administrator forces a reset, and cleared the moment a new
   * password is accepted. The API refuses everything except the few routes
   * that screen needs, so this flag tells the interface why rather than
   * deciding anything.
   */
  mustChangePassword?: boolean;
  /**
   * True while this account is held at the profile screen: its role must
   * complete a profile (see PROFILE_REQUIRED_ROLES) and has not yet. Like
   * `mustChangePassword`, it explains a hold the API enforces.
   */
  profileRequired?: boolean;
}

/**
 * One live session, as its owner or an administrator sees it.
 *
 * There is no token here and there cannot be: only the hash is stored, so
 * there is nothing to show even if showing it were wise.
 */
export interface LiveSession {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  ip: string | null;
  userAgent: string | null;
  /** The portal this session is looking at, if it is previewing one. */
  previewRole?: Role | null;
  /**
   * True for the session making the request. Ending one you are sitting in is
   * signing out, and the screen should say so rather than look like a mistake.
   */
  current: boolean;
}

/**
 * A page of live sessions, with the figure it is a page of.
 *
 * The total is carried separately because the list is capped and the screen
 * has to be able to say so. An account with three hundred live sessions is
 * exactly the account whose owner needs to know that, and showing them
 * twenty-five rows with no count would hide the only interesting fact.
 */
export interface LiveSessionPage {
  total: number;
  shown: number;
  items: LiveSession[];
}

export type SubmissionStatus =
  "DRAFT" | "SUBMITTED" | "IN_REVIEW" | "RETURNED" | "APPROVED" | "REJECTED";

export type CredentialStatus = "ISSUED" | "SUSPENDED" | "REVOKED";

/** Minimum length of an examiner rationale. Approval is not a click. */
export const MIN_REVIEW_COMMENT_LENGTH = 40;

/** Hours a submitted item may sit before its review counts as overdue. */
export const REVIEW_SLA_HOURS = 72;

export const PORTAL_HOME: Record<Role, string> = {
  STUDENT: "/student",
  INSTRUCTOR: "/instructor",
  MANAGER: "/manager",
  ADMIN: "/admin",
};
