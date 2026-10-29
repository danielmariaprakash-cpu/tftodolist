/* TF ENERGY SRL – dashboard for admin (/admin) and workers (/user). */
const CATS = ["dc", "pm", "st", "pj", "ad", "ot"];
const ST = ["pending", "progress", "completed", "verified"];
const COLORS = ["--c1", "--c2", "--c3", "--c4"];
const PRIO_ORDER = { high: 0, medium: 1, low: 2 };
const POLL_MS = { admin: 10000, worker: 15000 };

const S = { tasks: [], emps: {}, audit: [], att: [], view: "dash", emp: null, loaded: false,
  filter: { q: "", emp: "", cat: "", prio: "", status: "", sort: "due" } };
let token = null, me = null, isAdmin = false, timer = null, busy = false, seen = false, online = false;

const $ = s => document.querySelector(s);
const t = k => Lang.t(k);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nm = id => S.emps[id]?.name || (id === "admin" ? "Admin" : id || "?");
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const isOver = x => x.due && x.due < today() && x.status !== "completed" && x.status !== "verified";
const fd = ts => ts ? new Date(ts).toLocaleString(Lang.locale(), { dateStyle: "short", timeStyle: "short" }) : "—";
const ft = ts => new Date(ts).toLocaleTimeString(Lang.locale(), { timeStyle: "short" });
const dur = ms => `${Math.floor(ms / 36e5)}h ${String(Math.floor(ms % 36e5 / 6e4)).padStart(2, "0")}m`;

function counts(list) {
  const c = { pending: 0, progress: 0, completed: 0, verified: 0, total: list.length, overdue: 0 };
  list.forEach(x => { if (c[x.status] !== undefined) c[x.status]++; if (isOver(x)) c.overdue++; });
  c.pct = c.total ? Math.round((c.completed + c.verified) / c.total * 100) : 0;
  return c;
}
function pie(c) {
  let angle = 0; const parts = [];
  ST.forEach((s, i) => { const d = c.total ? c[s] / c.total * 360 : 0; parts.push(`var(${COLORS[i]}) ${angle}deg ${angle + d}deg`); angle += d; });
  return `<div class="pie" role="img" aria-label="${c.pct}%" style="background:${c.total ? `conic-gradient(${parts.join(",")})` : "var(--bd)"}"><i>${c.pct}%</i></div>`;
}
const legend = c => `<div class="lg">${ST.map((s, i) => `<span><em style="background:var(${COLORS[i]})"></em>${t(s)} ${c[s]}</span>`).join("")}</div>`;
const bar = c => `<div class="bar">${ST.map((s, i) => `<div style="width:${c.total ? c[s] / c.total * 100 : 0}%;background:var(${COLORS[i]})"></div>`).join("")}</div>`;

function attendanceOf(id) {
  const rows = S.att.filter(x => x.emp === id), start = new Date().setHours(0, 0, 0, 0);
  const todayMs = rows.reduce((sum, x) => {
    const end = x.outAt || Date.now(), from = Math.max(x.inAt, start);
    return sum + Math.max(0, end - from);
  }, 0);
  return { open: rows.find(x => !x.outAt), lastIn: rows[0]?.inAt, lastOut: rows.find(x => x.outAt)?.outAt, todayMs };
}

/* ---------- network ---------- */
function setLive(on) {
  online = on;
  const el = $("#live");
  if (el) { el.textContent = on ? `● ${t("live")}` : `○ ${t("connecting")}`; el.className = on ? "livedot on" : "livedot"; }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) { logout(true, true); throw new Error(t("sessionExpired")); }
  if (!response.ok) throw new Error(body.error || t("errorGeneric"));
  return body;
}
const send = async message => { await api("/api/action", { method: "POST", body: JSON.stringify(message) }); refresh(); };
const taskOp = (id, data) => send({ col: "tasks", op: "update", id, data });

