// XP needed to reach each tier: tier 1 = 500, each subsequent tier adds 100 more
// So tier 1 = 500 XP, tier 2 = 1100 total, tier 3 = 1800 total, etc.
const BATTLE_PASS_TIER_XP = [];
let cumulative = 0;
for (let i = 1; i <= 30; i++) {
  cumulative += 400 + (i * 100);
  BATTLE_PASS_TIER_XP.push(cumulative);
}

const BATTLE_PASS_PRICE_AURA = 25000; // in-game currency price
const BATTLE_PASS_PRICE_USD = 4.99; // real money price via Paddle

// Each tier has a free reward and a paid reward
const BATTLE_PASS_TIERS = [
  { tier: 1, free: { aura: 500 }, paid: { aura: 1500 } },
  { tier: 2, free: { xp: 200 }, paid: { aura: 1000, materials: { iron_ore: 3 } } },
  { tier: 3, free: { aura: 800 }, paid: { crate: 'common', quantity: 2 } },
  { tier: 4, free: { xp: 300 }, paid: { aura: 2000 } },
  { tier: 5, free: { crate: 'common', quantity: 1 }, paid: { crate: 'rare', quantity: 1, title: 'Trailblazer' } },
  { tier: 6, free: { aura: 1000 }, paid: { aura: 2500 } },
  { tier: 7, free: { xp: 400 }, paid: { materials: { crystal_shard: 2, iron_ore: 5 } } },
  { tier: 8, free: { aura: 1200 }, paid: { aura: 3000 } },
  { tier: 9, free: { xp: 500 }, paid: { crate: 'rare', quantity: 1 } },
  { tier: 10, free: { aura: 1500 }, paid: { aura: 4000, title: 'Season Warrior', badge: 'season_warrior' } },
  { tier: 11, free: { xp: 600 }, paid: { aura: 3500 } },
  { tier: 12, free: { aura: 1800 }, paid: { materials: { gold_nugget: 3, crystal_shard: 3 } } },
  { tier: 13, free: { xp: 700 }, paid: { crate: 'rare', quantity: 2 } },
  { tier: 14, free: { aura: 2000 }, paid: { aura: 5000 } },
  { tier: 15, free: { crate: 'rare', quantity: 1 }, paid: { crate: 'epic', quantity: 1, background: 'bp_flames' } },
  { tier: 16, free: { xp: 800 }, paid: { aura: 4500 } },
  { tier: 17, free: { aura: 2500 }, paid: { materials: { dragon_scale: 2, gold_nugget: 5 } } },
  { tier: 18, free: { xp: 900 }, paid: { crate: 'rare', quantity: 2 } },
  { tier: 19, free: { aura: 3000 }, paid: { aura: 6000 } },
  { tier: 20, free: { aura: 3500 }, paid: { aura: 8000, title: 'Season Champion', nameColor: 'seasonal' } },
  { tier: 21, free: { xp: 1000 }, paid: { aura: 5500 } },
  { tier: 22, free: { aura: 4000 }, paid: { crate: 'epic', quantity: 1 } },
  { tier: 23, free: { xp: 1200 }, paid: { materials: { dragon_scale: 3, crystal_shard: 5 } } },
  { tier: 24, free: { aura: 4500 }, paid: { aura: 7000 } },
  { tier: 25, free: { crate: 'rare', quantity: 1 }, paid: { crate: 'epic', quantity: 1, petSkin: 'seasonal' } },
  { tier: 26, free: { xp: 1500 }, paid: { aura: 8000 } },
  { tier: 27, free: { aura: 5000 }, paid: { crate: 'rare', quantity: 3 } },
  { tier: 28, free: { xp: 1800 }, paid: { aura: 10000 } },
  { tier: 29, free: { aura: 6000 }, paid: { crate: 'epic', quantity: 1 } },
  { tier: 30, free: { aura: 8000, title: 'Season Finisher' }, paid: { crate: 'legendary', quantity: 1, title: 'Season Legend', badge: 'season_legend', frame: 'Seasonal Elite', background: 'bp_ultimate' } },
];

module.exports = { BATTLE_PASS_TIERS, BATTLE_PASS_TIER_XP, BATTLE_PASS_PRICE_AURA, BATTLE_PASS_PRICE_USD };
