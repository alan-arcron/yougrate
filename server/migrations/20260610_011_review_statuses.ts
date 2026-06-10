import type { Knex } from "knex";

const WITH_REVIEW =
  "'pending', 'analyzing', 'estimated', 'confirmed', 'running', 'completed', 'building', 'fixing', 'budget_exceeded', 'pending_review', 'reviewing', 'reviewed', 'failed'";

const WITHOUT_REVIEW =
  "'pending', 'analyzing', 'estimated', 'confirmed', 'running', 'completed', 'building', 'fixing', 'budget_exceeded', 'failed'";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(
    `ALTER TABLE "migrations" DROP CONSTRAINT IF EXISTS "migrations_status_check"`,
  );
  await knex.raw(
    `ALTER TABLE "migrations" ADD CONSTRAINT "migrations_status_check" CHECK ("status" IN (${WITH_REVIEW}))`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    `ALTER TABLE "migrations" DROP CONSTRAINT IF EXISTS "migrations_status_check"`,
  );
  await knex.raw(
    `ALTER TABLE "migrations" ADD CONSTRAINT "migrations_status_check" CHECK ("status" IN (${WITHOUT_REVIEW}))`,
  );
}
