const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, PermissionsBitField, SlashCommandBuilder, StringSelectMenuBuilder } = require("discord.js");
const crypto = require("crypto");
const { BOSSES, COLORS, COOLDOWNS, CRATES, CRAFTING_RECIPES, EFFECT_CAPS, GARDEN_CROPS, GEAR_ITEMS, MATERIALS, QUEST_TEMPLATES, RANKS, SHOP_ITEMS, SKILLS, WORLD_EVENTS } = require("../config/gameConfig");
const { BattleSession, Clan, GuildSettings, PvpInvite, PvpMatchmakingQueue, User } = require("../data/models");
const { buildClanCreateData, buildClanLeaderboardFilter, buildClanLookup, buildClanMembershipClearUpdate, buildClanMembershipFilter, buildPlayerCreateData, buildPlayerLeaderboardFilter, buildPlayerLookup, getGuildClanId, isGlobalPlayerDataEnabled, setGuildClanId } = require("../data/playerScope");
const { buildProfileCosmeticAttachment, FILE_NAME: PROFILE_COSMETIC_FILE } = require("../utils/cosmeticArt");
const { buildAttachment, buildEmbedPayload } = require("../utils/visuals");

const activeBattles = new Map();
const pendingRankUps = new Map();
const reminderIntervals = new WeakMap();
const recentInteractions = [];
const COMMAND_BUILD_ID = "aurix-premium-buffs-v20";
const BATTLE_TIMEOUT_MS = 45 * 60 * 1000;
const BATTLE_ANIMATION_DELAY_MS = 900;
const PVP_INVITE_TIMEOUT_MS = 2 * 60 * 1000;
const PVP_MATCHMAKING_TIMEOUT_MS = 10 * 60 * 1000;
const BATTLE_GEAR_SLOTS = Object.freeze([
  { id: "tool", label: "Tool" },
  { id: "charm", label: "Charm" },
  { id: "relic", label: "Relic" },
]);
const PREMIUM_PLANS = Object.freeze({
  monthly: {
    id: "monthly",
    label: "Monthly",
    priceLabel: "$4.99/month",
    durationDays: 30,
    dailyMultiplier: 1.6,
    dailyRareCrates: 2,
    cooldownReduction: 0.25,
    gardenPlots: 3,
    chestCooldownHours: 16,
    welcome: Object.freeze({ aura: 6000, rareCrates: 3, epicCrates: 1, legendaryCrates: 0 }),
    battle: Object.freeze({ maxHpBonus: 14, critChanceBonus: 0.05 }),
    chest: Object.freeze({ aura: [1800, 3200], xp: [420, 760], rareCrates: 2, epicChance: 0.18, legendaryChance: 0.02, materials: 4 }),
    effects: Object.freeze({
      spinRewardBoost: 0.35,
      vaultInterestBoost: 0.06,
      workAuraBoost: 0.35,
      workXpBoost: 0.25,
      mineYieldBoost: 0.35,
      mineXpBoost: 0.22,
      bossRewardBoost: 0.3,
      pvpRewardBoost: 0.25,
      crateAuraBoost: 0.25,
    }),
  },
  yearly: {
    id: "yearly",
    label: "Yearly",
    priceLabel: "$19.99/year",
    durationDays: 365,
    dailyMultiplier: 2,
    dailyRareCrates: 3,
    cooldownReduction: 0.35,
    gardenPlots: 4,
    chestCooldownHours: 12,
    welcome: Object.freeze({ aura: 18000, rareCrates: 5, epicCrates: 2, legendaryCrates: 1 }),
    battle: Object.freeze({ maxHpBonus: 24, critChanceBonus: 0.08 }),
    chest: Object.freeze({ aura: [4200, 7200], xp: [900, 1500], rareCrates: 3, epicChance: 0.38, legendaryChance: 0.08, materials: 7 }),
    effects: Object.freeze({
      spinRewardBoost: 0.55,
      vaultInterestBoost: 0.1,
      workAuraBoost: 0.55,
      workXpBoost: 0.45,
      mineYieldBoost: 0.55,
      mineXpBoost: 0.35,
      bossRewardBoost: 0.5,
      pvpRewardBoost: 0.4,
      crateAuraBoost: 0.45,
    }),
  },
  lifetime: {
    id: "lifetime",
    label: "Lifetime",
    priceLabel: "$49.99 one-time",
    durationDays: null,
    dailyMultiplier: 2.5,
    dailyRareCrates: 5,
    cooldownReduction: 0.5,
    gardenPlots: 4,
    chestCooldownHours: 8,
    welcome: Object.freeze({ aura: 45000, rareCrates: 8, epicCrates: 4, legendaryCrates: 2 }),
    battle: Object.freeze({ maxHpBonus: 36, critChanceBonus: 0.12 }),
    chest: Object.freeze({ aura: [9000, 15000], xp: [1900, 3200], rareCrates: 5, epicChance: 0.65, legendaryChance: 0.18, materials: 12 }),
    effects: Object.freeze({
      spinRewardBoost: 0.85,
      vaultInterestBoost: 0.14,
      workAuraBoost: 0.85,
      workXpBoost: 0.7,
      mineYieldBoost: 0.85,
      mineXpBoost: 0.55,
      bossRewardBoost: 0.75,
      pvpRewardBoost: 0.6,
      crateAuraBoost: 0.65,
    }),
  },
});
const PREMIUM_PURCHASE_URL = "https://aurawebsite-12gd.onrender.com";
const OFFICIAL_SERVER_URL = "https://aurawebsite-12gd.onrender.com";
const FORGE_MAX_LEVEL = 5;
const PROPERTY_TYPES = Object.freeze({
  aura_mine: {
    id: "aura_mine",
    name: "Aura Mine",
    cost: 24000,
    upgradeBaseCost: 13000,
    hourlyAura: 240,
    maxLevel: 5,
    description: "Generates claimable aura while you are away.",
  },
  tavern: {
    id: "tavern",
    name: "Moonlit Tavern",
    cost: 34000,
    upgradeBaseCost: 18000,
    hourlyAura: 170,
    hourlyXp: 55,
    maxLevel: 5,
    description: "Generates aura and XP from travelers.",
  },
  crystal_lab: {
    id: "crystal_lab",
    name: "Crystal Lab",
    cost: 56000,
    upgradeBaseCost: 29000,
    hourlyAura: 120,
    materialChance: 0.35,
    maxLevel: 4,
    description: "Generates aura and sometimes crafting materials.",
  },
});
const EXPEDITION_TYPES = Object.freeze({
  scout: {
    id: "scout",
    name: "Scout Run",
    hours: 1,
    aura: [650, 1100],
    xp: [150, 260],
    materialRolls: 1,
    description: "Short mission with quick returns.",
  },
  delve: {
    id: "delve",
    name: "Deep Delve",
    hours: 4,
    aura: [2400, 4200],
    xp: [560, 950],
    materialRolls: 3,
    crateChance: 0.35,
    description: "Medium expedition with a chance at crates.",
  },
  odyssey: {
    id: "odyssey",
    name: "Night Odyssey",
    hours: 8,
    aura: [5200, 9000],
    xp: [1200, 1900],
    materialRolls: 6,
    crateChance: 0.7,
    rareChance: 0.28,
    description: "Long mission for offline progression.",
  },
});
const PADDLE_PRICE_PLAN_ENV = Object.freeze({
  monthly: "PADDLE_MONTHLY_PRICE_ID",
  yearly: "PADDLE_YEARLY_PRICE_ID",
  lifetime: "PADDLE_LIFETIME_PRICE_ID",
});
const MICROTRANSACTION_PRODUCTS = Object.freeze({
  starter_crate_bundle: Object.freeze({
    id: "starter_crate_bundle",
    label: "Starter Crate Bundle",
    priceEnv: "PADDLE_STARTER_CRATE_BUNDLE_PRICE_ID",
    grants: Object.freeze({
      crates: Object.freeze({ common: 8, rare: 2 }),
      aura: 12500,
    }),
  }),
  rare_crate_stack: Object.freeze({
    id: "rare_crate_stack",
    label: "Rare Crate Stack",
    priceEnv: "PADDLE_RARE_CRATE_STACK_PRICE_ID",
    grants: Object.freeze({
      crates: Object.freeze({ rare: 8, epic: 2 }),
      aura: 30000,
    }),
  }),
  legendary_vault_drop: Object.freeze({
    id: "legendary_vault_drop",
    label: "Legendary Vault Drop",
    priceEnv: "PADDLE_LEGENDARY_VAULT_DROP_PRICE_ID",
    grants: Object.freeze({
      crates: Object.freeze({ rare: 6, epic: 3, legendary: 1 }),
      aura: 90000,
      inventory: Object.freeze({ adrenaline_tonic: 3, health_vial: 4 }),
    }),
  }),
  boost_supply_pack: Object.freeze({
    id: "boost_supply_pack",
    label: "Boost Supply Pack",
    priceEnv: "PADDLE_BOOST_SUPPLY_PACK_PRICE_ID",
    grants: Object.freeze({
      inventory: Object.freeze({ lucky_charm: 1, vault_key: 1, coinflip_gloves: 1, adrenaline_tonic: 2 }),
      aura: 20000,
    }),
  }),
});
const REMINDER_ACTIONS = Object.freeze({
  spin: { label: "Spin", command: "/spin" },
  work: { label: "Work", command: "/work" },
  mine: { label: "Mine", command: "/mine" },
  coinflip: { label: "Coinflip", command: "/coinflip" },
  rob: { label: "Rob", command: "/rob" },
  harvest: { label: "Harvest", command: "/garden harvest" },
  daily: { label: "Daily", command: "/daily" },
  boss: { label: "Boss", command: "/boss" },
  authority: { label: "Authority", command: "/authority" },
});
const REMINDER_ACTION_CHOICES = Object.entries(REMINDER_ACTIONS).map(([value, action]) => ({ name: action.label, value }));
const REMINDER_POLL_MS = 60 * 1000;
const FREE_REMINDER_LIMIT = 2;
const PREMIUM_REMINDER_LIMIT = 7;
const PVP_ARENAS = Object.freeze([
  {
    id: "bloodmoon",
    name: "Bloodmoon Ring",
    description: "Crit chains are stronger here, and bleed effects bite deeper.",
    critBonus: 0.05,
    bleedBonus: 3,
  },
  {
    id: "citadel",
    name: "Citadel Steps",
    description: "Guarding is stronger and counters hit harder than usual.",
    guardReduction: 0.38,
    counterBonus: 3,
  },
  {
    id: "tempest",
    name: "Tempest Cage",
    description: "Every third exchange, the storm shocks the weaker fighter.",
    hazardEvery: 3,
    hazardDamage: [7, 11],
    exposeOnHazard: 1,
  },
  {
    id: "pit",
    name: "Execution Pit",
    description: "Finishers become deadlier and can connect earlier.",
    finisherThreshold: 0.45,
    finisherBonusDamage: 8,
  },
]);
const BATTLE_ACTIONS = Object.freeze({
  strike: {
    label: "Strike",
    style: ButtonStyle.Primary,
    requirement: "Starter style",
    description: "Balanced damage with steady combo growth.",
    cooldownRounds: 0,
    unlocked: () => true,
  },
  feint: {
    label: "Feint",
    style: ButtonStyle.Primary,
    requirement: `Reach ${RANKS[1]?.name || "Harvester"}`,
    description: "Light damage that exposes the target and boosts your next crit.",
    cooldownRounds: 1,
    unlocked: (user) => user.rankIndex >= 1 || user.prestige >= 1,
  },
  sidestep: {
    label: "Sidestep",
    style: ButtonStyle.Secondary,
    requirement: `Reach ${RANKS[1]?.name || "Harvester"}`,
    description: "Set up an evasive window and sharpen the next punish.",
    cooldownRounds: 1,
    unlocked: (user) => user.rankIndex >= 1 || user.prestige >= 1,
  },
  heavy: {
    label: "Heavy",
    style: ButtonStyle.Danger,
    requirement: `Reach ${RANKS[2]?.name || "Riftkeeper"}`,
    description: "Big damage with self-exposure if the target survives.",
    cooldownRounds: 2,
    unlocked: (user) => user.rankIndex >= 2 || user.prestige >= 1,
  },
  hook: {
    label: "Hook",
    style: ButtonStyle.Primary,
    requirement: `Reach ${RANKS[2]?.name || "Riftkeeper"}`,
    description: "Disrupt the target's combo and leave them weakened.",
    cooldownRounds: 1,
    unlocked: (user) => user.rankIndex >= 2 || user.prestige >= 1,
  },
  pierce: {
    label: "Pierce",
    style: ButtonStyle.Success,
    requirement: `Reach ${RANKS[3]?.name || "Astral Sage"}`,
    description: "Guard-piercing strike that punishes defensive opponents.",
    cooldownRounds: 1,
    unlocked: (user) => user.rankIndex >= 3 || user.prestige >= 1,
  },
  charge: {
    label: "Charge",
    style: ButtonStyle.Success,
    requirement: `Reach ${RANKS[4]?.name || "Mythic"}`,
    description: "Bank momentum for a stronger next damaging action.",
    cooldownRounds: 1,
    unlocked: (user) => user.rankIndex >= 4 || user.prestige >= 1,
  },
  disorient: {
    label: "Disorient",
    style: ButtonStyle.Secondary,
    requirement: `Reach ${RANKS[5]?.name || "Ascendant"}`,
    description: "Break guard, drain combo, and throw the foe off rhythm.",
    cooldownRounds: 2,
    unlocked: (user) => user.rankIndex >= 5 || user.prestige >= 1,
  },
  blitz: {
    label: "Blitz",
    style: ButtonStyle.Secondary,
    requirement: "Reach Prestige 1",
    description: "Two rapid hits that can break through a weakened enemy.",
    cooldownRounds: 2,
    unlocked: (user) => user.prestige >= 1,
  },
});

const BATTLE_SPECIAL_ACTIONS = Object.freeze({
  skill: { label: "Skill", cooldownRounds: 2 },
  finish: { label: "Finisher", cooldownRounds: 2 },
  guard: { label: "Guard", cooldownRounds: 0 },
});
const BATTLE_ACTION_EMOJIS = Object.freeze({
  strike: "⚔️",
  feint: "🌀",
  sidestep: "💨",
  heavy: "💥",
  hook: "🪝",
  pierce: "🗡️",
  charge: "🔥",
  disorient: "🌫️",
  blitz: "⚡",
  skill: "✨",
  guard: "🛡️",
  finish: "☠️",
});
const BOSS_INTENTS = Object.freeze({
  crush: {
    label: "Crushing Blow",
    danger: "High damage",
    action: "heavy",
    counter: "Guard or Sidestep",
    tell: "The boss plants its feet and winds up a brutal swing.",
  },
  shatter: {
    label: "Guard Shatter",
    danger: "Pierces guard",
    action: "pierce",
    counter: "Sidestep or Feint",
    tell: "The boss aims for your defense instead of your body.",
  },
  mark: {
    label: "Expose Mark",
    danger: "Sets up future damage",
    action: "feint",
    counter: "Strike pressure or Guard",
    tell: "The boss studies your stance and looks for an opening.",
  },
  surge: {
    label: "Power Surge",
    danger: "Charges next attack",
    action: "charge",
    counter: "Heavy, Pierce, or Finisher",
    tell: "The arena hums as the boss gathers power.",
  },
});

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateClanCode(name, guildId) {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "clan";
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = `${base}${randInt(10, 99)}`;
    const existingClan = await Clan.exists(buildClanLookup(guildId, code));
    if (!existingClan) {
      return code;
    }
  }
  return `${base}${crypto.randomUUID().replace(/-/g, "").slice(0, 6)}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatNumber(value) {
  return Intl.NumberFormat("en-US").format(Math.floor(value));
}

const PROGRESS_PARTIAL_BLOCKS = Object.freeze(["", "\u258F", "\u258E", "\u258D", "\u258C", "\u258B", "\u258A", "\u2589"]);

async function isUserInGuild(guild, userId) {
  if (!guild || !userId) {
    return false;
  }
  const member = await guild.members.fetch(userId).catch(() => null);
  return Boolean(member);
}

function getPvpStreak(user) {
  return user?.stats?.pvpStreak || 0;
}

function getBestPvpStreak(user) {
  return user?.stats?.bestPvpStreak || 0;
}

function mapEntries(mapLike) {
  return mapLike?.entries ? [...mapLike.entries()] : Object.entries(mapLike || {});
}

function progressBar(current, total, size = 12) {
  const ratio = total <= 0 ? 1 : clamp(current / total, 0, 1);
  const percent = Math.round(ratio * 100);
  const exactFilled = ratio * size;
  const filled = percent >= 100 ? size : Math.floor(exactFilled);
  const partialIndex = filled >= size ? 0 : Math.floor((exactFilled - filled) * (PROGRESS_PARTIAL_BLOCKS.length - 1));
  const partial = partialIndex > 0 ? PROGRESS_PARTIAL_BLOCKS[partialIndex] : "";
  const empty = Math.max(0, size - filled - (partial ? 1 : 0));
  return `\`${"\u2588".repeat(filled)}${partial}${"\u2591".repeat(empty)}\` ${percent}%`;
}

function pickPvpArena() {
  const arena = PVP_ARENAS[randInt(0, PVP_ARENAS.length - 1)];
  return { ...arena };
}

function getItem(itemId) {
  return SHOP_ITEMS.find((item) => item.id === itemId) || null;
}

function isPremiumActive(user) {
  if (!user?.premium) {
    return false;
  }
  if (user.premium.lifetime) {
    return true;
  }
  if (!user.premium.active || !user.premium.expiresAt) {
    return false;
  }
  return user.premium.expiresAt.getTime() > Date.now();
}

function normalizePremiumState(user) {
  if (!user.premium) {
    user.premium = { active: false, expiresAt: null, lifetime: false, grantedBy: null, source: null, lastAnnouncementEventId: null, lastWelcomeGrantEventId: null, lastChestAt: null };
  }
  user.premium.lastAnnouncementEventId ||= null;
  user.premium.lastWelcomeGrantEventId ||= null;
  user.premium.lastChestAt ||= null;
  if (!user.billing) {
    user.billing = {
      provider: null,
      paddleCustomerId: null,
      paddleSubscriptionId: null,
      paddleTransactionId: null,
      paddlePriceId: null,
      paddleLastEventId: null,
      paddlePlanId: null,
      paddleStatus: null,
      paddleGrantedTransactionIds: [],
    };
  }
  user.billing.paddleGrantedTransactionIds ||= [];
  if (!isPremiumActive(user) && user.premium.active) {
    user.premium.active = false;
    user.premium.lifetime = false;
    user.premium.expiresAt = null;
  }
}

function getPremiumPlan(planId) {
  return PREMIUM_PLANS[planId] || null;
}

function getPaddlePlanByPriceId(priceId) {
  if (!priceId) {
    return null;
  }
  const planId = Object.entries(PADDLE_PRICE_PLAN_ENV).find(([, envKey]) => process.env[envKey] === priceId)?.[0];
  return planId ? getPremiumPlan(planId) : null;
}

function getMicrotransactionProduct(productId) {
  return MICROTRANSACTION_PRODUCTS[productId] || null;
}

function getMicrotransactionProductByPriceId(priceId) {
  if (!priceId) {
    return null;
  }
  const productId = Object.entries(MICROTRANSACTION_PRODUCTS)
    .find(([, product]) => process.env[product.priceEnv] === priceId)?.[0];
  return productId ? getMicrotransactionProduct(productId) : null;
}

function getPaddleCustomData(data) {
  return data?.custom_data || data?.customData || data?.customDataJson || data?.custom_data_json || {};
}

function getPaddleFirstPriceId(data) {
  const item = data?.items?.[0] || data?.details?.line_items?.[0];
  return item?.price?.id || item?.price_id || item?.priceId || null;
}

function getPaddleLineItems(data) {
  return [
    ...(Array.isArray(data?.items) ? data.items : []),
    ...(Array.isArray(data?.details?.line_items) ? data.details.line_items : []),
  ];
}

function getPaddlePlan(data, existingUser = null) {
  const pricePlan = getPaddlePlanByPriceId(getPaddleFirstPriceId(data));
  if (pricePlan) {
    return pricePlan;
  }

  return getPremiumPlan(existingUser?.billing?.paddlePlanId) || getPremiumPlan(existingUser?.premium?.source);
}

function getPaddleItemPriceId(item) {
  return item?.price?.id || item?.price_id || item?.priceId || null;
}

function getPaddleItemQuantity(item) {
  const rawQuantity = item?.quantity || item?.qty || item?.quantity_ordered;
  const quantity = Number(rawQuantity);
  return Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1;
}

function getPaddleMicrotransactionPurchase(data) {
  const lineItem = getPaddleLineItems(data).find((item) => getMicrotransactionProductByPriceId(getPaddleItemPriceId(item)));
  const product = getMicrotransactionProductByPriceId(getPaddleItemPriceId(lineItem) || getPaddleFirstPriceId(data));
  return product ? { product, quantity: getPaddleItemQuantity(lineItem) } : null;
}

function getPaddleBillingPeriodEnd(data) {
  const rawDate = data?.current_billing_period?.ends_at
    || data?.billing_period?.ends_at
    || data?.items?.[0]?.billing_period?.ends_at
    || null;
  const date = rawDate ? new Date(rawDate) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function getPaddleIds(data) {
  return {
    customerId: typeof data?.customer_id === "string" ? data.customer_id : data?.customer?.id || null,
    subscriptionId: typeof data?.subscription_id === "string" ? data.subscription_id : data?.subscription?.id || (typeof data?.id === "string" && data.id.startsWith("sub_") ? data.id : null),
    transactionId: typeof data?.transaction_id === "string" ? data.transaction_id : (typeof data?.id === "string" && data.id.startsWith("txn_") ? data.id : null),
    priceId: getPaddleFirstPriceId(data),
    status: data?.status || null,
  };
}

async function findPaddleUser(data) {
  const customData = getPaddleCustomData(data);
  const discordUserId = customData.discordUserId
    || customData.discord_user_id
    || customData.discord_user
    || customData.discordId
    || customData.discord_id
    || customData.userId
    || customData.user_id;
  if (discordUserId) {
    return getOrCreatePlayer(customData.guildId || customData.guild_id || null, discordUserId);
  }

  const ids = getPaddleIds(data);
  const query = ids.subscriptionId
    ? { "billing.paddleSubscriptionId": ids.subscriptionId }
    : ids.customerId
      ? { "billing.paddleCustomerId": ids.customerId }
      : null;

  return query ? User.findOne(query).sort({ updatedAt: -1, createdAt: 1 }) : null;
}

function mergePaddleBilling(user, data, eventId, plan) {
  const ids = getPaddleIds(data);
  user.billing = user.billing || {};
  user.billing.provider = "paddle";
  user.billing.paddleCustomerId = ids.customerId || user.billing.paddleCustomerId || null;
  user.billing.paddleSubscriptionId = ids.subscriptionId || user.billing.paddleSubscriptionId || null;
  user.billing.paddleTransactionId = ids.transactionId || user.billing.paddleTransactionId || null;
  user.billing.paddlePriceId = ids.priceId || user.billing.paddlePriceId || null;
  user.billing.paddleLastEventId = eventId || user.billing.paddleLastEventId || null;
  user.billing.paddlePlanId = plan?.id || user.billing.paddlePlanId || null;
  user.billing.paddleStatus = ids.status || user.billing.paddleStatus || null;
  user.billing.paddleGrantedTransactionIds ||= [];
}

async function applyPaddleWebhookEvent(event, eventId = null) {
  const eventType = event?.event_type || event?.eventType || event?.type;
  const data = event?.data || {};
  const customData = getPaddleCustomData(data);
  const user = await findPaddleUser(data);

  if (!user) {
    return { action: "ignored", reason: "missing_user_mapping", eventType };
  }

  normalizePremiumState(user);
  const previousPlanId = user.premium?.source || null;
  const wasPremiumActive = isPremiumActive(user);
  const plan = getPaddlePlan(data, user);
  const microtransactionPurchase = getPaddleMicrotransactionPurchase(data);
  const microtransactionProduct = microtransactionPurchase?.product || null;
  const microtransactionQuantity = microtransactionPurchase?.quantity || 1;
  const resolvedEventId = eventId || event?.event_id || event?.eventId || null;
  mergePaddleBilling(user, data, resolvedEventId, plan);

  const ids = getPaddleIds(data);
  const purchaseGrantId = ids.transactionId || resolvedEventId;
  if (eventType === "transaction.completed" && microtransactionProduct) {
    if (purchaseGrantId && user.billing.paddleGrantedTransactionIds.includes(purchaseGrantId)) {
      await user.save();
      return {
        action: "duplicate_purchase_ignored",
        userId: user.userId,
        productId: microtransactionProduct.id,
        productLabel: microtransactionProduct.label,
        eventType,
      };
    }

    const grantSummary = grantMicrotransactionProduct(user, microtransactionProduct, microtransactionQuantity);
    if (purchaseGrantId) {
      user.billing.paddleGrantedTransactionIds.push(purchaseGrantId);
      user.billing.paddleGrantedTransactionIds = user.billing.paddleGrantedTransactionIds.slice(-50);
    }
    await syncRank(user);
    await user.save();
    return {
      action: "purchase_granted",
      userId: user.userId,
      productId: microtransactionProduct.id,
      productLabel: microtransactionProduct.label,
      quantity: microtransactionQuantity,
      eventType,
      grantSummary,
      announcementGuildId: customData.guildId || customData.guild_id || user.botContext?.lastGuildId || user.reminders?.guildId || user.guildId || null,
      announcementChannelId: customData.channelId || customData.channel_id || user.botContext?.lastChannelId || user.reminders?.channelId || null,
    };
  }

  const activeSubscriptionStatuses = new Set(["active", "trialing"]);
  const inactiveSubscriptionStatuses = new Set(["canceled", "paused", "past_due"]);
  const status = data?.status;
  const shouldDeactivate = eventType?.startsWith("subscription.")
    && (inactiveSubscriptionStatuses.has(status) || ["subscription.canceled", "subscription.paused"].includes(eventType));

  if (shouldDeactivate) {
    user.premium.active = false;
    user.premium.lifetime = false;
    user.premium.expiresAt = null;
    await user.save();
    return { action: "deactivated", userId: user.userId, eventType };
  }

  const shouldActivate = ["transaction.completed", "transaction.billed", "subscription.activated", "subscription.resumed", "subscription.updated"].includes(eventType)
    && (!eventType.startsWith("subscription.") || activeSubscriptionStatuses.has(status));

  if (!shouldActivate || !plan) {
    await user.save();
    return { action: "recorded", userId: user.userId, eventType };
  }

  user.premium.active = true;
  user.premium.lifetime = plan.id === "lifetime";
  user.premium.expiresAt = plan.id === "lifetime"
    ? null
    : getPaddleBillingPeriodEnd(data) || new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000);
  user.premium.grantedBy = "paddle";
  user.premium.source = plan.id;

  const shouldAnnounce = user.premium.lastAnnouncementEventId !== resolvedEventId
    && (!wasPremiumActive || previousPlanId !== plan.id || eventType === "transaction.completed");
  const welcomeGrant = shouldAnnounce && resolvedEventId ? grantPremiumWelcomePack(user, plan, resolvedEventId) : null;
  if (shouldAnnounce) {
    user.premium.lastAnnouncementEventId = resolvedEventId;
  }

  await user.save();
  return {
    action: "activated",
    userId: user.userId,
    planId: plan.id,
    planLabel: plan.label,
    eventType,
    shouldAnnounce,
    welcomeGrant,
    announcementGuildId: customData.guildId || customData.guild_id || user.botContext?.lastGuildId || user.reminders?.guildId || user.guildId || null,
    announcementChannelId: customData.channelId || customData.channel_id || user.botContext?.lastChannelId || user.reminders?.channelId || null,
  };
}

function getUserPremiumPlan(user) {
  if (!isPremiumActive(user)) {
    return null;
  }
  if (user.premium?.lifetime) {
    return PREMIUM_PLANS.lifetime;
  }
  return getPremiumPlan(user.premium?.source) || PREMIUM_PLANS.monthly;
}

function normalizeReminderState(user) {
  if (!user.reminders) {
    user.reminders = {
      guildId: null,
      channelId: null,
      enabledActions: [],
      lastNotifiedAt: new Map(),
    };
  }

  if (!Array.isArray(user.reminders.enabledActions)) {
    user.reminders.enabledActions = [];
  }

  if (!user.reminders.lastNotifiedAt?.get) {
    user.reminders.lastNotifiedAt = new Map(mapEntries(user.reminders.lastNotifiedAt));
  }
}

function getPremiumEffects(user) {
  return getUserPremiumPlan(user)?.effects || {};
}

function getPremiumDailyMultiplier(user) {
  return getUserPremiumPlan(user)?.dailyMultiplier || 1;
}

function getPremiumDailyRareCrates(user) {
  return getUserPremiumPlan(user)?.dailyRareCrates || 0;
}

function getPremiumCooldownReduction(user) {
  return getUserPremiumPlan(user)?.cooldownReduction || 0;
}

function getPremiumGardenPlotLimit(user) {
  return getUserPremiumPlan(user)?.gardenPlots || 2;
}

function getPremiumBattleBonus(user) {
  return getUserPremiumPlan(user)?.battle || {};
}

function getPremiumChestCooldownMs(user) {
  const hours = getUserPremiumPlan(user)?.chestCooldownHours || 24;
  return hours * 60 * 60 * 1000;
}

function ensureGardenPlotLimit(user) {
  const targetPlots = getPremiumGardenPlotLimit(user);
  if (!Array.isArray(user.gardenPlots) || user.gardenPlots.length === 0) {
    user.gardenPlots = [];
  }
  while (user.gardenPlots.length < targetPlots) {
    user.gardenPlots.push({ cropId: null, plantedAt: null });
  }
}

function grantPremiumWelcomePack(user, plan, eventId) {
  if (!plan?.welcome || user.premium.lastWelcomeGrantEventId === eventId) {
    return null;
  }

  const welcome = plan.welcome;
  user.aura += welcome.aura || 0;
  if (welcome.rareCrates) {
    user.crates.set("rare", (user.crates.get("rare") || 0) + welcome.rareCrates);
  }
  if (welcome.epicCrates) {
    user.crates.set("epic", (user.crates.get("epic") || 0) + welcome.epicCrates);
  }
  if (welcome.legendaryCrates) {
    user.crates.set("legendary", (user.crates.get("legendary") || 0) + welcome.legendaryCrates);
  }
  grantCosmetic(user, { grantsCosmetic: { slot: "title", value: "Aurix VIP" } });
  grantCosmetic(user, { grantsCosmetic: { slot: "frame", value: "Gold Frame" } });
  user.premium.lastWelcomeGrantEventId = eventId;
  return welcome;
}

function formatPremiumStatus(user) {
  const plan = getUserPremiumPlan(user);
  if (!plan) {
    return "Free";
  }
  if (user.premium?.lifetime) {
    return `${plan.label} Premium`;
  }
  if (user.premium?.expiresAt) {
    return `${plan.label} Premium until ${user.premium.expiresAt.toLocaleDateString("en-US")}`;
  }
  return `${plan.label} Premium`;
}

function formatPremiumPlanLabel(planId) {
  const plan = getPremiumPlan(planId);
  return plan?.label || planId;
}

function buildPremiumFeatureSummary() {
  return [
    "Premium welcome bundle on purchase: aura, crates, and profile cosmetics",
    "Premium Chest command: recurring aura, XP, crates, and crafting materials",
    "Extra garden plots for faster material farming",
    "Battle edge in PvP and bosses: extra HP and passive crit chance",
    "Premium-only shop items: Premium Supply Drop, Executive Badge, Storm Pass",
    `${PREMIUM_REMINDER_LIMIT} reminder slots instead of ${FREE_REMINDER_LIMIT}`,
    "Profile membership status shown in /profile and /premium",
    "Premium-only profile cosmetics: Aurix VIP Title, Gold Profile Frame, Storm Nameplate",
  ].join("\n");
}

function formatPercent(value) {
  const percent = value * 100;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(1)}%`;
}

function formatPremiumPlanSummary(plan) {
  const effects = plan.effects;
  return [
    `${plan.priceLabel}`,
    `+${formatPercent(effects.spinRewardBoost)} spin rewards`,
    `+${formatPercent(effects.workAuraBoost)} work aura, +${formatPercent(effects.workXpBoost)} work XP`,
    `+${formatPercent(effects.mineYieldBoost)} mining yield, +${formatPercent(effects.mineXpBoost)} mining XP`,
    `+${formatPercent(plan.dailyMultiplier - 1)} daily aura and XP`,
    `+${plan.dailyRareCrates} rare ${plan.dailyRareCrates === 1 ? "crate" : "crates"} from /daily`,
    `${plan.gardenPlots} garden plots total`,
    `/premium-chest every ${plan.chestCooldownHours}h`,
    `Battle edge: +${plan.battle.maxHpBonus} HP, +${formatPercent(plan.battle.critChanceBonus)} crit`,
    `${formatPercent(plan.cooldownReduction)} shorter cooldowns`,
    `+${formatPercent(effects.vaultInterestBoost)}/hr vault interest`,
    `+${formatPercent(effects.bossRewardBoost)} boss rewards, +${formatPercent(effects.pvpRewardBoost)} PvP rewards`,
    `+${formatPercent(effects.crateAuraBoost)} crate aura rewards`,
  ].join("\n");
}

function buildPremiumPlanFields() {
  return Object.values(PREMIUM_PLANS).map((plan) => ({
    name: plan.label,
    value: formatPremiumPlanSummary(plan),
    inline: false,
  }));
}

function isPremiumOnlyItem(item) {
  return Boolean(item?.premiumOnly);
}

function normalizeCosmetics(user) {
  if (!user.cosmetics) {
    user.cosmetics = { activeTitle: null, activeFrame: null, ownedTitles: [], ownedFrames: [] };
  }
  user.cosmetics.ownedTitles ||= [];
  user.cosmetics.ownedFrames ||= [];
}

function formatProfileCosmetics(user) {
  normalizeCosmetics(user);
  const title = user.cosmetics.activeTitle || "None";
  const frame = user.cosmetics.activeFrame || "Default";
  return `Title: ${title}\nFrame: ${frame}`;
}

function getProfileCosmeticStyle(user, targetUser) {
  normalizeCosmetics(user);
  const title = user.cosmetics.activeTitle || null;
  const frame = user.cosmetics.activeFrame || null;
  const titleStyles = {
    "Aurix VIP": {
      label: "\u2726 AURIX VIP",
      badge: "\u2726 VIP",
      color: 0xffd166,
      description: "VIP nameplate active",
    },
    Stormbound: {
      label: "\u26A1 STORMBOUND",
      badge: "\u26A1 STORM",
      color: 0x4cc9f0,
      description: "Storm nameplate active",
    },
  };
  const frameStyles = {
    "Gold Frame": {
      label: "GOLD FRAME",
      left: "\u2726 ",
      right: " \u2726",
      color: 0xffc857,
      divider: "\u2550".repeat(18),
      description: "Gold profile frame active",
    },
  };
  const titleStyle = titleStyles[title] || null;
  const frameStyle = frameStyles[frame] || null;
  const color = frameStyle?.color || titleStyle?.color || COLORS.primary;
  const framedName = `${frameStyle?.left || ""}${targetUser.username}${frameStyle?.right || ""}`;
  const nameplate = titleStyle ? `${titleStyle.label} // ${targetUser.username}` : targetUser.username;
  const frameLine = frameStyle
    ? `${frameStyle.divider}\n${frameStyle.label} ACTIVE\n${frameStyle.divider}`
    : "Default frame active";

  return {
    color,
    title: titleStyle ? `${titleStyle.badge} | ${framedName}` : `${framedName}'s Aura Profile`,
    description: `${frameLine}\n${titleStyle?.description || "No premium nameplate equipped."}`,
    nameplate,
    frameLabel: frameStyle?.label || "Default",
    titleLabel: titleStyle?.label || "None",
  };
}

