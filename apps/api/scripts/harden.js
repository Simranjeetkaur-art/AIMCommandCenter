/**
 * Applies every SQL file in prisma/sql, in name order, against DATABASE_URL.
 *
 * These are not migrations. They are guarantees that a migration can silently
 * drop -- recreating audit_events drops its triggers with it -- so they are
 * re-applied after every deploy and are written to be idempotent.
 */
const { execFileSync } = require("node:child_process");
const { readdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

loadEnvFile();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env first.");
  process.exit(1);
}

const dir = join(__dirname, "..", "prisma", "sql");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.log("No hardening scripts found.");
  process.exit(0);
}

for (const file of files) {
  process.stdout.write(`applying ${file} ... `);
  const sql = readFileSync(join(dir, file), "utf8");
  try {
    execFileSync(
      "npx",
      [
        "prisma",
        "db",
        "execute",
        "--stdin",
        "--schema",
        join(__dirname, "..", "prisma", "schema.prisma"),
      ],
      {
        input: sql,
        stdio: ["pipe", "inherit", "inherit"],
        shell: process.platform === "win32",
      },
    );
    console.log("ok");
  } catch (err) {
    console.error(`\nFailed applying ${file}`);
    process.exit(1);
  }
}

console.log(
  "\nAudit log is append-only. Verify with: npm run test -w @aim/api",
);

/** Reads apps/api/.env without adding a dependency for four lines of parsing. */
function loadEnvFile() {
  const path = join(__dirname, "..", ".env");
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const value = match[2].replace(/^["']|["']$/g, "");
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
}
