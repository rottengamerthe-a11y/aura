const { ShardingManager } = require("discord.js");
const path = require("path");

const manager = new ShardingManager(path.join(__dirname, "index.js"), {
  token: process.env.DISCORD_TOKEN,
  totalShards: process.env.SHARD_COUNT === "auto" || !process.env.SHARD_COUNT
    ? "auto"
    : Number(process.env.SHARD_COUNT) || "auto",
  respawn: true,
});

manager.on("shardCreate", (shard) => {
  console.log(`[ShardingManager] Shard ${shard.id} launched.`);

  shard.on("ready", () => {
    console.log(`[ShardingManager] Shard ${shard.id} ready.`);
  });

  shard.on("disconnect", () => {
    console.warn(`[ShardingManager] Shard ${shard.id} disconnected.`);
  });

  shard.on("reconnecting", () => {
    console.log(`[ShardingManager] Shard ${shard.id} reconnecting.`);
  });

  shard.on("death", (process) => {
    console.error(`[ShardingManager] Shard ${shard.id} died (exit code: ${process.exitCode}).`);
  });

  shard.on("error", (error) => {
    console.error(`[ShardingManager] Shard ${shard.id} error:`, error);
  });
});

console.log(`[ShardingManager] Starting Aurix with ${process.env.SHARD_COUNT || "auto"} shards...`);

manager.spawn().catch((error) => {
  console.error("[ShardingManager] Failed to spawn shards:", error);
  process.exit(1);
});
