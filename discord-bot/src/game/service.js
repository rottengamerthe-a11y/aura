const { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } = require("discord.js");
const crypto = require("crypto");
const { BOSSES, COOLDOWNS, CRATES, CRAFTING_RECIPES, EFFECT_CAPS, GARDEN_CROPS, GEAR_ITEMS, MATERIALS, QUEST_TEMPLATES, RANKS, SHOP_ITEMS, SKILLS, WORLD_EVENTS } = require("../config/gameConfig");
const { Clan, User } = require("../data/models");
const { buildEmbedPayload } = require("../utils/visuals");

const activeBattles = new Map();

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatNumber(value) {
  return Intl.NumberFormat("en-US").format(Math.floor(value));
}

function progressBar(current, total, size = 12) {
  const ratio = total <= 0 ? 1 : clamp(current / total, 0, 1);
  const filled = Math.round(ratio * size);
  return `${"#".repeat(filled)}${"-".repeat(size - filled)} ${Math.round(ratio * 100)}%`;
}

function getItem(itemId) {
  return SHOP_ITEMS.find((item) => item.id === itemId) || null;
}

function getMaterial(materialId) {
  return MATERIALS[materialId] || null;
}

function getGearItem(gearId) {
  return GEAR_ITEMS[gearId] || null;
}

function getGardenCrop(cropId) {
  return GARDEN_CROPS[cropId] || null;
}

function getRecipe(recipeId) {
  return CRAFTING_RECIPES.find((recipe) => recipe.id === recipeId) || null;
}

function getInventoryLabel(id) {
  return getItem(id)?.name || getMaterial(id)?.name || getGearItem(id)?.name || id;
}

function formatEffectValue(value) {
  return Number.isInteger(value) ? `${value}` : `+${(value * 100).toFixed(1)}%`;
}

function formatEffectCapValue(effectId) {
  const cap = EFFECT_CAPS[effectId];
  if (typeof cap !== "number") {
    return "None";
  }
  return Number.isInteger(cap) ? `${cap}` : `+${(cap * 100).toFixed(1)}%`;
}

function applyEffectCaps(effects) {
  return Object.entries(effects).reduce((acc, [key, value]) => {
    const cap = EFFECT_CAPS[key];
    acc[key] = typeof cap === "number" ? clamp(value, 0, cap) : value;
    return acc;
  }, {});
}

function sumEffectSources(...sources) {
  const combined = {};
  sources.forEach((source) => {
    Object.entries(source || {}).forEach(([key, value]) => {
      combined[key] = (combined[key] || 0) + value;
    });
  });
  return applyEffectCaps(combined);
}

function buildEffectCapLines() {
  return [
    `Spin Reward: cap ${formatEffectCapValue("spinRewardBoost")}`,
    `Vault Interest: cap ${formatEffectCapValue("vaultInterestBoost")}/hr`,
    `Coinflip Win: cap ${formatEffectCapValue("coinflipWinBoost")}`,
    `Work Aura: cap ${formatEffectCapValue("workAuraBoost")}`,
    `Work XP: cap ${formatEffectCapValue("workXpBoost")}`,
    `Mine Yield: cap ${formatEffectCapValue("mineYieldBoost")}`,
    `Mine XP: cap ${formatEffectCapValue("mineXpBoost")}`,
    `Mine Iron Bonus: cap +${formatEffectCapValue("mineIronBonus")} ore`,
    `Garden Yield: cap ${formatEffectCapValue("gardenYieldBoost")}`,
    `Boss Reward: cap ${formatEffectCapValue("bossRewardBoost")}`,
    `PvP Reward: cap ${formatEffectCapValue("pvpRewardBoost")}`,
    `Crate Aura: cap ${formatEffectCapValue("crateAuraBoost")}`,
  ].join("\n");
}

function rollCombatLoot(kind, sourceId = null) {
  const drops = [];

  if (kind === "boss") {
    const boss = BOSSES.find((entry) => entry.id === sourceId);
    const lootTable = boss?.loot;
    Object.entries(lootTable?.crateChance || {}).forEach(([crateId, chance]) => {
      if (Math.random() < chance) {
        drops.push({ type: "crate", id: crateId, quantity: 1, label: `${crateId} crate x1` });
      }
    });
    (lootTable?.materials || []).forEach((material) => {
      if (Math.random() < material.chance) {
        const quantity = randInt(material.quantity[0], material.quantity[1]);
        drops.push({ type: "material", id: material.id, quantity, label: `${getInventoryLabel(material.id)} x${quantity}` });
      }
    });
  }

  if (kind === "pvp") {
    if (Math.random() < 0.2) {
      drops.push({ type: "crate", id: "common", quantity: 1, label: "common crate x1" });
    }
    if (Math.random() < 0.5) {
      const materialPool = [
        { id: "iron_ore", quantity: randInt(1, 3) },
        { id: "ember_shard", quantity: randInt(1, 2) },
      ];
      const reward = materialPool[randInt(0, materialPool.length - 1)];
      drops.push({ type: "material", ...reward, label: `${getInventoryLabel(reward.id)} x${reward.quantity}` });
    }
  }

  return drops;
}

function applyCombatLoot(user, loot) {
  loot.forEach((drop) => {
    if (drop.type === "crate") {
      user.crates.set(drop.id, (user.crates.get(drop.id) || 0) + drop.quantity);
      return;
    }
    addInventoryItem(user, drop.id, drop.quantity);
  });
}

function getBossCraftingHint(boss) {
  const hints = {
    ember: "Drops ember-heavy loot for Lucky Charm, Combat Manual, and Bloom Satchel routes.",
    oracle: "Best source for sun resin toward the Oracle Relic path.",
    warden: "Best source for vault dust for Vault Key, Miner's Lantern, and mixed crate crafting.",
    codex: "Late-game mixed loot source for Oracle Relic progress and higher crate spikes.",
  };
  return hints[boss.id] || "Fight this boss for crafting materials and combat loot.";
}

function buildCraftingGuidePayload() {
  return buildEmbedPayload({
    title: "Crafting Guide",
    description: "Use this route map to decide which bosses to farm for each upgrade path.",
    visual: "help-summary.svg",
    fields: [
      { name: "Ember Tyrant", value: "Lucky Charm\nCombat Manual\nBloom Satchel" },
      { name: "Oracle of Static", value: "Oracle Relic\nSun resin support" },
      { name: "Vault Warden", value: "Vault Key\nMiner's Lantern\nCommon Crate" },
      { name: "Codex Prime", value: "Oracle Relic\nLate-game mixed loot\nHigher crate spikes" },
      { name: "Best Mixed Routes", value: "Combat Manual: Ember + Warden\nCommon Crate: Ember + Warden\nOracle Relic: Oracle + Codex" },
    ],
    footer: "Check /boss before a fight and /craft when you are ready to spend materials.",
  });
}

function getRankByXp(xp) {
  let rankIndex = 0;
  for (let index = 0; index < RANKS.length; index += 1) {
    if (xp >= RANKS[index].xpRequired) {
      rankIndex = index;
    }
  }
  return rankIndex;
}

function nextRank(rankIndex) {
  return RANKS[Math.min(rankIndex + 1, RANKS.length - 1)];
}

function getPerkEffects(user) {
  return user.ownedPerks.reduce((acc, perkId) => {
    const item = getItem(perkId);
    if (!item?.effects) {
      return acc;
    }
    Object.entries(item.effects).forEach(([key, value]) => {
      acc[key] = (acc[key] || 0) + value;
    });
    return acc;
  }, {});
}

function getGearEffects(user) {
  return Object.values(user.equippedGear || {}).reduce((acc, gearId) => {
    const gear = getGearItem(gearId);
    if (!gear?.effects) {
      return acc;
    }
    Object.entries(gear.effects).forEach(([key, value]) => {
      acc[key] = (acc[key] || 0) + value;
    });
    return acc;
  }, {});
}

function getCurrentWorldEvent() {
  const durationMs = (WORLD_EVENTS[0]?.durationHours || 6) * 60 * 60 * 1000;
  const eventIndex = Math.floor(Date.now() / durationMs) % WORLD_EVENTS.length;
  const event = WORLD_EVENTS[eventIndex];
  const startedAt = Math.floor(Date.now() / durationMs) * durationMs;
  return { ...event, endsAt: startedAt + durationMs };
}

function getCombinedEffects(user) {
  const worldEvent = getCurrentWorldEvent();
  const perkEffects = getPerkEffects(user);
  const gearEffects = getGearEffects(user);
  const eventEffects = worldEvent.effects || {};
  return sumEffectSources(perkEffects, gearEffects, eventEffects);
}

function ensureInventoryEntry(user, id) {
  let entry = user.inventory.find((item) => item.id === id);
  if (!entry) {
    entry = { id, quantity: 0 };
    user.inventory.push(entry);
  }
  return entry;
}

function addInventoryItem(user, id, quantity = 1) {
  const entry = ensureInventoryEntry(user, id);
  entry.quantity += quantity;
}

function setQuestSet(user) {
  if (user.quests.length > 0) {
    return;
  }
  const selected = [...QUEST_TEMPLATES].sort(() => Math.random() - 0.5).slice(0, 3);
  user.quests = selected.map((quest) => ({ ...quest, progress: 0, completed: false }));
}

async function syncRank(user) {
  const previousRank = user.rankIndex;
  const computedRank = getRankByXp(user.xp);
  user.rankIndex = computedRank;
  if (computedRank > previousRank) {
    for (let index = previousRank + 1; index <= computedRank; index += 1) {
      const rank = RANKS[index];
      user.aura += rank.rewardAura;
      Object.entries(rank.rewardCrates || {}).forEach(([crateId, amount]) => {
        user.crates.set(crateId, (user.crates.get(crateId) || 0) + amount);
      });
    }
  }
}

async function applyQuestProgress(user, metric, amount) {
  let changed = false;
  user.quests.forEach((quest) => {
    if (quest.metric !== metric || quest.completed) {
      return;
    }
    quest.progress = Math.min(quest.goal, quest.progress + amount);
    if (quest.progress >= quest.goal) {
      quest.completed = true;
      user.aura += quest.rewardAura;
      user.xp += quest.rewardXp;
    }
    changed = true;
  });
  if (changed) {
    await syncRank(user);
  }
}

async function getOrCreatePlayer(guildId, userId) {
  let user = await User.findOne({ guildId, userId });
  if (!user) {
    user = await User.create({ guildId, userId });
  }
  setQuestSet(user);
  if (!Array.isArray(user.gardenPlots) || user.gardenPlots.length === 0) {
    user.gardenPlots = [{ cropId: null, plantedAt: null }, { cropId: null, plantedAt: null }];
  }
  user.equippedGear = user.equippedGear || { tool: null, charm: null, relic: null };
  if (!user.lastVaultInterestAt) {
    user.lastVaultInterestAt = new Date();
  }
  return user;
}

function getCooldownRemaining(lastDate, durationMs) {
  if (!lastDate) {
    return 0;
  }
  return Math.max(0, lastDate.getTime() + durationMs - Date.now());
}

function humanizeMs(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes <= 0 ? `${seconds}s` : `${minutes}m ${seconds}s`;
}

async function claimVaultInterest(user) {
  const effects = getPerkEffects(user);
  const now = new Date();
  const elapsedMs = now.getTime() - (user.lastVaultInterestAt?.getTime() || now.getTime());
  const elapsedHours = elapsedMs / (60 * 60 * 1000);
  const rate = 0.03 + (effects.vaultInterestBoost || 0) + user.prestige * 0.005;
  const interest = Math.floor(user.vaultAura * rate * elapsedHours);
  user.lastVaultInterestAt = now;
  if (interest > 0) {
    user.vaultAura += interest;
  }
  return interest;
}

function buildProfileEmbed(user, targetUser) {
  const currentRank = RANKS[user.rankIndex];
  const next = nextRank(user.rankIndex);
  const rankProgressCurrent = user.xp - currentRank.xpRequired;
  const rankProgressTotal = Math.max(1, next.xpRequired - currentRank.xpRequired);
  return buildEmbedPayload({
    title: `${targetUser.username}'s Aura Profile`,
    description: "A complete snapshot of progression, economy, and combat readiness.",
    visual: "core-profile.svg",
    fields: [
      { name: "Aura Wallet", value: `${formatNumber(user.aura)}`, inline: true },
      { name: "Vault Aura", value: `${formatNumber(user.vaultAura)}`, inline: true },
      { name: "XP", value: `${formatNumber(user.xp)}`, inline: true },
      { name: "Rank", value: `${currentRank.name}`, inline: true },
      { name: "Prestige", value: `${user.prestige}`, inline: true },
      { name: "Daily Streak", value: `${user.streak} days`, inline: true },
      { name: "Rank Progress", value: `${progressBar(rankProgressCurrent, rankProgressTotal)}\n${formatNumber(rankProgressCurrent)} / ${formatNumber(rankProgressTotal)} XP` },
      { name: "Battle Record", value: `PvP ${user.stats.pvpWins}-${user.stats.pvpLosses} | Boss ${user.stats.bossWins}-${user.stats.bossLosses}` },
    ],
    footer: "Ranks can go down if your XP drops below the current tier threshold.",
  });
}

