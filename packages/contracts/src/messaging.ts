import type { Role } from "./roles";

/**
 * Who may open a conversation with whom.
 *
 * Stated as data rather than as a chain of ifs, because the rule is a matrix
 * and the interesting part is which cells are empty. Two properties it is
 * built to have:
 *
 *  - A candidate writes to their examiner and to nobody else. Not to other
 *    candidates, not to the registry, not to whichever manager they can name.
 *    Their one route to the institution is the person marking their work.
 *  - Starting a conversation and continuing one are different acts. An
 *    administrator may write to anybody; the person written to can always
 *    answer, whatever this matrix says, because being addressed and being
 *    unable to reply is not a rule, it is a fault.
 */
export const MAY_START: Readonly<Record<Role, readonly Role[]>> = Object.freeze(
  {
    ADMIN: ["ADMIN", "MANAGER", "INSTRUCTOR", "STUDENT"],
    MANAGER: ["ADMIN", "MANAGER", "INSTRUCTOR"],
    INSTRUCTOR: ["ADMIN", "MANAGER", "INSTRUCTOR", "STUDENT"],
    STUDENT: ["INSTRUCTOR"],
  },
);

/**
 * Pairs where the role is not enough: the two must also be teaching and
 * taught. An examiner may write to their own learners, and a learner to their
 * own examiner -- neither to a stranger who merely holds the right role.
 */
export function needsAssignment(from: Role, to: Role): boolean {
  return (
    (from === "INSTRUCTOR" && to === "STUDENT") ||
    (from === "STUDENT" && to === "INSTRUCTOR")
  );
}

export interface StartVerdict {
  ok: boolean;
  /** Why not, in a sentence meant for the person who tried. */
  reason?: string;
  /** True when role allows it but the assignment still has to be checked. */
  requiresAssignment: boolean;
}

/**
 * Whether `from` may open a conversation with `to`, as far as roles decide.
 * The assignment check needs the database and is left to the caller, which is
 * why it is reported rather than assumed.
 */
export function mayStartConversation(from: Role, to: Role): StartVerdict {
  if (!MAY_START[from]?.includes(to)) {
    return {
      ok: false,
      requiresAssignment: false,
      reason:
        from === "STUDENT"
          ? "You can write to your examiner. Anyone else who needs to reach you will write first."
          : `Your role cannot start a conversation with ${to.toLowerCase()}s.`,
    };
  }
  return { ok: true, requiresAssignment: needsAssignment(from, to) };
}

/** The pair in the order a conversation row stores them. */
export function conversationPair(a: string, b: string) {
  return a < b ? { lowUserId: a, highUserId: b } : { lowUserId: b, highUserId: a };
}

export const MAX_MESSAGE_LENGTH = 4000;

/** The kinds of notice the system raises. */
export const NOTICE_KINDS = {
  CANDIDATE_JOINED: "candidate.joined",
  CANDIDATE_NEEDS_PLACING: "candidate.needs-placing",
  LEARNER_ASSIGNED: "learner.assigned",
  MESSAGE_RECEIVED: "message.received",
} as const;

export type NoticeKind = (typeof NOTICE_KINDS)[keyof typeof NOTICE_KINDS];
