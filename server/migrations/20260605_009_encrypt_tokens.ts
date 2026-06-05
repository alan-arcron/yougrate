import type { Knex } from "knex";
import crypto from "crypto";

// NOTE: This logic is intentionally inlined (a copy of src/utils/crypto.ts).
// Migrations run from the deployed image where only dist/ exists, so importing
// from ../src/* would fail at runtime. Keep this in sync with src/utils/crypto.ts.

const PREFIX = "enc:v1:";
const ALGO = "aes-256-gcm";

function getKey(): Buffer | null {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret || secret.trim() === "") return null;
  return crypto.createHash("sha256").update(secret).digest();
}

function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

function encryptSecret(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined || plain === "") return plain ?? null;
  if (plain.startsWith(PREFIX)) return plain;

  const key = getKey();
  if (!key) return plain; // no key configured — leave as-is (dev fallback)

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
 * Encrypts any existing plaintext GitHub/Vercel tokens at rest.
 * No-op if TOKEN_ENCRYPTION_KEY is unset (passthrough) or values are already
 * encrypted. Safe to re-run.
 */
export async function up(knex: Knex): Promise<void> {
  const users = await knex("users")
    .select("id", "github_access_token", "vercel_access_token")
    .where(function () {
      this.whereNotNull("github_access_token").orWhereNotNull(
        "vercel_access_token",
      );
    });

  for (const u of users) {
    const updates: Record<string, string | null> = {};

    if (u.github_access_token && !isEncrypted(u.github_access_token)) {
      updates.github_access_token = encryptSecret(u.github_access_token);
    }
    if (u.vercel_access_token && !isEncrypted(u.vercel_access_token)) {
      updates.vercel_access_token = encryptSecret(u.vercel_access_token);
    }

    if (Object.keys(updates).length > 0) {
      await knex("users").where({ id: u.id }).update(updates);
    }
  }
}

export async function down(): Promise<void> {
  // Irreversible: ciphertext is the secure default.
}