const HELP_SECTIONS = [
  {
    id: "getting_started",
    name: "Getting Started",
    visual: "help-core.svg",
    commands: [
      { name: "/start", description: "Create your save and unlock the game." },
      { name: "/profile [user]", description: "View your or another player's profile." },
      { name: "/stats [user]", description: "See a fuller breakdown of player activity." },
      { name: "/event", description: "View the current rotating world event." },
      { name: "/setup", description: "See the fastest way to get your account rolling." },
      { name: "/help", description: "Browse every command grouped by category." },
    ],
  },
  {
    id: "economy",
    name: "Economy",
    visual: "economy-vault.svg",
    commands: [
      { name: "/daily", description: "Claim your streak reward and refresh quests." },
      { name: "/work", description: "Complete a shift for steady aura and XP." },
      { name: "/mine", description: "Gather crafting materials on a cooldown." },
      { name: "/spin", description: "Spin for aura and XP every 5 minutes." },
      { name: "/coinflip", description: "Bet aura on heads or tails every 2 minutes." },
      { name: "/rob user:<player>", description: "Risk a cooldown to steal aura from another player." },
      { name: "/vault deposit", description: "Move aura into the vault." },
      { name: "/vault withdraw", description: "Take aura back from the vault." },
      { name: "/vault interest", description: "Collect the vault's accumulated interest." },
      { name: "/shop", description: "Browse perks, crates, and unlocks." },
      { name: "/buy item:<id>", description: "Purchase a shop item by id." },
      { name: "/gift user:<player> amount:<amount>", description: "Send aura to another player." },
      { name: "/inventory", description: "Review owned items, skills, and crates." },
      { name: "/craft recipe:<id>", description: "Turn mined materials into useful rewards." },
      { name: "/garden", description: "Plant and harvest real-time crops." },
      { name: "/gear", description: "Equip crafted gear and review your loadout." },
      { name: "/crate type:<type>", description: "Open a common, rare, epic, or legendary crate." },
    ],
  },
  {
    id: "progression",
    name: "Progression",
    visual: "help-summary.svg",
    commands: [
      { name: "/rank", description: "Check XP rank progress and prestige readiness." },
      { name: "/prestige", description: "Reset your ladder after reaching the top rank." },
      { name: "/quests", description: "View your current daily quest set." },
      { name: "/achievements", description: "Claim milestone rewards you have unlocked." },
      { name: "/leaderboard category:<type>", description: "See the top players or clans." },
      { name: "/authority user:<player>", description: "Use the Warden+ blessing command." },
    ],
  },
  {
    id: "combat",
    name: "Combat",
    visual: "help-bosses.svg",
    commands: [
      { name: "/skills", description: "See unlocked battle skills." },
      { name: "/pvp user:<player>", description: "Challenge another player to an interactive duel." },
      { name: "/boss [boss]", description: "Fight one of the available bosses." },
    ],
  },
  {
    id: "clans",
    name: "Clans",
    visual: "help-clans.svg",
    commands: [
      { name: "/clan create name:<name>", description: "Create a clan for 50,000 aura." },
      { name: "/clan join code:<code>", description: "Join an existing clan." },
      { name: "/clan apply code:<code>", description: "Send a join request for approval." },
      { name: "/clan info", description: "View your clan hall." },
      { name: "/clan members", description: "List the current clan roster." },
      { name: "/clan kick user:<player>", description: "Owner-only member removal." },
      { name: "/clan approve user:<player>", description: "Owner or officer request approval." },
      { name: "/clan decline user:<player>", description: "Owner or officer reject an applicant." },
      { name: "/clan log", description: "View recent clan activity." },
      { name: "/clan role user:<player> role:<type>", description: "Owner-only officer management." },
      { name: "/clan transfer user:<player>", description: "Owner-only leadership transfer." },
      { name: "/clan disband", description: "Owner-only full clan deletion." },
      { name: "/clan upgrade path:<type>", description: "Spend clan vault aura on upgrades." },
      { name: "/clan raid", description: "Launch a cooldown-based clan raid." },
      { name: "/clan donate amount:<amount>", description: "Donate aura to the clan vault." },
      { name: "/clan war enemy:<code>", description: "Fight another clan by invite code." },
      { name: "/clan leave", description: "Leave your current clan." },
    ],
  },
];

const ACHIEVEMENTS = [
  { id: "first_shift", name: "First Shift", description: "Complete 1 work command.", metric: (user) => user.stats.works, goal: 1, rewardAura: 350, rewardXp: 120 },
  { id: "steady_worker", name: "Steady Worker", description: "Complete 10 work commands.", metric: (user) => user.stats.works, goal: 10, rewardAura: 1800, rewardXp: 420 },
  { id: "lucky_spinner", name: "Lucky Spinner", description: "Use spin 25 times.", metric: (user) => user.stats.spins, goal: 25, rewardAura: 2200, rewardXp: 520 },
  { id: "vault_builder", name: "Vault Builder", description: "Store 10,000 aura in the vault.", metric: (user) => user.vaultAura, goal: 10000, rewardAura: 2500, rewardXp: 600 },
  { id: "shadow_winner", name: "Shadow Winner", description: "Win 5 robberies.", metric: (user) => user.stats.robWins, goal: 5, rewardAura: 2600, rewardXp: 650 },
  { id: "ore_runner", name: "Ore Runner", description: "Mine 10 times.", metric: (user) => user.stats.mines, goal: 10, rewardAura: 2100, rewardXp: 480 },
  { id: "artisan", name: "Artisan", description: "Craft 5 recipes.", metric: (user) => user.stats.crafts, goal: 5, rewardAura: 2800, rewardXp: 700 },
  { id: "boss_hunter", name: "Boss Hunter", description: "Defeat 5 bosses.", metric: (user) => user.stats.bossWins, goal: 5, rewardAura: 4300, rewardXp: 1050 },
  { id: "prestige_path", name: "Prestige Path", description: "Reach prestige 1.", metric: (user) => user.prestige, goal: 1, rewardAura: 5000, rewardXp: 1000 },
];

function formatHelpSection(section) {
  return section.commands.map((command) => `\`${command.name}\`\n${command.description}`).join("\n\n");
}

function formatHelpOverview() {
  return HELP_SECTIONS.map((section) => `**${section.name}** (${section.commands.length})\nUse \`/help category:${section.id}\``).join("\n\n");
}

function getHelpSection(categoryId) {
  return HELP_SECTIONS.find((section) => section.id === categoryId) || null;
}

function getAvailableAchievements(user) {
  return ACHIEVEMENTS.filter((achievement) => !user.claimedAchievements.includes(achievement.id) && achievement.metric(user) >= achievement.goal);
}

function ensureClanState(clan) {
  clan.level = clan.level || 1;
  clan.officerIds = clan.officerIds || [];
  clan.pendingApplicantIds = clan.pendingApplicantIds || [];
  clan.log = clan.log || [];
  clan.upgrades = clan.upgrades || {};
  clan.upgrades.hall = clan.upgrades.hall || 1;
  clan.upgrades.vault = clan.upgrades.vault || 1;
  clan.upgrades.arsenal = clan.upgrades.arsenal || 1;
  clan.raidWins = clan.raidWins || 0;
  clan.raidLosses = clan.raidLosses || 0;
  return clan;
}

function getClanVaultCapacity(clan) {
  return 50000 + clan.upgrades.hall * 25000 + clan.upgrades.vault * 50000;
}

function getClanMemberCap(clan) {
  return 4 + clan.upgrades.hall * 2;
}

function isClanOfficer(clan, userId) {
  return clan.ownerId === userId || clan.officerIds.includes(userId);
}

function getClanRoleLabel(clan, userId) {
  if (clan.ownerId === userId) {
    return "Owner";
  }
  if (clan.officerIds.includes(userId)) {
    return "Officer";
  }
  return "Member";
}

function getClanUpgradeCost(clan, path) {
  const currentLevel = clan.upgrades[path] || 1;
  const costs = {
    hall: 20000,
    vault: 18000,
    arsenal: 22000,
  };
  return costs[path] * currentLevel;
}

function getClanPower(clan) {
  return clan.memberIds.length * 25 + clan.trophies + clan.level * 40 + clan.upgrades.arsenal * 55 + clan.upgrades.hall * 20;
}

function addClanLog(clan, type, actorId, details, targetId = null) {
  clan.log.unshift({
    type,
    actorId,
    targetId,
    details,
    createdAt: new Date(),
  });
  clan.log = clan.log.slice(0, 20);
}

async function formatClanLogEntries(interaction, clan) {
  if (!clan.log.length) {
    return "No clan activity recorded yet.";
  }

  const userIds = [...new Set(clan.log.flatMap((entry) => [entry.actorId, entry.targetId]).filter(Boolean))];
  const resolved = await Promise.all(userIds.map(async (userId) => {
    const user = await interaction.client.users.fetch(userId).catch(() => null);
    return [userId, user?.username || userId];
  }));
  const nameMap = new Map(resolved);

  return clan.log.map((entry, index) => {
    const actor = entry.actorId ? nameMap.get(entry.actorId) || entry.actorId : "System";
    const target = entry.targetId ? nameMap.get(entry.targetId) || entry.targetId : null;
    const names = target ? `${actor} -> ${target}` : actor;
    return `${index + 1}. [${entry.type}] ${names}: ${entry.details}`;
  }).join("\n");
}

async function handleStart(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  await user.save();
  return interaction.reply({
    ...buildEmbedPayload({
      title: "Aura Garden Online",
      description: `Your save is ready. You started with ${formatNumber(user.aura)} aura, access to daily rewards, vaulting, ranks, and combat.`,
      visual: "help-core.svg",
      fields: [
        { name: "Try Next", value: "`/work`, `/spin`, `/daily`, `/profile`" },
        { name: "Core Loop", value: "Farm aura, level XP, rank up, prestige, then climb the leaderboard." },
      ],
    }),
    ephemeral: true,
  });
}

async function handleProfile(interaction) {
  const target = interaction.options.getUser("user") || interaction.user;
  const user = await getOrCreatePlayer(interaction.guildId, target.id);
  await user.save();
  return interaction.reply(buildProfileEmbed(user, target));
}

async function handleStats(interaction) {
  const target = interaction.options.getUser("user") || interaction.user;
  const user = await getOrCreatePlayer(interaction.guildId, target.id);
  await user.save();

  const totalBattles = user.stats.pvpWins + user.stats.pvpLosses + user.stats.bossWins + user.stats.bossLosses;
  return interaction.reply(buildEmbedPayload({
    title: `${target.username}'s Combat and Economy Stats`,
    description: "A deeper look at activity, wins, and long-term progress.",
    visual: "help-summary.svg",
    fields: [
      { name: "Spins", value: `${formatNumber(user.stats.spins)}`, inline: true },
      { name: "Coinflips", value: `${formatNumber(user.stats.coinflips)}`, inline: true },
      { name: "Shop Buys", value: `${formatNumber(user.stats.shopBuys)}`, inline: true },
      { name: "PvP Record", value: `${user.stats.pvpWins}W - ${user.stats.pvpLosses}L`, inline: true },
      { name: "Boss Record", value: `${user.stats.bossWins}W - ${user.stats.bossLosses}L`, inline: true },
      { name: "Battles Played", value: `${formatNumber(totalBattles)}`, inline: true },
      { name: "Vault Deposited", value: `${formatNumber(user.stats.vaultDeposit)} aura`, inline: true },
      { name: "Owned Perks", value: `${formatNumber(user.ownedPerks.length)}`, inline: true },
      { name: "Unlocked Skills", value: `${formatNumber(user.skills.length)}`, inline: true },
    ],
  }));
}

async function handleGift(interaction) {
  const sender = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const target = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);

  if (target.bot || target.id === interaction.user.id) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Gift Failed", description: "Choose another human player to receive aura.", visual: "emblem-alert.svg" }), ephemeral: true });
  }

  if (amount <= 0 || amount > sender.aura) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Gift Failed", description: "Send an amount inside your current aura wallet.", visual: "emblem-alert.svg" }), ephemeral: true });
  }

  const receiver = await getOrCreatePlayer(interaction.guildId, target.id);
  sender.aura -= amount;
  receiver.aura += amount;
  await sender.save();
  await receiver.save();

  return interaction.reply(buildEmbedPayload({
    title: "Aura Gift Sent",
    description: `${interaction.user.username} sent **${formatNumber(amount)} aura** to ${target.username}.`,
    visual: "emblem-success.svg",
    fields: [
      { name: "Sender Wallet", value: `${formatNumber(sender.aura)} aura`, inline: true },
      { name: "Receiver Wallet", value: `${formatNumber(receiver.aura)} aura`, inline: true },
    ],
  }));
}

