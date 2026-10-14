const { User, Clan } = require("../data/models");

const LEADERBOARD_CATEGORIES = {
  aura: { label: "Total Aura", field: "aura", icon: "💰" },
  vault: { label: "Vault Balance", field: "vaultAura", icon: "🏦" },
  xp: { label: "Experience", field: "xp", icon: "⭐" },
  prestige: { label: "Prestige", field: "prestige", icon: "👑" },
  pvp: { label: "PvP Wins", field: "stats.pvpWins", icon: "⚔️" },
  reputation: { label: "Reputation", field: "reputation.score", icon: "🏅" },
  relics: { label: "Relic Collection", computed: true, icon: "✨" },
  bossWins: { label: "Boss Victories", field: "stats.bossWins", icon: "🐉" },
  streak: { label: "Daily Streak", field: "dailyStreak", icon: "🔥" },
  seasonal: { label: "Season Score", field: "seasonStats.score", icon: "🏆" },
};

async function getServerLeaderboard(guildId, category = "aura", limit = 10) {
  const catInfo = LEADERBOARD_CATEGORIES[category] || LEADERBOARD_CATEGORIES.aura;
  
  let sortField = catInfo.field;
  const pipeline = [
    { $match: { guildId: guildId, xp: { $gt: 0 } } }
  ];

  if (category === "relics") {
    pipeline.push({
      $addFields: {
        computedValue: { $size: { $ifNull: ["$relics", []] } }
      }
    });
    sortField = "computedValue";
  } else {
    pipeline.push({
      $addFields: {
        computedValue: { $ifNull: [`$${catInfo.field}`, 0] }
      }
    });
    sortField = "computedValue";
  }

  pipeline.push({ $sort: { [sortField]: -1 } });
  pipeline.push({ $limit: limit });
  pipeline.push({
    $project: {
      userId: 1,
      username: 1,
      value: `$${sortField}`
    }
  });

  const results = await User.aggregate(pipeline);
  return results.map((doc, index) => ({
    rank: index + 1,
    userId: doc.userId,
    username: doc.username || "Unknown",
    value: doc.value || 0
  }));
}

async function getGlobalLeaderboard(category = "aura", limit = 10) {
  const catInfo = LEADERBOARD_CATEGORIES[category] || LEADERBOARD_CATEGORIES.aura;
  
  let valueField = catInfo.field;
  
  const pipeline = [
    { $match: { xp: { $gt: 0 } } }
  ];

  if (category === "relics") {
    pipeline.push({
      $addFields: {
        computedValue: { $size: { $ifNull: ["$relics", []] } }
      }
    });
    valueField = "computedValue";
  } else {
    pipeline.push({
      $addFields: {
        computedValue: { $ifNull: [`$${catInfo.field}`, 0] }
      }
    });
    valueField = "computedValue";
  }

  pipeline.push({
    $group: {
      _id: "$userId",
      username: { $first: "$username" },
      value: { $max: `$${valueField}` }
    }
  });
  
  pipeline.push({ $sort: { value: -1 } });
  pipeline.push({ $limit: limit });

  const results = await User.aggregate(pipeline);
  return results.map((doc, index) => ({
    rank: index + 1,
    userId: doc._id,
    username: doc.username || "Unknown",
    value: doc.value || 0
  }));
}

async function getClanLeaderboard(guildId, limit = 10) {
  const clans = await Clan.find({ guildId })
    .sort({ trophies: -1, level: -1, vaultAura: -1 })
    .limit(limit)
    .lean();
    
  return clans.map((clan, index) => ({
    rank: index + 1,
    clanId: clan._id,
    name: clan.name,
    trophies: clan.trophies || 0,
    level: clan.level || 1,
    vaultAura: clan.vaultAura || 0,
    members: clan.members?.length || 0
  }));
}

