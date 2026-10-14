const { getGuildAnalyticsSummary } = require("../analytics/service");
const { calculateServerEconomyPolicy } = require("../economy/dynamicBalance");
const {
  getGuildLeaderboard,
  getMemberProfile,
  getGuildSettings,
  updateGuildSettings,
  getEconomyOverview,
  getUserWebProfile,
  adminGrantPremium,
} = require("./serverManagement");

function requireDashboardLogin(req, res, next) {
  if (!req.session?.discordUser) {
    return res.status(401).json({ ok: false, error: "not_logged_in" });
  }
  return next();
}

function requireGuildAdmin(req, res, next) {
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

  app.get("/api/guilds/:guildId/leaderboard", requireDashboardLogin, async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
      const data = await getGuildLeaderboard(req.params.guildId, req.query.category, limit);
      return res.json({ ok: true, data });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.get("/api/guilds/:guildId/settings", requireDashboardLogin, async (req, res) => {
    try {
      const data = await getGuildSettings(req.params.guildId);
      return res.json({ ok: true, data });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.put("/api/guilds/:guildId/settings", requireDashboardLogin, requireGuildAdmin, async (req, res) => {
    try {
      const data = await updateGuildSettings(req.params.guildId, req.body);
      return res.json({ ok: true, data });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.get("/api/guilds/:guildId/members/:userId", requireDashboardLogin, async (req, res) => {
    try {
      const data = await getMemberProfile(req.params.guildId, req.params.userId);
      return res.json({ ok: true, data });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post("/api/guilds/:guildId/grant-premium", requireDashboardLogin, requireGuildAdmin, async (req, res) => {
    try {
      const { userId, planId, durationDays } = req.body;
      const data = await adminGrantPremium(req.params.guildId, userId, planId, durationDays);
      return res.json({ ok: true, data });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.get("/api/guilds/:guildId/economy", requireDashboardLogin, async (req, res) => {
    try {
      const data = await getEconomyOverview(req.params.guildId);
      return res.json({ ok: true, data });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.get("/api/user/profile", requireDashboardLogin, async (req, res) => {
    try {
      const data = await getUserWebProfile(req.session.discordUser.id);
      return res.json({ ok: true, data });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });
}

module.exports = { registerDashboardApi };
