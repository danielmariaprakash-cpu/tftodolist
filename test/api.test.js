const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const bcrypt = require("bcryptjs");
const { once } = require("node:events");
const { after, before, test } = require("node:test");

let app;
let server;
let baseUrl;
let tempDir;

before(async () => {
  delete process.env.VERCEL;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tf-energy-test-"));
  process.env.DB_FILE = path.join(tempDir, "test.db");
  process.env.ADMIN_PASSWORD = "test-admin-password";
  process.env.JWT_SECRET = "test-jwt-secret-with-at-least-thirty-two-characters";
  const store = require("../lib/store");
  await store.put("meta", "admin", { ph: bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10) });
  await store.put("employees", "seed", {
    name: "Seed Worker",
    email: "",
    role: "",
    ph: bcrypt.hashSync("seed-password", 10),
  });
  app = require("../lib/app");
  server = app.listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

const login = async (username, password) => {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ u: username, p: password }),
  });
  return { response, body: await response.json() };
};

const action = (token, body) => fetch(`${baseUrl}/api/action`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
});

const state = token => fetch(`${baseUrl}/api/state`, {
  headers: { authorization: `Bearer ${token}` },
});

test("login, role access, task updates, and logout work over HTTP", async () => {
  const loginPage = await fetch(`${baseUrl}/login`);
  assert.equal(loginPage.status, 200);
  assert.match(await loginPage.text(), /TF ENERGY SRL/);

  const anonymous = await state("");
  assert.equal(anonymous.status, 401);

  for (let attempt = 0; attempt < 5; attempt++) {
    const invalid = await login("unknown-user", "wrong-password");
    assert.equal(invalid.response.status, 401);
  }
  const rateLimited = await login("unknown-user", "wrong-password");
  assert.equal(rateLimited.response.status, 429);

  const { response: adminResponse, body: admin } = await login("admin", "test-admin-password");
  assert.equal(adminResponse.status, 200);

  const createWorker = await action(admin.token, {
    op: "set",
    col: "employees",
    id: "tester",
    data: { name: "Test Worker", pw: "worker-password" },
  });
  assert.equal(createWorker.status, 200);

  const { response: workerResponse, body: worker } = await login("tester", "worker-password");
  assert.equal(workerResponse.status, 200);

  const createTask = await action(admin.token, {
    op: "add",
    col: "tasks",
    data: { title: "Smoke test task", emp: "tester", status: "pending" },
  });
  assert.equal(createTask.status, 200);

  const adminState = await (await state(admin.token)).json();
  const task = adminState.tasks.find(item => item.title === "Smoke test task");
  assert.ok(task);
  assert.equal("ph" in adminState.emps.find(item => item.id === "tester"), false);

  const workerState = await (await state(worker.token)).json();
  assert.deepEqual(workerState.tasks.map(item => item.id), [task.id]);
  assert.deepEqual(workerState.audit, []);

  const denied = await action(worker.token, {
    op: "add",
    col: "tasks",
    data: { title: "Unauthorized task", emp: "tester" },
  });
  assert.equal(denied.status, 403);

  const update = await action(worker.token, {
    op: "update",
    col: "tasks",
    id: task.id,
    data: { status: "completed", rem: "done" },
  });
  assert.equal(update.status, 200);

  const latestState = await (await state(worker.token)).json();
  assert.equal(latestState.tasks[0].status, "completed");

  const logout = await fetch(`${baseUrl}/api/logout`, {
    method: "POST",
    headers: { authorization: `Bearer ${worker.token}` },
  });
  assert.equal(logout.status, 200);

  // password change
  const badPw = await fetch(`${baseUrl}/api/password`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${worker.token}` },
    body: JSON.stringify({ old: "nope", new: "another-password" }),
  });
  assert.equal(badPw.status, 403);
  const goodPw = await fetch(`${baseUrl}/api/password`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${worker.token}` },
    body: JSON.stringify({ old: "worker-password", new: "another-password" }),
  });
  assert.equal(goodPw.status, 200);
  assert.equal((await login("tester", "another-password")).response.status, 200);

  // validation
  const badTask = await action(admin.token, { op: "add", col: "tasks", data: { title: "x", emp: "tester", prio: "urgent" } });
  assert.equal(badTask.status, 400);
  const badEmp = await action(admin.token, { op: "add", col: "tasks", data: { title: "x", emp: "ghost" } });
  assert.equal(badEmp.status, 400);

  // removed worker loses access immediately and their tasks go with them
  const remove = await action(admin.token, { op: "del", col: "employees", id: "tester" });
  assert.equal(remove.status, 200);
  assert.equal((await state(worker.token)).status, 401);
  const afterRemove = await (await state(admin.token)).json();
  assert.equal(afterRemove.tasks.some(item => item.emp === "tester"), false);
});

test("health, unknown api routes and malformed json return JSON", async () => {
  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200);
  const body = await health.json();
  assert.equal(body.ok, true);
  assert.equal(body.needsSetup, false);

  const missing = await fetch(`${baseUrl}/api/nope`);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error, "not found");

  const broken = await fetch(`${baseUrl}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: "{oops" });
  assert.equal(broken.status, 400);

  const setup = await fetch(`${baseUrl}/api/setup`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ p: "long-enough-pass" }) });
  assert.equal(setup.status, 409);
});
