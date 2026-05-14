const path = require("path");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const { Client, GatewayIntentBits, REST, Routes } = require("discord.js");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const mongoose = require("mongoose");
const { User } = require("./src/data/models");
const { migrateToGlobalPlayerProfiles } = require("./src/data/globalPlayerMigration");
const { applyPaddleWebhookEvent, buildCommands, routeInteraction, sendServerSetupMessage, startReminderLoop } = require("./src/game/service");

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
  const isProduction = process.env.NODE_ENV === "production";

  app.set("trust proxy", 1);

  app.post("/paddle/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    if (!paddleWebhookSecret) {
      return res.status(503).json({ ok: false, error: "paddle_not_configured" });
    }

    const signature = req.headers["paddle-signature"];
    const rawBody = req.body.toString("utf8");

    if (!verifyPaddleWebhookSignature(rawBody, signature, paddleWebhookSecret)) {
      console.error("Paddle webhook signature verification failed.");
      return res.status(400).json({ ok: false, error: "invalid_signature" });
    }

    try {
      const event = JSON.parse(rawBody);
      const result = await applyPaddleWebhookEvent(event, event.event_id || event.eventId || null);
      console.log("Paddle webhook processed:", {
        eventType: event.event_type || event.eventType || event.type,
        eventId: event.event_id || event.eventId || null,
        result,
      });
      return res.status(200).json({ ok: true, ...result });
    } catch (error) {
      console.error("Paddle webhook processing failed:", error);
      return res.status(500).json({ ok: false, error: "webhook_processing_failed" });
    }
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
    res.status(200).json({ ok: true, service: "discord-bot" });
  });

  app.listen(port, () => {
    console.log(`Health server listening on port ${port}.`);
  });
}

async function main() {
  startWebServer();
  console.log("Connecting to MongoDB...");
  await connectDatabase();
  const migrationResult = await migrateToGlobalPlayerProfiles();
  if (migrationResult.ran) {
    console.log(`Global player migration complete. Merged ${migrationResult.mergedUsers} users and removed ${migrationResult.removedProfiles} duplicate profiles.`);
  }
  try {
    await verifyDiscordConfiguration();
  } catch (error) {
    console.error("Discord REST verification failed:", error);
  }
  console.log("Starting Discord client...");

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

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
  });

  client.on("guildCreate", async (guild) => {
    try {
      const channel = await sendServerSetupMessage(guild);
      console.log(channel
        ? `Posted setup guide in ${guild.name} (#${channel.name}).`
        : `Joined ${guild.name}, but no writable setup channel was found.`);
    } catch (error) {
      console.error(`Failed to post setup guide in ${guild.name}:`, error);
    }
  });

  client.on("interactionCreate", async (interaction) => {
    try {
      await routeInteraction(interaction);
    } catch (error) {
      console.error(error);
      const payload = { content: "Something went wrong while processing that command.", ephemeral: true };
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload).catch(() => null);
      } else {
        await interaction.reply(payload).catch(() => null);
      }
    }
  });

  console.log("Logging in to Discord...");
  const loginTimeout = setTimeout(() => {
    console.error("Discord login is taking longer than expected.");
  }, 20000);

  await client.login(process.env.DISCORD_TOKEN);
  clearTimeout(loginTimeout);

  console.log("Registering application commands...");
  try {
    await registerCommands();
  } catch (error) {
    console.error("Command registration failed:", error);
  }
}

main().catch((error) => {
  console.error("Fatal startup error:", error);
  process.exit(1);
});