async function refresh() {
  if (!token || busy) return;
  busy = true; clearTimeout(timer);
  try {
    const m = await api("/api/state");
    const old = Object.fromEntries(S.tasks.map(x => [x.id, x]));
    if (seen) m.tasks.forEach(x => { if ((!old[x.id] || old[x.id].updated !== x.updated) && x.by !== me) toast(`${t("updated")}: ${x.title}`); });
    seen = true;
    S.emps = Object.fromEntries(m.emps.map(({ id, ...d }) => [id, d]));
    S.tasks = m.tasks; S.att = m.att; S.audit = m.audit; S.loaded = true;
    setLive(true); render();
  } catch (e) { if (token) setLive(false); }
  finally { busy = false; if (token) timer = setTimeout(refresh, POLL_MS[isAdmin ? "admin" : "worker"]); }
}

async function logout(skipServer, expired) {
  const tk = token; token = null; clearTimeout(timer);
  if (tk && !skipServer) { try { await fetch("/api/logout", { method: "POST", headers: { authorization: `Bearer ${tk}` } }); } catch (e) { /* offline */ } }
  try { sessionStorage.removeItem("tfs"); } catch (e) { /* ignore */ }
  location.replace("/login" + (expired ? "?expired=1" : ""));
}

/* ---------- views ---------- */
function taskHTML(x, adm) {
  const canEdit = adm || x.status !== "verified";
  return `<div class="task"><div class="row"><b style="flex:1">${esc(x.title)}</b><span class="tag">${t(x.cat)}</span><span class="tag p-${esc(x.prio || "medium")}">${t(x.prio || "medium")}</span><span class="tag s-${esc(x.status)}">${t(x.status)}</span></div>
<div class="mut">${adm ? esc(nm(x.emp)) + " · " : ""}${t("due")}: <span class="${isOver(x) ? "over" : ""}">${esc(x.due || "—")}</span> · ${fd(x.updated || x.created)} ${t("by")} ${esc(nm(x.by))}</div>
${x.desc ? `<div class="desc">${esc(x.desc)}</div>` : ""}${x.adminC ? `<div class="mut">💬 ${esc(x.adminC)}</div>` : ""}${x.rem ? `<div class="mut">📝 ${esc(x.rem)}</div>` : ""}
<div class="acts">${canEdit ? `<button class="ghost" data-a="edit" data-id="${esc(x.id)}">${adm ? t("edit") : t("mark")}</button>` : ""}
${adm && x.status === "completed" ? `<button data-a="verify" data-id="${esc(x.id)}">✔ ${t("verify")}</button><button class="bad" data-a="reject" data-id="${esc(x.id)}">✖ ${t("reject")}</button>` : ""}
${adm ? `<button class="ghost" data-a="del" data-id="${esc(x.id)}">${t("del")}</button>` : ""}</div></div>`;
}

function workerView(id, adm) {
  const e = S.emps[id] || {}, list = S.tasks.filter(x => x.emp === id), c = counts(list), a = attendanceOf(id);
  const sorted = [...list].sort((x, y) => (x.due || "9").localeCompare(y.due || "9"));
  return `${adm ? `<div class="acts"><button class="ghost" data-a="nav" data-id="dash">←</button><button data-a="new" data-id="${esc(id)}">+ ${t("newtask")}</button></div>` : ""}
<div class="card"><h2>${esc(e.name)} <span class="tag">${esc(e.role || "")}</span></h2><div class="row">${pie(c)}<div>${legend(c)}<div class="mut">${c.pct}% ${t("done")} · ${t("overdue")}: ${c.overdue}</div>
<div class="mut">${a.open ? "🟢 " + t("working") + " " + t("since") + " " + ft(a.open.inAt) : "⚪ " + t("offline")} · ${t("sessionToday")}: ${dur(a.todayMs)}</div></div></div></div>
<div class="card"><h2>${t("mytasks")}</h2>${sorted.length ? sorted.map(x => taskHTML(x, adm)).join("") : `<span class="mut">${t("none")}</span>`}</div>`;
}

