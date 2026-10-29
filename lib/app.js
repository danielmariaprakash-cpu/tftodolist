const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const store = require("./store");

const app = express();
const publicDir = path.join(__dirname, "..", "public");
const now = () => Date.now();
const rid = () => crypto.randomBytes(8).toString("hex");

const STATUSES = ["pending", "progress", "completed", "verified"];
const CATEGORIES = ["dc", "pm", "st", "pj", "ad", "ot"];
const PRIORITIES = ["high", "medium", "low"];
const TASK_FIELDS = ["title", "desc", "emp", "cat", "prio", "due", "adminC", "status", "rem"];
const HEARTBEAT_EXPIRY = 120_000; // a worker is "offline" after 2 minutes without a heartbeat
const ATTENDANCE_KEEP = 90 * 24 * 3600 * 1000;
const MIN_WORKER_PASSWORD = 6;
const MIN_ADMIN_PASSWORD = 8;
const DUMMY_HASH = bcrypt.hashSync("tf-energy-dummy", 10); // equalises timing for unknown usernames

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/* ---------- bootstrap (lazy + retryable, never crashes the process) ---------- */
let bootPromise = null;
let secretCache = process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 16 ? process.env.JWT_SECRET : null;

async function boot() {
  if (!secretCache) {
    let stored = (await store.get("meta", "secret"))?.v;
    if (!stored) {
      stored = rid() + rid() + rid() + rid();
      await store.put("meta", "secret", { v: stored });
    }
    secretCache = stored;
  }
  // Optional: pre-seed the admin password from the environment on a brand-new database.
  if (process.env.ADMIN_PASSWORD && !(await store.get("meta", "admin"))) {
    await store.put("meta", "admin", { ph: await bcrypt.hash(process.env.ADMIN_PASSWORD, 10) });
  }
}

const ready = () => {
  if (!bootPromise) bootPromise = boot().catch(error => { bootPromise = null; throw error; });
  return bootPromise;
};

/* ---------- helpers ---------- */
function clientIp(req) {
  if (process.env.NETLIFY && req.headers["x-nf-client-connection-ip"]) return req.headers["x-nf-client-connection-ip"];
  if (process.env.VERCEL && req.headers["x-vercel-forwarded-for"]) return req.headers["x-vercel-forwarded-for"].split(",")[0].trim();
  return req.ip || "unknown";
}

async function requireAuth(req) {
  await ready();
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "unauthorized");
  let claims;
  try {
    claims = jwt.verify(token, secretCache);
  } catch {
    throw new HttpError(401, "unauthorized");
  }
  // A removed worker must lose access immediately, not when the token expires.
  if (claims.role === "worker" && !(await store.get("employees", claims.u))) throw new HttpError(401, "unauthorized");
  return claims;
}

const clean = (data, fields) => Object.fromEntries(
  fields.filter(key => data[key] !== undefined).map(key => [key, String(data[key]).slice(0, key === "desc" ? 2000 : 300)]),
);

const writeAudit = (claims, task, action) => store.put("audit", rid(), { task, act: action, by: claims.u, at: now() });

async function closeStale(sessions) {
  for (const session of sessions.filter(item => !item.outAt)) {
    const heartbeat = await store.get("heartbeats", session.emp);
    if (!heartbeat || now() - heartbeat.at > HEARTBEAT_EXPIRY) {
      session.outAt = heartbeat?.at || session.inAt;
      await store.put("attendance", session.id, session);
    }
  }
}

async function closeSessions(username) {
  const sessions = (await store.all("attendance")).filter(item => item.emp === username && !item.outAt);
  for (const session of sessions) await store.put("attendance", session.id, { ...session, outAt: now() });
}

async function openSession(username) {
  const sessions = await store.all("attendance");
  for (const session of sessions) {
    if (session.emp === username && !session.outAt) await store.put("attendance", session.id, { ...session, outAt: now() });
    else if (session.outAt && now() - session.outAt > ATTENDANCE_KEEP) await store.del("attendance", session.id); // housekeeping
  }
  await store.put("attendance", rid(), { emp: username, inAt: now(), outAt: null });
  await store.put("heartbeats", username, { at: now() });
}

