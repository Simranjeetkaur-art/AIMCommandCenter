-- Imported banks were created with a title only ("AIM-CP question bank"),
-- which made every track's bank look shared and offered AIM-EL questions on
-- an AIM-CP paper. Link each to the track its title names.
UPDATE "question_banks" b SET "programmeId" = p."id"
FROM "programmes" p
WHERE b."programmeId" IS NULL
  AND b."title" = p."code" || ' question bank';
