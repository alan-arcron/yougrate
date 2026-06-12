import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("projects", (t) => {
    // Encrypted Postgres connection string for the user's target Supabase
    // project. Used to apply the generated schema (DDL). Stored encrypted at
    // rest via utils/crypto; never logged in plaintext.
    t.text("supabase_db_url");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("projects", (t) => {
    t.dropColumn("supabase_db_url");
  });
}