function grantCosmetic(user, item) {
  normalizeCosmetics(user);
  const cosmetic = item?.grantsCosmetic;
  if (!cosmetic?.slot || !cosmetic?.value) {
    return false;
  }
  if (cosmetic.slot === "title") {
    if (!user.cosmetics.ownedTitles.includes(cosmetic.value)) {
      user.cosmetics.ownedTitles.push(cosmetic.value);
    }
    user.cosmetics.activeTitle = cosmetic.value;
    return true;
  }
  if (cosmetic.slot === "frame") {
    if (!user.cosmetics.ownedFrames.includes(cosmetic.value)) {
      user.cosmetics.ownedFrames.push(cosmetic.value);
    }
    user.cosmetics.activeFrame = cosmetic.value;
    return true;
  }
  return false;
}

function userOwnsCosmeticItem(user, item) {
  normalizeCosmetics(user);
  const cosmetic = item?.grantsCosmetic;
  if (cosmetic?.slot === "title") {
    return user.cosmetics.ownedTitles.includes(cosmetic.value);
  }
  if (cosmetic?.slot === "frame") {
    return user.cosmetics.ownedFrames.includes(cosmetic.value);
  }
  return false;
}

function getDisplayShopItems(user) {
  return SHOP_ITEMS.map((item) => ({
    ...item,
    premiumLocked: isPremiumOnlyItem(item) && !isPremiumActive(user),
  }));
}

function getMaterial(materialId) {
  return MATERIALS[materialId] || null;
}

function getGearItem(gearId) {
  return GEAR_ITEMS[gearId] || null;
}

function getGardenCrop(cropId) {
  return GARDEN_CROPS[cropId] || null;
}

function getRecipe(recipeId) {
  return CRAFTING_RECIPES.find((recipe) => recipe.id === recipeId) || null;
}

function toEnvToken(value) {
  return String(value || "")
    .replace(/['’]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

function getEntityEmoji(kind, id) {
  const token = toEnvToken(id);
  if (!token) {
    return "";
  }
  return process.env[`AURIX_${kind}_EMOJI_${token}`] || process.env[`AURIX_${kind}_ICON_${token}`] || "";
}

function formatEntityLabel(kind, id, label) {
  const emoji = getEntityEmoji(kind, id);
  return emoji ? `${emoji} ${label}` : label;
}

function getCrateLabel(crateId) {
  return formatEntityLabel("CRATE", crateId, `${crateId} crate`);
}

function getInventoryLabel(id) {
  const item = getItem(id);
  if (item) {
    return formatEntityLabel("ITEM", id, item.name);
  }
  const material = getMaterial(id);
  if (material) {
    return formatEntityLabel("MATERIAL", id, material.name);
  }
  const gear = getGearItem(id);
  if (gear) {
    return formatEntityLabel("GEAR", id, gear.name);
  }
  if (CRATES[id]) {
    return getCrateLabel(id);
  }
  return id;
}

function getRankLabel(rank) {
  return formatEntityLabel("RANK", rank?.name, rank?.name || "Unknown Rank");
}

function getBossLabel(boss) {
  return formatEntityLabel("BOSS", boss?.id || boss?.name, boss?.name || "Boss");
}

function getPropertyLabel(property) {
  return formatEntityLabel("PROPERTY", property?.id || property?.name, property?.name || "Property");
}

function getExpeditionLabel(expedition) {
  return formatEntityLabel("EXPEDITION", expedition?.id || expedition?.name, expedition?.name || "Expedition");
}

function getSkillLabel(skillId) {
  return formatEntityLabel("SKILL", skillId, SKILLS[skillId]?.name || skillId);
}

function getCombatItem(itemId) {
  const item = getItem(itemId);
  return item?.type === "combat" ? item : null;
}

function getBattleAction(actionId) {
  return BATTLE_ACTIONS[actionId] || BATTLE_SPECIAL_ACTIONS[actionId] || null;
}

function getUnlockedBattleActions(user) {
  return Object.entries(BATTLE_ACTIONS)
    .filter(([, action]) => action.unlocked(user))
    .map(([actionId]) => actionId);
}

function formatBattleActionList(actionIds = []) {
  return actionIds.map((actionId) => getBattleAction(actionId)?.label || actionId).join(", ") || "Strike";
}

function formatBattleActionProgress(user) {
  return Object.entries(BATTLE_ACTIONS).map(([actionId, action]) => {
    const status = action.unlocked(user) ? "Unlocked" : `Locked: ${action.requirement}`;
    return `**${action.label}**\n${action.description}\n${status}`;
  }).join("\n\n");
}

function chunkArray(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function cloneLoadout(loadout = {}) {
  return {
    tool: loadout.tool || null,
    charm: loadout.charm || null,
    relic: loadout.relic || null,
  };
}

function getInventoryQuantity(user, itemId) {
  return user.inventory.find((entry) => entry.id === itemId)?.quantity || 0;
}

function normalizeProgressionSystems(user) {
  if (!user.gearUpgrades?.get) {
    user.gearUpgrades = new Map(Object.entries(user.gearUpgrades || {}));
  }
  if (!user.gearDurability?.get) {
    user.gearDurability = new Map(Object.entries(user.gearDurability || {}));
  }
  if (!user.properties?.get) {
    user.properties = new Map(Object.entries(user.properties || {}));
  }
  if (!user.expedition) {
    user.expedition = { type: null, startedAt: null, endsAt: null };
  }
}

function getGearUpgradeLevel(user, gearId) {
  normalizeProgressionSystems(user);
  return clamp(Number(user.gearUpgrades.get(gearId) || 0), 0, FORGE_MAX_LEVEL);
}

function getGearDurability(user, gearId) {
  normalizeProgressionSystems(user);
  if (!user.gearDurability.has(gearId)) {
    user.gearDurability.set(gearId, 100);
  }
  return clamp(Number(user.gearDurability.get(gearId) || 0), 0, 100);
}

function setGearDurability(user, gearId, value) {
  normalizeProgressionSystems(user);
  user.gearDurability.set(gearId, clamp(Math.floor(value), 0, 100));
  user.markModified("gearDurability");
}

function getForgeUpgradeCost(level) {
  return 4000 + level * 3200;
}

function getForgeRepairCost(user, gearId) {
  const missing = 100 - getGearDurability(user, gearId);
  return Math.max(250, missing * 75);
}

function getForgePowerMultiplier(user, gearId) {
  const level = getGearUpgradeLevel(user, gearId);
  const durability = getGearDurability(user, gearId);
  if (durability <= 0) {
    return 0.5;
  }
  return 1 + level * 0.08;
}

function userOwnsGearInSlot(user, gearId, slot) {
  if (!gearId) {
    return true;
  }
  const gear = getGearItem(gearId);
  if (!gear || gear.slot !== slot) {
    return false;
  }
  return getInventoryQuantity(user, gearId) > 0;
}

function normalizeBattleLoadout(user, loadout = {}) {
  const normalized = cloneLoadout();
  BATTLE_GEAR_SLOTS.forEach((slot) => {
    const gearId = loadout[slot.id] || null;
    normalized[slot.id] = userOwnsGearInSlot(user, gearId, slot.id) ? gearId : null;
  });
  return normalized;
}

function getLoadoutBattleBonuses(loadout = {}, user = null) {
  return Object.values(cloneLoadout(loadout)).reduce((acc, gearId) => {
    const gear = getGearItem(gearId);
    if (!gear?.battle) {
      return acc;
    }
    const multiplier = user ? getForgePowerMultiplier(user, gearId) : 1;
    Object.entries(gear.battle).forEach(([key, value]) => {
      acc[key] = (acc[key] || 0) + value * multiplier;
    });
    return acc;
  }, {});
}

function getPlayerCombatInventory(user) {
  return user.inventory.reduce((acc, entry) => {
    if (entry.quantity <= 0 || !getCombatItem(entry.id)) {
      return acc;
    }
    acc[entry.id] = entry.quantity;
    return acc;
  }, {});
}

function summarizeCombatInventory(combatItems = {}) {
  const lines = Object.entries(combatItems)
    .filter(([, quantity]) => quantity > 0)
    .map(([itemId, quantity]) => `${getInventoryLabel(itemId)} x${quantity}`);
  return lines.length ? lines.join(", ") : "No battle items stocked.";
}

function formatLoadoutSummary(loadout = {}) {
  return BATTLE_GEAR_SLOTS.map((slot) => {
    const gearId = loadout[slot.id];
    const gear = getGearItem(gearId);
    const battleText = gear?.battleDescription ? ` (${gear.battleDescription})` : "";
    return `${slot.label}: ${gear ? `${gear.name}${battleText}` : "None"}`;
  }).join("\n");
}

function buildGearOptionsForSlot(state, slotId) {
  const optionMap = new Map([["none", { label: `No ${slotId}`, value: "none", description: `Fight without ${slotId} gear.` }]]);
  [state.playerOne, state.playerTwo].forEach((fighter) => {
    Object.entries(fighter.availableGear?.[slotId] || {}).forEach(([gearId, gearName]) => {
      optionMap.set(gearId, {
        label: gearName.slice(0, 100),
        value: gearId,
        description: (getGearItem(gearId)?.battleDescription || getGearItem(gearId)?.description || "Gear option").slice(0, 100),
      });
    });
  });
  return [...optionMap.values()].slice(0, 25);
}

function createLoadoutParticipant(user, displayName) {
  const loadout = normalizeBattleLoadout(user, user.equippedGear);
  const availableGear = BATTLE_GEAR_SLOTS.reduce((acc, slot) => {
    acc[slot.id] = Object.fromEntries(
      user.inventory
        .filter((entry) => entry.quantity > 0)
        .map((entry) => [entry.id, getGearItem(entry.id)])
        .filter(([, gear]) => gear?.slot === slot.id)
        .map(([gearId, gear]) => [gearId, gear.name])
    );
    return acc;
  }, {});

  return {
    id: user.userId,
    name: displayName,
    ready: false,
    loadout,
    combatItems: getPlayerCombatInventory(user),
    unlockedActions: getUnlockedBattleActions(user),
    availableGear,
  };
}

function createLoadoutField(player) {
  return [
    formatLoadoutSummary(player.loadout),
    `Attacks: ${formatBattleActionList(player.unlockedActions)}`,
    `Items: ${summarizeCombatInventory(player.combatItems)}`,
    `Ready: ${player.ready ? "Locked in" : "Choosing loadout"}`,
  ].join("\n");
}

function buildInviteComponents(battleId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${battleId}:invite:accept`).setLabel("Accept").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`${battleId}:invite:decline`).setLabel("Decline").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`${battleId}:invite:cancel`).setLabel("Cancel").setStyle(ButtonStyle.Secondary)
    ),
  ];
}

function createLoadoutEmbed(state, description) {
  return buildEmbedPayload({
    title: "PvP Duel Lobby",
    description,
    visual: "pvp-challenge.svg",
    fields: [
      { name: state.playerOne.name, value: createLoadoutField(state.playerOne), inline: true },
      { name: state.playerTwo.name, value: createLoadoutField(state.playerTwo), inline: true },
      { name: "Arena", value: `${state.arena.name}\n${state.arena.description}`, inline: false },
    ],
    footer: "Pick gear, review battle items, and press Ready Up when your loadout is set.",
  });
}

function buildLoadoutComponents(state) {
  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${state.id}:loadout:ready`).setLabel("Ready Up").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`${state.id}:loadout:cancel`).setLabel("Cancel Duel").setStyle(ButtonStyle.Danger)
    ),
  ];

  BATTLE_GEAR_SLOTS.forEach((slot) => {
    components.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${state.id}:gear:${slot.id}`)
          .setPlaceholder(`Choose your ${slot.label.toLowerCase()} gear`)
          .addOptions(buildGearOptionsForSlot(state, slot.id))
      )
    );
  });

  return components;
}

function getBattleMirrorMessages(state) {
  return Array.isArray(state?.messages) ? state.messages.filter((entry) => entry?.channelId && entry?.messageId) : [];
}

function getBattleMessageOwnerId(state, messageId) {
  return getBattleMirrorMessages(state).find((entry) => entry.messageId === messageId)?.ownerId || null;
}

function shouldShowBattleControlsForOwner(state, ownerId) {
  if (state?.phase !== "battle" || state?.isBoss) {
    return true;
  }
  return !ownerId || ownerId === state.turnId;
}

function withBattleControlsForOwner(payload, state, ownerId) {
  if (shouldShowBattleControlsForOwner(state, ownerId)) {
    return payload;
  }
  return { ...payload, components: [] };
}

async function editBattleMirrorMessages(client, state, payload, skipMessageId = null) {
  const messages = getBattleMirrorMessages(state).filter((entry) => entry.messageId !== skipMessageId);
  await Promise.all(messages.map(async (entry) => {
    const channel = await client.channels.fetch(entry.channelId).catch(() => null);
    const message = await channel?.messages?.fetch?.(entry.messageId).catch(() => null);
    if (message?.editable) {
      const messagePayload = typeof payload === "function" ? payload(entry) : payload;
      await message.edit(messagePayload).catch(() => null);
    }
  }));
}

function getBattleGuildIdForUser(state, userId, fallbackGuildId) {
  return state?.playerGuildIds?.[userId] || state?.guildId || fallbackGuildId;
}

function isBattleExpired(state) {
  if (state?.phase === "invite" && state.inviteExpiresAt) {
    return Date.now() > state.inviteExpiresAt;
  }
  const lastActivity = Number(state?.lastActionAt || state?.createdAt);
  return !lastActivity || (Date.now() - lastActivity) > BATTLE_TIMEOUT_MS;
}

async function expirePvpInvite(client, battleId) {
  const state = activeBattles.get(battleId);
  const persistedInvite = state ? null : await PvpInvite.findOne({ battleId }).lean();
  const inviteState = state || (persistedInvite ? buildPvpInviteStateFromRecord(persistedInvite) : null);
  if (!inviteState || inviteState.phase !== "invite" || !isBattleExpired(inviteState)) {
    return;
  }

  activeBattles.delete(battleId);
  await PvpInvite.deleteOne({ battleId }).catch(() => null);

  if (!inviteState.channelId || !inviteState.messageId) {
    return;
  }

  const channel = await client.channels.fetch(inviteState.channelId).catch(() => null);
  const message = await channel?.messages?.fetch?.(inviteState.messageId).catch(() => null);
  if (!message?.editable) {
    return;
  }

  await message.edit({
    ...buildEmbedPayload({
      title: "PvP Invite Expired",
      description: `${inviteState.opponentName} did not accept ${inviteState.challengerName}'s challenge in time. The duel slot is open again.`,
      visual: "pvp-challenge.svg",
    }),
    components: [],
  }).catch(() => null);
}

function buildPvpInviteStateFromRecord(invite) {
  return {
    id: invite.battleId,
    phase: "invite",
    isBoss: false,
    challengerId: invite.challengerId,
    challengerName: invite.challengerName,
    opponentId: invite.opponentId,
    opponentName: invite.opponentName,
    guildId: invite.guildId,
    playerGuildIds: {
      [invite.challengerId]: invite.guildId,
      [invite.opponentId]: invite.guildId,
    },
    arena: invite.arena || pickPvpArena(),
    createdAt: invite.createdAt?.getTime ? invite.createdAt.getTime() : new Date(invite.createdAt || Date.now()).getTime(),
    inviteExpiresAt: invite.inviteExpiresAt?.getTime ? invite.inviteExpiresAt.getTime() : new Date(invite.inviteExpiresAt).getTime(),
    channelId: invite.channelId,
    messageId: invite.messageId,
    messages: invite.channelId && invite.messageId ? [{ guildId: invite.guildId, channelId: invite.channelId, messageId: invite.messageId }] : [],
  };
}

function getBattleSessionExpiry(state) {
  const baseTime = Number(state?.lastActionAt || state?.createdAt) || Date.now();
  return new Date(baseTime + BATTLE_TIMEOUT_MS);
}

async function saveBattleSession(state) {
  if (!state?.id || state.phase === "invite") {
    return;
  }
  await BattleSession.findOneAndUpdate(
    { battleId: state.id },
    {
      $set: {
        battleId: state.id,
        state: JSON.parse(JSON.stringify(state)),
        expiresAt: getBattleSessionExpiry(state),
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  ).catch((error) => {
    console.error("Failed to save battle session:", error);
  });
}

async function deleteBattleSession(battleId) {
  await BattleSession.deleteOne({ battleId }).catch(() => null);
}

async function restoreBattleSession(battleId) {
  const record = await BattleSession.findOne({ battleId }).lean();
  if (!record?.state) {
    return null;
  }
  const state = record.state;
  activeBattles.set(battleId, state);
  return state;
}

function pruneExpiredBattles() {
  for (const [battleId, state] of activeBattles.entries()) {
    if (isBattleExpired(state)) {
      activeBattles.delete(battleId);
    }
  }
}

function findBattleForUser(userId) {
  pruneExpiredBattles();
  for (const state of activeBattles.values()) {
    if ([state.playerOne?.id, state.playerTwo?.id, state.challengerId, state.opponentId].includes(userId)) {
      return state;
    }
  }
  return null;
}

function getBattleActionCooldownRemaining(fighter, actionId) {
  const nextAvailableTurn = fighter?.actionCooldowns?.[actionId] || 0;
  const turnsTaken = fighter?.turnsTaken || 0;
  return Math.max(0, nextAvailableTurn - turnsTaken);
}

function getBattleActionCooldownLabel(fighter, actionId) {
  const remaining = getBattleActionCooldownRemaining(fighter, actionId);
  if (remaining <= 0) {
    return "";
  }
  return `${remaining}r`;
}

function isBattleActionOnCooldown(state, fighter, actionId) {
  if (state?.isBoss) {
    return false;
  }
  return getBattleActionCooldownRemaining(fighter, actionId) > 0;
}

function applyBattleActionCooldown(state, fighter, actionId) {
  if (state?.isBoss) {
    return;
  }
  const action = getBattleAction(actionId);
  const cooldownRounds = action?.cooldownRounds || 0;
  if (cooldownRounds <= 0) {
    return;
  }
  fighter.actionCooldowns = fighter.actionCooldowns || {};
  fighter.actionCooldowns[actionId] = (fighter.turnsTaken || 0) + cooldownRounds + 1;
}

function trackBattleTurn(fighter) {
  fighter.turnsTaken = (fighter.turnsTaken || 0) + 1;
}

function summarizeBattleCooldowns(fighter) {
  return Object.keys(fighter?.actionCooldowns || {})
    .map((actionId) => {
      const remaining = getBattleActionCooldownRemaining(fighter, actionId);
      if (remaining <= 0) {
        return null;
      }
      const action = getBattleAction(actionId);
      return `${action?.label || actionId} ${remaining}r`;
    })
    .filter(Boolean)
    .join(", ");
}

function formatEffectValue(value) {
  return Number.isInteger(value) ? `${value}` : `+${(value * 100).toFixed(1)}%`;
}

function getEffectCapsForUser(user = null) {
  const caps = { ...EFFECT_CAPS };
  const premiumEffects = getPremiumEffects(user);
  Object.entries(premiumEffects).forEach(([effectId, value]) => {
    if (typeof caps[effectId] === "number") {
      caps[effectId] += value;
    }
  });
  return caps;
}

function formatEffectCapValue(effectId, caps = EFFECT_CAPS) {
  const cap = caps[effectId];
  if (typeof cap !== "number") {
    return "None";
  }
  return Number.isInteger(cap) ? `${cap}` : `+${(cap * 100).toFixed(1)}%`;
}

function applyEffectCaps(effects, caps = EFFECT_CAPS) {
  return Object.entries(effects).reduce((acc, [key, value]) => {
    const cap = caps[key];
    acc[key] = typeof cap === "number" ? clamp(value, 0, cap) : value;
    return acc;
  }, {});
}

function sumEffectSources(sources, caps = EFFECT_CAPS) {
  const combined = {};
  sources.forEach((source) => {
    Object.entries(source || {}).forEach(([key, value]) => {
      combined[key] = (combined[key] || 0) + value;
    });
  });
  return applyEffectCaps(combined, caps);
}

function buildEffectCapLines(user = null) {
  const caps = getEffectCapsForUser(user);
  return [
    `Spin Reward: cap ${formatEffectCapValue("spinRewardBoost", caps)}`,
    `Vault Interest: cap ${formatEffectCapValue("vaultInterestBoost", caps)}/hr`,
    `Coinflip Win: cap ${formatEffectCapValue("coinflipWinBoost", caps)}`,
    `Work Aura: cap ${formatEffectCapValue("workAuraBoost", caps)}`,
    `Work XP: cap ${formatEffectCapValue("workXpBoost", caps)}`,
    `Mine Yield: cap ${formatEffectCapValue("mineYieldBoost", caps)}`,
    `Mine XP: cap ${formatEffectCapValue("mineXpBoost", caps)}`,
    `Mine Iron Bonus: cap +${formatEffectCapValue("mineIronBonus", caps)} ore`,
    `Garden Yield: cap ${formatEffectCapValue("gardenYieldBoost", caps)}`,
    `Boss Reward: cap ${formatEffectCapValue("bossRewardBoost", caps)}`,
    `PvP Reward: cap ${formatEffectCapValue("pvpRewardBoost", caps)}`,
    `Crate Aura: cap ${formatEffectCapValue("crateAuraBoost", caps)}`,
  ].join("\n");
}

function rollCombatLoot(kind, sourceId = null) {
  const drops = [];

  if (kind === "boss") {
    const boss = BOSSES.find((entry) => entry.id === sourceId);
    const lootTable = boss?.loot;
    Object.entries(lootTable?.crateChance || {}).forEach(([crateId, chance]) => {
      if (Math.random() < chance) {
        drops.push({ type: "crate", id: crateId, quantity: 1, label: `${getCrateLabel(crateId)} x1` });
      }
    });
    (lootTable?.materials || []).forEach((material) => {
      if (Math.random() < material.chance) {
        const quantity = randInt(material.quantity[0], material.quantity[1]);
        drops.push({ type: "material", id: material.id, quantity, label: `${getInventoryLabel(material.id)} x${quantity}` });
      }
    });
  }

  if (kind === "pvp") {
    if (Math.random() < 0.2) {
      drops.push({ type: "crate", id: "common", quantity: 1, label: `${getCrateLabel("common")} x1` });
    }
    if (Math.random() < 0.5) {
      const materialPool = [
        { id: "iron_ore", quantity: randInt(1, 3) },
        { id: "ember_shard", quantity: randInt(1, 2) },
      ];
      const reward = materialPool[randInt(0, materialPool.length - 1)];
      drops.push({ type: "material", ...reward, label: `${getInventoryLabel(reward.id)} x${reward.quantity}` });
    }
  }

  return drops;
}

function applyCombatLoot(user, loot) {
  loot.forEach((drop) => {
    if (drop.type === "crate") {
      user.crates.set(drop.id, (user.crates.get(drop.id) || 0) + drop.quantity);
      return;
    }
    addInventoryItem(user, drop.id, drop.quantity);
  });
}

function getBossCraftingHint(boss) {
  const hints = {
    ember: "Drops ember-heavy loot for Lucky Charm, Combat Manual, and Bloom Satchel routes.",
    oracle: "Best source for sun resin toward the Oracle Relic path.",
    warden: "Best source for vault dust for Vault Key, Miner's Lantern, and mixed crate crafting.",
    codex: "Late-game mixed loot source for Oracle Relic progress and higher crate spikes.",
  };
  return hints[boss.id] || "Fight this boss for crafting materials and combat loot.";
}

function buildCraftingGuidePayload() {
  return buildEmbedPayload({
    title: "Crafting Guide",
    description: "Use this route map to decide which bosses to farm for each upgrade path.",
    visual: "help-summary.svg",
    fields: [
      { name: "Ember Tyrant", value: "Lucky Charm\nCombat Manual\nBloom Satchel" },
      { name: "Oracle of Static", value: "Oracle Relic\nSun resin support" },
      { name: "Vault Warden", value: "Vault Key\nMiner's Lantern\nCommon Crate" },
      { name: "Codex Prime", value: "Oracle Relic\nLate-game mixed loot\nHigher crate spikes" },
      { name: "Best Mixed Routes", value: "Combat Manual: Ember + Vault Warden\nCommon Crate: Ember + Vault Warden\nOracle Relic: Oracle of Static + Codex" },
    ],
    footer: "Check /boss before a fight and /craft when you are ready to spend materials.",
  });
}

function getRankByXp(xp) {
  let rankIndex = 0;
  for (let index = 0; index < RANKS.length; index += 1) {
    if (xp >= RANKS[index].xpRequired) {
      rankIndex = index;
    }
  }
  return rankIndex;
}

function nextRank(rankIndex) {
  return RANKS[Math.min(rankIndex + 1, RANKS.length - 1)];
}

function getPerkEffects(user) {
  return user.ownedPerks.reduce((acc, perkId) => {
    const item = getItem(perkId);
    if (!item?.effects || (isPremiumOnlyItem(item) && !isPremiumActive(user))) {
      return acc;
    }
    Object.entries(item.effects).forEach(([key, value]) => {
      acc[key] = (acc[key] || 0) + value;
    });
    return acc;
  }, {});
}

function getGearEffects(user) {
  return Object.values(user.equippedGear || {}).reduce((acc, gearId) => {
    const gear = getGearItem(gearId);
    if (!gear?.effects) {
      return acc;
    }
    const multiplier = getForgePowerMultiplier(user, gearId);
    Object.entries(gear.effects).forEach(([key, value]) => {
      acc[key] = (acc[key] || 0) + value * multiplier;
    });
    return acc;
  }, {});
}

function getCurrentWorldEvent() {
  const durationMs = (WORLD_EVENTS[0]?.durationHours || 6) * 60 * 60 * 1000;
  const eventIndex = Math.floor(Date.now() / durationMs) % WORLD_EVENTS.length;
  const event = WORLD_EVENTS[eventIndex];
  const startedAt = Math.floor(Date.now() / durationMs) * durationMs;
  return { ...event, endsAt: startedAt + durationMs };
}

function getCombinedEffects(user) {
  const worldEvent = getCurrentWorldEvent();
  const perkEffects = getPerkEffects(user);
  const gearEffects = getGearEffects(user);
  const premiumEffects = getPremiumEffects(user);
  const eventEffects = worldEvent.effects || {};
  return sumEffectSources([perkEffects, gearEffects, premiumEffects, eventEffects], getEffectCapsForUser(user));
}

function ensureInventoryEntry(user, id) {
  let entry = user.inventory.find((item) => item.id === id);
  if (!entry) {
    user.inventory.push({ id, quantity: 0 });
    entry = user.inventory[user.inventory.length - 1];
  }
  return entry;
}

function addInventoryItem(user, id, quantity = 1) {
  const entry = ensureInventoryEntry(user, id);
  entry.quantity += quantity;
}

function normalizeInventoryState(user) {
  let changed = false;

  user.inventory.forEach((entry) => {
    if (getGearItem(entry.id) && entry.quantity <= 0) {
      entry.quantity = 1;
      changed = true;
    }
  });

  if (changed) {
    user.markModified("inventory");
  }
}

function grantMicrotransactionProduct(user, product, quantity = 1) {
  const grants = product?.grants || {};
  const purchaseQuantity = Math.max(1, Math.floor(Number(quantity) || 1));
  const summary = [];

  if (grants.aura) {
    const auraAmount = grants.aura * purchaseQuantity;
    user.aura += auraAmount;
    summary.push(`${formatNumber(auraAmount)} aura`);
  }

  if (grants.xp) {
    const xpAmount = grants.xp * purchaseQuantity;
    user.xp += xpAmount;
    summary.push(`${formatNumber(xpAmount)} XP`);
  }

  Object.entries(grants.crates || {}).forEach(([crateId, grantQuantity]) => {
    const totalQuantity = grantQuantity * purchaseQuantity;
    if (!CRATES[crateId] || totalQuantity <= 0) {
      return;
    }
    user.crates.set(crateId, (user.crates.get(crateId) || 0) + totalQuantity);
    summary.push(`${totalQuantity} ${getCrateLabel(crateId)}${totalQuantity === 1 ? "" : "s"}`);
  });

  Object.entries(grants.inventory || {}).forEach(([itemId, grantQuantity]) => {
    const totalQuantity = grantQuantity * purchaseQuantity;
    if (!getItem(itemId) || totalQuantity <= 0) {
      return;
    }
    addInventoryItem(user, itemId, totalQuantity);
    const item = getItem(itemId);
    if (item.type === "perk" && !user.ownedPerks.includes(itemId)) {
      user.ownedPerks.push(itemId);
    }
    summary.push(`${totalQuantity} ${getInventoryLabel(itemId)}`);
  });

  return summary;
}

function queueRankUpMessage(user, ranks) {
  if (!user?.userId || !ranks?.length) {
    return;
  }
  const key = `${user.guildId || "global"}:${user.userId}`;
  const existing = pendingRankUps.get(key) || { guildId: user.guildId || null, userId: user.userId, ranks: [] };
  existing.ranks.push(...ranks);
  pendingRankUps.set(key, existing);
}

async function sendPendingRankUpMessages(interaction) {
  if (!interaction?.guildId) {
    return;
  }

  const messages = [];
  for (const [key, entry] of pendingRankUps.entries()) {
    if (entry.guildId && entry.guildId !== interaction.guildId) {
      continue;
    }
    pendingRankUps.delete(key);
    const latestRank = entry.ranks[entry.ranks.length - 1];
    const rankLines = entry.ranks.map((rank) => `${getRankLabel(rank)} reward: ${formatNumber(rank.rewardAura)} aura${Object.entries(rank.rewardCrates || {}).length ? `, ${Object.entries(rank.rewardCrates).map(([crateId, amount]) => `${getCrateLabel(crateId)} x${amount}`).join(", ")}` : ""}`);
    messages.push(buildEmbedPayload({
      title: "Rank Up",
      description: `<@${entry.userId}> ranked up to **${getRankLabel(latestRank)}**.`,
      visual: "core-profile.svg",
      fields: [
        { name: "Unlocked Rank", value: rankLines.join("\n") },
      ],
    }));
  }

  for (const payload of messages) {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload).catch(() => null);
    } else {
      await interaction.channel?.send?.(payload).catch(() => null);
    }
  }
}

function setQuestSet(user) {
  if (user.quests.length > 0) {
    return;
  }
  const selected = [...QUEST_TEMPLATES].sort(() => Math.random() - 0.5).slice(0, 3);
  user.quests = selected.map((quest) => ({ ...quest, progress: 0, completed: false }));
}

async function syncRank(user) {
  const previousRank = user.rankIndex;
  const computedRank = getRankByXp(user.xp);
  user.rankIndex = computedRank;
  if (computedRank > previousRank) {
    const rankedUp = [];
    for (let index = previousRank + 1; index <= computedRank; index += 1) {
      const rank = RANKS[index];
      rankedUp.push(rank);
      user.aura += rank.rewardAura;
      Object.entries(rank.rewardCrates || {}).forEach(([crateId, amount]) => {
        user.crates.set(crateId, (user.crates.get(crateId) || 0) + amount);
      });
    }
    queueRankUpMessage(user, rankedUp);
  }
}

async function applyQuestProgress(user, metric, amount) {
  let changed = false;
  user.quests.forEach((quest) => {
    if (quest.metric !== metric || quest.completed) {
      return;
    }
    quest.progress = Math.min(quest.goal, quest.progress + amount);
    if (quest.progress >= quest.goal) {
      quest.completed = true;
      user.aura += quest.rewardAura;
      user.xp += quest.rewardXp;
    }
    changed = true;
  });
  if (changed) {
    await syncRank(user);
  }
}

async function getOrCreatePlayer(guildId, userId) {
  let user = await User.findOne(buildPlayerLookup(guildId, userId)).sort({ updatedAt: -1, createdAt: 1 });
  if (!user) {
    user = await User.create(buildPlayerCreateData(guildId, userId));
  }
  setQuestSet(user);
  if (!Array.isArray(user.gardenPlots) || user.gardenPlots.length === 0) {
    user.gardenPlots = [{ cropId: null, plantedAt: null }, { cropId: null, plantedAt: null }];
  }
  if (!user.clanMemberships?.get) {
    user.clanMemberships = new Map(Object.entries(user.clanMemberships || {}));
  }
  if (!isGlobalPlayerDataEnabled() && user.clanId && !user.clanMemberships.get(guildId)) {
    user.clanMemberships.set(guildId, user.clanId);
  }
  user.equippedGear = user.equippedGear || { tool: null, charm: null, relic: null };
  normalizeInventoryState(user);
  normalizeProgressionSystems(user);
  if (!user.lastVaultInterestAt) {
    user.lastVaultInterestAt = new Date();
  }
  normalizePremiumState(user);
  ensureGardenPlotLimit(user);
  normalizeReminderState(user);
  return user;
}

async function rememberPlayerContext(user, interaction) {
  if (!user || !interaction?.guildId || !interaction?.channelId) {
    return;
  }
  user.botContext = user.botContext || {};
  user.botContext.lastGuildId = interaction.guildId;
  user.botContext.lastChannelId = interaction.channelId;
}

