// Sets a new password for admin or a worker.
//   Local database (tf.db):   npm run reset-password -- admin NewPassword123
//   Online (Upstash):         npm run reset-password -- admin NewPassword123 <UPSTASH_REST_URL> <UPSTASH_REST_TOKEN>
const bcrypt = require("bcryptjs");
const [user, password, url, token] = process.argv.slice(2);
if (!user || !password) {
  console.error("Usage: npm run reset-password -- <admin|worker-username> <new-password> [UPSTASH_REST_URL UPSTASH_REST_TOKEN]");
  process.exit(1);
}
if (url && token) { process.env.UPSTASH_REDIS_REST_URL = url; process.env.UPSTASH_REDIS_REST_TOKEN = token; }
const min = user.toLowerCase() === "admin" ? 8 : 6;
if (password.length < min) { console.error(`Password must be at least ${min} characters.`); process.exit(1); }
const store = require("../lib/store");

(async () => {
  const id = user.toLowerCase();
  const ph = await bcrypt.hash(password, 10);
  if (id === "admin") {
    const current = (await store.get("meta", "admin")) || {};
    await store.put("meta", "admin", { ...current, ph });
  } else {
    const worker = await store.get("employees", id);
    if (!worker) { console.error(`Worker "${id}" not found.`); process.exit(1); }
    await store.put("employees", id, { ...worker, ph });
  }
  console.log(`Password for "${id}" updated (storage: ${store.info.backend}).`);
  process.exit(0);
})().catch(e => { console.error("Failed:", e.message); process.exit(1); });
