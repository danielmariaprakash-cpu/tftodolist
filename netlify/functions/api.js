// Netlify function: /api/* is redirected here (see netlify.toml).
const serverless = require("serverless-http");
const app = require("../../lib/app");

const handle = serverless(app);

exports.handler = (event, context) => {
  // Netlify may hand us "/.netlify/functions/api/login" or "/api/login"; Express expects "/api/login".
  let p = event.path || "/";
  p = p.replace(/^\/\.netlify\/functions\/api/, "") || "/";
  if (!p.startsWith("/api")) p = `/api${p}`;
  event.path = p;
  return handle(event, context);
};