async function getGuildSettings(guildId) {
  if (!guildId) {
    return null;
  }
  return GuildSettings.findOne({ guildId });
}

async function setAurixChannel(guildId, channelId, configuredBy) {
  return GuildSettings.findOneAndUpdate(
    { guildId },
    {
      $set: {
        guildId,
        aurixChannelId: channelId,
        configuredBy,
        configuredAt: new Date(),
      },
    },
    { new: true, upsert: true }
  );
}

function getHarvestReadyAt(user) {
  const readyTimes = (user.gardenPlots || [])
    .filter((plot) => plot?.cropId && plot?.plantedAt)
    .map((plot) => {
      const crop = getGardenCrop(plot.cropId);
      if (!crop) {
        return null;
      }
      return plot.plantedAt.getTime() + crop.growMs;
    })
    .filter(Boolean);

  if (!readyTimes.length) {
    return null;
  }

  return Math.min(...readyTimes);
}

function getReminderReadyTimestamp(user, action) {
  if (action === "spin" && user.lastSpinAt) {
    return user.lastSpinAt.getTime() + getEffectiveCooldownMs(user, COOLDOWNS.spinMs);
  }
  if (action === "work" && user.lastWorkAt) {
    return user.lastWorkAt.getTime() + getEffectiveCooldownMs(user, COOLDOWNS.workMs);
  }
  if (action === "mine" && user.lastMineAt) {
    return user.lastMineAt.getTime() + getEffectiveCooldownMs(user, COOLDOWNS.mineMs);
  }
  if (action === "coinflip" && user.lastCoinflipAt) {
    return user.lastCoinflipAt.getTime() + getEffectiveCooldownMs(user, COOLDOWNS.coinflipMs);
  }
  if (action === "rob" && user.lastRobAt) {
    return user.lastRobAt.getTime() + getEffectiveCooldownMs(user, COOLDOWNS.robMs);
  }
  if (action === "daily" && user.lastDailyAt) {
    return user.lastDailyAt.getTime() + getEffectiveCooldownMs(user, COOLDOWNS.dailyMs);
  }
  if (action === "authority" && user.lastAuthorityAt) {
    return user.lastAuthorityAt.getTime() + getEffectiveCooldownMs(user, COOLDOWNS.authorityMs);
  }
  if (action === "boss" && user.lastBossAt) {
    return user.lastBossAt.getTime() + getEffectiveCooldownMs(user, COOLDOWNS.bossMs);
  }
  if (action === "harvest") {
    return getHarvestReadyAt(user);
  }
  return null;
}

function getReminderArmingNote(user, action) {
  const readyAt = getReminderReadyTimestamp(user, action);
  if (readyAt && readyAt > Date.now()) {
    return `Next ping in about ${humanizeMs(readyAt - Date.now())}.`;
  }
  if (readyAt) {
    return "That action is already ready, so the next reminder should go out on the next poll.";
  }
  if (action === "harvest") {
    return "Plant something first, then the reminder will ping you when a crop is ready.";
  }
  return `Use ${REMINDER_ACTIONS[action].command} once to start its cooldown cycle, then the reminder can tag you when it is ready again.`;
}

function buildBalancePayload(user, targetUser) {
  const combinedEffects = getCombinedEffects(user);
  const vaultRate = 0.03 + (combinedEffects.vaultInterestBoost || 0) + user.prestige * 0.005;
  return buildEmbedPayload({
    title: `${targetUser.username}'s Balance`,
    description: "A quick look at wallet, vault, and passive income.",
    visual: "economy-vault.svg",
    fields: [
      { name: "Wallet", value: `${formatNumber(user.aura)} aura`, inline: true },
      { name: "Vault", value: `${formatNumber(user.vaultAura)} aura`, inline: true },
      { name: "Vault Rate", value: `${(vaultRate * 100).toFixed(1)}% per hour`, inline: true },
      { name: "Membership", value: formatPremiumStatus(user), inline: true },
      { name: "Prestige", value: `${user.prestige}`, inline: true },
      { name: "Daily Streak", value: `${user.streak} day${user.streak === 1 ? "" : "s"}`, inline: true },
    ],
  });
}

function buildReminderStatusPayload(user) {
  normalizeReminderState(user);
  const reminderLimit = getReminderLimit(user);
  const enabled = user.reminders.enabledActions
    .map((action) => `\`${REMINDER_ACTIONS[action]?.command || action}\``)
    .join(", ");

  return buildEmbedPayload({
    title: "Reminder Settings",
    description: user.reminders.enabledActions.length
      ? "The bot will tag you in the saved channel when these actions are ready."
      : "No reminders are enabled right now.",
    visual: "emblem-help.svg",
    fields: [
      { name: "Enabled", value: enabled || "None" },
      { name: "Slots", value: `${user.reminders.enabledActions.length} / ${reminderLimit}`, inline: true },
      { name: "Channel", value: user.reminders.channelId ? `<#${user.reminders.channelId}>` : "Not set", inline: true },
      { name: "Server", value: user.reminders.guildId || "Not set", inline: true },
    ],
    footer: "Use /reminders enable or /reminders disable to manage tags.",
  });
}

function getReminderLimit(user) {
  return isPremiumActive(user) ? PREMIUM_REMINDER_LIMIT : FREE_REMINDER_LIMIT;
}

async function sendReadyReminder(client, user, action) {
  normalizeReminderState(user);
  if (!user.reminders.channelId || !REMINDER_ACTIONS[action]) {
    return { sent: false, reason: "not_configured" };
  }

  try {
    const channel = await client.channels.fetch(user.reminders.channelId);
    if (!channel?.isTextBased?.() || !channel.send) {
      return { sent: false, reason: "channel_unavailable" };
    }

    await channel.send({
      content: `<@${user.userId}> ${REMINDER_ACTIONS[action].command} is ready again.`,
      allowedMentions: { users: [user.userId] },
    });
    return { sent: true };
  } catch (error) {
    console.error(`Failed to send reminder for ${user.userId} (${action}):`, error.message || error);
    return { sent: false, reason: "send_failed" };
  }
}

async function checkReminderQueue(client) {
  const candidates = await User.find({
    "reminders.channelId": { $ne: null },
    "reminders.enabledActions.0": { $exists: true },
  }).limit(500);

  const now = Date.now();
  for (const user of candidates) {
    normalizeReminderState(user);
    let changed = false;

    for (const action of user.reminders.enabledActions) {
      const readyAt = getReminderReadyTimestamp(user, action);
      if (!readyAt || readyAt > now) {
        continue;
      }

      const lastNotifiedAt = user.reminders.lastNotifiedAt.get(action);
      if (lastNotifiedAt && lastNotifiedAt.getTime() >= readyAt) {
        continue;
      }

      const result = await sendReadyReminder(client, user, action);
      if (result.sent) {
        user.reminders.lastNotifiedAt.set(action, new Date(now));
        changed = true;
      } else if (["channel_unavailable", "send_failed"].includes(result.reason)) {
        user.reminders.enabledActions = user.reminders.enabledActions.filter((entry) => entry !== action);
        user.reminders.lastNotifiedAt.delete(action);
        changed = true;
      }
    }

    if (changed) {
      if (!user.reminders.enabledActions.length) {
        user.reminders.channelId = null;
        user.reminders.guildId = null;
      }
      user.markModified("reminders");
      await user.save();
    }
  }
}

function startReminderLoop(client) {
  if (reminderIntervals.has(client)) {
    return;
  }

  const tick = () => checkReminderQueue(client).catch((error) => {
    console.error("Reminder loop failed:", error);
  });

  tick();
  const interval = setInterval(tick, REMINDER_POLL_MS);
  interval.unref?.();
  reminderIntervals.set(client, interval);
}

function getEffectiveCooldownMs(user, durationMs) {
  const reduction = getPremiumCooldownReduction(user);
  return Math.max(1000, Math.floor(durationMs * (1 - reduction)));
}

function getCooldownRemaining(lastDate, durationMs, user = null) {
  if (!lastDate) {
    return 0;
  }
  return Math.max(0, lastDate.getTime() + getEffectiveCooldownMs(user, durationMs) - Date.now());
}

function humanizeMs(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes <= 0 ? `${seconds}s` : `${minutes}m ${seconds}s`;
}

async function claimVaultInterest(user) {
  const effects = getCombinedEffects(user);
  const now = new Date();
  const elapsedMs = now.getTime() - (user.lastVaultInterestAt?.getTime() || now.getTime());
  const elapsedHours = elapsedMs / (60 * 60 * 1000);
  const rate = 0.03 + (effects.vaultInterestBoost || 0) + user.prestige * 0.005;
  const interest = Math.floor(user.vaultAura * rate * elapsedHours);
  user.lastVaultInterestAt = now;
  if (interest > 0) {
    user.vaultAura += interest;
  }
  return interest;
}

function buildProfileEmbed(user, targetUser) {
  normalizeCosmetics(user);
  const currentRank = RANKS[user.rankIndex];
  const next = nextRank(user.rankIndex);
  const rankProgressCurrent = user.xp - currentRank.xpRequired;
  const rankProgressTotal = Math.max(1, next.xpRequired - currentRank.xpRequired);
  const cosmeticStyle = getProfileCosmeticStyle(user, targetUser);
  const payload = buildEmbedPayload({
    title: cosmeticStyle.title,
    description: `${cosmeticStyle.description}\nA complete snapshot of progression, economy, and combat readiness.`,
    visual: "core-profile.svg",
    banner: false,
    thumbnail: targetUser.displayAvatarURL?.({ extension: "png", size: 128 }) || null,
    color: cosmeticStyle.color,
    fields: [
      { name: "Nameplate", value: cosmeticStyle.nameplate, inline: false },
      { name: "Aura Wallet", value: `${formatNumber(user.aura)}`, inline: true },
      { name: "Vault Aura", value: `${formatNumber(user.vaultAura)}`, inline: true },
      { name: "XP", value: `${formatNumber(user.xp)}`, inline: true },
      { name: "Rank", value: getRankLabel(currentRank), inline: true },
      { name: "Prestige", value: `${user.prestige}`, inline: true },
      { name: "Membership", value: formatPremiumStatus(user), inline: true },
      { name: "Profile Style", value: `Title: ${cosmeticStyle.titleLabel}\nFrame: ${cosmeticStyle.frameLabel}`, inline: true },
      { name: "Daily Streak", value: `${user.streak} days`, inline: true },
      { name: "Rank Progress", value: `${progressBar(rankProgressCurrent, rankProgressTotal)}\n${formatNumber(rankProgressCurrent)} / ${formatNumber(rankProgressTotal)} XP` },
      { name: "Battle Record", value: `PvP ${user.stats.pvpWins}-${user.stats.pvpLosses} | Boss ${user.stats.bossWins}-${user.stats.bossLosses}` },
      { name: "PvP Streak", value: `${formatNumber(getPvpStreak(user))} current | ${formatNumber(getBestPvpStreak(user))} best`, inline: true },
    ],
    footer: "Ranks can go down if your XP drops below the current tier threshold.",
  });
  const cosmeticAttachment = buildProfileCosmeticAttachment(user);
  if (cosmeticAttachment) {
    payload.files = [...(payload.files || []), cosmeticAttachment];
    payload.embeds[0].setImage(`attachment://${PROFILE_COSMETIC_FILE}`);
  }
  return payload;
}

const HELP_SECTIONS = [
  {
    id: "getting_started",
    name: "Getting Started",
    visual: "help-core.svg",
    commands: [
      { name: "/start", description: "Create your save and open the quick-start guide." },
      { name: "/profile [user]", description: "View your or another player's profile." },
      { name: "/stats [user]", description: "See a fuller breakdown of player activity." },
      { name: "/event", description: "View the current rotating world event." },
      { name: "/setup", description: "Admin/mod command to choose where Aurix commands work." },
      { name: "/help", description: "Browse every command grouped by category." },
    ],
  },
  {
    id: "economy",
    name: "Economy",
    visual: "economy-vault.svg",
    commands: [
      { name: "/daily", description: "Claim your streak reward and refresh quests." },
      { name: "/premium-chest", description: "Premium-only recurring loot chest with aura, XP, crates, and materials." },
      { name: "/work", description: "Complete a shift for steady aura and XP." },
      { name: "/mine", description: "Gather crafting materials on a cooldown." },
      { name: "/spin", description: "Spin for aura and XP on a cooldown." },
      { name: "/coinflip", description: "Bet aura on heads or tails on a cooldown." },
      { name: "/rob user:<player>", description: "Risk a cooldown to steal aura from another player." },
      { name: "/vault deposit", description: "Move aura into the vault." },
      { name: "/vault withdraw", description: "Take aura back from the vault." },
      { name: "/vault interest", description: "Collect the vault's accumulated interest." },
      { name: "/shop", description: "Browse perks, crates, and unlocks." },
      { name: "/buy item:<id>", description: "Purchase a shop item by id." },
      { name: "/gift user:<player> amount:<amount>", description: "Send aura to another player." },
      { name: "/inventory", description: "Review owned items, battle consumables, skills, and crates." },
      { name: "/craft recipe:<id>", description: "Turn mined materials into useful rewards." },
      { name: "/forge", description: "Spend aura to upgrade or repair crafted gear." },
      { name: "/garden", description: "Plant and harvest real-time crops." },
      { name: "/property", description: "Buy investments that produce passive aura, XP, and materials." },
      { name: "/expedition", description: "Send your character away for timed loot missions." },
      { name: "/gear", description: "Equip crafted gear and review your loadout." },
      { name: "/crate type:<type>", description: "Open a common, rare, epic, or legendary crate." },
    ],
  },
  {
    id: "progression",
    name: "Progression",
    visual: "help-summary.svg",
    commands: [
      { name: "/rank", description: "Check XP rank progress and prestige readiness." },
      { name: "/prestige", description: "Reset your ladder after reaching the top rank." },
      { name: "/quests", description: "View your current daily quest set." },
      { name: "/achievements", description: "Claim milestone rewards you have unlocked." },
      { name: "/leaderboard category:<type>", description: "See the top players or clans." },
      { name: "/authority user:<player>", description: "Use the Riftkeeper+ blessing command." },
      { name: "/premium", description: "View your premium status and website link." },
      { name: "/premium-chest", description: "Open your premium recurring loot chest." },
    ],
  },
  {
    id: "combat",
    name: "Combat",
    visual: "help-bosses.svg",
    commands: [
      { name: "/skills", description: "See unlocked battle skills and attack styles." },
      { name: "/pvp user:<player>", description: "Send a duel invite, lock a loadout, and fight another player." },
      { name: "/pvp", description: "Join global matchmaking for a cross-server PvP opponent." },
      { name: "/pvp mode:status", description: "Check your current global matchmaking search." },
      { name: "/boss [boss]", description: "Fight one of the available bosses." },
    ],
  },
  {
    id: "clans",
    name: "Clans",
    visual: "help-clans.svg",
    commands: [
      { name: "/clan create name:<name>", description: "Create a clan for 50,000 aura." },
      { name: "/clan join code:<code>", description: "Join an existing clan." },
      { name: "/clan apply code:<code>", description: "Send a join request for approval." },
      { name: "/clan info", description: "View your clan hall." },
      { name: "/clan members", description: "List the current clan roster." },
      { name: "/clan kick user:<player>", description: "Owner-only member removal." },
      { name: "/clan approve user:<player>", description: "Owner or officer request approval." },
      { name: "/clan decline user:<player>", description: "Owner or officer reject an applicant." },
      { name: "/clan log", description: "View recent clan activity." },
      { name: "/clan role user:<player> role:<type>", description: "Owner-only officer management." },
      { name: "/clan transfer user:<player>", description: "Owner-only leadership transfer." },
      { name: "/clan disband", description: "Owner-only full clan deletion." },
      { name: "/clan upgrade path:<type>", description: "Spend clan vault aura on upgrades." },
      { name: "/clan raid", description: "Launch a cooldown-based clan raid." },
      { name: "/clan donate amount:<amount>", description: "Donate aura to the clan vault." },
      { name: "/clan war enemy:<code>", description: "Fight another clan by invite code." },
      { name: "/clan leave", description: "Leave your current clan." },
    ],
  },
];

const ACHIEVEMENTS = [
  { id: "first_shift", name: "First Shift", description: "Complete 1 work command.", metric: (user) => user.stats.works, goal: 1, rewardAura: 350, rewardXp: 120 },
  { id: "steady_worker", name: "Steady Worker", description: "Complete 10 work commands.", metric: (user) => user.stats.works, goal: 10, rewardAura: 1800, rewardXp: 420 },
  { id: "lucky_spinner", name: "Lucky Spinner", description: "Use spin 25 times.", metric: (user) => user.stats.spins, goal: 25, rewardAura: 2200, rewardXp: 520 },
  { id: "vault_builder", name: "Vault Builder", description: "Store 10,000 aura in the vault.", metric: (user) => user.vaultAura, goal: 10000, rewardAura: 2500, rewardXp: 600 },
  { id: "shadow_winner", name: "Shadow Winner", description: "Win 5 robberies.", metric: (user) => user.stats.robWins, goal: 5, rewardAura: 2600, rewardXp: 650 },
  { id: "ore_runner", name: "Ore Runner", description: "Mine 10 times.", metric: (user) => user.stats.mines, goal: 10, rewardAura: 2100, rewardXp: 480 },
  { id: "artisan", name: "Artisan", description: "Craft 5 recipes.", metric: (user) => user.stats.crafts, goal: 5, rewardAura: 2800, rewardXp: 700 },
  { id: "boss_hunter", name: "Boss Hunter", description: "Defeat 5 bosses.", metric: (user) => user.stats.bossWins, goal: 5, rewardAura: 4300, rewardXp: 1050 },
  { id: "prestige_path", name: "Prestige Path", description: "Reach prestige 1.", metric: (user) => user.prestige, goal: 1, rewardAura: 5000, rewardXp: 1000 },
];

function formatHelpSection(section) {
  return section.commands.map((command) => `\`${command.name}\`\n${command.description}`).join("\n\n");
}

function formatHelpOverview() {
  return HELP_SECTIONS.map((section) => `**${section.name}** (${section.commands.length})\nUse \`/help category:${section.id}\``).join("\n\n");
}

function getHelpSection(categoryId) {
  return HELP_SECTIONS.find((section) => section.id === categoryId) || null;
}

function getOfficialServerUrl() {
  const value = process.env.OFFICIAL_SERVER_URL
    || process.env.OFFICIAL_DISCORD_URL
    || process.env.DISCORD_SERVER_URL
    || process.env.SUPPORT_SERVER_URL
    || OFFICIAL_SERVER_URL;
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function hasSetupAccess(memberPermissions) {
  if (!memberPermissions) {
    return false;
  }
  return memberPermissions.has(PermissionsBitField.Flags.Administrator)
    || memberPermissions.has(PermissionsBitField.Flags.ManageGuild)
    || memberPermissions.has(PermissionsBitField.Flags.ManageMessages)
    || memberPermissions.has(PermissionsBitField.Flags.ModerateMembers);
}

function buildOfficialServerValue() {
  return getOfficialServerUrl() || OFFICIAL_SERVER_URL;
}

function buildPlayerStartPayload(user) {
  return buildEmbedPayload({
    title: "Aurix Online",
    description: `Your save is ready with ${formatNumber(user.aura)} starter aura. Here is the fastest way to get moving.`,
    visual: "help-core.svg",
    fields: [
      { name: "1. Build Income", value: "Run `/daily`, `/work`, `/spin`, and `/mine` whenever they are ready." },
      { name: "2. Track Progress", value: "Check `/profile`, `/rank`, `/quests`, and `/achievements` to keep your build growing." },
      { name: "3. Expand Systems", value: "Use `/garden`, `/craft`, `/gear`, and `/shop` to stack more long-term power." },
      { name: "4. Enter Combat", value: "Try `/boss` and `/pvp` once your economy and skills are in a good spot." },
      { name: "Need Commands?", value: "Open `/help` to browse the full command list by category." },
    ],
    footer: "Use /help if you want the full command list.",
  });
}

function buildServerSetupPayload(guildName) {
  return buildEmbedPayload({
    title: "Setup Completed",
    description: `Aurix is ready in **${guildName}**. This is now the server's Aurix channel.`,
    visual: "help-core.svg",
    fields: [
      { name: "Player Onboarding", value: "Members should run `/start` to create their save and see the quick-start path." },
      { name: "Best First Commands", value: "`/daily`, `/work`, `/spin`, `/mine`, `/profile`, `/help`" },
      { name: "Changing Channels", value: "Admins can run `/setup` inside a different channel, or `/setup channel:#channel`, to move Aurix." },
      { name: "Official Server", value: buildOfficialServerValue() },
    ],
    footer: "Aurix setup v2 - commands used outside this channel will point members back here.",
  });
}

function buildServerJoinPayload(guildName) {
  return buildEmbedPayload({
    title: "Aurix Setup Required",
    description: `Thanks for adding Aurix to **${guildName}**. An admin should choose the channel where Aurix is allowed to work before members start using commands.`,
    visual: "help-core.svg",
    fields: [
      { name: "1. Create or Choose a Channel", value: "Use a channel like `#aurix`, `#bot-commands`, or `#economy`." },
      { name: "2. Configure Aurix", value: "Run `/setup` in the channel you want Aurix to use. You can also run `/setup channel:#your-channel`." },
      { name: "3. Player Start", value: "Members should run `/start`, then use `/daily`, `/work`, `/spin`, `/mine`, and `/profile`." },
      { name: "4. Premium and Support", value: "Use `/premium` to view membership status and `/help` to browse every command." },
      { name: "Official Server", value: buildOfficialServerValue() },
    ],
    footer: "Aurix setup v2 - admins can rerun /setup any time to change the Aurix channel.",
  });
}

async function sendServerSetupMessage(guild, preferredChannel = null) {
  const payload = buildServerSetupPayload(guild.name);
  return sendGuildMessageToBestChannel(guild, payload, preferredChannel);
}

async function sendServerJoinMessage(guild, preferredChannel = null) {
  const payload = buildServerJoinPayload(guild.name);
  return sendGuildMessageToBestChannel(guild, payload, preferredChannel);
}

async function sendGuildMessageToBestChannel(guild, payload, preferredChannel = null) {
  const candidates = [];

  if (preferredChannel?.isTextBased?.() && preferredChannel.send) {
    candidates.push(preferredChannel);
  }
  if (guild.systemChannel?.isTextBased?.() && guild.systemChannel.send) {
    candidates.push(guild.systemChannel);
  }

  if (!candidates.length) {
    const fetchedChannels = await guild.channels.fetch().catch(() => null);
    if (fetchedChannels) {
      const textChannels = [...fetchedChannels.values()]
        .filter((channel) => channel?.isTextBased?.() && channel.send && !channel.isThread?.())
        .sort((left, right) => (left.rawPosition || 0) - (right.rawPosition || 0));
      candidates.push(...textChannels);
    }
  }

  const uniqueCandidates = [...new Set(candidates.filter(Boolean))];
  for (const channel of uniqueCandidates) {
    const permissions = channel.permissionsFor(guild.client.user);
    if (permissions && permissions.has(PermissionsBitField.Flags.ViewChannel) && permissions.has(PermissionsBitField.Flags.SendMessages)) {
      await channel.send(payload);
      return channel;
    }
  }

  return null;
}

function getAvailableAchievements(user) {
  return ACHIEVEMENTS.filter((achievement) => !user.claimedAchievements.includes(achievement.id) && achievement.metric(user) >= achievement.goal);
}

function ensureClanState(clan) {
  clan.level = clan.level || 1;
  clan.officerIds = clan.officerIds || [];
  clan.pendingApplicantIds = clan.pendingApplicantIds || [];
  clan.log = clan.log || [];
  clan.upgrades = clan.upgrades || {};
  clan.upgrades.hall = clan.upgrades.hall || 1;
  clan.upgrades.vault = clan.upgrades.vault || 1;
  clan.upgrades.arsenal = clan.upgrades.arsenal || 1;
  clan.raidWins = clan.raidWins || 0;
  clan.raidLosses = clan.raidLosses || 0;
  return clan;
}

function getClanVaultCapacity(clan) {
  return 50000 + clan.upgrades.hall * 25000 + clan.upgrades.vault * 50000;
}

function getClanMemberCap(clan) {
  return 4 + clan.upgrades.hall * 2;
}

function isClanOfficer(clan, userId) {
  return clan.ownerId === userId || clan.officerIds.includes(userId);
}

function getClanRoleLabel(clan, userId) {
  if (clan.ownerId === userId) {
    return "Owner";
  }
  if (clan.officerIds.includes(userId)) {
    return "Officer";
  }
  return "Member";
}

function getClanUpgradeCost(clan, path) {
  const currentLevel = clan.upgrades[path] || 1;
  const costs = {
    hall: 20000,
    vault: 18000,
    arsenal: 22000,
  };
  return costs[path] * currentLevel;
}

function getClanPower(clan) {
  return clan.memberIds.length * 25 + clan.trophies + clan.level * 40 + clan.upgrades.arsenal * 55 + clan.upgrades.hall * 20;
}

function addClanLog(clan, type, actorId, details, targetId = null) {
  clan.log.unshift({
    type,
    actorId,
    targetId,
    details,
    createdAt: new Date(),
  });
  clan.log = clan.log.slice(0, 20);
}

async function formatClanLogEntries(interaction, clan) {
  if (!clan.log.length) {
    return "No clan activity recorded yet.";
  }

  const userIds = [...new Set(clan.log.flatMap((entry) => [entry.actorId, entry.targetId]).filter(Boolean))];
  const resolved = await Promise.all(userIds.map(async (userId) => {
    const user = await interaction.client.users.fetch(userId).catch(() => null);
    return [userId, user?.username || userId];
  }));
  const nameMap = new Map(resolved);

  return clan.log.map((entry, index) => {
    const actor = entry.actorId ? nameMap.get(entry.actorId) || entry.actorId : "System";
    const target = entry.targetId ? nameMap.get(entry.targetId) || entry.targetId : null;
    const names = target ? `${actor} -> ${target}` : actor;
    return `${index + 1}. [${entry.type}] ${names}: ${entry.details}`;
  }).join("\n");
}

async function handleStart(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  await user.save();
  return interaction.reply({
    ...buildPlayerStartPayload(user),
    ephemeral: true,
  });
}

async function handleProfile(interaction) {
  const target = interaction.options.getUser("user") || interaction.user;
  const user = await getOrCreatePlayer(interaction.guildId, target.id);
  await user.save();
  return interaction.reply(buildProfileEmbed(user, target));
}

async function handleBalance(interaction) {
  const target = interaction.options.getUser("user") || interaction.user;
  const user = await getOrCreatePlayer(interaction.guildId, target.id);
  return interaction.reply(buildBalancePayload(user, target));
}

async function handleStats(interaction) {
  const target = interaction.options.getUser("user") || interaction.user;
  const user = await getOrCreatePlayer(interaction.guildId, target.id);
  await user.save();

  const totalBattles = user.stats.pvpWins + user.stats.pvpLosses + user.stats.bossWins + user.stats.bossLosses;
  return interaction.reply(buildEmbedPayload({
    title: `${target.username}'s Combat and Economy Stats`,
    description: "A deeper look at activity, wins, and long-term progress.",
    visual: "help-summary.svg",
    fields: [
      { name: "Spins", value: `${formatNumber(user.stats.spins)}`, inline: true },
      { name: "Coinflips", value: `${formatNumber(user.stats.coinflips)}`, inline: true },
      { name: "Shop Buys", value: `${formatNumber(user.stats.shopBuys)}`, inline: true },
      { name: "PvP Record", value: `${user.stats.pvpWins}W - ${user.stats.pvpLosses}L`, inline: true },
      { name: "Boss Record", value: `${user.stats.bossWins}W - ${user.stats.bossLosses}L`, inline: true },
      { name: "PvP Streak", value: `${formatNumber(getPvpStreak(user))} current | ${formatNumber(getBestPvpStreak(user))} best`, inline: true },
      { name: "Battles Played", value: `${formatNumber(totalBattles)}`, inline: true },
      { name: "Vault Deposited", value: `${formatNumber(user.stats.vaultDeposit)} aura`, inline: true },
      { name: "Owned Perks", value: `${formatNumber(user.ownedPerks.length)}`, inline: true },
      { name: "Unlocked Skills", value: `${formatNumber(user.skills.length)}`, inline: true },
      { name: "Membership", value: formatPremiumStatus(user), inline: true },
    ],
  }));
}

async function handleGift(interaction) {
  const sender = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const target = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);

  if (target.bot || target.id === interaction.user.id) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Gift Failed", description: "Choose another human player to receive aura.", visual: "emblem-alert.svg" }), ephemeral: true });
  }

  if (amount <= 0 || amount > sender.aura) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Gift Failed", description: "Send an amount inside your current aura wallet.", visual: "emblem-alert.svg" }), ephemeral: true });
  }

  const receiver = await getOrCreatePlayer(interaction.guildId, target.id);
  sender.aura -= amount;
  receiver.aura += amount;
  await sender.save();
  await receiver.save();

  return interaction.reply(buildEmbedPayload({
    title: "Aura Gift Sent",
    description: `${interaction.user.username} sent **${formatNumber(amount)} aura** to ${target.username}.`,
    visual: "emblem-success.svg",
    fields: [
      { name: "Sender Wallet", value: `${formatNumber(sender.aura)} aura`, inline: true },
      { name: "Receiver Wallet", value: `${formatNumber(receiver.aura)} aura`, inline: true },
    ],
  }));
}

async function handleWork(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const remaining = getCooldownRemaining(user.lastWorkAt, COOLDOWNS.workMs, user);
  if (remaining > 0) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Work Cooling Down", description: `Your next shift opens in ${humanizeMs(remaining)}.`, visual: "economy-vault.svg" }), ephemeral: true });
  }

  const effects = getCombinedEffects(user);
  const auraReward = Math.floor((randInt(260, 620) * (1 + (effects.spinRewardBoost || 0) * 0.5 + (effects.workAuraBoost || 0))) + user.prestige * 55);
  const xpReward = Math.floor((randInt(70, 140) + user.rankIndex * 10) * (1 + (effects.workXpBoost || 0)));
  user.lastWorkAt = new Date();
  user.aura += auraReward;
  user.xp += xpReward;
  user.stats.works += 1;
  await applyQuestProgress(user, "works", 1);
  await syncRank(user);
  await user.save();

  return interaction.reply(buildEmbedPayload({
    title: "Shift Complete",
    description: `You finished a clean shift and earned **${formatNumber(auraReward)} aura** plus **${formatNumber(xpReward)} XP**.`,
    visual: "economy-vault.svg",
    fields: [
      { name: "Total Shifts", value: `${formatNumber(user.stats.works)}`, inline: true },
      { name: "Next Shift", value: humanizeMs(getEffectiveCooldownMs(user, COOLDOWNS.workMs)), inline: true },
      { name: "Wallet", value: `${formatNumber(user.aura)} aura`, inline: true },
      { name: "Premium", value: isPremiumActive(user) ? "Work boost applied" : "No premium boost", inline: true },
    ],
  }));
}

async function handleMine(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const remaining = getCooldownRemaining(user.lastMineAt, COOLDOWNS.mineMs, user);
  if (remaining > 0) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Mine Cooling Down", description: `The mine resets in ${humanizeMs(remaining)}.`, visual: "economy-vault.svg" }), ephemeral: true });
  }

  const effects = getCombinedEffects(user);
  const materials = [
    { id: "iron_ore", quantity: randInt(2, 5) + (effects.mineIronBonus || 0) },
    { id: "ember_shard", quantity: randInt(0, 2) },
    { id: "vault_dust", quantity: randInt(0, 2) },
  ];
  const gained = materials.map((entry) => ({ ...entry, quantity: Math.max(0, Math.floor(entry.quantity * (1 + (effects.mineYieldBoost || 0)))) })).filter((entry) => entry.quantity > 0);
  gained.forEach((entry) => addInventoryItem(user, entry.id, entry.quantity));

  const auraReward = randInt(80, 220);
  const xpReward = Math.floor(randInt(60, 130) * (1 + (effects.mineXpBoost || 0)));
  user.lastMineAt = new Date();
  user.aura += auraReward;
  user.xp += xpReward;
  user.stats.mines += 1;
  await applyQuestProgress(user, "mines", 1);
  await syncRank(user);
  await user.save();

  const materialLines = gained.map((entry) => `${getInventoryLabel(entry.id)} x${entry.quantity}`).join("\n");
  return interaction.reply(buildEmbedPayload({
    title: "Mining Run Complete",
    description: "You returned from the tunnels with fresh materials and a little spare aura.",
    visual: "economy-vault.svg",
    fields: [
      { name: "Materials", value: materialLines || "Nothing useful found." },
      { name: "Aura", value: `${formatNumber(auraReward)}`, inline: true },
      { name: "XP", value: `${formatNumber(xpReward)}`, inline: true },
      { name: "Next Mine", value: "12 minutes", inline: true },
      { name: "Premium", value: isPremiumActive(user) ? "Mining boost applied" : "No premium boost", inline: true },
    ],
  }));
}

async function handleRob(interaction) {
  const thief = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const target = interaction.options.getUser("user", true);
  const remaining = getCooldownRemaining(thief.lastRobAt, COOLDOWNS.robMs, thief);
  if (remaining > 0) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Rob Cooling Down", description: `You can attempt another robbery in ${humanizeMs(remaining)}.`, visual: "emblem-alert.svg" }), ephemeral: true });
  }
  if (target.bot || target.id === interaction.user.id) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Invalid Target", description: "Choose another human player to rob.", visual: "emblem-alert.svg" }), ephemeral: true });
  }

  const victim = await getOrCreatePlayer(interaction.guildId, target.id);
  if (victim.aura < 250) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Target Too Light", description: "That player is not carrying enough aura to be worth robbing.", visual: "emblem-alert.svg" }), ephemeral: true });
  }

  thief.lastRobAt = new Date();
  const successChance = clamp(0.42 + thief.prestige * 0.015 - victim.prestige * 0.01, 0.2, 0.7);
  const success = Math.random() < successChance;
  let description = "";

  if (success) {
    const stolen = Math.min(victim.aura, randInt(180, 700) + victim.rankIndex * 35);
    const xpReward = randInt(90, 170);
    victim.aura -= stolen;
    thief.aura += stolen;
    thief.xp += xpReward;
    thief.stats.robWins += 1;
    await applyQuestProgress(thief, "robWins", 1);
    await syncRank(thief);
    description = `You slipped past ${target.username} and stole **${formatNumber(stolen)} aura**.`;
  } else {
    const fine = Math.min(thief.aura, randInt(120, 360));
    const xpLoss = randInt(40, 90);
    thief.aura = Math.max(0, thief.aura - fine);
    thief.xp = Math.max(0, thief.xp - xpLoss);
    thief.stats.robLosses += 1;
    await syncRank(thief);
    description = `You got caught trying to rob ${target.username} and paid **${formatNumber(fine)} aura** in fines.`;
  }

  await thief.save();
  await victim.save();

  return interaction.reply(buildEmbedPayload({
    title: success ? "Robbery Success" : "Robbery Failed",
    description,
    visual: success ? "emblem-success.svg" : "emblem-alert.svg",
    fields: [
      { name: "Win Rate", value: `${thief.stats.robWins}W - ${thief.stats.robLosses}L`, inline: true },
      { name: "Next Attempt", value: "20 minutes", inline: true },
      { name: "Wallet", value: `${formatNumber(thief.aura)} aura`, inline: true },
    ],
  }));
}

