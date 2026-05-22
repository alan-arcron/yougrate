import knex from "knex";
import dotenv from "dotenv";

dotenv.config({ path: __dirname + "/../../.env" });

const db = knex({
  client: "pg",
  connection: process.env.DATABASE_URL,
});

export async function initDb() {
  await db.migrate.latest({
    directory: __dirname + "/../migrations",
    extension: "ts",
  });
  console.log("[db] Migrations up to date");
}

export { db };
export default db;
