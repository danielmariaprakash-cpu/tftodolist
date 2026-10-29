/* Shared translations + tiny helpers (loaded by every page). */
const TEXT = {
  en: {
    appTag: "Employee tasks and live monitoring", username: "Username", password: "Password", login: "Login", logout: "Logout",
    bad: "Wrong username or password", many: "Too many attempts, wait 1 minute", offlineNet: "No connection to the server",
    dbMissing: "The database is not configured yet. Add the Upstash variables in your hosting dashboard (see README).",
    setupTitle: "First-time setup", setupHint: "Choose the administrator password (username: admin).", setupBtn: "Create admin account",
    setupDone: "Admin account created. You can log in now.", pwShort: "Password must be at least 8 characters",
    dash: "Dashboard", wstat: "Work status", tasks: "Tasks", team: "Workers", log: "Audit log",
    total: "Total", pending: "Pending", progress: "In progress", completed: "Completed", verified: "Verified", overdue: "Overdue", await: "Awaiting verification",
    newtask: "New task", edit: "Edit", del: "Delete", verify: "Verify", reject: "Reject", save: "Save", cancel: "Cancel", close: "Close",
    title: "Title", desc: "Description", emp: "Worker", cat: "Category", prio: "Priority", due: "Due date", adm: "Admin comment", rem: "Worker remarks", status: "Status",
    high: "High", medium: "Medium", low: "Low", name: "Name", email: "Email", role: "Role / position", user: "Username", pass: "Password",
    newpw: "New password (leave empty to keep)", addw: "Add worker", remove: "Remove", done: "completion", open: "Open",
    dc: "Daily Work Tasks", pm: "Payment Management and Statements", st: "Session Tasks", pj: "Live Project Status", ad: "Administrative Tasks", ot: "Other Tasks",
    updated: "Task updated", by: "by", activity: "Latest activity", none: "No tasks", nothing: "Nothing to show",
    working: "Working", offline: "Offline", since: "since", lastin: "Last login", lastout: "Last logout", today: "Today", sess: "Recent sessions",
    hello: "Welcome", mytasks: "My tasks", in: "Login", out: "Logout", still: "active", mark: "Update", duration: "Duration",
    search: "Search…", all: "All", allw: "All workers", allc: "All categories", allp: "All priorities", allst: "All statuses", sort: "Sort",
    sortDue: "Due date", sortNew: "Newest", sortPrio: "Priority", results: "results", exportCsv: "Export CSV", exportTasks: "Export tasks", exportAtt: "Export attendance",
    account: "Account", chpw: "Change password", oldpw: "Current password", newpw2: "New password", pwChanged: "Password changed", pwMin: "At least 6 characters (8 for admin)",
    confirmDelTask: "Delete this task?", confirmRemW: "Remove this worker? Their tasks will be deleted too.", saved: "Saved", live: "Live", connecting: "Connecting…",
    theme: "Theme", noWorkers: "No workers yet. Add the first one in Workers.", worker: "Worker", sessionToday: "Time worked today",
    act_created: "created", act_deleted: "deleted", act_edited: "edited", act_pending: "set to pending", act_progress: "set to in progress", act_completed: "completed",
    act_verified: "verified", "act_worker added": "worker added", "act_worker updated": "worker updated", "act_worker removed": "worker removed", act_rejected: "rejected",
    sessionExpired: "Session expired, please log in again", errorGeneric: "Something went wrong", install: "Install app", loading: "Loading…",
  },
  it: {
    appTag: "Compiti dipendenti e monitoraggio live", username: "Nome utente", password: "Password", login: "Accedi", logout: "Esci",
    bad: "Nome utente o password errati", many: "Troppi tentativi, attendi 1 minuto", offlineNet: "Nessuna connessione al server",
    dbMissing: "Il database non è ancora configurato. Aggiungi le variabili Upstash nel pannello di hosting (vedi README).",
    setupTitle: "Prima configurazione", setupHint: "Scegli la password dell’amministratore (utente: admin).", setupBtn: "Crea account admin",
    setupDone: "Account admin creato. Ora puoi accedere.", pwShort: "La password deve avere almeno 8 caratteri",
    dash: "Cruscotto", wstat: "Stato lavoro", tasks: "Compiti", team: "Lavoratori", log: "Registro audit",
    total: "Totale", pending: "In attesa", progress: "In corso", completed: "Completati", verified: "Verificati", overdue: "In ritardo", await: "In attesa di verifica",
    newtask: "Nuovo compito", edit: "Modifica", del: "Elimina", verify: "Verifica", reject: "Rifiuta", save: "Salva", cancel: "Annulla", close: "Chiudi",
    title: "Titolo", desc: "Descrizione", emp: "Lavoratore", cat: "Categoria", prio: "Priorità", due: "Scadenza", adm: "Commento admin", rem: "Note del lavoratore", status: "Stato",
    high: "Alta", medium: "Media", low: "Bassa", name: "Nome", email: "Email", role: "Ruolo / posizione", user: "Nome utente", pass: "Password",
    newpw: "Nuova password (vuoto = invariata)", addw: "Aggiungi lavoratore", remove: "Rimuovi", done: "completamento", open: "Apri",
    dc: "Attività quotidiane", pm: "Pagamenti ed estratti conto", st: "Attività di sessione", pj: "Stato progetti", ad: "Attività amministrative", ot: "Altre attività",
    updated: "Compito aggiornato", by: "da", activity: "Ultime attività", none: "Nessun compito", nothing: "Niente da mostrare",
    working: "Al lavoro", offline: "Offline", since: "dalle", lastin: "Ultimo accesso", lastout: "Ultima uscita", today: "Oggi", sess: "Sessioni recenti",
    hello: "Benvenuto", mytasks: "I miei compiti", in: "Accesso", out: "Uscita", still: "attiva", mark: "Aggiorna", duration: "Durata",
    search: "Cerca…", all: "Tutti", allw: "Tutti i lavoratori", allc: "Tutte le categorie", allp: "Tutte le priorità", allst: "Tutti gli stati", sort: "Ordina",
    sortDue: "Scadenza", sortNew: "Più recenti", sortPrio: "Priorità", results: "risultati", exportCsv: "Esporta CSV", exportTasks: "Esporta compiti", exportAtt: "Esporta presenze",
    account: "Account", chpw: "Cambia password", oldpw: "Password attuale", newpw2: "Nuova password", pwChanged: "Password cambiata", pwMin: "Almeno 6 caratteri (8 per l’admin)",
    confirmDelTask: "Eliminare questo compito?", confirmRemW: "Rimuovere questo lavoratore? Anche i suoi compiti verranno eliminati.", saved: "Salvato", live: "Live", connecting: "Connessione…",
    theme: "Tema", noWorkers: "Nessun lavoratore. Aggiungi il primo in Lavoratori.", worker: "Lavoratore", sessionToday: "Tempo lavorato oggi",
    act_created: "creato", act_deleted: "eliminato", act_edited: "modificato", act_pending: "impostato in attesa", act_progress: "impostato in corso", act_completed: "completato",
    act_verified: "verificato", "act_worker added": "lavoratore aggiunto", "act_worker updated": "lavoratore aggiornato", "act_worker removed": "lavoratore rimosso", act_rejected: "rifiutato",
    sessionExpired: "Sessione scaduta, accedi di nuovo", errorGeneric: "Qualcosa è andato storto", install: "Installa app", loading: "Caricamento…",
  },
};

const Lang = {
  current: "en",
  init() {
    let saved = null;
    try { saved = localStorage.getItem("tfl"); } catch (e) { /* storage blocked */ }
    this.current = saved && TEXT[saved] ? saved : (navigator.language || "").startsWith("it") ? "it" : "en";
    document.documentElement.lang = this.current;
  },
  set(code) {
    this.current = TEXT[code] ? code : "en";
    document.documentElement.lang = this.current;
    try { localStorage.setItem("tfl", this.current); } catch (e) { /* ignore */ }
  },
  t(key) { return TEXT[this.current][key] ?? TEXT.en[key] ?? key; },
  locale() { return this.current === "it" ? "it-IT" : "en-GB"; },
};
Lang.init();

/* Light / dark theme (follows the system until the user picks one). */
const Theme = {
  init() { try { const t = localStorage.getItem("tft"); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* ignore */ } },
  toggle() {
    const dark = document.documentElement.dataset.theme === "dark" ||
      (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("tft", next); } catch (e) { /* ignore */ }
  },
};
Theme.init();

/* Register the service worker (installable PWA). */
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
