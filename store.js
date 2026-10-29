// Storage layer. Picks the first backend that is available:
//   1. Upstash Redis (REST)  -> required on Vercel / Netlify (serverless has no persistent disk)
//   2. SQLite (better-sqlite3) -> local development
//   3. JSON file               -> local fallback if better-sqlite3 could not be installed
const fs = require("fs");
const path = require("path");

const prefix = "tf-energy:docs";
const serverless = Boolean(process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);

// Accept the manual Upstash names AND whatever the Vercel/Netlify marketplace integration injected,
// including prefixed names such as UPSTASH_REDIS_REST_KV_REST_API_URL / ..._TOKEN.
const envKeys = Object.keys(process.env);
const findEnv = (...suffixes) => {
  const key = envKeys.find(k => !/READ_ONLY/i.test(k) && suffixes.some(s => k.endsWith(s)) && process.env[k]);
  return key ? process.env[key] : undefined;
};
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || process.env.REDIS_REST_URL
  || findEnv("_REST_API_URL", "REDIS_REST_URL");
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || process.env.REDIS_REST_TOKEN
  || findEnv("_REST_API_TOKEN", "REDIS_REST_TOKEN");

let backend = "none";
let redis = null;
let sql = null;
let fileData = null;
let filePath = null;

if (redisUrl && redisToken) {
  const { Redis } = require("@upstash/redis");
  redis = new Redis({ url: redisUrl, token: redisToken });
  backend = "redis";
} else if (!serverless) {
  try {
    const Database = require("better-sqlite3");
    sql = new Database(process.env.DB_FILE || path.join(process.cwd(), "tf.db"));
    sql.exec("create table if not exists docs(col text,id text,data text,primary key(col,id))");
    sql.q = {
      get: sql.prepare("select data from docs where col=? and id=?"),
      all: sql.prepare("select id,data from docs where col=?"),
      put: sql.prepare("insert or replace into docs values(?,?,?)"),
      del: sql.prepare("delete from docs where col=? and id=?"),
    };
    backend = "sqlite";
  } catch (error) {
    filePath = process.env.DB_FILE ? `${process.env.DB_FILE}.json` : path.join(process.cwd(), "tf-data.json");
    try { fileData = JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { fileData = {}; }
    backend = "file";
    console.warn("better-sqlite3 unavailable, using JSON file storage:", filePath);
  }
}

const available = backend !== "none";
const guard = () => {
  if (!available) {
    const error = new Error("Database not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.");
    error.status = 503;
    error.code = "no_database";
    throw error;
  }
};

const parse = value => (value == null ? null : typeof value === "string" ? JSON.parse(value) : value);
const saveFile = () => {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(fileData));
  fs.renameSync(tmp, filePath);
};

async function get(collection, id) {
  guard();
  if (redis) return parse(await redis.hget(`${prefix}:${collection}`, id));
  if (sql) return parse(sql.q.get.get(collection, id)?.data);
  return fileData[collection]?.[id] ?? null;
}

async function put(collection, id, data) {
  guard();
  const { id: _ignored, ...doc } = data; // ids live in the key, never in the document
  if (redis) await redis.hset(`${prefix}:${collection}`, { [id]: JSON.stringify(doc) });
  else if (sql) sql.q.put.run(collection, id, JSON.stringify(doc));
  else {
    (fileData[collection] ||= {})[id] = doc;
    saveFile();
  }
}

async function del(collection, id) {
  guard();
  if (redis) await redis.hdel(`${prefix}:${collection}`, id);
  else if (sql) sql.q.del.run(collection, id);
  else if (fileData[collection]) {
    delete fileData[collection][id];
    saveFile();
  }
}

async function all(collection) {
  guard();
  if (redis) {
    const values = (await redis.hgetall(`${prefix}:${collection}`)) || {};
    return Object.entries(values).map(([id, value]) => ({ ...parse(value), id }));
  }
  if (sql) return sql.q.all.all(collection).map(row => ({ ...JSON.parse(row.data), id: row.id }));
  return Object.entries(fileData[collection] || {}).map(([id, value]) => ({ ...value, id }));
}

// Login-attempt counter used for rate limiting.
async function incrementCounter(key, ttlSeconds) {
  guard();
  if (redis) {
    const redisKey = `tf-energy:login:${key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) await redis.expire(redisKey, ttlSeconds);
    return count;
  }
  const current = await get("loginAttempts", key);
  const at = Date.now();
  const count = current && current.expiresAt > at ? current.count + 1 : 1;
  await put("loginAttempts", key, { count, expiresAt: at + ttlSeconds * 1000 });
  return count;
}

async function clearCounter(key) {
  guard();
  if (redis) await redis.del(`tf-energy:login:${key}`);
  else await del("loginAttempts", key);
}

module.exports = {
  all, clearCounter, del, get, incrementCounter, put,
  info: { backend, available, serverless },
  prefix,
};