async function getUserRank(guildId, userId, category = "aura", scope = "server") {
  const user = await User.findOne({ guildId, userId }).lean();
  if (!user) return null;

  const catInfo = LEADERBOARD_CATEGORIES[category] || LEADERBOARD_CATEGORIES.aura;
  
  let userValue = 0;
  if (category === "relics") {
    userValue = user.relics ? user.relics.length : 0;
  } else {
    const parts = catInfo.field.split('.');
    let curr = user;
    for (const part of parts) {
      if (curr) curr = curr[part];
      else break;
    }
    userValue = curr || 0;
  }

  let matchQuery = { xp: { $gt: 0 } };
  
  if (scope === "server") {
    matchQuery.guildId = guildId;
  }
  
  if (category === "relics") {
    const pipeline = [
      { $match: matchQuery },
      { $addFields: { computedValue: { $size: { $ifNull: ["$relics", []] } } } },
      { $match: { computedValue: { $gt: userValue } } },
      { $count: "count" }
    ];
    const res = await User.aggregate(pipeline);
    return (res[0] ? res[0].count : 0) + 1;
  } else {
    matchQuery[catInfo.field] = { $gt: userValue };
    
    if (scope === "global") {
      const pipeline = [
        { $match: matchQuery },
        {
          $group: {
            _id: "$userId",
            value: { $max: `$${catInfo.field}` }
          }
        },
        { $match: { value: { $gt: userValue } } },
        { $count: "count" }
      ];
      const res = await User.aggregate(pipeline);
      return (res[0] ? res[0].count : 0) + 1;
    } else {
      const count = await User.countDocuments(matchQuery);
      return count + 1;
    }
  }
}

function getSeasonInfo(date = new Date()) {
  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const year = date.getFullYear();
  const month = date.getMonth();
  
  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
  
  const daysRemaining = Math.max(0, Math.ceil((endDate - date) / (1000 * 60 * 60 * 24)));
  
  return {
    name: `${monthNames[month]} ${year}`,
    startDate,
    endDate,
    daysRemaining
  };
}

function checkSeasonReset(user, date = new Date()) {
  const currentSeason = getSeasonInfo(date);
  let resetHappened = false;
  
  if (!user.seasonStats) {
    user.seasonStats = {
      score: 0,
      auraEarned: 0,
      xpEarned: 0,
      bossWins: 0,
      pvpWins: 0,
      crafts: 0,
      robsSuccess: 0
    };
    user.lastSeasonResetAt = date;
    resetHappened = true;
  } else if (!user.lastSeasonResetAt || user.lastSeasonResetAt < currentSeason.startDate) {
    user.previousSeasonStats = { ...user.seasonStats };
    user.seasonStats = {
      score: 0,
      auraEarned: 0,
      xpEarned: 0,
      bossWins: 0,
      pvpWins: 0,
      crafts: 0,
      robsSuccess: 0
    };
    user.lastSeasonResetAt = date;
    resetHappened = true;
  }
  
  return resetHappened;
}

function incrementSeasonStat(user, stat, amount = 1) {
  if (!user.seasonStats) {
    checkSeasonReset(user);
  }
  
  if (user.seasonStats[stat] !== undefined) {
    user.seasonStats[stat] += amount;
  } else {
    user.seasonStats[stat] = amount;
  }
  
  if (stat !== "score") {
    let scoreGained = amount;
    if (stat === "auraEarned") scoreGained = amount * 0.01;
    if (stat === "xpEarned") scoreGained = amount * 0.1;
    if (stat === "bossWins") scoreGained = amount * 50;
    if (stat === "pvpWins") scoreGained = amount * 10;
    
    if (user.seasonStats.score === undefined) user.seasonStats.score = 0;
    user.seasonStats.score += Math.floor(scoreGained);
  }
}

module.exports = {
  LEADERBOARD_CATEGORIES,
  getServerLeaderboard,
  getGlobalLeaderboard,
  getClanLeaderboard,
  getUserRank,
  getSeasonInfo,
  checkSeasonReset,
  incrementSeasonStat
};
