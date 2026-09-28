-- AIM Command Center v4.3 migration/RLS starter
-- Apply after reviewing database-schema-v4.2.sql.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulator_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

-- Production policy implementation must map auth.uid() to users.id.
-- Students: own rows only.
-- Instructors: assigned learner rows only.
-- Admins: administrative scope only.
-- Credential issuance/status mutation should execute through trusted server functions,
-- not direct unrestricted client writes.
