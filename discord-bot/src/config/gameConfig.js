const path = require("path");

const VISUALS_DIR = path.join(__dirname, "..", "..", "visuals");

const COLORS = {
  primary: 0x69c7ff,
  success: 0x5ce1a1,
  danger: 0xff6b88,
  warning: 0xffc857,
  neutral: 0x8491a3,
};

const EFFECT_CAPS = {
  // Economy pacing: faster progression overall, but combat still has the strongest ceiling.
  spinRewardBoost: 0.5,
  vaultInterestBoost: 0.08,
  coinflipWinBoost: 0.18,
  workAuraBoost: 0.6,
  workXpBoost: 0.6,

  // Gathering: allow noticeable progression from gear/events, but keep material inflation manageable.
  mineYieldBoost: 0.7,
  mineXpBoost: 0.6,
  mineIronBonus: 4,
  gardenYieldBoost: 0.7,

  // Combat payouts: strong enough to matter, below the point where battles outscale core loops.
  bossRewardBoost: 0.55,
  pvpRewardBoost: 0.45,

  // Crates should feel like spikes, not the dominant source of income.
  crateAuraBoost: 0.3,
};

const RANKS = [
  { name: "Sprout", xpRequired: 0, rewardAura: 250, rewardCrates: { common: 1 } },
  { name: "Harvester", xpRequired: 400, rewardAura: 650, rewardCrates: { common: 1 } },
  { name: "Warden", xpRequired: 1200, rewardAura: 1100, rewardCrates: { rare: 1 } },
  { name: "Oracle", xpRequired: 2800, rewardAura: 1800, rewardCrates: { rare: 1 } },
  { name: "Mythic", xpRequired: 5600, rewardAura: 3100, rewardCrates: { epic: 1 } },
  { name: "Ascendant", xpRequired: 9500, rewardAura: 5200, rewardCrates: { epic: 1, legendary: 1 } },
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
    id: "health_vial",
    name: "Health Vial",
    price: 950,
    type: "combat",
    description: "Battle consumable. Restore 18 HP during a duel or boss fight.",
    battle: { effect: "heal", heal: 18 },
  },
  {
    id: "smoke_bomb",
    name: "Smoke Bomb",
    price: 1150,
    type: "combat",
    description: "Battle consumable. Deals light damage and leaves the target exposed.",
    battle: { effect: "smoke", damage: [4, 8], exposeTurns: 2 },
  },
  {
    id: "adrenaline_tonic",
    name: "Adrenaline Tonic",
    price: 1350,
    type: "combat",
    description: "Battle consumable. Clear bleed/exposed and boost your next attack.",
    battle: { effect: "adrenaline", critBoost: 0.22, combo: 1, clearBleed: true, clearExpose: true },
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
  {
    id: "premium_supply_drop",
    name: "Premium Supply Drop",
    price: 6800,
    type: "crate",
    grantsCrate: "rare",
    premiumOnly: true,
    description: "Premium-only rare crate bundle for faster progression.",
  },
  {
    id: "executive_badge",
    name: "Executive Badge",
    price: 4800,
    type: "perk",
    premiumOnly: true,
    description: "+10% work aura and +6% vault interest while premium is active.",
    effects: { workAuraBoost: 0.1, vaultInterestBoost: 0.06 },
  },
  {
    id: "storm_pass",
    name: "Storm Pass",
    price: 7200,
    type: "perk",
    premiumOnly: true,
    description: "+10% boss rewards and +8% PvP rewards while premium is active.",
    effects: { bossRewardBoost: 0.1, pvpRewardBoost: 0.08 },
  },
];

const SKILLS = {
  slash: {
    name: "Slash",
    description: "Deal 18-28 damage. At 2+ combo, inflicts bleed.",
    minDamage: 18,
    maxDamage: 28,
  },
  guard_break: {
    name: "Guard Break",
    description: "Deal 14-22 damage, pierce guard, and expose the target.",
    minDamage: 14,
    maxDamage: 22,
    pierceGuard: true,
  },
  focus: {
    name: "Focus",
    description: "Heal 8 HP, gain crit chance, and clear exposed or bleed.",
    heal: 8,
    critBoost: 0.2,
  },
};