async function handleWork(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const remaining = getCooldownRemaining(user.lastWorkAt, COOLDOWNS.workMs);
  if (remaining > 0) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Work Cooling Down", description: `Your next shift opens in ${humanizeMs(remaining)}.`, visual: "economy-vault.svg" }), ephemeral: true });
  }

  const effects = getCombinedEffects(user);
  const auraReward = Math.floor((randInt(260, 620) * (1 + (effects.spinRewardBoost || 0) * 0.5 + (effects.workAuraBoost || 0))) + user.prestige * 55);
  const xpReward = Math.floor((randInt(70, 140) + user.rankIndex * 10) * (1 + (effects.workXpBoost || 0)));
  user.lastWorkAt = new Date();
  user.aura += auraReward;
  user.xp += xpReward;
  user.stats.works += 1;
  await applyQuestProgress(user, "works", 1);
  await syncRank(user);
  await user.save();

  return interaction.reply(buildEmbedPayload({
    title: "Shift Complete",
    description: `You finished a clean shift and earned **${formatNumber(auraReward)} aura** plus **${formatNumber(xpReward)} XP**.`,
    visual: "economy-vault.svg",
    fields: [
      { name: "Total Shifts", value: `${formatNumber(user.stats.works)}`, inline: true },
      { name: "Next Shift", value: "15 minutes", inline: true },
      { name: "Wallet", value: `${formatNumber(user.aura)} aura`, inline: true },
    ],
  }));
}

async function handleMine(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const remaining = getCooldownRemaining(user.lastMineAt, COOLDOWNS.mineMs);
  if (remaining > 0) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Mine Cooling Down", description: `The mine resets in ${humanizeMs(remaining)}.`, visual: "economy-vault.svg" }), ephemeral: true });
  }

  const effects = getCombinedEffects(user);
  const materials = [
    { id: "iron_ore", quantity: randInt(2, 5) + (effects.mineIronBonus || 0) },
    { id: "ember_shard", quantity: randInt(0, 2) },
    { id: "vault_dust", quantity: randInt(0, 2) },
  ];
  const gained = materials.map((entry) => ({ ...entry, quantity: Math.max(0, Math.floor(entry.quantity * (1 + (effects.mineYieldBoost || 0)))) })).filter((entry) => entry.quantity > 0);
  gained.forEach((entry) => addInventoryItem(user, entry.id, entry.quantity));

  const auraReward = randInt(80, 220);
  const xpReward = Math.floor(randInt(60, 130) * (1 + (effects.mineXpBoost || 0)));
  user.lastMineAt = new Date();
  user.aura += auraReward;
  user.xp += xpReward;
  user.stats.mines += 1;
  await applyQuestProgress(user, "mines", 1);
  await syncRank(user);
  await user.save();

  const materialLines = gained.map((entry) => `${getInventoryLabel(entry.id)} x${entry.quantity}`).join("\n");
  return interaction.reply(buildEmbedPayload({
    title: "Mining Run Complete",
    description: "You returned from the tunnels with fresh materials and a little spare aura.",
    visual: "economy-vault.svg",
    fields: [
      { name: "Materials", value: materialLines || "Nothing useful found." },
      { name: "Aura", value: `${formatNumber(auraReward)}`, inline: true },
      { name: "XP", value: `${formatNumber(xpReward)}`, inline: true },
      { name: "Next Mine", value: "12 minutes", inline: true },
    ],
  }));
}

async function handleRob(interaction) {
  const thief = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const target = interaction.options.getUser("user", true);
  const remaining = getCooldownRemaining(thief.lastRobAt, COOLDOWNS.robMs);
  if (remaining > 0) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Rob Cooling Down", description: `You can attempt another robbery in ${humanizeMs(remaining)}.`, visual: "emblem-alert.svg" }), ephemeral: true });
  }
  if (target.bot || target.id === interaction.user.id) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Invalid Target", description: "Choose another human player to rob.", visual: "emblem-alert.svg" }), ephemeral: true });
  }

  const victim = await getOrCreatePlayer(interaction.guildId, target.id);
  if (victim.aura < 250) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Target Too Light", description: "That player is not carrying enough aura to be worth robbing.", visual: "emblem-alert.svg" }), ephemeral: true });
  }

  thief.lastRobAt = new Date();
  const successChance = clamp(0.42 + thief.prestige * 0.015 - victim.prestige * 0.01, 0.2, 0.7);
  const success = Math.random() < successChance;
  let description = "";

  if (success) {
    const stolen = Math.min(victim.aura, randInt(180, 700) + victim.rankIndex * 35);
    const xpReward = randInt(90, 170);
    victim.aura -= stolen;
    thief.aura += stolen;
    thief.xp += xpReward;
    thief.stats.robWins += 1;
    await applyQuestProgress(thief, "robWins", 1);
    await syncRank(thief);
    description = `You slipped past ${target.username} and stole **${formatNumber(stolen)} aura**.`;
  } else {
    const fine = Math.min(thief.aura, randInt(120, 360));
    const xpLoss = randInt(40, 90);
    thief.aura = Math.max(0, thief.aura - fine);
    thief.xp = Math.max(0, thief.xp - xpLoss);
    thief.stats.robLosses += 1;
    await syncRank(thief);
    description = `You got caught trying to rob ${target.username} and paid **${formatNumber(fine)} aura** in fines.`;
  }

  await thief.save();
  await victim.save();

  return interaction.reply(buildEmbedPayload({
    title: success ? "Robbery Success" : "Robbery Failed",
    description,
    visual: success ? "emblem-success.svg" : "emblem-alert.svg",
    fields: [
      { name: "Win Rate", value: `${thief.stats.robWins}W - ${thief.stats.robLosses}L`, inline: true },
      { name: "Next Attempt", value: "20 minutes", inline: true },
      { name: "Wallet", value: `${formatNumber(thief.aura)} aura`, inline: true },
    ],
  }));
}

async function handleCraft(interaction) {
  const recipeId = interaction.options.getString("recipe", true);
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const recipe = getRecipe(recipeId);
  if (!recipe) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Recipe Not Found", description: "That crafting recipe does not exist.", visual: "emblem-alert.svg" }), ephemeral: true });
  }

  const missing = Object.entries(recipe.materials).find(([materialId, amount]) => (user.inventory.find((entry) => entry.id === materialId)?.quantity || 0) < amount);
  if (missing) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Craft Failed", description: `You need more **${getInventoryLabel(missing[0])}** to craft **${recipe.name}**.`, visual: "emblem-alert.svg" }), ephemeral: true });
  }

  Object.entries(recipe.materials).forEach(([materialId, amount]) => {
    const entry = ensureInventoryEntry(user, materialId);
    entry.quantity = Math.max(0, entry.quantity - amount);
  });

  if (recipe.result.type === "item" || recipe.result.type === "gear") {
    const item = getItem(recipe.result.id);
    addInventoryItem(user, recipe.result.id, recipe.result.quantity);
    if (item?.type === "perk" && !user.ownedPerks.includes(recipe.result.id)) {
      user.ownedPerks.push(recipe.result.id);
    }
    if (item?.type === "skill_unlock" && item.grantsSkill && !user.skills.includes(item.grantsSkill)) {
      user.skills.push(item.grantsSkill);
    }
  } else if (recipe.result.type === "crate") {
    user.crates.set(recipe.result.id, (user.crates.get(recipe.result.id) || 0) + recipe.result.quantity);
  }

  user.stats.crafts += 1;
  await syncRank(user);
  await user.save();

  const costLines = Object.entries(recipe.materials).map(([materialId, amount]) => `${getInventoryLabel(materialId)} x${amount}`).join("\n");
  return interaction.reply(buildEmbedPayload({
    title: "Crafting Complete",
    description: `You crafted **${recipe.name}**.`,
    visual: "help-skills.svg",
    fields: [
      { name: "Materials Used", value: costLines },
      { name: "Result", value: `${getInventoryLabel(recipe.result.id)} x${recipe.result.quantity}`, inline: true },
      { name: "Craft Count", value: `${formatNumber(user.stats.crafts)}`, inline: true },
    ],
  }));
}

async function handleCraftingGuide(interaction) {
  return interaction.reply(buildCraftingGuidePayload());
}

async function handleAchievements(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const available = getAvailableAchievements(user);

  if (available.length) {
    let rewardAura = 0;
    let rewardXp = 0;
    available.forEach((achievement) => {
      rewardAura += achievement.rewardAura;
      rewardXp += achievement.rewardXp;
      user.claimedAchievements.push(achievement.id);
    });
    user.aura += rewardAura;
    user.xp += rewardXp;
    await syncRank(user);
    await user.save();

    const claimedLines = available.map((achievement) => `**${achievement.name}**\n${achievement.description}`).join("\n\n");
    return interaction.reply(buildEmbedPayload({
      title: "Achievements Claimed",
      description: claimedLines,
      visual: "help-summary.svg",
      fields: [
        { name: "Aura Earned", value: `${formatNumber(rewardAura)}`, inline: true },
        { name: "XP Earned", value: `${formatNumber(rewardXp)}`, inline: true },
        { name: "Claimed", value: `${available.length} achievement(s)`, inline: true },
      ],
    }));
  }

  const lines = ACHIEVEMENTS.map((achievement) => {
    const progress = achievement.metric(user);
    const status = user.claimedAchievements.includes(achievement.id) ? "Claimed" : progress >= achievement.goal ? "Ready to claim" : `${Math.min(progress, achievement.goal)} / ${achievement.goal}`;
    return `**${achievement.name}**\n${achievement.description}\n${status}\nReward: ${formatNumber(achievement.rewardAura)} aura, ${formatNumber(achievement.rewardXp)} XP`;
  }).join("\n\n");

  return interaction.reply(buildEmbedPayload({
    title: "Achievements",
    description: lines,
    visual: "help-summary.svg",
    footer: "This command auto-claims every unlocked achievement.",
  }));
}

async function handleEvent(interaction) {
  const event = getCurrentWorldEvent();
  return interaction.reply(buildEmbedPayload({
    title: `World Event: ${event.name}`,
    description: event.description,
    visual: "help-summary.svg",
    fields: [
      { name: "Ends In", value: humanizeMs(event.endsAt - Date.now()), inline: true },
      { name: "Rotation", value: `${event.durationHours} hour cycle`, inline: true },
    ],
  }));
}

async function handleGarden(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const effects = getCombinedEffects(user);

  if (subcommand === "status") {
    const lines = user.gardenPlots.map((plot, index) => {
      if (!plot.cropId) {
        return `Plot ${index + 1}: Empty`;
      }
      const crop = getGardenCrop(plot.cropId);
      const readyAt = plot.plantedAt.getTime() + crop.growMs;
      const ready = Date.now() >= readyAt;
      return `Plot ${index + 1}: ${crop.name} - ${ready ? "Ready to harvest" : `Ready in ${humanizeMs(readyAt - Date.now())}`}`;
    }).join("\n");
    return interaction.reply(buildEmbedPayload({
      title: "Garden Status",
      description: lines,
      visual: "help-core.svg",
      footer: "Use /garden plant or /garden harvest to manage plots.",
    }));
  }

  if (subcommand === "plant") {
    const cropId = interaction.options.getString("crop", true);
    const crop = getGardenCrop(cropId);
    const plotNumber = interaction.options.getInteger("plot");
    let targetIndex = typeof plotNumber === "number" ? plotNumber - 1 : user.gardenPlots.findIndex((plot) => !plot.cropId);
    if (!crop) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Crop Missing", description: "That crop is not available.", visual: "emblem-alert.svg" }), ephemeral: true });
    }
    if (targetIndex < 0 || targetIndex >= user.gardenPlots.length) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Plot Missing", description: "Choose a valid garden plot.", visual: "emblem-alert.svg" }), ephemeral: true });
    }
    if (user.gardenPlots[targetIndex].cropId) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Plot Occupied", description: "That plot already has a crop growing.", visual: "emblem-alert.svg" }), ephemeral: true });
    }

    user.gardenPlots[targetIndex] = { cropId, plantedAt: new Date() };
    await user.save();
    return interaction.reply(buildEmbedPayload({
      title: "Crop Planted",
      description: `You planted **${crop.name}** in plot ${targetIndex + 1}.`,
      visual: "help-core.svg",
      fields: [
        { name: "Harvest In", value: humanizeMs(crop.growMs), inline: true },
      ],
    }));
  }

  const harvested = [];
  user.gardenPlots.forEach((plot, index) => {
    if (!plot.cropId) {
      return;
    }
    const crop = getGardenCrop(plot.cropId);
    const readyAt = plot.plantedAt.getTime() + crop.growMs;
    if (Date.now() < readyAt) {
      return;
    }
    const gains = Object.entries(crop.yields).map(([materialId, range]) => {
      const quantity = Math.max(1, Math.floor(randInt(range[0], range[1]) * (1 + (effects.gardenYieldBoost || 0))));
      addInventoryItem(user, materialId, quantity);
      return `${getInventoryLabel(materialId)} x${quantity}`;
    });
    harvested.push(`Plot ${index + 1}: ${crop.name}\n${gains.join(", ")}`);
    user.gardenPlots[index] = { cropId: null, plantedAt: null };
    user.stats.harvests += 1;
  });

  if (!harvested.length) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Nothing Ready", description: "Your garden plots are still growing.", visual: "emblem-alert.svg" }), ephemeral: true });
  }

  await applyQuestProgress(user, "harvests", harvested.length);
  await user.save();
  return interaction.reply(buildEmbedPayload({
    title: "Garden Harvested",
    description: harvested.join("\n\n"),
    visual: "help-core.svg",
    fields: [
      { name: "Total Harvests", value: `${formatNumber(user.stats.harvests)}`, inline: true },
    ],
  }));
}

