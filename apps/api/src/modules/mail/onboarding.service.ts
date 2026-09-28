import { Injectable, Logger } from "@nestjs/common";
import {
  AUTO_ENROL_FLAG,
  INTAKE_COHORT_SETTING,
  MAIL_KINDS,
} from "@aim/contracts";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { NotificationsService } from "../messaging/notifications.service";
import { MailService } from "./mail.service";
import { staffNoticeEmail, welcomeEmail } from "./templates";

/**
 * Everything that happens once a candidate proves their address.
 *
 * Enrol them, welcome them, tell the staff. Gathered here rather than left in
 * the auth service because none of it is authentication -- and because the
 * ordering matters: the enrolment is a database write that must succeed or be
 * reported, and the three messages are best-effort. A welcome message that
 * fails to send must not leave somebody unenrolled.
 */
@Injectable()
export class OnboardingService {
  private readonly logger = new Logger("Onboarding");

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Places a newly verified candidate and tells everybody who should know.
   *
   * Returns what happened so the caller can say it on screen. Nothing in here
   * throws: verification has already succeeded by the time this runs, and
   * undoing it because a cohort was archived or a mail server was down would
   * punish the candidate for an administrator's configuration.
   */
  async onVerified(user: {
    id: string;
    name: string;
    email: string;
  }): Promise<{ enrolled: boolean; programme: string | null }> {
    const placement = await this.enrol(user.id);
    const base = process.env.WEB_BASE_URL ?? "http://localhost:3000";

    // The candidate. Best effort, and the enrolment stands either way.
    await this.mail.send(
      MAIL_KINDS.WELCOME,
      { email: user.email, name: user.name },
      welcomeEmail({
        name: user.name,
        email: user.email,
        signInUrl: `${base}/login`,
        programme: placement.programme,
      }),
    );

    // In the product as well as in their inbox. Email is where a notice goes
    // to be missed; the person who has to place this candidate does that on a
    // screen, so the prompt belongs on the screen.
    await this.notifications.candidateJoined({
      id: user.id,
      name: user.name,
      email: user.email,
      enrolled: placement.enrolled,
      programme: placement.programme,
    });

    await this.notifyStaff(user, placement.programme, base);
    return placement;
  }

  /**
   * Puts the candidate on the intake cohort, if there is one.
   *
   * Three ways this legitimately does nothing, and each is reported rather
   * than hidden: auto-enrolment is switched off, no intake cohort has been
   * chosen, or the chosen one has since been archived. In all three the
   * candidate still has an account and the staff notice says they need placing
   * by hand.
   */
  private async enrol(
    userId: string,
  ): Promise<{ enrolled: boolean; programme: string | null }> {
    const [flag, setting] = await Promise.all([
      this.prisma.featureFlag.findUnique({ where: { key: AUTO_ENROL_FLAG } }),
      this.prisma.setting.findUnique({ where: { key: INTAKE_COHORT_SETTING } }),
    ]);

    if (flag && !flag.enabled) return { enrolled: false, programme: null };

    const cohortId = (setting?.value as string | null) ?? null;
    if (!cohortId) return { enrolled: false, programme: null };

    const cohort = await this.prisma.cohort.findUnique({
      where: { id: cohortId },
      select: {
        id: true,
        title: true,
        archivedAt: true,
        programmeVersion: {
          select: { programme: { select: { title: true } } },
        },
      },
    });
    if (!cohort || cohort.archivedAt) {
      this.logger.warn(
        `Intake cohort ${cohortId} is missing or archived; candidate ${userId} was not enrolled.`,
      );
      return { enrolled: false, programme: null };
    }

    const programme = `${cohort.programmeVersion.programme.title} — ${cohort.title}`;

    try {
      // The unique index on (cohortId, userId) is what makes this safe to run
      // twice; a verification link clicked twice must not fail on the second.
      await this.prisma.enrollment.upsert({
        where: { cohortId_userId: { cohortId: cohort.id, userId } },
        create: { cohortId: cohort.id, userId },
        update: {},
      });
    } catch (error) {
      this.logger.error(
        `Enrolling ${userId} on ${cohort.id} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { enrolled: false, programme: null };
    }

    await this.audit.record({
      actorId: userId,
      actorRole: "STUDENT",
      actorEmail: "",
      action: "enrollment.create",
      resourceType: "enrollment",
      resourceId: cohort.id,
      outcome: "SUCCESS",
      requestId: "self-enrolment",
      metadata: { automatic: true, reason: "email verified" },
    });

    return { enrolled: true, programme };
  }

  /**
   * Tells the administrators and managers.
   *
   * Every active one, because "who should know a stranger joined" is a
   * question about the role rather than about a mailing list somebody has to
   * remember to maintain. Archived and suspended accounts are skipped: they
   * are not doing the job today.
   */
  private async notifyStaff(
    candidate: { name: string; email: string },
    programme: string | null,
    base: string,
  ): Promise<void> {
    const staff = await this.prisma.user.findMany({
      where: {
        role: { in: ["ADMIN", "MANAGER"] },
        status: "ACTIVE",
        archivedAt: null,
      },
      select: { email: true, name: true },
    });

    for (const person of staff) {
      await this.mail.send(
        MAIL_KINDS.STAFF_NOTICE,
        { email: person.email, name: person.name },
        staffNoticeEmail({
          staffName: person.name,
          candidateName: candidate.name,
          candidateEmail: candidate.email,
          programme,
          usersUrl: `${base}/admin/users`,
        }),
      );
    }
  }
}
