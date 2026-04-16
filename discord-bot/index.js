require("dotenv").config();

const { Client, GatewayIntentBits, REST, Routes } = require("discord.js");
const mongoose = require("mongoose");
const { buildCommands, routeInteraction } = require("./src/game/service");

const requiredEnv = ["DISCORD_TOKEN", "DISCORD_CLIENT_ID", "MONGODB_URI"];
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

async function main() {
  await connectDatabase();
  await registerCommands();

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  client.once("ready", () => {
    console.log(`Bot ready as ${client.user.tag}`);
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

  await client.login(process.env.DISCORD_TOKEN);
}

main().catch((error) => {
  console.error("Fatal startup error:", error);
  process.exit(1);
});
