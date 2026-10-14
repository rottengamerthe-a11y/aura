const WEEKLY_CHALLENGE_TEMPLATES = [
  { id: "weekly_grinder", name: "Shift Grinder", description: "Complete work 15 times this week.", goal: 15, metric: "works", rewardAura: 3500, rewardXp: 1200, icon: "⚒️" },
  { id: "weekly_miner", name: "Deep Excavator", description: "Mine 12 times this week.", goal: 12, metric: "mines", rewardAura: 3800, rewardXp: 1400, icon: "⛏️" },
  { id: "weekly_slayer", name: "Boss Hunter", description: "Defeat 5 bosses this week.", goal: 5, metric: "bossWins", rewardAura: 6000, rewardXp: 2500, icon: "🐉" },
  { id: "weekly_gambler", name: "High Roller", description: "Win 10 coinflips this week.", goal: 10, metric: "coinflipWins", rewardAura: 4200, rewardXp: 1600, icon: "🎰" },
  { id: "weekly_social", name: "Community Pillar", description: "Appreciate 5 players this week.", goal: 5, metric: "appreciations", rewardAura: 3000, rewardXp: 1000, icon: "💬" },
  { id: "weekly_crafter", name: "Master Crafter", description: "Craft 4 items this week.", goal: 4, metric: "crafts", rewardAura: 4500, rewardXp: 1800, icon: "🔨" },
  { id: "weekly_summoner", name: "Relic Seeker", description: "Summon 8 relics this week.", goal: 8, metric: "summons", rewardAura: 5000, rewardXp: 2000, icon: "✨" },
  { id: "weekly_farmer", name: "Green Thumb", description: "Harvest 6 crops this week.", goal: 6, metric: "harvests", rewardAura: 3200, rewardXp: 1100, icon: "🌿" },
  { id: "weekly_collector", name: "Crate Cracker", description: "Open 10 crates this week.", goal: 10, metric: "cratesOpened", rewardAura: 4000, rewardXp: 1500, icon: "📦" },
  { id: "weekly_warrior", name: "Arena Champion", description: "Win 5 PvP battles this week.", goal: 5, metric: "pvpWins", rewardAura: 5500, rewardXp: 2200, icon: "⚔️" },
  { id: "weekly_explorer", name: "Expedition Master", description: "Complete 4 expeditions this week.", goal: 4, metric: "expeditions", rewardAura: 4800, rewardXp: 1900, icon: "🗺️" },
  { id: "weekly_donor", name: "Generous Soul", description: "Gift 20,000 aura to other players this week.", goal: 20000, metric: "gifted", rewardAura: 5000, rewardXp: 2000, icon: "🎁" },
  { id: "weekly_spinner", name: "Lucky Star", description: "Use the spin wheel 10 times this week.", goal: 10, metric: "spins", rewardAura: 3000, rewardXp: 1000, icon: "🌟" },
  { id: "weekly_voter", name: "Faithful Voter", description: "Vote for Aurix 4 times this week.", goal: 4, metric: "votes", rewardAura: 4000, rewardXp: 1500, icon: "🗳️" },
  { id: "weekly_devotee", name: "Daily Devotee", description: "Claim your daily reward 7 days in a row.", goal: 7, metric: "dailyClaims", rewardAura: 5000, rewardXp: 2000, icon: "📅" },
];

function seededRandom(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function getCurrentWeekId(date = new Date()) {
  const target = new Date(date.valueOf());
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7);
  }
  const weekNumber = 1 + Math.ceil((firstThursday - target) / 604800000);
  return `${target.getUTCFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
}

function getWeeklyChallenges(date = new Date()) {
  const weekId = getCurrentWeekId(date);
  const random = seededRandom(weekId);
  const available = [...WEEKLY_CHALLENGE_TEMPLATES];
  const selected = [];
  
  for (let i = 0; i < 3; i++) {
    if (available.length === 0) break;
    const index = Math.floor(random() * available.length);
    selected.push(available.splice(index, 1)[0]);
  }
  
  return selected;
}

function getOrResetWeeklyChallenges(user, date = new Date()) {
  const currentWeekId = getCurrentWeekId(date);
  const userWeekId = user.lastWeeklyResetAt ? getCurrentWeekId(new Date(user.lastWeeklyResetAt)) : null;

  const currentWeeklyTemplates = getWeeklyChallenges(date);

  if (currentWeekId !== userWeekId || !user.weeklyChallenges || user.weeklyChallenges.length === 0) {
    user.weeklyChallenges = currentWeeklyTemplates.map(t => ({
      id: t.id,
      progress: 0,
      completed: false,
      claimedAt: null
    }));
    user.lastWeeklyResetAt = date;
  }

  return user.weeklyChallenges;
}

function incrementWeeklyProgress(user, metric, amount = 1) {
  const challenges = getOrResetWeeklyChallenges(user);
  const currentWeeklyTemplates = getWeeklyChallenges(new Date());
  const newlyCompleted = [];

  for (let i = 0; i < challenges.length; i++) {
    const userChallenge = challenges[i];
    if (userChallenge.completed) continue;

    const template = currentWeeklyTemplates.find(t => t.id === userChallenge.id);
    if (!template) continue;

    if (template.metric === metric) {
      userChallenge.progress += amount;
      if (userChallenge.progress >= template.goal) {
        userChallenge.progress = template.goal;
        userChallenge.completed = true;
        newlyCompleted.push(template);
      }
    }
  }

  return newlyCompleted;
}

function claimWeeklyChallenge(user, challengeId) {
  const challenges = getOrResetWeeklyChallenges(user);
  const userChallenge = challenges.find(c => c.id === challengeId);

  if (!userChallenge) return null;
  if (!userChallenge.completed) return null;
  if (userChallenge.claimedAt) return null;

  const template = WEEKLY_CHALLENGE_TEMPLATES.find(t => t.id === challengeId);
  if (!template) return null;

  userChallenge.claimedAt = new Date();
  
  return {
    aura: template.rewardAura,
    xp: template.rewardXp
  };
}

function getTimeUntilWeeklyReset() {
  const now = new Date();
  const nextMonday = new Date(now.getTime());
  nextMonday.setUTCDate(now.getUTCDate() + ((1 - now.getUTCDay() + 7) % 7));
  if (now.getUTCDay() === 1 && now.getUTCHours() === 0 && now.getUTCMinutes() === 0 && now.getUTCSeconds() === 0 && now.getUTCMilliseconds() === 0) {
      // exactly on reset, time is 7 days
      nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);
  } else if (now.getUTCDay() === 1) {
      nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);
  }
  nextMonday.setUTCHours(0, 0, 0, 0);
  return nextMonday.getTime() - now.getTime();
}

function formatTimeRemaining(ms) {
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${days}d ${hours}h ${minutes}m`;
}

module.exports = {
  WEEKLY_CHALLENGE_TEMPLATES,
  getCurrentWeekId,
  getWeeklyChallenges,
  getOrResetWeeklyChallenges,
  incrementWeeklyProgress,
  claimWeeklyChallenge,
  getTimeUntilWeeklyReset,
  formatTimeRemaining
};
