const path = require("path");

const VISUALS_DIR = path.join(__dirname, "..", "..", "visuals");

const COLORS = {
  primary: 0x69c7ff,
  success: 0x5ce1a1,
  danger: 0xff6b88,
  warning: 0xffc857,
  neutral: 0x8491a3,
};

const RANKS = [
  { name: "Sprout", xpRequired: 0, rewardAura: 250, rewardCrates: { common: 1 } },
  { name: "Harvester", xpRequired: 500, rewardAura: 500, rewardCrates: { common: 1 } },
  { name: "Warden", xpRequired: 1500, rewardAura: 900, rewardCrates: { rare: 1 } },
  { name: "Oracle", xpRequired: 3500, rewardAura: 1500, rewardCrates: { rare: 1 } },
  { name: "Mythic", xpRequired: 7000, rewardAura: 2600, rewardCrates: { epic: 1 } },
  { name: "Ascendant", xpRequired: 12000, rewardAura: 4500, rewardCrates: { epic: 1, legendary: 1 } },
];

const SHOP_ITEMS = [
  {
    id: "lucky_charm",
    name: "Lucky Charm",
    price: 1200,
    type: "perk",
    description: "+8% better spin rewards.",
    effects: { spinRewardBoost: 0.08 },
  },
  {
    id: "vault_key",
    name: "Vault Key",
    price: 1800,
    type: "perk",
    description: "+2% vault interest rate.",
    effects: { vaultInterestBoost: 0.02 },
  },
  {
    id: "coinflip_gloves",
    name: "Coinflip Gloves",
    price: 2500,
    type: "perk",
    description: "+4% better coinflip win chance.",
    effects: { coinflipWinBoost: 0.04 },
  },
  {
    id: "combat_manual",
    name: "Combat Manual",
    price: 2200,
    type: "skill_unlock",
    description: "Unlocks the Slash skill for PvP and bosses.",
    grantsSkill: "slash",
  },
  {
    id: "guardian_core",
    name: "Guardian Core",
    price: 3200,
    type: "skill_unlock",
    description: "Unlocks the Guard Break skill for PvP and bosses.",
    grantsSkill: "guard_break",
  },
  {
    id: "common_crate",
    name: "Common Crate",
    price: 900,
    type: "crate",
    grantsCrate: "common",
    description: "Contains aura, XP, and the occasional perk.",
  },
  {
    id: "rare_crate",
    name: "Rare Crate",
    price: 2200,
    type: "crate",
    grantsCrate: "rare",
    description: "Higher payout and stronger drop table.",
  },
  {
    id: "epic_crate",
    name: "Epic Crate",
    price: 5200,
    type: "crate",
    grantsCrate: "epic",
    description: "Rare progression spike in a box.",
  },
];

const SKILLS = {
  slash: {
    name: "Slash",
    description: "Deal 18-28 damage.",
    minDamage: 18,
    maxDamage: 28,
  },
  guard_break: {
    name: "Guard Break",
    description: "Deal 14-22 damage and pierce guard.",
    minDamage: 14,
    maxDamage: 22,
    pierceGuard: true,
  },
  focus: {
    name: "Focus",
    description: "Gain crit chance and heal 8 HP.",
    heal: 8,
    critBoost: 0.2,
  },
};

const CRATES = {
  common: {
    aura: [200, 550],
    xp: [80, 180],
    drops: [
      { type: "item", id: "lucky_charm", chance: 0.08 },
      { type: "item", id: "vault_key", chance: 0.06 },
    ],
  },
  rare: {
    aura: [600, 1300],
    xp: [180, 350],
    drops: [
      { type: "item", id: "coinflip_gloves", chance: 0.12 },
      { type: "item", id: "combat_manual", chance: 0.1 },
    ],
  },
  epic: {
    aura: [1400, 2600],
    xp: [350, 700],
    drops: [
      { type: "item", id: "guardian_core", chance: 0.14 },
      { type: "crate", id: "legendary", chance: 0.06 },
    ],
  },
  legendary: {
    aura: [2800, 5000],
    xp: [750, 1200],
    drops: [
      { type: "item", id: "guardian_core", chance: 0.22 },
      { type: "item", id: "combat_manual", chance: 0.22 },
    ],
  },
};