async function handleGear(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);

  if (subcommand === "loadout") {
    const lines = Object.entries(user.equippedGear || {}).map(([slot, gearId]) => `${slot}: ${gearId ? getGearItem(gearId)?.name || gearId : "Empty"}`).join("\n");
    return interaction.reply(buildEmbedPayload({
      title: "Gear Loadout",
      description: lines,
      visual: "help-skills.svg",
      footer: "Craft gear first, then equip it here.",
    }));
  }

  const gearId = interaction.options.getString("item", true);
  const gear = getGearItem(gearId);
  if (!gear) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Gear Missing", description: "That gear item does not exist.", visual: "emblem-alert.svg" }), ephemeral: true });
  }
  const ownedQuantity = user.inventory.find((entry) => entry.id === gearId)?.quantity || 0;
  if (ownedQuantity <= 0) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Gear Not Owned", description: `You do not own **${gear.name}** yet. Craft it first.`, visual: "emblem-alert.svg" }), ephemeral: true });
  }

  user.equippedGear[gear.slot] = gearId;
  await user.save();
  return interaction.reply(buildEmbedPayload({
    title: "Gear Equipped",
    description: `You equipped **${gear.name}** in the **${gear.slot}** slot.`,
    visual: "help-skills.svg",
    fields: [
      { name: "Effect", value: gear.description },
    ],
  }));
}

async function handleSpin(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const remaining = getCooldownRemaining(user.lastSpinAt, COOLDOWNS.spinMs);
  if (remaining > 0) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Spin Cooling Down", description: `Your aura spinner will recharge in ${humanizeMs(remaining)}.`, visual: "core-arcade.svg" }), ephemeral: true });
  }

  const effects = getCombinedEffects(user);
  const baseReward = randInt(180, 540);
  const jackpot = Math.random() < 0.07 ? randInt(500, 1400) : 0;
  const reward = Math.floor((baseReward + jackpot) * (1 + (effects.spinRewardBoost || 0)));
  const xpGain = randInt(60, 120);
  user.lastSpinAt = new Date();
  user.aura += reward;
  user.xp += xpGain;
  user.stats.spins += 1;
  await applyQuestProgress(user, "spins", 1);
  await syncRank(user);
  await user.save();

  return interaction.reply(buildEmbedPayload({
    title: "Spin Complete",
    description: `The wheel landed clean. You gained **${formatNumber(reward)} aura** and **${formatNumber(xpGain)} XP**.`,
    visual: "core-arcade.svg",
    fields: [
      { name: "Jackpot", value: jackpot > 0 ? `Triggered for ${formatNumber(jackpot)} aura` : "Not this time", inline: true },
      { name: "Next Spin", value: "5 minutes", inline: true },
      { name: "Wallet", value: `${formatNumber(user.aura)} aura`, inline: true },
    ],
  }));
}

async function handleCoinflip(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const amount = interaction.options.getInteger("amount", true);
  const choice = interaction.options.getString("choice", true);
  const remaining = getCooldownRemaining(user.lastCoinflipAt, COOLDOWNS.coinflipMs);
  if (remaining > 0) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Coinflip Cooling Down", description: `You can flip again in ${humanizeMs(remaining)}.`, visual: "emblem-core-arcade.svg" }), ephemeral: true });
  }
  if (amount <= 0 || amount > user.aura) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Invalid Bet", description: "Your bet must be above 0 and within your aura wallet.", visual: "emblem-alert.svg" }), ephemeral: true });
  }

  const effects = getPerkEffects(user);
  const result = Math.random() < 0.5 ? "heads" : "tails";
  const choiceWins = choice === result || (choice !== result && Math.random() < (effects.coinflipWinBoost || 0));
  const multipliers = [{ value: 2, chance: 0.65 }, { value: 3, chance: 0.2 }, { value: 4, chance: 0.1 }, { value: 10, chance: 0.05 }];
  let multiplier = 1;
  if (choiceWins) {
    const roll = Math.random();
    let cumulative = 0;
    for (const entry of multipliers) {
      cumulative += entry.chance;
      if (roll <= cumulative) {
        multiplier = entry.value;
        break;
      }
    }
  }

  user.lastCoinflipAt = new Date();
  user.aura -= amount;
  user.stats.coinflips += 1;

  let xpDelta = randInt(35, 90);
  let description = `The coin landed on **${result}**. `;
  if (choiceWins) {
    const payout = amount * multiplier;
    user.aura += payout;
    description += `You called it. Your **${formatNumber(amount)} aura** turned into **${formatNumber(payout)} aura**.`;
  } else {
    xpDelta = -Math.floor(xpDelta / 2);
    description += `You missed the call and lost **${formatNumber(amount)} aura**.`;
  }

  user.xp = Math.max(0, user.xp + xpDelta);
  await applyQuestProgress(user, "coinflips", 1);
  await syncRank(user);
  await user.save();

  return interaction.reply(buildEmbedPayload({
    title: "Coinflip Resolved",
    description,
    visual: "emblem-core-arcade.svg",
    fields: [
      { name: "Choice", value: choice, inline: true },
      { name: "Multiplier", value: choiceWins ? `${multiplier}x` : "0x", inline: true },
      { name: "XP Delta", value: `${xpDelta >= 0 ? "+" : ""}${formatNumber(xpDelta)}`, inline: true },
    ],
    footer: "Coinflip cooldown: 2 minutes",
  }));
}

async function handleDaily(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const remaining = getCooldownRemaining(user.lastDailyAt, COOLDOWNS.dailyMs);
  if (remaining > 0) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Daily Already Claimed", description: `Your next daily reward unlocks in ${humanizeMs(remaining)}.`, visual: "emblem-help.svg" }), ephemeral: true });
  }

  const last = user.lastDailyAt?.getTime() || 0;
  const streakContinues = Date.now() - last <= COOLDOWNS.dailyMs * 2;
  user.streak = streakContinues ? user.streak + 1 : 1;
  user.lastDailyAt = new Date();
  const auraReward = 700 + user.streak * 90 + user.prestige * 140;
  const xpReward = 180 + user.streak * 40;
  user.aura += auraReward;
  user.xp += xpReward;
  user.crates.set("common", (user.crates.get("common") || 0) + 1);
  if (user.streak % 7 === 0) {
    user.crates.set("rare", (user.crates.get("rare") || 0) + 1);
  }

  user.quests = [];
  setQuestSet(user);
  await syncRank(user);
  await user.save();

  return interaction.reply(buildEmbedPayload({
    title: "Daily Reward Claimed",
    description: `Your streak is now **${user.streak}**.`,
    visual: "emblem-success.svg",
    fields: [
      { name: "Aura", value: `${formatNumber(auraReward)}`, inline: true },
      { name: "XP", value: `${formatNumber(xpReward)}`, inline: true },
      { name: "Bonus", value: user.streak % 7 === 0 ? "Rare crate earned" : "Common crate earned", inline: true },
    ],
  }));
}

async function handleVault(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const perkEffects = getPerkEffects(user);
  const vaultPerkBonus = perkEffects.vaultInterestBoost || 0;
  const vaultRate = 0.03 + vaultPerkBonus + user.prestige * 0.005;
  const bonusLines = [
    `Base: 3.0%/hr`,
    `Perks: ${formatEffectValue(vaultPerkBonus)}/hr (cap ${formatEffectCapValue("vaultInterestBoost")}/hr)`,
    `Prestige: +${(user.prestige * 0.5).toFixed(1)}%/hr`,
  ];
  const interest = await claimVaultInterest(user);

  if (subcommand === "deposit") {
    const amount = interaction.options.getInteger("amount", true);
    if (amount <= 0 || amount > user.aura) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Vault Deposit Failed", description: "Deposit an amount inside your wallet balance.", visual: "economy-vault.svg" }), ephemeral: true });
    }
    user.aura -= amount;
    user.vaultAura += amount;
    user.stats.vaultDeposit += amount;
    await applyQuestProgress(user, "vaultDeposit", amount);
  }

  if (subcommand === "withdraw") {
    const amount = interaction.options.getInteger("amount", true);
    if (amount <= 0 || amount > user.vaultAura) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Vault Withdrawal Failed", description: "Withdraw an amount inside your vault balance.", visual: "economy-vault.svg" }), ephemeral: true });
    }
    user.vaultAura -= amount;
    user.aura += amount;
  }

  await user.save();

  return interaction.reply(buildEmbedPayload({
    title: "Vault Updated",
    description: `${interest > 0 ? `Interest added before processing: **${formatNumber(interest)} aura**.\n` : ""}Your vault is secure and compounding.`,
    visual: "economy-vault.svg",
    fields: [
      { name: "Wallet", value: `${formatNumber(user.aura)} aura`, inline: true },
      { name: "Vault", value: `${formatNumber(user.vaultAura)} aura`, inline: true },
      { name: "Current Interest", value: `${(vaultRate * 100).toFixed(1)}% per hour`, inline: true },
      { name: "Rate Breakdown", value: bonusLines.join("\n") },
    ],
  }));
}

async function handleShop(interaction) {
  const lines = SHOP_ITEMS.map((item) => `**${item.name}** - ${formatNumber(item.price)} aura\n\`${item.id}\`\n${item.description}`).join("\n\n");
  return interaction.reply(buildEmbedPayload({ title: "Aura Shop", description: lines, visual: "emblem-economy.svg", footer: "Use /buy item:<id> to purchase." }));
}

async function handleBuy(interaction) {
  const itemId = interaction.options.getString("item", true);
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const item = getItem(itemId);
  if (!item) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Item Not Found", description: "That shop item id does not exist.", visual: "emblem-alert.svg" }), ephemeral: true });
  }
  if (user.aura < item.price) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Not Enough Aura", description: "You do not have enough aura for that purchase.", visual: "emblem-economy.svg" }), ephemeral: true });
  }

  user.aura -= item.price;
  user.stats.shopBuys += 1;
  if (item.type === "perk") {
    if (!user.ownedPerks.includes(item.id)) {
      user.ownedPerks.push(item.id);
      addInventoryItem(user, item.id);
    }
  } else if (item.type === "skill_unlock") {
    if (!user.skills.includes(item.grantsSkill)) {
      user.skills.push(item.grantsSkill);
    }
    addInventoryItem(user, item.id);
  } else if (item.type === "crate") {
    user.crates.set(item.grantsCrate, (user.crates.get(item.grantsCrate) || 0) + 1);
  }

  await applyQuestProgress(user, "shopBuys", 1);
  await user.save();

  return interaction.reply(buildEmbedPayload({
    title: "Purchase Complete",
    description: `You bought **${item.name}**.`,
    visual: "emblem-success.svg",
    fields: [
      { name: "Cost", value: `${formatNumber(item.price)} aura`, inline: true },
      { name: "Wallet", value: `${formatNumber(user.aura)} aura`, inline: true },
      { name: "Type", value: item.type, inline: true },
    ],
  }));
}

async function handleInventory(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const perkLines = user.inventory.filter((item) => item.quantity > 0).length ? user.inventory.filter((item) => item.quantity > 0).map((item) => `- ${getInventoryLabel(item.id)} x${item.quantity}`).join("\n") : "No owned items yet.";
  const crateEntries = Array.from(user.crates.entries()).filter(([, count]) => count > 0);
  const crateLines = crateEntries.length ? crateEntries.map(([crateId, count]) => `- ${crateId} crate x${count}`).join("\n") : "No crates stored.";
  return interaction.reply(buildEmbedPayload({
    title: "Inventory",
    description: "Your owned perks, materials, unlocks, and unopened crates.",
    visual: "help-skills.svg",
    fields: [
      { name: "Items", value: perkLines },
      { name: "Skills", value: user.skills.map((skillId) => `- ${SKILLS[skillId]?.name || skillId}`).join("\n") || "No skills." },
      { name: "Crates", value: crateLines },
      { name: "Effect Caps", value: buildEffectCapLines() },
    ],
  }));
}

async function handleRank(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const current = RANKS[user.rankIndex];
  const next = nextRank(user.rankIndex);
  const currentXp = user.xp - current.xpRequired;
  const totalXp = Math.max(1, next.xpRequired - current.xpRequired);
  return interaction.reply(buildEmbedPayload({
    title: "Rank Progress",
    description: "Rank is based on XP, separate from aura. Losing combat can rank you down if XP falls below the threshold.",
    visual: "core-profile.svg",
    fields: [
      { name: "Current Rank", value: current.name, inline: true },
      { name: "Next Rank", value: next.name, inline: true },
      { name: "Prestige", value: `${user.prestige}`, inline: true },
      { name: "Progress", value: `${progressBar(currentXp, totalXp)}\n${formatNumber(currentXp)} / ${formatNumber(totalXp)} XP` },
    ],
  }));
}

