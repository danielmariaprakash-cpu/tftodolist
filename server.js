// Local launcher: `npm start`. Also exports the app (Vercel can use this as an entrypoint).
const app = require("./lib/app");

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`TF ENERGY running on http://localhost:${port}`));
}

module.exports = app;
