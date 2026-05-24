const path = require("path");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const { Client, EmbedBuilder, GatewayIntentBits, REST, Routes } = require("discord.js");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const mongoose = require("mongoose");
const { GuildSettings, PaddleWebhookLog, User } = require("./src/data/models");
const { attachAnalyticsSubscribers } = require("./src/analytics/service");
const { eventBus } = require("./src/core/eventBus");
const { registerDashboardApi } = require("./src/dashboard/api");
const { migrateToGlobalPlayerProfiles } = require("./src/data/globalPlayerMigration");
const { applyPaddleWebhookEvent, applyTopggVoteWebhookEvent, buildCommands, handleChatRelicSpawnMessage, recentInteractions, routeInteraction, sendServerJoinMessage, sendServerSetupMessage, startReminderLoop, startRelicSpawnLoop } = require("./src/game/service");
const { buildEmbedPayload } = require("./src/utils/visuals");

const APP_VERSION = "aurix-premium-buffs-v19";
attachAnalyticsSubscribers(eventBus);
const startedAt = Date.now();
let discordClient = null;
let httpServer = null;
let shuttingDown = false;
const recentDiscordResponses = [];
const recentTopggStatsPosts = [];
let topggStatsTimer = null;
let topggStatsDebounceTimer = null;
let topggStatsPosting = false;
let topggStatsConfigWarningShown = false;
const interactionUserLocks = new Map();
const TOPGG_STATS_INTERVAL_MS = Number(process.env.TOPGG_STATS_INTERVAL_MS) || 30 * 60 * 1000;
const TOPGG_STATS_DEBOUNCE_MS = 60 * 1000;

const requiredEnv = [
  "DISCORD_TOKEN",
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "DISCORD_REDIRECT_URI",
  "MONGODB_URI",
  "SESSION_SECRET",
];

requiredEnv.forEach((key) => {
  if (typeof process.env[key] === "string") {
    process.env[key] = process.env[key].trim();
  }
});

const missing = requiredEnv.filter((key) => !process.env[key]);

if (missing.length) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

async function shutdown(reason = "shutdown", exitCode = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`Shutting down Aurix (${reason})...`);

  if (topggStatsTimer) {
    clearInterval(topggStatsTimer);
    topggStatsTimer = null;
  }
  if (topggStatsDebounceTimer) {
    clearTimeout(topggStatsDebounceTimer);
    topggStatsDebounceTimer = null;
  }

  await Promise.allSettled([
    discordClient?.destroy?.(),
    new Promise((resolve) => {
      if (!httpServer) {
        resolve();
        return;
      }
      httpServer.close(() => resolve());
    }),
    mongoose.connection.readyState ? mongoose.disconnect() : Promise.resolve(),
  ]);

  process.exit(exitCode);
}

process.once("SIGINT", () => {
  shutdown("SIGINT").catch((error) => {
    console.error("Graceful shutdown failed:", error);
    process.exit(1);
  });
});

process.once("SIGTERM", () => {
  shutdown("SIGTERM").catch((error) => {
    console.error("Graceful shutdown failed:", error);
    process.exit(1);
  });
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  shutdown("uncaughtException", 1).catch(() => process.exit(1));
});

async function connectDatabase() {
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  console.log("MongoDB connected.");
}

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  const commands = buildCommands();

  await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: commands });
  console.log(`Registered ${commands.length} global commands.`);
}

async function verifyDiscordConfiguration() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  console.log(`Discord token length: ${process.env.DISCORD_TOKEN.length}`);
  console.log(`Discord client id: ${process.env.DISCORD_CLIENT_ID}`);
  console.log("Verifying Discord credentials over REST...");

  const timeoutMs = 15000;
  const withTimeout = (promise, label) => Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);

  const application = await withTimeout(rest.get("/oauth2/applications/@me"), "Discord application lookup");
  const currentUser = await withTimeout(rest.get("/users/@me"), "Discord bot user lookup");

  console.log(`Discord application verified: ${application.name} (${application.id})`);
  console.log(`Discord bot user verified: ${currentUser.username} (${currentUser.id})`);
}

