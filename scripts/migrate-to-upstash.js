// Copies your local tf.db (workers, tasks, attendance, audit log, admin password) into Upstash Redis,
// so the deployed Vercel/Netlify site starts with the same data and the same passwords.
//
//   npm run migrate -- <UPSTASH_REST_URL> <UPSTASH_REST_TOKEN> [path/to/tf.db]
// or set UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN in the environment.
const fs = require("fs");
const path = require("path");
const { Redis } = require("@upstash/redis");

const args = process.argv.slice(2).filter(a => !a.startsWith("--"));
const url = args[0] || process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = args[1] || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const dbFile = args[2] || path.join(__dirname, "..", "tf.db");

if (!url || !token) {
  console.error("Usage: npm run migrate -- <UPSTASH_REST_URL> <UPSTASH_REST_TOKEN> [tf.db]");
  process.exit(1);
}
if (!fs.existsSync(dbFile)) {
  console.error("Cannot find", dbFile);
  process.exit(1);
}

function readRows() {
  try {
    const Database = require("better-sqlite3");
    return new Database(dbFile, { readonly: true }).prepare("select col,id,data from docs").all();
  } catch {
    const { DatabaseSync } = require("node:sqlite"); // Node 22+
    return new DatabaseSync(dbFile, { readOnly: true }).prepare("select col,id,data from docs").all();
  }
}

(async () => {
  const redis = new Redis({ url, token });
  const prefix = "tf-energy:docs";
  const skip = new Set(["heartbeats", "loginAttempts"]);
  const counts = {};
  for (const row of readRows()) {
    if (skip.has(row.col) || (row.col === "meta" && row.id === "secret")) continue;
    let doc = JSON.parse(row.data);
    if (row.col === "attendance" && !doc.outAt) doc = { ...doc, outAt: doc.inAt }; // close dangling sessions
    await redis.hset(`${prefix}:${row.col}`, { [row.id]: JSON.stringify(doc) });
    counts[row.col] = (counts[row.col] || 0) + 1;
  }
  console.log("Migrated:", counts);
  console.log("Done. Log in on the deployed site with your existing admin / worker passwords.");
})().catch(error => {
  console.error("Migration failed:", error.message);
  process.exit(1);
});