async function handlePrestige(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const atCap = user.rankIndex === RANKS.length - 1;
  const auraCost = 10000 + user.prestige * 2500;
  if (!atCap || user.aura < auraCost) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Prestige Locked", description: `Reach **${RANKS[RANKS.length - 1].name}** and hold **${formatNumber(auraCost)} aura** to prestige.`, visual: "emblem-help.svg" }), ephemeral: true });
  }

  user.aura -= auraCost;
  user.prestige += 1;
  user.xp = 0;
  user.rankIndex = 0;
  user.skills = Array.from(new Set(["focus", ...user.skills]));
  user.crates.set("epic", (user.crates.get("epic") || 0) + 1);
  await user.save();

  return interaction.reply(buildEmbedPayload({
    title: "Prestige Complete",
    description: `You reset your rank ladder and advanced to prestige **${user.prestige}**.`,
    visual: "emblem-success.svg",
    fields: [
      { name: "Aura Cost", value: `${formatNumber(auraCost)}`, inline: true },
      { name: "Reward", value: "1 epic crate + higher future daily and vault scaling", inline: true },
    ],
  }));
}

async function handleQuests(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  setQuestSet(user);
  await user.save();
  const lines = user.quests.map((quest) => `**${quest.name}**\n${quest.description}\n${progressBar(quest.progress, quest.goal, 10)}\nReward: ${formatNumber(quest.rewardAura)} aura, ${formatNumber(quest.rewardXp)} XP`).join("\n\n");
  return interaction.reply(buildEmbedPayload({ title: "Daily Quests", description: lines, visual: "help-summary.svg", footer: "Completed quests auto-pay rewards." }));
}

async function handleCrate(interaction) {
  const type = interaction.options.getString("type", true);
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const crate = CRATES[type];
  if (!crate) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Unknown Crate", description: "That crate type is not available.", visual: "emblem-alert.svg" }), ephemeral: true });
  }
  if ((user.crates.get(type) || 0) <= 0) {
    return interaction.reply({ ...buildEmbedPayload({ title: "No Crates Available", description: `You do not own a ${type} crate.`, visual: "emblem-alert.svg" }), ephemeral: true });
  }

  user.crates.set(type, (user.crates.get(type) || 0) - 1);
  const auraReward = randInt(crate.aura[0], crate.aura[1]);
  const xpReward = randInt(crate.xp[0], crate.xp[1]);
  user.aura += auraReward;
  user.xp += xpReward;

  const bonusLines = [];
  crate.drops.forEach((drop) => {
    if (Math.random() <= drop.chance) {
      if (drop.type === "item") {
        addInventoryItem(user, drop.id);
        const item = getItem(drop.id);
        if (item?.type === "perk" && !user.ownedPerks.includes(drop.id)) {
          user.ownedPerks.push(drop.id);
        }
        if (item?.type === "skill_unlock" && item.grantsSkill && !user.skills.includes(item.grantsSkill)) {
          user.skills.push(item.grantsSkill);
        }
        bonusLines.push(item?.name || drop.id);
      } else if (drop.type === "crate") {
        user.crates.set(drop.id, (user.crates.get(drop.id) || 0) + 1);
        bonusLines.push(`${drop.id} crate`);
      }
    }
  });

  await syncRank(user);
  await user.save();

  return interaction.reply(buildEmbedPayload({
    title: `${type.toUpperCase()} Crate Opened`,
    description: "The crate burst open with progression loot.",
    visual: "emblem-success.svg",
    fields: [
      { name: "Aura", value: `${formatNumber(auraReward)}`, inline: true },
      { name: "XP", value: `${formatNumber(xpReward)}`, inline: true },
      { name: "Bonus Drops", value: bonusLines.length ? bonusLines.join(", ") : "None", inline: true },
    ],
  }));
}

function battleButtons(prefix, canUseSkill = true) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${prefix}:attack`).setLabel("Attack").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`${prefix}:guard`).setLabel("Guard").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${prefix}:skill`).setLabel("Skill").setStyle(ButtonStyle.Success).setDisabled(!canUseSkill),
      new ButtonBuilder().setCustomId(`${prefix}:finish`).setLabel("Finish").setStyle(ButtonStyle.Danger)
    ),
  ];
}

function pickBattleSkill(user) {
  const unlocked = user.skills.filter((skillId) => skillId !== "focus");
  return unlocked.length ? SKILLS[unlocked[0]] : SKILLS.focus;
}

function runTurn(attacker, defender, action) {
  let damage = 0;
  let text = "";

  if (action === "guard") {
    attacker.guard = true;
    return { damage, text: `${attacker.name} braced for the next hit.` };
  }

  if (action === "skill") {
    const skill = attacker.skill;
    if (skill.heal) {
      attacker.hp = clamp(attacker.hp + skill.heal, 0, attacker.maxHp);
      attacker.critBoost = clamp((attacker.critBoost || 0) + (skill.critBoost || 0), 0, 0.6);
      return { damage, text: `${attacker.name} focused, healed ${skill.heal}, and sharpened their next strike.` };
    }
    damage = randInt(skill.minDamage, skill.maxDamage);
    if (Math.random() < (attacker.critBoost || 0.15)) {
      damage = Math.floor(damage * 1.5);
    }
    if (defender.guard && !skill.pierceGuard) {
      damage = Math.floor(damage * 0.45);
    }
    text = `${attacker.name} used ${skill.name} for ${damage} damage.`;
  } else if (action === "finish") {
    damage = randInt(20, 34);
    if (defender.hp > defender.maxHp * 0.35) {
      damage = Math.floor(damage * 0.55);
      text = `${attacker.name} tried to finish early and only dealt ${damage}.`;
    } else {
      text = `${attacker.name} landed a finisher for ${damage}.`;
    }
  } else {
    damage = randInt(10, 18);
    if (Math.random() < (attacker.critBoost || 0.1)) {
      damage = Math.floor(damage * 1.4);
    }
    if (defender.guard) {
      damage = Math.floor(damage * 0.5);
    }
    text = `${attacker.name} attacked for ${damage} damage.`;
  }

  defender.hp = clamp(defender.hp - damage, 0, defender.maxHp);
  defender.guard = false;
  attacker.critBoost = 0;
  return { damage, text };
}

function createBattleEmbed(title, description, visual, state) {
  return buildEmbedPayload({
    title,
    description,
    visual,
    fields: [
      { name: state.playerOne.name, value: `HP: ${state.playerOne.hp}/${state.playerOne.maxHp}\n${progressBar(state.playerOne.hp, state.playerOne.maxHp, 10)}`, inline: true },
      { name: state.playerTwo.name, value: `HP: ${state.playerTwo.hp}/${state.playerTwo.maxHp}\n${progressBar(state.playerTwo.hp, state.playerTwo.maxHp, 10)}`, inline: true },
      { name: "Turn", value: state.turnId === state.playerOne.id ? state.playerOne.name : state.playerTwo.name, inline: false },
    ],
  });
}

async function finishBattle(interaction, state, winnerId) {
  activeBattles.delete(state.id);
  const first = await getOrCreatePlayer(interaction.guildId, state.playerOne.id);
  const second = state.isBoss ? null : await getOrCreatePlayer(interaction.guildId, state.playerTwo.id);
  const playerWon = state.playerOne.id === winnerId;

  if (state.isBoss) {
    if (playerWon) {
      const effects = getCombinedEffects(first);
      const auraReward = Math.floor(state.rewardAura * (1 + (effects.bossRewardBoost || 0)));
      const loot = rollCombatLoot("boss", state.playerTwo.id.replace("boss:", ""));
      first.aura += auraReward;
      first.xp += state.rewardXp;
      first.stats.bossWins += 1;
      applyCombatLoot(first, loot);
      await applyQuestProgress(first, "bossWins", 1);
      await syncRank(first);
      await first.save();
      return interaction.update({
        ...buildEmbedPayload({
          title: "Boss Defeated",
          description: `You beat **${state.playerTwo.name}** and earned boss rewards plus ${formatNumber(state.rewardXp)} XP.`,
          visual: state.visual,
          fields: [
            { name: "Aura", value: `${formatNumber(auraReward)}`, inline: true },
            { name: "Loot Drops", value: loot.length ? loot.map((entry) => entry.label).join(", ") : "None", inline: true },
          ],
        }),
        components: [],
      });
    } else {
      first.xp = Math.max(0, first.xp - Math.floor(state.rewardXp / 3));
      first.stats.bossLosses += 1;
      await syncRank(first);
      await first.save();
      return interaction.update({
        ...buildEmbedPayload({
          title: "Boss Fight Lost",
          description: "The boss held its ground. You lost XP and can challenge again any time.",
          visual: state.visual,
        }),
        components: [],
      });
    }
  }

  if (playerWon) {
    const effects = getCombinedEffects(first);
    const loot = rollCombatLoot("pvp");
    const auraReward = Math.floor(state.rewardAura * (1 + (effects.pvpRewardBoost || 0)));
    first.aura += auraReward;
    first.xp += state.rewardXp;
    second.xp = Math.max(0, second.xp - Math.floor(state.rewardXp / 2));
    first.stats.pvpWins += 1;
    second.stats.pvpLosses += 1;
    applyCombatLoot(first, loot);
    await applyQuestProgress(first, "pvpWins", 1);
    await syncRank(first);
    await syncRank(second);
    await first.save();
    await second.save();

    return interaction.update({
      ...buildEmbedPayload({
        title: "PvP Battle Finished",
        description: `**${state.playerOne.name}** won the duel and claimed ${formatNumber(auraReward)} aura plus ${formatNumber(state.rewardXp)} XP.`,
        visual: "pvp-victory.svg",
        fields: [
          { name: "Loot Drops", value: loot.length ? loot.map((entry) => entry.label).join(", ") : "None", inline: true },
        ],
      }),
      components: [],
    });
  } else {
    const effects = getCombinedEffects(second);
    const loot = rollCombatLoot("pvp");
    const auraReward = Math.floor(state.rewardAura * (1 + (effects.pvpRewardBoost || 0)));
    second.aura += auraReward;
    second.xp += state.rewardXp;
    first.xp = Math.max(0, first.xp - Math.floor(state.rewardXp / 2));
    second.stats.pvpWins += 1;
    first.stats.pvpLosses += 1;
    applyCombatLoot(second, loot);
    await applyQuestProgress(second, "pvpWins", 1);
    await syncRank(first);
    await syncRank(second);
    await first.save();
    await second.save();

    return interaction.update({
      ...buildEmbedPayload({
        title: "PvP Battle Finished",
        description: `**${state.playerTwo.name}** won the duel and claimed ${formatNumber(auraReward)} aura plus ${formatNumber(state.rewardXp)} XP.`,
        visual: "pvp-victory.svg",
        fields: [
          { name: "Loot Drops", value: loot.length ? loot.map((entry) => entry.label).join(", ") : "None", inline: true },
        ],
      }),
      components: [],
    });
  }
}

async function handleBattleInteraction(interaction) {
  const [battleId, action] = interaction.customId.split(":");
  const state = activeBattles.get(battleId);
  if (!state) {
    return interaction.reply({ content: "That battle session has expired.", ephemeral: true });
  }
  if (interaction.user.id !== state.turnId) {
    return interaction.reply({ content: "It is not your turn yet.", ephemeral: true });
  }

  const acting = state.playerOne.id === interaction.user.id ? state.playerOne : state.playerTwo;
  const defending = acting.id === state.playerOne.id ? state.playerTwo : state.playerOne;
  const playerResult = runTurn(acting, defending, action);
  let summary = playerResult.text;

  if (defending.hp <= 0) {
    return finishBattle(interaction, state, acting.id);
  }

  if (state.isBoss) {
    const bossResult = runTurn(defending, acting, "attack");
    summary += `\n${bossResult.text}`;
    if (acting.hp <= 0) {
      return finishBattle(interaction, state, defending.id);
    }
  } else {
    state.turnId = defending.id;
  }

  return interaction.update({
    ...createBattleEmbed(state.title, summary, state.visual, state),
    components: battleButtons(state.id, Boolean(acting.skill)),
  });
}

async function handlePvp(interaction) {
  const opponent = interaction.options.getUser("user", true);
  if (opponent.id === interaction.user.id || opponent.bot) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Invalid Opponent", description: "Choose another human player for PvP.", visual: "emblem-pvp.svg" }), ephemeral: true });
  }
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const rival = await getOrCreatePlayer(interaction.guildId, opponent.id);
  const battleId = crypto.randomUUID();
  const state = {
    id: battleId,
    title: "PvP Duel",
    isBoss: false,
    visual: "pvp-battle.svg",
    playerOne: { id: interaction.user.id, name: interaction.user.username, hp: 100, maxHp: 100, skill: pickBattleSkill(user) },
    playerTwo: { id: opponent.id, name: opponent.username, hp: 100, maxHp: 100, skill: pickBattleSkill(rival) },
    turnId: interaction.user.id,
    rewardAura: randInt(750, 1250),
    rewardXp: randInt(220, 340),
  };
  activeBattles.set(battleId, state);
  return interaction.reply({
    ...createBattleEmbed("PvP Duel Started", `${interaction.user.username} challenged ${opponent.username}.`, "pvp-challenge.svg", state),
    components: battleButtons(battleId, true),
  });
}