const CRATES = {
  common: {
    aura: [280, 700],
    xp: [110, 220],
    drops: [
      { type: "item", id: "lucky_charm", chance: 0.08 },
      { type: "item", id: "vault_key", chance: 0.06 },
    ],
  },
  rare: {
    aura: [800, 1650],
    xp: [240, 430],
    drops: [
      { type: "item", id: "coinflip_gloves", chance: 0.12 },
      { type: "item", id: "combat_manual", chance: 0.1 },
    ],
  },
  epic: {
    aura: [1800, 3200],
    xp: [450, 850],
    drops: [
      { type: "item", id: "guardian_core", chance: 0.14 },
      { type: "crate", id: "legendary", chance: 0.06 },
    ],
  },
  legendary: {
    aura: [3400, 6200],
    xp: [900, 1500],
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
    description: "+1 guaranteed iron ore when mining. In combat: sharper strike damage.",
    effects: { mineIronBonus: 1 },
    battle: { strikeDamageBonus: 3, heavyDamageBonus: 2 },
    battleDescription: "+3 strike damage and +2 heavy damage.",
  },
  bloom_satchel: {
    name: "Bloom Satchel",
    slot: "charm",
    description: "+15% garden harvest yield. In combat: more HP and stronger healing.",
    effects: { gardenYieldBoost: 0.15 },
    battle: { maxHpBonus: 12, healBonus: 6 },
    battleDescription: "+12 max HP and +6 healing from skills/items.",
  },
  oracle_relic: {
    name: "Oracle Relic",
    slot: "relic",
    description: "+12% boss reward gain and +12% XP from work. In combat: stronger crits and finishers.",
    effects: { bossRewardBoost: 0.12, workXpBoost: 0.12 },
    battle: { critChanceBonus: 0.06, finisherBonusDamage: 6 },
    battleDescription: "+6% crit chance and +6 finisher damage.",
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
    description: "+22% boss rewards and +18% PvP aura rewards.",
    durationHours: 6,
    effects: { bossRewardBoost: 0.22, pvpRewardBoost: 0.18 },
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
    description: "Craft a spin reward perk. Best supported by Ember Tyrant ember shard drops.",
    materials: { iron_ore: 4, ember_shard: 2 },
    result: { type: "item", id: "lucky_charm", quantity: 1 },
  },
  {
    id: "vault_key_recipe",
    name: "Vault Key",
    description: "Craft a vault interest perk. Best supported by Vault Warden vault dust drops.",
    materials: { iron_ore: 2, vault_dust: 4 },
    result: { type: "item", id: "vault_key", quantity: 1 },
  },
  {
    id: "common_crate_recipe",
    name: "Common Crate",
    description: "Bundle raw resources into a progression crate. Mix Ember Tyrant shards with Vault Warden dust.",
    materials: { iron_ore: 3, ember_shard: 1, vault_dust: 1 },
    result: { type: "crate", id: "common", quantity: 1 },
  },
  {
    id: "combat_manual_recipe",
    name: "Combat Manual",
    description: "Craft a combat skill unlock. Farm Ember Tyrant and Vault Warden for the core materials.",
    materials: { iron_ore: 6, ember_shard: 4, vault_dust: 2 },
    result: { type: "item", id: "combat_manual", quantity: 1 },
  },
  {
    id: "miners_lantern_recipe",
    name: "Miner's Lantern",
    description: "Craft mining gear for deeper yields. Vault Warden dust keeps this route moving.",
    materials: { iron_ore: 5, vault_dust: 2, bloom_fiber: 2 },
    result: { type: "gear", id: "miners_lantern", quantity: 1 },
  },
  {
    id: "bloom_satchel_recipe",
    name: "Bloom Satchel",
    description: "Craft gardening gear for better harvests. Ember Tyrant helps cover the shard cost.",
    materials: { bloom_fiber: 5, ember_shard: 2, vault_dust: 1 },
    result: { type: "gear", id: "bloom_satchel", quantity: 1 },
  },
  {
    id: "oracle_relic_recipe",
    name: "Oracle Relic",
    description: "Craft a relic for late-game progression boosts. Target Oracle of Static and Codex Prime for resin-heavy progress.",
    materials: { sun_resin: 2, vault_dust: 3, ember_shard: 3 },
    result: { type: "gear", id: "oracle_relic", quantity: 1 },
  },
];

