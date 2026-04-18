const { RANKS } = require("../config/gameConfig");
const { User } = require("./models");
const { isGlobalPlayerDataEnabled } = require("./playerScope");

function asDate(value) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function latestDate(...values) {
  return values.reduce((latest, value) => {
    const date = asDate(value);
    if (!date) {
      return latest;
    }
    if (!latest || date.getTime() > latest.getTime()) {
      return date;
    }
    return latest;
  }, null);
}

function mergeStringArrays(...values) {
  return [...new Set(values.flatMap((value) => (Array.isArray(value) ? value : [])))];
}

function mergeCountMaps(targetMap, sourceMap) {
  const entries = sourceMap?.entries ? [...sourceMap.entries()] : Object.entries(sourceMap || {});
  entries.forEach(([key, value]) => {
    const amount = Number(value) || 0;
    if (!amount) {
      return;
    }
    targetMap.set(key, (targetMap.get(key) || 0) + amount);
  });
}

function mergeInventory(targetInventory, sourceInventory) {
  (sourceInventory || []).forEach((entry) => {
    if (!entry?.id) {
      return;
    }
    const existing = targetInventory.find((item) => item.id === entry.id);
    if (existing) {
      existing.quantity += Number(entry.quantity) || 0;
      return;
    }
    targetInventory.push({
      id: entry.id,
      quantity: Number(entry.quantity) || 0,
    });
  });
}

function mergeQuests(targetQuests, sourceQuests) {
  (sourceQuests || []).forEach((quest) => {
    if (!quest?.id) {
      return;
    }
    const existing = targetQuests.find((item) => item.id === quest.id);
    if (!existing) {
      targetQuests.push({
        id: quest.id,
        name: quest.name,
        description: quest.description,
        metric: quest.metric,
        goal: quest.goal,
        progress: Number(quest.progress) || 0,
        rewardAura: quest.rewardAura,
        rewardXp: quest.rewardXp,
        completed: Boolean(quest.completed),
      });
      return;
    }

    existing.progress = Math.max(Number(existing.progress) || 0, Number(quest.progress) || 0);
    existing.completed = existing.completed || Boolean(quest.completed);
    existing.goal = Math.max(Number(existing.goal) || 0, Number(quest.goal) || 0);
    existing.name = existing.name || quest.name;
    existing.description = existing.description || quest.description;
    existing.metric = existing.metric || quest.metric;
    existing.rewardAura = Math.max(Number(existing.rewardAura) || 0, Number(quest.rewardAura) || 0);
    existing.rewardXp = Math.max(Number(existing.rewardXp) || 0, Number(quest.rewardXp) || 0);
  });
}

function mergeClanMemberships(targetMemberships, user) {
  const sourceMemberships = user?.clanMemberships?.entries
    ? [...user.clanMemberships.entries()]
    : Object.entries(user?.clanMemberships || {});

  sourceMemberships.forEach(([guildId, clanId]) => {
    if (guildId && clanId) {
      targetMemberships.set(guildId, clanId);
    }
  });

  if (user?.guildId && user?.clanId && !targetMemberships.get(user.guildId)) {
    targetMemberships.set(user.guildId, user.clanId);
  }
}

function mergeGardenPlots(targetPlots, sourcePlots) {
  const maxLength = Math.max(targetPlots.length, sourcePlots?.length || 0, 2);
  const merged = [];

  for (let index = 0; index < maxLength; index += 1) {
    const current = targetPlots[index];
    const incoming = sourcePlots?.[index];
    merged[index] = current?.cropId
      ? current
      : incoming?.cropId
        ? incoming
        : current || incoming || { cropId: null, plantedAt: null };
  }

  return merged;
}

