function isGlobalPlayerDataEnabled() {
  return process.env.GLOBAL_PLAYER_DATA?.trim().toLowerCase() === "true";
}

function buildPlayerLookup(guildId, userId) {
  return isGlobalPlayerDataEnabled() ? { userId } : { guildId, userId };
}

function buildPlayerCreateData(guildId, userId) {
  return isGlobalPlayerDataEnabled() ? { userId } : { guildId, userId };
}

function buildPlayerLeaderboardFilter(guildId) {
  return isGlobalPlayerDataEnabled() ? {} : { guildId };
}

function getGuildClanId(user, guildId) {
  if (user?.clanMemberships?.get) {
    return user.clanMemberships.get(guildId) || null;
  }
  if (user?.clanMemberships && typeof user.clanMemberships === "object") {
    return user.clanMemberships[guildId] || null;
  }
  return user?.clanId || null;
}

function setGuildClanId(user, guildId, clanId) {
  if (!user.clanMemberships?.get) {
    user.clanMemberships = new Map(Object.entries(user.clanMemberships || {}));
  }

  if (clanId) {
    user.clanMemberships.set(guildId, clanId);
  } else {
    user.clanMemberships.delete(guildId);
  }

  if (!isGlobalPlayerDataEnabled()) {
    user.clanId = clanId || null;
  }
}

function buildClanMembershipFilter(guildId, clanId) {
  return isGlobalPlayerDataEnabled()
    ? { [`clanMemberships.${guildId}`]: clanId }
    : { guildId, clanId };
}

function buildClanMembershipClearUpdate(guildId) {
  return isGlobalPlayerDataEnabled()
    ? { $unset: { [`clanMemberships.${guildId}`]: "" } }
    : { $set: { clanId: null } };
}

module.exports = {
  buildClanMembershipClearUpdate,
  buildClanMembershipFilter,
  buildPlayerCreateData,
  buildPlayerLeaderboardFilter,
  buildPlayerLookup,
  getGuildClanId,
  isGlobalPlayerDataEnabled,
  setGuildClanId,
};