async function handleBoss(interaction) {
  const bossId = interaction.options.getString("boss") || BOSSES[0].id;
  const boss = BOSSES.find((entry) => entry.id === bossId) || BOSSES[0];
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const battleId = crypto.randomUUID();
  const state = {
    id: battleId,
    title: "Boss Encounter",
    isBoss: true,
    visual: boss.visual,
    playerOne: { id: interaction.user.id, name: interaction.user.username, hp: 120, maxHp: 120, skill: pickBattleSkill(user) },
    playerTwo: { id: `boss:${boss.id}`, name: boss.name, hp: boss.hp, maxHp: boss.hp, skill: { ...SKILLS.focus, heal: 0 }, critBoost: 0.12 },
    turnId: interaction.user.id,
    rewardAura: boss.rewardAura,
    rewardXp: boss.rewardXp,
  };
  activeBattles.set(battleId, state);
  return interaction.reply({
    ...createBattleEmbed("Boss Encounter", `You challenged **${boss.name}**.\n${getBossCraftingHint(boss)}`, boss.visual, state),
    components: battleButtons(battleId, true),
  });
}

async function handleSkills(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const lines = user.skills.map((skillId) => `**${SKILLS[skillId].name}**\n${SKILLS[skillId].description}`).join("\n\n");
  return interaction.reply(buildEmbedPayload({ title: "Skills", description: lines, visual: "help-skills.svg", footer: "Unlock more skill actions from the shop and crates." }));
}

async function handleHelp(interaction) {
  const categoryId = interaction.options.getString("category");

  if (categoryId) {
    const section = getHelpSection(categoryId);
    if (!section) {
      return interaction.reply({ content: "Unknown help category.", ephemeral: true });
    }

    return interaction.reply({
      ...buildEmbedPayload({
        title: `${section.name} Commands`,
        description: formatHelpSection(section),
        visual: section.visual,
        footer: "Use /setup for a recommended progression path.",
      }),
      ephemeral: true,
    });
  }

  return interaction.reply({
    ...buildEmbedPayload({
      title: "Help Categories",
      description: "Browse commands by category instead of scrolling through one long list.",
      visual: "help-summary.svg",
      fields: [
        { name: "Categories", value: formatHelpOverview() },
        { name: "Quick Start", value: "`/start`, `/work`, `/daily`, `/profile`, `/help category:getting_started`" },
      ],
      footer: "Use /help category:<name> to open a specific command group.",
    }),
    ephemeral: true,
  });
}

async function handleSetup(interaction) {
  return interaction.reply({
    ...buildEmbedPayload({
      title: "Quick Setup Guide",
      description: "Use this path to get a fresh profile moving quickly without guessing what comes next.",
      visual: "help-core.svg",
      fields: [
        { name: "1. Create Your Save", value: "Run `/start` once to generate your profile, starter aura, and quest set." },
        { name: "2. Build Income", value: "Use `/daily`, `/work`, `/spin`, and `/mine` on cooldown to stack aura, XP, and crafting resources." },
        { name: "3. Grow Side Systems", value: "Plant crops with `/garden plant`, then harvest them later for extra materials and progression." },
        { name: "4. Spend Intentionally", value: "Open `/shop`, craft rewards with `/craft`, and equip bonuses with `/gear equip`." },
        { name: "5. Push Progression", value: "Watch `/rank`, clear `/quests`, claim `/achievements`, and check `/event` for rotating bonuses." },
        { name: "6. Take Risks", value: "Use `/rob` for high-risk steals, practice with `/boss`, and duel with `/pvp` when your build is stronger." },
        { name: "7. Build a Clan", value: "Create a clan once you can afford the 50,000 aura cost and start funding upgrades, wars, and raids." },
      ],
      footer: "Use /help to see the full command list.",
    }),
    ephemeral: true,
  });
}

async function handleLeaderboard(interaction) {
  const category = interaction.options.getString("category", true);
  if (category === "clans") {
    const clans = await Clan.find({ guildId: interaction.guildId }).sort({ trophies: -1 }).limit(10);
    const lines = clans.length ? clans.map((clan, index) => `${index + 1}. **${clan.name}** - ${formatNumber(clan.trophies)} trophies - ${clan.memberIds.length} members`).join("\n") : "No clans created yet.";
    return interaction.reply(buildEmbedPayload({ title: "Clan Leaderboard", description: lines, visual: "clan-top.svg" }));
  }

  const sortMap = { aura: { aura: -1 }, xp: { xp: -1 }, prestige: { prestige: -1, xp: -1 }, vault: { vaultAura: -1 } };
  const users = await User.find({ guildId: interaction.guildId }).sort(sortMap[category] || { aura: -1 }).limit(10);
  const members = await Promise.all(users.map(async (player) => {
    const member = await interaction.client.users.fetch(player.userId).catch(() => null);
    return { player, name: member?.username || player.userId };
  }));
  const lines = members.map((entry, index) => {
    const value = category === "xp" ? `${formatNumber(entry.player.xp)} XP` : category === "prestige" ? `${entry.player.prestige} prestige` : category === "vault" ? `${formatNumber(entry.player.vaultAura)} vault aura` : `${formatNumber(entry.player.aura)} aura`;
    return `${index + 1}. **${entry.name}** - ${value}`;
  }).join("\n");
  return interaction.reply(buildEmbedPayload({ title: "Player Leaderboard", description: lines || "No player data yet.", visual: "help-summary.svg" }));
}