function mergeStats(targetStats, sourceStats) {
  const keys = new Set([
    ...Object.keys(targetStats || {}),
    ...Object.keys(sourceStats || {}),
  ]);

  keys.forEach((key) => {
    targetStats[key] = (Number(targetStats[key]) || 0) + (Number(sourceStats?.[key]) || 0);
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

function chooseBillingValue(users, key) {
  for (const user of users) {
    const value = user?.billing?.[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return null;
}

function mergeUsers(users) {
  const orderedUsers = [...users].sort((left, right) => {
    const rightUpdated = asDate(right.updatedAt)?.getTime() || 0;
    const leftUpdated = asDate(left.updatedAt)?.getTime() || 0;
    return rightUpdated - leftUpdated;
  });

  const primary = orderedUsers[0];
  const mergedInventory = [];
  const mergedQuests = [];
  const mergedCrates = new Map();
  const mergedMemberships = new Map();
  const mergedStats = {};

  let aura = 0;
  let vaultAura = 0;
  let xp = 0;
  let prestige = 0;
  let streak = 0;
  let createdAt = asDate(primary.createdAt);
  let updatedAt = asDate(primary.updatedAt);
  let lastDailyAt = null;
  let lastSpinAt = null;
  let lastCoinflipAt = null;
  let lastWorkAt = null;
  let lastRobAt = null;
  let lastMineAt = null;
  let lastAuthorityAt = null;
  let lastVaultInterestAt = null;
  let premiumExpiresAt = null;
  let premiumActive = false;
  let premiumLifetime = false;
  let premiumGrantedBy = null;
  let premiumSource = null;
  let equippedGear = { ...(primary.equippedGear || {}) };
  let gardenPlots = Array.isArray(primary.gardenPlots) ? [...primary.gardenPlots] : [];

  orderedUsers.forEach((user) => {
    aura += Number(user.aura) || 0;
    vaultAura += Number(user.vaultAura) || 0;
    xp += Number(user.xp) || 0;
    prestige = Math.max(prestige, Number(user.prestige) || 0);
    streak = Math.max(streak, Number(user.streak) || 0);
    createdAt = createdAt && asDate(user.createdAt)
      ? new Date(Math.min(createdAt.getTime(), asDate(user.createdAt).getTime()))
      : createdAt || asDate(user.createdAt);
    updatedAt = latestDate(updatedAt, user.updatedAt);
    lastDailyAt = latestDate(lastDailyAt, user.lastDailyAt);
    lastSpinAt = latestDate(lastSpinAt, user.lastSpinAt);
    lastCoinflipAt = latestDate(lastCoinflipAt, user.lastCoinflipAt);
    lastWorkAt = latestDate(lastWorkAt, user.lastWorkAt);
    lastRobAt = latestDate(lastRobAt, user.lastRobAt);
    lastMineAt = latestDate(lastMineAt, user.lastMineAt);
    lastAuthorityAt = latestDate(lastAuthorityAt, user.lastAuthorityAt);
    lastVaultInterestAt = latestDate(lastVaultInterestAt, user.lastVaultInterestAt);

    mergeInventory(mergedInventory, user.inventory);
    mergeQuests(mergedQuests, user.quests);
    mergeCountMaps(mergedCrates, user.crates);
    mergeClanMemberships(mergedMemberships, user);
    mergeStats(mergedStats, user.stats || {});
    gardenPlots = mergeGardenPlots(gardenPlots, user.gardenPlots);

    Object.entries(user.equippedGear || {}).forEach(([slot, value]) => {
      if (!equippedGear[slot] && value) {
        equippedGear[slot] = value;
      }
    });

    if (user.premium?.active) {
      premiumActive = true;
    }
    if (user.premium?.lifetime) {
      premiumLifetime = true;
    }
    premiumExpiresAt = latestDate(premiumExpiresAt, user.premium?.expiresAt);
    premiumGrantedBy = premiumGrantedBy || user.premium?.grantedBy || null;
    premiumSource = premiumSource || user.premium?.source || null;
  });

  primary.guildId = undefined;
  primary.aura = aura;
  primary.vaultAura = vaultAura;
  primary.xp = xp;
  primary.rankIndex = getRankByXp(xp);
  primary.prestige = prestige;
  primary.streak = streak;
  primary.lastDailyAt = lastDailyAt;
  primary.lastSpinAt = lastSpinAt;
  primary.lastCoinflipAt = lastCoinflipAt;
  primary.lastWorkAt = lastWorkAt;
  primary.lastRobAt = lastRobAt;
  primary.lastMineAt = lastMineAt;
  primary.lastAuthorityAt = lastAuthorityAt;
  primary.lastVaultInterestAt = lastVaultInterestAt;
  primary.inventory = mergedInventory;
  primary.gardenPlots = gardenPlots;
  primary.ownedPerks = mergeStringArrays(...orderedUsers.map((user) => user.ownedPerks));
  primary.skills = mergeStringArrays(...orderedUsers.map((user) => user.skills));
  primary.equippedGear = {
    tool: equippedGear.tool || null,
    charm: equippedGear.charm || null,
    relic: equippedGear.relic || null,
  };
  primary.crates = mergedCrates;
  primary.quests = mergedQuests;
  primary.claimedAchievements = mergeStringArrays(...orderedUsers.map((user) => user.claimedAchievements));
  primary.premium = {
    active: premiumLifetime ? true : premiumActive && Boolean(premiumExpiresAt && premiumExpiresAt.getTime() > Date.now()),
    expiresAt: premiumLifetime ? null : premiumExpiresAt,
    lifetime: premiumLifetime,
    grantedBy: premiumGrantedBy,
    source: premiumSource,
  };
  primary.billing = {
    provider: chooseBillingValue(orderedUsers, "provider"),
    razorpayPaymentLinkId: chooseBillingValue(orderedUsers, "razorpayPaymentLinkId"),
    razorpayPaymentId: chooseBillingValue(orderedUsers, "razorpayPaymentId"),
    razorpayOrderId: chooseBillingValue(orderedUsers, "razorpayOrderId"),
    razorpayReferenceId: chooseBillingValue(orderedUsers, "razorpayReferenceId"),
    razorpayLastEventId: chooseBillingValue(orderedUsers, "razorpayLastEventId"),
    razorpayPlanId: chooseBillingValue(orderedUsers, "razorpayPlanId"),
    razorpayLinkStatus: chooseBillingValue(orderedUsers, "razorpayLinkStatus"),
  };
  primary.stats = mergedStats;
  primary.clanId = null;
  primary.clanMemberships = mergedMemberships;

  if (createdAt) {
    primary.createdAt = createdAt;
  }
  if (updatedAt) {
    primary.updatedAt = updatedAt;
  }

  return {
    primary,
    duplicates: orderedUsers.slice(1),
  };
}

async function migrateToGlobalPlayerProfiles() {
  if (!isGlobalPlayerDataEnabled()) {
    return { ran: false, mergedUsers: 0, removedProfiles: 0 };
  }

  const duplicateGroups = await User.aggregate([
    { $group: { _id: "$userId", ids: { $push: "$_id" }, count: { $sum: 1 } } },
    { $match: { _id: { $ne: null }, count: { $gt: 1 } } },
  ]);

  let mergedUsers = 0;
  let removedProfiles = 0;

  for (const group of duplicateGroups) {
    const users = await User.find({ _id: { $in: group.ids } }).sort({ updatedAt: -1, createdAt: 1 });
    if (users.length <= 1) {
      continue;
    }

    const { primary, duplicates } = mergeUsers(users);
    await primary.save();

    const duplicateIds = duplicates.map((user) => user._id);
    if (duplicateIds.length > 0) {
      await User.deleteMany({ _id: { $in: duplicateIds } });
      removedProfiles += duplicateIds.length;
    }

    mergedUsers += 1;
  }

  return { ran: true, mergedUsers, removedProfiles };
}

module.exports = {
  migrateToGlobalPlayerProfiles,
};
