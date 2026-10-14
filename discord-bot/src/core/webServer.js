const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const { PaddleWebhookLog } = require("../data/models");
const { registerDashboardApi } = require("../dashboard/api");
const { recentInteractions } = require("../game/service");
const { buildEmbedPayload } = require("../utils/visuals");
const { registerWebhookRoutes, verifySharedSecret, getBearerToken, recentPaddleWebhooks, recentTopggWebhooks } = require("./webhookHandler");
const { recentDiscordResponses } = require("./interactionHandler");
const { getTopggApiToken, recentTopggStatsPosts, TOPGG_STATS_INTERVAL_MS } = require("./topggStats");

const APP_VERSION = "aurix-premium-buffs-v19";

function isLocalRequest(req) {
  const ip = req.ip || req.socket?.remoteAddress || "";
  return ip === "::1" || ip === "127.0.0.1" || ip === "::ffff:127.0.0.1";
}

function buildDiscordAuthUrl(state) {
  const authUrl = new URL("https://discord.com/oauth2/authorize");
  authUrl.searchParams.set("client_id", process.env.DISCORD_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", process.env.DISCORD_REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "identify");
  authUrl.searchParams.set("state", state);
  return authUrl.toString();
}

async function exchangeDiscordCode(code) {
  const body = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    client_secret: process.env.DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
  });

  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Discord token exchange failed: ${payload.error || response.status}`);
  }

  return payload;
}

async function fetchDiscordUser(accessToken) {
  const response = await fetch("https://discord.com/api/users/@me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Discord user lookup failed: ${payload.message || response.status}`);
  }

  return payload;
}

function shouldRegisterCommandsOnStart() {
  return process.env.REGISTER_COMMANDS_ON_START?.trim().toLowerCase() !== "false";
}

