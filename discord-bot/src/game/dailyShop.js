// src/game/dailyShop.js

const { DAILY_SHOP_ITEMS, DAILY_SHOP_SLOTS, DAILY_SHOP_FEATURED_SLOTS } = require('../config/dailyShopConfig');

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

function getRarityByWeight(randFunc, isFeatured) {
    if (isFeatured) {
        // Featured slot picks from epic (66.6%) / legendary (33.3%)
        const roll = randFunc();
        if (roll < 0.666) return "epic";
        return "legendary";
    }

    // Normal slot weights: common 40%, uncommon 25%, rare 20%, epic 10%, legendary 5%
    const roll = randFunc();
    if (roll < 0.40) return "common";
    else if (roll < 0.65) return "uncommon";
    else if (roll < 0.85) return "rare";
    else if (roll < 0.95) return "epic";
    return "legendary";
}

function getDailyShopItems(date = new Date()) {
    const dateStr = date.toISOString().slice(0, 10);
    const rand = seededRandom(dateStr);

    const itemsByRarity = {
        common: DAILY_SHOP_ITEMS.filter(i => i.rarity === 'common'),
        uncommon: DAILY_SHOP_ITEMS.filter(i => i.rarity === 'uncommon'),
        rare: DAILY_SHOP_ITEMS.filter(i => i.rarity === 'rare'),
        epic: DAILY_SHOP_ITEMS.filter(i => i.rarity === 'epic'),
        legendary: DAILY_SHOP_ITEMS.filter(i => i.rarity === 'legendary')
    };

    const shop = [];
    const selectedIds = new Set();

    // Select featured items
    for (let i = 0; i < DAILY_SHOP_FEATURED_SLOTS; i++) {
        const rarity = getRarityByWeight(rand, true);
        const pool = itemsByRarity[rarity].filter(item => !selectedIds.has(item.id));
        if (pool.length > 0) {
            const index = Math.floor(rand() * pool.length);
            const item = pool[index];
            shop.push({ ...item, isFeatured: true });
            selectedIds.add(item.id);
        }
    }

    // Select regular items
    const regularSlots = DAILY_SHOP_SLOTS - DAILY_SHOP_FEATURED_SLOTS;
    for (let i = 0; i < regularSlots; i++) {
        const rarity = getRarityByWeight(rand, false);
        const pool = itemsByRarity[rarity].filter(item => !selectedIds.has(item.id));
        if (pool.length > 0) {
            const index = Math.floor(rand() * pool.length);
            const item = pool[index];
            shop.push({ ...item, isFeatured: false });
            selectedIds.add(item.id);
        }
    }

    return shop;
}

function validateDailyShopPurchase(user, itemId, date = new Date()) {
    const shopItems = getDailyShopItems(date);
    const shopItem = shopItems.find(i => i.id === itemId);

    if (!shopItem) {
        return null; // Not in today's rotation
    }

    const dateStr = date.toISOString().slice(0, 10);
    let alreadyPurchased = false;

    if (user.stats && user.stats.dailyShopPurchases) {
        if (user.stats.dailyShopPurchases instanceof Map) {
            alreadyPurchased = user.stats.dailyShopPurchases.get(itemId) === dateStr;
        } else {
            alreadyPurchased = user.stats.dailyShopPurchases[itemId] === dateStr;
        }
    }

    return { item: shopItem, alreadyPurchased };
}

async function purchaseDailyShopItem(user, itemId) {
    const date = new Date();
    const validation = validateDailyShopPurchase(user, itemId, date);

    if (!validation) {
        throw new Error("This item is not in today's daily shop rotation.");
    }
    if (validation.alreadyPurchased) {
        throw new Error("You have already purchased this item today.");
    }

    const item = validation.item;

    if ((user.aura || 0) < item.price) {
        throw new Error(`You need ${item.price} Aura to buy this item.`);
    }

    // Deduct aura
    user.aura -= item.price;

    // Apply effects
    if (item.type === 'boost' && item.effects.durationMinutes) {
        if (!user.activeBoosts) user.activeBoosts = [];
        const expiry = new Date(Date.now() + item.effects.durationMinutes * 60000);
        user.activeBoosts.push({
            id: item.id,
            type: Object.keys(item.effects).find(k => k !== 'durationMinutes'),
            expiry: expiry
        });
    } else if (item.type === 'cosmetic' && item.effects.grantTitle) {
        if (!user.cosmetics) user.cosmetics = {};
        if (!user.cosmetics.unlockedTitles) user.cosmetics.unlockedTitles = [];
        if (!user.cosmetics.unlockedTitles.includes(item.effects.grantTitle)) {
            user.cosmetics.unlockedTitles.push(item.effects.grantTitle);
        }
    } else if (item.effects.grantCrate) {
        if (!user.inventory) user.inventory = {};
        const crateId = item.effects.grantCrate;
        user.inventory[crateId] = (user.inventory[crateId] || 0) + 1;
    } else if (item.effects.grantItems) {
        if (!user.inventory) user.inventory = {};
        for (const [grantId, amount] of Object.entries(item.effects.grantItems)) {
            user.inventory[grantId] = (user.inventory[grantId] || 0) + amount;
        }
    } else if (item.effects.flatXp) {
        user.xp = (user.xp || 0) + item.effects.flatXp;
    }

    // Track purchase
    if (!user.stats) user.stats = {};
    if (!user.stats.dailyShopPurchases) {
        user.stats.dailyShopPurchases = new Map();
    }
    
    const dateStr = date.toISOString().slice(0, 10);
    
    if (user.stats.dailyShopPurchases instanceof Map) {
        user.stats.dailyShopPurchases.set(itemId, dateStr);
    } else {
        user.stats.dailyShopPurchases[itemId] = dateStr;
    }

    await user.save();
    return item;
}

function getTimeUntilRotation() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCHours(24, 0, 0, 0); // Next UTC midnight
    const diffMs = tomorrow - now;
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    return { hours, minutes, ms: diffMs };
}

module.exports = {
    getDailyShopItems,
    validateDailyShopPurchase,
    purchaseDailyShopItem,
    getTimeUntilRotation
};