async function stateFor(claims) {
  const admin = claims.role === "admin";
  const [employees, tasks, attendance, audit] = await Promise.all([
    store.all("employees"),
    store.all("tasks"),
    store.all("attendance"),
    admin ? store.all("audit") : Promise.resolve([]),
  ]);

  if (admin) {
    await closeStale(attendance);
  } else {
    await store.put("heartbeats", claims.u, { at: now() });
    // Resume tracking if the session was closed while the browser tab was throttled/asleep.
    if (!attendance.some(item => item.emp === claims.u && !item.outAt)) {
      const session = { emp: claims.u, inAt: now(), outAt: null };
      const id = rid();
      await store.put("attendance", id, session);
      attendance.push({ ...session, id });
    }
  }

  return {
    emps: (admin ? employees : employees.filter(item => item.id === claims.u)).map(({ ph, ...employee }) => employee),
    tasks: admin ? tasks : tasks.filter(item => item.emp === claims.u),
    att: attendance.filter(item => admin || item.emp === claims.u).sort((a, b) => b.inAt - a.inAt).slice(0, 400),
    audit: admin ? audit.sort((a, b) => b.at - a.at).slice(0, 200) : [],
    serverTime: now(),
  };
}

function validateTask(task, { partial }) {
  if (task.status !== undefined && !STATUSES.includes(task.status)) throw new HttpError(400, "invalid status");
  if (task.cat !== undefined && !CATEGORIES.includes(task.cat)) throw new HttpError(400, "invalid category");
  if (task.prio !== undefined && !PRIORITIES.includes(task.prio)) throw new HttpError(400, "invalid priority");
  if (task.due !== undefined && task.due !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(task.due)) throw new HttpError(400, "invalid date");
  if (!partial && !task.title?.trim()) throw new HttpError(400, "title required");
  if (task.title !== undefined) task.title = task.title.trim();
  if (task.title === "") throw new HttpError(400, "title required");
}

async function applyAction(claims, message) {
  const admin = claims.role === "admin";
  const data = message.data && typeof message.data === "object" ? message.data : {};

  if (message.col === "tasks") {
    if (message.op === "add" && admin) {
      const task = clean(data, TASK_FIELDS);
      task.status ||= "pending";
      task.cat ||= "ot";
      task.prio ||= "medium";
      validateTask(task, { partial: false });
      if (!(await store.get("employees", task.emp))) throw new HttpError(400, "worker not found");
      await store.put("tasks", rid(), { ...task, created: now(), updated: now(), by: claims.u });
      await writeAudit(claims, task.title, "created");
      return;
    }

    if (message.op === "del" && admin) {
      const task = await store.get("tasks", message.id);
      if (!task) throw new HttpError(404, "not found");
      await store.del("tasks", message.id);
      await writeAudit(claims, task.title, "deleted");
      return;
    }

    if (message.op === "update") {
      const task = await store.get("tasks", message.id);
      if (!task) throw new HttpError(404, "not found");
      let updates;
      if (admin) {
        updates = clean(data, TASK_FIELDS);
        validateTask(updates, { partial: true });
        if (updates.emp !== undefined && !(await store.get("employees", updates.emp))) throw new HttpError(400, "worker not found");
      } else {
        if (task.emp !== claims.u || task.status === "verified") throw new HttpError(403, "denied");
        updates = clean(data, ["status", "rem"]);
        if (updates.status && !STATUSES.slice(0, 3).includes(updates.status)) throw new HttpError(403, "denied");
      }
      await store.put("tasks", message.id, { ...task, ...updates, updated: now(), by: claims.u });
      await writeAudit(claims, task.title, updates.status && updates.status !== task.status ? updates.status : "edited");
      return;
    }
    throw new HttpError(403, "denied");
  }

  if (message.col === "employees" && admin) {
    if (message.op === "set") {
      const id = String(message.id || "").toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 40);
      const name = String(data.name || "").trim();
      const password = String(data.pw || "");
      const existing = id ? await store.get("employees", id) : null;
      if (!id || id === "admin" || !name) throw new HttpError(400, "invalid worker");
      if (!existing && !password) throw new HttpError(400, "password required");
      if (password && password.length < MIN_WORKER_PASSWORD) throw new HttpError(400, `password must be at least ${MIN_WORKER_PASSWORD} characters`);
      await store.put("employees", id, {
        name: name.slice(0, 80),
        email: String(data.email || "").trim().slice(0, 120),
        role: String(data.role || "").trim().slice(0, 80),
        ph: password ? await bcrypt.hash(password, 10) : existing.ph,
      });
      await writeAudit(claims, name, existing ? "worker updated" : "worker added");
      return;
    }

    if (message.op === "del") {
      const worker = await store.get("employees", message.id);
      if (!worker) throw new HttpError(404, "not found");
      await closeSessions(message.id);
      for (const task of (await store.all("tasks")).filter(item => item.emp === message.id)) await store.del("tasks", task.id);
      await store.del("heartbeats", message.id);
      await store.del("employees", message.id);
      await writeAudit(claims, worker.name, "worker removed");
      return;
    }
  }
  throw new HttpError(403, "denied");
}

