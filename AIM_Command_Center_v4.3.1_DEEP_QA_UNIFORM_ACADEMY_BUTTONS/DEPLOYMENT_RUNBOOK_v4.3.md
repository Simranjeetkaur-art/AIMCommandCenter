# AIM™ Command Center v4.3 — Production Deployment Runbook

## Selected production stack
- Frontend/deployment: Vercel
- Database: Supabase Postgres
- Authentication: Supabase Auth
- Authorization: Row Level Security plus server-side role checks
- Transactional email: Resend
- Production domain: aimcommandcenter.com

## Deployment sequence
1. Create separate development/preview and production projects.
2. Apply the v4.2 database schema and v4.3 RLS migration.
3. Configure Supabase Auth, verified email, redirect URLs, and role mapping.
4. Move authoritative module, simulator, exam, practical, Check Ride, and credential state off localStorage.
5. Implement API/server functions for scoring, completion, issuance, status changes, and audit events.
6. Configure Resend and verify a sending domain/subdomain.
7. Configure Vercel environment variables. Keep service-role/database/email secrets server-only.
8. Connect aimcommandcenter.com and enforce HTTPS.
9. Test Student, Instructor, and Admin authorization independently.
10. Test credential issue/revoke/verify workflow.
11. Test backup and restore before launch.
12. Enable monitoring/error logging and launch.

## Backup policy
Use managed database backups and maintain an independent logical-backup procedure. Periodically test restoration; an untested backup is not a recovery plan.

## Production launch rule
Do not launch while browser localStorage remains authoritative for certification completion, assessment scores, or credential status.
