import crypto from "crypto";

const PREFIX = "enc:v1:";
const ALGO = "aes-256-gcm";

let warnedMissingKey = false;

function getKey(): Buffer | null {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret || secret.trim() === "") return null;
  // Derive a stable 32-byte key from the configured secret of any length.
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypt a secret (e.g. an OAuth/PAT token) for storage at rest.
 * If TOKEN_ENCRYPTION_KEY is not configured, returns the plaintext unchanged
 * (with a one-time warning) so the app keeps working in dev. Production MUST
 * set TOKEN_ENCRYPTION_KEY.
 */
export function encryptSecret(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined || plain === "") return plain ?? null;
  // Already encrypted — don't double-encrypt.
  if (plain.startsWith(PREFIX)) return plain;

  const key = getKey();
  if (!key) {
    if (!warnedMissingKey) {
      console.warn(
        "[crypto] TOKEN_ENCRYPTION_KEY is not set — secrets are being stored in PLAINTEXT. Set it in production.",
      );
      warnedMissingKey = true;
    }
    return plain;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

/**
 * Decrypt a stored secret. Tolerates legacy plaintext values (returns them
 * as-is) so rows written before encryption was enabled still work.
 * Returns "" for null/undefined so callers can pass the result directly.
 */
export function decryptSecret(value: string | null | undefined): string {
  if (!value) return "";
  if (!value.startsWith(PREFIX)) return value; // legacy plaintext

  const key = getKey();
  if (!key) {
    throw new Error(
      "[crypto] Encrypted secret found but TOKEN_ENCRYPTION_KEY is not set.",
    );
  }

  const parts = value.slice(PREFIX.length).split(":");
  if (parts.length !== 3) {
    throw new Error("[crypto] Malformed encrypted secret.");
  }
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");

  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  return plain.toString("utf8");
}

/** True if the value is in our encrypted envelope format. */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}
