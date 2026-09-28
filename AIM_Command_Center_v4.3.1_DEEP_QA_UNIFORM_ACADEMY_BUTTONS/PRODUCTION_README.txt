AIM Command Center v4.0 — Production Foundation

This build preserves the approved v3.2 standalone application and adds a production architecture layer.

IMPORTANT
- Local storage is still used for prototype operation.
- The Account & Role Prototype is NOT authentication.
- Do not store production passwords, secrets, authoritative assessment records, or credential issuance decisions in browser localStorage.
- Production deployment should move identity, assessment validation, progress, credential issuance/status, and audit events to a server/database.

Target flow:
User Login -> Role-Based Dashboard -> Academy / Dx / Rx -> Server-Saved Progress -> Certification Engine -> Credential Registry -> Public Verification

Defined roles:
ADMIN / INSTRUCTOR / STUDENT

See production-data-model.json for the database-ready logical model.
