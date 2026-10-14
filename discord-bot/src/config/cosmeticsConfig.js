const BACKGROUNDS = {
  midnight: { id: 'midnight', name: 'Midnight Aura', description: 'Deep purple starfield', price: 15000, source: 'shop' },
  sunset: { id: 'sunset', name: 'Golden Sunset', description: 'Warm orange gradient', price: 12000, source: 'shop' },
  ocean: { id: 'ocean', name: 'Deep Ocean', description: 'Blue underwater scene', price: 12000, source: 'shop' },
  forest: { id: 'forest', name: 'Enchanted Forest', description: 'Mystical green woodland', price: 15000, source: 'shop' },
  volcano: { id: 'volcano', name: 'Volcanic Forge', description: 'Fiery lava landscape', price: 20000, source: 'shop' },
  crystal: { id: 'crystal', name: 'Crystal Cavern', description: 'Sparkling crystal cave', price: 25000, source: 'shop' },
  nebula: { id: 'nebula', name: 'Cosmic Nebula', description: 'Swirling space colors', price: 30000, source: 'shop' },
  aurora: { id: 'aurora', name: 'Northern Lights', description: 'Dancing aurora borealis', price: 35000, source: 'shop' },
  shadow: { id: 'shadow', name: 'Shadow Realm', description: 'Dark ethereal void', price: 40000, source: 'achievement', achievement: 'prestige_5' },
  golden: { id: 'golden', name: 'Golden Hall', description: 'Opulent gold throne room', price: 50000, source: 'achievement', achievement: 'aura_millionaire' },
  seasonal_autumn: { id: 'seasonal_autumn', name: 'Autumn Leaves', description: 'Falling leaves scene', price: 0, source: 'seasonal' },
  seasonal_winter: { id: 'seasonal_winter', name: 'Winter Wonderland', description: 'Snowy landscape', price: 0, source: 'seasonal' },
};

const BADGES = {
  early_adopter: { id: 'early_adopter', name: 'Early Adopter', emoji: '🌱', description: 'Joined during beta', source: 'special' },
  grinder: { id: 'grinder', name: 'Grinder', emoji: '⚒️', description: 'Completed 100 work shifts', source: 'achievement', metric: 'works', goal: 100 },
  boss_slayer: { id: 'boss_slayer', name: 'Boss Slayer', emoji: '🐉', description: 'Defeated 50 bosses', source: 'achievement', metric: 'bossWins', goal: 50 },
  pvp_master: { id: 'pvp_master', name: 'PvP Master', emoji: '⚔️', description: 'Won 30 PvP battles', source: 'achievement', metric: 'pvpWins', goal: 30 },
  millionaire: { id: 'millionaire', name: 'Millionaire', emoji: '💰', description: 'Held 1,000,000 aura', source: 'achievement' },
  collector: { id: 'collector', name: 'Collector', emoji: '✨', description: 'Own 25 unique relics', source: 'achievement' },
  voter: { id: 'voter', name: 'Faithful Voter', emoji: '🗳️', description: 'Voted 50 times', source: 'achievement', metric: 'votes', goal: 50 },
  crafter: { id: 'crafter', name: 'Master Crafter', emoji: '🔨', description: 'Crafted 30 items', source: 'achievement', metric: 'crafts', goal: 30 },
  streak_king: { id: 'streak_king', name: 'Streak King', emoji: '🔥', description: '30 day daily streak', source: 'achievement' },
  premium: { id: 'premium', name: 'Premium', emoji: '👑', description: 'Active premium subscriber', source: 'premium' },
  pet_master: { id: 'pet_master', name: 'Pet Master', emoji: '🐾', description: 'Pet reached level 30', source: 'achievement' },
  high_roller: { id: 'high_roller', name: 'High Roller', emoji: '🎰', description: 'Won 50,000+ in casino', source: 'achievement' },
};

const NAME_COLORS = {
  gold: { id: 'gold', name: 'Gold', hex: '#FFD700', price: 20000, premiumOnly: false },
  crimson: { id: 'crimson', name: 'Crimson', hex: '#DC143C', price: 20000, premiumOnly: false },
  sapphire: { id: 'sapphire', name: 'Sapphire', hex: '#0F52BA', price: 20000, premiumOnly: false },
  emerald: { id: 'emerald', name: 'Emerald', hex: '#50C878', price: 20000, premiumOnly: false },
  amethyst: { id: 'amethyst', name: 'Amethyst', hex: '#9966CC', price: 25000, premiumOnly: true },
  rose: { id: 'rose', name: 'Rose', hex: '#FF007F', price: 25000, premiumOnly: true },
  platinum: { id: 'platinum', name: 'Platinum', hex: '#E5E4E2', price: 30000, premiumOnly: true },
  rainbow: { id: 'rainbow', name: 'Rainbow', hex: '#FF6B6B', price: 50000, premiumOnly: true },
};

module.exports = {
  BACKGROUNDS,
  BADGES,
  NAME_COLORS
};