function parsePaddleSignatureHeader(headerValue) {
  return String(headerValue || "").split(";").reduce((parts, piece) => {
    const [key, value] = piece.split("=");
    if (key && value) {
      parts[key.trim()] = value.trim();
    }
    return parts;
  }, {});
}

function verifyPaddleWebhookSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) {
    return false;
  }

  const signatureParts = parsePaddleSignatureHeader(signatureHeader);
  const timestamp = signatureParts.ts;
  const signatures = String(signatureParts.h1 || "").split(",").filter(Boolean);

  if (!timestamp || signatures.length === 0) {
    return false;
  }

  const toleranceSeconds = Number(process.env.PADDLE_WEBHOOK_TOLERANCE_SECONDS) || 300;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}:${rawBody}`)
    .digest("hex");

  return signatures.some((signature) => {
    const expectedBuffer = Buffer.from(expected, "hex");
    const signatureBuffer = Buffer.from(signature, "hex");
    return expectedBuffer.length === signatureBuffer.length && crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
  });
}

function verifySharedSecret(providedValue, expectedValue) {
  if (!providedValue || !expectedValue) {
    return false;
  }

  const providedBuffer = Buffer.from(String(providedValue));
  const expectedBuffer = Buffer.from(String(expectedValue));
  return providedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function getBearerToken(headerValue) {
  const match = String(headerValue || "").match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function getTopggApiToken() {
  return process.env.TOPGG_TOKEN?.trim()
    || process.env.TOPGG_API_TOKEN?.trim()
    || process.env.TOPGG_STATS_TOKEN?.trim()
    || null;
}

function shouldRegisterCommandsOnStart() {
  return process.env.REGISTER_COMMANDS_ON_START?.trim().toLowerCase() !== "false";
}

function rememberTopggStatsPost(entry) {
  recentTopggStatsPosts.unshift({
    at: new Date().toISOString(),
    ...entry,
  });
  recentTopggStatsPosts.splice(20);
}

function getInteractionUserLockKey(interaction) {
  const userId = interaction?.user?.id;
  if (!userId) {
    return null;
  }
  return `${interaction.guildId || "dm"}:${userId}`;
}

async function withInteractionUserLock(interaction, task) {
  const key = getInteractionUserLockKey(interaction);
  if (!key) {
    return task();
  }

  const previous = interactionUserLocks.get(key) || Promise.resolve();
  let releaseLock;
  const current = new Promise((resolve) => {
    releaseLock = resolve;
  });
  const queue = previous.catch(() => null).then(() => current);
  interactionUserLocks.set(key, queue);

  await previous.catch(() => null);
  try {
    return await task();
  } finally {
    releaseLock();
    if (interactionUserLocks.get(key) === queue) {
      interactionUserLocks.delete(key);
    }
  }
}

async function getDiscordGuildStats(client) {
  if (client.shard) {
    const shardGuildCounts = await client.shard.fetchClientValues("guilds.cache.size");
    const shards = shardGuildCounts.map((count) => Number(count) || 0);
    return {
      serverCount: shards.reduce((sum, count) => sum + count, 0),
      shards,
      shardCount: shards.length,
    };
  }

  return {
    serverCount: client.guilds.cache.size,
    shards: [],
    shardCount: 1,
  };
}

async function postTopggStats(client, reason = "scheduled") {
  if (!client?.isReady?.() || topggStatsPosting) {
    return null;
  }

  const token = getTopggApiToken();
  const botId = process.env.TOPGG_BOT_ID?.trim() || process.env.DISCORD_CLIENT_ID?.trim();
  if (!token || !botId) {
    if (!topggStatsConfigWarningShown) {
      topggStatsConfigWarningShown = true;
      console.warn(
        `Top.gg stats posting is disabled: ${!token ? "missing TOPGG_TOKEN/TOPGG_API_TOKEN/TOPGG_STATS_TOKEN" : "missing TOPGG_BOT_ID/DISCORD_CLIENT_ID"}.`
      );
    }
    rememberTopggStatsPost({
      ok: false,
      reason,
      skipped: true,
      error: !token ? "missing_topgg_token" : "missing_bot_id",
    });
    return null;
  }

  topggStatsPosting = true;
  try {
    const stats = await getDiscordGuildStats(client);
    const body = {
      server_count: stats.shards.length ? stats.shards : stats.serverCount,
      shard_count: stats.shardCount,
    };

    const response = await fetch(`https://top.gg/api/bots/${botId}/stats`, {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const payload = await response.text().catch(() => "");
    const entry = {
      ok: response.ok,
      reason,
      status: response.status,
      serverCount: stats.serverCount,
      shardCount: stats.shardCount,
      body,
      response: payload.slice(0, 300) || null,
    };
    rememberTopggStatsPost(entry);
    if (response.ok) {
      console.log(`Top.gg stats posted: ${stats.serverCount} servers (${reason}).`);
    } else {
      console.warn("Top.gg stats post failed:", entry);
    }
    return entry;
  } catch (error) {
    const entry = {
      ok: false,
      reason,
      error: error.message || String(error),
    };
    rememberTopggStatsPost(entry);
    console.warn("Top.gg stats post failed:", entry);
    return entry;
  } finally {
    topggStatsPosting = false;
  }
}