async function handleClan(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const clanCreateCost = 50000;
  const clanRaidCooldownMs = 45 * 60 * 1000;

  if (subcommand === "create") {
    if (user.clanId) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Already In Clan", description: "Leave your current clan before creating another one.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    if (user.aura < clanCreateCost) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Clan Creation Locked", description: `Creating a clan costs **${formatNumber(clanCreateCost)} aura**. Keep farming and try again.`, visual: "clan-hall.svg" }), ephemeral: true });
    }
    const name = interaction.options.getString("name", true);
    const code = name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) + randInt(10, 99);
    const clan = await Clan.create({ guildId: interaction.guildId, name, code, ownerId: interaction.user.id, memberIds: [interaction.user.id] });
    addClanLog(clan, "create", interaction.user.id, `Created the clan with invite code ${code}.`);
    user.aura -= clanCreateCost;
    user.clanId = clan._id;
    await clan.save();
    await user.save();
    return interaction.reply(buildEmbedPayload({
      title: "Clan Created",
      description: `**${name}** is live. Invite code: **${code}**`,
      visual: "clan-hall.svg",
      fields: [
        { name: "Creation Cost", value: `${formatNumber(clanCreateCost)} aura`, inline: true },
        { name: "Wallet Left", value: `${formatNumber(user.aura)} aura`, inline: true },
      ],
    }));
  }

  if (subcommand === "join") {
    if (user.clanId) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Already In Clan", description: "Leave your current clan before joining another one.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    const code = interaction.options.getString("code", true);
    const clan = await Clan.findOne({ guildId: interaction.guildId, code });
    if (!clan) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Clan Not Found", description: "That clan invite code is invalid.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    ensureClanState(clan);
    if (clan.memberIds.length >= getClanMemberCap(clan)) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Clan Full", description: "That clan has reached its member cap. Upgrade the hall to invite more players.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    if (!clan.memberIds.includes(interaction.user.id)) {
      clan.memberIds.push(interaction.user.id);
    }
    clan.pendingApplicantIds = clan.pendingApplicantIds.filter((id) => id !== interaction.user.id);
    addClanLog(clan, "join", interaction.user.id, "Joined through the clan invite code.");
    user.clanId = clan._id;
    await clan.save();
    await user.save();
    return interaction.reply(buildEmbedPayload({ title: "Clan Joined", description: `You joined **${clan.name}**.`, visual: "clan-hall.svg" }));
  }

  if (subcommand === "apply") {
    if (user.clanId) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Already In Clan", description: "Leave your current clan before applying to another one.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    const code = interaction.options.getString("code", true);
    const clan = await Clan.findOne({ guildId: interaction.guildId, code });
    if (!clan) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Clan Not Found", description: "That clan invite code is invalid.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    ensureClanState(clan);
    if (clan.memberIds.length >= getClanMemberCap(clan)) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Clan Full", description: "That clan has reached its member cap already.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    if (clan.pendingApplicantIds.includes(interaction.user.id)) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Application Pending", description: `Your request to join **${clan.name}** is already waiting for approval.`, visual: "clan-hall.svg" }), ephemeral: true });
    }

    clan.pendingApplicantIds.push(interaction.user.id);
    addClanLog(clan, "apply", interaction.user.id, "Submitted a clan join request.");
    await clan.save();
    return interaction.reply(buildEmbedPayload({
      title: "Clan Application Sent",
      description: `Your request to join **${clan.name}** has been submitted to the clan leaders.`,
      visual: "clan-hall.svg",
    }));
  }

  if (subcommand === "leave") {
    if (!user.clanId) {
      return interaction.reply({ ...buildEmbedPayload({ title: "No Clan", description: "You are not in a clan right now.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    const clan = await Clan.findById(user.clanId);
    if (clan) {
      if (clan.ownerId === interaction.user.id && clan.memberIds.length > 1) {
        return interaction.reply({ ...buildEmbedPayload({ title: "Owner Cannot Leave Yet", description: "Kick or transfer out the other members before the clan owner leaves.", visual: "clan-hall.svg" }), ephemeral: true });
      }
      clan.memberIds = clan.memberIds.filter((id) => id !== interaction.user.id);
      clan.officerIds = clan.officerIds.filter((id) => id !== interaction.user.id);
      addClanLog(clan, "leave", interaction.user.id, "Left the clan.");
      if (clan.memberIds.length === 0) {
        await Clan.deleteOne({ _id: clan._id });
      } else {
        await clan.save();
      }
    }
    user.clanId = null;
    await user.save();
    return interaction.reply(buildEmbedPayload({ title: "Clan Left", description: "You left your clan.", visual: "clan-hall.svg" }));
  }

  if (!user.clanId) {
    return interaction.reply({ ...buildEmbedPayload({ title: "No Clan", description: "Create or join a clan first.", visual: "clan-hall.svg" }), ephemeral: true });
  }

  const clan = await Clan.findById(user.clanId);
  if (!clan) {
    user.clanId = null;
    await user.save();
    return interaction.reply({ ...buildEmbedPayload({ title: "Clan Missing", description: "Your clan record was missing and has been reset.", visual: "clan-hall.svg" }), ephemeral: true });
  }
  ensureClanState(clan);
  const vaultCapacity = getClanVaultCapacity(clan);
  const memberCap = getClanMemberCap(clan);
  const isOwner = clan.ownerId === interaction.user.id;
  const isManager = isClanOfficer(clan, interaction.user.id);

  if (subcommand === "info") {
    const owner = await interaction.client.users.fetch(clan.ownerId).catch(() => null);
    return interaction.reply(buildEmbedPayload({
      title: `${clan.name} Clan Hall`,
      description: `Invite code: **${clan.code}**`,
      visual: "clan-hall.svg",
      fields: [
        { name: "Owner", value: owner?.username || clan.ownerId, inline: true },
        { name: "Level", value: `${clan.level}`, inline: true },
        { name: "Members", value: `${clan.memberIds.length}`, inline: true },
        { name: "Member Cap", value: `${memberCap}`, inline: true },
        { name: "Vault", value: `${formatNumber(clan.vaultAura)} aura`, inline: true },
        { name: "Vault Capacity", value: `${formatNumber(vaultCapacity)} aura`, inline: true },
        { name: "Trophies", value: `${formatNumber(clan.trophies)}`, inline: true },
        { name: "Upgrades", value: `Hall ${clan.upgrades.hall} | Vault ${clan.upgrades.vault} | Arsenal ${clan.upgrades.arsenal}` },
        { name: "Officers", value: `${clan.officerIds.length}`, inline: true },
        { name: "Pending Applications", value: `${clan.pendingApplicantIds.length}`, inline: true },
        { name: "Raid Record", value: `${clan.raidWins}W - ${clan.raidLosses}L`, inline: true },
        { name: "War Record", value: `${clan.wins}W - ${clan.losses}L`, inline: true },
      ],
    }));
  }

  if (subcommand === "members") {
    const members = await Promise.all(clan.memberIds.map(async (memberId) => {
      const member = await interaction.client.users.fetch(memberId).catch(() => null);
      const label = member?.username || memberId;
      return `${label} (${getClanRoleLabel(clan, memberId)})`;
    }));

    return interaction.reply(buildEmbedPayload({
      title: `${clan.name} Members`,
      description: members.length ? members.map((memberName, index) => `${index + 1}. ${memberName}`).join("\n") : "No members found.",
      visual: "clan-hall.svg",
      footer: `Total members: ${clan.memberIds.length}`,
    }));
  }

  if (subcommand === "log") {
    return interaction.reply(buildEmbedPayload({
      title: `${clan.name} Activity Log`,
      description: await formatClanLogEntries(interaction, clan),
      visual: "help-clans.svg",
      footer: "Showing up to the 20 most recent clan events.",
    }));
  }

  if (subcommand === "kick") {
    if (!isManager) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Leader Only", description: "Only the clan owner or officers can kick members.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    const target = interaction.options.getUser("user", true);
    if (target.id === clan.ownerId) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Kick Blocked", description: "The clan owner cannot kick themselves.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    if (!isOwner && clan.officerIds.includes(target.id)) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Kick Blocked", description: "Only the clan owner can remove another officer.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    if (!clan.memberIds.includes(target.id)) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Member Not Found", description: "That user is not in your clan.", visual: "clan-hall.svg" }), ephemeral: true });
    }

    clan.memberIds = clan.memberIds.filter((id) => id !== target.id);
    clan.officerIds = clan.officerIds.filter((id) => id !== target.id);
    const targetProfile = await getOrCreatePlayer(interaction.guildId, target.id);
    targetProfile.clanId = null;
    addClanLog(clan, "kick", interaction.user.id, "Removed a clan member.", target.id);
    await clan.save();
    await targetProfile.save();
    return interaction.reply(buildEmbedPayload({
      title: "Member Removed",
      description: `${target.username} was removed from **${clan.name}**.`,
      visual: "clan-hall.svg",
      footer: `Members left: ${clan.memberIds.length}`,
    }));
  }

  if (subcommand === "approve") {
    if (!isManager) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Leader Only", description: "Only the clan owner or officers can approve applicants.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    const target = interaction.options.getUser("user", true);
    if (!clan.pendingApplicantIds.includes(target.id)) {
      return interaction.reply({ ...buildEmbedPayload({ title: "No Application Found", description: "That user does not have a pending clan application.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    if (clan.memberIds.length >= memberCap) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Clan Full", description: "Upgrade the hall before approving more members.", visual: "clan-hall.svg" }), ephemeral: true });
    }

    const targetProfile = await getOrCreatePlayer(interaction.guildId, target.id);
    if (targetProfile.clanId && String(targetProfile.clanId) !== String(clan._id)) {
      clan.pendingApplicantIds = clan.pendingApplicantIds.filter((id) => id !== target.id);
      await clan.save();
      return interaction.reply({ ...buildEmbedPayload({ title: "Approval Failed", description: "That player already joined a different clan.", visual: "clan-hall.svg" }), ephemeral: true });
    }

    clan.pendingApplicantIds = clan.pendingApplicantIds.filter((id) => id !== target.id);
    if (!clan.memberIds.includes(target.id)) {
      clan.memberIds.push(target.id);
    }
    targetProfile.clanId = clan._id;
    addClanLog(clan, "approve", interaction.user.id, "Approved a pending clan application.", target.id);
    await clan.save();
    await targetProfile.save();
    return interaction.reply(buildEmbedPayload({
      title: "Applicant Approved",
      description: `${target.username} has joined **${clan.name}**.`,
      visual: "clan-hall.svg",
      footer: `Members: ${clan.memberIds.length} / ${memberCap}`,
    }));
  }

  if (subcommand === "decline") {
    if (!isManager) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Leader Only", description: "Only the clan owner or officers can decline applicants.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    const target = interaction.options.getUser("user", true);
    if (!clan.pendingApplicantIds.includes(target.id)) {
      return interaction.reply({ ...buildEmbedPayload({ title: "No Application Found", description: "That user does not have a pending clan application.", visual: "clan-hall.svg" }), ephemeral: true });
    }

    clan.pendingApplicantIds = clan.pendingApplicantIds.filter((id) => id !== target.id);
    addClanLog(clan, "decline", interaction.user.id, "Declined a pending clan application.", target.id);
    await clan.save();
    return interaction.reply(buildEmbedPayload({
      title: "Applicant Declined",
      description: `${target.username}'s request to join **${clan.name}** was declined.`,
      visual: "clan-hall.svg",
    }));
  }

  if (subcommand === "role") {
    if (!isOwner) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Owner Only", description: "Only the clan owner can manage officer roles.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    const target = interaction.options.getUser("user", true);
    const role = interaction.options.getString("role", true);
    if (target.id === clan.ownerId) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Role Update Blocked", description: "The clan owner role is transferred with `/clan transfer`, not `/clan role`.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    if (!clan.memberIds.includes(target.id)) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Member Not Found", description: "That user is not in your clan.", visual: "clan-hall.svg" }), ephemeral: true });
    }

    if (role === "officer") {
      if (!clan.officerIds.includes(target.id)) {
        clan.officerIds.push(target.id);
      }
    } else {
      clan.officerIds = clan.officerIds.filter((id) => id !== target.id);
    }

    addClanLog(clan, "role", interaction.user.id, `Set clan role to ${role}.`, target.id);
    await clan.save();
    return interaction.reply(buildEmbedPayload({
      title: "Clan Role Updated",
      description: `${target.username} is now set to **${role === "officer" ? "Officer" : "Member"}** in **${clan.name}**.`,
      visual: "clan-hall.svg",
    }));
  }

  if (subcommand === "transfer") {
    if (!isOwner) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Owner Only", description: "Only the current clan owner can transfer leadership.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    const target = interaction.options.getUser("user", true);
    if (target.id === clan.ownerId) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Transfer Blocked", description: "That user already owns the clan.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    if (!clan.memberIds.includes(target.id)) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Member Not Found", description: "Transfer leadership only to an existing clan member.", visual: "clan-hall.svg" }), ephemeral: true });
    }

    clan.ownerId = target.id;
    clan.officerIds = clan.officerIds.filter((id) => id !== target.id);
    addClanLog(clan, "transfer", interaction.user.id, "Transferred clan ownership.", target.id);
    await clan.save();
    return interaction.reply(buildEmbedPayload({
      title: "Leadership Transferred",
      description: `${target.username} is now the owner of **${clan.name}**.`,
      visual: "clan-hall.svg",
    }));
  }

  if (subcommand === "disband") {
    if (!isOwner) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Owner Only", description: "Only the clan owner can disband the clan.", visual: "clan-hall.svg" }), ephemeral: true });
    }

    await User.updateMany({ guildId: interaction.guildId, clanId: clan._id }, { $set: { clanId: null } });
    await Clan.deleteOne({ _id: clan._id });
    user.clanId = null;
    await user.save();
    return interaction.reply(buildEmbedPayload({
      title: "Clan Disbanded",
      description: `**${clan.name}** was disbanded and all members were released.`,
      visual: "clan-hall.svg",
    }));
  }

  if (subcommand === "donate") {
    const amount = interaction.options.getInteger("amount", true);
    if (amount <= 0 || amount > user.aura) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Donation Failed", description: "Donate an amount inside your wallet balance.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    const spaceRemaining = Math.max(0, vaultCapacity - clan.vaultAura);
    if (spaceRemaining <= 0) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Clan Vault Full", description: "Upgrade the vault before depositing more aura.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    if (amount > spaceRemaining) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Donation Too Large", description: `Your clan vault only has room for **${formatNumber(spaceRemaining)} aura** right now.`, visual: "clan-hall.svg" }), ephemeral: true });
    }
    user.aura -= amount;
    clan.vaultAura += amount;
    addClanLog(clan, "donate", interaction.user.id, `Donated ${formatNumber(amount)} aura to the clan vault.`);
    await user.save();
    await clan.save();
    return interaction.reply(buildEmbedPayload({
      title: "Clan Donation Sent",
      description: `You donated ${formatNumber(amount)} aura to **${clan.name}**.`,
      visual: "clan-hall.svg",
      fields: [
        { name: "Clan Vault", value: `${formatNumber(clan.vaultAura)} / ${formatNumber(vaultCapacity)}`, inline: true },
      ],
    }));
  }

  if (subcommand === "upgrade") {
    if (!isOwner) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Owner Only", description: "Only the clan owner can buy clan upgrades.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    const path = interaction.options.getString("path", true);
    const cost = getClanUpgradeCost(clan, path);
    if (clan.vaultAura < cost) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Upgrade Locked", description: `Your clan vault needs **${formatNumber(cost)} aura** for that upgrade.`, visual: "clan-hall.svg" }), ephemeral: true });
    }

    clan.vaultAura -= cost;
    clan.upgrades[path] += 1;
    if (path === "hall") {
      clan.level += 1;
    }
    addClanLog(clan, "upgrade", interaction.user.id, `Upgraded ${path} for ${formatNumber(cost)} aura.`);
    await clan.save();
    return interaction.reply(buildEmbedPayload({
      title: "Clan Upgrade Complete",
      description: `**${path}** was upgraded for **${formatNumber(cost)} aura**.`,
      visual: "clan-top.svg",
      fields: [
        { name: "New Level", value: path === "hall" ? `${clan.level}` : `${clan.upgrades[path]}`, inline: true },
        { name: "Vault Left", value: `${formatNumber(clan.vaultAura)} aura`, inline: true },
      ],
    }));
  }

  if (subcommand === "raid") {
    const remaining = getCooldownRemaining(clan.lastRaidAt, clanRaidCooldownMs);
    if (remaining > 0) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Raid Cooling Down", description: `Your clan can raid again in ${humanizeMs(remaining)}.`, visual: "clan-war.svg" }), ephemeral: true });
    }

    const clanPower = getClanPower(clan) + randInt(20, 120);
    const enemyPower = clan.level * 95 + clan.upgrades.arsenal * 65 + randInt(80, 220);
    const won = clanPower >= enemyPower;
    const auraReward = randInt(2500, 7000) + clan.upgrades.hall * 400 + clan.upgrades.arsenal * 550;
    const trophyReward = randInt(15, 35) + clan.upgrades.arsenal * 3;
    const xpReward = randInt(180, 360) + clan.level * 40;
    clan.lastRaidAt = new Date();

    if (won) {
      clan.raidWins += 1;
      clan.trophies += trophyReward;
      clan.vaultAura = Math.min(vaultCapacity, clan.vaultAura + auraReward);
      user.xp += xpReward;
      await syncRank(user);
    } else {
      clan.raidLosses += 1;
      clan.trophies = Math.max(0, clan.trophies - Math.floor(trophyReward / 2));
      user.xp = Math.max(0, user.xp - Math.floor(xpReward / 3));
      await syncRank(user);
    }

    addClanLog(clan, "raid", interaction.user.id, won ? `Won a clan raid for ${formatNumber(auraReward)} aura and ${formatNumber(trophyReward)} trophies.` : `Lost a clan raid and dropped ${formatNumber(Math.floor(trophyReward / 2))} trophies.`);
    await clan.save();
    await user.save();
    return interaction.reply(buildEmbedPayload({
      title: won ? "Clan Raid Victory" : "Clan Raid Failed",
      description: won ? `**${clan.name}** cleared the raid and hauled back supplies.` : `**${clan.name}** was pushed back during the raid attempt.`,
      visual: "clan-war.svg",
      fields: [
        { name: "Clan Power", value: `${formatNumber(clanPower)}`, inline: true },
        { name: "Enemy Power", value: `${formatNumber(enemyPower)}`, inline: true },
        { name: "Trophies", value: `${won ? "+" : "-"}${formatNumber(won ? trophyReward : Math.floor(trophyReward / 2))}`, inline: true },
        { name: "Clan Vault", value: won ? `${formatNumber(clan.vaultAura)} / ${formatNumber(vaultCapacity)}` : `${formatNumber(clan.vaultAura)} / ${formatNumber(vaultCapacity)}`, inline: true },
        { name: "Your XP", value: `${won ? "+" : "-"}${formatNumber(won ? xpReward : Math.floor(xpReward / 3))}`, inline: true },
      ],
      footer: won ? `Vault reward added up to capacity. Raid aura rolled: ${formatNumber(auraReward)}.` : "Regroup, upgrade, and try again after the cooldown.",
    }));
  }

  if (subcommand === "war") {
    const enemyCode = interaction.options.getString("enemy", true);
    const enemy = await Clan.findOne({ guildId: interaction.guildId, code: enemyCode });
    if (!enemy || String(enemy._id) === String(clan._id)) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Invalid Rival Clan", description: "Choose a different valid clan code.", visual: "clan-war.svg" }), ephemeral: true });
    }
    ensureClanState(enemy);
    const clanPower = getClanPower(clan) + randInt(20, 100);
    const enemyPower = getClanPower(enemy) + randInt(20, 100);
    const won = clanPower >= enemyPower;
    const trophySwing = randInt(12, 28);
    const auraSwing = randInt(400, 1000);
    const enemyVaultCapacity = getClanVaultCapacity(enemy);

    if (won) {
      clan.trophies += trophySwing;
      clan.wins += 1;
      enemy.trophies = Math.max(0, enemy.trophies - Math.floor(trophySwing / 2));
      enemy.losses += 1;
      clan.vaultAura = Math.min(vaultCapacity, clan.vaultAura + auraSwing);
      addClanLog(clan, "war", interaction.user.id, `Defeated ${enemy.name} and gained ${formatNumber(trophySwing)} trophies.`);
      addClanLog(enemy, "war", interaction.user.id, `Lost a war against ${clan.name}.`);
    } else {
      enemy.trophies += trophySwing;
      enemy.wins += 1;
      clan.trophies = Math.max(0, clan.trophies - Math.floor(trophySwing / 2));
      clan.losses += 1;
      enemy.vaultAura = Math.min(enemyVaultCapacity, enemy.vaultAura + Math.floor(auraSwing / 2));
      addClanLog(clan, "war", interaction.user.id, `Lost a war against ${enemy.name}.`);
      addClanLog(enemy, "war", interaction.user.id, `Defeated ${clan.name} and gained ${formatNumber(trophySwing)} trophies.`);
    }

    await clan.save();
    await enemy.save();
    return interaction.reply(buildEmbedPayload({
      title: "Clan War Resolved",
      description: won ? `**${clan.name}** beat **${enemy.name}**.` : `**${clan.name}** fell to **${enemy.name}**.`,
      visual: "clan-war.svg",
      fields: [
        { name: "Trophies", value: `${won ? "+" : "-"}${formatNumber(trophySwing)}`, inline: true },
        { name: "Clan Vault", value: won ? `+${formatNumber(auraSwing)} aura` : "No aura captured", inline: true },
      ],
    }));
  }

  return interaction.reply({ content: "Unsupported clan command.", ephemeral: true });
}