const BOSSES = [
  {
    id: "ember",
    name: "Ember Tyrant",
    hp: 110,
    attack: [10, 18],
    rewardAura: 1200,
    rewardXp: 320,
    visual: "boss-ember.svg",
    loot: {
      crateChance: { common: 0.35, rare: 0.08 },
      materials: [
        { id: "ember_shard", chance: 0.8, quantity: [2, 4] },
        { id: "iron_ore", chance: 0.45, quantity: [1, 3] },
      ],
    },
  },
  {
    id: "oracle",
    name: "Oracle of Static",
    hp: 140,
    attack: [13, 22],
    rewardAura: 1850,
    rewardXp: 470,
    visual: "boss-oracle.svg",
    loot: {
      crateChance: { common: 0.3, rare: 0.14 },
      materials: [
        { id: "sun_resin", chance: 0.55, quantity: [1, 2] },
        { id: "ember_shard", chance: 0.4, quantity: [1, 2] },
      ],
    },
  },
  {
    id: "warden",
    name: "Vault Warden",
    hp: 180,
    attack: [16, 28],
    rewardAura: 2850,
    rewardXp: 680,
    visual: "boss-warden.svg",
    loot: {
      crateChance: { common: 0.2, rare: 0.22 },
      materials: [
        { id: "vault_dust", chance: 0.85, quantity: [2, 4] },
        { id: "iron_ore", chance: 0.35, quantity: [2, 4] },
      ],
    },
  },
  {
    id: "codex",
    name: "Codex Prime",
    hp: 220,
    attack: [18, 32],
    rewardAura: 4200,
    rewardXp: 980,
    visual: "boss-codex.svg",
    loot: {
      crateChance: { rare: 0.32, epic: 0.1 },
      materials: [
        { id: "sun_resin", chance: 0.7, quantity: [1, 3] },
        { id: "vault_dust", chance: 0.6, quantity: [2, 4] },
        { id: "ember_shard", chance: 0.5, quantity: [2, 3] },
      ],
    },
  },
];

const QUEST_TEMPLATES = [
  { id: "spin_master", name: "Spin Master", description: "Use spin 3 times.", goal: 3, metric: "spins", rewardAura: 350, rewardXp: 120 },
  { id: "shift_runner", name: "Shift Runner", description: "Complete work 3 times.", goal: 3, metric: "works", rewardAura: 420, rewardXp: 130 },
  { id: "deep_digger", name: "Deep Digger", description: "Mine 3 times.", goal: 3, metric: "mines", rewardAura: 460, rewardXp: 145 },
  { id: "green_thumb", name: "Green Thumb", description: "Harvest 2 garden plots.", goal: 2, metric: "harvests", rewardAura: 520, rewardXp: 180 },
  { id: "risk_runner", name: "Risk Runner", description: "Play 2 coinflips.", goal: 2, metric: "coinflips", rewardAura: 420, rewardXp: 130 },
  { id: "shadow_hand", name: "Shadow Hand", description: "Win one robbery.", goal: 1, metric: "robWins", rewardAura: 650, rewardXp: 220 },
  { id: "vault_keeper", name: "Vault Keeper", description: "Deposit 1,000 aura into your vault.", goal: 1000, metric: "vaultDeposit", rewardAura: 500, rewardXp: 150 },
  { id: "gladiator", name: "Gladiator", description: "Win one PvP battle.", goal: 1, metric: "pvpWins", rewardAura: 900, rewardXp: 320 },
  { id: "slayer", name: "Boss Slayer", description: "Defeat one boss.", goal: 1, metric: "bossWins", rewardAura: 1150, rewardXp: 380 },
  { id: "merchant", name: "Merchant", description: "Buy 2 shop items.", goal: 2, metric: "shopBuys", rewardAura: 420, rewardXp: 120 },
];

const COOLDOWNS = {
  spinMs: 4 * 60 * 1000,
  coinflipMs: 2 * 60 * 1000,
  workMs: 12 * 60 * 1000,
  robMs: 20 * 60 * 1000,
  mineMs: 10 * 60 * 1000,
  authorityMs: 10 * 60 * 1000,
  dailyMs: 24 * 60 * 60 * 1000,
};

module.exports = {
  BOSSES,
  COLORS,
  COOLDOWNS,
  CRATES,
  CRAFTING_RECIPES,
  EFFECT_CAPS,
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