/* ---------- middleware ---------- */
if (store.info.serverless) app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
  });
  next();
});
// serverless-http (Netlify) pre-reads the body into a Buffer, which express.json() would skip. Normalise it first.
app.use((req, res, next) => {
  if (Buffer.isBuffer(req.body)) {
    try {
      req.body = req.body.length ? JSON.parse(req.body.toString("utf8")) : {};
    } catch {
      return next(new HttpError(400, "invalid json"));
    }
  }
  next();
});
app.use(express.json({ limit: "20kb" }));
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

/* ---------- API ---------- */
app.get("/api/health", async (req, res) => {
  const body = { ok: true, storage: store.info.backend, databaseConfigured: store.info.available, needsSetup: false };
  if (store.info.available) {
    try {
      await ready();
      body.needsSetup = !(await store.get("meta", "admin"));
    } catch (error) {
      body.ok = false;
      body.error = "Database connection failed. Check the Upstash URL/token.";
    }
  } else {
    body.ok = false;
    body.error = "Database not configured. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.";
  }
  res.status(body.ok ? 200 : 503).json(body);
});

// First-run only: lets the owner choose the admin password when none exists yet.
app.post("/api/setup", async (req, res) => {
  await ready();
  if (await store.get("meta", "admin")) throw new HttpError(409, "already set up");
  const password = String(req.body?.p || "");
  if (password.length < MIN_ADMIN_PASSWORD) throw new HttpError(400, `password must be at least ${MIN_ADMIN_PASSWORD} characters`);
  await store.put("meta", "admin", { ph: await bcrypt.hash(password, 10) });
  res.json({ ok: true });
});

app.post("/api/login", async (req, res) => {
  await ready();
  const username = String(req.body?.u || "").trim().toLowerCase().slice(0, 60);
  const password = String(req.body?.p || "").slice(0, 200);
  const rateKey = crypto.createHash("sha256").update(`${username}:${clientIp(req)}`).digest("hex");
  if ((await store.incrementCounter(rateKey, 60)) > 5) return res.status(429).json({ error: "too many attempts" });

  const account = username === "admin" ? await store.get("meta", "admin") : await store.get("employees", username);
  const valid = await bcrypt.compare(password, account?.ph || DUMMY_HASH);
  if (!account?.ph || !valid) return res.status(401).json({ error: "invalid credentials" });

  await store.clearCounter(rateKey);
  const role = username === "admin" ? "admin" : "worker";
  if (role === "worker") await openSession(username);
  const token = jwt.sign({ u: username, role }, secretCache, { expiresIn: "12h" });
  res.json({ token, role, u: username });
});

app.get("/api/state", async (req, res) => res.json(await stateFor(await requireAuth(req))));

app.post("/api/action", async (req, res) => {
  await applyAction(await requireAuth(req), req.body || {});
  res.json({ ok: true });
});

app.post("/api/password", async (req, res) => {
  const claims = await requireAuth(req);
  const current = String(req.body?.old || "");
  const next = String(req.body?.new || "");
  const min = claims.role === "admin" ? MIN_ADMIN_PASSWORD : MIN_WORKER_PASSWORD;
  if (next.length < min) throw new HttpError(400, `password must be at least ${min} characters`);
  const admin = claims.role === "admin";
  const account = admin ? await store.get("meta", "admin") : await store.get("employees", claims.u);
  if (!account || !(await bcrypt.compare(current, account.ph))) throw new HttpError(403, "current password is wrong");
  const updated = { ...account, ph: await bcrypt.hash(next, 10) };
  if (admin) await store.put("meta", "admin", updated);
  else await store.put("employees", claims.u, updated);
  res.json({ ok: true });
});

app.post("/api/logout", async (req, res) => {
  const claims = await requireAuth(req);
  if (claims.role === "worker") await closeSessions(claims.u);
  res.json({ ok: true });
});

app.all("/api/*splat", (req, res) => res.status(404).json({ error: "not found" }));

/* ---------- pages (local server; on Vercel/Netlify the CDN serves these) ---------- */
const page = name => (req, res) => res.sendFile(path.join(publicDir, `${name}.html`));
app.get("/login", page("login"));
app.get("/admin", page("admin"));
app.get("/user", page("user"));
app.use(express.static(publicDir, { extensions: ["html"], index: "index.html" }));
app.use((req, res) => {
  const notFound = path.join(publicDir, "404.html");
  if (fs.existsSync(notFound)) res.status(404).sendFile(notFound);
  else res.status(404).send("Not found");
});

/* ---------- errors ---------- */
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500 && status !== 503) console.error(err);
  const message = status < 500 || status === 503 ? err.message : "internal error";
  res.status(status).json({ error: message, code: err.code });
});

module.exports = app;