async function handleCraft(interaction) {
  const recipeId = interaction.options.getString("recipe", true);
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const recipe = getRecipe(recipeId);
  if (!recipe) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Recipe Not Found", description: "That crafting recipe does not exist.", visual: "emblem-alert.svg" }), ephemeral: true });
  }

  const missing = Object.entries(recipe.materials).find(([materialId, amount]) => (user.inventory.find((entry) => entry.id === materialId)?.quantity || 0) < amount);
  if (missing) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Craft Failed", description: `You need more **${getInventoryLabel(missing[0])}** to craft **${recipe.name}**.`, visual: "emblem-alert.svg" }), ephemeral: true });
  }

  Object.entries(recipe.materials).forEach(([materialId, amount]) => {
    const entry = ensureInventoryEntry(user, materialId);
    entry.quantity = Math.max(0, entry.quantity - amount);
  });

  if (recipe.result.type === "item" || recipe.result.type === "gear") {
    const item = getItem(recipe.result.id);
    addInventoryItem(user, recipe.result.id, recipe.result.quantity);
    if (item?.type === "perk" && !user.ownedPerks.includes(recipe.result.id)) {
      user.ownedPerks.push(recipe.result.id);
    }
    if (item?.type === "skill_unlock" && item.grantsSkill && !user.skills.includes(item.grantsSkill)) {
      user.skills.push(item.grantsSkill);
    }
  } else if (recipe.result.type === "crate") {
    user.crates.set(recipe.result.id, (user.crates.get(recipe.result.id) || 0) + recipe.result.quantity);
  }

  user.stats.crafts += 1;
  await syncRank(user);
  await user.save();

  const costLines = Object.entries(recipe.materials).map(([materialId, amount]) => `${getInventoryLabel(materialId)} x${amount}`).join("\n");
  return interaction.reply(buildEmbedPayload({
    title: "Crafting Complete",
    description: `You crafted **${recipe.name}**.`,
    visual: "help-skills.svg",
    fields: [
      { name: "Materials Used", value: costLines },
      { name: "Result", value: `${getInventoryLabel(recipe.result.id)} x${recipe.result.quantity}`, inline: true },
      { name: "Craft Count", value: `${formatNumber(user.stats.crafts)}`, inline: true },
    ],
  }));
}

async function handleCraftingGuide(interaction) {
  return interaction.reply(buildCraftingGuidePayload());
}

async function handleAchievements(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const available = getAvailableAchievements(user);

  if (available.length) {
    let rewardAura = 0;
    let rewardXp = 0;
    available.forEach((achievement) => {
      rewardAura += achievement.rewardAura;
      rewardXp += achievement.rewardXp;
      user.claimedAchievements.push(achievement.id);
    });
    user.aura += rewardAura;
    user.xp += rewardXp;
    await syncRank(user);
    await user.save();

    const claimedLines = available.map((achievement) => `**${achievement.name}**\n${achievement.description}`).join("\n\n");
    return interaction.reply(buildEmbedPayload({
      title: "Achievements Claimed",
      description: claimedLines,
      visual: "help-summary.svg",
      fields: [
        { name: "Aura Earned", value: `${formatNumber(rewardAura)}`, inline: true },
        { name: "XP Earned", value: `${formatNumber(rewardXp)}`, inline: true },
        { name: "Claimed", value: `${available.length} achievement(s)`, inline: true },
      ],
    }));
  }

  const lines = ACHIEVEMENTS.map((achievement) => {
    const progress = achievement.metric(user);
    const status = user.claimedAchievements.includes(achievement.id) ? "Claimed" : progress >= achievement.goal ? "Ready to claim" : `${Math.min(progress, achievement.goal)} / ${achievement.goal}`;
    return `**${achievement.name}**\n${achievement.description}\n${status}\nReward: ${formatNumber(achievement.rewardAura)} aura, ${formatNumber(achievement.rewardXp)} XP`;
  }).join("\n\n");

  return interaction.reply(buildEmbedPayload({
    title: "Achievements",
    description: lines,
    visual: "help-summary.svg",
    footer: "This command auto-claims every unlocked achievement.",
  }));
}

async function handleEvent(interaction) {
  const event = getCurrentWorldEvent();
  return interaction.reply(buildEmbedPayload({
    title: `World Event: ${event.name}`,
    description: event.description,
    visual: "help-summary.svg",
    fields: [
      { name: "Ends In", value: humanizeMs(event.endsAt - Date.now()), inline: true },
      { name: "Rotation", value: `${event.durationHours} hour cycle`, inline: true },
    ],
  }));
}

async function handleGarden(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  ensureGardenPlotLimit(user);
  const effects = getCombinedEffects(user);

  if (subcommand === "status") {
    const lines = user.gardenPlots.map((plot, index) => {
      if (!plot.cropId) {
        return `Plot ${index + 1}: Empty`;
      }
      const crop = getGardenCrop(plot.cropId);
      const readyAt = plot.plantedAt.getTime() + crop.growMs;
      const ready = Date.now() >= readyAt;
      return `Plot ${index + 1}: ${crop.name} - ${ready ? "Ready to harvest" : `Ready in ${humanizeMs(readyAt - Date.now())}`}`;
    }).join("\n");
    return interaction.reply(buildEmbedPayload({
      title: "Garden Status",
      description: lines,
      visual: "help-core.svg",
      footer: `Use /garden plant or /garden harvest to manage plots. Premium plots: ${getPremiumGardenPlotLimit(user)} total.`,
    }));
  }

  if (subcommand === "plant") {
    const cropId = interaction.options.getString("crop", true);
    const crop = getGardenCrop(cropId);
    const plotNumber = interaction.options.getInteger("plot");
    let targetIndex = typeof plotNumber === "number" ? plotNumber - 1 : user.gardenPlots.findIndex((plot) => !plot.cropId);
    if (!crop) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Crop Missing", description: "That crop is not available.", visual: "emblem-alert.svg" }), ephemeral: true });
    }
    if (targetIndex < 0 || targetIndex >= getPremiumGardenPlotLimit(user)) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Plot Missing", description: `Choose a valid garden plot. Your current limit is ${getPremiumGardenPlotLimit(user)} plots.`, visual: "emblem-alert.svg" }), ephemeral: true });
    }
    if (user.gardenPlots[targetIndex].cropId) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Plot Occupied", description: "That plot already has a crop growing.", visual: "emblem-alert.svg" }), ephemeral: true });
    }

    user.gardenPlots[targetIndex] = { cropId, plantedAt: new Date() };
    await user.save();
    return interaction.reply(buildEmbedPayload({
      title: "Crop Planted",
      description: `You planted **${crop.name}** in plot ${targetIndex + 1}.`,
      visual: "help-core.svg",
      fields: [
        { name: "Harvest In", value: humanizeMs(crop.growMs), inline: true },
      ],
    }));
  }

  const harvested = [];
  user.gardenPlots.forEach((plot, index) => {
    if (!plot.cropId) {
      return;
    }
    const crop = getGardenCrop(plot.cropId);
    const readyAt = plot.plantedAt.getTime() + crop.growMs;
    if (Date.now() < readyAt) {
      return;
    }
    const gains = Object.entries(crop.yields).map(([materialId, range]) => {
      const quantity = Math.max(1, Math.floor(randInt(range[0], range[1]) * (1 + (effects.gardenYieldBoost || 0))));
      addInventoryItem(user, materialId, quantity);
      return `${getInventoryLabel(materialId)} x${quantity}`;
    });
    harvested.push(`Plot ${index + 1}: ${crop.name}\n${gains.join(", ")}`);
    user.gardenPlots[index] = { cropId: null, plantedAt: null };
    user.stats.harvests += 1;
  });

  if (!harvested.length) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Nothing Ready", description: "Your garden plots are still growing.", visual: "emblem-alert.svg" }), ephemeral: true });
  }

  await applyQuestProgress(user, "harvests", harvested.length);
  await user.save();
  return interaction.reply(buildEmbedPayload({
    title: "Garden Harvested",
    description: harvested.join("\n\n"),
    visual: "help-core.svg",
    fields: [
      { name: "Total Harvests", value: `${formatNumber(user.stats.harvests)}`, inline: true },
    ],
  }));
}

async function handleReminders(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  normalizeReminderState(user);

  if (subcommand === "status") {
    return interaction.reply(buildReminderStatusPayload(user));
  }

  const action = interaction.options.getString("action", true);
  if (!REMINDER_ACTIONS[action]) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Reminder Failed", description: "That reminder action is not supported.", visual: "emblem-alert.svg" }), ephemeral: true });
  }

  if (subcommand === "enable") {
    const reminderLimit = getReminderLimit(user);
    if (!user.reminders.enabledActions.includes(action)) {
      if (user.reminders.enabledActions.length >= reminderLimit) {
        return interaction.reply({
          ...buildEmbedPayload({
            title: "Reminder Limit Reached",
            description: `You can enable up to **${reminderLimit}** reminders right now. Disable another reminder first${isPremiumActive(user) ? "." : ", or upgrade premium for more reminder slots."}`,
            visual: "emblem-alert.svg",
            fields: [
              { name: "Current Reminders", value: user.reminders.enabledActions.length ? user.reminders.enabledActions.map((entry) => REMINDER_ACTIONS[entry].command).join(", ") : "None" },
            ],
          }),
          ephemeral: true,
        });
      }
      user.reminders.enabledActions.push(action);
    }
    user.reminders.guildId = interaction.guildId;
    user.reminders.channelId = interaction.channelId;
    user.reminders.lastNotifiedAt.delete(action);
    user.markModified("reminders");
    await user.save();

    return interaction.reply(buildEmbedPayload({
      title: "Reminder Enabled",
      description: `You will be tagged in <#${interaction.channelId}> when ${REMINDER_ACTIONS[action].command} is ready.`,
      visual: "emblem-success.svg",
      fields: [
        { name: "Action", value: REMINDER_ACTIONS[action].command, inline: true },
        { name: "Channel", value: `<#${interaction.channelId}>`, inline: true },
        { name: "Status", value: getReminderArmingNote(user, action) },
      ],
    }));
  }

  user.reminders.enabledActions = user.reminders.enabledActions.filter((entry) => entry !== action);
  user.reminders.lastNotifiedAt.delete(action);
  if (!user.reminders.enabledActions.length) {
    user.reminders.channelId = null;
    user.reminders.guildId = null;
  }
  user.markModified("reminders");
  await user.save();

  return interaction.reply(buildEmbedPayload({
    title: "Reminder Disabled",
    description: `You will no longer be tagged for ${REMINDER_ACTIONS[action].command}.`,
    visual: "emblem-success.svg",
    fields: [
      { name: "Still Enabled", value: user.reminders.enabledActions.length ? user.reminders.enabledActions.map((entry) => REMINDER_ACTIONS[entry].command).join(", ") : "None" },
    ],
  }));
}

function formatForgeStatus(user) {
  const lines = Object.keys(GEAR_ITEMS).map((gearId) => {
    const gear = getGearItem(gearId);
    const owned = getInventoryQuantity(user, gearId) > 0;
    return `${getInventoryLabel(gearId)}: ${owned ? `+${getGearUpgradeLevel(user, gearId)} | ${getGearDurability(user, gearId)}% durability` : "Not owned"}`;
  });
  return lines.join("\n");
}

async function handleForge(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  normalizeProgressionSystems(user);

  if (subcommand === "status") {
    return interaction.reply(buildEmbedPayload({
      title: "Aura Forge",
      description: "Upgrade crafted gear for stronger effects. Failed upgrades still consume aura and chip durability.",
      visual: "help-skills.svg",
      fields: [
        { name: "Gear", value: formatForgeStatus(user) },
        { name: "Rules", value: `Max upgrade: +${FORGE_MAX_LEVEL}\nBroken gear works at half power until repaired.` },
      ],
    }));
  }

  const gearId = interaction.options.getString("item", true);
  const gear = getGearItem(gearId);
  if (!gear || getInventoryQuantity(user, gearId) <= 0) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Forge Failed", description: "You need to own that crafted gear before forging it.", visual: "emblem-alert.svg" }), ephemeral: true });
  }

  if (subcommand === "repair") {
    const durability = getGearDurability(user, gearId);
    if (durability >= 100) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Repair Not Needed", description: `${getInventoryLabel(gearId)} is already at full durability.`, visual: "emblem-help.svg" }), ephemeral: true });
    }
    const cost = getForgeRepairCost(user, gearId);
    if (user.aura < cost) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Repair Failed", description: `Repairing ${getInventoryLabel(gearId)} costs ${formatNumber(cost)} aura.`, visual: "emblem-alert.svg" }), ephemeral: true });
    }
    user.aura -= cost;
    setGearDurability(user, gearId, 100);
    await user.save();
    return interaction.reply(buildEmbedPayload({
      title: "Gear Repaired",
      description: `${getInventoryLabel(gearId)} is back to full durability.`,
      visual: "emblem-success.svg",
      fields: [
        { name: "Cost", value: `${formatNumber(cost)} aura`, inline: true },
        { name: "Wallet", value: `${formatNumber(user.aura)} aura`, inline: true },
      ],
    }));
  }

  const level = getGearUpgradeLevel(user, gearId);
  if (level >= FORGE_MAX_LEVEL) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Forge Capped", description: `${getInventoryLabel(gearId)} is already at +${FORGE_MAX_LEVEL}.`, visual: "emblem-help.svg" }), ephemeral: true });
  }
  const cost = getForgeUpgradeCost(level);
  if (user.aura < cost) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Forge Failed", description: `Upgrading ${getInventoryLabel(gearId)} costs ${formatNumber(cost)} aura.`, visual: "emblem-alert.svg" }), ephemeral: true });
  }

  const failChance = 0.12 + level * 0.06;
  const success = Math.random() >= failChance;
  user.aura -= cost;
  if (success) {
    user.gearUpgrades.set(gearId, level + 1);
    setGearDurability(user, gearId, Math.max(30, getGearDurability(user, gearId) - 8));
  } else {
    setGearDurability(user, gearId, getGearDurability(user, gearId) - randInt(14, 24));
  }
  user.markModified("gearUpgrades");
  await user.save();

  return interaction.reply(buildEmbedPayload({
    title: success ? "Forge Upgrade Complete" : "Forge Failed",
    description: success
      ? `${getInventoryLabel(gearId)} reached **+${level + 1}**. Its effects are now stronger.`
      : `${getInventoryLabel(gearId)} resisted the forge. The aura was spent and durability dropped.`,
    visual: success ? "emblem-success.svg" : "emblem-alert.svg",
    fields: [
      { name: "Cost", value: `${formatNumber(cost)} aura`, inline: true },
      { name: "Durability", value: `${getGearDurability(user, gearId)}%`, inline: true },
      { name: "Wallet", value: `${formatNumber(user.aura)} aura`, inline: true },
    ],
  }));
}

function getProperty(type) {
  return PROPERTY_TYPES[type] || null;
}

function getPropertyUpgradeCost(config, level) {
  return Math.floor(config.upgradeBaseCost * level * (1 + (level - 1) * 0.35));
}

function calculatePropertyClaim(user, type) {
  const config = getProperty(type);
  const owned = user.properties.get(type);
  if (!config || !owned) {
    return null;
  }
  const level = owned.level || 1;
  const lastClaimAt = owned.lastClaimAt ? new Date(owned.lastClaimAt).getTime() : Date.now();
  const elapsedHours = Math.min(24, Math.max(0, (Date.now() - lastClaimAt) / (60 * 60 * 1000)));
  const aura = Math.floor((config.hourlyAura || 0) * level * elapsedHours);
  const xp = Math.floor((config.hourlyXp || 0) * level * elapsedHours);
  return { config, owned, level, elapsedHours, aura, xp };
}

async function handleProperty(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  normalizeProgressionSystems(user);

  if (subcommand === "list") {
    const lines = Object.values(PROPERTY_TYPES).map((property) => {
      const owned = user.properties.get(property.id);
      return `**${getPropertyLabel(property)}**\n${property.description}\n${owned ? `Owned level ${owned.level || 1}` : `Buy: ${formatNumber(property.cost)} aura`}`;
    }).join("\n\n");
    return interaction.reply(buildEmbedPayload({
      title: "Aura Properties",
      description: lines,
      visual: "economy-vault.svg",
      footer: "Use /property buy, /property upgrade, and /property claim.",
    }));
  }

  const type = interaction.options.getString("type", true);
  const config = getProperty(type);
  if (!config) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Property Missing", description: "That property is not available.", visual: "emblem-alert.svg" }), ephemeral: true });
  }

  if (subcommand === "buy") {
    if (user.properties.has(type)) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Already Owned", description: `You already own ${getPropertyLabel(config)}.`, visual: "emblem-help.svg" }), ephemeral: true });
    }
    if (user.aura < config.cost) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Property Locked", description: `${getPropertyLabel(config)} costs ${formatNumber(config.cost)} aura.`, visual: "emblem-alert.svg" }), ephemeral: true });
    }
    user.aura -= config.cost;
    user.properties.set(type, { level: 1, lastClaimAt: new Date() });
    user.markModified("properties");
    await user.save();
    return interaction.reply(buildEmbedPayload({
      title: "Property Purchased",
      description: `You bought **${getPropertyLabel(config)}**. It will start producing passive rewards now.`,
      visual: "emblem-success.svg",
      fields: [
        { name: "Cost", value: `${formatNumber(config.cost)} aura`, inline: true },
        { name: "Wallet", value: `${formatNumber(user.aura)} aura`, inline: true },
      ],
    }));
  }

  if (!user.properties.has(type)) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Property Not Owned", description: `Buy ${getPropertyLabel(config)} before using this action.`, visual: "emblem-alert.svg" }), ephemeral: true });
  }

  if (subcommand === "upgrade") {
    const owned = user.properties.get(type);
    const level = owned.level || 1;
    if (level >= config.maxLevel) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Property Maxed", description: `${getPropertyLabel(config)} is already level ${config.maxLevel}.`, visual: "emblem-help.svg" }), ephemeral: true });
    }
    const cost = getPropertyUpgradeCost(config, level);
    if (user.aura < cost) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Upgrade Locked", description: `Upgrading ${getPropertyLabel(config)} costs ${formatNumber(cost)} aura.`, visual: "emblem-alert.svg" }), ephemeral: true });
    }
    user.aura -= cost;
    owned.level = level + 1;
    user.properties.set(type, owned);
    user.markModified("properties");
    await user.save();
    return interaction.reply(buildEmbedPayload({
      title: "Property Upgraded",
      description: `${getPropertyLabel(config)} is now level **${owned.level}**.`,
      visual: "emblem-success.svg",
      fields: [
        { name: "Cost", value: `${formatNumber(cost)} aura`, inline: true },
        { name: "Wallet", value: `${formatNumber(user.aura)} aura`, inline: true },
      ],
    }));
  }

  const claim = calculatePropertyClaim(user, type);
  if (!claim || claim.elapsedHours < 0.05) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Nothing To Claim", description: `${getPropertyLabel(config)} needs more time to produce rewards.`, visual: "emblem-help.svg" }), ephemeral: true });
  }
  user.aura += claim.aura;
  user.xp += claim.xp;
  const materialDrops = [];
  if (config.materialChance) {
    const rolls = Math.floor(claim.elapsedHours);
    const materialIds = Object.keys(MATERIALS);
    for (let index = 0; index < rolls; index += 1) {
      if (Math.random() < config.materialChance) {
        const materialId = materialIds[randInt(0, materialIds.length - 1)];
        addInventoryItem(user, materialId, 1);
        materialDrops.push(`${getInventoryLabel(materialId)} x1`);
      }
    }
  }
  claim.owned.lastClaimAt = new Date();
  user.properties.set(type, claim.owned);
  user.markModified("properties");
  await syncRank(user);
  await user.save();
  return interaction.reply(buildEmbedPayload({
    title: "Property Income Claimed",
    description: `${getPropertyLabel(config)} paid out after ${claim.elapsedHours.toFixed(1)} hours.`,
    visual: "economy-vault.svg",
    fields: [
      { name: "Aura", value: `${formatNumber(claim.aura)}`, inline: true },
      { name: "XP", value: `${formatNumber(claim.xp)}`, inline: true },
      { name: "Materials", value: materialDrops.length ? materialDrops.join(", ") : "None", inline: true },
    ],
  }));
}

function isOnActiveExpedition(user) {
  return Boolean(user?.expedition?.type && user.expedition.endsAt && new Date(user.expedition.endsAt).getTime() > Date.now());
}

async function handleExpedition(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  normalizeProgressionSystems(user);

  if (subcommand === "status") {
    if (!user.expedition?.type) {
      return interaction.reply(buildEmbedPayload({ title: "Expedition Status", description: "No expedition is active. Start one with /expedition start.", visual: "help-summary.svg" }));
    }
    const config = EXPEDITION_TYPES[user.expedition.type];
    const remaining = new Date(user.expedition.endsAt).getTime() - Date.now();
    return interaction.reply(buildEmbedPayload({
      title: "Expedition Status",
      description: remaining <= 0 ? `${getExpeditionLabel(config)} is ready to claim.` : `${getExpeditionLabel(config)} returns in ${humanizeMs(remaining)}.`,
      visual: "help-summary.svg",
    }));
  }

  if (subcommand === "start") {
    if (isOnActiveExpedition(user)) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Expedition Active", description: "Claim or wait for your current expedition before starting another.", visual: "emblem-alert.svg" }), ephemeral: true });
    }
    const type = interaction.options.getString("type", true);
    const config = EXPEDITION_TYPES[type];
    if (!config) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Expedition Missing", description: "That expedition is not available.", visual: "emblem-alert.svg" }), ephemeral: true });
    }
    const startedAt = new Date();
    user.expedition = { type, startedAt, endsAt: new Date(startedAt.getTime() + config.hours * 60 * 60 * 1000) };
    await user.save();
    return interaction.reply(buildEmbedPayload({
      title: "Expedition Started",
      description: `${interaction.user.username} departed on **${getExpeditionLabel(config)}**.\n${config.description}`,
      visual: "help-summary.svg",
      fields: [
        { name: "Returns In", value: `${config.hours}h`, inline: true },
        { name: "Restriction", value: "Boss and PvP are locked while away.", inline: true },
      ],
    }));
  }

  if (!user.expedition?.type) {
    return interaction.reply({ ...buildEmbedPayload({ title: "No Expedition", description: "Start an expedition first.", visual: "emblem-alert.svg" }), ephemeral: true });
  }
  const config = EXPEDITION_TYPES[user.expedition.type];
  const remaining = new Date(user.expedition.endsAt).getTime() - Date.now();
  if (remaining > 0) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Expedition Not Back", description: `${getExpeditionLabel(config)} returns in ${humanizeMs(remaining)}.`, visual: "emblem-alert.svg" }), ephemeral: true });
  }

  const auraReward = randInt(config.aura[0], config.aura[1]);
  const xpReward = randInt(config.xp[0], config.xp[1]);
  const materialIds = Object.keys(MATERIALS);
  const materialDrops = [];
  for (let index = 0; index < config.materialRolls; index += 1) {
    const materialId = materialIds[randInt(0, materialIds.length - 1)];
    const quantity = randInt(1, 2);
    addInventoryItem(user, materialId, quantity);
    materialDrops.push(`${getInventoryLabel(materialId)} x${quantity}`);
  }
  const crateDrops = [];
  if (config.crateChance && Math.random() < config.crateChance) {
    const crateId = config.rareChance && Math.random() < config.rareChance ? "rare" : "common";
    user.crates.set(crateId, (user.crates.get(crateId) || 0) + 1);
    crateDrops.push(getCrateLabel(crateId));
  }
  user.aura += auraReward;
  user.xp += xpReward;
  user.expedition = { type: null, startedAt: null, endsAt: null };
  await syncRank(user);
  await user.save();
  return interaction.reply(buildEmbedPayload({
    title: "Expedition Complete",
    description: `${getExpeditionLabel(config)} returned with a travel log full of loot.`,
    visual: "emblem-success.svg",
    fields: [
      { name: "Aura", value: `${formatNumber(auraReward)}`, inline: true },
      { name: "XP", value: `${formatNumber(xpReward)}`, inline: true },
      { name: "Crates", value: crateDrops.join(", ") || "None", inline: true },
      { name: "Materials", value: materialDrops.join("\n") },
    ],
  }));
}

async function handleGear(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);

  if (subcommand === "loadout") {
    const lines = Object.entries(user.equippedGear || {}).map(([slot, gearId]) => {
      if (!gearId) {
        return `${slot}: Empty`;
      }
      return `${slot}: ${getInventoryLabel(gearId)} +${getGearUpgradeLevel(user, gearId)} (${getGearDurability(user, gearId)}% durability)`;
    }).join("\n");
    return interaction.reply(buildEmbedPayload({
      title: "Gear Loadout",
      description: lines,
      visual: "help-skills.svg",
      footer: "Use /forge to upgrade or repair gear.",
    }));
  }

  const gearId = interaction.options.getString("item", true);
  const gear = getGearItem(gearId);
  if (!gear) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Gear Missing", description: "That gear item does not exist.", visual: "emblem-alert.svg" }), ephemeral: true });
  }
  const ownedQuantity = user.inventory.find((entry) => entry.id === gearId)?.quantity || 0;
  if (ownedQuantity <= 0) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Gear Not Owned", description: `You do not own **${getInventoryLabel(gearId)}** yet. Craft it first.`, visual: "emblem-alert.svg" }), ephemeral: true });
  }

  user.equippedGear[gear.slot] = gearId;
  await user.save();
  return interaction.reply(buildEmbedPayload({
    title: "Gear Equipped",
    description: `You equipped **${getInventoryLabel(gearId)}** in the **${gear.slot}** slot.`,
    visual: "help-skills.svg",
    fields: [
      { name: "Effect", value: gear.description },
    ],
  }));
}

async function handleSpin(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const remaining = getCooldownRemaining(user.lastSpinAt, COOLDOWNS.spinMs, user);
  if (remaining > 0) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Spin Cooling Down", description: `Your aura spinner will recharge in ${humanizeMs(remaining)}.`, visual: "core-arcade.svg" }), ephemeral: true });
  }

  const effects = getCombinedEffects(user);
  const baseReward = randInt(180, 540);
  const jackpot = Math.random() < 0.07 ? randInt(500, 1400) : 0;
  const reward = Math.floor((baseReward + jackpot) * (1 + (effects.spinRewardBoost || 0)));
  const xpGain = randInt(60, 120);
  user.lastSpinAt = new Date();
  user.aura += reward;
  user.xp += xpGain;
  user.stats.spins += 1;
  await applyQuestProgress(user, "spins", 1);
  await syncRank(user);
  await user.save();

  return interaction.reply(buildEmbedPayload({
    title: "Spin Complete",
    description: `The wheel landed clean. You gained **${formatNumber(reward)} aura** and **${formatNumber(xpGain)} XP**.`,
    visual: "core-arcade.svg",
    fields: [
      { name: "Jackpot", value: jackpot > 0 ? `Triggered for ${formatNumber(jackpot)} aura` : "Not this time", inline: true },
      { name: "Next Spin", value: humanizeMs(getEffectiveCooldownMs(user, COOLDOWNS.spinMs)), inline: true },
      { name: "Wallet", value: `${formatNumber(user.aura)} aura`, inline: true },
      { name: "Premium", value: isPremiumActive(user) ? "Spin boost applied" : "No premium boost", inline: true },
    ],
  }));
}

async function handleCoinflip(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const amount = interaction.options.getInteger("amount", true);
  const choice = interaction.options.getString("choice", true);
  const remaining = getCooldownRemaining(user.lastCoinflipAt, COOLDOWNS.coinflipMs, user);
  if (remaining > 0) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Coinflip Cooling Down", description: `You can flip again in ${humanizeMs(remaining)}.`, visual: "emblem-core-arcade.svg" }), ephemeral: true });
  }
  if (amount <= 0 || amount > user.aura) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Invalid Bet", description: "Your bet must be above 0 and within your aura wallet.", visual: "emblem-alert.svg" }), ephemeral: true });
  }

  const effects = getPerkEffects(user);
  const result = Math.random() < 0.5 ? "heads" : "tails";
  const choiceWins = choice === result || (choice !== result && Math.random() < (effects.coinflipWinBoost || 0));
  const multipliers = [{ value: 2, chance: 0.65 }, { value: 3, chance: 0.2 }, { value: 4, chance: 0.1 }, { value: 10, chance: 0.05 }];
  let multiplier = 1;
  if (choiceWins) {
    const roll = Math.random();
    let cumulative = 0;
    for (const entry of multipliers) {
      cumulative += entry.chance;
      if (roll <= cumulative) {
        multiplier = entry.value;
        break;
      }
    }
  }

  user.lastCoinflipAt = new Date();
  user.aura -= amount;
  user.stats.coinflips += 1;

  let xpDelta = randInt(35, 90);
  let description = `The coin landed on **${result}**. `;
  if (choiceWins) {
    const payout = amount * multiplier;
    user.aura += payout;
    description += `You called it. Your **${formatNumber(amount)} aura** turned into **${formatNumber(payout)} aura**.`;
  } else {
    xpDelta = -Math.floor(xpDelta / 2);
    description += `You missed the call and lost **${formatNumber(amount)} aura**.`;
  }

  user.xp = Math.max(0, user.xp + xpDelta);
  await applyQuestProgress(user, "coinflips", 1);
  await syncRank(user);
  await user.save();

  return interaction.reply(buildEmbedPayload({
    title: "Coinflip Resolved",
    description,
    visual: "emblem-core-arcade.svg",
    fields: [
      { name: "Choice", value: choice, inline: true },
      { name: "Multiplier", value: choiceWins ? `${multiplier}x` : "0x", inline: true },
      { name: "XP Delta", value: `${xpDelta >= 0 ? "+" : ""}${formatNumber(xpDelta)}`, inline: true },
    ],
    footer: `Coinflip cooldown: ${humanizeMs(getEffectiveCooldownMs(user, COOLDOWNS.coinflipMs))}`,
  }));
}

async function handleDaily(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const remaining = getCooldownRemaining(user.lastDailyAt, COOLDOWNS.dailyMs, user);
  if (remaining > 0) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Daily Already Claimed", description: `Your next daily reward unlocks in ${humanizeMs(remaining)}.`, visual: "emblem-help.svg" }), ephemeral: true });
  }

  const last = user.lastDailyAt?.getTime() || 0;
  const streakContinues = Date.now() - last <= COOLDOWNS.dailyMs * 2;
  user.streak = streakContinues ? user.streak + 1 : 1;
  user.lastDailyAt = new Date();
  const premiumRareCrates = getPremiumDailyRareCrates(user);
  const premiumMultiplier = getPremiumDailyMultiplier(user);
  const auraReward = Math.floor((700 + user.streak * 90 + user.prestige * 140) * premiumMultiplier);
  const xpReward = Math.floor((180 + user.streak * 40) * premiumMultiplier);
  user.aura += auraReward;
  user.xp += xpReward;
  user.crates.set("common", (user.crates.get("common") || 0) + 1);
  if (user.streak % 7 === 0) {
    user.crates.set("rare", (user.crates.get("rare") || 0) + 1);
  }
  if (premiumRareCrates > 0) {
    user.crates.set("rare", (user.crates.get("rare") || 0) + premiumRareCrates);
  }

  user.quests = [];
  setQuestSet(user);
  await syncRank(user);
  await user.save();

  return interaction.reply(buildEmbedPayload({
    title: "Daily Reward Claimed",
    description: `Your streak is now **${user.streak}**.`,
    visual: "emblem-success.svg",
    fields: [
      { name: "Aura", value: `${formatNumber(auraReward)}`, inline: true },
      { name: "XP", value: `${formatNumber(xpReward)}`, inline: true },
      { name: "Bonus", value: premiumRareCrates > 0 ? `Premium bonus ${getCrateLabel("rare")} x${premiumRareCrates} + ${user.streak % 7 === 0 ? `streak ${getCrateLabel("rare")}` : getCrateLabel("common")}` : user.streak % 7 === 0 ? `${getCrateLabel("rare")} earned` : `${getCrateLabel("common")} earned`, inline: true },
    ],
  }));
}

async function handlePremiumChest(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const plan = getUserPremiumPlan(user);
  if (!plan) {
    return interaction.reply({
      ...buildEmbedPayload({
        title: "Premium Chest Locked",
        description: `Premium Chest is for active members. Get premium here: ${PREMIUM_PURCHASE_URL}`,
        visual: "emblem-alert.svg",
      }),
      ephemeral: true,
    });
  }

  const remaining = getCooldownRemaining(user.premium.lastChestAt, getPremiumChestCooldownMs(user));
  if (remaining > 0) {
    return interaction.reply({
      ...buildEmbedPayload({
        title: "Premium Chest Recharging",
        description: `Your next Premium Chest opens in ${humanizeMs(remaining)}.`,
        visual: "emblem-alert.svg",
      }),
      ephemeral: true,
    });
  }

  const chest = plan.chest;
  const auraReward = randInt(chest.aura[0], chest.aura[1]);
  const xpReward = randInt(chest.xp[0], chest.xp[1]);
  const materialIds = Object.keys(MATERIALS);
  const materialDrops = [];
  for (let index = 0; index < chest.materials; index += 1) {
    const materialId = materialIds[randInt(0, materialIds.length - 1)];
    const quantity = randInt(1, plan.id === "monthly" ? 2 : 3);
    addInventoryItem(user, materialId, quantity);
    materialDrops.push(`${getInventoryLabel(materialId)} x${quantity}`);
  }

  user.aura += auraReward;
  user.xp += xpReward;
  user.crates.set("rare", (user.crates.get("rare") || 0) + chest.rareCrates);
  const epicDropped = Math.random() < chest.epicChance;
  if (epicDropped) {
    user.crates.set("epic", (user.crates.get("epic") || 0) + 1);
  }
  const legendaryDropped = Math.random() < (chest.legendaryChance || 0);
  if (legendaryDropped) {
    user.crates.set("legendary", (user.crates.get("legendary") || 0) + 1);
  }
  user.premium.lastChestAt = new Date();
  await syncRank(user);
  await user.save();

  return interaction.reply(buildEmbedPayload({
    title: "Premium Chest Opened",
    description: "Your membership chest cracked open with high-value progression loot.",
    visual: "emblem-success.svg",
    fields: [
      { name: "Aura", value: `${formatNumber(auraReward)}`, inline: true },
      { name: "XP", value: `${formatNumber(xpReward)}`, inline: true },
      { name: "Crates", value: `${getCrateLabel("rare")} x${chest.rareCrates}${epicDropped ? ` + ${getCrateLabel("epic")} x1` : ""}${legendaryDropped ? ` + ${getCrateLabel("legendary")} x1` : ""}`, inline: true },
      { name: "Materials", value: materialDrops.join("\n") || "None" },
      { name: "Next Chest", value: humanizeMs(getPremiumChestCooldownMs(user)), inline: true },
    ],
  }));
}

