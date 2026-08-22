import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../config/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlDir = path.resolve(__dirname, "../../sql");

async function run() {
  const reset = process.argv.includes("--reset");
  const client = await pool.connect();

  try {
    if (reset) {
      console.log("Dropping and recreating public schema...");
      await client.query("DROP SCHEMA public CASCADE");
      await client.query("CREATE SCHEMA public");
      await client.query("GRANT ALL ON SCHEMA public TO public");
      await client.query("GRANT ALL ON SCHEMA public TO dmr");
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const files = fs
      .readdirSync(sqlDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const exists = await client.query(
        "SELECT 1 FROM schema_migrations WHERE filename = $1",
        [file]
      );
      if (exists.rowCount && !reset) {
        console.log(`skip  ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(sqlDir, file), "utf8");
      console.log(`apply ${file}`);
      await client.query(sql);
      if (reset) {
        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING",
          [file]
        );
      } else {
        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1)",
          [file]
        );
      }
    }

    console.log("Migrations complete.");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