function filteredTasks() {
  const f = S.filter, q = f.q.trim().toLowerCase();
  const list = S.tasks.filter(x => (!f.emp || x.emp === f.emp) && (!f.cat || x.cat === f.cat) && (!f.prio || (x.prio || "medium") === f.prio) &&
    (!f.status || x.status === f.status) && (!q || [x.title, x.desc, x.adminC, x.rem, nm(x.emp)].join(" ").toLowerCase().includes(q)));
  const sorts = {
    due: (a, b) => (a.due || "9").localeCompare(b.due || "9"),
    new: (a, b) => (b.created || 0) - (a.created || 0),
    prio: (a, b) => PRIO_ORDER[a.prio || "medium"] - PRIO_ORDER[b.prio || "medium"],
  };
  return list.sort(sorts[f.sort] || sorts.due);
}
const opt = (list, val, label) => list.map(k => `<option value="${esc(k)}" ${k === val ? "selected" : ""}>${esc(label ? label(k) : t(k))}</option>`).join("");

function tasksView() {
  const f = S.filter, list = filteredTasks(), ids = Object.keys(S.emps);
  return `<div class="acts"><button data-a="new" data-id="">+ ${t("newtask")}</button><button class="ghost" data-a="csv-tasks">⬇ ${t("exportTasks")}</button></div>
<div class="card filters"><input id="f-q" type="search" placeholder="${t("search")}" value="${esc(f.q)}">
<select id="f-emp"><option value="">${t("allw")}</option>${opt(ids, f.emp, k => S.emps[k].name)}</select>
<select id="f-cat"><option value="">${t("allc")}</option>${opt(CATS, f.cat)}</select>
<select id="f-prio"><option value="">${t("allp")}</option>${opt(["high", "medium", "low"], f.prio)}</select>
<select id="f-status"><option value="">${t("allst")}</option>${opt(ST, f.status)}</select>
<select id="f-sort"><option value="due" ${f.sort === "due" ? "selected" : ""}>${t("sort")}: ${t("sortDue")}</option><option value="new" ${f.sort === "new" ? "selected" : ""}>${t("sort")}: ${t("sortNew")}</option><option value="prio" ${f.sort === "prio" ? "selected" : ""}>${t("sort")}: ${t("sortPrio")}</option></select></div>
<div class="mut" style="margin:0 0 8px 4px">${list.length} ${t("results")}</div>
<div class="card">${list.length ? list.map(x => taskHTML(x, true)).join("") : `<span class="mut">${t("none")}</span>`}</div>`;
}

function teamView() {
  const ids = Object.keys(S.emps);
  return `<div class="acts"><button data-a="ew" data-id="">+ ${t("addw")}</button></div>
<div class="card">${ids.length ? ids.map(id => `<div class="task row"><b style="flex:1">${esc(S.emps[id].name)} <span class="mut">(${esc(id)})</span></b><span class="tag">${esc(S.emps[id].role || "—")}</span><span class="mut">${esc(S.emps[id].email || "")}</span>
<button class="ghost" data-a="ew" data-id="${esc(id)}">${t("edit")}</button><button class="ghost" data-a="rmw" data-id="${esc(id)}">${t("remove")}</button></div>`).join("") : `<span class="mut">${t("noWorkers")}</span>`}</div>`;
}

function statusView() {
  const ids = Object.keys(S.emps);
  const rows = ids.map(id => {
    const s = attendanceOf(id), k = counts(S.tasks.filter(x => x.emp === id));
    return `<tr><td><b>${esc(S.emps[id].name)}</b><br><span class="mut">${esc(S.emps[id].role || "")}</span></td><td class="${s.open ? "on" : "mut"}">${s.open ? "🟢 " + t("working") + " " + t("since") + " " + ft(s.open.inAt) : "⚪ " + t("offline")}</td><td>${fd(s.lastIn)}</td><td>${fd(s.lastOut)}</td><td>${dur(s.todayMs)}</td><td>${k.pct}%</td></tr>`;
  }).join("");
  const sessions = S.att.slice(0, 30).map(x => `<tr><td>${esc(nm(x.emp))}</td><td>${fd(x.inAt)}</td><td>${x.outAt ? fd(x.outAt) : `<span class="on">${t("still")}</span>`}</td><td>${dur((x.outAt || Date.now()) - x.inAt)}</td></tr>`).join("");
  return `<div class="card"><h2>${t("wstat")}</h2><table><tr><th>${t("emp")}</th><th>${t("status")}</th><th>${t("lastin")}</th><th>${t("lastout")}</th><th>${t("today")}</th><th>%</th></tr>${rows}</table></div>
<div class="card"><div class="row"><h2 style="flex:1">${t("sess")}</h2><button class="ghost" data-a="csv-att">⬇ ${t("exportAtt")}</button></div><table><tr><th>${t("emp")}</th><th>${t("in")}</th><th>${t("out")}</th><th>${t("duration")}</th></tr>${sessions}</table></div>`;
}