async function handleVault(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const combinedEffects = getCombinedEffects(user);
  const vaultPerkBonus = combinedEffects.vaultInterestBoost || 0;
  const vaultRate = 0.03 + vaultPerkBonus + user.prestige * 0.005;
  const bonusLines = [
    `Base: 3.0%/hr`,
    `Bonus Sources: ${formatEffectValue(vaultPerkBonus)}/hr (cap ${formatEffectCapValue("vaultInterestBoost", getEffectCapsForUser(user))}/hr)`,
    `Prestige: +${(user.prestige * 0.5).toFixed(1)}%/hr`,
  ];
  const interest = await claimVaultInterest(user);

  if (subcommand === "deposit") {
    const amount = interaction.options.getInteger("amount", true);
    if (amount <= 0 || amount > user.aura) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Vault Deposit Failed", description: "Deposit an amount inside your wallet balance.", visual: "economy-vault.svg" }), ephemeral: true });
    }
    user.aura -= amount;
    user.vaultAura += amount;
    user.stats.vaultDeposit += amount;
    await applyQuestProgress(user, "vaultDeposit", amount);
  }

  if (subcommand === "withdraw") {
    const amount = interaction.options.getInteger("amount", true);
    if (amount <= 0 || amount > user.vaultAura) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Vault Withdrawal Failed", description: "Withdraw an amount inside your vault balance.", visual: "economy-vault.svg" }), ephemeral: true });
    }
    user.vaultAura -= amount;
    user.aura += amount;
  }

  await user.save();

  return interaction.reply(buildEmbedPayload({
    title: "Vault Updated",
    description: `${interest > 0 ? `Interest added before processing: **${formatNumber(interest)} aura**.\n` : ""}Your vault is secure and compounding.`,
    visual: "economy-vault.svg",
    fields: [
      { name: "Wallet", value: `${formatNumber(user.aura)} aura`, inline: true },
      { name: "Vault", value: `${formatNumber(user.vaultAura)} aura`, inline: true },
      { name: "Current Interest", value: `${(vaultRate * 100).toFixed(1)}% per hour`, inline: true },
      { name: "Rate Breakdown", value: bonusLines.join("\n") },
    ],
  }));
}

async function handleShop(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const lines = getDisplayShopItems(user).map((item) => {
    const badges = [item.type];
    if (isPremiumOnlyItem(item)) {
      badges.push("premium");
    }
    if (item.premiumLocked) {
      badges.push("locked");
    }
    return `**${getInventoryLabel(item.id)}** - ${formatNumber(item.price)} aura\n\`${item.id}\` • ${badges.join(" • ")}\n${item.description}`;
  }).join("\n\n");
  return interaction.reply(buildEmbedPayload({
    title: "Aura Shop",
    description: lines || "No shop items available.",
    visual: "emblem-economy.svg",
    fields: [
      { name: "Membership", value: formatPremiumStatus(user), inline: true },
    ],
    footer: "Use /buy item:<id> to purchase. Premium items unlock while premium is active.",
  }));
}

async function handleBuy(interaction) {
  const itemId = interaction.options.getString("item", true);
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const item = getItem(itemId);
  if (!item) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Item Not Found", description: "That shop item id does not exist.", visual: "emblem-alert.svg" }), ephemeral: true });
  }
  if (isPremiumOnlyItem(item) && !isPremiumActive(user)) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Premium Required", description: "That item is reserved for premium members. Use `/premium` to view available plans.", visual: "emblem-alert.svg" }), ephemeral: true });
  }
  if (item.type === "cosmetic" && userOwnsCosmeticItem(user, item)) {
    grantCosmetic(user, item);
    await user.save();
    return interaction.reply({ ...buildEmbedPayload({ title: "Cosmetic Equipped", description: `You already own **${getInventoryLabel(item.id)}**, so it has been equipped on your profile.`, visual: "emblem-success.svg" }), ephemeral: true });
  }
  if (user.aura < item.price) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Not Enough Aura", description: "You do not have enough aura for that purchase.", visual: "emblem-economy.svg" }), ephemeral: true });
  }

  user.aura -= item.price;
  user.stats.shopBuys += 1;
  if (item.type === "perk") {
    if (!user.ownedPerks.includes(item.id)) {
      user.ownedPerks.push(item.id);
      addInventoryItem(user, item.id);
    }
  } else if (item.type === "skill_unlock") {
    if (!user.skills.includes(item.grantsSkill)) {
      user.skills.push(item.grantsSkill);
    }
    addInventoryItem(user, item.id);
  } else if (item.type === "combat") {
    addInventoryItem(user, item.id);
  } else if (item.type === "crate") {
    if (item.grantsCrates) {
      Object.entries(item.grantsCrates).forEach(([crateId, quantity]) => {
        user.crates.set(crateId, (user.crates.get(crateId) || 0) + quantity);
      });
    } else if (item.grantsCrate) {
      user.crates.set(item.grantsCrate, (user.crates.get(item.grantsCrate) || 0) + 1);
    }
  } else if (item.type === "cosmetic") {
    grantCosmetic(user, item);
    addInventoryItem(user, item.id);
  }

  await applyQuestProgress(user, "shopBuys", 1);
  await user.save();

  return interaction.reply(buildEmbedPayload({
    title: "Purchase Complete",
    description: `You bought **${getInventoryLabel(item.id)}**.`,
    visual: "emblem-success.svg",
    fields: [
      { name: "Cost", value: `${formatNumber(item.price)} aura`, inline: true },
      { name: "Wallet", value: `${formatNumber(user.aura)} aura`, inline: true },
      { name: "Type", value: item.type, inline: true },
    ],
  }));
}

async function handleInventory(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  normalizeCosmetics(user);
  const perkLines = user.inventory.filter((item) => item.quantity > 0).length ? user.inventory.filter((item) => item.quantity > 0).map((item) => `- ${getInventoryLabel(item.id)} x${item.quantity}`).join("\n") : "No owned items yet.";
  const crateEntries = Array.from(user.crates.entries()).filter(([, count]) => count > 0);
  const crateLines = crateEntries.length ? crateEntries.map(([crateId, count]) => `- ${getCrateLabel(crateId)} x${count}`).join("\n") : "No crates stored.";
  return interaction.reply(buildEmbedPayload({
    title: "Inventory",
    description: "Your owned perks, materials, unlocks, and unopened crates.",
    visual: "help-skills.svg",
    fields: [
      { name: "Items", value: perkLines },
      { name: "Skills", value: user.skills.map((skillId) => `- ${getSkillLabel(skillId)}`).join("\n") || "No skills." },
      { name: "Crates", value: crateLines },
      { name: "Membership", value: formatPremiumStatus(user) },
      { name: "Active Cosmetics", value: formatProfileCosmetics(user) },
      { name: "Effect Caps", value: buildEffectCapLines(user) },
    ],
  }));
}

async function handleRank(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const current = RANKS[user.rankIndex];
  const next = nextRank(user.rankIndex);
  const currentXp = user.xp - current.xpRequired;
  const totalXp = Math.max(1, next.xpRequired - current.xpRequired);
  return interaction.reply(buildEmbedPayload({
    title: "Rank Progress",
    description: "Rank is based on XP, separate from aura. Losing combat can rank you down if XP falls below the threshold.",
    visual: "core-profile.svg",
    fields: [
      { name: "Current Rank", value: getRankLabel(current), inline: true },
      { name: "Next Rank", value: getRankLabel(next), inline: true },
      { name: "Prestige", value: `${user.prestige}`, inline: true },
      { name: "Progress", value: `${progressBar(currentXp, totalXp)}\n${formatNumber(currentXp)} / ${formatNumber(totalXp)} XP` },
    ],
  }));
}

async function handlePrestige(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const atCap = user.rankIndex === RANKS.length - 1;
  const auraCost = 18000 + user.prestige * 5000;
  if (!atCap || user.aura < auraCost) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Prestige Locked", description: `Reach **${getRankLabel(RANKS[RANKS.length - 1])}** and hold **${formatNumber(auraCost)} aura** to prestige.`, visual: "emblem-help.svg" }), ephemeral: true });
  }

  user.aura -= auraCost;
  user.prestige += 1;
  user.xp = 0;
  user.rankIndex = 0;
  user.skills = Array.from(new Set(["focus", ...user.skills]));
  user.crates.set("epic", (user.crates.get("epic") || 0) + 1);
  await user.save();

  return interaction.reply(buildEmbedPayload({
    title: "Prestige Complete",
    description: `You reset your rank ladder and advanced to prestige **${user.prestige}**.`,
    visual: "emblem-success.svg",
    fields: [
      { name: "Aura Cost", value: `${formatNumber(auraCost)}`, inline: true },
      { name: "Reward", value: "1 epic crate + higher future daily and vault scaling", inline: true },
    ],
  }));
}

async function handleQuests(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  setQuestSet(user);
  await user.save();
  const lines = user.quests.map((quest) => `**${quest.name}**\n${quest.description}\n${progressBar(quest.progress, quest.goal, 10)}\nReward: ${formatNumber(quest.rewardAura)} aura, ${formatNumber(quest.rewardXp)} XP`).join("\n\n");
  return interaction.reply(buildEmbedPayload({ title: "Daily Quests", description: lines, visual: "help-summary.svg", footer: "Completed quests auto-pay rewards." }));
}

async function handleCrate(interaction) {
  const type = interaction.options.getString("type", true);
  const requestedAmount = interaction.options.getInteger("amount") || 1;
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const crate = CRATES[type];
  if (!crate) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Unknown Crate", description: "That crate type is not available.", visual: "emblem-alert.svg" }), ephemeral: true });
  }
  if (requestedAmount <= 0) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Invalid Amount", description: "Choose at least 1 crate to open.", visual: "emblem-alert.svg" }), ephemeral: true });
  }

  const ownedCrates = user.crates.get(type) || 0;
  if (ownedCrates <= 0) {
    return interaction.reply({ ...buildEmbedPayload({ title: "No Crates Available", description: `You do not own ${getCrateLabel(type)}.`, visual: "emblem-alert.svg" }), ephemeral: true });
  }
  if (requestedAmount > ownedCrates) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Not Enough Crates", description: `You only have ${formatNumber(ownedCrates)} ${getCrateLabel(type)}${ownedCrates === 1 ? "" : "s"}.`, visual: "emblem-alert.svg" }), ephemeral: true });
  }

  user.crates.set(type, ownedCrates - requestedAmount);
  const effects = getCombinedEffects(user);
  let auraReward = 0;
  let xpReward = 0;
  const bonusCounts = new Map();

  for (let crateIndex = 0; crateIndex < requestedAmount; crateIndex += 1) {
    auraReward += Math.floor(randInt(crate.aura[0], crate.aura[1]) * (1 + (effects.crateAuraBoost || 0)));
    xpReward += randInt(crate.xp[0], crate.xp[1]);

    crate.drops.forEach((drop) => {
      if (Math.random() <= drop.chance) {
        if (drop.type === "item") {
          addInventoryItem(user, drop.id);
          const item = getItem(drop.id);
          if (item?.type === "perk" && !user.ownedPerks.includes(drop.id)) {
            user.ownedPerks.push(drop.id);
          }
          if (item?.type === "skill_unlock" && item.grantsSkill && !user.skills.includes(item.grantsSkill)) {
            user.skills.push(item.grantsSkill);
          }
          bonusCounts.set(item?.name || drop.id, (bonusCounts.get(item?.name || drop.id) || 0) + 1);
        } else if (drop.type === "crate") {
          user.crates.set(drop.id, (user.crates.get(drop.id) || 0) + 1);
          const crateLabel = getCrateLabel(drop.id);
          bonusCounts.set(crateLabel, (bonusCounts.get(crateLabel) || 0) + 1);
        }
      }
    });
  }

  user.aura += auraReward;
  user.xp += xpReward;

  await syncRank(user);
  await user.save();

  const bonusLines = [...bonusCounts.entries()].map(([label, count]) => `${label} x${count}`);

  return interaction.reply(buildEmbedPayload({
    title: `${formatNumber(requestedAmount)} ${getCrateLabel(type)}${requestedAmount === 1 ? "" : "s"} Opened`,
    description: requestedAmount === 1 ? "The crate burst open with progression loot." : "The crates burst open with progression loot.",
    visual: "emblem-success.svg",
    fields: [
      { name: "Aura", value: `${formatNumber(auraReward)}`, inline: true },
      { name: "XP", value: `${formatNumber(xpReward)}`, inline: true },
      { name: "Bonus Drops", value: bonusLines.length ? bonusLines.join(", ") : "None", inline: true },
      { name: "Premium", value: isPremiumActive(user) ? "Crate boost applied" : "No premium boost", inline: true },
    ],
  }));
}

function getBattleSkillRotation(user) {
  const ownedSkills = Array.from(new Set((user.skills || []).filter((skillId) => SKILLS[skillId])));
  const unlocked = ownedSkills.filter((skillId) => skillId !== "focus");
  return unlocked.length ? [...unlocked, "focus"] : ["focus"];
}

function hydrateBattleSkill(fighter) {
  const fallbackCycle = fighter.skill?.id ? [fighter.skill.id] : ["focus"];
  fighter.skillCycle = fighter.skillCycle?.length ? fighter.skillCycle.filter((skillId) => SKILLS[skillId]) : fallbackCycle;
  fighter.skillIndex = clamp(fighter.skillIndex || 0, 0, Math.max(0, fighter.skillCycle.length - 1));
  const skillId = fighter.skillCycle[fighter.skillIndex] || "focus";
  fighter.skill = { id: skillId, ...SKILLS[skillId] };
}

function rotateBattleSkill(fighter) {
  if (!fighter.skillCycle?.length || fighter.skillCycle.length === 1) {
    hydrateBattleSkill(fighter);
    return;
  }
  fighter.skillIndex = (fighter.skillIndex + 1) % fighter.skillCycle.length;
  hydrateBattleSkill(fighter);
}

function createBattleFighter({ id, name, hp, maxHp, skillCycle, critBoost = 0, loadout = {}, gearOwner = null, combatItems = {}, unlockedActions = ["strike"], premiumBattleBonus = {} }) {
  const gearBonuses = getLoadoutBattleBonuses(loadout, gearOwner);
  const totalMaxHp = maxHp + (gearBonuses.maxHpBonus || 0) + (premiumBattleBonus.maxHpBonus || 0);
  const fighter = {
    id,
    name,
    hp: totalMaxHp,
    maxHp: totalMaxHp,
    skillCycle: skillCycle?.length ? skillCycle : ["focus"],
    skillIndex: 0,
    skill: null,
    critBoost,
    passiveCritBoost: (gearBonuses.critChanceBonus || 0) + (premiumBattleBonus.critChanceBonus || 0),
    loadout: cloneLoadout(loadout),
    gearBonuses,
    combatItems: { ...combatItems },
    unlockedActions: unlockedActions.length ? [...unlockedActions] : ["strike"],
    actionCooldowns: {},
    turnsTaken: 0,
    combo: 0,
    guard: false,
    counterStance: false,
    evasiveTurns: 0,
    weakenedTurns: 0,
    chargeStacks: 0,
    exposedTurns: 0,
    bleedTurns: 0,
    bleedDamage: 0,
  };
  if (fighter.skillCycle.length > 1) {
    fighter.skillIndex = randInt(0, fighter.skillCycle.length - 1);
  }
  hydrateBattleSkill(fighter);
  return fighter;
}

function getBattleStatuses(fighter) {
  const statuses = [];
  if (fighter.combo > 0) {
    statuses.push(`Combo ${fighter.combo}`);
  }
  if (fighter.guard) {
    statuses.push("Guarded");
  }
  if (fighter.counterStance) {
    statuses.push("Counter Ready");
  }
  if (fighter.evasiveTurns > 0) {
    statuses.push(`Evasive x${fighter.evasiveTurns}`);
  }
  if (fighter.chargeStacks > 0) {
    statuses.push(`Charged x${fighter.chargeStacks}`);
  }
  if (fighter.weakenedTurns > 0) {
    statuses.push(`Weakened x${fighter.weakenedTurns}`);
  }
  if (fighter.exposedTurns > 0) {
    statuses.push(`Exposed x${fighter.exposedTurns}`);
  }
  if (fighter.bleedTurns > 0) {
    statuses.push(`Bleeding ${fighter.bleedDamage}/turn`);
  }
  return statuses.length ? statuses.join(" | ") : "Stable";
}

function getBattleFighterField(fighter) {
  const cooldownSummary = summarizeBattleCooldowns(fighter);
  return [
    `HP: ${fighter.hp}/${fighter.maxHp}`,
    progressBar(fighter.hp, fighter.maxHp, 10),
    `Skill: ${fighter.skill?.name || "Focus"}`,
    `Attacks: ${formatBattleActionList(fighter.unlockedActions)}`,
    `Gear: ${Object.values(cloneLoadout(fighter.loadout)).map((gearId) => getInventoryLabel(gearId || "None")).join(" | ")}`,
    `Items: ${summarizeCombatInventory(fighter.combatItems)}`,
    `State: ${getBattleStatuses(fighter)}`,
    `Cooldowns: ${cooldownSummary || "Ready"}`,
  ].join("\n");
}

function getCompactBattleFighterField(fighter) {
  const status = getBattleStatuses(fighter);
  return [
    `HP: ${fighter.hp}/${fighter.maxHp}`,
    progressBar(fighter.hp, fighter.maxHp, 10),
    status === "Stable" ? "State: Stable" : `State: ${status}`,
  ].join("\n");
}

function battleHpBar(current, total, size = 16) {
  const ratio = total <= 0 ? 1 : clamp(current / total, 0, 1);
  const filled = Math.round(ratio * size);
  return `${"\u2588".repeat(filled)}${"\u2591".repeat(size - filled)} ${Math.round(ratio * 100)}%`;
}

function emojiHpBar(current, total, size = 10) {
  const ratio = total <= 0 ? 1 : clamp(current / total, 0, 1);
  const filled = Math.round(ratio * size);
  const empty = size - filled;
  const fillEmoji = ratio <= 0.25 ? "\u{1F7E5}" : ratio <= 0.55 ? "\u{1F7E8}" : "\u{1F7E9}";
  return `${fillEmoji.repeat(filled)}${"\u2B1B".repeat(empty)}`;
}

function getHpMood(fighter, isBoss = false) {
  const ratio = fighter.maxHp <= 0 ? 1 : fighter.hp / fighter.maxHp;
  if (fighter.hp <= 0) {
    return isBoss ? "DEFEATED" : "DOWN";
  }
  if (ratio <= 0.25) {
    return isBoss ? "ENRAGED" : "CRITICAL";
  }
  if (ratio <= 0.55) {
    return isBoss ? "WOUNDED" : "HURT";
  }
  return isBoss ? "DOMINANT" : "READY";
}

function compactBattleStatuses(fighter) {
  const status = getBattleStatuses(fighter);
  return status === "Stable" ? "No active effects" : status;
}

function formatBossBattleScreen(state) {
  const player = state.playerOne;
  const boss = state.playerTwo;
  const turnName = state.turnId === player.id ? player.name : boss.name;
  const exchange = (state.exchangeCount || 0) + 1;
  return [
    "```",
    `${boss.name.toUpperCase()}  [${getHpMood(boss, true)}]`,
    `BOSS ${String(boss.hp).padStart(3, " ")}/${String(boss.maxHp).padEnd(3, " ")} ${battleHpBar(boss.hp, boss.maxHp)}`,
    "",
    `${player.name.toUpperCase()}  [${getHpMood(player)}]`,
    `YOU  ${String(player.hp).padStart(3, " ")}/${String(player.maxHp).padEnd(3, " ")} ${battleHpBar(player.hp, player.maxHp)}`,
    "",
    `TURN: ${turnName}`,
    `ROUND: ${exchange}`,
    "```",
  ].join("\n");
}

function formatCombatLog(description) {
  return (description || "The encounter begins.")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-4)
    .map((line) => `\u25B8 ${line}`)
    .join("\n");
}

function describeActionMotion(attacker, defender, action, state) {
  const actionLabel = action === "skill"
    ? (attacker.skill?.name || "a skill")
    : (getBattleAction(action)?.label || BATTLE_SPECIAL_ACTIONS[action]?.label || "Attack");
  const arenaText = state?.arena && !state.isBoss ? ` across ${state.arena.name}` : "";
  const motions = {
    strike: `${attacker.name} steps in${arenaText}, forcing ${defender.name} to answer a direct strike.`,
    attack: `${attacker.name} closes distance${arenaText}, turning the exchange into a head-on clash.`,
    skill: `${attacker.name} commits to ${actionLabel}, trying to take control before ${defender.name} can reset.`,
    finish: `${attacker.name} hunts for the finish, pressing ${defender.name} with everything built up so far.`,
    heavy: `${attacker.name} throws their weight forward, a heavy swing crashing toward ${defender.name}.`,
    hook: `${attacker.name} cuts inside with a hook, trying to break ${defender.name}'s rhythm.`,
    feint: `${attacker.name} darts in with a feint, baiting ${defender.name} into the wrong guard.`,
    pierce: `${attacker.name} drives straight through the center line, testing ${defender.name}'s defense.`,
    charge: `${attacker.name} plants their feet and gathers power while ${defender.name} feels the next hit coming.`,
    disorient: `${attacker.name} surges in at an awkward angle, trying to scramble ${defender.name}'s footing.`,
    blitz: `${attacker.name} bursts forward, chaining quick hits before ${defender.name} can breathe.`,
    guard: `${attacker.name} braces behind their guard, inviting ${defender.name} to overcommit.`,
    sidestep: `${attacker.name} slips off-line, making ${defender.name} swing at empty space.`,
  };
  return motions[action] || `${attacker.name} attacks ${defender.name}.`;
}

function describeDamagePressure(attacker, defender, result = {}) {
  if (result.damage > 0 && defender.hp > 0) {
    return `${defender.name} is still standing at ${defender.hp}/${defender.maxHp} HP, but ${attacker.name} has momentum.`;
  }
  if (result.damage > 0 && defender.hp <= 0) {
    return `${defender.name} drops under the pressure.`;
  }
  if (result.counterDamage > 0) {
    return `${attacker.name} felt that counter and is now at ${attacker.hp}/${attacker.maxHp} HP.`;
  }
  if (["guard", "sidestep", "charge"].includes(result.action)) {
    return `${defender.name} has to respect the setup before the next swing.`;
  }
  return `${defender.name} survives the exchange and looks for a reply.`;
}

function narrateBattleAction(attacker, defender, action, result, state) {
  const lines = [describeActionMotion(attacker, defender, action, state), result.text];
  const pressure = describeDamagePressure(attacker, defender, { ...result, action });
  if (pressure) {
    lines.push(pressure);
  }
  return lines.filter(Boolean).join("\n");
}

function describeIncomingPvpPressure(state) {
  if (state.isBoss) {
    return "";
  }
  const attacker = state.turnId === state.playerOne.id ? state.playerOne : state.playerTwo;
  const defender = attacker.id === state.playerOne.id ? state.playerTwo : state.playerOne;
  const statuses = compactBattleStatuses(attacker);
  const threat = attacker.chargeStacks > 0
    ? `${attacker.name} is charged and looking for a punishing hit.`
    : attacker.combo > 0
      ? `${attacker.name} has combo ${attacker.combo} and is pressing the advantage.`
      : `${attacker.name} is in range and ready to attack.`;
  return [
    `${threat}`,
    `${defender.name} is under pressure now. Pick a response before the next hit lands.`,
    `Attacker state: ${statuses}`,
  ].join("\n");
}

function getBattleTurnActor(state) {
  return state.turnId === state.playerOne.id ? state.playerOne : state.playerTwo;
}

function getBattleTurnDefender(state) {
  const actor = getBattleTurnActor(state);
  return actor.id === state.playerOne.id ? state.playerTwo : state.playerOne;
}

function formatPvpTurnStatus(state) {
  const actor = getBattleTurnActor(state);
  const defender = getBattleTurnDefender(state);
  return [
    `Now acting: **${actor.name}**`,
    `Waiting: ${defender.name}`,
    `Only ${actor.name}'s action will resolve this turn.`,
  ].join("\n");
}

function chooseBossIntent(state) {
  const player = state.playerOne;
  const boss = state.playerTwo;
  const bossHpRatio = boss.maxHp <= 0 ? 1 : boss.hp / boss.maxHp;
  const intentPool = ["crush", "mark", "shatter"];

  if (bossHpRatio <= 0.55) {
    intentPool.push("surge", "crush");
  }
  if ((player.combo || 0) >= 2 || player.guard) {
    intentPool.push("shatter");
  }
  if (player.hp <= player.maxHp * 0.35) {
    intentPool.push("crush");
  }

  const intentId = intentPool[randInt(0, intentPool.length - 1)];
  return { id: intentId, ...BOSS_INTENTS[intentId] };
}

function getBossIntent(state) {
  const existingIntent = state?.bossIntent?.id ? BOSS_INTENTS[state.bossIntent.id] : null;
  if (existingIntent) {
    return { id: state.bossIntent.id, ...existingIntent };
  }
  return chooseBossIntent(state);
}

function formatBossIntent(state) {
  const intent = getBossIntent(state);
  return [
    `\u26A0\uFE0F \`Incoming\` **${intent.label}**`,
    `\u{1F525} \`Threat\` ${intent.danger}`,
    `\u{1F6E1}\uFE0F \`Counter\` ${intent.counter}`,
    `> ${intent.tell}`,
  ].join("\n");
}

function getBossThemeColor(bossId) {
  const colors = {
    "boss:ember": 0xe63946,
    "boss:oracle": 0x4cc9f0,
    "boss:warden": 0xf4a261,
    "boss:codex": 0x9b5de5,
  };
  return colors[bossId] || 0x2f3136;
}

function getBossConfigFromFighter(boss) {
  const bossId = String(boss?.id || "").replace(/^boss:/, "");
  return BOSSES.find((entry) => entry.id === bossId) || null;
}

function pickDialogueLine(lines, seed = 0) {
  if (!Array.isArray(lines) || !lines.length) {
    return "";
  }
  return lines[Math.abs(seed) % lines.length];
}

function getBossDialogueLine(state, bucket, detail) {
  const boss = state.playerTwo;
  const config = getBossConfigFromFighter(boss);
  const dialogue = config?.dialogue;
  if (!dialogue) {
    return "";
  }
  const source = bucket === "intent" ? dialogue.intent?.[detail] : dialogue[bucket];
  const seedText = `${boss.id}:${bucket}:${detail || ""}`;
  const seed = [...seedText].reduce((total, char) => total + char.charCodeAt(0), 0)
    + (state.exchangeCount || 0)
    + (boss.hp || 0)
    + (state.playerOne?.hp || 0);
  return pickDialogueLine(source, seed);
}

function getCurrentBossDialogue(state) {
  const boss = state.playerTwo;
  const bossHpRatio = boss.maxHp <= 0 ? 1 : boss.hp / boss.maxHp;
  if ((state.exchangeCount || 0) === 0) {
    return getBossDialogueLine(state, "intro");
  }
  if (bossHpRatio <= 0.25) {
    return getBossDialogueLine(state, "enrage") || getBossDialogueLine(state, "wounded");
  }
  if (bossHpRatio <= 0.55) {
    return getBossDialogueLine(state, "wounded");
  }
  const intent = getBossIntent(state);
  return getBossDialogueLine(state, "intent", intent.id);
}

function formatBossDialogue(state, line = getCurrentBossDialogue(state)) {
  return line ? `**${state.playerTwo.name}:** "${line}"` : "The boss says nothing. That might be worse.";
}

function createBossBattlePayload(description, visual, state) {
  const player = state.playerOne;
  const boss = state.playerTwo;
  const exchange = (state.exchangeCount || 0) + 1;
  const turnName = state.turnId === player.id ? player.name : boss.name;
  const bossMood = getHpMood(boss, true);
  const playerMood = getHpMood(player);
  const attachment = visual ? buildAttachment(visual) : null;
  const embed = new EmbedBuilder()
    .setColor(getBossThemeColor(boss.id))
    .setTitle(`\u2694\uFE0F RAID BOSS | ${boss.name.toUpperCase()}`)
    .setDescription([
      `> **${boss.name}** enters phase **${bossMood}**.`,
      "",
      "\u2501".repeat(20),
      `\u{1F3AF} **Turn:** \`${turnName}\``,
      `\u{1F501} **Exchange:** \`${exchange}\``,
      "\u2501".repeat(20),
    ].join("\n"))
    .addFields(
      {
        name: "\u{1F464} Player HUD",
        value: [
          `\u2764\uFE0F \`HP\` ${emojiHpBar(player.hp, player.maxHp)} **${player.hp}/${player.maxHp}**`,
          `\u26A1 \`State\` **${playerMood}**`,
          `\u2728 \`Skill\` **${player.skill?.name || "Focus"}**`,
          `\u{1F392} \`Items\` ${summarizeCombatInventory(player.combatItems)}`,
        ].join("\n"),
        inline: false,
      },
      {
        name: "\u{1F479} Boss HUD",
        value: [
          `\u{1F494} \`HP\` ${emojiHpBar(boss.hp, boss.maxHp)} **${boss.hp}/${boss.maxHp}**`,
          `\u26A0\uFE0F \`Phase\` **${bossMood}**`,
          `\u{1F300} \`Effects\` ${compactBattleStatuses(boss)}`,
        ].join("\n"),
        inline: false,
      },
      {
        name: "\u{1F52E} Boss Intent",
        value: formatBossIntent(state),
        inline: false,
      },
      {
        name: "\u{1F5E3}\uFE0F Boss Dialogue",
        value: formatBossDialogue(state),
        inline: false,
      },
      {
        name: "\u{1F4DC} Combat Log",
        value: formatCombatLog(description),
        inline: false,
      },
      {
        name: "\u{1F3AE} Controller",
        value: "Read the boss intent, then choose a counter. Guard, Sidestep, Heavy, Pierce, and Finisher now matter at different moments.",
        inline: false,
      }
    )
    .setFooter({ text: `Boss UI v6 \u2022 Telegraph combat \u2022 ${player.name} vs ${boss.name}` })
    .setTimestamp();

  if (attachment) {
    embed.setImage(`attachment://${visual}`);
  }

  return {
    content: `\u{1F3AE} **Boss Fight v6** | ${player.name} vs ${boss.name}`,
    embeds: [embed],
    files: attachment ? [attachment] : [],
  };
}

function formatBattleSnapshot(fighter) {
  return [
    `HP ${fighter.hp}/${fighter.maxHp} ${emojiHpBar(fighter.hp, fighter.maxHp, 8)}`,
    `State: ${compactBattleStatuses(fighter)}`,
  ].join("\n");
}

function createBattleResolvingPayload(state, summary) {
  const playerOne = state.playerOne;
  const playerTwo = state.playerTwo;
  const nextActor = state.turnId === playerOne.id ? playerOne : playerTwo;
  const nextDefender = nextActor.id === playerOne.id ? playerTwo : playerOne;
  const nextName = nextActor.name;
  const title = state.isBoss ? "Boss Turn Resolving" : "PvP Turn Resolving";
  const description = [
    "\u25B6 Action locked in",
    "\u25B6 Damage and effects resolving",
    "\u25B6 Loading next turn",
  ].join("\n");
  const embed = new EmbedBuilder()
    .setColor(state.isBoss ? getBossThemeColor(playerTwo.id) : 0xff6b88)
    .setTitle(`\u23F3 ${title}`)
    .setDescription(`${description}\n\n${"\u2501".repeat(20)}`)
    .addFields(
      { name: playerOne.name, value: formatBattleSnapshot(playerOne), inline: true },
      { name: playerTwo.name, value: formatBattleSnapshot(playerTwo), inline: true },
      { name: "Last Exchange", value: formatCombatLog(summary), inline: false },
      {
        name: "Next Turn",
        value: state.isBoss
          ? `\`${nextName}\` is preparing their move.`
          : `\`${nextName}\` is moving in on \`${nextDefender.name}\`. The next action is an incoming attack, guard, or setup.`,
        inline: false,
      }
    )
    .setFooter({ text: "Aurix combat replay \u2022 resolving turn" })
    .setTimestamp();

  return {
    content: `\u23F3 **Resolving turn...** ${playerOne.name} vs ${playerTwo.name}`,
    embeds: [embed],
  };
}

function resolveTurnStart(fighter) {
  const notes = [];
  if (fighter.bleedTurns > 0 && fighter.bleedDamage > 0) {
    const damage = Math.min(fighter.hp, fighter.bleedDamage);
    fighter.hp = clamp(fighter.hp - damage, 0, fighter.maxHp);
    fighter.bleedTurns -= 1;
    if (fighter.bleedTurns <= 0) {
      fighter.bleedDamage = 0;
    }
    notes.push(`${fighter.name} bleeds for ${damage} damage.`);
  }
  return { text: notes.join("\n"), defeated: fighter.hp <= 0 };
}

