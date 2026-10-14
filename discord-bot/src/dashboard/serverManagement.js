const { User, Clan, GuildSettings } = require('../data/models');

// Get top players for a guild leaderboard (for web display)
async function getGuildLeaderboard(guildId, category = 'aura', limit = 50) {
  const sortMap = {
    aura: { aura: -1 }, xp: { xp: -1 }, prestige: { prestige: -1 },
    vault: { vaultAura: -1 }, pvp: { 'stats.pvpWins': -1 },
    streak: { dailyStreak: -1 },
  };
  const sort = sortMap[category] || sortMap.aura;
  const players = await User.find({ guildId, xp: { $gt: 0 } })
    .sort(sort).limit(limit)
    .select('userId aura vaultAura xp prestige rankIndex stats.pvpWins dailyStreak cosmetics.activeTitle')
    .lean();
  return players.map((p, i) => ({
    rank: i + 1, userId: p.userId,
    aura: p.aura, vault: p.vaultAura, xp: p.xp,
    prestige: p.prestige, rankIndex: p.rankIndex,
    pvpWins: p.stats?.pvpWins || 0,
    title: p.cosmetics?.activeTitle || null,
  }));
}

// Get detailed member stats
async function getMemberProfile(guildId, userId) {
  const user = await User.findOne({ guildId, userId }).lean();
  if (!user) return null;
  return {
    userId: user.userId, aura: user.aura, vaultAura: user.vaultAura,
    xp: user.xp, prestige: user.prestige, rankIndex: user.rankIndex,
    stats: user.stats, premium: { active: user.premium?.active || false, source: user.premium?.source || null },
    pet: user.pet?.id ? { species: user.pet.id, name: user.pet.name, level: user.pet.level } : null,
    cosmetics: user.cosmetics, dailyStreak: user.dailyStreak,
    createdAt: user.createdAt, updatedAt: user.updatedAt,
  };
}

// Get guild settings
async function getGuildSettings(guildId) {
  const settings = await GuildSettings.findOne({ guildId }).lean();
  return settings || { guildId, serverPremium: { active: false } };
}

// Update guild settings (premium required for most)
async function updateGuildSettings(guildId, updates) {
  const allowed = {};
  if (updates.embedColor) allowed.embedColor = updates.embedColor;
  if (updates.welcomeMessage !== undefined) allowed.welcomeMessage = updates.welcomeMessage;
  if (updates.levelUpChannel !== undefined) allowed.levelUpChannel = updates.levelUpChannel;
  if (updates.commandChannel !== undefined) allowed.commandChannel = updates.commandChannel;
  if (Object.keys(allowed).length === 0) return { error: 'No valid settings provided.' };
  await GuildSettings.findOneAndUpdate({ guildId }, { $set: allowed }, { upsert: true });
  return { success: true, updated: Object.keys(allowed) };
}

// Get economy health overview for a guild
async function getEconomyOverview(guildId) {
  const pipeline = [
    { $match: { guildId, xp: { $gt: 0 } } },
    { $group: {
      _id: null,
      totalPlayers: { $sum: 1 },
      totalAura: { $sum: '$aura' },
      totalVault: { $sum: '$vaultAura' },
      avgAura: { $avg: '$aura' },
      avgXp: { $avg: '$xp' },
      maxAura: { $max: '$aura' },
      premiumCount: { $sum: { $cond: ['$premium.active', 1, 0] } },
    }},
  ];
  const [result] = await User.aggregate(pipeline);
  if (!result) return { totalPlayers: 0, totalAura: 0, totalVault: 0, avgAura: 0, avgXp: 0, maxAura: 0, premiumCount: 0 };
  return result;
}

// Get user's own full profile for web display
async function getUserWebProfile(userId) {
  // Find across all guilds, return the profile with highest XP
  const profiles = await User.find({ userId }).sort({ xp: -1 }).limit(1).lean();
  if (!profiles.length) return null;
  const user = profiles[0];
  return {
    userId: user.userId, guildId: user.guildId,
    aura: user.aura, vaultAura: user.vaultAura, xp: user.xp,
    prestige: user.prestige, rankIndex: user.rankIndex,
    stats: user.stats, premium: user.premium,
    pet: user.pet, cosmetics: user.cosmetics,
    battlePass: user.battlePass || null,
    dailyStreak: user.dailyStreak, inventory: user.inventory?.length || 0,
    relics: user.relics?.length || 0,
  };
}

// Admin grant premium to a user
async function adminGrantPremium(guildId, userId, planId, durationDays = 30) {
  const user = await User.findOne({ guildId, userId });
  if (!user) return { error: 'User not found.' };
  user.premium = user.premium || {};
  user.premium.active = true;
  user.premium.source = planId;
  user.premium.grantedBy = 'admin';
  user.premium.expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
  await user.save();
  return { success: true, userId, planId, expiresAt: user.premium.expiresAt };
}

module.exports = {
  getGuildLeaderboard, getMemberProfile, getGuildSettings,
  updateGuildSettings, getEconomyOverview, getUserWebProfile,
  adminGrantPremium,
};
