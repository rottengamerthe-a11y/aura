const path = require("path");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const mongoose = require("mongoose");
const { connectRedis, disconnectRedis } = require("./src/core/redis");
const { startWebServer } = require("./src/core/webServer");
const { startDiscordClient } = require("./src/core/discordClient");
const { stopTopggStatsLoop } = require("./src/core/topggStats");

const startedAt = Date.now();
let discordClient = null;
let httpServer = null;
let shuttingDown = false;

// --- Environment validation ---

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

// --- Graceful shutdown ---

async function shutdown(reason = "shutdown", exitCode = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`Shutting down Aurix (${reason})...`);

  stopTopggStatsLoop();

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
    disconnectRedis(),
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

// --- Startup ---

async function main() {
  // 1. Start web server
  httpServer = startWebServer({
    getClient: () => discordClient,
    startedAt,
  });

  // 2. Connect to Redis (optional, graceful fallback)
  connectRedis();

  // 3. Connect to MongoDB
  console.log("Connecting to MongoDB...");
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  console.log("MongoDB connected.");

  // 4. Start Discord client (includes migration, verification, login, command registration)
  discordClient = await startDiscordClient();
}

main().catch((error) => {
  console.error("Fatal startup error:", error);
  process.exit(1);
});
