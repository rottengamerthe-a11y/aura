const { BATTLE_PASS_TIERS, BATTLE_PASS_TIER_XP, BATTLE_PASS_PRICE_AURA } = require('../config/battlePassConfig');

// Get current season info (matches leaderboard: calendar month)
function getBattlePassSeason(date = new Date()) {
  const name = date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const startDate = new Date(date.getFullYear(), date.getMonth(), 1);
  const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
  const daysRemaining = Math.max(0, Math.ceil((endDate - date) / (1000 * 60 * 60 * 24)));
  return { name, startDate, endDate, daysRemaining };
}

// Check if user needs a season reset. User schema fields:
// user.battlePass = { seasonId: 'September 2026', xp: 0, tier: 0, paid: false, claimedFree: [], claimedPaid: [], purchasedAt: null }
function checkBattlePassReset(user, date = new Date()) {
  const season = getBattlePassSeason(date);
  if (!user.battlePass || user.battlePass.seasonId !== season.name) {
    user.battlePass = {
      seasonId: season.name,
      xp: 0,
      tier: 0,
      paid: false,
      claimedFree: [],
      claimedPaid: [],
      purchasedAt: null,
    };
    return true; // reset happened
  }
  return false;
}

// Add XP to the battle pass and calculate new tier
function addBattlePassXP(user, amount) {
  checkBattlePassReset(user);
  user.battlePass.xp += amount;
  // Calculate tier based on cumulative XP thresholds
  let newTier = 0;
  for (let i = 0; i < BATTLE_PASS_TIER_XP.length; i++) {
    if (user.battlePass.xp >= BATTLE_PASS_TIER_XP[i]) {
      newTier = i + 1;
    } else break;
  }
  const previousTier = user.battlePass.tier;
  user.battlePass.tier = newTier;
  const tiersGained = newTier - previousTier;
  return { previousTier, newTier, tiersGained, totalXp: user.battlePass.xp };
}

// Purchase the battle pass (paid track) with aura
function purchaseBattlePass(user) {
  checkBattlePassReset(user);
  if (user.battlePass.paid) return { error: 'You already own this season\'s Battle Pass.' };
  if (user.aura < BATTLE_PASS_PRICE_AURA) return { error: `Not enough aura. Need ${BATTLE_PASS_PRICE_AURA.toLocaleString()}.` };
  user.aura -= BATTLE_PASS_PRICE_AURA;
  user.battlePass.paid = true;
  user.battlePass.purchasedAt = new Date();
  return { success: true };
}

// Mark battle pass as paid (for Paddle webhook or Elite members)
function grantBattlePassPaid(user) {
  checkBattlePassReset(user);
  user.battlePass.paid = true;
  user.battlePass.purchasedAt = new Date();
}

// Claim rewards for a specific tier. Returns { rewards } or { error }
function claimBattlePassTier(user, tierNumber, track = 'free') {
  checkBattlePassReset(user);
  if (tierNumber < 1 || tierNumber > 30) return { error: 'Invalid tier.' };
  if (tierNumber > user.battlePass.tier) return { error: 'You haven\'t reached this tier yet.' };
  const tierData = BATTLE_PASS_TIERS[tierNumber - 1];
  if (!tierData) return { error: 'Invalid tier.' };

  if (track === 'free') {
    if (user.battlePass.claimedFree.includes(tierNumber)) return { error: 'Already claimed.' };
    user.battlePass.claimedFree.push(tierNumber);
    return { rewards: tierData.free, track: 'free', tier: tierNumber };
  }

  if (track === 'paid') {
    if (!user.battlePass.paid) return { error: 'You need the Battle Pass to claim paid rewards.' };
    if (user.battlePass.claimedPaid.includes(tierNumber)) return { error: 'Already claimed.' };
    user.battlePass.claimedPaid.push(tierNumber);
    return { rewards: tierData.paid, track: 'paid', tier: tierNumber };
  }

  return { error: 'Invalid track.' };
}

// Apply rewards to user document (aura, xp, crates, titles, etc.)
function applyBattlePassRewards(user, rewards) {
  const summary = [];
  if (rewards.aura) { user.aura += rewards.aura; summary.push(`+${rewards.aura.toLocaleString()} aura`); }
  if (rewards.xp) { user.xp += rewards.xp; summary.push(`+${rewards.xp.toLocaleString()} XP`); }
  if (rewards.crate) {
    const qty = rewards.quantity || 1;
    user.crates.set(rewards.crate, (user.crates.get(rewards.crate) || 0) + qty);
    summary.push(`${qty}x ${rewards.crate} crate`);
  }
  if (rewards.title) {
    if (!user.cosmetics.ownedTitles.includes(rewards.title)) user.cosmetics.ownedTitles.push(rewards.title);
    summary.push(`Title: ${rewards.title}`);
  }
  if (rewards.badge) {
    if (!user.cosmetics.ownedBadges.includes(rewards.badge)) user.cosmetics.ownedBadges.push(rewards.badge);
    summary.push(`Badge: ${rewards.badge}`);
  }
  if (rewards.frame) {
    if (!user.cosmetics.ownedFrames.includes(rewards.frame)) user.cosmetics.ownedFrames.push(rewards.frame);
    summary.push(`Frame: ${rewards.frame}`);
  }
  if (rewards.background) {
    if (!user.cosmetics.ownedBackgrounds.includes(rewards.background)) user.cosmetics.ownedBackgrounds.push(rewards.background);
    summary.push(`Background: ${rewards.background}`);
  }
  if (rewards.nameColor) {
    if (!user.cosmetics.ownedNameColors.includes(rewards.nameColor)) user.cosmetics.ownedNameColors.push(rewards.nameColor);
    summary.push(`Name Color: ${rewards.nameColor}`);
  }
  if (rewards.materials) {
    // materials is an object like { iron_ore: 3 }
    for (const [matId, qty] of Object.entries(rewards.materials)) {
      // Use addInventoryItem pattern - find or push
      const existing = user.inventory.find(e => e.itemId === matId);
      if (existing) existing.quantity += qty;
      else user.inventory.push({ itemId: matId, quantity: qty });
      summary.push(`${qty}x ${matId}`);
    }
  }
  return summary;
}

// Get display info for the battle pass
function getBattlePassProgress(user) {
  checkBattlePassReset(user);
  const bp = user.battlePass;
  const currentTier = bp.tier;
  const nextTierXp = currentTier < 30 ? BATTLE_PASS_TIER_XP[currentTier] : null;
  const prevTierXp = currentTier > 0 ? BATTLE_PASS_TIER_XP[currentTier - 1] : 0;
  const xpInCurrentTier = bp.xp - prevTierXp;
  const xpNeededForNext = nextTierXp ? nextTierXp - prevTierXp : 0;
  const unclaimedFree = [];
  const unclaimedPaid = [];
  for (let i = 1; i <= currentTier; i++) {
    if (!bp.claimedFree.includes(i)) unclaimedFree.push(i);
    if (bp.paid && !bp.claimedPaid.includes(i)) unclaimedPaid.push(i);
  }
  return { currentTier, totalXp: bp.xp, paid: bp.paid, xpInCurrentTier, xpNeededForNext, nextTierXp, unclaimedFree, unclaimedPaid, maxTier: 30 };
}

module.exports = { getBattlePassSeason, checkBattlePassReset, addBattlePassXP, purchaseBattlePass, grantBattlePassPaid, claimBattlePassTier, applyBattlePassRewards, getBattlePassProgress };