const MATERIALS = {
  iron_ore: { name: "Iron Ore", description: "A basic ore used in sturdy crafting." },
  ember_shard: { name: "Ember Shard", description: "A warm crystal humming with unstable energy." },
  vault_dust: { name: "Vault Dust", description: "Fine residue that improves storage and profit tech." },
  bloom_fiber: { name: "Bloom Fiber", description: "Soft plant fiber gathered from your garden." },
  sun_resin: { name: "Sun Resin", description: "Golden sap with strong reactive properties." },
};

const GEAR_ITEMS = {
  miners_lantern: {
    name: "Miner's Lantern",
    slot: "tool",
    description: "+1 guaranteed iron ore when mining.",
    effects: { mineIronBonus: 1 },
  },
  bloom_satchel: {
    name: "Bloom Satchel",
    slot: "charm",
    description: "+15% garden harvest yield.",
    effects: { gardenYieldBoost: 0.15 },
  },
  oracle_relic: {
    name: "Oracle Relic",
    slot: "relic",
    description: "+8% boss reward gain and +10% XP from work.",
    effects: { bossRewardBoost: 0.08, workXpBoost: 0.1 },
  },
};

const GARDEN_CROPS = {
  ember_bloom: {
    name: "Ember Bloom",
    growMs: 45 * 60 * 1000,
    yields: { ember_shard: [1, 3], bloom_fiber: [1, 2] },
    description: "A warm flower that produces combat-focused resources.",
  },
  vault_mint: {
    name: "Vault Mint",
    growMs: 60 * 60 * 1000,
    yields: { vault_dust: [1, 3], bloom_fiber: [1, 2] },
    description: "A silver herb that improves economy and storage crafting.",
  },
  sunroot: {
    name: "Sunroot",
    growMs: 90 * 60 * 1000,
    yields: { sun_resin: [1, 2], bloom_fiber: [2, 4] },
    description: "A rare crop used for higher-end crafted gear.",
  },
};

const WORLD_EVENTS = [
  {
    id: "golden_harvest",
    name: "Golden Harvest",
    description: "+25% work aura, +25% garden yields.",
    durationHours: 6,
    effects: { workAuraBoost: 0.25, gardenYieldBoost: 0.25 },
  },
  {
    id: "deep_delve",
    name: "Deep Delve",
    description: "+35% mining drops and +20% mining XP.",
    durationHours: 6,
    effects: { mineYieldBoost: 0.35, mineXpBoost: 0.2 },
  },
  {
    id: "war_drum",
    name: "War Drum",
    description: "+15% boss rewards and +10% PvP aura rewards.",
    durationHours: 6,
    effects: { bossRewardBoost: 0.15, pvpRewardBoost: 0.1 },
  },
  {
    id: "lucky_skies",
    name: "Lucky Skies",
    description: "+12% spin rewards and +8% crate aura.",
    durationHours: 6,
    effects: { spinRewardBoost: 0.12, crateAuraBoost: 0.08 },
  },
];

const CRAFTING_RECIPES = [
  {
    id: "lucky_charm_recipe",
    name: "Lucky Charm",
    description: "Craft a spin reward perk.",
    materials: { iron_ore: 4, ember_shard: 2 },
    result: { type: "item", id: "lucky_charm", quantity: 1 },
  },
  {
    id: "vault_key_recipe",
    name: "Vault Key",
    description: "Craft a vault interest perk.",
    materials: { iron_ore: 2, vault_dust: 4 },
    result: { type: "item", id: "vault_key", quantity: 1 },
  },
  {
    id: "common_crate_recipe",
    name: "Common Crate",
    description: "Bundle raw resources into a progression crate.",
    materials: { iron_ore: 3, ember_shard: 1, vault_dust: 1 },
    result: { type: "crate", id: "common", quantity: 1 },
  },
  {
    id: "combat_manual_recipe",
    name: "Combat Manual",
    description: "Craft a combat skill unlock.",
    materials: { iron_ore: 6, ember_shard: 4, vault_dust: 2 },
    result: { type: "item", id: "combat_manual", quantity: 1 },
  },
  {
    id: "miners_lantern_recipe",
    name: "Miner's Lantern",
    description: "Craft mining gear for deeper yields.",
    materials: { iron_ore: 5, vault_dust: 2, bloom_fiber: 2 },
    result: { type: "gear", id: "miners_lantern", quantity: 1 },
  },
  {
    id: "bloom_satchel_recipe",
    name: "Bloom Satchel",
    description: "Craft gardening gear for better harvests.",
    materials: { bloom_fiber: 5, ember_shard: 2, vault_dust: 1 },
    result: { type: "gear", id: "bloom_satchel", quantity: 1 },
  },
  {
    id: "oracle_relic_recipe",
    name: "Oracle Relic",
    description: "Craft a relic for late-game progression boosts.",
    materials: { sun_resin: 2, vault_dust: 3, ember_shard: 3 },
    result: { type: "gear", id: "oracle_relic", quantity: 1 },
  },
];