function resolveHit(attacker, defender, baseDamage, options = {}) {
  const {
    actionLabel = "struck",
    critChance = 0.1,
    critMultiplier = 1.45,
    pierceGuard = false,
    guardReduction = 0.5,
    exposeMultiplier = 1.3,
    consumeCritBoost = true,
    counterBonus = 0,
  } = options;

  let damage = baseDamage;
  const notes = [];
  if (attacker.weakenedTurns > 0) {
    damage = Math.floor(damage * 0.8);
    attacker.weakenedTurns = Math.max(0, attacker.weakenedTurns - 1);
    notes.push(`${attacker.name} was off-balance`);
  }
  if (attacker.chargeStacks > 0) {
    damage += attacker.chargeStacks * 8;
    notes.push(`charged x${attacker.chargeStacks}`);
    attacker.chargeStacks = 0;
  }

  if (defender.evasiveTurns > 0) {
    defender.evasiveTurns = Math.max(0, defender.evasiveTurns - 1);
    const dodgeChance = pierceGuard ? 0.35 : 0.65;
    if (Math.random() < dodgeChance) {
      defender.guard = false;
      defender.counterStance = false;
      if (consumeCritBoost) {
        attacker.critBoost = 0;
      }
      return {
        damage: 0,
        counterDamage: 0,
        crit: false,
        text: `${attacker.name} ${actionLabel} for 0 damage (${defender.name} sidestepped cleanly).`,
      };
    }
    notes.push(`${defender.name} almost slipped clear`);
  }

  const totalCritChance = clamp(
    critChance
      + (attacker.critBoost || 0)
      + (attacker.passiveCritBoost || 0)
      + Math.min(attacker.combo || 0, 4) * 0.05,
    0,
    0.8
  );
  const crit = Math.random() < totalCritChance;
  if (crit) {
    damage = Math.floor(damage * critMultiplier);
    notes.push("critical hit");
  }

  if (defender.exposedTurns > 0) {
    damage = Math.floor(damage * exposeMultiplier);
    defender.exposedTurns = Math.max(0, defender.exposedTurns - 1);
    notes.push(`${defender.name} was exposed`);
  }

  let guardTriggered = false;
  if (defender.guard && !pierceGuard) {
    const effectiveGuardReduction = Math.max(0.2, guardReduction - (defender.gearBonuses?.guardReductionBonus || 0));
    damage = Math.floor(damage * effectiveGuardReduction);
    guardTriggered = true;
    notes.push(`${defender.name} blocked part of it`);
  } else if (defender.guard && pierceGuard) {
    notes.push(`${defender.name}'s guard was shattered`);
  }

  damage = Math.max(0, damage);
  defender.hp = clamp(defender.hp - damage, 0, defender.maxHp);

  let counterDamage = 0;
  if (guardTriggered && defender.counterStance && defender.hp > 0) {
    counterDamage = randInt(5, 9) + counterBonus;
    attacker.hp = clamp(attacker.hp - counterDamage, 0, attacker.maxHp);
    attacker.combo = Math.max(0, (attacker.combo || 0) - 1);
    notes.push(`${defender.name} countered for ${counterDamage}`);
  }

  defender.guard = false;
  defender.counterStance = false;
  if (consumeCritBoost) {
    attacker.critBoost = 0;
  }

  return {
    damage,
    counterDamage,
    crit,
    text: `${attacker.name} ${actionLabel} for ${damage} damage${notes.length ? ` (${notes.join(", ")})` : ""}.`,
  };
}

function runTurn(attacker, defender, action, state) {
  let damage = 0;
  let text = "";
  const arena = state?.arena || null;
  const arenaCritBonus = arena?.critBonus || 0;
  const arenaGuardReduction = arena?.guardReduction ?? 0.5;
  const arenaCounterBonus = arena?.counterBonus || 0;
  const strikeBonus = attacker.gearBonuses?.strikeDamageBonus || 0;
  const heavyBonus = attacker.gearBonuses?.heavyDamageBonus || 0;
  const healBonus = attacker.gearBonuses?.healBonus || 0;
  const finisherBonus = attacker.gearBonuses?.finisherBonusDamage || 0;

  if (action === "guard") {
    attacker.guard = true;
    attacker.counterStance = true;
    return { damage, text: `${attacker.name} raised their guard and prepared a counter${arena?.counterBonus ? " in the heavy arena" : ""}.` };
  }

  if (action === "sidestep") {
    attacker.evasiveTurns = Math.max(attacker.evasiveTurns, 1);
    attacker.critBoost = clamp((attacker.critBoost || 0) + 0.08, 0, 0.6);
    return { damage, text: `${attacker.name} slipped to the side, setting an evasive angle for the next exchange.` };
  }

  if (action === "skill") {
    const skill = attacker.skill || { id: "focus", ...SKILLS.focus };
    if (skill.heal) {
      const cleared = [];
      const totalHeal = skill.heal + healBonus;
      attacker.hp = clamp(attacker.hp + totalHeal, 0, attacker.maxHp);
      attacker.critBoost = clamp((attacker.critBoost || 0) + (skill.critBoost || 0), 0, 0.6);
      attacker.combo = clamp((attacker.combo || 0) + 1, 0, 4);
      if (attacker.bleedTurns > 0) {
        attacker.bleedTurns = 0;
        attacker.bleedDamage = 0;
        cleared.push("bleed");
      }
      if (attacker.exposedTurns > 0) {
        attacker.exposedTurns = 0;
        cleared.push("exposed");
      }
      rotateBattleSkill(attacker);
      return {
        damage,
        text: `${attacker.name} used ${skill.name}, healed ${totalHeal}, and sharpened their next strike${cleared.length ? ` while clearing ${cleared.join(" and ")}` : ""}.`,
      };
    }

    const comboBeforeHit = attacker.combo || 0;
    const hit = resolveHit(attacker, defender, randInt(skill.minDamage, skill.maxDamage), {
      actionLabel: `used ${skill.name}`,
      critChance: 0.12 + arenaCritBonus,
      pierceGuard: Boolean(skill.pierceGuard),
      guardReduction: arena?.guardReduction ?? 0.45,
      counterBonus: arenaCounterBonus,
    });

    damage = hit.damage;
    text = hit.text;
    attacker.combo = clamp(comboBeforeHit + 1, 0, 4);

    if (skill.id === "slash" && comboBeforeHit >= 2 && defender.hp > 0) {
      defender.bleedTurns = Math.max(defender.bleedTurns, 2);
      defender.bleedDamage = Math.max(defender.bleedDamage, 6 + comboBeforeHit + (arena?.bleedBonus || 0));
      text += ` ${defender.name} started bleeding.`;
    }

    if (skill.id === "guard_break") {
      defender.exposedTurns = Math.max(defender.exposedTurns, 2);
      text += ` ${defender.name} is exposed for the next exchanges.`;
    }

    rotateBattleSkill(attacker);
    return { damage, text };
  }

  if (action === "finish") {
    const comboBonus = (attacker.combo || 0) * 6;
    damage = randInt(20, 34) + comboBonus + (arena?.finisherBonusDamage || 0) + finisherBonus;
    if (defender.hp > defender.maxHp * (arena?.finisherThreshold || 0.35)) {
      damage = Math.floor(damage * 0.55);
      const hit = resolveHit(attacker, defender, damage, {
        actionLabel: "went for an early finisher",
        critChance: 0.08 + arenaCritBonus,
        critMultiplier: 1.35,
        guardReduction: arenaGuardReduction,
        counterBonus: arenaCounterBonus,
      });
      attacker.combo = 0;
      return { damage: hit.damage, text: `${hit.text} The timing was not ideal.` };
    }

    const hit = resolveHit(attacker, defender, damage, {
      actionLabel: "landed a finisher",
      critChance: 0.1 + arenaCritBonus,
      critMultiplier: 1.5,
      guardReduction: arenaGuardReduction,
      counterBonus: arenaCounterBonus,
    });
    attacker.combo = 0;
    return { damage: hit.damage, text: hit.text };
  }

  if (action === "heavy") {
    const heavyBase = randInt(18, 26) + heavyBonus + Math.floor((attacker.combo || 0) * 1.5);
    const hit = resolveHit(attacker, defender, heavyBase, {
      actionLabel: "swung a heavy blow",
      critChance: 0.08 + arenaCritBonus,
      critMultiplier: 1.55,
      guardReduction: arenaGuardReduction,
      counterBonus: arenaCounterBonus,
    });
    attacker.combo = clamp((attacker.combo || 0) + 1, 0, 4);
    if (defender.hp > 0) {
      attacker.exposedTurns = Math.max(attacker.exposedTurns, 1);
      return { damage: hit.damage, text: `${hit.text} ${attacker.name} is slightly exposed after the commitment.` };
    }
    return { damage: hit.damage, text: hit.text };
  }

  if (action === "hook") {
    const hit = resolveHit(attacker, defender, randInt(11, 17) + Math.floor((attacker.combo || 0) * 1.2), {
      actionLabel: "whipped in a hook",
      critChance: 0.1 + arenaCritBonus,
      critMultiplier: 1.35,
      guardReduction: arenaGuardReduction,
      counterBonus: arenaCounterBonus,
    });
    attacker.combo = clamp((attacker.combo || 0) + 1, 0, 4);
    defender.combo = Math.max(0, (defender.combo || 0) - 2);
    defender.weakenedTurns = Math.max(defender.weakenedTurns, 1);
    return { damage: hit.damage, text: `${hit.text} ${defender.name}'s rhythm was broken.` };
  }

  if (action === "feint") {
    const hit = resolveHit(attacker, defender, randInt(7, 12) + Math.floor((attacker.combo || 0) / 2), {
      actionLabel: "darted in with a feint",
      critChance: 0.14 + arenaCritBonus,
      critMultiplier: 1.3,
      guardReduction: arenaGuardReduction,
      counterBonus: arenaCounterBonus,
    });
    attacker.critBoost = clamp((attacker.critBoost || 0) + 0.15, 0, 0.6);
    attacker.combo = clamp((attacker.combo || 0) + 1, 0, 4);
    defender.exposedTurns = Math.max(defender.exposedTurns, 1);
    return { damage: hit.damage, text: `${hit.text} ${defender.name} was drawn out of position.` };
  }

  if (action === "pierce") {
    const hit = resolveHit(attacker, defender, randInt(12, 20) + Math.floor((attacker.combo || 0) * 1.5), {
      actionLabel: "drove in a piercing strike",
      critChance: 0.11 + arenaCritBonus,
      critMultiplier: 1.45,
      pierceGuard: true,
      guardReduction: arenaGuardReduction,
      counterBonus: arenaCounterBonus,
    });
    attacker.combo = clamp((attacker.combo || 0) + 1, 0, 4);
    if (defender.hp > 0) {
      defender.exposedTurns = Math.max(defender.exposedTurns, 1);
    }
    return { damage: hit.damage, text: `${hit.text}${defender.hp > 0 ? ` ${defender.name} was opened up.` : ""}` };
  }

  if (action === "charge") {
    attacker.chargeStacks = clamp((attacker.chargeStacks || 0) + 1, 0, 2);
    attacker.combo = clamp((attacker.combo || 0) + 1, 0, 4);
    return {
      damage,
      text: `${attacker.name} gathered force and stored it for the next strike${attacker.chargeStacks > 1 ? ", now heavily charged" : ""}.`,
    };
  }

  if (action === "disorient") {
    const hit = resolveHit(attacker, defender, randInt(9, 15) + Math.floor((attacker.combo || 0) * 0.8), {
      actionLabel: "lashed out with a disorienting burst",
      critChance: 0.12 + arenaCritBonus,
      critMultiplier: 1.32,
      pierceGuard: true,
      guardReduction: arenaGuardReduction,
      counterBonus: arenaCounterBonus,
    });
    attacker.combo = clamp((attacker.combo || 0) + 1, 0, 4);
    defender.guard = false;
    defender.counterStance = false;
    defender.combo = Math.max(0, (defender.combo || 0) - 2);
    defender.weakenedTurns = Math.max(defender.weakenedTurns, 1);
    defender.exposedTurns = Math.max(defender.exposedTurns, 1);
    return { damage: hit.damage, text: `${hit.text} ${defender.name} lost their footing and guard.` };
  }

  if (action === "blitz") {
    const comboBeforeBlitz = attacker.combo || 0;
    const firstHit = resolveHit(attacker, defender, randInt(8, 12) + Math.floor((attacker.combo || 0) * 0.5), {
      actionLabel: "opened with a blitz",
      critChance: 0.09 + arenaCritBonus,
      critMultiplier: 1.3,
      guardReduction: arenaGuardReduction,
      counterBonus: arenaCounterBonus,
    });
    let totalDamage = firstHit.damage;
    let textSummary = firstHit.text;
    if (defender.hp > 0) {
      const secondHit = resolveHit(attacker, defender, randInt(8, 14) + Math.floor((attacker.combo || 0) * 0.5), {
        actionLabel: "followed through with a second hit",
        critChance: 0.09 + arenaCritBonus,
        critMultiplier: 1.35,
        guardReduction: arenaGuardReduction,
        counterBonus: arenaCounterBonus,
      });
      totalDamage += secondHit.damage;
      textSummary = `${textSummary} ${secondHit.text}`;
    }
    attacker.combo = clamp(comboBeforeBlitz + 2, 0, 4);
    return { damage: totalDamage, text: textSummary };
  }

  const comboBeforeHit = attacker.combo || 0;
  const hit = resolveHit(attacker, defender, randInt(10, 18) + comboBeforeHit * 2 + strikeBonus, {
    actionLabel: action === "attack" ? "attacked" : "struck",
    critChance: 0.1 + arenaCritBonus,
    critMultiplier: 1.4,
    guardReduction: arenaGuardReduction,
    counterBonus: arenaCounterBonus,
  });
  attacker.combo = clamp(comboBeforeHit + 1, 0, 4);
  return { damage: hit.damage, text: hit.text };
}

function resolveArenaPulse(state) {
  if (state.isBoss || !state.arena?.hazardEvery) {
    return { text: "", winnerId: null };
  }
  if ((state.exchangeCount || 0) % state.arena.hazardEvery !== 0) {
    return { text: "", winnerId: null };
  }

  const target = state.playerOne.hp === state.playerTwo.hp
    ? (Math.random() < 0.5 ? state.playerOne : state.playerTwo)
    : (state.playerOne.hp < state.playerTwo.hp ? state.playerOne : state.playerTwo);
  const other = target.id === state.playerOne.id ? state.playerTwo : state.playerOne;
  const damage = randInt(state.arena.hazardDamage[0], state.arena.hazardDamage[1]);
  target.hp = clamp(target.hp - damage, 0, target.maxHp);
  if (target.hp > 0 && state.arena.exposeOnHazard) {
    target.exposedTurns = Math.max(target.exposedTurns, state.arena.exposeOnHazard);
  }

  return {
    text: `${state.arena.name} surged and struck ${target.name} for ${damage} damage${state.arena.exposeOnHazard && target.hp > 0 ? ", leaving them exposed" : ""}.`,
    winnerId: target.hp <= 0 ? other.id : null,
  };
}

function resolveBossIntent(state) {
  const boss = state.playerTwo;
  const player = state.playerOne;
  const intent = getBossIntent(state);
  const playerWasGuarding = Boolean(player.guard);
  const playerWasEvasive = (player.evasiveTurns || 0) > 0;
  const result = runTurn(boss, player, intent.action, state);
  const reaction = [];

  if (intent.id === "crush" && playerWasGuarding) {
    reaction.push("Your guard braced against the telegraphed hit.");
  }
  if (intent.id === "crush" && playerWasEvasive) {
    reaction.push("Your sidestep gave you a chance to slip the crush.");
  }
  if (intent.id === "shatter" && playerWasGuarding) {
    reaction.push("The shatter punished a defensive stance.");
  }
  if (intent.id === "surge" && boss.chargeStacks > 0) {
    reaction.push(`${boss.name} is charged. Interrupt or brace before the next attack.`);
  }

  return {
    text: [
      formatBossDialogue(state, getBossDialogueLine(state, "intent", intent.id)),
      `${boss.name} used **${intent.label}**.`,
      narrateBattleAction(boss, player, intent.action, result, state),
      reaction.join(" "),
    ].filter(Boolean).join("\n"),
    damage: result.damage,
  };
}

function buildBattleComponents(state, fighter) {
  const canUseSkill = Boolean(fighter?.skill);
  const skillCooldownLabel = getBattleActionCooldownLabel(fighter, "skill");
  const finishCooldownLabel = getBattleActionCooldownLabel(fighter, "finish");
  const guardCooldownLabel = getBattleActionCooldownLabel(fighter, "guard");
  const skillLabelBase = fighter?.skill?.name ? `Skill: ${fighter.skill.name}` : "Skill";
  const skillLabel = skillCooldownLabel ? `${skillLabelBase} ${skillCooldownLabel}` : skillLabelBase;
  const actionButtons = (fighter?.unlockedActions || ["strike"])
    .map((actionId) => ({ actionId, action: getBattleAction(actionId) }))
    .filter(({ action }) => Boolean(action))
    .map(({ actionId, action }) => {
      const cooldownLabel = getBattleActionCooldownLabel(fighter, actionId);
      return new ButtonBuilder()
        .setCustomId(`${state.id}:${actionId}`)
        .setEmoji(BATTLE_ACTION_EMOJIS[actionId] || "⚔️")
        .setLabel(cooldownLabel ? `${action.label} ${cooldownLabel}` : action.label)
        .setStyle(action.style)
        .setDisabled(isBattleActionOnCooldown(state, fighter, actionId));
    });
  const actionRows = chunkArray(actionButtons, 5).map((rowButtons) => new ActionRowBuilder().addComponents(...rowButtons));
  const components = [
    ...actionRows,
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${state.id}:skill`).setEmoji(BATTLE_ACTION_EMOJIS.skill).setLabel(skillLabel.slice(0, 80)).setStyle(ButtonStyle.Success).setDisabled(!canUseSkill || isBattleActionOnCooldown(state, fighter, "skill")),
      new ButtonBuilder().setCustomId(`${state.id}:guard`).setEmoji(BATTLE_ACTION_EMOJIS.guard).setLabel(guardCooldownLabel ? `Guard ${guardCooldownLabel}` : "Guard").setStyle(ButtonStyle.Secondary).setDisabled(isBattleActionOnCooldown(state, fighter, "guard")),
      new ButtonBuilder().setCustomId(`${state.id}:finish`).setEmoji(BATTLE_ACTION_EMOJIS.finish).setLabel(finishCooldownLabel ? `Finisher ${finishCooldownLabel}` : "Finisher").setStyle(ButtonStyle.Danger).setDisabled(isBattleActionOnCooldown(state, fighter, "finish"))
    ),
  ];

  const itemOptions = Object.entries(fighter?.combatItems || {})
    .filter(([, quantity]) => quantity > 0)
    .map(([itemId, quantity]) => {
      const item = getCombatItem(itemId);
      return {
        label: `${item?.name || itemId} x${quantity}`.slice(0, 100),
        value: itemId,
        description: (item?.description || "Battle item").slice(0, 100),
      };
    })
    .slice(0, 25);

  if (itemOptions.length) {
    components.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${state.id}:item`)
          .setPlaceholder("Use a battle item")
          .addOptions(itemOptions)
      )
    );
  }

  return components;
}

function createBattleEmbed(title, description, visual, state) {
  const turnActor = getBattleTurnActor(state);
  const turnDefender = getBattleTurnDefender(state);
  const turnLabel = `${turnActor.name} (${turnActor.skill?.name || "Focus"})`;
  if (state.isBoss) {
    return createBossBattlePayload(description, visual, state);
  }
  const extraFields = [];
  const fighterField = state.isBoss ? getCompactBattleFighterField : getBattleFighterField;
  if (state.arena) {
    extraFields.push({
      name: "Arena",
      value: `${state.arena.name}\n${state.arena.description}`,
      inline: false,
    });
  }
  const incomingPressure = describeIncomingPvpPressure(state);
  if (incomingPressure) {
    extraFields.push({
      name: "Incoming Pressure",
      value: incomingPressure,
      inline: false,
    });
  }
  const payload = buildEmbedPayload({
    title,
    description: [
      `**${turnActor.name}'s turn.** ${turnDefender.name} is waiting for the handoff.`,
      "",
      description,
    ].filter(Boolean).join("\n"),
    visual,
    fields: [
      { name: state.playerOne.name, value: fighterField(state.playerOne), inline: true },
      { name: state.playerTwo.name, value: fighterField(state.playerTwo), inline: true },
      { name: "Turn Order", value: `${formatPvpTurnStatus(state)}\nExchange ${(state.exchangeCount || 0) + 1}`, inline: false },
      ...extraFields,
    ],
    footer: `Turn ${((state.exchangeCount || 0) + 1)} \u2022 buttons below are for ${turnActor.name}`,
  });
  return {
    content: `\u{1F3AE} **PvP Turn ${((state.exchangeCount || 0) + 1)}** | Waiting on ${turnLabel}`,
    ...payload,
  };
}

async function useBattleItem(interaction, fighter, defender, itemId) {
  const item = getCombatItem(itemId);
  if (!item) {
    return { error: "That battle item is not available." };
  }
  if ((fighter.combatItems?.[itemId] || 0) <= 0) {
    return { error: `You do not have any ${item.name} left.` };
  }

  const user = await getOrCreatePlayer(interaction.guildId, fighter.id);
  const entry = user.inventory.find((inventoryItem) => inventoryItem.id === itemId);
  if (!entry || entry.quantity <= 0) {
    fighter.combatItems[itemId] = 0;
    return { error: `You do not have any ${item.name} left in your inventory.` };
  }

  entry.quantity -= 1;
  if (entry.quantity < 0) {
    entry.quantity = 0;
  }
  user.markModified("inventory");
  await user.save();
  fighter.combatItems[itemId] = Math.max(0, (fighter.combatItems[itemId] || 0) - 1);

  if (item.battle?.effect === "heal") {
    const totalHeal = item.battle.heal + (fighter.gearBonuses?.healBonus || 0);
    fighter.hp = clamp(fighter.hp + totalHeal, 0, fighter.maxHp);
    return { text: `${fighter.name} used ${item.name} and restored ${totalHeal} HP.` };
  }

  if (item.battle?.effect === "smoke") {
    const damage = randInt(item.battle.damage[0], item.battle.damage[1]);
    defender.hp = clamp(defender.hp - damage, 0, defender.maxHp);
    defender.exposedTurns = Math.max(defender.exposedTurns, item.battle.exposeTurns || 1);
    return { text: `${fighter.name} used ${item.name}, dealt ${damage} damage, and left ${defender.name} exposed.` };
  }

  if (item.battle?.effect === "adrenaline") {
    const cleared = [];
    fighter.critBoost = clamp((fighter.critBoost || 0) + (item.battle.critBoost || 0), 0, 0.6);
    fighter.combo = clamp((fighter.combo || 0) + (item.battle.combo || 0), 0, 4);
    if (item.battle.clearBleed && fighter.bleedTurns > 0) {
      fighter.bleedTurns = 0;
      fighter.bleedDamage = 0;
      cleared.push("bleed");
    }
    if (item.battle.clearExpose && fighter.exposedTurns > 0) {
      fighter.exposedTurns = 0;
      cleared.push("exposed");
    }
    return { text: `${fighter.name} used ${item.name}, surged forward, and primed the next attack${cleared.length ? ` while clearing ${cleared.join(" and ")}` : ""}.` };
  }

  return { text: `${fighter.name} used ${item.name}.` };
}

function initializePvpBattleFromLoadout(state, challenger, rival) {
  state.phase = "battle";
  state.title = "PvP Duel";
  state.visual = "pvp-battle.svg";
  state.playerOne = createBattleFighter({
    id: challenger.userId,
    name: state.playerOne.name,
    hp: 100,
    maxHp: 100,
    skillCycle: getBattleSkillRotation(challenger),
    loadout: state.playerOne.loadout,
    gearOwner: challenger,
    combatItems: state.playerOne.combatItems,
    unlockedActions: getUnlockedBattleActions(challenger),
    premiumBattleBonus: getPremiumBattleBonus(challenger),
  });
  state.playerTwo = createBattleFighter({
    id: rival.userId,
    name: state.playerTwo.name,
    hp: 100,
    maxHp: 100,
    skillCycle: getBattleSkillRotation(rival),
    loadout: state.playerTwo.loadout,
    gearOwner: rival,
    combatItems: state.playerTwo.combatItems,
    unlockedActions: getUnlockedBattleActions(rival),
    premiumBattleBonus: getPremiumBattleBonus(rival),
  });
  state.turnId = Math.random() < 0.5 ? challenger.userId : rival.userId;
  state.rewardAura = randInt(750, 1250);
  state.rewardXp = randInt(220, 340);
  state.exchangeCount = 0;
}

async function finishBattle(interaction, state, winnerId) {
  activeBattles.delete(state.id);
  await deleteBattleSession(state.id);
  const first = await getOrCreatePlayer(getBattleGuildIdForUser(state, state.playerOne.id, interaction.guildId), state.playerOne.id);
  const second = state.isBoss ? null : await getOrCreatePlayer(getBattleGuildIdForUser(state, state.playerTwo.id, interaction.guildId), state.playerTwo.id);
  const playerWon = state.playerOne.id === winnerId;

  if (state.isBoss) {
    if (playerWon) {
      const effects = getCombinedEffects(first);
      const auraReward = Math.floor(state.rewardAura * (1 + (effects.bossRewardBoost || 0)));
      const loot = rollCombatLoot("boss", state.playerTwo.id.replace("boss:", ""));
      first.aura += auraReward;
      first.xp += state.rewardXp;
      first.stats.bossWins += 1;
      applyCombatLoot(first, loot);
      await applyQuestProgress(first, "bossWins", 1);
      await syncRank(first);
      await first.save();
      const payload = {
        ...buildEmbedPayload({
          title: "Boss Defeated",
          description: `${formatBossDialogue(state, getBossDialogueLine(state, "defeat"))}\n\nYou beat **${state.playerTwo.name}** and earned boss rewards plus ${formatNumber(state.rewardXp)} XP.`,
          visual: state.visual,
          fields: [
            { name: "Aura", value: `${formatNumber(auraReward)}`, inline: true },
            { name: "Loot Drops", value: loot.length ? loot.map((entry) => entry.label).join(", ") : "None", inline: true },
          ],
        }),
        components: [],
      };
      return interaction.update(payload);
    } else {
      first.xp = Math.max(0, first.xp - Math.floor(state.rewardXp / 3));
      first.stats.bossLosses += 1;
      await syncRank(first);
      await first.save();
      const payload = {
        ...buildEmbedPayload({
          title: "Boss Fight Lost",
          description: `${formatBossDialogue(state, getBossDialogueLine(state, "victory"))}\n\nThe boss held its ground. You lost XP and can challenge again any time.`,
          visual: state.visual,
        }),
        components: [],
      };
      return interaction.update(payload);
    }
  }

  if (playerWon) {
    const effects = getCombinedEffects(first);
    const loot = rollCombatLoot("pvp");
    first.stats.pvpStreak = getPvpStreak(first) + 1;
    first.stats.bestPvpStreak = Math.max(getBestPvpStreak(first), first.stats.pvpStreak);
    second.stats.pvpStreak = 0;
    const streakBonus = Math.min(Math.max(0, first.stats.pvpStreak - 1), 5) * 0.04;
    const auraReward = Math.floor(state.rewardAura * (1 + (effects.pvpRewardBoost || 0) + streakBonus));
    first.aura += auraReward;
    first.xp += state.rewardXp;
    second.xp = Math.max(0, second.xp - Math.floor(state.rewardXp / 2));
    first.stats.pvpWins += 1;
    second.stats.pvpLosses += 1;
    applyCombatLoot(first, loot);
    await applyQuestProgress(first, "pvpWins", 1);
    await syncRank(first);
    await syncRank(second);
    await first.save();
    await second.save();

    const payload = {
      ...buildEmbedPayload({
        title: "PvP Battle Finished",
        description: `**${state.playerOne.name}** won the duel in **${state.arena?.name || "the arena"}** and claimed ${formatNumber(auraReward)} aura plus ${formatNumber(state.rewardXp)} XP.`,
        visual: "pvp-victory.svg",
        fields: [
          { name: "Loot Drops", value: loot.length ? loot.map((entry) => entry.label).join(", ") : "None", inline: true },
          { name: "Win Streak", value: `${formatNumber(first.stats.pvpStreak)} current | ${formatNumber(first.stats.bestPvpStreak)} best`, inline: true },
          { name: "Aura Bonus", value: streakBonus > 0 ? `+${Math.round(streakBonus * 100)}% streak bonus` : "No streak bonus", inline: true },
        ],
      }),
      components: [],
    };
    await interaction.update(payload);
    await editBattleMirrorMessages(interaction.client, state, payload, interaction.message?.id);
    return null;
  } else {
    const effects = getCombinedEffects(second);
    const loot = rollCombatLoot("pvp");
    second.stats.pvpStreak = getPvpStreak(second) + 1;
    second.stats.bestPvpStreak = Math.max(getBestPvpStreak(second), second.stats.pvpStreak);
    first.stats.pvpStreak = 0;
    const streakBonus = Math.min(Math.max(0, second.stats.pvpStreak - 1), 5) * 0.04;
    const auraReward = Math.floor(state.rewardAura * (1 + (effects.pvpRewardBoost || 0) + streakBonus));
    second.aura += auraReward;
    second.xp += state.rewardXp;
    first.xp = Math.max(0, first.xp - Math.floor(state.rewardXp / 2));
    second.stats.pvpWins += 1;
    first.stats.pvpLosses += 1;
    applyCombatLoot(second, loot);
    await applyQuestProgress(second, "pvpWins", 1);
    await syncRank(first);
    await syncRank(second);
    await first.save();
    await second.save();

    const payload = {
      ...buildEmbedPayload({
        title: "PvP Battle Finished",
        description: `**${state.playerTwo.name}** won the duel in **${state.arena?.name || "the arena"}** and claimed ${formatNumber(auraReward)} aura plus ${formatNumber(state.rewardXp)} XP.`,
        visual: "pvp-victory.svg",
        fields: [
          { name: "Loot Drops", value: loot.length ? loot.map((entry) => entry.label).join(", ") : "None", inline: true },
          { name: "Win Streak", value: `${formatNumber(second.stats.pvpStreak)} current | ${formatNumber(second.stats.bestPvpStreak)} best`, inline: true },
          { name: "Aura Bonus", value: streakBonus > 0 ? `+${Math.round(streakBonus * 100)}% streak bonus` : "No streak bonus", inline: true },
        ],
      }),
      components: [],
    };
    await interaction.update(payload);
    await editBattleMirrorMessages(interaction.client, state, payload, interaction.message?.id);
    return null;
  }
}

async function advanceBattle(interaction, state, acting, defending, actionSummary) {
  let summary = actionSummary;
  state.exchangeCount = (state.exchangeCount || 0) + 1;

  if (defending.hp <= 0) {
    return finishBattle(interaction, state, acting.id);
  }
  if (acting.hp <= 0) {
    return finishBattle(interaction, state, defending.id);
  }

  const arenaPulse = resolveArenaPulse(state);
  if (arenaPulse.text) {
    summary += `\n${arenaPulse.text}`;
  }
  if (arenaPulse.winnerId) {
    return finishBattle(interaction, state, arenaPulse.winnerId);
  }

  if (state.isBoss) {
    const bossStart = resolveTurnStart(defending);
    if (bossStart.text) {
      summary += `\n${bossStart.text}`;
    }
    if (bossStart.defeated) {
      return finishBattle(interaction, state, acting.id);
    }
    const bossResult = resolveBossIntent(state);
    summary += `\n${bossResult.text}`;
    if (acting.hp <= 0) {
      return finishBattle(interaction, state, defending.id);
    }
    state.bossIntent = chooseBossIntent(state);
  } else {
    state.turnId = defending.id;
  }

  const nextActor = state.turnId === state.playerOne.id ? state.playerOne : state.playerTwo;
  await saveBattleSession(state);

  const resolvingPayload = {
    ...createBattleResolvingPayload(state, summary),
    components: [],
  };
  await interaction.update(resolvingPayload);
  await editBattleMirrorMessages(interaction.client, state, resolvingPayload, interaction.message?.id);
  await sleep(BATTLE_ANIMATION_DELAY_MS);

  const nextPayload = {
    ...createBattleEmbed(state.title, summary, state.visual, state),
    components: buildBattleComponents(state, nextActor),
  };
  await interaction.editReply(withBattleControlsForOwner(nextPayload, state, getBattleMessageOwnerId(state, interaction.message?.id)));
  await editBattleMirrorMessages(
    interaction.client,
    state,
    (entry) => withBattleControlsForOwner(nextPayload, state, entry.ownerId || null),
    interaction.message?.id
  );
  return null;
}

async function handleInviteButton(interaction, state, action) {
  if (isBattleExpired(state)) {
    activeBattles.delete(state.id);
    await PvpInvite.deleteOne({ battleId: state.id }).catch(() => null);
    return interaction.update({
      ...buildEmbedPayload({
        title: "PvP Invite Expired",
        description: "This duel invite expired. Send a new `/pvp` challenge to try again.",
        visual: "pvp-challenge.svg",
      }),
      components: [],
    });
  }

  if (action === "accept") {
    if (interaction.user.id !== state.opponentId) {
      return interaction.reply({ content: "Only the challenged player can accept this duel.", ephemeral: true });
    }

    const challenger = await getOrCreatePlayer(getBattleGuildIdForUser(state, state.challengerId, interaction.guildId), state.challengerId);
    const rival = await getOrCreatePlayer(getBattleGuildIdForUser(state, state.opponentId, interaction.guildId), state.opponentId);
    await PvpInvite.deleteOne({ battleId: state.id }).catch(() => null);
    state.phase = "loadout";
    state.playerOne = createLoadoutParticipant(challenger, state.challengerName);
    state.playerTwo = createLoadoutParticipant(rival, state.opponentName);
    await saveBattleSession(state);

    return interaction.update({
      ...createLoadoutEmbed(state, `${state.opponentName} accepted the duel. Both fighters can now choose gear and review battle items before the match starts.`),
      components: buildLoadoutComponents(state),
    });
  }

  if (action === "decline") {
    if (interaction.user.id !== state.opponentId) {
      return interaction.reply({ content: "Only the challenged player can decline this duel.", ephemeral: true });
    }
    activeBattles.delete(state.id);
    await PvpInvite.deleteOne({ battleId: state.id }).catch(() => null);
    return interaction.update({
      ...buildEmbedPayload({
        title: "PvP Duel Declined",
        description: `${state.opponentName} declined ${state.challengerName}'s challenge.`,
        visual: "emblem-alert.svg",
      }),
      components: [],
    });
  }

  if (interaction.user.id !== state.challengerId) {
    return interaction.reply({ content: "Only the challenger can cancel this invite.", ephemeral: true });
  }
  activeBattles.delete(state.id);
  await PvpInvite.deleteOne({ battleId: state.id }).catch(() => null);
  return interaction.update({
    ...buildEmbedPayload({
      title: "PvP Duel Cancelled",
      description: `${state.challengerName} cancelled the pending challenge.`,
      visual: "emblem-alert.svg",
    }),
    components: [],
  });
}

