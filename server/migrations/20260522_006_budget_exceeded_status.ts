import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE "migrations" DROP CONSTRAINT IF EXISTS "migrations_status_check"`);
  await knex.raw(`ALTER TABLE "migrations" ADD CONSTRAINT "migrations_status_check" CHECK ("status" IN ('pending', 'analyzing', 'estimated', 'confirmed', 'running', 'completed', 'building', 'fixing', 'budget_exceeded', 'failed'))`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE "migrations" DROP CONSTRAINT IF EXISTS "migrations_status_check"`);
  await knex.raw(`ALTER TABLE "migrations" ADD CONSTRAINT "migrations_status_check" CHECK ("status" IN ('pending', 'analyzing', 'estimated', 'confirmed', 'running', 'completed', 'building', 'fixing', 'failed'))`);
}