const logLine = l => `${fd(l.at)} · <b>${esc(nm(l.by))}</b> · ${esc(t("act_" + l.act) === "act_" + l.act ? l.act : t("act_" + l.act))} · ${esc(l.task)}`;

function dashView() {
  const c = counts(S.tasks), ids = Object.keys(S.emps);
  return `<div class="grid">${[["total", c.total], ["pending", c.pending], ["progress", c.progress], ["await", c.completed], ["verified", c.verified], ["overdue", c.overdue]].map(([k, v]) => `<div class="card stat"><b>${v}</b><span class="mut">${t(k)}</span></div>`).join("")}</div>
<div class="card row">${pie(c)}<div>${legend(c)}<div class="mut">${c.pct}% ${t("done")}</div></div></div>
<div class="card"><h2>${t("team")}</h2>${ids.length ? ids.map(id => {
    const k = counts(S.tasks.filter(x => x.emp === id)), s = attendanceOf(id);
    return `<div class="task row"><b style="min-width:150px">${s.open ? "🟢" : "⚪"} ${esc(S.emps[id].name)}<br><span class="mut">${esc(S.emps[id].role || "")}</span></b>${bar(k)}<span>${k.pct}%</span><button class="ghost" data-a="open" data-id="${esc(id)}">${t("open")}</button></div>`;
  }).join("") : `<span class="mut">${t("noWorkers")}</span>`}</div>
<div class="card"><h2>${t("activity")}</h2>${S.audit.slice(0, 8).map(l => `<div class="mut">${logLine(l)}</div>`).join("") || `<span class="mut">${t("nothing")}</span>`}</div>`;
}

function render() {
  const A = $("#app");
  if (!S.loaded) { A.innerHTML = `<div class="mut center">${t("loading")}</div>`; return; }
  // keep keyboard focus (e.g. while typing in the search box) across re-renders
  const focused = document.activeElement?.id, caret = document.activeElement?.selectionStart;
  $("#lang").value = Lang.current;
  $("#out").hidden = false; $("#out").textContent = t("logout");
  $("#acct").textContent = "👤 " + nm(me); $("#acct").title = t("account");
  $("#nav").innerHTML = isAdmin ? [["dash", "dash"], ["wstat", "wstat"], ["tasks", "tasks"], ["team", "team"], ["log", "log"]]
    .map(([k, l]) => `<button data-a="nav" data-id="${k}" class="${S.view === k ? "on" : ""}">${t(l)}</button>`).join("") : "";
  setLive(online);
  if (isAdmin) {
    A.innerHTML = S.view === "emp" ? workerView(S.emp, true) : S.view === "tasks" ? tasksView() : S.view === "team" ? teamView()
      : S.view === "wstat" ? statusView() : S.view === "log" ? `<div class="card"><h2>${t("log")}</h2>${S.audit.map(l => `<div class="task mut">${logLine(l)}</div>`).join("") || t("nothing")}</div>` : dashView();
  } else if (S.emps[me]) {
    A.innerHTML = `<div class="card"><b>${t("hello")}, ${esc(S.emps[me].name)}</b></div>` + workerView(me, false);
  }
  if (focused && $("#" + focused)) { const el = $("#" + focused); el.focus(); if (caret != null && el.setSelectionRange) try { el.setSelectionRange(caret, caret); } catch (e) { /* not text */ } }
}