async function handleLoadoutButton(interaction, state, action) {
  if (![state.playerOne.id, state.playerTwo.id].includes(interaction.user.id)) {
    return interaction.reply({ content: "Only the two duelists can change this lobby.", ephemeral: true });
  }

  if (action === "cancel") {
    activeBattles.delete(state.id);
    await deleteBattleSession(state.id);
    const payload = {
      ...buildEmbedPayload({
        title: "PvP Duel Cancelled",
        description: `${interaction.user.username} cancelled the duel lobby.`,
        visual: "emblem-alert.svg",
      }),
      components: [],
    };
    await interaction.update(payload);
    await editBattleMirrorMessages(interaction.client, state, payload, interaction.message?.id);
    return null;
  }

  const fighter = state.playerOne.id === interaction.user.id ? state.playerOne : state.playerTwo;
  fighter.ready = !fighter.ready;

  if (!state.playerOne.ready || !state.playerTwo.ready) {
    await saveBattleSession(state);
    const payload = {
      ...createLoadoutEmbed(state, `${fighter.name} ${fighter.ready ? "locked in their loadout" : "unreadied to make changes"}.`),
      components: buildLoadoutComponents(state),
    };
    await interaction.update(payload);
    await editBattleMirrorMessages(interaction.client, state, payload, interaction.message?.id);
    return null;
  }

  const challenger = await getOrCreatePlayer(getBattleGuildIdForUser(state, state.playerOne.id, interaction.guildId), state.playerOne.id);
  const rival = await getOrCreatePlayer(getBattleGuildIdForUser(state, state.playerTwo.id, interaction.guildId), state.playerTwo.id);
  initializePvpBattleFromLoadout(state, challenger, rival);
  await saveBattleSession(state);

  const payload = {
    ...createBattleEmbed("PvP Duel Started", `${state.playerOne.name} and ${state.playerTwo.name} locked in their loadouts.\nArena: **${state.arena.name}**\n${state.arena.description}`, "pvp-battle.svg", state),
    components: buildBattleComponents(state, getBattleTurnActor(state)),
  };
  await interaction.update(withBattleControlsForOwner(payload, state, getBattleMessageOwnerId(state, interaction.message?.id)));
  await editBattleMirrorMessages(
    interaction.client,
    state,
    (entry) => withBattleControlsForOwner(payload, state, entry.ownerId || null),
    interaction.message?.id
  );
  return null;
}

async function handleLoadoutSelect(interaction, state, slotId) {
  if (![state.playerOne.id, state.playerTwo.id].includes(interaction.user.id)) {
    return interaction.reply({ content: "Only the duelists can change battle gear.", ephemeral: true });
  }

  const fighter = state.playerOne.id === interaction.user.id ? state.playerOne : state.playerTwo;
  const selected = interaction.values[0] === "none" ? null : interaction.values[0];
  if (selected && !fighter.availableGear?.[slotId]?.[selected]) {
    return interaction.reply({ content: "You do not own that gear option for this duel.", ephemeral: true });
  }

  fighter.loadout[slotId] = selected;
  fighter.ready = false;
  await saveBattleSession(state);

  const payload = {
    ...createLoadoutEmbed(state, `${fighter.name} updated their ${slotId} slot.`),
    components: buildLoadoutComponents(state),
  };
  await interaction.update(payload);
  await editBattleMirrorMessages(interaction.client, state, payload, interaction.message?.id);
  return null;
}

async function handleBattleButton(interaction, state, action) {
  if (interaction.user.id !== state.turnId) {
    const actor = getBattleTurnActor(state);
    return interaction.reply({ content: `It is ${actor.name}'s turn. Wait for the handoff before choosing an action.`, ephemeral: true });
  }

  const acting = state.playerOne.id === interaction.user.id ? state.playerOne : state.playerTwo;
  const defending = acting.id === state.playerOne.id ? state.playerTwo : state.playerOne;
  if (BATTLE_ACTIONS[action] && !acting.unlockedActions.includes(action)) {
    return interaction.reply({ content: "That attack style is still locked for your current progression.", ephemeral: true });
  }
  if (isBattleActionOnCooldown(state, acting, action)) {
    const remaining = getBattleActionCooldownRemaining(acting, action);
    return interaction.reply({ content: `${getBattleAction(action)?.label || "That move"} is on cooldown for ${remaining} more round${remaining === 1 ? "" : "s"}.`, ephemeral: true });
  }
  hydrateBattleSkill(acting);
  hydrateBattleSkill(defending);

  const turnStart = resolveTurnStart(acting);
  let summary = turnStart.text;
  if (turnStart.defeated) {
    return finishBattle(interaction, state, defending.id);
  }

  const playerResult = runTurn(acting, defending, action, state);
  applyBattleActionCooldown(state, acting, action);
  trackBattleTurn(acting);
  const actionText = narrateBattleAction(acting, defending, action, playerResult, state);
  summary = summary ? `${summary}\n${actionText}` : actionText;
  return advanceBattle(interaction, state, acting, defending, summary);
}

async function handleBattleItemSelect(interaction, state) {
  if (interaction.user.id !== state.turnId) {
    const actor = getBattleTurnActor(state);
    return interaction.reply({ content: `It is ${actor.name}'s turn. Wait for the handoff before using an item.`, ephemeral: true });
  }

  const acting = state.playerOne.id === interaction.user.id ? state.playerOne : state.playerTwo;
  const defending = acting.id === state.playerOne.id ? state.playerTwo : state.playerOne;
  const turnStart = resolveTurnStart(acting);
  let summary = turnStart.text;
  if (turnStart.defeated) {
    return finishBattle(interaction, state, defending.id);
  }

  const itemResult = await useBattleItem(interaction, acting, defending, interaction.values[0]);
  if (itemResult.error) {
    return interaction.reply({ content: itemResult.error, ephemeral: true });
  }

  const itemText = [
    `${acting.name} reaches into their battle kit while ${defending.name} tries to close the gap.`,
    itemResult.text,
    defending.hp > 0 ? `${defending.name} stays in the fight at ${defending.hp}/${defending.maxHp} HP.` : `${defending.name} is knocked out by the item play.`,
  ].join("\n");
  summary = summary ? `${summary}\n${itemText}` : itemText;
  return advanceBattle(interaction, state, acting, defending, summary);
}

async function handleBattleComponentInteraction(interaction) {
  const parts = interaction.customId.split(":");
  const battleId = parts.shift();
  const scope = parts.shift();
  let state = activeBattles.get(battleId);
  if (!state && scope === "invite") {
    const invite = await PvpInvite.findOne({ battleId }).lean();
    if (invite) {
      state = buildPvpInviteStateFromRecord(invite);
      activeBattles.set(battleId, state);
    }
  }
  if (!state && scope !== "invite") {
    state = await restoreBattleSession(battleId);
  }
  if (!state || isBattleExpired(state)) {
    activeBattles.delete(battleId);
    await deleteBattleSession(battleId);
    if (scope === "invite") {
      await PvpInvite.deleteOne({ battleId }).catch(() => null);
    }
    return interaction.reply({ content: "That battle session is no longer active. Start a new `/boss` or `/pvp` fight.", ephemeral: true });
  }

  state.lastActionAt = Date.now();
  await saveBattleSession(state);

  if (scope === "invite" && state.phase !== "invite") {
    return interaction.reply({ content: "That invite is no longer active.", ephemeral: true });
  }
  if ((scope === "loadout" || scope === "gear") && state.phase !== "loadout") {
    return interaction.reply({ content: "That loadout lobby is no longer active.", ephemeral: true });
  }
  if (scope === "item" && state.phase !== "battle") {
    return interaction.reply({ content: "That battle has not started yet.", ephemeral: true });
  }
  if (!["invite", "loadout", "gear", "item"].includes(scope) && state.phase !== "battle") {
    return interaction.reply({ content: "That battle has not started yet.", ephemeral: true });
  }

  if (interaction.isButton()) {
    if (scope === "invite") {
      return handleInviteButton(interaction, state, parts[0]);
    }
    if (scope === "loadout") {
      return handleLoadoutButton(interaction, state, parts[0]);
    }
    return handleBattleButton(interaction, state, scope);
  }

  if (interaction.isStringSelectMenu()) {
    if (scope === "gear") {
      return handleLoadoutSelect(interaction, state, parts[0]);
    }
    if (scope === "item") {
      return handleBattleItemSelect(interaction, state);
    }
  }

  return interaction.reply({ content: "That action is not supported for this battle.", ephemeral: true });
}

async function pruneExpiredPvpQueue() {
  await PvpMatchmakingQueue.deleteMany({ expiresAt: { $lte: new Date() } }).catch(() => null);
}

async function findQueuedPvpForUser(userId) {
  await pruneExpiredPvpQueue();
  return PvpMatchmakingQueue.findOne({ userId }).lean();
}

async function findOpenPvpQueueEntry(userId) {
  await pruneExpiredPvpQueue();
  return PvpMatchmakingQueue.findOne({ userId: { $ne: userId }, expiresAt: { $gt: new Date() } }).sort({ joinedAt: 1 }).lean();
}

function buildPvpQueueComponents(userId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`pvpqueue:leave:${userId}`).setLabel("Leave Queue").setStyle(ButtonStyle.Secondary)
    ),
  ];
}

async function handlePvpQueueButton(interaction) {
  const [, action, ownerId] = interaction.customId.split(":");
  if (action !== "leave") {
    return interaction.reply({ content: "That matchmaking action is not supported.", ephemeral: true });
  }
  if (ownerId !== interaction.user.id) {
    return interaction.reply({ content: "Only the queued player can leave from this message.", ephemeral: true });
  }

  const result = await PvpMatchmakingQueue.deleteOne({ userId: interaction.user.id });
  const description = result.deletedCount
    ? "You left the global PvP matchmaking queue."
    : "This queue entry is no longer active.";
  return interaction.update({
    ...buildEmbedPayload({ title: "PvP Matchmaking", description, visual: "emblem-pvp.svg" }),
    components: [],
  });
}

async function showPvpQueueStatus(interaction) {
  const entry = await findQueuedPvpForUser(interaction.user.id);
  if (!entry) {
    return interaction.reply({ ...buildEmbedPayload({ title: "PvP Matchmaking", description: "You are not queued. Use `/pvp` with no opponent to search globally.", visual: "emblem-pvp.svg" }), ephemeral: true });
  }
  const expiresAt = entry.expiresAt?.getTime ? entry.expiresAt.getTime() : new Date(entry.expiresAt).getTime();
  return interaction.reply({
    ...buildEmbedPayload({
      title: "PvP Matchmaking",
      description: `You are searching for a global PvP opponent. Queue expires in ${humanizeMs(Math.max(0, expiresAt - Date.now()))}.`,
      visual: "emblem-pvp.svg",
    }),
    components: buildPvpQueueComponents(interaction.user.id),
    ephemeral: true,
  });
}

async function startMatchedPvp(interaction, queuedEntry, currentUser) {
  await interaction.deferReply();
  const first = await getOrCreatePlayer(queuedEntry.guildId, queuedEntry.userId);
  const second = await getOrCreatePlayer(interaction.guildId, currentUser.id);
  if (isOnActiveExpedition(first) || isOnActiveExpedition(second)) {
    await PvpMatchmakingQueue.deleteOne({ userId: queuedEntry.userId }).catch(() => null);
    return interaction.editReply(buildEmbedPayload({ title: "Player Away", description: "The matched player is currently on an expedition, so matchmaking skipped that entry. Try `/pvp` again to keep searching.", visual: "emblem-alert.svg" }));
  }

  const battleId = crypto.randomUUID();
  const state = {
    id: battleId,
    phase: "loadout",
    isBoss: false,
    matchmade: true,
    guildId: interaction.guildId,
    playerGuildIds: {
      [queuedEntry.userId]: queuedEntry.guildId,
      [currentUser.id]: interaction.guildId,
    },
    arena: pickPvpArena(),
    createdAt: Date.now(),
    lastActionAt: Date.now(),
    playerOne: createLoadoutParticipant(first, queuedEntry.displayName),
    playerTwo: createLoadoutParticipant(second, currentUser.username),
    messages: [],
  };

  const payload = {
    ...createLoadoutEmbed(state, `${queuedEntry.displayName} and ${currentUser.username} matched through the global PvP queue. Both fighters can choose gear and ready up from their own battle message.`),
    components: buildLoadoutComponents(state),
  };

  const firstChannel = await interaction.client.channels.fetch(queuedEntry.channelId).catch(() => null);
  const queueMessage = queuedEntry.messageId
    ? await firstChannel?.messages?.fetch?.(queuedEntry.messageId).catch(() => null)
    : null;
  if (queueMessage?.editable) {
    await queueMessage.edit({
      ...buildEmbedPayload({
        title: "Global PvP Match Found",
        description: `${currentUser.username} matched with you through the global PvP queue. Your duel lobby is below.`,
        visual: "pvp-challenge.svg",
      }),
      components: [],
    }).catch(() => null);
  }

  let firstMessage = null;
  if (queuedEntry.channelId !== interaction.channelId) {
    firstMessage = await firstChannel?.send?.(payload).catch(() => null);
    if (!firstMessage) {
      await PvpMatchmakingQueue.deleteOne({ userId: queuedEntry.userId }).catch(() => null);
      return interaction.editReply(buildEmbedPayload({ title: "PvP Matchmaking", description: "The oldest queued fighter could not be reached, so they were removed from the queue. Use `/pvp` again to search for the next opponent.", visual: "emblem-alert.svg" }));
    }
    state.messages.push({ guildId: queuedEntry.guildId, channelId: firstMessage.channelId, messageId: firstMessage.id, ownerId: queuedEntry.userId });
  }

  const secondMessage = await interaction.editReply(payload);
  state.messages.push({
    guildId: interaction.guildId,
    channelId: secondMessage.channelId,
    messageId: secondMessage.id,
    ownerId: firstMessage ? currentUser.id : null,
  });

  await PvpMatchmakingQueue.deleteMany({ userId: { $in: [queuedEntry.userId, currentUser.id] } }).catch(() => null);
  activeBattles.set(battleId, state);
  await saveBattleSession(state);
  return secondMessage;
}

async function joinPvpQueue(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  if (isOnActiveExpedition(user)) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Away On Expedition", description: "You cannot join PvP matchmaking while your character is away. Use /expedition status.", visual: "emblem-alert.svg" }), ephemeral: true });
  }
  if (findBattleForUser(interaction.user.id)) {
    return interaction.reply({ ...buildEmbedPayload({ title: "PvP Busy", description: "You are already in a pending or active duel.", visual: "emblem-alert.svg" }), ephemeral: true });
  }
  if (await findQueuedPvpForUser(interaction.user.id)) {
    return showPvpQueueStatus(interaction);
  }

  const opponent = await findOpenPvpQueueEntry(interaction.user.id);
  if (opponent && !findBattleForUser(opponent.userId)) {
    return startMatchedPvp(interaction, opponent, interaction.user);
  }

  await PvpMatchmakingQueue.findOneAndUpdate(
    { userId: interaction.user.id },
    {
      $set: {
        userId: interaction.user.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        messageId: null,
        displayName: interaction.user.username,
        joinedAt: new Date(),
        expiresAt: new Date(Date.now() + PVP_MATCHMAKING_TIMEOUT_MS),
      },
    },
    { upsert: true }
  );

  const message = await interaction.reply({
    ...buildEmbedPayload({
      title: "Global PvP Matchmaking",
      description: `${interaction.user.username} entered the global PvP queue. I will match you with the next available fighter across servers.\n\nQueue expires in ${humanizeMs(PVP_MATCHMAKING_TIMEOUT_MS)}.`,
      visual: "pvp-challenge.svg",
    }),
    components: buildPvpQueueComponents(interaction.user.id),
    fetchReply: true,
  });
  await PvpMatchmakingQueue.updateOne({ userId: interaction.user.id }, { $set: { messageId: message.id } }).catch(() => null);
  return message;
}

async function handlePvp(interaction) {
  const mode = interaction.options.getString("mode");
  if (mode === "status") {
    return showPvpQueueStatus(interaction);
  }

  const opponent = interaction.options.getUser("user");
  if (!opponent) {
    return joinPvpQueue(interaction);
  }
  if (opponent.id === interaction.user.id || opponent.bot) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Invalid Opponent", description: "Choose another human player for PvP.", visual: "emblem-pvp.svg" }), ephemeral: true });
  }
  await PvpMatchmakingQueue.deleteMany({ userId: { $in: [interaction.user.id, opponent.id] } }).catch(() => null);
  const challenger = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const rival = await getOrCreatePlayer(interaction.guildId, opponent.id);
  if (isOnActiveExpedition(challenger) || isOnActiveExpedition(rival)) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Player Away", description: "One of these players is currently on an expedition and cannot duel yet.", visual: "emblem-alert.svg" }), ephemeral: true });
  }
  const existingBattle = findBattleForUser(interaction.user.id) || findBattleForUser(opponent.id);
  if (existingBattle) {
    return interaction.reply({ ...buildEmbedPayload({ title: "PvP Busy", description: "One of these players is already in a pending or active duel.", visual: "emblem-alert.svg" }), ephemeral: true });
  }

  const battleId = crypto.randomUUID();
  const state = {
    id: battleId,
    phase: "invite",
    isBoss: false,
    challengerId: interaction.user.id,
    challengerName: interaction.user.username,
    opponentId: opponent.id,
    opponentName: opponent.username,
    guildId: interaction.guildId,
    playerGuildIds: {
      [interaction.user.id]: interaction.guildId,
      [opponent.id]: interaction.guildId,
    },
    arena: pickPvpArena(),
    createdAt: Date.now(),
    lastActionAt: Date.now(),
    inviteExpiresAt: Date.now() + PVP_INVITE_TIMEOUT_MS,
  };
  activeBattles.set(battleId, state);

  const message = await interaction.reply({
    ...buildEmbedPayload({
      title: "PvP Duel Invite",
      description: `${interaction.user.username} challenged ${opponent.username}.\nArena: **${state.arena.name}**\n${state.arena.description}\n\n${opponent.username} must accept within 2 minutes before the invite expires.`,
      visual: "pvp-challenge.svg",
      footer: "After accepting, both players can choose gear and review battle items before the first turn.",
    }),
    components: buildInviteComponents(battleId),
    fetchReply: true,
  });

  state.channelId = message.channelId;
  state.messageId = message.id;
  state.messages = [{ guildId: interaction.guildId, channelId: message.channelId, messageId: message.id }];
  await PvpInvite.findOneAndUpdate(
    { battleId },
    {
      $set: {
        battleId,
        guildId: interaction.guildId,
        channelId: message.channelId,
        messageId: message.id,
        challengerId: state.challengerId,
        challengerName: state.challengerName,
        opponentId: state.opponentId,
        opponentName: state.opponentName,
        arena: state.arena,
        inviteExpiresAt: new Date(state.inviteExpiresAt),
        createdAt: new Date(state.createdAt),
      },
    },
    { upsert: true }
  );
  setTimeout(() => {
    expirePvpInvite(interaction.client, battleId).catch((error) => {
      console.error("Failed to expire PvP invite:", error);
    });
  }, PVP_INVITE_TIMEOUT_MS + 1000);

  return message;
}

async function handleBoss(interaction) {
  const bossId = interaction.options.getString("boss") || BOSSES[0].id;
  const boss = BOSSES.find((entry) => entry.id === bossId) || BOSSES[0];
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  if (isOnActiveExpedition(user)) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Away On Expedition", description: "You cannot start a boss fight while your character is away. Use /expedition status.", visual: "emblem-alert.svg" }), ephemeral: true });
  }
  const remaining = getCooldownRemaining(user.lastBossAt, COOLDOWNS.bossMs, user);
  if (remaining > 0) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Boss Cooling Down", description: `You can challenge another boss in ${humanizeMs(remaining)}.`, visual: "emblem-alert.svg" }), ephemeral: true });
  }
  const battleId = crypto.randomUUID();
  const state = {
    id: battleId,
    title: "Boss Encounter",
    isBoss: true,
    phase: "battle",
    visual: boss.visual,
    createdAt: Date.now(),
    lastActionAt: Date.now(),
    playerOne: createBattleFighter({ id: interaction.user.id, name: interaction.user.username, hp: 120, maxHp: 120, skillCycle: getBattleSkillRotation(user), loadout: normalizeBattleLoadout(user, user.equippedGear), gearOwner: user, combatItems: getPlayerCombatInventory(user), unlockedActions: getUnlockedBattleActions(user), premiumBattleBonus: getPremiumBattleBonus(user) }),
    playerTwo: createBattleFighter({ id: `boss:${boss.id}`, name: getBossLabel(boss), hp: boss.hp, maxHp: boss.hp, skillCycle: ["focus"], critBoost: 0.12 }),
    turnId: interaction.user.id,
    rewardAura: boss.rewardAura,
    rewardXp: boss.rewardXp,
    exchangeCount: 0,
  };
  state.bossIntent = chooseBossIntent(state);
  state.playerTwo.skill.heal = 0;
  user.lastBossAt = new Date();
  await user.save();
  activeBattles.set(battleId, state);
  await saveBattleSession(state);
  return interaction.reply({
    ...createBattleEmbed("Boss Encounter", `You challenged **${getBossLabel(boss)}**.\n${getBossCraftingHint(boss)}`, boss.visual, state),
    components: buildBattleComponents(state, state.playerOne),
  });
}

async function handleSkills(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const skillLines = user.skills.map((skillId) => `**${getSkillLabel(skillId)}**\n${SKILLS[skillId].description}`).join("\n\n");
  return interaction.reply(buildEmbedPayload({
    title: "Combat Kit",
    description: "Skills come from items and crates. Attack styles unlock automatically as your rank and prestige rise.",
    visual: "help-skills.svg",
    fields: [
      { name: "Skills", value: skillLines || "No skills unlocked yet." },
      { name: "Attack Styles", value: formatBattleActionProgress(user) },
      { name: "Current Loadout", value: `Unlocked attacks: ${formatBattleActionList(getUnlockedBattleActions(user))}` },
    ],
    footer: "Rank up and prestige to unlock more attack buttons in PvP and boss fights.",
  }));
}

async function handleHelp(interaction) {
  const categoryId = interaction.options.getString("category");

  if (categoryId) {
    const section = getHelpSection(categoryId);
    if (!section) {
      return interaction.reply({ content: "Unknown help category.", ephemeral: true });
    }

    return interaction.reply({
      ...buildEmbedPayload({
        title: `${section.name} Commands`,
        description: formatHelpSection(section),
        visual: section.visual,
        footer: "Use /start to create a save and see the quick-start path.",
      }),
      ephemeral: true,
    });
  }

  return interaction.reply({
    ...buildEmbedPayload({
      title: "Help Categories",
      description: "Browse commands by category instead of scrolling through one long list.",
      visual: "help-summary.svg",
      fields: [
        { name: "Categories", value: formatHelpOverview() },
        { name: "Quick Start", value: "`/start`, `/work`, `/daily`, `/profile`, `/help category:getting_started`" },
      ],
      footer: "Use /help category:<name> to open a specific command group.",
    }),
    ephemeral: true,
  });
}

async function handleSetup(interaction) {
  if (!hasSetupAccess(interaction.memberPermissions)) {
    return interaction.reply({
      ...buildEmbedPayload({
        title: "Setup Locked",
        description: "Only admins or moderators can use `/setup` to choose the Aurix channel.",
        visual: "emblem-alert.svg",
      }),
      ephemeral: true,
    });
  }

  const optionChannel = interaction.options.getChannel("channel");
  let selectedChannel = optionChannel || interaction.channel;
  if (!selectedChannel?.isTextBased?.()) {
    selectedChannel = await interaction.guild.channels.fetch(optionChannel?.id || interaction.channelId).catch(() => null);
  }
  if (selectedChannel?.isThread?.() && selectedChannel.parentId) {
    selectedChannel = await interaction.guild.channels.fetch(selectedChannel.parentId).catch(() => selectedChannel);
  }

  if (!selectedChannel?.isTextBased?.() || selectedChannel.isThread?.()) {
    return interaction.reply({
      ...buildEmbedPayload({
        title: "Setup Channel Invalid",
        description: "Run `/setup` inside a normal text channel, or use `/setup channel:#aurix` and choose a text channel.",
        visual: "emblem-alert.svg",
      }),
      ephemeral: true,
    });
  }

  const botMember = interaction.guild.members.me || await interaction.guild.members.fetchMe().catch(() => null);
  const permissions = selectedChannel.permissionsFor(botMember);
  if (!permissions?.has(PermissionsBitField.Flags.ViewChannel) || !permissions?.has(PermissionsBitField.Flags.SendMessages)) {
    return interaction.reply({
      ...buildEmbedPayload({
        title: "Setup Channel Blocked",
        description: `I need View Channel and Send Messages permission in ${selectedChannel}.`,
        visual: "emblem-alert.svg",
      }),
      ephemeral: true,
    });
  }

  await setAurixChannel(interaction.guildId, selectedChannel.id, interaction.user.id);
  const payload = buildServerSetupPayload(interaction.guild?.name || "this server");
  if (selectedChannel.id === interaction.channelId) {
    return interaction.reply(payload);
  }

  await selectedChannel.send(payload);
  return interaction.reply({
    ...buildEmbedPayload({
      title: "Setup Completed",
      description: `Aurix is now configured to use ${selectedChannel}. I posted the short starter guide there. Commands used elsewhere will point members back here.`,
      visual: "emblem-success.svg",
    }),
    ephemeral: true,
  });
}

async function handlePremium(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const activePlan = getUserPremiumPlan(user);
  return interaction.reply({
    ...buildEmbedPayload({
      title: "Aurix Premium",
      description: [
        `Status: **${formatPremiumStatus(user)}**`,
        `Active plan: **${activePlan ? `${activePlan.label} (${activePlan.priceLabel})` : "None"}**`,
        `Get premium: ${PREMIUM_PURCHASE_URL}`,
        "",
        "Login with Discord on the site before buying so premium links to your account.",
      ].join("\n"),
      visual: "emblem-success.svg",
      fields: [
        { name: "Member Features", value: buildPremiumFeatureSummary() },
        { name: "Premium Chest", value: activePlan ? `Use /premium-chest every ${activePlan.chestCooldownHours}h.` : "Unlocks recurring loot for members.", inline: true },
        { name: "Garden", value: activePlan ? `${getPremiumGardenPlotLimit(user)} total plots` : "Premium unlocks 3-4 total plots", inline: true },
      ],
    }),
    ephemeral: true,
  });
}

async function handleLeaderboard(interaction) {
  const category = interaction.options.getString("category", true);
  const scope = interaction.options.getString("scope") || "global";
  const serverOnly = scope === "server";
  if (category === "clans") {
    const rawClans = await Clan.find(buildClanLeaderboardFilter(interaction.guildId)).sort({ trophies: -1 });
    const clans = [];
    for (const clan of rawClans) {
      if (!serverOnly) {
        clans.push(clan);
      } else {
        const hasServerMember = await Promise.any(
          clan.memberIds.map((memberId) => isUserInGuild(interaction.guild, memberId).then((exists) => exists ? true : Promise.reject()))
        ).catch(() => false);
        if (hasServerMember) {
          clans.push(clan);
        }
      }
      if (clans.length >= 10) {
        break;
      }
    }
    const lines = clans.length ? clans.map((clan, index) => `${index + 1}. **${clan.name}** - ${formatNumber(clan.trophies)} trophies - ${clan.memberIds.length} members`).join("\n") : "No clans created yet.";
    return interaction.reply(buildEmbedPayload({ title: `${serverOnly ? "Server" : "Global"} Clan Leaderboard`, description: lines, visual: "clan-top.svg" }));
  }

  const sortMap = { aura: { aura: -1 }, xp: { xp: -1 }, prestige: { prestige: -1, xp: -1 }, vault: { vaultAura: -1 } };
  let users;
  if (isGlobalPlayerDataEnabled() || serverOnly) {
    const rawUsers = await User.find(buildPlayerLeaderboardFilter(interaction.guildId)).sort({ ...(sortMap[category] || { aura: -1 }), updatedAt: -1 });
    const seenUserIds = new Set();
    users = [];
    for (const player of rawUsers) {
      if (seenUserIds.has(player.userId)) {
        continue;
      }
      seenUserIds.add(player.userId);
      if (serverOnly && !(await isUserInGuild(interaction.guild, player.userId))) {
        continue;
      }
      users.push(player);
      if (users.length >= 10) {
        break;
      }
    }
  } else {
    users = await User.find(buildPlayerLeaderboardFilter(interaction.guildId)).sort(sortMap[category] || { aura: -1 }).limit(10);
  }
  const members = await Promise.all(users.map(async (player) => {
    const member = await interaction.client.users.fetch(player.userId).catch(() => null);
    return { player, name: member?.username || player.userId };
  }));
  const lines = members.map((entry, index) => {
    const value = category === "xp" ? `${formatNumber(entry.player.xp)} XP` : category === "prestige" ? `${entry.player.prestige} prestige` : category === "vault" ? `${formatNumber(entry.player.vaultAura)} vault aura` : `${formatNumber(entry.player.aura)} aura`;
    return `${index + 1}. **${entry.name}** - ${value}`;
  }).join("\n");
  return interaction.reply(buildEmbedPayload({ title: `${serverOnly ? "Server" : "Global"} Player Leaderboard`, description: lines || "No player data yet.", visual: "help-summary.svg" }));
}

