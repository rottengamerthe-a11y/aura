const { getGuildAnalyticsSummary } = require("../analytics/service");
const { calculateServerEconomyPolicy } = require("../economy/dynamicBalance");

function requireDashboardLogin(req, res, next) {
  if (!req.session?.discordUser) {
    return res.status(401).json({ ok: false, error: "not_logged_in" });
  }
  return next();
}

function registerDashboardApi(app) {
  app.get("/api/guilds/:guildId/analytics", requireDashboardLogin, async (req, res) => {
    const days = Number(req.query.days) || 7;
    const summary = await getGuildAnalyticsSummary(String(req.params.guildId), days);
    return res.status(200).json({ ok: true, summary });
  });

  app.get("/api/guilds/:guildId/economy-policy", requireDashboardLogin, async (req, res) => {
    const policy = await calculateServerEconomyPolicy(String(req.params.guildId));
    return res.status(200).json({ ok: true, policy });
  });
}

module.exports = { registerDashboardApi };