/* ---------- modals ---------- */
const modal = html => { $("#mb").innerHTML = html; $("#modal").style.display = "flex"; const first = $("#mb input:not([type=hidden]),#mb select,#mb textarea"); if (first) first.focus(); };
const closeModal = () => { $("#modal").style.display = "none"; $("#mb").innerHTML = ""; };

function taskForm(x) {
  x = x || {};
  modal(`<h2>${x.id ? t("edit") : t("newtask")}</h2><input type="hidden" id="t-id" value="${esc(x.id || "")}">
${isAdmin ? `<label>${t("title")}</label><input id="t-title" maxlength="300" value="${esc(x.title)}"><label>${t("desc")}</label><textarea id="t-desc" rows="3">${esc(x.desc)}</textarea>
<label>${t("emp")}</label><select id="t-emp">${opt(Object.keys(S.emps), x.emp, k => S.emps[k].name)}</select>
<label>${t("cat")}</label><select id="t-cat">${opt(CATS, x.cat || "dc")}</select><label>${t("prio")}</label><select id="t-prio">${opt(["high", "medium", "low"], x.prio || "medium")}</select>
<label>${t("due")}</label><input type="date" id="t-due" value="${esc(x.due || "")}"><label>${t("adm")}</label><input id="t-adm" maxlength="300" value="${esc(x.adminC)}">` : `<b>${esc(x.title)}</b>`}
<label>${t("status")}</label><select id="t-st">${opt(isAdmin ? ST : ST.slice(0, 3), x.status || "pending")}</select>
<label>${t("rem")}</label><input id="t-rem" maxlength="300" value="${esc(x.rem)}">
<div class="acts"><button data-a="savetask">${t("save")}</button><button class="ghost" data-a="close">${t("cancel")}</button></div>`);
}
function workerForm(id) {
  const e = S.emps[id] || {};
  modal(`<h2>${id ? t("edit") : t("addw")}</h2><label>${t("user")}</label><input id="w-id" maxlength="40" value="${esc(id)}" ${id ? "disabled" : ""} autocomplete="off">
<label>${t("name")}</label><input id="w-n" maxlength="80" value="${esc(e.name)}"><label>${t("email")}</label><input id="w-e" type="email" maxlength="120" value="${esc(e.email)}">
<label>${t("role")}</label><input id="w-r" maxlength="80" value="${esc(e.role)}"><label>${id ? t("newpw") : t("pass")}</label><input id="w-p" type="password" autocomplete="new-password">
<div class="acts"><button data-a="savew">${t("save")}</button><button class="ghost" data-a="close">${t("cancel")}</button></div>`);
}
function accountForm() {
  modal(`<h2>${t("account")} · ${esc(nm(me))}</h2><h3>${t("chpw")}</h3><label>${t("oldpw")}</label><input id="a-old" type="password" autocomplete="current-password">
<label>${t("newpw2")}</label><input id="a-new" type="password" autocomplete="new-password"><div class="mut">${t("pwMin")}</div>
<div class="acts"><button data-a="savepw">${t("save")}</button><button class="ghost" data-a="close">${t("cancel")}</button></div>`);
}

/* ---------- CSV export ---------- */
function download(name, rows) {
  const csv = "\ufeff" + rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `${name}-${today()}.csv`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const exportTasks = () => download("tf-tasks", [["Title", "Worker", "Category", "Priority", "Status", "Due", "Description", "Admin comment", "Worker remarks", "Updated"],
  ...filteredTasks().map(x => [x.title, nm(x.emp), t(x.cat), t(x.prio || "medium"), t(x.status), x.due, x.desc, x.adminC, x.rem, fd(x.updated)])]);
const exportAtt = () => download("tf-attendance", [["Worker", "Login", "Logout", "Minutes"],
  ...S.att.map(x => [nm(x.emp), fd(x.inAt), x.outAt ? fd(x.outAt) : "", Math.round(((x.outAt || Date.now()) - x.inAt) / 60000)])]);

/* ---------- events ---------- */
let toastTimer;
function toast(message) { const el = $("#toast"); el.textContent = message; el.style.display = "block"; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.style.display = "none", 3500); }
const val = id => $("#" + id).value;

