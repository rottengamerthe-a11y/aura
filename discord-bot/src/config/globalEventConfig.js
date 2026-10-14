const GLOBAL_EVENTS = {
  aura_storm: {
    id: 'aura_storm',
    name: '⚡ Aura Storm',
    description: 'A massive storm of aura energy engulfs all servers! All aura rewards are doubled.',
    durationHours: 4,
    effects: { auraMultiplier: 2.0, xpMultiplier: 1.0 },
    rarity: 'common',
    minParticipants: 0,
    icon: '⚡',
  },
  xp_festival: {
    id: 'xp_festival',
    name: '🎉 XP Festival',
    description: 'A celebration of growth! All XP gains are tripled.',
    durationHours: 3,
    effects: { auraMultiplier: 1.0, xpMultiplier: 3.0 },
    rarity: 'common',
    minParticipants: 0,
    icon: '🎉',
  },
  treasure_hunt: {
    id: 'treasure_hunt',
    name: '🗺️ Global Treasure Hunt',
    description: 'Hidden treasures appear in every server! Use /event claim to search for loot.',
    durationHours: 6,
    effects: { auraMultiplier: 1.5, xpMultiplier: 1.5 },
    rarity: 'uncommon',
    minParticipants: 0,
    claimRewards: { aura: [500, 3000], xp: [100, 500], crateChance: 0.15, crateType: 'rare' },
    maxClaims: 3,
    icon: '🗺️',
  },
  boss_invasion: {
    id: 'boss_invasion',
    name: '🐲 Boss Invasion',
    description: 'Powerful bosses invade all servers simultaneously! Defeat them for massive rewards.',
    durationHours: 8,
    effects: { auraMultiplier: 1.0, xpMultiplier: 1.0, bossRewardMultiplier: 2.5 },
    rarity: 'rare',
    minParticipants: 0,
    icon: '🐲',
  },
  crafting_bonanza: {
    id: 'crafting_bonanza',
    name: '🔨 Crafting Bonanza',
    description: 'Master crafters unite! Crafting costs are halved and material drops doubled.',
    durationHours: 5,
    effects: { auraMultiplier: 1.0, xpMultiplier: 1.0, craftCostMultiplier: 0.5, materialDropMultiplier: 2.0 },
    rarity: 'uncommon',
    minParticipants: 0,
    icon: '🔨',
  },
  double_trouble: {
    id: 'double_trouble',
    name: '💰 Double Trouble',
    description: 'EVERYTHING is doubled — aura, XP, boss rewards, and material drops!',
    durationHours: 2,
    effects: { auraMultiplier: 2.0, xpMultiplier: 2.0, bossRewardMultiplier: 2.0, materialDropMultiplier: 2.0 },
    rarity: 'legendary',
    minParticipants: 0,
    icon: '💰',
  },
};

const GLOBAL_EVENT_SCHEDULE = {
  minIntervalHours: 6,
  maxIntervalHours: 18,
  weekendBoost: true, // events spawn more frequently on weekends
  weekendIntervalReduction: 0.5, // halved interval on weekends
};

const RARITY_WEIGHTS = { common: 40, uncommon: 30, rare: 20, legendary: 10 };

module.exports = { GLOBAL_EVENTS, GLOBAL_EVENT_SCHEDULE, RARITY_WEIGHTS };
