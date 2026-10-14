const {
  PET_SPECIES,
  PET_FOODS,
  PET_EVOLUTION_THRESHOLDS,
  PET_STAGE_NAMES,
  PET_MAX_LEVEL,
  PET_XP_PER_LEVEL,
  PET_TRAIN_COOLDOWN_MS,
  PET_PLAY_COOLDOWN_MS,
  PET_HAPPINESS_DECAY_PER_HOUR,
  PET_HUNGER_DECAY_PER_HOUR,
  PET_TRAIN_XP,
  PET_PLAY_HAPPINESS,
  PET_ADOPT_COST
} = require('../config/petConfig');

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatCooldown(ms) {
  if (ms <= 0) return 'Ready';
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function applyPetDecay(user) {
  if (!user.pet || !user.pet.speciesId) return;

  const now = Date.now();
  const lastUpdate = user.pet.lastUpdate || now;
  const hoursPassed = (now - lastUpdate) / (1000 * 60 * 60);

  if (hoursPassed > 0) {
    user.pet.hunger = clamp((user.pet.hunger || 100) - (PET_HUNGER_DECAY_PER_HOUR * hoursPassed), 0, 100);
    user.pet.happiness = clamp((user.pet.happiness || 100) - (PET_HAPPINESS_DECAY_PER_HOUR * hoursPassed), 0, 100);
    user.pet.lastUpdate = now;
  }
}

function adoptPet(user, speciesId, name) {
  if (user.pet && user.pet.speciesId) {
    return { success: false, message: 'You already have a pet!' };
  }
  
  if (!PET_SPECIES[speciesId]) {
    return { success: false, message: 'Invalid pet species.' };
  }

  if ((user.aura || 0) < PET_ADOPT_COST) {
    return { success: false, message: `You need ${PET_ADOPT_COST} Aura to adopt a pet.` };
  }

  user.aura -= PET_ADOPT_COST;

  const species = PET_SPECIES[speciesId];
  user.pet = {
    speciesId,
    name: name || species.name,
    level: 1,
    xp: 0,
    stage: 1,
    hunger: 100,
    happiness: 100,
    lastUpdate: Date.now(),
    stats: { ...species.baseStats },
    lastTrainTime: 0,
    lastPlayTime: 0
  };

  return { success: true, message: `Successfully adopted ${user.pet.name} the ${species.name}!` };
}

function feedPet(user, foodId) {
  applyPetDecay(user);
  
  if (!user.pet || !user.pet.speciesId) {
    return { success: false, message: 'You do not have a pet.' };
  }

  const food = PET_FOODS[foodId];
  if (!food) {
    return { success: false, message: 'Invalid food type.' };
  }

  if ((user.aura || 0) < food.cost) {
    return { success: false, message: `You need ${food.cost} Aura to buy ${food.name}.` };
  }

  if (user.pet.hunger >= 100 && user.pet.happiness >= 100) {
    return { success: false, message: 'Your pet is already full and happy!' };
  }

  user.aura -= food.cost;
  user.pet.hunger = clamp(user.pet.hunger + food.hungerRestore, 0, 100);
  user.pet.happiness = clamp(user.pet.happiness + food.happinessRestore, 0, 100);
  
  return { success: true, message: `You fed ${user.pet.name} a ${food.name}. Hunger and happiness restored!` };
}

function playWithPet(user) {
  applyPetDecay(user);
  
  if (!user.pet || !user.pet.speciesId) {
    return { success: false, message: 'You do not have a pet.' };
  }

  const now = Date.now();
  const timeSincePlay = now - (user.pet.lastPlayTime || 0);
  
  if (timeSincePlay < PET_PLAY_COOLDOWN_MS) {
    const remaining = PET_PLAY_COOLDOWN_MS - timeSincePlay;
    return { success: false, message: `Your pet is tired. You can play again in ${formatCooldown(remaining)}.` };
  }

  user.pet.happiness = clamp((user.pet.happiness || 0) + PET_PLAY_HAPPINESS, 0, 100);
  user.pet.lastPlayTime = now;

  return { success: true, message: `You played with ${user.pet.name}! Happiness increased.` };
}

function trainPet(user, statName) {
  applyPetDecay(user);
  
  if (!user.pet || !user.pet.speciesId) {
    return { success: false, message: 'You do not have a pet.' };
  }

  const validStats = ['strength', 'luck', 'mining', 'gardening'];
  if (!validStats.includes(statName)) {
    return { success: false, message: `Invalid stat. Choose one of: ${validStats.join(', ')}.` };
  }

  const now = Date.now();
  const timeSinceTrain = now - (user.pet.lastTrainTime || 0);
  
  if (timeSinceTrain < PET_TRAIN_COOLDOWN_MS) {
    const remaining = PET_TRAIN_COOLDOWN_MS - timeSinceTrain;
    return { success: false, message: `Your pet needs rest. You can train again in ${formatCooldown(remaining)}.` };
  }

  user.pet.stats[statName] = (user.pet.stats[statName] || 0) + 1;
  user.pet.xp = (user.pet.xp || 0) + PET_TRAIN_XP;
  user.pet.lastTrainTime = now;
  user.pet.hunger = clamp(user.pet.hunger - 10, 0, 100); // Training costs some hunger

  const progression = checkPetProgression(user);
  
  let msg = `You trained ${user.pet.name} in ${statName}! (+1 ${statName}, +${PET_TRAIN_XP} XP)`;
  if (progression.leveledUp) {
    msg += `\n🌟 ${user.pet.name} leveled up to Level ${user.pet.level}!`;
  }
  if (progression.evolved) {
    msg += `\n✨ ${user.pet.name} evolved to Stage ${user.pet.stage} (${PET_STAGE_NAMES[user.pet.stage]})!`;
  }

  return { success: true, message: msg };
}

function checkPetProgression(user) {
  if (!user.pet) return { leveledUp: false, evolved: false };
  
  let leveledUp = false;
  let evolved = false;

  while (user.pet.level < PET_MAX_LEVEL) {
    const xpNeeded = user.pet.level * PET_XP_PER_LEVEL;
    if (user.pet.xp >= xpNeeded) {
      user.pet.level += 1;
      user.pet.xp -= xpNeeded;
      leveledUp = true;
    } else {
      break;
    }
  }

  if (user.pet.level >= PET_MAX_LEVEL) {
    user.pet.level = PET_MAX_LEVEL;
    user.pet.xp = 0;
  }

  if (user.pet.stage < 3) {
    const nextStage = user.pet.stage + 1;
    if (PET_EVOLUTION_THRESHOLDS[nextStage] && user.pet.level >= PET_EVOLUTION_THRESHOLDS[nextStage]) {
      user.pet.stage = nextStage;
      evolved = true;
    }
  }

  return { leveledUp, evolved };
}

function getPetBonuses(user) {
  applyPetDecay(user);

  if (!user.pet || !user.pet.speciesId) {
    return { strength: 0, luck: 0, mining: 0, gardening: 0 };
  }

  const { level, stage, happiness, stats } = user.pet;
  
  let stageMultiplier = 1.0;
  if (stage === 2) stageMultiplier = 1.5;
  if (stage === 3) stageMultiplier = 2.0;

  let happinessMultiplier = 1.0;
  if (happiness < 20) happinessMultiplier = 0.1;
  else if (happiness < 50) happinessMultiplier = 0.4;
  else if (happiness < 80) happinessMultiplier = 0.7;

  const multiplier = (level / 10) * stageMultiplier * happinessMultiplier;

  return {
    strength: Math.floor((stats.strength || 0) * multiplier),
    luck: Math.floor((stats.luck || 0) * multiplier),
    mining: Math.floor((stats.mining || 0) * multiplier),
    gardening: Math.floor((stats.gardening || 0) * multiplier)
  };
}

function renamePet(user, newName) {
  if (!user.pet || !user.pet.speciesId) {
    return { success: false, message: 'You do not have a pet.' };
  }
  
  if (!newName || newName.trim().length === 0 || newName.length > 32) {
    return { success: false, message: 'Invalid name. Must be between 1 and 32 characters.' };
  }

  user.pet.name = newName.trim();
  return { success: true, message: `Successfully renamed your pet to ${user.pet.name}!` };
}

function getPetStatusInfo(user) {
  applyPetDecay(user);
  
  if (!user.pet || !user.pet.speciesId) {
    return null;
  }

  const species = PET_SPECIES[user.pet.speciesId];
  const now = Date.now();
  
  const playCooldown = Math.max(0, PET_PLAY_COOLDOWN_MS - (now - (user.pet.lastPlayTime || 0)));
  const trainCooldown = Math.max(0, PET_TRAIN_COOLDOWN_MS - (now - (user.pet.lastTrainTime || 0)));

  const xpNeeded = user.pet.level >= PET_MAX_LEVEL ? 'MAX' : user.pet.level * PET_XP_PER_LEVEL;
  const stageName = PET_STAGE_NAMES[user.pet.stage] || 'Unknown';
  const bonuses = getPetBonuses(user);

  return {
    name: user.pet.name,
    species: species.name,
    emoji: species.emoji,
    level: user.pet.level,
    xp: user.pet.xp,
    xpNeeded,
    stage: user.pet.stage,
    stageName,
    hunger: Math.floor(user.pet.hunger),
    happiness: Math.floor(user.pet.happiness),
    stats: user.pet.stats,
    bonuses,
    playCooldown: formatCooldown(playCooldown),
    trainCooldown: formatCooldown(trainCooldown)
  };
}

module.exports = {
  adoptPet,
  applyPetDecay,
  feedPet,
  playWithPet,
  trainPet,
  checkPetProgression,
  getPetBonuses,
  renamePet,
  getPetStatusInfo,
  formatCooldown
};