async function handleClan(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const currentClanId = getGuildClanId(user, interaction.guildId);
  const clanCreateCost = 50000;
  const clanRaidCooldownMs = 45 * 60 * 1000;

  if (subcommand === "create") {
    if (currentClanId) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Already In Clan", description: "Leave your current clan before creating another one.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    if (user.aura < clanCreateCost) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Clan Creation Locked", description: `Creating a clan costs **${formatNumber(clanCreateCost)} aura**. Keep farming and try again.`, visual: "clan-hall.svg" }), ephemeral: true });
    }
    const name = interaction.options.getString("name", true);
    const code = await generateClanCode(name, interaction.guildId);
    const clan = await Clan.create(buildClanCreateData(interaction.guildId, { name, code, ownerId: interaction.user.id, memberIds: [interaction.user.id] }));
    addClanLog(clan, "create", interaction.user.id, `Created the clan with invite code ${code}.`);
    user.aura -= clanCreateCost;
    setGuildClanId(user, interaction.guildId, clan._id);
    await clan.save();
    await user.save();
    return interaction.reply(buildEmbedPayload({
      title: "Clan Created",
      description: `**${name}** is live. Invite code: **${code}**`,
      visual: "clan-hall.svg",
      fields: [
        { name: "Creation Cost", value: `${formatNumber(clanCreateCost)} aura`, inline: true },
        { name: "Wallet Left", value: `${formatNumber(user.aura)} aura`, inline: true },
      ],
    }));
  }

  if (subcommand === "join") {
    if (currentClanId) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Already In Clan", description: "Leave your current clan before joining another one.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    const code = interaction.options.getString("code", true);
    const clan = await Clan.findOne(buildClanLookup(interaction.guildId, code));
    if (!clan) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Clan Not Found", description: "That clan invite code is invalid.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    ensureClanState(clan);
    if (clan.memberIds.length >= getClanMemberCap(clan)) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Clan Full", description: "That clan has reached its member cap. Upgrade the hall to invite more players.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    if (!clan.memberIds.includes(interaction.user.id)) {
      clan.memberIds.push(interaction.user.id);
    }
    clan.pendingApplicantIds = clan.pendingApplicantIds.filter((id) => id !== interaction.user.id);
    addClanLog(clan, "join", interaction.user.id, "Joined through the clan invite code.");
    setGuildClanId(user, interaction.guildId, clan._id);
    await clan.save();
    await user.save();
    return interaction.reply(buildEmbedPayload({ title: "Clan Joined", description: `You joined **${clan.name}**.`, visual: "clan-hall.svg" }));
  }

  if (subcommand === "apply") {
    if (currentClanId) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Already In Clan", description: "Leave your current clan before applying to another one.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    const code = interaction.options.getString("code", true);
    const clan = await Clan.findOne(buildClanLookup(interaction.guildId, code));
    if (!clan) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Clan Not Found", description: "That clan invite code is invalid.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    ensureClanState(clan);
    if (clan.memberIds.length >= getClanMemberCap(clan)) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Clan Full", description: "That clan has reached its member cap already.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    if (clan.pendingApplicantIds.includes(interaction.user.id)) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Application Pending", description: `Your request to join **${clan.name}** is already waiting for approval.`, visual: "clan-hall.svg" }), ephemeral: true });
    }

    clan.pendingApplicantIds.push(interaction.user.id);
    addClanLog(clan, "apply", interaction.user.id, "Submitted a clan join request.");
    await clan.save();
    return interaction.reply(buildEmbedPayload({
      title: "Clan Application Sent",
      description: `Your request to join **${clan.name}** has been submitted to the clan leaders.`,
      visual: "clan-hall.svg",
    }));
  }

  if (subcommand === "leave") {
    if (!currentClanId) {
      return interaction.reply({ ...buildEmbedPayload({ title: "No Clan", description: "You are not in a clan right now.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    const clan = await Clan.findById(currentClanId);
    if (clan) {
      if (clan.ownerId === interaction.user.id && clan.memberIds.length > 1) {
        return interaction.reply({ ...buildEmbedPayload({ title: "Owner Cannot Leave Yet", description: "Kick or transfer out the other members before the clan owner leaves.", visual: "clan-hall.svg" }), ephemeral: true });
      }
      clan.memberIds = clan.memberIds.filter((id) => id !== interaction.user.id);
      clan.officerIds = clan.officerIds.filter((id) => id !== interaction.user.id);
      addClanLog(clan, "leave", interaction.user.id, "Left the clan.");
      if (clan.memberIds.length === 0) {
        await Clan.deleteOne({ _id: clan._id });
      } else {
        await clan.save();
      }
    }
    setGuildClanId(user, interaction.guildId, null);
    await user.save();
    return interaction.reply(buildEmbedPayload({ title: "Clan Left", description: "You left your clan.", visual: "clan-hall.svg" }));
  }

  if (!currentClanId) {
    return interaction.reply({ ...buildEmbedPayload({ title: "No Clan", description: "Create or join a clan first.", visual: "clan-hall.svg" }), ephemeral: true });
  }

  const clan = await Clan.findById(currentClanId);
  if (!clan) {
    setGuildClanId(user, interaction.guildId, null);
    await user.save();
    return interaction.reply({ ...buildEmbedPayload({ title: "Clan Missing", description: "Your clan record was missing and has been reset.", visual: "clan-hall.svg" }), ephemeral: true });
  }
  ensureClanState(clan);
  const vaultCapacity = getClanVaultCapacity(clan);
  const memberCap = getClanMemberCap(clan);
  const isOwner = clan.ownerId === interaction.user.id;
  const isManager = isClanOfficer(clan, interaction.user.id);

  if (subcommand === "info") {
    const owner = await interaction.client.users.fetch(clan.ownerId).catch(() => null);
    return interaction.reply(buildEmbedPayload({
      title: `${clan.name} Clan Hall`,
      description: `Invite code: **${clan.code}**`,
      visual: "clan-hall.svg",
      fields: [
        { name: "Owner", value: owner?.username || clan.ownerId, inline: true },
        { name: "Level", value: `${clan.level}`, inline: true },
        { name: "Members", value: `${clan.memberIds.length}`, inline: true },
        { name: "Member Cap", value: `${memberCap}`, inline: true },
        { name: "Vault", value: `${formatNumber(clan.vaultAura)} aura`, inline: true },
        { name: "Vault Capacity", value: `${formatNumber(vaultCapacity)} aura`, inline: true },
        { name: "Trophies", value: `${formatNumber(clan.trophies)}`, inline: true },
        { name: "Upgrades", value: `Hall ${clan.upgrades.hall} | Vault ${clan.upgrades.vault} | Arsenal ${clan.upgrades.arsenal}` },
        { name: "Officers", value: `${clan.officerIds.length}`, inline: true },
        { name: "Pending Applications", value: `${clan.pendingApplicantIds.length}`, inline: true },
        { name: "Raid Record", value: `${clan.raidWins}W - ${clan.raidLosses}L`, inline: true },
        { name: "War Record", value: `${clan.wins}W - ${clan.losses}L`, inline: true },
      ],
    }));
  }

  if (subcommand === "members") {
    const members = await Promise.all(clan.memberIds.map(async (memberId) => {
      const member = await interaction.client.users.fetch(memberId).catch(() => null);
      const label = member?.username || memberId;
      return `${label} (${getClanRoleLabel(clan, memberId)})`;
    }));

    return interaction.reply(buildEmbedPayload({
      title: `${clan.name} Members`,
      description: members.length ? members.map((memberName, index) => `${index + 1}. ${memberName}`).join("\n") : "No members found.",
      visual: "clan-hall.svg",
      footer: `Total members: ${clan.memberIds.length}`,
    }));
  }

  if (subcommand === "log") {
    return interaction.reply(buildEmbedPayload({
      title: `${clan.name} Activity Log`,
      description: await formatClanLogEntries(interaction, clan),
      visual: "help-clans.svg",
      footer: "Showing up to the 20 most recent clan events.",
    }));
  }

  if (subcommand === "kick") {
    if (!isManager) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Leader Only", description: "Only the clan owner or officers can kick members.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    const target = interaction.options.getUser("user", true);
    if (target.id === clan.ownerId) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Kick Blocked", description: "The clan owner cannot kick themselves.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    if (!isOwner && clan.officerIds.includes(target.id)) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Kick Blocked", description: "Only the clan owner can remove another officer.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    if (!clan.memberIds.includes(target.id)) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Member Not Found", description: "That user is not in your clan.", visual: "clan-hall.svg" }), ephemeral: true });
    }

    clan.memberIds = clan.memberIds.filter((id) => id !== target.id);
    clan.officerIds = clan.officerIds.filter((id) => id !== target.id);
    const targetProfile = await getOrCreatePlayer(interaction.guildId, target.id);
    setGuildClanId(targetProfile, interaction.guildId, null);
    addClanLog(clan, "kick", interaction.user.id, "Removed a clan member.", target.id);
    await clan.save();
    await targetProfile.save();
    return interaction.reply(buildEmbedPayload({
      title: "Member Removed",
      description: `${target.username} was removed from **${clan.name}**.`,
      visual: "clan-hall.svg",
      footer: `Members left: ${clan.memberIds.length}`,
    }));
  }

  if (subcommand === "approve") {
    if (!isManager) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Leader Only", description: "Only the clan owner or officers can approve applicants.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    const target = interaction.options.getUser("user", true);
    if (!clan.pendingApplicantIds.includes(target.id)) {
      return interaction.reply({ ...buildEmbedPayload({ title: "No Application Found", description: "That user does not have a pending clan application.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    if (clan.memberIds.length >= memberCap) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Clan Full", description: "Upgrade the hall before approving more members.", visual: "clan-hall.svg" }), ephemeral: true });
    }

    const targetProfile = await getOrCreatePlayer(interaction.guildId, target.id);
    const targetClanId = getGuildClanId(targetProfile, interaction.guildId);
    if (targetClanId && String(targetClanId) !== String(clan._id)) {
      clan.pendingApplicantIds = clan.pendingApplicantIds.filter((id) => id !== target.id);
      await clan.save();
      return interaction.reply({ ...buildEmbedPayload({ title: "Approval Failed", description: "That player already joined a different clan.", visual: "clan-hall.svg" }), ephemeral: true });
    }

    clan.pendingApplicantIds = clan.pendingApplicantIds.filter((id) => id !== target.id);
    if (!clan.memberIds.includes(target.id)) {
      clan.memberIds.push(target.id);
    }
    setGuildClanId(targetProfile, interaction.guildId, clan._id);
    addClanLog(clan, "approve", interaction.user.id, "Approved a pending clan application.", target.id);
    await clan.save();
    await targetProfile.save();
    return interaction.reply(buildEmbedPayload({
      title: "Applicant Approved",
      description: `${target.username} has joined **${clan.name}**.`,
      visual: "clan-hall.svg",
      footer: `Members: ${clan.memberIds.length} / ${memberCap}`,
    }));
  }

  if (subcommand === "decline") {
    if (!isManager) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Leader Only", description: "Only the clan owner or officers can decline applicants.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    const target = interaction.options.getUser("user", true);
    if (!clan.pendingApplicantIds.includes(target.id)) {
      return interaction.reply({ ...buildEmbedPayload({ title: "No Application Found", description: "That user does not have a pending clan application.", visual: "clan-hall.svg" }), ephemeral: true });
    }

    clan.pendingApplicantIds = clan.pendingApplicantIds.filter((id) => id !== target.id);
    addClanLog(clan, "decline", interaction.user.id, "Declined a pending clan application.", target.id);
    await clan.save();
    return interaction.reply(buildEmbedPayload({
      title: "Applicant Declined",
      description: `${target.username}'s request to join **${clan.name}** was declined.`,
      visual: "clan-hall.svg",
    }));
  }

  if (subcommand === "role") {
    if (!isOwner) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Owner Only", description: "Only the clan owner can manage officer roles.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    const target = interaction.options.getUser("user", true);
    const role = interaction.options.getString("role", true);
    if (target.id === clan.ownerId) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Role Update Blocked", description: "The clan owner role is transferred with `/clan transfer`, not `/clan role`.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    if (!clan.memberIds.includes(target.id)) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Member Not Found", description: "That user is not in your clan.", visual: "clan-hall.svg" }), ephemeral: true });
    }

    if (role === "officer") {
      if (!clan.officerIds.includes(target.id)) {
        clan.officerIds.push(target.id);
      }
    } else {
      clan.officerIds = clan.officerIds.filter((id) => id !== target.id);
    }

    addClanLog(clan, "role", interaction.user.id, `Set clan role to ${role}.`, target.id);
    await clan.save();
    return interaction.reply(buildEmbedPayload({
      title: "Clan Role Updated",
      description: `${target.username} is now set to **${role === "officer" ? "Officer" : "Member"}** in **${clan.name}**.`,
      visual: "clan-hall.svg",
    }));
  }

  if (subcommand === "transfer") {
    if (!isOwner) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Owner Only", description: "Only the current clan owner can transfer leadership.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    const target = interaction.options.getUser("user", true);
    if (target.id === clan.ownerId) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Transfer Blocked", description: "That user already owns the clan.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    if (!clan.memberIds.includes(target.id)) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Member Not Found", description: "Transfer leadership only to an existing clan member.", visual: "clan-hall.svg" }), ephemeral: true });
    }

    clan.ownerId = target.id;
    clan.officerIds = clan.officerIds.filter((id) => id !== target.id);
    addClanLog(clan, "transfer", interaction.user.id, "Transferred clan ownership.", target.id);
    await clan.save();
    return interaction.reply(buildEmbedPayload({
      title: "Leadership Transferred",
      description: `${target.username} is now the owner of **${clan.name}**.`,
      visual: "clan-hall.svg",
    }));
  }

  if (subcommand === "disband") {
    if (!isOwner) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Owner Only", description: "Only the clan owner can disband the clan.", visual: "clan-hall.svg" }), ephemeral: true });
    }

    await User.updateMany(buildClanMembershipFilter(interaction.guildId, clan._id), buildClanMembershipClearUpdate(interaction.guildId));
    await Clan.deleteOne({ _id: clan._id });
    setGuildClanId(user, interaction.guildId, null);
    await user.save();
    return interaction.reply(buildEmbedPayload({
      title: "Clan Disbanded",
      description: `**${clan.name}** was disbanded and all members were released.`,
      visual: "clan-hall.svg",
    }));
  }

  if (subcommand === "donate") {
    const amount = interaction.options.getInteger("amount", true);
    if (amount <= 0 || amount > user.aura) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Donation Failed", description: "Donate an amount inside your wallet balance.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    const spaceRemaining = Math.max(0, vaultCapacity - clan.vaultAura);
    if (spaceRemaining <= 0) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Clan Vault Full", description: "Upgrade the vault before depositing more aura.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    if (amount > spaceRemaining) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Donation Too Large", description: `Your clan vault only has room for **${formatNumber(spaceRemaining)} aura** right now.`, visual: "clan-hall.svg" }), ephemeral: true });
    }
    user.aura -= amount;
    clan.vaultAura += amount;
    addClanLog(clan, "donate", interaction.user.id, `Donated ${formatNumber(amount)} aura to the clan vault.`);
    await user.save();
    await clan.save();
    return interaction.reply(buildEmbedPayload({
      title: "Clan Donation Sent",
      description: `You donated ${formatNumber(amount)} aura to **${clan.name}**.`,
      visual: "clan-hall.svg",
      fields: [
        { name: "Clan Vault", value: `${formatNumber(clan.vaultAura)} / ${formatNumber(vaultCapacity)}`, inline: true },
      ],
    }));
  }

  if (subcommand === "upgrade") {
    if (!isOwner) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Owner Only", description: "Only the clan owner can buy clan upgrades.", visual: "clan-hall.svg" }), ephemeral: true });
    }
    const path = interaction.options.getString("path", true);
    const cost = getClanUpgradeCost(clan, path);
    if (clan.vaultAura < cost) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Upgrade Locked", description: `Your clan vault needs **${formatNumber(cost)} aura** for that upgrade.`, visual: "clan-hall.svg" }), ephemeral: true });
    }

    clan.vaultAura -= cost;
    clan.upgrades[path] += 1;
    if (path === "hall") {
      clan.level += 1;
    }
    addClanLog(clan, "upgrade", interaction.user.id, `Upgraded ${path} for ${formatNumber(cost)} aura.`);
    await clan.save();
    return interaction.reply(buildEmbedPayload({
      title: "Clan Upgrade Complete",
      description: `**${path}** was upgraded for **${formatNumber(cost)} aura**.`,
      visual: "clan-top.svg",
      fields: [
        { name: "New Level", value: path === "hall" ? `${clan.level}` : `${clan.upgrades[path]}`, inline: true },
        { name: "Vault Left", value: `${formatNumber(clan.vaultAura)} aura`, inline: true },
      ],
    }));
  }

  if (subcommand === "raid") {
    const remaining = getCooldownRemaining(clan.lastRaidAt, clanRaidCooldownMs);
    if (remaining > 0) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Raid Cooling Down", description: `Your clan can raid again in ${humanizeMs(remaining)}.`, visual: "clan-war.svg" }), ephemeral: true });
    }

    const clanPower = getClanPower(clan) + randInt(20, 120);
    const enemyPower = clan.level * 95 + clan.upgrades.arsenal * 65 + randInt(80, 220);
    const won = clanPower >= enemyPower;
    const auraReward = randInt(2500, 7000) + clan.upgrades.hall * 400 + clan.upgrades.arsenal * 550;
    const trophyReward = randInt(15, 35) + clan.upgrades.arsenal * 3;
    const xpReward = randInt(180, 360) + clan.level * 40;
    clan.lastRaidAt = new Date();

    if (won) {
      clan.raidWins += 1;
      clan.trophies += trophyReward;
      clan.vaultAura = Math.min(vaultCapacity, clan.vaultAura + auraReward);
      user.xp += xpReward;
      await syncRank(user);
    } else {
      clan.raidLosses += 1;
      clan.trophies = Math.max(0, clan.trophies - Math.floor(trophyReward / 2));
      user.xp = Math.max(0, user.xp - Math.floor(xpReward / 3));
      await syncRank(user);
    }

    addClanLog(clan, "raid", interaction.user.id, won ? `Won a clan raid for ${formatNumber(auraReward)} aura and ${formatNumber(trophyReward)} trophies.` : `Lost a clan raid and dropped ${formatNumber(Math.floor(trophyReward / 2))} trophies.`);
    await clan.save();
    await user.save();
    return interaction.reply(buildEmbedPayload({
      title: won ? "Clan Raid Victory" : "Clan Raid Failed",
      description: won ? `**${clan.name}** cleared the raid and hauled back supplies.` : `**${clan.name}** was pushed back during the raid attempt.`,
      visual: "clan-war.svg",
      fields: [
        { name: "Clan Power", value: `${formatNumber(clanPower)}`, inline: true },
        { name: "Enemy Power", value: `${formatNumber(enemyPower)}`, inline: true },
        { name: "Trophies", value: `${won ? "+" : "-"}${formatNumber(won ? trophyReward : Math.floor(trophyReward / 2))}`, inline: true },
        { name: "Clan Vault", value: won ? `${formatNumber(clan.vaultAura)} / ${formatNumber(vaultCapacity)}` : `${formatNumber(clan.vaultAura)} / ${formatNumber(vaultCapacity)}`, inline: true },
        { name: "Your XP", value: `${won ? "+" : "-"}${formatNumber(won ? xpReward : Math.floor(xpReward / 3))}`, inline: true },
      ],
      footer: won ? `Vault reward added up to capacity. Raid aura rolled: ${formatNumber(auraReward)}.` : "Regroup, upgrade, and try again after the cooldown.",
    }));
  }

  if (subcommand === "war") {
    const enemyCode = interaction.options.getString("enemy", true);
    const enemy = await Clan.findOne(buildClanLookup(interaction.guildId, enemyCode));
    if (!enemy || String(enemy._id) === String(clan._id)) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Invalid Rival Clan", description: "Choose a different valid clan code.", visual: "clan-war.svg" }), ephemeral: true });
    }
    ensureClanState(enemy);
    const clanPower = getClanPower(clan) + randInt(20, 100);
    const enemyPower = getClanPower(enemy) + randInt(20, 100);
    const won = clanPower >= enemyPower;
    const trophySwing = randInt(12, 28);
    const auraSwing = randInt(400, 1000);
    const enemyVaultCapacity = getClanVaultCapacity(enemy);

    if (won) {
      clan.trophies += trophySwing;
      clan.wins += 1;
      enemy.trophies = Math.max(0, enemy.trophies - Math.floor(trophySwing / 2));
      enemy.losses += 1;
      clan.vaultAura = Math.min(vaultCapacity, clan.vaultAura + auraSwing);
      addClanLog(clan, "war", interaction.user.id, `Defeated ${enemy.name} and gained ${formatNumber(trophySwing)} trophies.`);
      addClanLog(enemy, "war", interaction.user.id, `Lost a war against ${clan.name}.`);
    } else {
      enemy.trophies += trophySwing;
      enemy.wins += 1;
      clan.trophies = Math.max(0, clan.trophies - Math.floor(trophySwing / 2));
      clan.losses += 1;
      enemy.vaultAura = Math.min(enemyVaultCapacity, enemy.vaultAura + Math.floor(auraSwing / 2));
      addClanLog(clan, "war", interaction.user.id, `Lost a war against ${enemy.name}.`);
      addClanLog(enemy, "war", interaction.user.id, `Defeated ${clan.name} and gained ${formatNumber(trophySwing)} trophies.`);
    }

    await clan.save();
    await enemy.save();
    return interaction.reply(buildEmbedPayload({
      title: "Clan War Resolved",
      description: won ? `**${clan.name}** beat **${enemy.name}**.` : `**${clan.name}** fell to **${enemy.name}**.`,
      visual: "clan-war.svg",
      fields: [
        { name: "Trophies", value: `${won ? "+" : "-"}${formatNumber(trophySwing)}`, inline: true },
        { name: "Clan Vault", value: won ? `+${formatNumber(auraSwing)} aura` : "No aura captured", inline: true },
      ],
    }));
  }

  return interaction.reply({ content: "Unsupported clan command.", ephemeral: true });
}

async function handleAuthority(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  if (user.rankIndex < 2) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Authority Locked", description: "You need rank Riftkeeper or higher to use rank-only commands.", visual: "emblem-alert.svg" }), ephemeral: true });
  }
  const remaining = getCooldownRemaining(user.lastAuthorityAt, COOLDOWNS.authorityMs, user);
  if (remaining > 0) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Authority Cooling Down", description: `You can use this again in ${humanizeMs(remaining)}.`, visual: "emblem-help.svg" }), ephemeral: true });
  }

  const target = interaction.options.getUser("user", true);
  const targetProfile = await getOrCreatePlayer(interaction.guildId, target.id);
  const auraGain = 150 + user.rankIndex * 50;
  const xpGain = 100 + user.rankIndex * 35;
  targetProfile.aura += auraGain;
  targetProfile.xp += xpGain;
  user.lastAuthorityAt = new Date();
  await syncRank(targetProfile);
  await targetProfile.save();
  await user.save();

  return interaction.reply(buildEmbedPayload({
    title: "Rank Blessing Used",
    description: `${interaction.user.username} blessed ${target.username} with rank authority.`,
    visual: "emblem-success.svg",
    fields: [
      { name: "Aura Granted", value: `${formatNumber(auraGain)}`, inline: true },
      { name: "XP Granted", value: `${formatNumber(xpGain)}`, inline: true },
      { name: "Requirement", value: "Rank-only command", inline: true },
    ],
  }));
}

function buildCommands() {
  return [
    new SlashCommandBuilder().setName("help").setDescription("Browse game commands by category.").addStringOption((option) => option.setName("category").setDescription("Open one help category").addChoices(...HELP_SECTIONS.map((section) => ({ name: section.name, value: section.id })))),
    new SlashCommandBuilder().setName("event").setDescription("View the current rotating world event."),
    new SlashCommandBuilder().setName("setup").setDescription("Set this or another channel as the Aurix bot channel.").addChannelOption((option) => option.setName("channel").setDescription("Optional channel; leave empty to use this channel").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
    new SlashCommandBuilder().setName("start").setDescription("Create your save and open the quick-start guide."),
    new SlashCommandBuilder().setName("profile").setDescription("View your or another player's profile.").addUserOption((option) => option.setName("user").setDescription("Optional target")),
    new SlashCommandBuilder().setName("stats").setDescription("View deeper player stats.").addUserOption((option) => option.setName("user").setDescription("Optional target")),
    new SlashCommandBuilder().setName("balance").setDescription("Check wallet and vault balance.").addUserOption((option) => option.setName("user").setDescription("Optional target")),
    new SlashCommandBuilder().setName("work").setDescription("Complete a shift for steady aura and XP."),
    new SlashCommandBuilder().setName("mine").setDescription("Gather crafting materials on a cooldown."),
    new SlashCommandBuilder().setName("spin").setDescription("Spin for aura on a cooldown."),
    new SlashCommandBuilder().setName("coinflip").setDescription("Bet aura on heads or tails on a cooldown.").addIntegerOption((option) => option.setName("amount").setDescription("Aura to bet").setRequired(true).setMinValue(1)).addStringOption((option) => option.setName("choice").setDescription("Choose heads or tails").setRequired(true).addChoices({ name: "heads", value: "heads" }, { name: "tails", value: "tails" })),
    new SlashCommandBuilder().setName("rob").setDescription("Attempt to steal aura from another player.").addUserOption((option) => option.setName("user").setDescription("Target player").setRequired(true)),
    new SlashCommandBuilder().setName("daily").setDescription("Claim your daily streak reward."),
    new SlashCommandBuilder().setName("reminders").setDescription("Manage ready-state tag reminders.")
      .addSubcommand((sub) => sub.setName("status").setDescription("View your reminder settings."))
      .addSubcommand((sub) => sub.setName("enable").setDescription("Tag me when an action is ready.").addStringOption((option) => option.setName("action").setDescription("Action to track").setRequired(true).addChoices(...REMINDER_ACTION_CHOICES)))
      .addSubcommand((sub) => sub.setName("disable").setDescription("Stop tagging me for an action.").addStringOption((option) => option.setName("action").setDescription("Action to stop tracking").setRequired(true).addChoices(...REMINDER_ACTION_CHOICES))),
    new SlashCommandBuilder().setName("vault").setDescription("Manage your aura vault.").addSubcommand((sub) => sub.setName("deposit").setDescription("Deposit aura.").addIntegerOption((option) => option.setName("amount").setDescription("Amount").setRequired(true).setMinValue(1))).addSubcommand((sub) => sub.setName("withdraw").setDescription("Withdraw aura.").addIntegerOption((option) => option.setName("amount").setDescription("Amount").setRequired(true).setMinValue(1))).addSubcommand((sub) => sub.setName("interest").setDescription("Claim accumulated vault interest.")),
    new SlashCommandBuilder().setName("shop").setDescription("Browse shop items and perks."),
    new SlashCommandBuilder().setName("buy").setDescription("Buy an item from the shop.").addStringOption((option) => option.setName("item").setDescription("Item id").setRequired(true)),
    new SlashCommandBuilder().setName("gift").setDescription("Send aura to another player.").addUserOption((option) => option.setName("user").setDescription("Receiving player").setRequired(true)).addIntegerOption((option) => option.setName("amount").setDescription("Aura to send").setRequired(true).setMinValue(1)),
    new SlashCommandBuilder().setName("inventory").setDescription("View your items, perks, skills, and crates."),
    new SlashCommandBuilder().setName("craft").setDescription("Craft something from mined materials.").addStringOption((option) => option.setName("recipe").setDescription("Recipe id").setRequired(true).addChoices(...CRAFTING_RECIPES.map((recipe) => ({ name: recipe.name, value: recipe.id })))),
    new SlashCommandBuilder().setName("forge").setDescription("Upgrade and repair crafted gear with aura.")
      .addSubcommand((sub) => sub.setName("status").setDescription("View forge levels and durability."))
      .addSubcommand((sub) => sub.setName("upgrade").setDescription("Try to upgrade a crafted gear item.").addStringOption((option) => option.setName("item").setDescription("Gear item").setRequired(true).addChoices(...Object.entries(GEAR_ITEMS).map(([gearId, gear]) => ({ name: gear.name, value: gearId })))))
      .addSubcommand((sub) => sub.setName("repair").setDescription("Repair a crafted gear item.").addStringOption((option) => option.setName("item").setDescription("Gear item").setRequired(true).addChoices(...Object.entries(GEAR_ITEMS).map(([gearId, gear]) => ({ name: gear.name, value: gearId }))))),
    new SlashCommandBuilder().setName("crafting-guide").setDescription("See which bosses feed each crafting path."),
    new SlashCommandBuilder().setName("garden").setDescription("Manage your growing garden.").addSubcommand((sub) => sub.setName("status").setDescription("View your garden plots.")).addSubcommand((sub) => sub.setName("plant").setDescription("Plant a crop in a plot.").addStringOption((option) => option.setName("crop").setDescription("Crop to plant").setRequired(true).addChoices(...Object.entries(GARDEN_CROPS).map(([cropId, crop]) => ({ name: crop.name, value: cropId })))).addIntegerOption((option) => option.setName("plot").setDescription("Optional plot number").setMinValue(1).setMaxValue(4))).addSubcommand((sub) => sub.setName("harvest").setDescription("Harvest any ready crops.")),
    new SlashCommandBuilder().setName("property").setDescription("Buy and manage passive income properties.")
      .addSubcommand((sub) => sub.setName("list").setDescription("View available properties."))
      .addSubcommand((sub) => sub.setName("buy").setDescription("Buy a property.").addStringOption((option) => option.setName("type").setDescription("Property").setRequired(true).addChoices(...Object.values(PROPERTY_TYPES).map((property) => ({ name: property.name, value: property.id })))))
      .addSubcommand((sub) => sub.setName("upgrade").setDescription("Upgrade an owned property.").addStringOption((option) => option.setName("type").setDescription("Property").setRequired(true).addChoices(...Object.values(PROPERTY_TYPES).map((property) => ({ name: property.name, value: property.id })))))
      .addSubcommand((sub) => sub.setName("claim").setDescription("Claim passive income from a property.").addStringOption((option) => option.setName("type").setDescription("Property").setRequired(true).addChoices(...Object.values(PROPERTY_TYPES).map((property) => ({ name: property.name, value: property.id }))))),
    new SlashCommandBuilder().setName("expedition").setDescription("Send your character on timed loot missions.")
      .addSubcommand((sub) => sub.setName("status").setDescription("View current expedition status."))
      .addSubcommand((sub) => sub.setName("start").setDescription("Start a timed expedition.").addStringOption((option) => option.setName("type").setDescription("Expedition").setRequired(true).addChoices(...Object.values(EXPEDITION_TYPES).map((expedition) => ({ name: expedition.name, value: expedition.id })))))
      .addSubcommand((sub) => sub.setName("claim").setDescription("Claim a completed expedition.")),
    new SlashCommandBuilder().setName("gear").setDescription("Manage your equipped gear.").addSubcommand((sub) => sub.setName("loadout").setDescription("View equipped gear.")).addSubcommand((sub) => sub.setName("equip").setDescription("Equip a crafted gear item.").addStringOption((option) => option.setName("item").setDescription("Gear item").setRequired(true).addChoices(...Object.entries(GEAR_ITEMS).map(([gearId, gear]) => ({ name: gear.name, value: gearId }))))),
    new SlashCommandBuilder().setName("rank").setDescription("View rank progression and prestige readiness."),
    new SlashCommandBuilder().setName("prestige").setDescription("Reset rank progression to gain prestige."),
    new SlashCommandBuilder().setName("achievements").setDescription("Claim any achievement rewards you have unlocked."),
    new SlashCommandBuilder().setName("quests").setDescription("View your daily quests."),
    new SlashCommandBuilder().setName("crate").setDescription("Open crates.").addStringOption((option) => option.setName("type").setDescription("Crate type").setRequired(true).addChoices({ name: "common", value: "common" }, { name: "rare", value: "rare" }, { name: "epic", value: "epic" }, { name: "legendary", value: "legendary" })).addIntegerOption((option) => option.setName("amount").setDescription("How many crates to open").setMinValue(1)),
    new SlashCommandBuilder().setName("skills").setDescription("View unlocked combat skills and attack styles."),
    new SlashCommandBuilder().setName("pvp").setDescription("Challenge a player or join global PvP matchmaking.")
      .addUserOption((option) => option.setName("user").setDescription("Optional direct opponent"))
      .addStringOption((option) => option.setName("mode").setDescription("Global matchmaking control").addChoices({ name: "join", value: "join" }, { name: "status", value: "status" })),
    new SlashCommandBuilder().setName("boss").setDescription("Fight a boss.").addStringOption((option) => option.setName("boss").setDescription("Boss id").addChoices({ name: "ember", value: "ember" }, { name: "oracle", value: "oracle" }, { name: "warden", value: "warden" }, { name: "codex", value: "codex" })),
    new SlashCommandBuilder().setName("leaderboard").setDescription("View top players and clans.").addStringOption((option) => option.setName("category").setDescription("Leaderboard type").setRequired(true).addChoices({ name: "aura", value: "aura" }, { name: "vault", value: "vault" }, { name: "xp", value: "xp" }, { name: "prestige", value: "prestige" }, { name: "clans", value: "clans" })).addStringOption((option) => option.setName("scope").setDescription("Global or this server only").addChoices({ name: "global", value: "global" }, { name: "server", value: "server" })),
    new SlashCommandBuilder().setName("premium").setDescription("View your premium status."),
    new SlashCommandBuilder().setName("premium-chest").setDescription("Open your premium recurring loot chest."),
    new SlashCommandBuilder().setName("clan").setDescription("Manage your clan.").addSubcommand((sub) => sub.setName("create").setDescription("Create a clan for 50,000 aura.").addStringOption((option) => option.setName("name").setDescription("Clan name").setRequired(true))).addSubcommand((sub) => sub.setName("join").setDescription("Join a clan by code.").addStringOption((option) => option.setName("code").setDescription("Clan code").setRequired(true))).addSubcommand((sub) => sub.setName("apply").setDescription("Send a join request for approval.").addStringOption((option) => option.setName("code").setDescription("Clan code").setRequired(true))).addSubcommand((sub) => sub.setName("leave").setDescription("Leave your clan.")).addSubcommand((sub) => sub.setName("info").setDescription("View your clan.")).addSubcommand((sub) => sub.setName("members").setDescription("List clan members.")).addSubcommand((sub) => sub.setName("log").setDescription("View recent clan activity.")).addSubcommand((sub) => sub.setName("kick").setDescription("Owner-only member removal.").addUserOption((option) => option.setName("user").setDescription("Clan member").setRequired(true))).addSubcommand((sub) => sub.setName("approve").setDescription("Owner or officer request approval.").addUserOption((option) => option.setName("user").setDescription("Applicant").setRequired(true))).addSubcommand((sub) => sub.setName("decline").setDescription("Owner or officer reject an applicant.").addUserOption((option) => option.setName("user").setDescription("Applicant").setRequired(true))).addSubcommand((sub) => sub.setName("role").setDescription("Owner-only officer management.").addUserOption((option) => option.setName("user").setDescription("Clan member").setRequired(true)).addStringOption((option) => option.setName("role").setDescription("Role to set").setRequired(true).addChoices({ name: "officer", value: "officer" }, { name: "member", value: "member" }))).addSubcommand((sub) => sub.setName("transfer").setDescription("Owner-only leadership transfer.").addUserOption((option) => option.setName("user").setDescription("New owner").setRequired(true))).addSubcommand((sub) => sub.setName("disband").setDescription("Owner-only full clan deletion.")).addSubcommand((sub) => sub.setName("upgrade").setDescription("Spend clan vault aura on upgrades.").addStringOption((option) => option.setName("path").setDescription("Upgrade path").setRequired(true).addChoices({ name: "hall", value: "hall" }, { name: "vault", value: "vault" }, { name: "arsenal", value: "arsenal" }))).addSubcommand((sub) => sub.setName("raid").setDescription("Launch a cooldown-based clan raid.")).addSubcommand((sub) => sub.setName("donate").setDescription("Donate aura to your clan.").addIntegerOption((option) => option.setName("amount").setDescription("Amount").setRequired(true).setMinValue(1))).addSubcommand((sub) => sub.setName("war").setDescription("Fight another clan by code.").addStringOption((option) => option.setName("enemy").setDescription("Enemy clan code").setRequired(true))),
    new SlashCommandBuilder().setName("authority").setDescription("Rank-only blessing command.").addUserOption((option) => option.setName("user").setDescription("Target player").setRequired(true)),
  ].map((command) => command.toJSON());
}

async function routeInteraction(interaction) {
  const interactionLog = {
    build: COMMAND_BUILD_ID,
    at: new Date().toISOString(),
    id: interaction.id,
    type: interaction.type,
    command: interaction.commandName || null,
    customId: interaction.customId || null,
    guildId: interaction.guildId || null,
    channelId: interaction.channelId || null,
    userId: interaction.user?.id || null,
  };
  recentInteractions.unshift(interactionLog);
  recentInteractions.splice(25);
  console.log("Aurix interaction routed:", interactionLog);

  if (interaction.isButton() && interaction.customId?.startsWith("pvpqueue:")) {
    const result = await handlePvpQueueButton(interaction);
    await sendPendingRankUpMessages(interaction);
    return result;
  }

  if (interaction.isButton() || interaction.isStringSelectMenu()) {
    const result = await handleBattleComponentInteraction(interaction);
    await sendPendingRankUpMessages(interaction);
    return result;
  }
  if (!interaction.isChatInputCommand()) {
    return null;
  }

  const handlers = { help: handleHelp, event: handleEvent, setup: handleSetup, start: handleStart, profile: handleProfile, stats: handleStats, balance: handleBalance, work: handleWork, mine: handleMine, spin: handleSpin, coinflip: handleCoinflip, rob: handleRob, daily: handleDaily, "premium-chest": handlePremiumChest, reminders: handleReminders, vault: handleVault, shop: handleShop, buy: handleBuy, gift: handleGift, inventory: handleInventory, craft: handleCraft, forge: handleForge, "crafting-guide": handleCraftingGuide, garden: handleGarden, property: handleProperty, expedition: handleExpedition, gear: handleGear, rank: handleRank, prestige: handlePrestige, achievements: handleAchievements, quests: handleQuests, crate: handleCrate, skills: handleSkills, pvp: handlePvp, boss: handleBoss, leaderboard: handleLeaderboard, premium: handlePremium, clan: handleClan, authority: handleAuthority };
  const handler = handlers[interaction.commandName];
  if (!handler) {
    return interaction.reply({ content: "Unknown command.", ephemeral: true });
  }

  if (interaction.guildId && interaction.commandName !== "setup") {
    const settings = await getGuildSettings(interaction.guildId);
    if (settings?.aurixChannelId && settings.aurixChannelId !== interaction.channelId) {
      return interaction.reply({
        ...buildEmbedPayload({
          title: "Aurix Channel",
          description: `Aurix is configured to work in <#${settings.aurixChannelId}> for this server.`,
          visual: "emblem-help.svg",
        }),
        ephemeral: true,
      });
    }

    const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
    await rememberPlayerContext(user, interaction);
    await user.save();
  }

  const result = await handler(interaction);
  await sendPendingRankUpMessages(interaction);
  return result;
}

module.exports = {
  applyPaddleWebhookEvent,
  buildCommands,
  recentInteractions,
  routeInteraction,
  sendServerJoinMessage,
  sendServerSetupMessage,
  startReminderLoop,
};
