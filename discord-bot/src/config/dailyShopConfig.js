// src/config/dailyShopConfig.js

const DAILY_SHOP_SLOTS = 5;
const DAILY_SHOP_FEATURED_SLOTS = 1;

const DAILY_SHOP_ITEMS = [
    // Boosts
    { id: "boost_xp_2hr", name: "2 Hour XP Boost", description: "Doubles XP gained from all sources for 2 hours", price: 5000, type: "boost", rarity: "common", dailyShopOnly: true, effects: { xpMultiplier: 2, durationMinutes: 120 } },
    { id: "boost_aura_2hr", name: "2 Hour Aura Boost", description: "Increases Aura gained from activities by 50% for 2 hours", price: 8000, type: "boost", rarity: "uncommon", dailyShopOnly: true, effects: { auraMultiplier: 1.5, durationMinutes: 120 } },
    { id: "boost_mining_luck", name: "Mining Luck Elixir", description: "Greatly increases the chance of finding rare ores for 1 hour", price: 12000, type: "boost", rarity: "rare", dailyShopOnly: true, effects: { miningLuckBoost: 2, durationMinutes: 60 } },
    { id: "boost_garden_speed", name: "Garden Speed Fertilizer", description: "Halves the growth time of crops planted in the next hour", price: 10000, type: "boost", rarity: "uncommon", dailyShopOnly: true, effects: { gardenGrowthSpeed: 2, durationMinutes: 60 } },
    { id: "boost_xp_elixir", name: "XP Elixir", description: "Grants a massive flat amount of XP instantly", price: 18000, type: "boost", rarity: "rare", dailyShopOnly: true, effects: { flatXp: 5000 } },
    { id: "boost_golden_pickaxe", name: "Golden Pickaxe Rent", description: "Use the legendary Golden Pickaxe for 30 minutes, mining 3x faster", price: 25000, type: "boost", rarity: "epic", dailyShopOnly: true, effects: { miningSpeedBoost: 3, durationMinutes: 30 } },

    // Cosmetic titles
    { id: "title_shadow_merchant", name: "Title: Shadow Merchant", description: "Equip the exclusive 'Shadow Merchant' title", price: 15000, type: "cosmetic", rarity: "rare", dailyShopOnly: true, effects: { grantTitle: "Shadow Merchant" } },
    { id: "title_night_owl", name: "Title: Night Owl", description: "Equip the 'Night Owl' title", price: 10000, type: "cosmetic", rarity: "uncommon", dailyShopOnly: true, effects: { grantTitle: "Night Owl" } },
    { id: "title_fortunes_fool", name: "Title: Fortune's Fool", description: "Equip the 'Fortune's Fool' title", price: 5000, type: "cosmetic", rarity: "common", dailyShopOnly: true, effects: { grantTitle: "Fortune's Fool" } },
    { id: "title_daily_devotee", name: "Title: Daily Devotee", description: "Equip the 'Daily Devotee' title", price: 25000, type: "cosmetic", rarity: "epic", dailyShopOnly: true, effects: { grantTitle: "Daily Devotee" } },
    { id: "title_time_traveler", name: "Title: Time Traveler", description: "Equip the 'Time Traveler' title", price: 50000, type: "cosmetic", rarity: "legendary", dailyShopOnly: true, effects: { grantTitle: "Time Traveler" } },

    // Exclusive crates
    { id: "crate_daily", name: "Daily Crate", description: "A crate containing a random assortment of common and uncommon items", price: 8000, type: "crate", rarity: "common", dailyShopOnly: true, effects: { grantCrate: "daily_crate" } },
    { id: "crate_mystery_box", name: "Mystery Box", description: "Could contain anything from 1 Aura to a legendary cosmetic!", price: 15000, type: "crate", rarity: "rare", dailyShopOnly: true, effects: { grantCrate: "mystery_box" } },
    { id: "crate_epic_stash", name: "Epic Stash", description: "Guaranteed to contain epic quality materials or cosmetics", price: 40000, type: "crate", rarity: "epic", dailyShopOnly: true, effects: { grantCrate: "epic_stash" } },
    { id: "crate_legendary_cache", name: "Legendary Cache", description: "A legendary cache with god-tier loot", price: 80000, type: "crate", rarity: "legendary", dailyShopOnly: true, effects: { grantCrate: "legendary_cache" } },

    // Material bundles
    { id: "bundle_iron", name: "Iron Bundle", description: "Contains 5x Iron Ore", price: 2000, type: "material_bundle", rarity: "common", dailyShopOnly: true, effects: { grantItems: { "iron_ore": 5 } } },
    { id: "bundle_gold", name: "Gold Bundle", description: "Contains 3x Gold Ore", price: 5000, type: "material_bundle", rarity: "uncommon", dailyShopOnly: true, effects: { grantItems: { "gold_ore": 3 } } },
    { id: "bundle_crystal", name: "Crystal Bundle", description: "Contains 3x Crystal", price: 8000, type: "material_bundle", rarity: "rare", dailyShopOnly: true, effects: { grantItems: { "crystal": 3 } } },
    { id: "bundle_gemstones", name: "Gemstone Pouch", description: "Contains 2x Ruby, 2x Sapphire, 2x Emerald", price: 15000, type: "material_bundle", rarity: "epic", dailyShopOnly: true, effects: { grantItems: { "ruby": 2, "sapphire": 2, "emerald": 2 } } },
    { id: "bundle_star_fragments", name: "Star Fragments", description: "Contains 1x Star Fragment", price: 30000, type: "material_bundle", rarity: "legendary", dailyShopOnly: true, effects: { grantItems: { "star_fragment": 1 } } },
    { id: "bundle_wood", name: "Lumberjack's Stash", description: "Contains 50x Wood", price: 3000, type: "material_bundle", rarity: "common", dailyShopOnly: true, effects: { grantItems: { "wood": 50 } } },
    { id: "bundle_stone", name: "Mason's Supply", description: "Contains 50x Stone", price: 3000, type: "material_bundle", rarity: "common", dailyShopOnly: true, effects: { grantItems: { "stone": 50 } } },

    // Rare items
    { id: "item_lucky_charm", name: "Lucky Charm", description: "Permanently increases luck by a small amount while in inventory", price: 45000, type: "cosmetic", rarity: "legendary", dailyShopOnly: true, effects: { grantItems: { "lucky_charm": 1 } } },
    { id: "item_phoenix_feather", name: "Phoenix Feather", description: "Saves you from death once in combat", price: 60000, type: "boost", rarity: "legendary", dailyShopOnly: true, effects: { grantItems: { "phoenix_feather": 1 } } }
];

module.exports = {
    DAILY_SHOP_SLOTS,
    DAILY_SHOP_FEATURED_SLOTS,
    DAILY_SHOP_ITEMS
};