function scheduleTopggStatsPost(client, reason = "guild_update") {
  if (topggStatsDebounceTimer) {
    clearTimeout(topggStatsDebounceTimer);
  }
  topggStatsDebounceTimer = setTimeout(() => {
    topggStatsDebounceTimer = null;
    postTopggStats(client, reason).catch((error) => {
      console.warn("Top.gg debounced stats post failed:", error);
    });
  }, TOPGG_STATS_DEBOUNCE_MS);
}

function startTopggStatsLoop(client) {
  if (topggStatsTimer) {
    return;
  }

  postTopggStats(client, "ready").catch((error) => {
    console.warn("Initial Top.gg stats post failed:", error);
  });

  topggStatsTimer = setInterval(() => {
    postTopggStats(client, "scheduled").catch((error) => {
      console.warn("Scheduled Top.gg stats post failed:", error);
    });
  }, TOPGG_STATS_INTERVAL_MS);
  topggStatsTimer.unref?.();
}

function isLocalRequest(req) {
  const ip = req.ip || req.socket?.remoteAddress || "";
  return ip === "::1" || ip === "127.0.0.1" || ip === "::ffff:127.0.0.1";
}

function parseTopggSignatureHeader(headerValue) {
  return String(headerValue || "").split(",").reduce((parts, piece) => {
    const [key, value] = piece.split("=");
    if (key && value) {
      parts[key.trim()] = value.trim();
    }
    return parts;
  }, {});
}

