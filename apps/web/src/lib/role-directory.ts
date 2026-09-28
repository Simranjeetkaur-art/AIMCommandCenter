import type { ComponentType, SVGProps } from "react";
import {
  AdminIcon,
  InstructorIcon,
  ManagerIcon,
  StudentIcon,
} from "@/components/icons";

/**
 * The four roles, as the signed-out screens describe them.
 *
 * One list for the landing page's portals and the sign-in page's demo
 * accounts, so the two can never describe a role differently.
 */
export interface RoleEntry {
  role: string;
  /** The seeded account for this role, which the sign-in page offers as a demo. */
  email: string;
  /** Its reach, in a phrase. */
  scope: string;
  /** What its portal holds. */
  detail: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export const ROLE_DIRECTORY: readonly RoleEntry[] = [
  {
    role: "Student",
    email: "student@aim.edu",
    scope: "Own record only",
    detail:
      "Lessons, assessments, simulator missions and the credentials you earn, and nothing belonging to anybody else.",
    Icon: StudentIcon,
  },
  {
    role: "Instructor",
    email: "instructor@aim.edu",
    scope: "Assigned learners only",
    detail:
      "The examiner's screens: a review queue and the learners assigned to you.",
    Icon: InstructorIcon,
  },
  {
    role: "Manager",
    email: "manager@aim.edu",
    scope: "Builds the academy, never judges",
    detail:
      "The builder's screens: programmes, cohorts and reports. Builds what candidates take, and never marks it.",
    Icon: ManagerIcon,
  },
  {
    role: "Administrator",
    email: "admin@aim.edu",
    scope: "Full authority, fully recorded",
    detail:
      "Users, roles, agents and credentials, with every action written to the audit log.",
    Icon: AdminIcon,
  },
];

/** The password every seeded account starts with. See prisma/seed.ts. */
export const DEMO_PASSWORD = "AimAcademy!2026";
