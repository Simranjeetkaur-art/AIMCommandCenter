import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";

import { PrismaModule } from "./common/prisma/prisma.module";
import { AccessModule } from "./common/access/access.module";
import { AuditModule } from "./common/audit/audit.module";
import { SessionGuard } from "./common/auth/session.guard";
import { PermissionsGuard } from "./common/auth/permissions.guard";
import { AuditInterceptor } from "./common/audit/audit.interceptor";

import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { AcademyModule } from "./modules/academy/academy.module";
import { CohortsModule } from "./modules/cohorts/cohorts.module";
import { LearningModule } from "./modules/learning/learning.module";
import { AssessmentsModule } from "./modules/assessments/assessments.module";
import { GradebookModule } from "./modules/gradebook/gradebook.module";
import { MessagingModule } from "./modules/messaging/messaging.module";
import { SimulatorModule } from "./modules/simulator/simulator.module";
import { SubmissionsModule } from "./modules/submissions/submissions.module";
import { ReviewsModule } from "./modules/reviews/reviews.module";
import { CredentialsModule } from "./modules/credentials/credentials.module";
import { AuditReadModule } from "./modules/audit/audit.controller.module";
import { SettingsModule } from "./modules/settings/settings.module";
import { MailModule } from "./modules/mail/mail.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { GovernanceModule } from "./modules/governance/governance.module";
import { BadgesModule } from "./modules/badges/badges.module";
import { PerformanceModule } from "./modules/performance/performance.module";
import { CertificatesModule } from "./modules/certificates/certificates.module";
import { HealthController } from "./health.controller";

/**
 * Guard order matters and is not accidental.
 *
 * SessionGuard runs first and establishes who is acting. PermissionsGuard runs
 * second and refuses anything the role does not hold -- including a route that
 * forgot to say what it needs. Both are APP_GUARD, so a controller cannot opt
 * out by omission; opting out takes an explicit @Public().
 *
 * AuditInterceptor wraps the handler, so the record is written whether the
 * call succeeded or was refused.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AccessModule,
    AuditModule,
    AuthModule,
    UsersModule,
    AcademyModule,
    CohortsModule,
    LearningModule,
    AssessmentsModule,
    GradebookModule,
    MessagingModule,
    SimulatorModule,
    SubmissionsModule,
    ReviewsModule,
    CredentialsModule,
    AuditReadModule,
    SettingsModule,
    MailModule,
    ReportsModule,
    GovernanceModule,
    BadgesModule,
    PerformanceModule,
    CertificatesModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
