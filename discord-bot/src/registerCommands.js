const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { REST, Routes } = require("discord.js");
const { buildCommands } = require("./game/service");

async function main() {
  const token = process.env.DISCORD_TOKEN?.trim();
  const clientId = process.env.DISCORD_CLIENT_ID?.trim();

  if (!token || !clientId) {
    throw new Error("Missing DISCORD_TOKEN or DISCORD_CLIENT_ID.");
  }

  const commands = buildCommands();
  const rest = new REST({ version: "10" }).setToken(token);

  await rest.put(Routes.applicationCommands(clientId), { body: commands });
  console.log(`Registered ${commands.length} global commands.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
