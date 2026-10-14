const { GuildSettings } = require('../data/models');
const { SERVER_PREMIUM_TIERS } = require('../config/serverPremiumConfig');

// Get server's active premium tier (returns tier config or null)
async function getServerPremiumTier(guildId) {
  const settings = await GuildSettings.findOne({ guildId }).lean();
  if (!settings?.serverPremium?.active) return null;
  if (settings.serverPremium.expiresAt && settings.serverPremium.expiresAt < new Date()) return null;
  return SERVER_PREMIUM_TIERS[settings.serverPremium.tierId] || null;
}

// Apply server premium to guild settings
async function activateServerPremium(guildId, tierId, durationDays = 30, grantedBy = 'paddle') {
  const tier = SERVER_PREMIUM_TIERS[tierId];
  if (!tier) return { error: 'Invalid tier.' };
  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
  await GuildSettings.findOneAndUpdate(
    { guildId },
    { $set: {
      'serverPremium.active': true,
      'serverPremium.tierId': tierId,
      'serverPremium.expiresAt': expiresAt,
      'serverPremium.grantedBy': grantedBy,
      'serverPremium.activatedAt': new Date(),
    }},
    { upsert: true, new: true }
  );
  return { success: true, tier, expiresAt };
}

// Deactivate server premium
async function deactivateServerPremium(guildId) {
  await GuildSettings.findOneAndUpdate(
    { guildId },
    { $set: { 'serverPremium.active': false, 'serverPremium.expiresAt': null } }
  );
  return { success: true };
}

// Get XP multiplier for a server (1.0 if no premium)
async function getServerXpMultiplier(guildId) {
  const tier = await getServerPremiumTier(guildId);
  return tier?.xpMultiplier || 1.0;
}

// Get aura multiplier for a server
async function getServerAuraMultiplier(guildId) {
  const tier = await getServerPremiumTier(guildId);
  return tier?.auraMultiplier || 1.0;
}

// Check if a server feature is enabled
async function isServerFeatureEnabled(guildId, feature) {
  const tier = await getServerPremiumTier(guildId);
  if (!tier) return false;
  return Boolean(tier[feature]);
}

// Get server premium status display info
async function getServerPremiumStatus(guildId) {
  const settings = await GuildSettings.findOne({ guildId }).lean();
  if (!settings?.serverPremium?.active) {
    return { active: false, tier: null, expiresAt: null, customSettings: {} };
  }
  const tier = SERVER_PREMIUM_TIERS[settings.serverPremium.tierId];
  return {
    active: true,
    tier,
    expiresAt: settings.serverPremium.expiresAt,
    customSettings: settings.serverPremium.customSettings || {},
  };
}

// Update custom server settings (embed color, welcome message, etc.)
async function updateServerCustomSettings(guildId, settingsUpdate) {
  const tier = await getServerPremiumTier(guildId);
  if (!tier) return { error: 'Server premium is not active.' };
  const allowed = {};
  if (tier.customEmbedColor && settingsUpdate.embedColor) {
    allowed['serverPremium.customSettings.embedColor'] = settingsUpdate.embedColor;
  }
  if (tier.customWelcomeMessage && settingsUpdate.welcomeMessage) {
    allowed['serverPremium.customSettings.welcomeMessage'] = settingsUpdate.welcomeMessage;
  }
  if (Object.keys(allowed).length === 0) return { error: 'No valid settings to update.' };
  await GuildSettings.findOneAndUpdate({ guildId }, { $set: allowed });
  return { success: true, updated: Object.keys(allowed) };
}

module.exports = {
  getServerPremiumTier, activateServerPremium, deactivateServerPremium,
  getServerXpMultiplier, getServerAuraMultiplier, isServerFeatureEnabled,
  getServerPremiumStatus, updateServerCustomSettings,
};
