// Run a SQL migration against the Supabase Postgres DB.
//
// Usage:
//   DATABASE_URL="postgresql://user:pass@host:5432/postgres" node run-migration.js <file.sql>
//
// Or with discrete vars:
//   PGHOST=... PGUSER=... PGPASSWORD=... PGDATABASE=postgres PGPORT=5432 node run-migration.js <file.sql>
//
// No credentials are stored in this file. Set them in your shell / start.ps1 (gitignored).

const { Client } = require('pg');
const fs = require('fs');

const file = process.argv[2] || 'migration2.sql';
if (!fs.existsSync(file)) {
  console.error(`Migration file not found: ${file}`);
  process.exit(1);
}
const sql = fs.readFileSync(file, 'utf8');

const connStr = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!connStr && !process.env.PGHOST) {
  console.error(
    'No DB credentials. Set DATABASE_URL (or PGHOST/PGUSER/PGPASSWORD/PGDATABASE/PGPORT) in your environment.'
  );
  process.exit(1);
}

const c = connStr
  ? new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } })
  : new Client({ ssl: { rejectUnauthorized: false } }); // reads PG* env vars

c.connect()
  .then(() => c.query(sql))
  .then(() => {
    console.log(`Migration OK: ${file}`);
    return c.end();
  })
  .catch(e => {
    console.error('ERR:', e.message);
    c.end();
    process.exit(1);
  });
