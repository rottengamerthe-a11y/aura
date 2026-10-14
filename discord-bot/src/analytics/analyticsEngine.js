const { User, GuildSettings, AuctionListing, ReferralCode } = require('../data/models');

// In-memory metric counters (reset daily, flushed to DB periodically)
const dailyMetrics = {
  commandsExecuted: 0,
  uniqueUsers: new Set(),
  newUsers: 0,
  auraEarned: 0,
  auraSpent: 0,
  cratesOpened: 0,
  pvpBattles: 0,
  bossKills: 0,
  premiumPurchases: 0,
  battlePassPurchases: 0,
  auctionListings: 0,
  auctionSales: 0,
  auctionVolume: 0,
  referralUses: 0,
  npcChats: 0,
  casinoGamesPlayed: 0,
  casinoAuraIn: 0,
  casinoAuraOut: 0,
  lastReset: new Date().toISOString().slice(0, 10),
};

// Track a command execution
function trackCommand(userId, commandName) {
  dailyMetrics.commandsExecuted++;
  dailyMetrics.uniqueUsers.add(userId);
}

// Track various events
function trackAuraEarned(amount) { dailyMetrics.auraEarned += amount; }
function trackAuraSpent(amount) { dailyMetrics.auraSpent += amount; }
function trackNewUser() { dailyMetrics.newUsers++; }
function trackCrateOpened() { dailyMetrics.cratesOpened++; }
function trackPvpBattle() { dailyMetrics.pvpBattles++; }
function trackBossKill() { dailyMetrics.bossKills++; }
function trackPremiumPurchase() { dailyMetrics.premiumPurchases++; }
function trackBattlePassPurchase() { dailyMetrics.battlePassPurchases++; }
function trackAuctionListing() { dailyMetrics.auctionListings++; }
function trackAuctionSale(volume) { dailyMetrics.auctionSales++; dailyMetrics.auctionVolume += volume; }
function trackReferralUse() { dailyMetrics.referralUses++; }
function trackNpcChat() { dailyMetrics.npcChats++; }
function trackCasinoGame(betAmount, payout) { dailyMetrics.casinoGamesPlayed++; dailyMetrics.casinoAuraIn += betAmount; dailyMetrics.casinoAuraOut += payout; }

// Get current daily snapshot
function getDailySnapshot() {
  const today = new Date().toISOString().slice(0, 10);
  if (dailyMetrics.lastReset !== today) {
    resetDailyMetrics();
  }
  return {
    date: dailyMetrics.lastReset,
    commands: dailyMetrics.commandsExecuted,
    uniqueUsers: dailyMetrics.uniqueUsers.size,
    newUsers: dailyMetrics.newUsers,
    auraEarned: dailyMetrics.auraEarned,
    auraSpent: dailyMetrics.auraSpent,
    netAuraFlow: dailyMetrics.auraEarned - dailyMetrics.auraSpent,
    cratesOpened: dailyMetrics.cratesOpened,
    pvpBattles: dailyMetrics.pvpBattles,
    bossKills: dailyMetrics.bossKills,
    premiumPurchases: dailyMetrics.premiumPurchases,
    battlePassPurchases: dailyMetrics.battlePassPurchases,
    auctionListings: dailyMetrics.auctionListings,
    auctionSales: dailyMetrics.auctionSales,
    auctionVolume: dailyMetrics.auctionVolume,
    referralUses: dailyMetrics.referralUses,
    npcChats: dailyMetrics.npcChats,
    casinoGamesPlayed: dailyMetrics.casinoGamesPlayed,
    casinoHouseEdge: dailyMetrics.casinoAuraIn - dailyMetrics.casinoAuraOut,
  };
}

function resetDailyMetrics() {
  dailyMetrics.commandsExecuted = 0;
  dailyMetrics.uniqueUsers = new Set();
  dailyMetrics.newUsers = 0;
  dailyMetrics.auraEarned = 0;
  dailyMetrics.auraSpent = 0;
  dailyMetrics.cratesOpened = 0;
  dailyMetrics.pvpBattles = 0;
  dailyMetrics.bossKills = 0;
  dailyMetrics.premiumPurchases = 0;
  dailyMetrics.battlePassPurchases = 0;
  dailyMetrics.auctionListings = 0;
  dailyMetrics.auctionSales = 0;
  dailyMetrics.auctionVolume = 0;
  dailyMetrics.referralUses = 0;
  dailyMetrics.npcChats = 0;
  dailyMetrics.casinoGamesPlayed = 0;
  dailyMetrics.casinoAuraIn = 0;
  dailyMetrics.casinoAuraOut = 0;
  dailyMetrics.lastReset = new Date().toISOString().slice(0, 10);
}

