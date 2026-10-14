const SEASONS = {
  spring: { months: [3, 4, 5], name: 'Spring Bloom', emoji: '🌸', color: 0x7CFC00,
    shopItems: [
      { id: 'spring_blossom', name: 'Cherry Blossom Charm', price: 15000, type: 'cosmetic', description: 'A fragrant cherry blossom accessory.' },
      { id: 'spring_seed_pack', name: 'Spring Seed Pack', price: 8000, type: 'material_bundle', description: '5x Spring Seeds for your garden.', grants: { springSeeds: 5 } },
      { id: 'spring_crate', name: 'Blossom Crate', price: 12000, type: 'crate', description: 'A crate blooming with spring rewards.' },
    ],
    backgrounds: ['spring_garden', 'cherry_blossoms'],
    titles: ['Spring Wanderer', 'Blossom Guardian'],
    xpEvent: { multiplier: 1.15, name: 'Spring Growth' },
  },
  summer: { months: [6, 7, 8], name: 'Summer Inferno', emoji: '☀️', color: 0xFF8C00,
    shopItems: [
      { id: 'summer_flame', name: 'Sunfire Pendant', price: 18000, type: 'cosmetic', description: 'Burns with the power of the sun.' },
      { id: 'summer_ice_cream', name: 'Golden Ice Cream', price: 5000, type: 'consumable', description: '+20% work reward for 2 hours.', duration: 7200000, boost: { workAuraBoost: 0.2 } },
      { id: 'summer_crate', name: 'Inferno Crate', price: 15000, type: 'crate', description: 'Forged in summer heat.' },
    ],
    backgrounds: ['beach_sunset', 'volcanic_summer'],
    titles: ['Sun Warrior', 'Inferno Master'],
    xpEvent: { multiplier: 1.0, name: null },
    auraEvent: { multiplier: 1.15, name: 'Summer Fortune' },
  },
  autumn: { months: [9, 10, 11], name: 'Autumn Harvest', emoji: '🍂', color: 0xD2691E,
    shopItems: [
      { id: 'autumn_lantern', name: 'Harvest Lantern', price: 14000, type: 'cosmetic', description: 'Guides you through the harvest.' },
      { id: 'autumn_feast', name: 'Harvest Feast', price: 10000, type: 'consumable', description: '+30% garden yield for next 3 harvests.', harvests: 3 },
      { id: 'autumn_crate', name: 'Harvest Crate', price: 12000, type: 'crate', description: 'Filled with autumn bounty.' },
      { id: 'halloween_mask', name: 'Spooky Mask', price: 25000, type: 'cosmetic', description: 'A terrifying mask.', monthOnly: 10 },
    ],
    backgrounds: ['autumn_forest', 'halloween_night'],
    titles: ['Harvest King', 'Pumpkin Lord'],
    xpEvent: { multiplier: 1.1, name: 'Harvest Wisdom' },
  },
  winter: { months: [12, 1, 2], name: 'Winter Frost', emoji: '❄️', color: 0x87CEEB,
    shopItems: [
      { id: 'winter_crown', name: 'Frost Crown', price: 20000, type: 'cosmetic', description: 'A crown of eternal ice.' },
      { id: 'winter_gift', name: 'Mystery Gift Box', price: 8000, type: 'crate', description: 'A wrapped surprise from the frost lands.' },
      { id: 'winter_crate', name: 'Frost Crate', price: 14000, type: 'crate', description: 'Frozen treasures within.' },
      { id: 'santa_hat', name: 'Santa Hat', price: 30000, type: 'cosmetic', description: 'Ho ho ho!', monthOnly: 12 },
    ],
    backgrounds: ['winter_wonderland', 'northern_lights'],
    titles: ['Frost Walker', 'Ice Emperor'],
    xpEvent: { multiplier: 1.2, name: 'Winter Wisdom' },
  },
};

// Get current season based on month
function getCurrentSeason(date = new Date()) {
  const month = date.getMonth() + 1;
  for (const [id, season] of Object.entries(SEASONS)) {
    if (season.months.includes(month)) return { id, ...season };
  }
  return { id: 'spring', ...SEASONS.spring };
}

// Get seasonal shop items (filtered by current month for month-exclusive items)
function getSeasonalShopItems(date = new Date()) {
  const season = getCurrentSeason(date);
  const month = date.getMonth() + 1;
  return season.shopItems.filter(item => !item.monthOnly || item.monthOnly === month);
}

// Get seasonal multipliers
function getSeasonalMultipliers(date = new Date()) {
  const season = getCurrentSeason(date);
  return {
    xp: season.xpEvent?.multiplier || 1.0,
    aura: season.auraEvent?.multiplier || 1.0,
    xpEventName: season.xpEvent?.name || null,
    auraEventName: season.auraEvent?.name || null,
  };
}

// Get available seasonal backgrounds
function getSeasonalBackgrounds(date = new Date()) {
  return getCurrentSeason(date).backgrounds || [];
}

// Get available seasonal titles
function getSeasonalTitles(date = new Date()) {
  return getCurrentSeason(date).titles || [];
}

// Get season info for display
function getSeasonInfo(date = new Date()) {
  const season = getCurrentSeason(date);
  const month = date.getMonth();
  const lastMonthOfSeason = Math.max(...season.months);
  const endDate = new Date(date.getFullYear(), lastMonthOfSeason, 0);
  const daysRemaining = Math.max(0, Math.ceil((endDate - date) / (86400000)));
  return { id: season.id, name: season.name, emoji: season.emoji, color: season.color, daysRemaining, endDate };
}

// Check if a seasonal item is available right now
function isSeasonalItemAvailable(itemId, date = new Date()) {
  const items = getSeasonalShopItems(date);
  return items.some(i => i.id === itemId);
}

module.exports = {
  SEASONS, getCurrentSeason, getSeasonalShopItems, getSeasonalMultipliers,
  getSeasonalBackgrounds, getSeasonalTitles, getSeasonInfo, isSeasonalItemAvailable,
};