const BOSSES = [
  { id: "ember", name: "Ember Tyrant", hp: 110, attack: [10, 18], rewardAura: 900, rewardXp: 240, visual: "boss-ember.svg" },
  { id: "oracle", name: "Oracle of Static", hp: 140, attack: [13, 22], rewardAura: 1400, rewardXp: 360, visual: "boss-oracle.svg" },
  { id: "warden", name: "Vault Warden", hp: 180, attack: [16, 28], rewardAura: 2200, rewardXp: 520, visual: "boss-warden.svg" },
  { id: "codex", name: "Codex Prime", hp: 220, attack: [18, 32], rewardAura: 3200, rewardXp: 760, visual: "boss-codex.svg" },
];

const QUEST_TEMPLATES = [
  { id: "spin_master", name: "Spin Master", description: "Use spin 3 times.", goal: 3, metric: "spins", rewardAura: 350, rewardXp: 120 },
  { id: "shift_runner", name: "Shift Runner", description: "Complete work 3 times.", goal: 3, metric: "works", rewardAura: 420, rewardXp: 130 },
  { id: "deep_digger", name: "Deep Digger", description: "Mine 3 times.", goal: 3, metric: "mines", rewardAura: 460, rewardXp: 145 },
  { id: "green_thumb", name: "Green Thumb", description: "Harvest 2 garden plots.", goal: 2, metric: "harvests", rewardAura: 520, rewardXp: 180 },
  { id: "risk_runner", name: "Risk Runner", description: "Play 2 coinflips.", goal: 2, metric: "coinflips", rewardAura: 420, rewardXp: 130 },
  { id: "shadow_hand", name: "Shadow Hand", description: "Win one robbery.", goal: 1, metric: "robWins", rewardAura: 520, rewardXp: 170 },
  { id: "vault_keeper", name: "Vault Keeper", description: "Deposit 1,000 aura into your vault.", goal: 1000, metric: "vaultDeposit", rewardAura: 500, rewardXp: 150 },
  { id: "gladiator", name: "Gladiator", description: "Win one PvP battle.", goal: 1, metric: "pvpWins", rewardAura: 600, rewardXp: 220 },
  { id: "slayer", name: "Boss Slayer", description: "Defeat one boss.", goal: 1, metric: "bossWins", rewardAura: 750, rewardXp: 260 },
  { id: "merchant", name: "Merchant", description: "Buy 2 shop items.", goal: 2, metric: "shopBuys", rewardAura: 420, rewardXp: 120 },
];

const COOLDOWNS = {
  spinMs: 5 * 60 * 1000,
  coinflipMs: 2 * 60 * 1000,
  workMs: 15 * 60 * 1000,
  robMs: 20 * 60 * 1000,
  mineMs: 12 * 60 * 1000,
  authorityMs: 10 * 60 * 1000,
  dailyMs: 24 * 60 * 60 * 1000,
};

module.exports = {
  BOSSES,
  COLORS,
  COOLDOWNS,
  CRATES,
  CRAFTING_RECIPES,
  GARDEN_CROPS,
  GEAR_ITEMS,
  MATERIALS,
  QUEST_TEMPLATES,
  RANKS,
  SHOP_ITEMS,
  SKILLS,
  VISUALS_DIR,
  WORLD_EVENTS,
};