// Aggregate economy health report from DB
async function getEconomyHealthReport() {
  const pipeline = [
    { $match: { xp: { $gt: 0 } } },
    { $group: {
      _id: null,
      totalPlayers: { $sum: 1 },
      totalAura: { $sum: '$aura' },
      totalVault: { $sum: '$vaultAura' },
      avgAura: { $avg: '$aura' },
      medianProxy: { $avg: '$aura' }, // approximation
      maxAura: { $max: '$aura' },
      avgXp: { $avg: '$xp' },
      premiumCount: { $sum: { $cond: [{ $eq: ['$premium.active', true] }, 1, 0] } },
      avgDailyStreak: { $avg: '$dailyStreak' },
      totalPetOwners: { $sum: { $cond: [{ $ne: ['$pet.id', null] }, 1, 0] } },
      totalBattlePassPaid: { $sum: { $cond: [{ $eq: ['$battlePass.paid', true] }, 1, 0] } },
    }},
  ];
  const [result] = await User.aggregate(pipeline);
  if (!result) return { totalPlayers: 0 };
  
  // Calculate wealth distribution (Gini-like)
  const topPlayersPipeline = [
    { $match: { xp: { $gt: 0 } } },
    { $sort: { aura: -1 } },
    { $limit: 10 },
    { $group: { _id: null, topTotalAura: { $sum: '$aura' } } },
  ];
  const [topResult] = await User.aggregate(topPlayersPipeline);
  const wealthConcentration = topResult && result.totalAura > 0
    ? Math.round((topResult.topTotalAura / result.totalAura) * 100)
    : 0;

  return {
    ...result,
    wealthConcentration: `${wealthConcentration}% held by top 10`,
    moneySupply: result.totalAura + result.totalVault,
    premiumRate: result.totalPlayers > 0 ? `${Math.round((result.premiumCount / result.totalPlayers) * 100)}%` : '0%',
    petAdoptionRate: result.totalPlayers > 0 ? `${Math.round((result.totalPetOwners / result.totalPlayers) * 100)}%` : '0%',
    battlePassRate: result.totalPlayers > 0 ? `${Math.round((result.totalBattlePassPaid / result.totalPlayers) * 100)}%` : '0%',
  };
}

// Get engagement metrics
async function getEngagementReport() {
  const now = new Date();
  const day1 = new Date(now - 24 * 60 * 60 * 1000);
  const day7 = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const day30 = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const [dau, wau, mau] = await Promise.all([
    User.countDocuments({ updatedAt: { $gte: day1 }, xp: { $gt: 0 } }),
    User.countDocuments({ updatedAt: { $gte: day7 }, xp: { $gt: 0 } }),
    User.countDocuments({ updatedAt: { $gte: day30 }, xp: { $gt: 0 } }),
  ]);

  const totalUsers = await User.countDocuments({ xp: { $gt: 0 } });
  
  return {
    dau, wau, mau, totalUsers,
    dauWauRatio: wau > 0 ? `${Math.round((dau / wau) * 100)}%` : '0%',
    wauMauRatio: mau > 0 ? `${Math.round((wau / mau) * 100)}%` : '0%',
    stickiness: mau > 0 ? `${Math.round((dau / mau) * 100)}%` : '0%',
  };
}

// Get retention cohort data
async function getRetentionData() {
  const now = new Date();
  const cohorts = [];
  for (let i = 0; i < 4; i++) {
    const weekStart = new Date(now - (i + 1) * 7 * 24 * 60 * 60 * 1000);
    const weekEnd = new Date(now - i * 7 * 24 * 60 * 60 * 1000);
    const created = await User.countDocuments({ createdAt: { $gte: weekStart, $lt: weekEnd }, xp: { $gt: 0 } });
    const retained = await User.countDocuments({ createdAt: { $gte: weekStart, $lt: weekEnd }, updatedAt: { $gte: new Date(now - 24 * 60 * 60 * 1000) }, xp: { $gt: 0 } });
    cohorts.push({
      week: `Week -${i + 1}`,
      created,
      retained,
      retentionRate: created > 0 ? `${Math.round((retained / created) * 100)}%` : 'N/A',
    });
  }
  return cohorts;
}

// Get revenue metrics
async function getRevenueMetrics() {
  const premiumUsers = await User.countDocuments({ 'premium.active': true });
  const battlePassUsers = await User.countDocuments({ 'battlePass.paid': true });
  const referralCodes = await ReferralCode.countDocuments({ active: true });
  const totalReferrals = await ReferralCode.aggregate([{ $group: { _id: null, total: { $sum: '$uses' } } }]);

  return {
    activePremium: premiumUsers,
    activeBattlePasses: battlePassUsers,
    activeReferralCodes: referralCodes,
    totalReferrals: totalReferrals[0]?.total || 0,
    estimatedMRR: (premiumUsers * 4.99) + (battlePassUsers * 4.99), // rough estimate
  };
}

// Full analytics report for dashboard API
async function getFullAnalyticsReport() {
  const [daily, economy, engagement, retention, revenue] = await Promise.all([
    getDailySnapshot(),
    getEconomyHealthReport(),
    getEngagementReport(),
    getRetentionData(),
    getRevenueMetrics(),
  ]);
  return { daily, economy, engagement, retention, revenue, generatedAt: new Date() };
}

module.exports = {
  trackCommand, trackAuraEarned, trackAuraSpent, trackNewUser, trackCrateOpened,
  trackPvpBattle, trackBossKill, trackPremiumPurchase, trackBattlePassPurchase,
  trackAuctionListing, trackAuctionSale, trackReferralUse, trackNpcChat, trackCasinoGame,
  getDailySnapshot, getEconomyHealthReport, getEngagementReport,
  getRetentionData, getRevenueMetrics, getFullAnalyticsReport,
};
