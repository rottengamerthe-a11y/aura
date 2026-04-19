require("dotenv").config();

const { Client, GatewayIntentBits, REST, Routes } = require("discord.js");
const express = require("express");
const mongoose = require("mongoose");
const { getRazorpayConfig, processWebhookEvent, verifyWebhookSignature } = require("./src/billing/razorpay");
const { migrateToGlobalPlayerProfiles } = require("./src/data/globalPlayerMigration");
const { buildCommands, routeInteraction, sendServerSetupMessage, startReminderLoop } = require("./src/game/service");

const requiredEnv = ["DISCORD_TOKEN", "DISCORD_CLIENT_ID", "MONGODB_URI"];

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

function startWebServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;
  const razorpayWebhookSecret = getRazorpayConfig().webhookSecret;

  app.post("/razorpay/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    if (!razorpayWebhookSecret) {
      return res.status(503).json({ ok: false, error: "razorpay_not_configured" });
    }

    const signature = req.headers["x-razorpay-signature"];
    if (!signature) {
      return res.status(400).json({ ok: false, error: "missing_signature" });
    }

    const rawBody = req.body.toString("utf8");
    if (!verifyWebhookSignature(rawBody, signature)) {
      console.error("Razorpay webhook signature verification failed.");
      return res.status(400).json({ ok: false, error: "invalid_signature" });
    }

    try {
      const event = JSON.parse(rawBody);
      const eventId = req.headers["x-razorpay-event-id"];
      const result = await processWebhookEvent(event, eventId);
      return res.status(200).json({ ok: true, ...result });
    } catch (error) {
      console.error("Razorpay webhook processing failed:", error);
      return res.status(500).json({ ok: false, error: "webhook_processing_failed" });
    }
  });

  app.get("/", (_req, res) => {
    res.status(200).send("Aura bot is running.");
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
