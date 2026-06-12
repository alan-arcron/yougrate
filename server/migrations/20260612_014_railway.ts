import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("users", (t) => {
    // Railway account API token, encrypted at rest via utils/crypto. Used to
    // deploy long-running backend servers that Vercel can't host.
    t.text("railway_access_token");
  });

  await knex.schema.alterTable("migrations", (t) => {
    // Railway deployment bookkeeping for the backend service (when
    // backend_type === "server"). The frontend still deploys to Vercel.
    t.string("railway_project_id", 100);
    t.string("railway_service_id", 100);
    t.string("railway_environment_id", 100);
    t.string("railway_service_domain", 255);
    t.string("railway_deployment_id", 100);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("users", (t) => {
    t.dropColumn("railway_access_token");
  });
  await knex.schema.alterTable("migrations", (t) => {
    t.dropColumn("railway_project_id");
    t.dropColumn("railway_service_id");
    t.dropColumn("railway_environment_id");
    t.dropColumn("railway_service_domain");
    t.dropColumn("railway_deployment_id");
  });
}
