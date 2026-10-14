const { Client, GatewayIntentBits, REST, Routes } = require("discord.js");
const { attachAnalyticsSubscribers } = require("../analytics/service");
const { attachFlashSaleSubscriber } = require("../monetization/flashSale");
const { migrateToGlobalPlayerProfiles } = require("../data/globalPlayerMigration");
const {
  attachRetentionSubscribers,
  attachWorldBossSubscribers,
  buildCommands,
  handleChatRelicSpawnMessage,
  routeInteraction,
  sendServerJoinMessage,
  startClanDailyResetLoop,
  startReminderLoop,
  startRelicSpawnLoop,
} = require("../game/service");
const { eventBus } = require("./eventBus");
const { inviteCache, refreshGuildInviteCache, fetchGuildInviteSnapshot, findUsedInvite, findBotJoinInviter, recordInviteAttribution } = require("./inviteTracker");
const { withInteractionUserLock, prepareInteractionResponse } = require("./interactionHandler");
const { scheduleTopggStatsPost, startTopggStatsLoop } = require("./topggStats");
const { shouldRegisterCommandsOnStart } = require("./webServer");

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

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  const commands = buildCommands();

  await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: commands });
  console.log(`Registered ${commands.length} global commands.`);
}

async function startDiscordClient() {
  // Run migration before starting the client
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
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildEmojisAndStickers, GatewayIntentBits.GuildMessages],
  });

  // Attach event bus subscribers
  attachAnalyticsSubscribers(eventBus);
  attachRetentionSubscribers(eventBus, client);
  attachWorldBossSubscribers(eventBus, client);
  attachFlashSaleSubscriber(eventBus, client);

  // Shard lifecycle events
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

  // Ready event — initialize caches and loops
  client.once("ready", () => {
    console.log(`Bot ready as ${client.user.tag}`);
    Promise.all([...client.guilds.cache.values()].map((guild) => refreshGuildInviteCache(guild)))
      .catch((error) => console.error("Invite cache initialization failed:", error));
    startReminderLoop(client);
    startClanDailyResetLoop(client);
    startRelicSpawnLoop(client);
    startTopggStatsLoop(client);
  });

  // Guild events
  client.on("guildCreate", async (guild) => {
    scheduleTopggStatsPost(client, "guild_create");
    try {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      const inviterId = await findBotJoinInviter(guild, client);
      await recordInviteAttribution({
        attributionType: "bot_join",
        guild,
        inviterId,
        invitedUserId: client.user.id,
      });
      await refreshGuildInviteCache(guild);
      const channel = await sendServerJoinMessage(guild);
      console.log(channel
        ? `Posted join setup guide in ${guild.name} (#${channel.name}).`
        : `Joined ${guild.name}, but no writable setup channel was found.`);
    } catch (error) {
      console.error(`Failed to post setup guide in ${guild.name}:`, error);
    }
  });

  client.on("guildMemberAdd", async (member) => {
    try {
      if (member.user.bot) {
        return;
      }
      const previous = inviteCache.get(member.guild.id) || new Map();
      const current = await fetchGuildInviteSnapshot(member.guild);
      const usedInvite = findUsedInvite(previous, current);
      inviteCache.set(member.guild.id, current);
      await recordInviteAttribution({
        attributionType: "member_join",
        guild: member.guild,
        inviterId: usedInvite?.inviterId || null,
        invitedUserId: member.user.id,
        inviteCode: usedInvite?.code || null,
      });
    } catch (error) {
      console.error(`Invite attribution failed for ${member.guild.id}:`, error);
    }
  });

  client.on("guildDelete", () => {
    scheduleTopggStatsPost(client, "guild_delete");
  });

  // Interaction handler
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

  // Chat relic spawns
  client.on("messageCreate", async (message) => {
    try {
      await handleChatRelicSpawnMessage(message);
    } catch (error) {
      console.error("Relic chat spawn listener failed:", error);
    }
  });

  // Login
  console.log("Logging in to Discord...");
  const loginTimeout = setTimeout(() => {
    console.error("Discord login is taking longer than expected.");
  }, 20000);

  await client.login(process.env.DISCORD_TOKEN);
  clearTimeout(loginTimeout);

  // Register commands
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

  return client;
}

module.exports = { startDiscordClient };
