const { GuildSettings } = require('../data/models');
const { GLOBAL_EVENTS, GLOBAL_EVENT_SCHEDULE, RARITY_WEIGHTS } = require('../config/globalEventConfig');

// In-memory active global event (shared across the shard)
let activeGlobalEvent = null;
let lastGlobalEventEnd = null;

// Get the currently active global event (or null)
function getActiveGlobalEvent() {
  if (!activeGlobalEvent) return null;
  if (new Date() > activeGlobalEvent.endsAt) {
    activeGlobalEvent = null;
    return null;
  }
  return activeGlobalEvent;
}

// Start a global event (called by scheduler or admin)
function startGlobalEvent(eventId, announceFn = null) {
  const config = GLOBAL_EVENTS[eventId];
  if (!config) return { error: 'Unknown event.' };
  const now = new Date();
  activeGlobalEvent = {
    ...config,
    startedAt: now,
    endsAt: new Date(now.getTime() + config.durationHours * 60 * 60 * 1000),
    participants: new Set(),
    claims: new Map(), // userId -> claimCount
  };
  lastGlobalEventEnd = activeGlobalEvent.endsAt;
  if (announceFn) announceFn(activeGlobalEvent);
  return { success: true, event: activeGlobalEvent };
}

// Get effect multipliers from active global event
function getGlobalEventMultipliers() {
  const event = getActiveGlobalEvent();
  if (!event) return { auraMultiplier: 1, xpMultiplier: 1, bossRewardMultiplier: 1, craftCostMultiplier: 1, materialDropMultiplier: 1 };
  return {
    auraMultiplier: event.effects.auraMultiplier || 1,
    xpMultiplier: event.effects.xpMultiplier || 1,
    bossRewardMultiplier: event.effects.bossRewardMultiplier || 1,
    craftCostMultiplier: event.effects.craftCostMultiplier || 1,
    materialDropMultiplier: event.effects.materialDropMultiplier || 1,
  };
}

// Claim rewards from a claimable event (treasure hunt, etc.)
function claimGlobalEventReward(userId) {
  const event = getActiveGlobalEvent();
  if (!event) return { error: 'No active global event.' };
  if (!event.claimRewards) return { error: 'This event has no claimable rewards. It provides passive boosts.' };
  const claims = event.claims.get(userId) || 0;
  if (claims >= (event.maxClaims || 1)) return { error: `You've already claimed the maximum (${event.maxClaims}) rewards.` };
  event.claims.set(userId, claims + 1);
  event.participants.add(userId);

  const rewards = { aura: 0, xp: 0, crate: null };
  const cr = event.claimRewards;
  rewards.aura = Math.floor(Math.random() * (cr.aura[1] - cr.aura[0]) + cr.aura[0]);
  rewards.xp = Math.floor(Math.random() * (cr.xp[1] - cr.xp[0]) + cr.xp[0]);
  if (Math.random() < (cr.crateChance || 0)) rewards.crate = cr.crateType || 'common';
  return { success: true, rewards, claimsRemaining: (event.maxClaims || 1) - claims - 1 };
}

// Check if it's time to spawn a new event
function shouldSpawnGlobalEvent() {
  if (getActiveGlobalEvent()) return false;
  if (!lastGlobalEventEnd) return true; // first event
  const now = new Date();
  const hoursSinceEnd = (now - lastGlobalEventEnd) / (1000 * 60 * 60);
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  const minInterval = isWeekend
    ? GLOBAL_EVENT_SCHEDULE.minIntervalHours * GLOBAL_EVENT_SCHEDULE.weekendIntervalReduction
    : GLOBAL_EVENT_SCHEDULE.minIntervalHours;
  return hoursSinceEnd >= minInterval;
}

// Pick a random event weighted by rarity
function pickRandomEvent() {
  const events = Object.values(GLOBAL_EVENTS);
  const totalWeight = events.reduce((sum, e) => sum + (RARITY_WEIGHTS[e.rarity] || 10), 0);
  let roll = Math.random() * totalWeight;
  for (const event of events) {
    roll -= RARITY_WEIGHTS[event.rarity] || 10;
    if (roll <= 0) return event.id;
  }
  return events[0].id;
}

// Auto-spawn logic (call periodically from a setInterval)
function tryAutoSpawnEvent(announceFn = null) {
  if (!shouldSpawnGlobalEvent()) return null;
  // Random chance each check (don't spawn every single time it's eligible)
  if (Math.random() > 0.3) return null;
  const eventId = pickRandomEvent();
  return startGlobalEvent(eventId, announceFn);
}

// Get event display info
function getGlobalEventStatus() {
  const event = getActiveGlobalEvent();
  if (!event) return { active: false, nextPossible: lastGlobalEventEnd ? new Date(lastGlobalEventEnd.getTime() + GLOBAL_EVENT_SCHEDULE.minIntervalHours * 60 * 60 * 1000) : null };
  const remaining = Math.max(0, event.endsAt - new Date());
  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  return {
    active: true,
    event: { id: event.id, name: event.name, description: event.description, icon: event.icon, rarity: event.rarity },
    effects: event.effects,
    timeRemaining: `${hours}h ${minutes}m`,
    endsAt: event.endsAt,
    participantCount: event.participants.size,
  };
}

// Force end current event (admin command)
function endGlobalEvent() {
  if (!activeGlobalEvent) return { error: 'No active event.' };
  const ended = { ...activeGlobalEvent };
  lastGlobalEventEnd = new Date();
  activeGlobalEvent = null;
  return { success: true, ended };
}

module.exports = {
  getActiveGlobalEvent, startGlobalEvent, getGlobalEventMultipliers,
  claimGlobalEventReward, shouldSpawnGlobalEvent, pickRandomEvent,
  tryAutoSpawnEvent, getGlobalEventStatus, endGlobalEvent,
};