document.addEventListener("click", async ev => {
  const b = ev.target.closest("[data-a]");
  if (!b || b.disabled) return;
  const a = b.dataset.a, id = b.dataset.id;
  try {
    if (a === "nav") { S.view = id; render(); }
    else if (a === "open") { S.view = "emp"; S.emp = id; render(); }
    else if (a === "new") taskForm({ emp: id || Object.keys(S.emps)[0] });
    else if (a === "edit") taskForm(S.tasks.find(x => x.id === id));
    else if (a === "close") closeModal();
    else if (a === "logout") logout();
    else if (a === "acct") accountForm();
    else if (a === "theme") Theme.toggle();
    else if (a === "csv-tasks") exportTasks();
    else if (a === "csv-att") exportAtt();
    else if (a === "verify") await taskOp(id, { status: "verified" });
    else if (a === "reject") await taskOp(id, { status: "progress" });
    else if (a === "del") { if (confirm(t("confirmDelTask"))) await send({ col: "tasks", op: "del", id }); }
    else if (a === "savetask") {
      const tid = val("t-id"), d = { status: val("t-st"), rem: val("t-rem") };
      if (isAdmin) {
        Object.assign(d, { title: val("t-title").trim(), desc: val("t-desc"), emp: val("t-emp"), cat: val("t-cat"), prio: val("t-prio"), due: val("t-due"), adminC: val("t-adm") });
        if (!d.title) return $("#t-title").focus();
      }
      if (tid) await taskOp(tid, d); else await send({ col: "tasks", op: "add", data: d });
      closeModal(); toast(t("saved"));
    }
    else if (a === "ew") workerForm(id);
    else if (a === "savew") {
      const u = (b.closest("#mb").querySelector("#w-id").value).trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "");
      if (!u || !val("w-n").trim()) return;
      await send({ col: "employees", op: "set", id: u, data: { name: val("w-n").trim(), email: val("w-e").trim(), role: val("w-r").trim(), pw: val("w-p") } });
      closeModal(); toast(t("saved"));
    }
    else if (a === "rmw") { if (confirm(t("confirmRemW"))) { await send({ col: "employees", op: "del", id }); if (S.emp === id) S.view = "team"; } }
    else if (a === "savepw") {
      await api("/api/password", { method: "POST", body: JSON.stringify({ old: val("a-old"), new: val("a-new") }) });
      closeModal(); toast(t("pwChanged"));
    }
  } catch (e) { toast(e.message || String(e)); }
});

document.addEventListener("input", ev => { if (ev.target.id === "f-q") { S.filter.q = ev.target.value; render(); } });
document.addEventListener("change", ev => {
  const map = { "f-emp": "emp", "f-cat": "cat", "f-prio": "prio", "f-status": "status", "f-sort": "sort" };
  if (map[ev.target.id]) { S.filter[map[ev.target.id]] = ev.target.value; render(); }
});
document.addEventListener("keydown", ev => { if (ev.key === "Escape") closeModal(); });
$("#modal").addEventListener("mousedown", ev => { if (ev.target.id === "modal") closeModal(); });
$("#lang").onchange = e => { Lang.set(e.target.value); render(); };
document.addEventListener("visibilitychange", () => { if (!document.hidden && token) refresh(); });
window.addEventListener("online", () => token && refresh());
window.addEventListener("offline", () => setLive(false));
setInterval(() => { if (isAdmin && ["wstat", "dash"].includes(S.view) && !document.hidden) render(); }, 30000);

/* ---------- start ---------- */
(function start() {
  const PAGE = document.body.dataset.page;
  try {
    const k = sessionStorage.getItem("tfs"), c = JSON.parse(atob(k.split(".")[1]));
    if (c.exp * 1000 < Date.now()) throw new Error("expired");
    if (c.role !== PAGE) { location.replace(c.role === "admin" ? "/admin" : "/user"); return; }
    token = k; me = c.u; isAdmin = c.role === "admin";
  } catch (e) { location.replace("/login"); return; }
  render(); refresh();
})();
