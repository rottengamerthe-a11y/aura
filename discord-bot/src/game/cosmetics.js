const { BACKGROUNDS, BADGES, NAME_COLORS } = require('../config/cosmeticsConfig');

// Get all cosmetics owned by a player (from purchases, achievements, premium)
function getOwnedCosmetics(user) {
  return {
    backgrounds: user.ownedBackgrounds || [],
    badges: user.ownedBadges || [],
    nameColors: user.ownedNameColors || [],
    titles: user.ownedTitles || [],
    frames: user.ownedFrames || []
  };
}

// Check earned badges based on user stats
function getEarnedBadges(user) {
  const earned = [];
  const stats = user.stats || {};
  
  for (const [key, badge] of Object.entries(BADGES)) {
    if (badge.source === 'achievement') {
      if (badge.metric && stats[badge.metric] >= badge.goal) {
        earned.push(key);
      } else if (badge.id === 'millionaire' && stats.maxAura && stats.maxAura >= 1000000) {
        earned.push(key);
      } else if (badge.id === 'pet_master' && user.pet && user.pet.level >= 30) {
        earned.push(key);
      }
    } else if (badge.source === 'premium' && user.isPremium) {
      earned.push(key);
    }
  }
  
  return earned;
}

// Equip a cosmetic - validates ownership, sets in user.cosmetics
function equipCosmetic(user, slot, itemId) {
  const slotMap = {
    background: { activeField: 'activeBackground', ownedField: 'ownedBackgrounds', items: BACKGROUNDS },
    badge: { activeField: 'activeBadge', ownedField: 'ownedBadges', items: BADGES },
    nameColor: { activeField: 'activeNameColor', ownedField: 'ownedNameColors', items: NAME_COLORS },
    title: { activeField: 'activeTitle', ownedField: 'ownedTitles', items: null },
    frame: { activeField: 'activeFrame', ownedField: 'ownedFrames', items: null },
  };

  const slotData = slotMap[slot];
  if (!slotData) throw new Error('Invalid cosmetic slot.');

  // Validation based on slot type
  if (slot === 'badge') {
    const earned = getEarnedBadges(user);
    if (!earned.includes(itemId) && (!user[slotData.ownedField] || !user[slotData.ownedField].includes(itemId))) {
      throw new Error('You do not own this badge.');
    }
  } else {
    if (!user[slotData.ownedField] || !user[slotData.ownedField].includes(itemId)) {
      throw new Error(`You do not own this ${slot}.`);
    }
  }

  if (slotData.items && !slotData.items[itemId]) {
    throw new Error('Cosmetic item not found.');
  }

  user[slotData.activeField] = itemId;
  return true;
}

// Purchase a cosmetic - deducts aura, adds to owned list
function purchaseCosmetic(user, slot, itemId) {
  const slotMap = {
    background: { ownedField: 'ownedBackgrounds', items: BACKGROUNDS },
    nameColor: { ownedField: 'ownedNameColors', items: NAME_COLORS },
  };

  const slotData = slotMap[slot];
  if (!slotData) throw new Error('You cannot purchase cosmetics for this slot.');

  const itemDef = slotData.items[itemId];
  if (!itemDef) throw new Error('Item not found.');
  if (itemDef.source && itemDef.source !== 'shop') throw new Error('This item cannot be purchased in the shop.');

  if (itemDef.premiumOnly && !user.isPremium) {
    throw new Error('This item is exclusive to Premium users.');
  }

  if (!user[slotData.ownedField]) user[slotData.ownedField] = [];
  if (user[slotData.ownedField].includes(itemId)) {
    throw new Error('You already own this cosmetic.');
  }

  if (user.aura < itemDef.price) {
    throw new Error('You do not have enough aura to purchase this.');
  }

  user.aura -= itemDef.price;
  user[slotData.ownedField].push(itemId);

  return itemDef;
}

// Get available cosmetics for purchase (not yet owned)
function getAvailableCosmetics(user) {
  const available = {
    backgrounds: [],
    nameColors: []
  };

  const ownedBackgrounds = user.ownedBackgrounds || [];
  for (const [key, bg] of Object.entries(BACKGROUNDS)) {
    if (bg.source === 'shop' && !ownedBackgrounds.includes(key)) {
      available.backgrounds.push(bg);
    }
  }

  const ownedColors = user.ownedNameColors || [];
  for (const [key, color] of Object.entries(NAME_COLORS)) {
    if (!ownedColors.includes(key)) {
      available.nameColors.push(color);
    }
  }

  return available;
}

// Unequip a cosmetic slot
function unequipCosmetic(user, slot) {
  const activeFields = {
    background: 'activeBackground',
    badge: 'activeBadge',
    nameColor: 'activeNameColor',
    title: 'activeTitle',
    frame: 'activeFrame'
  };

  const field = activeFields[slot];
  if (!field) throw new Error('Invalid cosmetic slot.');

  user[field] = null;
  return true;
}

module.exports = {
  getOwnedCosmetics,
  getEarnedBadges,
  equipCosmetic,
  purchaseCosmetic,
  getAvailableCosmetics,
  unequipCosmetic
};
