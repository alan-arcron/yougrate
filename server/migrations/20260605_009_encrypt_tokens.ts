import type { Knex } from "knex";
import { encryptSecret, isEncrypted } from "../src/utils/crypto";

/**
 * Encrypts any existing plaintext GitHub/Vercel tokens at rest.
 * No-op if TOKEN_ENCRYPTION_KEY is unset (encryptSecret passes through) or if
 * values are already encrypted. Safe to re-run.
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
  // Irreversible: we cannot recover the key context to safely decrypt in a
  // down-migration, and leaving ciphertext is the secure default.
}