function verifyTopggWebhookSignature(rawBody, signatureHeader, secret) {
  if (!rawBody || !signatureHeader || !secret) {
    return false;
  }

  const signatureParts = parseTopggSignatureHeader(signatureHeader);
  const timestamp = signatureParts.t;
  const receivedSignature = signatureParts.v1;
  if (!timestamp || !receivedSignature) {
    return false;
  }

  const toleranceSeconds = Number(process.env.TOPGG_WEBHOOK_TOLERANCE_SECONDS) || 300;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(receivedSignature);
  return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
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

function startWebServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;
  const paddleWebhookSecret = process.env.PADDLE_WEBHOOK_SECRET?.trim();
  const topggWebhookSecret = process.env.TOPGG_WEBHOOK_SECRET?.trim();
  const topggWebhookAuth = process.env.TOPGG_WEBHOOK_AUTH?.trim();
  const isProduction = process.env.NODE_ENV === "production";
  const recentPaddleWebhooks = [];
  const recentTopggWebhooks = [];

  function rememberPaddleWebhook(entry) {
    recentPaddleWebhooks.unshift({
      at: new Date().toISOString(),
      ...entry,
    });
    recentPaddleWebhooks.splice(10);
    PaddleWebhookLog.create(entry).catch((error) => {
      console.error("Failed to save Paddle webhook debug log:", error);
    });
  }

  async function sendPremiumAnnouncement(result) {
    const isPremiumActivation = result?.shouldAnnounce && result.userId;
    const isPurchaseGrant = result?.action === "purchase_granted" && result.userId;
    if (!discordClient?.isReady?.() || (!isPremiumActivation && !isPurchaseGrant)) {
      return { sent: false, reason: "not_ready_or_not_needed" };
    }

    const planLabel = result.planLabel || result.planId || "Premium";
    const embed = isPurchaseGrant
      ? {
        color: 0x69c7ff,
        title: "Aurix Purchase Delivered",
        description: `<@${result.userId}> received **${result.productLabel || result.productId}**.`,
        fields: [
          { name: "Delivered", value: result.grantSummary?.length ? result.grantSummary.join("\n") : "Your digital items were added to your Aurix profile." },
          { name: "Start Here", value: "`/inventory`, `/crate`, `/profile`, `/shop`" },
        ],
        footer: { text: "All Aurix items are virtual bot features with no cash value." },
        timestamp: new Date().toISOString(),
      }
      : {
        color: 0xffc857,
        title: "Premium Activated",
        description: `<@${result.userId}> just unlocked **${planLabel} Premium** for Aurix.`,
        fields: [
          { name: "Unlocked", value: "Premium Chest, extra garden plots, battle bonuses, profile cosmetics, extra reminder slots, and premium-only shop items." },
          { name: "Start Here", value: "`/premium`, `/premium-chest`, `/profile`, `/garden status`, `/shop`" },
        ],
        footer: { text: "Thanks for supporting Aurix Bot." },
        timestamp: new Date().toISOString(),
      };

    const guildSettings = result.announcementGuildId
      ? await GuildSettings.findOne({ guildId: result.announcementGuildId }).lean()
      : null;
    const channelIds = [
      guildSettings?.commandChannelId,
      guildSettings?.aurixChannelId,
      process.env.PREMIUM_ANNOUNCEMENT_CHANNEL_ID,
      result.announcementChannelId,
    ].filter(Boolean);

    for (const channelId of channelIds) {
      const channel = await discordClient.channels.fetch(channelId).catch(() => null);
      if (channel?.isTextBased?.() && channel.send) {
        await channel.send({
          content: `<@${result.userId}>`,
          embeds: [embed],
          allowedMentions: { users: [result.userId] },
        });
        return { sent: true, target: "channel", channelId };
      }
    }

    const user = await discordClient.users.fetch(result.userId).catch(() => null);
    if (user) {
      const dm = await user.send({ embeds: [embed] }).then(() => true).catch(() => false);
      if (dm) {
        return { sent: true, target: "dm" };
      }
    }

    return { sent: false, reason: "no_target" };
  }

  async function sendTopggVoteAnnouncement(result) {
    if (!discordClient?.isReady?.() || result?.action !== "rewarded" || !result.userId) {
      return { sent: false, reason: "not_ready_or_not_rewarded" };
    }

    const embedPayload = buildEmbedPayload({
      title: "Top.gg Vote Reward",
      description: `<@${result.userId}> voted for Aurix on Top.gg and received **${result.rewardSummary}**.`,
      visual: "emblem-success.svg",
      fields: [
        { name: "Vote Weight", value: `${result.weight || 1}x`, inline: true },
        { name: "Next Vote", value: result.nextVoteAt ? `<t:${Math.floor(new Date(result.nextVoteAt).getTime() / 1000)}:R>` : "About 12 hours", inline: true },
        { name: "Reminder", value: "Use `/reminders enable action:Top.gg Vote` to get tagged when voting is ready again." },
      ],
    });

    const channelIds = [
      result.announcementChannelId,
      process.env.TOPGG_VOTE_ANNOUNCEMENT_CHANNEL_ID,
    ].filter(Boolean);

    for (const channelId of channelIds) {
      const channel = await discordClient.channels.fetch(channelId).catch(() => null);
      if (channel?.isTextBased?.() && channel.send) {
        await channel.send({
          content: `<@${result.userId}>`,
          ...embedPayload,
          allowedMentions: { users: [result.userId] },
        });
        return { sent: true, target: "channel", channelId };
      }
    }

    const user = await discordClient.users.fetch(result.userId).catch(() => null);
    if (user) {
      const dm = await user.send(embedPayload).then(() => true).catch(() => false);
      if (dm) {
        return { sent: true, target: "dm" };
      }
    }

    return { sent: false, reason: "no_target" };
  }

  app.set("trust proxy", 1);

  app.get("/paddle/webhook", (_req, res) => {
    return res.status(200).json({
      ok: true,
      endpoint: "/paddle/webhook",
      message: "Webhook endpoint is reachable. Paddle must send POST requests here.",
    });
  });

  app.get("/topgg/webhook", (_req, res) => {
    return res.status(200).json({
      ok: true,
      endpoint: "/topgg/webhook",
      message: "Top.gg webhook endpoint is reachable. Top.gg must send POST requests here.",
    });
  });

  app.post("/topgg/webhook", express.raw({ type: "application/json", limit: "1mb" }), async (req, res) => {
    const signature = req.headers["x-topgg-signature"];
    const rawBody = req.body.toString("utf8");

    if (signature) {
      if (!topggWebhookSecret) {
        recentTopggWebhooks.unshift({ at: new Date().toISOString(), ok: false, error: "topgg_v1_not_configured" });
        recentTopggWebhooks.splice(10);
        return res.status(503).json({ ok: false, error: "topgg_v1_not_configured" });
      }
      if (!verifyTopggWebhookSignature(rawBody, signature, topggWebhookSecret)) {
        recentTopggWebhooks.unshift({ at: new Date().toISOString(), ok: false, error: "invalid_signature", trace: req.headers["x-topgg-trace"] || null });
        recentTopggWebhooks.splice(10);
        return res.status(401).json({ ok: false, error: "invalid_signature" });
      }
    } else if (!topggWebhookAuth) {
      recentTopggWebhooks.unshift({ at: new Date().toISOString(), ok: false, error: "topgg_not_configured" });
      recentTopggWebhooks.splice(10);
      return res.status(503).json({ ok: false, error: "topgg_not_configured" });
    } else if (!verifySharedSecret(req.headers.authorization, topggWebhookAuth)) {
      recentTopggWebhooks.unshift({ at: new Date().toISOString(), ok: false, error: "invalid_authorization" });
      recentTopggWebhooks.splice(10);
      return res.status(401).json({ ok: false, error: "invalid_authorization" });
    }

    try {
      const payload = JSON.parse(rawBody);
      const result = await applyTopggVoteWebhookEvent(payload || {});
      const announcement = await sendTopggVoteAnnouncement(result);
      recentTopggWebhooks.unshift({
        at: new Date().toISOString(),
        ok: result.ok,
        action: result.action,
        userId: result.userId || null,
        eventId: result.eventId || null,
        trace: req.headers["x-topgg-trace"] || null,
        announcement,
      });
      recentTopggWebhooks.splice(10);
      console.log("Top.gg webhook processed:", { result, announcement });
      return res.status(200).json({ ok: true, ...result });
    } catch (error) {
      console.error("Top.gg webhook processing failed:", error);
      return res.status(500).json({ ok: false, error: "webhook_processing_failed" });
    }
  });

  app.post("/paddle/webhook", express.raw({ type: "application/json", limit: "1mb" }), async (req, res) => {
    if (!paddleWebhookSecret) {
      rememberPaddleWebhook({ ok: false, error: "paddle_not_configured" });
      return res.status(503).json({ ok: false, error: "paddle_not_configured" });
    }

    const signature = req.headers["paddle-signature"];
    const rawBody = req.body.toString("utf8");

    if (!verifyPaddleWebhookSignature(rawBody, signature, paddleWebhookSecret)) {
      console.error("Paddle webhook signature verification failed.");
      rememberPaddleWebhook({ ok: false, error: "invalid_signature" });
      return res.status(400).json({ ok: false, error: "invalid_signature" });
    }

    try {
      const event = JSON.parse(rawBody);
      const result = await applyPaddleWebhookEvent(event, event.event_id || event.eventId || null);
      const announcement = await sendPremiumAnnouncement(result);
      rememberPaddleWebhook({
        ok: true,
        eventType: event.event_type || event.eventType || event.type || null,
        eventId: event.event_id || event.eventId || null,
        customData: event.data?.custom_data || event.data?.customData || null,
        result,
        announcement,
      });
      console.log("Paddle webhook processed:", {
        eventType: event.event_type || event.eventType || event.type,
        eventId: event.event_id || event.eventId || null,
        result,
        announcement,
      });
      return res.status(200).json({ ok: true, ...result });
    } catch (error) {
      console.error("Paddle webhook processing failed:", error);
      return res.status(500).json({ ok: false, error: "webhook_processing_failed" });
    }
  });

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

async function prepareInteractionResponse(interaction) {
  const canAutoDeferCommand = interaction.isChatInputCommand?.();
  const canAutoDeferComponent = interaction.isButton?.() || interaction.isStringSelectMenu?.();
  if (!canAutoDeferCommand && !canAutoDeferComponent) {
    return () => {};
  }

  const originalReply = interaction.reply.bind(interaction);
  const originalEditReply = interaction.editReply.bind(interaction);
  const originalDeleteReply = interaction.deleteReply?.bind(interaction);
  const originalUpdate = interaction.update?.bind(interaction);
  const originalFollowUp = interaction.followUp.bind(interaction);
  const defer = canAutoDeferComponent ? interaction.deferUpdate.bind(interaction) : interaction.deferReply.bind(interaction);
  let deferOk = false;
  let deferStarted = false;
  let deferPromise = null;
  let responseStarted = false;

  const startDeferredResponse = () => {
    if (responseStarted || deferStarted || interaction.deferred || interaction.replied) {
      return;
    }
    deferStarted = true;
    deferPromise = defer()
      .then(() => {
        deferOk = true;
      })
      .catch((error) => {
        console.warn("Failed to defer interaction:", error?.code || error?.message || error);
      });
  };

  const deferTimer = setTimeout(startDeferredResponse, 1800);
  const clearDeferredResponseTimer = () => clearTimeout(deferTimer);
  const waitForDeferredResponse = async () => {
    if (deferPromise) {
      await deferPromise;
    }
  };

  interaction.reply = async (options) => {
    responseStarted = true;
    clearDeferredResponseTimer();
    const normalizedOptions = enforceHudEmbedStyle(options);
    await waitForDeferredResponse();
    if (deferOk || interaction.deferred) {
      if (isEphemeralResponse(normalizedOptions)) {
        const response = await originalFollowUp(normalizedOptions);
        if (canAutoDeferCommand && originalDeleteReply) {
          await originalDeleteReply().catch(() => null);
        }
        return response;
      }
      const { ephemeral, flags, ...editOptions } = normalizedOptions || {};
      return originalEditReply(editOptions);
    }
    return originalReply(normalizedOptions);
  };

  if (originalUpdate) {
    interaction.update = async (options) => {
      responseStarted = true;
      clearDeferredResponseTimer();
      const normalizedOptions = enforceHudEmbedStyle(options);
      await waitForDeferredResponse();
      if (deferOk || interaction.deferred) {
        return originalEditReply(normalizedOptions);
      }
      return originalUpdate(normalizedOptions);
    };
  }

  interaction.followUp = async (options) => {
    clearDeferredResponseTimer();
    return originalFollowUp(enforceHudEmbedStyle(options));
  };

  return clearDeferredResponseTimer;
}

function isEphemeralResponse(options) {
  if (!options || typeof options === "string") {
    return false;
  }
  const flags = Number(options.flags || 0);
  return Boolean(options.ephemeral || (flags & 64));
}

function enforceHudEmbedStyle(options) {
  if (!options || typeof options === "string" || !Array.isArray(options.embeds)) {
    return options;
  }

  const normalized = {
    ...options,
    embeds: options.embeds.map((embed) => {
      const builder = EmbedBuilder.from(embed);
      const data = builder.toJSON();
      const title = data.title || "AURIX";
      const footerText = data.footer?.text || "";

      return builder;
    }),
  };
  rememberDiscordResponse(normalized);
  return normalized;
}

function rememberDiscordResponse(options) {
  const embeds = (options.embeds || []).map((embed) => {
    const data = EmbedBuilder.from(embed).toJSON();
    return {
      title: data.title || null,
      author: data.author?.name || null,
      footer: data.footer?.text || null,
      descriptionStart: data.description ? data.description.slice(0, 220) : null,
    };
  });
  recentDiscordResponses.unshift({
    at: new Date().toISOString(),
    content: options.content || null,
    embeds,
  });
  recentDiscordResponses.splice(20);
}

async function main() {
  httpServer = startWebServer();
  console.log("Connecting to MongoDB...");
  await connectDatabase();
  const migrationResult = await migrateToGlobalPlayerProfiles();
  if (migrationResult.ran) {
    console.log(`Global data migration complete. Merged ${migrationResult.mergedUsers} users, removed ${migrationResult.removedProfiles} duplicate profiles, normalized ${migrationResult.normalizedClans || 0} clans and ${migrationResult.normalizedClanMemberships || 0} clan memberships.`);
  }
  try {
    await verifyDiscordConfiguration();
  } catch (error) {
    console.error("Discord REST verification failed:", error);
  }
  console.log("Starting Discord client...");

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildEmojisAndStickers, GatewayIntentBits.GuildMessages],
  });
  discordClient = client;

  client.on("warn", (message) => {
    console.warn("Discord warn:", message);
  });

  client.on("error", (error) => {
    console.error("Discord client error:", error);
  });

  client.on("shardReady", (shardId) => {
    console.log(`Discord shard ${shardId} ready.`);
  });

  client.on("shardResume", (shardId, replayedEvents) => {
    console.log(`Discord shard ${shardId} resumed with ${replayedEvents} replayed events.`);
  });

  client.on("shardDisconnect", (event, shardId) => {
    console.warn(`Discord shard ${shardId} disconnected with code ${event.code}.`);
  });

  client.on("shardError", (error, shardId) => {
    console.error(`Discord shard ${shardId} error:`, error);
  });

  client.on("invalidated", () => {
    console.error("Discord session invalidated.");
  });

  client.once("ready", () => {
    console.log(`Bot ready as ${client.user.tag}`);
    startReminderLoop(client);
    startRelicSpawnLoop(client);
    startTopggStatsLoop(client);
  });

  client.on("guildCreate", async (guild) => {
    scheduleTopggStatsPost(client, "guild_create");
    try {
      const channel = await sendServerJoinMessage(guild);
      console.log(channel
        ? `Posted join setup guide in ${guild.name} (#${channel.name}).`
        : `Joined ${guild.name}, but no writable setup channel was found.`);
    } catch (error) {
      console.error(`Failed to post setup guide in ${guild.name}:`, error);
    }
  });

  client.on("guildDelete", () => {
    scheduleTopggStatsPost(client, "guild_delete");
  });

  client.on("interactionCreate", async (interaction) => {
    const clearPreparedResponse = await prepareInteractionResponse(interaction);
    try {
      await withInteractionUserLock(interaction, () => routeInteraction(interaction));
    } catch (error) {
      console.error(error);
      const payload = { content: "Something went wrong while processing that command.", ephemeral: true };
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload).catch(() => null);
      } else {
        await interaction.reply(payload).catch(() => null);
      }
    } finally {
      clearPreparedResponse();
    }
  });

  client.on("messageCreate", async (message) => {
    try {
      await handleChatRelicSpawnMessage(message);
    } catch (error) {
      console.error("Relic chat spawn listener failed:", error);
    }
  });

  console.log("Logging in to Discord...");
  const loginTimeout = setTimeout(() => {
    console.error("Discord login is taking longer than expected.");
  }, 20000);

  await client.login(process.env.DISCORD_TOKEN);
  clearTimeout(loginTimeout);

  console.log("Registering application commands...");
  if (shouldRegisterCommandsOnStart()) {
    try {
      await registerCommands();
    } catch (error) {
      console.error("Command registration failed:", error);
    }
  } else {
    console.log("Command registration skipped because REGISTER_COMMANDS_ON_START=false.");
  }
}

main().catch((error) => {
  console.error("Fatal startup error:", error);
  process.exit(1);
});
