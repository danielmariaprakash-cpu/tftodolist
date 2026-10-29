# TF ENERGY SRL – Live Work CRM

Tasks, worker attendance (live status), audit log, EN/IT, dark mode, installable as an app (PWA), CSV export.
Works locally **and** on Vercel or Netlify.

## Why it failed on Vercel / Netlify before
Serverless hosts have no writable disk, so `tf.db` (SQLite) cannot be used there. The app needs a free
**Upstash Redis** database online. Without it the site cannot store anything. It now shows a clear message instead of crashing.

## 1. Run locally (Visual Studio / VS Code)
```sh
npm install
npm start          # http://localhost:3000
```
Data is stored in `tf.db` next to the project (never uploaded to git).

## 2. Create the online database (once, free)
1. Go to https://console.upstash.com → **Create Database** (Redis, any region).
2. Open the database → **REST API** → copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
   (If you add Upstash through the Vercel/Netlify marketplace, the `KV_REST_API_URL` / `KV_REST_API_TOKEN` names it creates also work.)

## 3. Deploy

### Vercel
1. Import the GitHub repo in Vercel (Framework preset: **Other**; leave build/output settings empty – `vercel.json` handles it).
2. Settings → Environment Variables: add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
3. Deploy (or Redeploy after adding the variables).

### Netlify
1. Add new site → Import from Git. Build settings are read from `netlify.toml` (publish `public`, functions `netlify/functions`).
2. Site configuration → Environment variables: add the same two Upstash variables.
3. Deploy site (trigger a new deploy after adding the variables).

### First visit
Open the site. If the database is empty you are asked to **choose the admin password** (username `admin`).
Do this immediately after deploying. Then add workers in **Workers**.
Optional variables: `ADMIN_PASSWORD` (pre-sets the admin password), `JWT_SECRET` (otherwise generated and stored in the database).

## 4. Keep your existing workers, tasks and passwords
Your local `tf.db` already has workers. Copy it online once (passwords stay the same):
```sh
npm run migrate -- <UPSTASH_REST_URL> <UPSTASH_REST_TOKEN>
```
Then log in on the live site with your existing admin/worker passwords.

## Forgot a password?
Passwords are hashed and cannot be read, only reset:
```sh
npm run reset-password -- admin NewPassword123                       # local tf.db
npm run reset-password -- admin NewPassword123 <UPSTASH_URL> <TOKEN>  # online database
npm run reset-password -- tf2026051 NewPass1                         # a worker (use their username)
```
Workers can also be reset by the admin: Workers, then Edit, then enter a new password.

## Features
- **Admin:** dashboard with charts, live work status and session times, tasks (search, filter, sort, create/edit/delete, verify/reject), workers (add/edit/remove), audit log, CSV export (tasks, attendance), change password.
- **Worker:** own tasks, update status and remarks, time worked today, change password.
- Live updates every 10–15 s, notifications when a task changes, English/Italian, light/dark theme, mobile friendly, installable on phone/desktop.
- Security: bcrypt passwords, signed 12 h sessions, login rate limit, removed workers lose access immediately, input validation.

## Tests
`npm test`
