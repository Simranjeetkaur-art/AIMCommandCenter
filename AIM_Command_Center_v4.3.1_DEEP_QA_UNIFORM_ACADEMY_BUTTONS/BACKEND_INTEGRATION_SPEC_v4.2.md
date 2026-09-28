# AIM™ Command Center v4.2 — Backend & Database Integration Specification

## Production authority boundary
The browser is not authoritative for identity, scores, completion, credential issuance, credential status, or audit history. Those records must be owned and validated by the server.

## Recommended production layers
1. Web application
2. Hosted identity/session service
3. Application API with role-based authorization
4. Relational database
5. Assessment/certification service
6. Credential registry and public verification endpoint
7. Audit logging, backups, monitoring, and transactional email

## Roles
- ADMIN: users, enrollment, all progress, credentials, reports, role administration
- INSTRUCTOR: assigned learners, progress, practical assessment and Check Ride oversight
- STUDENT: own training, assessments, progress, credentials

## Certification transaction
Verify identity → verify all five requirements → lock authoritative completion record → issue unique Certification ID → write credential → write audit event → enable public verification.

## Security requirements
Use HTTPS, secure/HttpOnly/SameSite cookies, password hashing or managed identity, server-side RBAC, CSRF protections where applicable, rate limiting, input validation, least privilege, database backups, secret management, audit trails, and dependency/security patching.

Public credential verification should return only the minimum necessary data, such as candidate display name, credential type, Certification ID, issue date, and current status.

## Included handoff artifacts
- `openapi-v4.2.json`: API contract skeleton
- `database-schema-v4.2.sql`: relational schema starter
- `production-data-model.json`: logical data model from v4.0
