function isGlobalPlayerDataEnabled() {
  return process.env.GLOBAL_PLAYER_DATA?.trim().toLowerCase() === "true";
}

function isGlobalClanDataEnabled() {
  const rawValue = process.env.GLOBAL_CLAN_DATA?.trim().toLowerCase();
  return rawValue ? rawValue === "true" : isGlobalPlayerDataEnabled();
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
  if (isGlobalClanDataEnabled()) {
    return user?.clanId || null;
  }
  if (user?.clanMemberships?.get) {
    return user.clanMemberships.get(guildId) || null;
  }
  if (user?.clanMemberships && typeof user.clanMemberships === "object") {
    return user.clanMemberships[guildId] || null;
  }
  return user?.clanId || null;
}

function setGuildClanId(user, guildId, clanId) {
  if (isGlobalClanDataEnabled()) {
    user.clanId = clanId || null;
    if (!user.clanMemberships?.get) {
      user.clanMemberships = new Map(Object.entries(user.clanMemberships || {}));
    }
    if (guildId) {
      user.clanMemberships.delete(guildId);
    }
    return;
  }

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
  if (isGlobalClanDataEnabled()) {
    return { clanId };
  }
  return isGlobalPlayerDataEnabled()
    ? { [`clanMemberships.${guildId}`]: clanId }
    : { guildId, clanId };
}

function buildClanMembershipClearUpdate(guildId) {
  if (isGlobalClanDataEnabled()) {
    return { $set: { clanId: null } };
  }
  return isGlobalPlayerDataEnabled()
    ? { $unset: { [`clanMemberships.${guildId}`]: "" } }
    : { $set: { clanId: null } };
}

function buildClanLookup(guildId, code) {
  return isGlobalClanDataEnabled() ? { code } : { guildId, code };
}

function buildClanCreateData(guildId, data) {
  return isGlobalClanDataEnabled() ? data : { guildId, ...data };
}

function buildClanLeaderboardFilter(guildId) {
  return isGlobalClanDataEnabled() ? {} : { guildId };
}

module.exports = {
  buildClanCreateData,
  buildClanLeaderboardFilter,
  buildClanLookup,
  buildClanMembershipClearUpdate,
  buildClanMembershipFilter,
  buildPlayerCreateData,
  buildPlayerLeaderboardFilter,
  buildPlayerLookup,
  isGlobalClanDataEnabled,
  getGuildClanId,
  isGlobalPlayerDataEnabled,
  setGuildClanId,
};
