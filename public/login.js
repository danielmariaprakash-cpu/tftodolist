const $ = s => document.querySelector(s);
const t = k => Lang.t(k);
let needsSetup = false;

function paint() {
  $("#h").textContent = needsSetup ? t("setupHint") : t("appTag");
  $("#lu").textContent = t("username");
  $("#lp").textContent = t("password");
  $("#b").textContent = needsSetup ? t("setupBtn") : t("login");
  $("#lang").value = Lang.current;
  document.querySelector("#lu").hidden = $("#u").hidden = needsSetup;
  $("#u").required = !needsSetup;
}

function message(text, ok) {
  const el = $("#er");
  el.textContent = text || "";
  el.className = ok ? "on" : "over";
}

$("#lang").onchange = e => { Lang.set(e.target.value); paint(); };

// Already signed in? Go straight to the right page.
try {
  const claims = JSON.parse(atob(sessionStorage.getItem("tfs").split(".")[1]));
  if (claims.exp * 1000 > Date.now()) location.replace(claims.role === "admin" ? "/admin" : "/user");
} catch (e) { /* not signed in */ }

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    const body = await response.json().catch(() => ({}));
    if (response.status === 503 && body.error) message(body.error.startsWith("Database not") ? t("dbMissing") : body.error);
    needsSetup = Boolean(body.needsSetup);
  } catch (e) { message(t("offlineNet")); }
  paint();
}

$("#f").onsubmit = async e => {
  e.preventDefault();
  message("");
  const button = $("#b");
  button.disabled = true;
  try {
    if (needsSetup) {
      if ($("#p").value.length < 8) return message(t("pwShort"));
      const r = await fetch("/api/setup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ p: $("#p").value }) });
      if (!r.ok) return message((await r.json().catch(() => ({}))).error || t("errorGeneric"));
      needsSetup = false;
      $("#u").value = "admin";
      paint();
      return message(t("setupDone"), true);
    }
    const r = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ u: $("#u").value, p: $("#p").value }) });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      if (r.status === 429) return message(t("many"));
      if (r.status === 503) return message(t("dbMissing"));
      return message(r.status === 401 ? t("bad") : body.error || t("errorGeneric"));
    }
    const j = await r.json();
    try { sessionStorage.setItem("tfs", j.token); } catch (x) { return message("Browser storage is blocked – enable cookies/storage for this site."); }
    location.replace(j.role === "admin" ? "/admin" : "/user");
  } catch (x) {
    message(t("offlineNet"));
  } finally {
    button.disabled = false;
  }
};

paint();
checkHealth().then(() => { if (new URLSearchParams(location.search).get("expired")) message(t("sessionExpired")); });