async function handleAuthority(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  if (user.rankIndex < 2) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Authority Locked", description: "You need rank Warden or higher to use rank-only commands.", visual: "emblem-alert.svg" }), ephemeral: true });
  }
  const remaining = getCooldownRemaining(user.lastAuthorityAt, COOLDOWNS.authorityMs);
  if (remaining > 0) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Authority Cooling Down", description: `You can use this again in ${humanizeMs(remaining)}.`, visual: "emblem-help.svg" }), ephemeral: true });
  }

  const target = interaction.options.getUser("user", true);
  const targetProfile = await getOrCreatePlayer(interaction.guildId, target.id);
  const auraGain = 150 + user.rankIndex * 50;
  const xpGain = 100 + user.rankIndex * 35;
  targetProfile.aura += auraGain;
  targetProfile.xp += xpGain;
  user.lastAuthorityAt = new Date();
  await syncRank(targetProfile);
  await targetProfile.save();
  await user.save();

  return interaction.reply(buildEmbedPayload({
    title: "Rank Blessing Used",
    description: `${interaction.user.username} blessed ${target.username} with rank authority.`,
    visual: "emblem-success.svg",
    fields: [
      { name: "Aura Granted", value: `${formatNumber(auraGain)}`, inline: true },
      { name: "XP Granted", value: `${formatNumber(xpGain)}`, inline: true },
      { name: "Requirement", value: "Rank-only command", inline: true },
    ],
  }));
}

function buildCommands() {
  return [
    new SlashCommandBuilder().setName("help").setDescription("Browse game commands by category.").addStringOption((option) => option.setName("category").setDescription("Open one help category").addChoices(...HELP_SECTIONS.map((section) => ({ name: section.name, value: section.id })))),
    new SlashCommandBuilder().setName("event").setDescription("View the current rotating world event."),
    new SlashCommandBuilder().setName("setup").setDescription("Show a recommended setup and progression path."),
    new SlashCommandBuilder().setName("start").setDescription("Create your save and unlock the game."),
    new SlashCommandBuilder().setName("profile").setDescription("View your or another player's profile.").addUserOption((option) => option.setName("user").setDescription("Optional target")),
    new SlashCommandBuilder().setName("stats").setDescription("View deeper player stats.").addUserOption((option) => option.setName("user").setDescription("Optional target")),
    new SlashCommandBuilder().setName("work").setDescription("Complete a shift for steady aura and XP."),
    new SlashCommandBuilder().setName("mine").setDescription("Gather crafting materials on a cooldown."),
    new SlashCommandBuilder().setName("spin").setDescription("Spin for aura every 5 minutes."),
    new SlashCommandBuilder().setName("coinflip").setDescription("Bet aura on heads or tails every 2 minutes.").addIntegerOption((option) => option.setName("amount").setDescription("Aura to bet").setRequired(true).setMinValue(1)).addStringOption((option) => option.setName("choice").setDescription("Choose heads or tails").setRequired(true).addChoices({ name: "heads", value: "heads" }, { name: "tails", value: "tails" })),
    new SlashCommandBuilder().setName("rob").setDescription("Attempt to steal aura from another player.").addUserOption((option) => option.setName("user").setDescription("Target player").setRequired(true)),
    new SlashCommandBuilder().setName("daily").setDescription("Claim your daily streak reward."),
    new SlashCommandBuilder().setName("vault").setDescription("Manage your aura vault.").addSubcommand((sub) => sub.setName("deposit").setDescription("Deposit aura.").addIntegerOption((option) => option.setName("amount").setDescription("Amount").setRequired(true).setMinValue(1))).addSubcommand((sub) => sub.setName("withdraw").setDescription("Withdraw aura.").addIntegerOption((option) => option.setName("amount").setDescription("Amount").setRequired(true).setMinValue(1))).addSubcommand((sub) => sub.setName("interest").setDescription("Claim accumulated vault interest.")),
    new SlashCommandBuilder().setName("shop").setDescription("Browse shop items and perks."),
    new SlashCommandBuilder().setName("buy").setDescription("Buy an item from the shop.").addStringOption((option) => option.setName("item").setDescription("Item id").setRequired(true)),
    new SlashCommandBuilder().setName("gift").setDescription("Send aura to another player.").addUserOption((option) => option.setName("user").setDescription("Receiving player").setRequired(true)).addIntegerOption((option) => option.setName("amount").setDescription("Aura to send").setRequired(true).setMinValue(1)),
    new SlashCommandBuilder().setName("inventory").setDescription("View your items, perks, skills, and crates."),
    new SlashCommandBuilder().setName("craft").setDescription("Craft something from mined materials.").addStringOption((option) => option.setName("recipe").setDescription("Recipe id").setRequired(true).addChoices(...CRAFTING_RECIPES.map((recipe) => ({ name: recipe.name, value: recipe.id })))),
    new SlashCommandBuilder().setName("crafting-guide").setDescription("See which bosses feed each crafting path."),
    new SlashCommandBuilder().setName("garden").setDescription("Manage your growing garden.").addSubcommand((sub) => sub.setName("status").setDescription("View your garden plots.")).addSubcommand((sub) => sub.setName("plant").setDescription("Plant a crop in a plot.").addStringOption((option) => option.setName("crop").setDescription("Crop to plant").setRequired(true).addChoices(...Object.entries(GARDEN_CROPS).map(([cropId, crop]) => ({ name: crop.name, value: cropId })))).addIntegerOption((option) => option.setName("plot").setDescription("Optional plot number").setMinValue(1).setMaxValue(2))).addSubcommand((sub) => sub.setName("harvest").setDescription("Harvest any ready crops.")),
    new SlashCommandBuilder().setName("gear").setDescription("Manage your equipped gear.").addSubcommand((sub) => sub.setName("loadout").setDescription("View equipped gear.")).addSubcommand((sub) => sub.setName("equip").setDescription("Equip a crafted gear item.").addStringOption((option) => option.setName("item").setDescription("Gear item").setRequired(true).addChoices(...Object.entries(GEAR_ITEMS).map(([gearId, gear]) => ({ name: gear.name, value: gearId }))))),
    new SlashCommandBuilder().setName("rank").setDescription("View rank progression and prestige readiness."),
    new SlashCommandBuilder().setName("prestige").setDescription("Reset rank progression to gain prestige."),
    new SlashCommandBuilder().setName("achievements").setDescription("Claim any achievement rewards you have unlocked."),
    new SlashCommandBuilder().setName("quests").setDescription("View your daily quests."),
    new SlashCommandBuilder().setName("crate").setDescription("Open a crate.").addStringOption((option) => option.setName("type").setDescription("Crate type").setRequired(true).addChoices({ name: "common", value: "common" }, { name: "rare", value: "rare" }, { name: "epic", value: "epic" }, { name: "legendary", value: "legendary" })),
    new SlashCommandBuilder().setName("skills").setDescription("View unlocked combat skills."),
    new SlashCommandBuilder().setName("pvp").setDescription("Challenge another player to an interactive battle.").addUserOption((option) => option.setName("user").setDescription("Opponent").setRequired(true)),
    new SlashCommandBuilder().setName("boss").setDescription("Fight a boss.").addStringOption((option) => option.setName("boss").setDescription("Boss id").addChoices({ name: "ember", value: "ember" }, { name: "oracle", value: "oracle" }, { name: "warden", value: "warden" }, { name: "codex", value: "codex" })),
    new SlashCommandBuilder().setName("leaderboard").setDescription("View top players and clans.").addStringOption((option) => option.setName("category").setDescription("Leaderboard type").setRequired(true).addChoices({ name: "aura", value: "aura" }, { name: "vault", value: "vault" }, { name: "xp", value: "xp" }, { name: "prestige", value: "prestige" }, { name: "clans", value: "clans" })),
    new SlashCommandBuilder().setName("clan").setDescription("Manage your clan.").addSubcommand((sub) => sub.setName("create").setDescription("Create a clan for 50,000 aura.").addStringOption((option) => option.setName("name").setDescription("Clan name").setRequired(true))).addSubcommand((sub) => sub.setName("join").setDescription("Join a clan by code.").addStringOption((option) => option.setName("code").setDescription("Clan code").setRequired(true))).addSubcommand((sub) => sub.setName("apply").setDescription("Send a join request for approval.").addStringOption((option) => option.setName("code").setDescription("Clan code").setRequired(true))).addSubcommand((sub) => sub.setName("leave").setDescription("Leave your clan.")).addSubcommand((sub) => sub.setName("info").setDescription("View your clan.")).addSubcommand((sub) => sub.setName("members").setDescription("List clan members.")).addSubcommand((sub) => sub.setName("log").setDescription("View recent clan activity.")).addSubcommand((sub) => sub.setName("kick").setDescription("Owner-only member removal.").addUserOption((option) => option.setName("user").setDescription("Clan member").setRequired(true))).addSubcommand((sub) => sub.setName("approve").setDescription("Owner or officer request approval.").addUserOption((option) => option.setName("user").setDescription("Applicant").setRequired(true))).addSubcommand((sub) => sub.setName("decline").setDescription("Owner or officer reject an applicant.").addUserOption((option) => option.setName("user").setDescription("Applicant").setRequired(true))).addSubcommand((sub) => sub.setName("role").setDescription("Owner-only officer management.").addUserOption((option) => option.setName("user").setDescription("Clan member").setRequired(true)).addStringOption((option) => option.setName("role").setDescription("Role to set").setRequired(true).addChoices({ name: "officer", value: "officer" }, { name: "member", value: "member" }))).addSubcommand((sub) => sub.setName("transfer").setDescription("Owner-only leadership transfer.").addUserOption((option) => option.setName("user").setDescription("New owner").setRequired(true))).addSubcommand((sub) => sub.setName("disband").setDescription("Owner-only full clan deletion.")).addSubcommand((sub) => sub.setName("upgrade").setDescription("Spend clan vault aura on upgrades.").addStringOption((option) => option.setName("path").setDescription("Upgrade path").setRequired(true).addChoices({ name: "hall", value: "hall" }, { name: "vault", value: "vault" }, { name: "arsenal", value: "arsenal" }))).addSubcommand((sub) => sub.setName("raid").setDescription("Launch a cooldown-based clan raid.")).addSubcommand((sub) => sub.setName("donate").setDescription("Donate aura to your clan.").addIntegerOption((option) => option.setName("amount").setDescription("Amount").setRequired(true).setMinValue(1))).addSubcommand((sub) => sub.setName("war").setDescription("Fight another clan by code.").addStringOption((option) => option.setName("enemy").setDescription("Enemy clan code").setRequired(true))),
    new SlashCommandBuilder().setName("authority").setDescription("Rank-only blessing command.").addUserOption((option) => option.setName("user").setDescription("Target player").setRequired(true)),
  ].map((command) => command.toJSON());
}

async function routeInteraction(interaction) {
  if (interaction.isButton()) {
    return handleBattleInteraction(interaction);
  }
  if (!interaction.isChatInputCommand()) {
    return null;
  }

  const handlers = { help: handleHelp, event: handleEvent, setup: handleSetup, start: handleStart, profile: handleProfile, stats: handleStats, work: handleWork, mine: handleMine, spin: handleSpin, coinflip: handleCoinflip, rob: handleRob, daily: handleDaily, vault: handleVault, shop: handleShop, buy: handleBuy, gift: handleGift, inventory: handleInventory, craft: handleCraft, "crafting-guide": handleCraftingGuide, garden: handleGarden, gear: handleGear, rank: handleRank, prestige: handlePrestige, achievements: handleAchievements, quests: handleQuests, crate: handleCrate, skills: handleSkills, pvp: handlePvp, boss: handleBoss, leaderboard: handleLeaderboard, clan: handleClan, authority: handleAuthority };
  const handler = handlers[interaction.commandName];
  if (!handler) {
    return interaction.reply({ content: "Unknown command.", ephemeral: true });
  }
  return handler(interaction);
}

module.exports = {
  buildCommands,
  routeInteraction,
};
