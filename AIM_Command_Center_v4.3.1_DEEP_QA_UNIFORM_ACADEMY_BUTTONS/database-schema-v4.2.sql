-- AIM Command Center v4.2 logical PostgreSQL schema
CREATE TABLE users (
 id UUID PRIMARY KEY, email TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL,
 role TEXT NOT NULL CHECK (role IN ('ADMIN','INSTRUCTOR','STUDENT')),
 status TEXT NOT NULL DEFAULT 'ACTIVE', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_login_at TIMESTAMPTZ
);
CREATE TABLE enrollments (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id), program TEXT NOT NULL,
 enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(), status TEXT NOT NULL DEFAULT 'ACTIVE'
);
CREATE TABLE module_attempts (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id), module_id INTEGER NOT NULL,
 attempt INTEGER NOT NULL, score NUMERIC(5,2) NOT NULL, passed BOOLEAN NOT NULL, completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE simulator_progress (
 id UUID PRIMARY KEY, user_id UUID UNIQUE NOT NULL REFERENCES users(id),
 missions_completed INTEGER NOT NULL DEFAULT 0, last_mission INTEGER NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE exam_attempts (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id), exam_type TEXT NOT NULL,
 attempt INTEGER NOT NULL, score NUMERIC(5,2) NOT NULL, passed BOOLEAN NOT NULL, completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE credentials (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id), credential_type TEXT NOT NULL,
 certification_id TEXT UNIQUE NOT NULL, issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 status TEXT NOT NULL CHECK (status IN ('ACTIVE','SUSPENDED','REVOKED','EXPIRED')),
 revoked_at TIMESTAMPTZ, revocation_reason TEXT
);
CREATE TABLE audit_events (
 id UUID PRIMARY KEY, actor_user_id UUID REFERENCES users(id), event_type TEXT NOT NULL,
 object_type TEXT NOT NULL, object_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_module_attempts_user ON module_attempts(user_id);
CREATE INDEX idx_exam_attempts_user ON exam_attempts(user_id);
CREATE INDEX idx_credentials_certid ON credentials(certification_id);
CREATE INDEX idx_audit_created ON audit_events(created_at);
