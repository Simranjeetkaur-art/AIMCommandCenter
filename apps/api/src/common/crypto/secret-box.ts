import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

/**
 * Reversible storage for a secret this system has to *use*, not merely check.
 *
 * Every other secret here is hashed, because the only question ever asked of
 * it is "does this match". An SMTP password is different: the server has to
 * present the original to the provider on every send, so it must come back out
 * again. Hashing is not an option and plaintext in a column is not either.
 *
 * AES-256-GCM, so the ciphertext is authenticated: a row somebody edited in
 * the database fails to decrypt rather than silently becoming a different
 * password. The key is derived from SESSION_SECRET through HKDF under its own
 * `info` string, which keeps it in a different space from the token hashes
 * that use the same environment variable -- one leaked derivation must not
 * hand over the others.
 *
 * The honest limitation, stated rather than buried: this protects a database
 * dump, a backup and a stray query result. It does not protect against someone
 * who already has the application's environment, because that person has the
 * key by definition. Moving the key to a KMS is one function's worth of change
 * and is where this goes if the threat model grows.
 */
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

function key(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET is missing or too short; refusing to encrypt a stored secret with it.",
    );
  }
  // A fixed salt is acceptable here because the input is already a
  // high-entropy application secret rather than a human password; the `info`
  // string is what separates this derivation from any other.
  return Buffer.from(
    hkdfSync("sha256", secret, "aim.secret-box", "mail-credential", KEY_BYTES),
  );
}

/** Returns `v1.<iv>.<tag>.<ciphertext>`, all base64url. */
export function sealSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const body = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    body.toString("base64url"),
  ].join(".");
}

/**
 * Opens a sealed secret, or throws.
 *
 * Throwing is deliberate. A secret that will not decrypt means the key
 * changed or the row was tampered with, and the useful behaviour is a loud
 * failure at the point of send rather than an empty password quietly offered
 * to the mail provider.
 */
export function openSecret(sealed: string): string {
  const [version, ivPart, tagPart, bodyPart] = sealed.split(".");
  if (version !== "v1" || !ivPart || !tagPart || !bodyPart) {
    throw new Error("Stored secret is not in a format this version can open.");
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    key(),
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(bodyPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