function startWebServer({ getClient, startedAt }) {
  const app = express();
  const port = Number(process.env.PORT) || 3000;
  const isProduction = process.env.NODE_ENV === "production";

  app.set("trust proxy", 1);

  // Mount webhook routes (Paddle, Top.gg)
  registerWebhookRoutes(app, { getClient });

  // Debug routes auth middleware
  app.use("/debug", (req, res, next) => {
    const debugToken = process.env.DEBUG_AUTH_TOKEN?.trim();

    if (!debugToken && !isProduction && isLocalRequest(req)) {
      return next();
    }

    if (!debugToken) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }

    const providedToken = getBearerToken(req.headers.authorization) || req.headers["x-debug-token"];
    if (!verifySharedSecret(providedToken, debugToken)) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    return next();
  });

  app.get("/debug/paddle-webhooks", async (_req, res) => {
    const persisted = await PaddleWebhookLog.find({}).sort({ createdAt: -1 }).limit(10).lean();
    return res.status(200).json({ ok: true, memory: recentPaddleWebhooks, persisted });
  });

  app.get("/debug/topgg-webhooks", (_req, res) => {
    return res.status(200).json({ ok: true, memory: recentTopggWebhooks });
  });

  app.get("/debug/topgg-stats", (_req, res) => {
    return res.status(200).json({
      ok: true,
      configured: Boolean(getTopggApiToken()),
      botId: process.env.TOPGG_BOT_ID?.trim() || process.env.DISCORD_CLIENT_ID?.trim() || null,
      intervalMs: TOPGG_STATS_INTERVAL_MS,
      recent: recentTopggStatsPosts,
    });
  });

  app.get("/debug/premium/:userId", async (req, res) => {
    const { User } = require("../data/models");
    const user = await User.findOne({ userId: req.params.userId }).sort({ updatedAt: -1 }).lean();

    if (!user) {
      return res.status(404).json({ ok: false, error: "user_not_found" });
    }

    return res.status(200).json({
      ok: true,
      userId: user.userId,
      guildId: user.guildId,
      premium: user.premium || null,
      billing: user.billing || null,
      updatedAt: user.updatedAt,
    });
  });

  // Session middleware (after webhooks which use raw body)
  app.use(session({
    name: "aura.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  }));

  // OAuth2 routes
  app.get("/auth/discord", (req, res) => {
    const state = crypto.randomBytes(24).toString("hex");
    req.session.oauthState = state;
    res.redirect(buildDiscordAuthUrl(state));
  });

  app.get("/auth/discord/callback", async (req, res) => {
    const { code, state } = req.query;

    if (!code || !state || state !== req.session.oauthState) {
      return res.status(400).send("Discord login failed. Please try again.");
    }

    delete req.session.oauthState;

    try {
      const token = await exchangeDiscordCode(String(code));
      const user = await fetchDiscordUser(token.access_token);

      req.session.discordUser = {
        id: user.id,
        username: user.username,
        globalName: user.global_name || null,
        avatar: user.avatar || null,
      };

      return res.redirect("/me");
    } catch (error) {
      console.error("Discord OAuth callback failed:", error);
      return res.status(500).send("Discord login failed. Please try again.");
    }
  });

  app.get("/api/me", (req, res) => {
    if (!req.session.discordUser) {
      return res.status(401).json({ ok: false, error: "not_logged_in" });
    }

    return res.status(200).json({ ok: true, user: req.session.discordUser });
  });

  registerDashboardApi(app);

  app.post("/logout", (req, res) => {
    req.session.destroy((error) => {
      if (error) {
        return res.status(500).json({ ok: false, error: "logout_failed" });
      }

      res.clearCookie("aura.sid");
      return res.status(200).json({ ok: true });
    });
  });

  app.get("/me", (req, res) => {
    if (!req.session.discordUser) {
      return res.redirect("/auth/discord");
    }

    const name = req.session.discordUser.globalName || req.session.discordUser.username;
    res.status(200).send(`Logged in as ${name}. Your Discord user id is ${req.session.discordUser.id}.`);
  });

  app.get("/", (_req, res) => {
    res.status(200).send('Aura bot is running. <a href="/auth/discord">Login with Discord</a>');
  });

  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true, service: "discord-bot", version: APP_VERSION });
  });

  app.get("/debug/version", (_req, res) => {
    const discordClient = getClient();
    res.status(200).json({
      ok: true,
      service: "discord-bot",
      version: APP_VERSION,
      botUser: discordClient?.user?.tag || null,
      ready: Boolean(discordClient?.isReady?.()),
      startedAt: new Date(startedAt).toISOString(),
    });
  });

  app.get("/debug/interactions", (_req, res) => {
    res.status(200).json({
      ok: true,
      version: APP_VERSION,
      recent: recentInteractions,
    });
  });

  app.get("/debug/embed-preview", (_req, res) => {
    const payload = buildEmbedPayload({
      title: "Spin Complete",
      description: "The wheel landed clean. You gained **500 aura** and **80 XP**.",
      visual: "core-arcade.svg",
      fields: [
        { name: "Jackpot", value: "Not this time", inline: true },
        { name: "Next Spin", value: "4m", inline: true },
        { name: "Wallet", value: "10,000 aura", inline: true },
      ],
    });

    res.status(200).json({
      ok: true,
      version: APP_VERSION,
      embed: payload.embeds[0].toJSON(),
      hasFiles: Boolean(payload.files?.length),
    });
  });

  app.get("/debug/emoji/:id", async (req, res) => {
    const discordClient = getClient();
    const emojiId = String(req.params.id || "").trim();
    const cached = discordClient?.emojis?.cache?.get(emojiId) || null;
    const sproutEnv = process.env.AURIX_RANK_EMOJI_SPROUT || "";
    res.status(200).json({
      ok: true,
      version: APP_VERSION,
      ready: Boolean(discordClient?.isReady?.()),
      emojiId,
      cached: cached ? {
        id: cached.id,
        name: cached.name,
        animated: Boolean(cached.animated),
        guildId: cached.guild?.id || cached.guildId || null,
        identifier: cached.identifier,
        rendered: cached.toString(),
      } : null,
      sproutEnvSet: Boolean(sproutEnv),
      sproutEnvValid: /^<a?:[A-Za-z0-9_]+:\d+>$/.test(sproutEnv),
      sproutEnvMatchesId: sproutEnv.includes(emojiId),
    });
  });

  app.get("/debug/emoji-guilds/:id", (_req, res) => {
    const discordClient = getClient();
    const emojiId = String(_req.params.id || "").trim();
    const guilds = discordClient?.guilds?.cache?.map((guild) => {
      const emojis = guild.emojis?.cache || new Map();
      const found = emojis.get?.(emojiId) || null;
      return {
        id: guild.id,
        name: guild.name,
        emojiCount: emojis.size || 0,
        hasEmoji: Boolean(found),
        matchedEmoji: found ? {
          id: found.id,
          name: found.name,
          animated: Boolean(found.animated),
          rendered: found.toString(),
        } : null,
      };
    }) || [];

    res.status(200).json({
      ok: true,
      version: APP_VERSION,
      ready: Boolean(discordClient?.isReady?.()),
      emojiId,
      guildCount: guilds.length,
      guilds,
    });
  });

  app.get("/debug/responses", (_req, res) => {
    res.status(200).json({
      ok: true,
      version: APP_VERSION,
      recent: recentDiscordResponses,
    });
  });

  return app.listen(port, () => {
    console.log(`Health server listening on port ${port}. Version ${APP_VERSION}.`);
  });
}

module.exports = { startWebServer, shouldRegisterCommandsOnStart, APP_VERSION };
