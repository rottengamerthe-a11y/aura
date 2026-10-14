const PET_SPECIES = {
  fox: { id: 'fox', name: 'Shadow Fox', emoji: '🦊', baseStats: { strength: 2, luck: 3, mining: 1, gardening: 1 }, description: 'Quick and cunning. Boosts luck-based rewards.' },
  cat: { id: 'cat', name: 'Mystic Cat', emoji: '🐱', baseStats: { strength: 1, luck: 2, mining: 1, gardening: 3 }, description: 'Serene and wise. Excellent at gardening.' },
  dragon: { id: 'dragon', name: 'Ember Drake', emoji: '🐉', baseStats: { strength: 4, luck: 1, mining: 2, gardening: 0 }, description: 'Fierce and powerful. Dominates in combat.' },
  owl: { id: 'owl', name: 'Sage Owl', emoji: '🦉', baseStats: { strength: 1, luck: 2, mining: 2, gardening: 2 }, description: 'Balanced and observant. Good at everything.' },
  wolf: { id: 'wolf', name: 'Storm Wolf', emoji: '🐺', baseStats: { strength: 3, luck: 2, mining: 2, gardening: 0 }, description: 'Strong and loyal. Great for combat and mining.' },
  bunny: { id: 'bunny', name: 'Lucky Bunny', emoji: '🐰', baseStats: { strength: 0, luck: 4, mining: 1, gardening: 2 }, description: 'Adorable and fortunate. Maximizes luck.' },
  phoenix: { id: 'phoenix', name: 'Phoenix Chick', emoji: '🔥', baseStats: { strength: 3, luck: 2, mining: 1, gardening: 1 }, description: 'Reborn from flame. Strong combat companion.' },
  turtle: { id: 'turtle', name: 'Ancient Turtle', emoji: '🐢', baseStats: { strength: 1, luck: 1, mining: 3, gardening: 2 }, description: 'Patient and enduring. Master miner.' },
};

const PET_FOODS = {
  kibble: { id: 'kibble', name: 'Basic Kibble', emoji: '🍖', cost: 500, hungerRestore: 25, happinessRestore: 5 },
  treat: { id: 'treat', name: 'Tasty Treat', emoji: '🍪', cost: 1200, hungerRestore: 40, happinessRestore: 15 },
  feast: { id: 'feast', name: 'Gourmet Feast', emoji: '🍗', cost: 3000, hungerRestore: 70, happinessRestore: 30 },
  elixir: { id: 'elixir', name: 'Vitality Elixir', emoji: '🧪', cost: 5000, hungerRestore: 100, happinessRestore: 50 },
  premium_treat: { id: 'premium_treat', name: 'Premium Delight', emoji: '✨', cost: 8000, hungerRestore: 100, happinessRestore: 80, premiumOnly: true },
};

const PET_EVOLUTION_THRESHOLDS = { 2: 10, 3: 25 }; // stage: required level
const PET_STAGE_NAMES = { 1: 'Baby', 2: 'Juvenile', 3: 'Adult' };
const PET_MAX_LEVEL = 30;
const PET_XP_PER_LEVEL = 150; // XP needed per level = level * PET_XP_PER_LEVEL
const PET_TRAIN_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours
const PET_PLAY_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours
const PET_HAPPINESS_DECAY_PER_HOUR = 2;
const PET_HUNGER_DECAY_PER_HOUR = 3;
const PET_TRAIN_XP = 50;
const PET_PLAY_HAPPINESS = 25;
const PET_ADOPT_COST = 10000;

module.exports = {
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
};
