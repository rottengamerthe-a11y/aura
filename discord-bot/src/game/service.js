const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, PermissionsBitField, SlashCommandBuilder, StringSelectMenuBuilder } = require("discord.js");
const crypto = require("crypto");
const { BOSSES, COLORS, COOLDOWNS, CRATES, CRAFTING_RECIPES, EFFECT_CAPS, GARDEN_CROPS, GEAR_ITEMS, MATERIALS, QUEST_TEMPLATES, RANKS, SHOP_ITEMS, SKILLS, WORLD_EVENTS } = require("../config/gameConfig");
const { BattleSession, Clan, CollectiblePrintCounter, GuildSettings, PvpInvite, PvpMatchmakingQueue, RoleListing, RolePurchase, TopggVoteLog, TradeOffer, User } = require("../data/models");
const { buildClanCreateData, buildClanLeaderboardFilter, buildClanLookup, buildClanMembershipClearUpdate, buildClanMembershipFilter, buildPlayerCreateData, buildPlayerLeaderboardFilter, buildPlayerLookup, getGuildClanId, isGlobalPlayerDataEnabled, setGuildClanId } = require("../data/playerScope");
const { classifyIntent } = require("../ai/intentRouter");
const { eventBus } = require("../core/eventBus");
const { buildProfileCosmeticAttachment, encodePng, FILE_NAME: PROFILE_COSMETIC_FILE } = require("../utils/cosmeticArt");
const { buildAttachment, buildEmbedPayload } = require("../utils/visuals");

const activeBattles = new Map();
const pendingRankUps = new Map();
const reminderIntervals = new WeakMap();
const relicSpawnIntervals = new WeakMap();
const chatSpawnCounters = new Map();
const recentInteractions = [];
const COMMAND_BUILD_ID = "aurix-topgg-vote-reminder-prompts-v22";
const BATTLE_TIMEOUT_MS = 45 * 60 * 1000;
const BATTLE_ANIMATION_DELAY_MS = 900;
const PVP_INVITE_TIMEOUT_MS = 2 * 60 * 1000;
const PVP_MATCHMAKING_TIMEOUT_MS = 10 * 60 * 1000;
const SERVER_EVENT_DURATION_MS = 20 * 60 * 1000;
const SERVER_EVENT_SPAWN_COOLDOWN_MS = 35 * 60 * 1000;
const SERVER_EVENT_RECENT_HISTORY_LIMIT = 4;
const TRADE_OFFER_TIMEOUT_MS = 15 * 60 * 1000;
const SUMMON_COOLDOWN_MS = 60 * 1000;
const SUMMON_COST = 2000;
const RELIC_SPAWN_TTL_MS = Number(process.env.AURIX_RELIC_SPAWN_TTL_MS) || 10 * 60 * 1000;
const SHINY_RELIC_CHANCE = 0.012;
const CHAT_SPAWN_MULTI_USER_THRESHOLD = 24;
const CHAT_SPAWN_SINGLE_USER_THRESHOLD = 36;
const CHAT_SPAWN_USER_RATE_LIMIT_MS = 1500;
const INCENSE_COST = 50000;
const INCENSE_SPAWNS = 180;
const INCENSE_TICK_MS = 20 * 1000;
const ECONOMY_RULES = Object.freeze({
  faucetSoftCap: 250000,
  faucetHardCap: 2500000,
  faucetMinimumMultiplier: 0.45,
  vaultBaseRatePerHour: 0.004,
  vaultPrestigeRatePerHour: 0.001,
  vaultMaxAccrualHours: 12,
  vaultDiminishStart: 150000,
  vaultDiminishFull: 3000000,
  vaultMinimumRateMultiplier: 0.25,
  transferFeeRate: 0.03,
  transferFeeThreshold: 50000,
  coinflipMaxWalletRatio: 0.05,
  coinflipMaxBet: 50000,
  projectRewardPoolCapContributors: 5,
  projectRewardMaxSinkRatio: 0.35,
});
const APPRECIATE_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const FACTION_STRIKE_COOLDOWN_MS = 60 * 60 * 1000;
const FLEX_COOLDOWN_MS = 5 * 60 * 1000;
const REVENGE_WINDOW_MS = 48 * 60 * 60 * 1000;
const PROTECTION_WINDOW_MS = 6 * 60 * 60 * 1000;
const BOUNTY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const HEIST_RULES = Object.freeze({
  newbieRankFloor: 1,
  newbieAuraFloor: 8000,
  walletStealRate: 0.035,
  walletStealCap: 4200,
  revengeStealMultiplier: 1.4,
  factionProtectionMultiplier: 0.75,
  protectionMultiplier: 0.45,
});
const APPRECIATION_TAGS = Object.freeze({
  kindness: { label: "Kindness", reputation: 2 },
  creativity: { label: "Creativity", reputation: 2 },
  helper: { label: "Helpful Energy", reputation: 2 },
  welcome: { label: "Welcoming", reputation: 2 },
  funny: { label: "Made People Smile", reputation: 1 },
});
const CAMPFIRE_PROMPTS = Object.freeze([
  "What is a small server moment from this week that should not disappear?",
  "Who made the server feel easier to be in recently?",
  "What inside joke, clip, screenshot, or quote belongs in the server story?",
  "What should this community be known for when someone new joins?",
  "What creative thing should the server build together next?",
]);
const BLACK_MARKET_OFFERS = Object.freeze([
  { id: "baron_title", name: "Contraband Title: Black-Market Baron", cost: 85000, type: "title", value: "Black-Market Baron", heat: 18 },
  { id: "riot_frame", name: "Riot Frame", cost: 125000, type: "frame", value: "Riot Frame", heat: 24 },
  { id: "vault_dust_cache", name: "Vault Dust Cache", cost: 42000, type: "item", itemId: "vault_dust", quantity: 15, heat: 12 },
  { id: "storm_sigil", name: "Storm Choir Sigil", cost: 68000, type: "title", value: "Storm Choir Sigil", factionId: "storm", heat: 20 },
  { id: "warden_mark", name: "Warden Black Seal", cost: 68000, type: "title", value: "Warden Black Seal", factionId: "wardens", heat: 20 },
  { id: "bloom_mark", name: "Bloom Syndicate Mark", cost: 68000, type: "title", value: "Bloom Syndicate Mark", factionId: "bloom", heat: 20 },
]);
const TUTORIAL_STEPS = Object.freeze([
  { id: "daily", command: "daily", label: "Claim /daily", rewardAura: 250, rewardXp: 80 },
  { id: "work", command: "work", label: "Complete /work", rewardAura: 300, rewardXp: 90 },
  { id: "spin", command: "spin", label: "Use /spin", rewardAura: 300, rewardXp: 90 },
  { id: "vault", command: "vault", label: "Deposit aura with /vault deposit", rewardAura: 450, rewardXp: 120 },
  { id: "profile", command: "profile", label: "Open /profile", rewardAura: 250, rewardXp: 100 },
]);
const SERVER_EVENT_TEMPLATES = Object.freeze([
  {
    id: "rift_cache",
    name: "Rift Cache",
    description: "A small cache breaks through the channel static. Claim it before the signal collapses.",
    rewardAura: 5000,
    rewardXp: 850,
    bonus: { crates: { rare: 1 } },
    activity: {
      prompt: "Stabilize the rift cache by tuning the cleanest signal.",
      choices: [
        { id: "static", label: "Cut Static" },
        { id: "pulse", label: "Match Pulse", correct: true },
        { id: "surge", label: "Force Surge" },
      ],
      success: "You matched the pulse and the cache snapped open.",
      failure: "That tuning made the cache flicker out of reach. Try another event next time.",
    },
  },
  {
    id: "vault_surge",
    name: "Vault Surge",
    description: "The vault network flashes gold. A quick claim banks the overflow safely.",
    rewardAura: 6500,
    rewardXp: 700,
    bonus: { vaultAura: 2500 },
    activity: {
      prompt: "Route the vault surge before the overflow leaks away.",
      choices: [
        { id: "spend", label: "Open Market" },
        { id: "seal", label: "Seal Vault", correct: true },
        { id: "split", label: "Split Flow" },
      ],
      success: "You sealed the vault route and captured the overflow.",
      failure: "The vault route destabilized and the surge moved on.",
    },
  },
  {
    id: "battle_omen",
    name: "Battle Omen",
    description: "A combat omen rolls through the server and rewards anyone alert enough to catch it.",
    rewardAura: 4200,
    rewardXp: 1100,
    bonus: { items: { health_vial: 1, smoke_bomb: 1 } },
    activity: {
      prompt: "Read the combat omen and choose the counter stance.",
      choices: [
        { id: "rush", label: "Rush" },
        { id: "guard", label: "Guard" },
        { id: "parry", label: "Parry", correct: true },
      ],
      success: "You caught the omen with a clean parry.",
      failure: "The omen slipped past that stance.",
    },
  },
  {
    id: "golden_downpour",
    name: "Golden Downpour",
    description: "A bright aura shower opens above the channel. Anyone quick enough can scoop up the falling shine.",
    rewardAura: 7200,
    rewardXp: 620,
    bonus: { auraMultiplier: 0.35 },
    activity: {
      prompt: "Catch the brightest fall before it hits the floor.",
      choices: [
        { id: "left", label: "Left Arc" },
        { id: "center", label: "Center Drop", correct: true },
        { id: "right", label: "Right Spark" },
      ],
      success: "You caught the center drop at peak shine.",
      failure: "That arc scattered into harmless glitter.",
    },
  },
  {
    id: "archive_breach",
    name: "Archive Breach",
    description: "The Aurix archive cracks open and spills old progression data into the server feed.",
    rewardAura: 3900,
    rewardXp: 1350,
    bonus: { xpMultiplier: 0.4 },
    activity: {
      prompt: "Patch the archive breach by selecting the valid checksum.",
      choices: [
        { id: "a13", label: "A13" },
        { id: "x09", label: "X09", correct: true },
        { id: "k77", label: "K77" },
      ],
      success: "The checksum locked and the archive paid out cleanly.",
      failure: "That checksum failed and the breach sealed itself.",
    },
  },
  {
    id: "market_frenzy",
    name: "Market Frenzy",
    description: "The night market flashes a server-only discount signal, then pays out whoever catches the ping.",
    rewardAura: 5800,
    rewardXp: 780,
    bonus: { crates: { common: 2, rare: 1 } },
    activity: {
      prompt: "Pick the real night-market bargain from the noisy offers.",
      choices: [
        { id: "flash", label: "Flash Deal" },
        { id: "bundle", label: "Crate Bundle", correct: true },
        { id: "mystery", label: "Mystery Tab" },
      ],
      success: "You grabbed the real bundle before the market blinked.",
      failure: "That listing was just market noise.",
    },
  },
  {
    id: "garden_bloom",
    name: "Garden Bloom",
    description: "A server-wide bloom rolls through the garden grid and leaves fresh aura in its roots.",
    rewardAura: 4600,
    rewardXp: 980,
    bonus: { materials: { bloom_fiber: 6, sun_resin: 2 } },
    activity: {
      prompt: "Harvest the bloom without bruising the rare roots.",
      choices: [
        { id: "pull", label: "Pull Hard" },
        { id: "prune", label: "Prune Tips" },
        { id: "lift", label: "Lift Roots", correct: true },
      ],
      success: "You lifted the roots cleanly and kept the bloom intact.",
      failure: "The bloom folded before the harvest landed.",
    },
  },
  {
    id: "relic_echo",
    name: "Relic Echo",
    description: "A relic echo pulses through the channel, rewarding sharp collectors before the sound fades.",
    rewardAura: 5400,
    rewardXp: 920,
    bonus: { crates: { epic: 1 } },
    activity: {
      prompt: "Follow the true relic echo through the channel noise.",
      choices: [
        { id: "first", label: "First Echo" },
        { id: "second", label: "Second Echo" },
        { id: "third", label: "Third Echo", correct: true },
      ],
      success: "You followed the true echo to the relic cache.",
      failure: "That echo was only a reflection.",
    },
  },
  {
    id: "champion_signal",
    name: "Champion Signal",
    description: "A combat signal locks onto the server and pays out players who answer before it expires.",
    rewardAura: 6200,
    rewardXp: 1250,
    bonus: { items: { adrenaline_tonic: 1 }, crates: { rare: 1 } },
    activity: {
      prompt: "Answer the champion signal with the right opener.",
      choices: [
        { id: "feint", label: "Feint" },
        { id: "focus", label: "Focus", correct: true },
        { id: "taunt", label: "Taunt" },
      ],
      success: "You focused at the right moment and the signal recognized you.",
      failure: "The champion signal ignored that opener.",
    },
  },
]);
const RELIC_RARITIES = Object.freeze({
  common: { label: "Common", weight: 520, burnAura: 260, burnXp: 35, value: 1 },
  uncommon: { label: "Uncommon", weight: 290, burnAura: 520, burnXp: 70, value: 2 },
  rare: { label: "Rare", weight: 135, burnAura: 1200, burnXp: 140, value: 4 },
  epic: { label: "Epic", weight: 45, burnAura: 2800, burnXp: 320, value: 8 },
  legendary: { label: "Legendary", weight: 9, burnAura: 7200, burnXp: 820, value: 18 },
  mythic: { label: "Mythic", weight: 1, burnAura: 18000, burnXp: 2200, value: 42 },
});
const RELIC_EVOLVE_COST = Object.freeze({ aura: 4500, essence: 3 });
const RELIC_PURIFY_COST = Object.freeze({ aura: 3200, essence: 2 });
const RELIC_TRAITS = Object.freeze({
  common: ["warm", "etched"],
  uncommon: ["resonant", "moonlit", "restless"],
  rare: ["oathbound", "storm-cut", "market-marked", "vault-tuned"],
  epic: ["hungry", "mirrorborn", "fate-heavy", "choir-lit"],
  legendary: ["sovereign", "world-bending", "history-drunk"],
  mythic: ["impossible", "server-crowned", "zero-born"],
});
const RELIC_ORIGIN_LABELS = Object.freeze({
  chat: "Chat Spawn",
  summon: "Aura Summon",
  incense: "Incense Drift",
  event: "World Event",
  bounty: "Bounty Echo",
  faction: "Faction Surge",
});
const GENERATED_RELIC_COUNT = Number(process.env.AURIX_GENERATED_RELIC_COUNT) || 90000;
const GENERATED_RELIC_RARITY_COUNTS = Object.freeze({
  common: 43200,
  uncommon: 25200,
  rare: 12600,
  epic: 6480,
  legendary: 2160,
  mythic: 360,
});

function slugifyRelicPart(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function pickGeneratedRelicRarity(index) {
  let cursor = 0;
  for (const [rarity, count] of Object.entries(GENERATED_RELIC_RARITY_COUNTS)) {
    cursor += count;
    if (index < cursor) {
      return rarity;
    }
  }
  return "common";
}

function buildGeneratedAurixRelics(count = GENERATED_RELIC_COUNT) {
  const prefixes = ["Amber", "Ashen", "Astral", "Azure", "Black", "Bloom", "Brass", "Bright", "Broken", "Celestial", "Chrome", "Crimson", "Crystal", "Duskworn", "Echo", "Elder", "Ember", "Fabled", "Frost", "Gilded", "Glass", "Golden", "Hollow", "Iron", "Ivory", "Jade", "Lunar", "Mist", "Obsidian", "Onyx", "Oracle", "Pearl", "Prism", "Radiant", "Rift", "Ruby", "Runed", "Sable", "Scarlet", "Shadow", "Silver", "Solar", "Static", "Storm", "Sunken", "Verdant", "Violet", "Void", "Wild", "Woven"];
  const cores = ["Anchor", "Anvil", "Bell", "Blade", "Bloom", "Button", "Candle", "Charm", "Chip", "Coin", "Compass", "Crown", "Dial", "Door", "Eye", "Feather", "Gear", "Glyph", "Halo", "Heart", "Hourglass", "Key", "Knot", "Lantern", "Leaf", "Lens", "Locket", "Mask", "Mirror", "Needle", "Orb", "Pearl", "Pin", "Prism", "Rune", "Scale", "Seal", "Seed", "Shard", "Shell", "Sigil", "Spark", "Spindle", "Sprout", "Star", "Stone", "Thread", "Ticket", "Token", "Tooth"];
  const suffixes = ["of Dawn", "of Dusk", "of Static", "of Cinders", "of the Vault", "of the Rift", "of Old Seasons", "of Quiet Luck", "of Deep Channels", "of Wild Commands", "of Moonlight", "of Sunroot", "of Lost Prints", "of First Light", "of the Garden", "of the Market", "of the Oracle", "of the Warden", "of the Ember Court", "of Hidden Doors", "of Glass Rain", "of Silver Bells", "of Soft Thunder", "of Patient Hands", "of the Long Hunt", "of Hollow Echoes", "of the Night Bazaar", "of Golden Dust", "of Broken Crowns", "of Infinite Roots"];
  const descriptions = {
    common: "A small collectible relic from the outer Aurix archive.",
    uncommon: "A tuned relic with enough aura residue to stand out in a busy channel.",
    rare: "A scarce relic with a memorable silhouette and a stubborn glow.",
    epic: "A high-value relic sought by collectors and late-night hunters.",
    legendary: "A server-flex relic with old power folded into its shadow.",
    mythic: "A near-impossible relic whispered about by the archive itself.",
  };
  const relics = [];
  const targetCount = Math.max(0, Math.floor(count));

  for (let index = 0; index < targetCount; index += 1) {
    const prefix = prefixes[index % prefixes.length];
    const core = cores[Math.floor(index / prefixes.length) % cores.length];
    const suffix = suffixes[Math.floor(index / (prefixes.length * cores.length)) % suffixes.length];
    const rarity = pickGeneratedRelicRarity(index);
    const name = `${prefix} ${core} ${suffix}`;
    relics.push({
      id: `relic_${String(index + 1).padStart(4, "0")}_${slugifyRelicPart(prefix)}_${slugifyRelicPart(core)}`,
      name,
      rarity,
      description: descriptions[rarity],
      generated: true,
    });
  }

  return relics;
}

const BASE_AURIX_RELICS = Object.freeze([
  { id: "warden_trial_crown", name: "Warden Trial Crown", rarity: "legendary", description: "A faction relic that appears when the Vault Wardens dominate the server story.", eventExclusive: true, factionId: "wardens" },
  { id: "bloom_accord_seed", name: "Bloom Accord Seed", rarity: "legendary", description: "A faction relic grown from impossible generosity and public bargains.", eventExclusive: true, factionId: "bloom" },
  { id: "storm_choir_splinter", name: "Storm Choir Splinter", rarity: "legendary", description: "A faction relic that sings louder after duels, heists, and world tension.", eventExclusive: true, factionId: "storm" },
  { id: "eclipse_bounty_coin", name: "Eclipse Bounty Coin", rarity: "epic", description: "A dangerous relic minted when public grudges reshape the market.", eventExclusive: true },
  { id: "corrupted_zero_shard", name: "Corrupted Zero Shard", rarity: "mythic", description: "A mythic shard that stains the story log whenever it changes hands.", eventExclusive: true },
  { id: "static_seed", name: "Static Seed", rarity: "common", description: "A starter spark that hums when commands land." },
  { id: "copper_moon", name: "Copper Moon", rarity: "common", description: "A warm coin-shaped relic from old aura routes." },
  { id: "garden_lens", name: "Garden Lens", rarity: "common", description: "A tiny glass charm that makes crop rows look endless." },
  { id: "rusted_key", name: "Rusted Key", rarity: "common", description: "An old key with no lock, kept because it still vibrates near vault doors." },
  { id: "threaded_leaf", name: "Threaded Leaf", rarity: "common", description: "A leaf stitched with faint auric veins." },
  { id: "ash_button", name: "Ash Button", rarity: "common", description: "A blackened button from a coat worn too close to the Ember Tyrant." },
  { id: "tin_star", name: "Tin Star", rarity: "common", description: "A dented star charm given to first-time relic hunters." },
  { id: "mist_pebble", name: "Mist Pebble", rarity: "common", description: "A smooth stone that never fully dries." },
  { id: "paper_sun", name: "Paper Sun", rarity: "common", description: "A folded charm that glows only at the edges." },
  { id: "blue_cinder", name: "Blue Cinder", rarity: "common", description: "A cold ember that remembers being bright." },
  { id: "hollow_coin", name: "Hollow Coin", rarity: "common", description: "A lightweight coin that rings like glass." },
  { id: "market_pin", name: "Market Pin", rarity: "common", description: "A trading badge from a forgotten server bazaar." },
  { id: "sleeping_sprout", name: "Sleeping Sprout", rarity: "common", description: "A tiny sprout sealed in a bead of amber." },
  { id: "vault_sigil", name: "Vault Sigil", rarity: "uncommon", description: "A polished seal used by careful savers." },
  { id: "ember_knot", name: "Ember Knot", rarity: "uncommon", description: "A loop of heat-resistant thread from the boss arenas." },
  { id: "mirror_leaf", name: "Mirror Leaf", rarity: "uncommon", description: "A silver leaf that reflects nearby relic silhouettes." },
  { id: "lucky_gear", name: "Lucky Gear", rarity: "uncommon", description: "A small brass gear that clicks once before good rolls." },
  { id: "drift_shell", name: "Drift Shell", rarity: "uncommon", description: "A shell pulled from a sea that only appears during world events." },
  { id: "lantern_moth", name: "Lantern Moth", rarity: "uncommon", description: "A preserved moth whose wings hold a small square of light." },
  { id: "scarlet_token", name: "Scarlet Token", rarity: "uncommon", description: "A warm token stamped with a dueling mark." },
  { id: "clockwork_seed", name: "Clockwork Seed", rarity: "uncommon", description: "A seed with small teeth where roots should be." },
  { id: "silver_rune", name: "Silver Rune", rarity: "uncommon", description: "A thin rune that hums louder inside busy channels." },
  { id: "tavern_chime", name: "Tavern Chime", rarity: "uncommon", description: "A bell charm that sounds like distant laughter." },
  { id: "frosted_lens", name: "Frosted Lens", rarity: "uncommon", description: "A cloudy lens used to inspect impossible prints." },
  { id: "ember_pinwheel", name: "Ember Pinwheel", rarity: "uncommon", description: "A tiny wheel that spins whenever a boss wakes." },
  { id: "rift_compass", name: "Rift Compass", rarity: "rare", description: "Its needle points toward unopened chances." },
  { id: "oracle_chip", name: "Oracle Chip", rarity: "rare", description: "A sliver of prediction etched with impossible timing." },
  { id: "moonlit_anchor", name: "Moonlit Anchor", rarity: "rare", description: "A small anchor that holds drifting expeditions in place." },
  { id: "glass_wyvern_scale", name: "Glass Wyvern Scale", rarity: "rare", description: "A transparent scale with a storm trapped inside." },
  { id: "vault_hourglass", name: "Vault Hourglass", rarity: "rare", description: "An hourglass that counts interest instead of sand." },
  { id: "songsteel_pick", name: "Songsteel Pick", rarity: "rare", description: "A mining pick that rings in perfect fifths." },
  { id: "bloom_crownlet", name: "Bloom Crownlet", rarity: "rare", description: "A woven crownlet worn by patient gardeners." },
  { id: "static_locket", name: "Static Locket", rarity: "rare", description: "A locket that stores one second of thunder." },
  { id: "gilded_contract", name: "Gilded Contract", rarity: "rare", description: "A contract that refuses to reveal who signed it." },
  { id: "phantom_ticket", name: "Phantom Ticket", rarity: "rare", description: "A ticket for a train that arrives in inactive channels." },
  { id: "sable_flame", name: "Sable Flame", rarity: "rare", description: "A black flame that casts gold shadows." },
  { id: "stormglass_orb", name: "Stormglass Orb", rarity: "rare", description: "A glass orb that fogs before a rare pull." },
  { id: "duelist_mask", name: "Duelist Mask", rarity: "epic", description: "A lacquered faceplate carried by old PvP champions." },
  { id: "sunforge_core", name: "Sunforge Core", rarity: "epic", description: "A radiant gear heart that refuses to cool." },
  { id: "riftbreaker_halo", name: "Riftbreaker Halo", rarity: "epic", description: "A cracked halo used to stabilize wild spawns." },
  { id: "oracle_eye", name: "Oracle Eye", rarity: "epic", description: "A polished eye that blinks one command ahead." },
  { id: "deepvault_prism", name: "Deepvault Prism", rarity: "epic", description: "A prism that splits aura into visible ledgers." },
  { id: "ember_tyrants_tooth", name: "Ember Tyrant's Tooth", rarity: "epic", description: "A huge tooth carved with victory marks." },
  { id: "night_market_scale", name: "Night Market Scale", rarity: "epic", description: "A merchant scale that weighs luck against greed." },
  { id: "astral_bloom", name: "Astral Bloom", rarity: "epic", description: "A flower that grows only in prestige resets." },
  { id: "mirrorbound_blade", name: "Mirrorbound Blade", rarity: "epic", description: "A blade that shows the opponent's next mistake." },
  { id: "chrono_satchel", name: "Chrono Satchel", rarity: "epic", description: "A small satchel filled with delayed rewards." },
  { id: "warden_crown", name: "Warden Crown", rarity: "legendary", description: "The vault bends around whoever holds it." },
  { id: "codex_heart", name: "Codex Heart", rarity: "legendary", description: "A living archive of wins, losses, and strange revisions." },
  { id: "sovereign_spark", name: "Sovereign Spark", rarity: "legendary", description: "A spark that makes lesser relics orbit around it." },
  { id: "eternal_vault_door", name: "Eternal Vault Door", rarity: "legendary", description: "A miniature door that opens into pure balance sheets." },
  { id: "last_sun_dial", name: "Last Sun Dial", rarity: "legendary", description: "A dial that only casts a shadow at the end of a season." },
  { id: "rift_phoenix_plume", name: "Rift Phoenix Plume", rarity: "legendary", description: "A reborn plume that glows brighter after every burn." },
  { id: "crowned_oracle_chip", name: "Crowned Oracle Chip", rarity: "legendary", description: "An upgraded prophecy chip with a gold fracture down its center." },
  { id: "dragonmint_seal", name: "Dragonmint Seal", rarity: "legendary", description: "A mint-green seal from the oldest treasury gardens." },
  { id: "aurix_zero", name: "Aurix Zero", rarity: "mythic", description: "The first quiet note under the whole economy." },
  { id: "first_print_sun", name: "First Print Sun", rarity: "mythic", description: "A mythic sun said to mark the first copy of every future relic." },
  { id: "null_crown", name: "Null Crown", rarity: "mythic", description: "A crown-shaped absence that removes sound from the room." },
  { id: "infinite_sprout", name: "Infinite Sprout", rarity: "mythic", description: "A sprout whose roots loop through every server it visits." },
  { id: "adminium_star", name: "Adminium Star", rarity: "mythic", description: "A star forged from old permissions and impossible uptime." },
]);
const GENERATED_AURIX_RELICS = Object.freeze(buildGeneratedAurixRelics());
const AURIX_RELICS = Object.freeze([...BASE_AURIX_RELICS, ...GENERATED_AURIX_RELICS]);
const RELIC_VISUAL_MOTIFS = Object.freeze({
  warden_trial_crown: { core: "crown", wings: 4, orbit: 7, spikes: 10 },
  bloom_accord_seed: { core: "seed", wings: 6, orbit: 8, spikes: 4 },
  storm_choir_splinter: { core: "shard", wings: 6, orbit: 9, spikes: 12 },
  eclipse_bounty_coin: { core: "coin", wings: 2, orbit: 6, spikes: 8 },
  corrupted_zero_shard: { core: "zero", wings: 8, orbit: 10, spikes: 14 },
  static_seed: { core: "seed", wings: 0, orbit: 3, spikes: 4 },
  copper_moon: { core: "crescent", wings: 0, orbit: 2, spikes: 0 },
  garden_lens: { core: "lens", wings: 2, orbit: 4, spikes: 0 },
  vault_sigil: { core: "shield", wings: 0, orbit: 4, spikes: 6 },
  ember_knot: { core: "knot", wings: 2, orbit: 3, spikes: 5 },
  rift_compass: { core: "compass", wings: 0, orbit: 6, spikes: 8 },
  oracle_chip: { core: "chip", wings: 4, orbit: 4, spikes: 4 },
  duelist_mask: { core: "mask", wings: 2, orbit: 2, spikes: 6 },
  sunforge_core: { core: "sun", wings: 0, orbit: 8, spikes: 10 },
  warden_crown: { core: "crown", wings: 2, orbit: 5, spikes: 7 },
  codex_heart: { core: "heart", wings: 4, orbit: 6, spikes: 4 },
  aurix_zero: { core: "zero", wings: 6, orbit: 9, spikes: 12 },
});
const ENGAGEMENT_COMMANDS = new Set(["start", "tutorial", "profile", "stats", "balance", "work", "mine", "summon", "claim", "hint", "incense", "burn", "relic", "spin", "coinflip", "rob", "bounty", "daily", "vote", "vault", "shop", "buy", "gift", "trade", "inventory", "collection", "craft", "forge", "garden", "property", "expedition", "partyquest", "weather", "letter", "shrine", "appreciate", "campfire", "identity", "faction", "flex", "blackmarket", "gear", "rank", "prestige", "achievements", "quests", "crate", "skills", "pvp", "boss", "leaderboard", "season", "serverquest", "project", "community", "world", "yearbook", "challenge", "memoryquest", "social", "gallery", "ask", "premium-chest", "clan", "authority", "event"]);
const QUICK_ACTIONS = Object.freeze({
  achievements: { label: "Achievements", style: ButtonStyle.Secondary },
  balance: { label: "Balance", style: ButtonStyle.Secondary },
  collection: { label: "Collection", style: ButtonStyle.Secondary },
  inventory: { label: "Inventory", style: ButtonStyle.Secondary },
  profile: { label: "Profile", style: ButtonStyle.Secondary },
  quests: { label: "Quests", style: ButtonStyle.Secondary },
  rank: { label: "Rank", style: ButtonStyle.Secondary },
  tutorial: { label: "Tutorial", style: ButtonStyle.Success },
});
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
    dailyMultiplier: 1.08,
    dailyRareCrates: 0,
    cooldownReduction: 0,
    gardenPlots: 3,
    chestCooldownHours: 24,
    welcome: Object.freeze({ aura: 2000, rareCrates: 1, epicCrates: 0, legendaryCrates: 0 }),
    battle: Object.freeze({ maxHpBonus: 0, critChanceBonus: 0 }),
    chest: Object.freeze({ aura: [700, 1400], xp: [220, 420], rareCrates: 1, epicChance: 0.08, legendaryChance: 0, materials: 3 }),
    effects: Object.freeze({
      spinRewardBoost: 0.08,
      vaultInterestBoost: 0.015,
      workAuraBoost: 0.08,
      workXpBoost: 0.08,
      mineYieldBoost: 0.08,
      mineXpBoost: 0.08,
      bossRewardBoost: 0.06,
      pvpRewardBoost: 0,
      crateAuraBoost: 0.05,
    }),
  },
  yearly: {
    id: "yearly",
    label: "Yearly",
    priceLabel: "$19.99/year",
    durationDays: 365,
    dailyMultiplier: 1.12,
    dailyRareCrates: 1,
    cooldownReduction: 0,
    gardenPlots: 4,
    chestCooldownHours: 22,
    welcome: Object.freeze({ aura: 5000, rareCrates: 2, epicCrates: 1, legendaryCrates: 0 }),
    battle: Object.freeze({ maxHpBonus: 0, critChanceBonus: 0 }),
    chest: Object.freeze({ aura: [1200, 2600], xp: [360, 720], rareCrates: 1, epicChance: 0.14, legendaryChance: 0, materials: 4 }),
    effects: Object.freeze({
      spinRewardBoost: 0.12,
      vaultInterestBoost: 0.025,
      workAuraBoost: 0.12,
      workXpBoost: 0.12,
      mineYieldBoost: 0.12,
      mineXpBoost: 0.12,
      bossRewardBoost: 0.08,
      pvpRewardBoost: 0,
      crateAuraBoost: 0.08,
    }),
  },
  lifetime: {
    id: "lifetime",
    label: "Lifetime",
    priceLabel: "$49.99 one-time",
    durationDays: null,
    dailyMultiplier: 1.15,
    dailyRareCrates: 1,
    cooldownReduction: 0,
    gardenPlots: 4,
    chestCooldownHours: 20,
    welcome: Object.freeze({ aura: 10000, rareCrates: 3, epicCrates: 1, legendaryCrates: 0 }),
    battle: Object.freeze({ maxHpBonus: 0, critChanceBonus: 0 }),
    chest: Object.freeze({ aura: [2200, 4200], xp: [650, 1100], rareCrates: 2, epicChance: 0.2, legendaryChance: 0.01, materials: 5 }),
    effects: Object.freeze({
      spinRewardBoost: 0.15,
      vaultInterestBoost: 0.03,
      workAuraBoost: 0.15,
      workXpBoost: 0.15,
      mineYieldBoost: 0.15,
      mineXpBoost: 0.15,
      bossRewardBoost: 0.1,
      pvpRewardBoost: 0,
      crateAuraBoost: 0.1,
    }),
  },
});
const PREMIUM_PURCHASE_URL = "https://aurawebsite-12gd.onrender.com";
const OFFICIAL_SERVER_URL = "https://aurawebsite-12gd.onrender.com";
const TOPGG_VOTE_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const TOPGG_VOTE_PROMPT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const TOPGG_VOTE_PROMPTS_ENABLED = process.env.TOPGG_VOTE_PROMPTS_ENABLED !== "false";
const TOPGG_VOTE_PROMPT_CHANCE = TOPGG_VOTE_PROMPTS_ENABLED ? (Number(process.env.TOPGG_VOTE_PROMPT_CHANCE) || 0.05) : 0;
const TOPGG_VOTE_REWARD = Object.freeze({
  aura: Number(process.env.TOPGG_VOTE_REWARD_AURA) || 8000,
  xp: Number(process.env.TOPGG_VOTE_REWARD_XP) || 450,
  crates: Object.freeze({
    common: Number(process.env.TOPGG_VOTE_REWARD_COMMON_CRATES) || 1,
    rare: Number(process.env.TOPGG_VOTE_REWARD_RARE_CRATES) || 1,
    legendary: Number(process.env.TOPGG_VOTE_REWARD_LEGENDARY_CRATES) || 0,
  }),
});
const SERVER_PROJECT_TEMPLATES = Object.freeze([
  {
    id: "moon_gate",
    name: "Moon Gate",
    description: "A shared gateway that converts server donations into a calm payout for contributors.",
    auraGoal: 120000,
    materialGoal: 80,
    communityXp: 1400,
    rewardAura: 9000,
    rewardXp: 1200,
    rewardCrates: { rare: 1 },
  },
  {
    id: "relic_archive",
    name: "Relic Archive",
    description: "A community archive for relic hunters, crafters, and collectors.",
    auraGoal: 90000,
    materialGoal: 120,
    communityXp: 1600,
    rewardAura: 6500,
    rewardXp: 1700,
    rewardCrates: { epic: 1 },
  },
  {
    id: "clan_beacon",
    name: "Clan Beacon",
    description: "A server beacon that gives casual players a reason to contribute without chasing every cooldown.",
    auraGoal: 150000,
    materialGoal: 60,
    communityXp: 1800,
    rewardAura: 12000,
    rewardXp: 900,
    rewardCrates: { rare: 2 },
  },
]);
const WORLD_FACTIONS = Object.freeze([
  { id: "wardens", name: "Vault Wardens", principle: "security, archives, and long memory" },
  { id: "bloom", name: "Bloom Syndicate", principle: "gardens, trade routes, and civic generosity" },
  { id: "storm", name: "Storm Choir", principle: "risk, exploration, and strange relic weather" },
]);
const WORLD_SEASONS = Object.freeze([
  { id: "rain", name: "Rain of Glass", economy: "crates and relics feel watched by old mirrors" },
  { id: "ember", name: "Emberwane", economy: "boss routes and forge fires run hot" },
  { id: "bloom", name: "Verdant Return", economy: "gardens and shared projects feel easier to rally around" },
  { id: "static", name: "Static Moon", economy: "expeditions return with stranger reports" },
]);
const WORLD_ARTIFACT_FORMS = Object.freeze(["Gate", "Crown", "Lantern", "Archive", "Bell", "Compass", "Garden", "Engine"]);
const WORLD_ARTIFACT_TONES = Object.freeze({
  wardens: ["sealed", "silver", "remembering", "watchful"],
  bloom: ["green", "warm", "welcoming", "rooted"],
  storm: ["singing", "bright", "restless", "star-cut"],
});
const PARTY_QUEST_ROLES = Object.freeze([
  { id: "scout", name: "Scout", description: "Finds the route." },
  { id: "keeper", name: "Keeper", description: "Protects the memory." },
  { id: "maker", name: "Maker", description: "Repairs the artifact." },
  { id: "voice", name: "Voice", description: "Carries the story back." },
]);
const SERVER_WEATHER_TYPES = Object.freeze({
  bloom: { name: "Bloom Weather", description: "Gifts, gardens, and welcoming actions are shaping the server." },
  civic: { name: "Civic Weather", description: "Projects and memory work are pulling the server together." },
  storm: { name: "Storm Weather", description: "Exploration, boss fights, and world choices are stirring up tension." },
  quiet: { name: "Quiet Skies", description: "The server is calm. A world choice, project, or memory could shift the mood." },
});
const WORLD_ENCOUNTER_TEMPLATES = Object.freeze([
  {
    id: "market_dispute",
    title: "Market Dispute",
    description: "A caravan arrives with relic crates, but three factions claim the right to price them.",
    choices: [
      { id: "audit", label: "Audit Ledgers", factionId: "wardens", text: "The Wardens establish fair records.", influenceDelta: 7 },
      { id: "share", label: "Public Stalls", factionId: "bloom", text: "The Syndicate opens a public market.", influenceDelta: 7 },
      { id: "auction", label: "Storm Auction", factionId: "storm", text: "The Choir turns the sale into a spectacle.", influenceDelta: 7 },
    ],
  },
  {
    id: "singing_gate",
    title: "Singing Gate",
    description: "A gate under the server starts humming names that nobody remembers joining.",
    choices: [
      { id: "seal", label: "Seal It", factionId: "wardens", text: "The gate is indexed and contained.", influenceDelta: 8 },
      { id: "welcome", label: "Welcome It", factionId: "bloom", text: "The gate becomes a gathering site.", influenceDelta: 8 },
      { id: "follow", label: "Follow It", factionId: "storm", text: "Scouts vanish briefly and return with sparks.", influenceDelta: 8 },
    ],
  },
  {
    id: "hollow_rain",
    title: "Hollow Rain",
    description: "Rain falls upward through the channels. Every drop contains a half-finished rumor.",
    choices: [
      { id: "archive", label: "Archive Rumors", factionId: "wardens", text: "Rumors become reliable records.", influenceDelta: 6 },
      { id: "festival", label: "Hold Festival", factionId: "bloom", text: "The server turns the weather into a festival.", influenceDelta: 6 },
      { id: "chase", label: "Chase Storm", factionId: "storm", text: "The Choir maps where the rain returns.", influenceDelta: 6 },
    ],
  },
]);
const WORLD_STORY_LIMIT = 8;
const WORLD_ENCOUNTER_TTL_MS = 24 * 60 * 60 * 1000;
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
    label: "Starter Style Bundle",
    priceEnv: "PADDLE_STARTER_CRATE_BUNDLE_PRICE_ID",
    grants: Object.freeze({
      crates: Object.freeze({ common: 3, rare: 1 }),
      aura: 1500,
      cosmetics: Object.freeze([{ slot: "title", value: "First Spark" }]),
    }),
  }),
  rare_crate_stack: Object.freeze({
    id: "rare_crate_stack",
    label: "Rivalry Style Stack",
    priceEnv: "PADDLE_RARE_CRATE_STACK_PRICE_ID",
    grants: Object.freeze({
      crates: Object.freeze({ rare: 2, epic: 1 }),
      aura: 3000,
      cosmetics: Object.freeze([{ slot: "frame", value: "Rival Frame" }]),
    }),
  }),
  legendary_vault_drop: Object.freeze({
    id: "legendary_vault_drop",
    label: "Legendary Prestige Drop",
    priceEnv: "PADDLE_LEGENDARY_VAULT_DROP_PRICE_ID",
    grants: Object.freeze({
      crates: Object.freeze({ rare: 3, epic: 1 }),
      aura: 7500,
      inventory: Object.freeze({ adrenaline_tonic: 1, health_vial: 2 }),
      cosmetics: Object.freeze([{ slot: "title", value: "Vault Legend" }, { slot: "frame", value: "Legend Frame" }]),
    }),
  }),
  boost_supply_pack: Object.freeze({
    id: "boost_supply_pack",
    label: "Utility Supply Pack",
    priceEnv: "PADDLE_BOOST_SUPPLY_PACK_PRICE_ID",
    grants: Object.freeze({
      inventory: Object.freeze({ health_vial: 3, smoke_bomb: 2, adrenaline_tonic: 1 }),
      aura: 2500,
      cosmetics: Object.freeze([{ slot: "title", value: "Supply Runner" }]),
    }),
  }),
});
const REMINDER_ACTIONS = Object.freeze({
  harvest: { label: "Harvest", command: "/garden harvest" },
  vote: { label: "Top.gg Vote", command: "/vote" },
});
const HEALTHY_REMINDER_ACTIONS = new Set(Object.keys(REMINDER_ACTIONS));
const REMINDER_ACTION_CHOICES = Object.entries(REMINDER_ACTIONS).map(([value, action]) => ({ name: action.label, value }));
const REMINDER_POLL_MS = 60 * 1000;
const FREE_REMINDER_LIMIT = 1;
const PREMIUM_REMINDER_LIMIT = 1;
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

function getTotalLiquidAura(user) {
  return Math.max(0, Number(user?.aura) || 0) + Math.max(0, Number(user?.vaultAura) || 0);
}

function getFaucetMultiplier(user) {
  const holdings = getTotalLiquidAura(user);
  if (holdings <= ECONOMY_RULES.faucetSoftCap) {
    return 1;
  }
  const progress = clamp(
    (holdings - ECONOMY_RULES.faucetSoftCap) / Math.max(1, ECONOMY_RULES.faucetHardCap - ECONOMY_RULES.faucetSoftCap),
    0,
    1
  );
  return 1 - progress * (1 - ECONOMY_RULES.faucetMinimumMultiplier);
}

function applyFaucetDamping(user, amount) {
  return Math.max(0, Math.floor((Number(amount) || 0) * getFaucetMultiplier(user)));
}

function getVaultRate(user, combinedEffects = null) {
  const effects = combinedEffects || getCombinedEffects(user);
  const rawRate = ECONOMY_RULES.vaultBaseRatePerHour
    + (effects.vaultInterestBoost || 0)
    + Math.max(0, Number(user?.prestige) || 0) * ECONOMY_RULES.vaultPrestigeRatePerHour;
  const holdings = Math.max(0, Number(user?.vaultAura) || 0);
  const progress = clamp(
    (holdings - ECONOMY_RULES.vaultDiminishStart) / Math.max(1, ECONOMY_RULES.vaultDiminishFull - ECONOMY_RULES.vaultDiminishStart),
    0,
    1
  );
  const multiplier = 1 - progress * (1 - ECONOMY_RULES.vaultMinimumRateMultiplier);
  return Math.max(0, rawRate * multiplier);
}

function getTransferFee(amount) {
  const normalized = Math.max(0, Math.floor(Number(amount) || 0));
  if (normalized <= ECONOMY_RULES.transferFeeThreshold) {
    return 0;
  }
  return Math.floor((normalized - ECONOMY_RULES.transferFeeThreshold) * ECONOMY_RULES.transferFeeRate);
}

function getCoinflipMaxBet(user) {
  return Math.max(1000, Math.min(ECONOMY_RULES.coinflipMaxBet, Math.floor((Number(user?.aura) || 0) * ECONOMY_RULES.coinflipMaxWalletRatio)));
}

function pickFlavor(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return "";
  }
  return lines[randInt(0, lines.length - 1)];
}

function pickWeighted(values, weightForValue) {
  const totalWeight = values.reduce((sum, value) => sum + Math.max(0, weightForValue(value)), 0);
  let roll = Math.random() * totalWeight;
  for (const value of values) {
    roll -= Math.max(0, weightForValue(value));
    if (roll <= 0) {
      return value;
    }
  }
  return values[values.length - 1] || null;
}

function withFlavor(flavor, result) {
  return [flavor, result].filter(Boolean).join("\n");
}

function formatOtherPlayers(count) {
  return `${formatNumber(count)} other player${count === 1 ? "" : "s"} ${count === 1 ? "has" : "have"}`;
}

async function buildSocialProofFooter(guildId, filter, messageBuilder) {
  const count = await User.countDocuments({ ...buildPlayerLeaderboardFilter(guildId), ...filter });
  return count > 1 ? messageBuilder(count - 1) : null;
}

function buildQuickActionRows(userId, actions = []) {
  const buttons = actions
    .filter((action) => QUICK_ACTIONS[action])
    .slice(0, 5)
    .map((action) => {
      const config = QUICK_ACTIONS[action];
      return new ButtonBuilder()
        .setCustomId(`quick:${action}:${userId}`)
        .setLabel(config.label)
        .setStyle(config.style);
    });
  return buttons.length ? [new ActionRowBuilder().addComponents(...buttons)] : [];
}

function addQuickActions(payload, userId, actions = []) {
  const rows = buildQuickActionRows(userId, actions);
  return rows.length ? { ...payload, components: rows } : payload;
}

function getServerProjectTemplate(projectId) {
  return SERVER_PROJECT_TEMPLATES.find((template) => template.id === projectId) || SERVER_PROJECT_TEMPLATES[0];
}

function createServerProject(projectId = null) {
  const template = projectId ? getServerProjectTemplate(projectId) : pickFlavor(SERVER_PROJECT_TEMPLATES);
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    auraGoal: template.auraGoal,
    materialGoal: template.materialGoal,
    aura: 0,
    materials: new Map(),
    contributors: [],
    completedAt: null,
    startedAt: new Date(),
  };
}

function normalizeServerProject(settings) {
  if (!settings.serverProject || settings.serverProject.completedAt) {
    settings.serverProject = createServerProject();
  }
  if (!settings.serverProject.materials?.get) {
    settings.serverProject.materials = new Map(Object.entries(settings.serverProject.materials || {}));
  }
  settings.serverProject.contributors ||= [];
  settings.serverProject.aura = Math.max(0, Number(settings.serverProject.aura) || 0);
  return settings.serverProject;
}

function getServerProjectMaterialTotal(project) {
  if (!project?.materials) {
    return 0;
  }
  const entries = project.materials.entries ? Array.from(project.materials.entries()) : Object.entries(project.materials);
  return entries.reduce((sum, [, amount]) => sum + (Number(amount) || 0), 0);
}

function getServerProjectContributor(project, userId) {
  let contributor = project.contributors.find((entry) => entry.userId === userId);
  if (!contributor) {
    project.contributors.push({ userId, aura: 0, materials: 0 });
    contributor = project.contributors[project.contributors.length - 1];
  }
  return contributor;
}

function normalizeCommunityIdentity(settings) {
  settings.community ||= {};
  settings.community.xp = Math.max(0, Number(settings.community.xp) || 0);
  settings.community.level = Math.max(1, Number(settings.community.level) || 1);
  settings.community.motto = typeof settings.community.motto === "string" ? settings.community.motto : null;
  settings.community.symbol = typeof settings.community.symbol === "string" ? settings.community.symbol : null;
  settings.community.values = Array.isArray(settings.community.values) ? settings.community.values.slice(0, 5) : [];
  settings.community.completedProjects = Math.max(0, Number(settings.community.completedProjects) || 0);
  settings.community.totalAuraContributed = Math.max(0, Number(settings.community.totalAuraContributed) || 0);
  settings.community.totalMaterialsContributed = Math.max(0, Number(settings.community.totalMaterialsContributed) || 0);
  settings.community.lastProjectCompletedAt ||= null;
  settings.appreciations = Array.isArray(settings.appreciations) ? settings.appreciations.slice(-25) : [];
  return settings.community;
}

function getCampfirePrompt(settings) {
  normalizeWorldState(settings);
  const world = settings.worldState;
  const seed = `${settings.guildId}:${world.seasonId}:${new Date().toISOString().slice(0, 10)}`;
  const index = Math.abs(hashString(seed)) % CAMPFIRE_PROMPTS.length;
  return CAMPFIRE_PROMPTS[index];
}

function buildCampfirePayload(settings, guildName) {
  normalizeCommunityIdentity(settings);
  const recent = (settings.appreciations || []).slice(-5).reverse();
  const recentLines = recent.length
    ? recent.map((entry) => `<@${entry.fromUserId}> -> <@${entry.toUserId}>: ${APPRECIATION_TAGS[entry.tag]?.label || "Kindness"}`).join("\n")
    : "No appreciations recorded yet. Be the first one to make a quiet moment visible.";
  return buildEmbedPayload({
    title: `${guildName} Campfire`,
    description: getCampfirePrompt(settings),
    visual: "help-summary.svg",
    fields: [
      { name: "Share", value: "`/campfire share text:<memory, idea, or thanks>`" },
      { name: "Recent Appreciation", value: recentLines },
      { name: "Why This Exists", value: "Campfire posts are for memories, gratitude, and creative prompts. No streak pressure, no gambling, no leaderboard race." },
    ],
    footer: "Healthy sessions should end feeling connected, not drained.",
  });
}

function buildIdentityPayload(settings, guildName) {
  const community = normalizeCommunityIdentity(settings);
  const values = community.values?.length ? community.values.map((value) => `- ${value}`).join("\n") : "No values set yet.";
  return buildEmbedPayload({
    title: `${guildName} Identity`,
    description: community.motto || "This server has not chosen a motto yet.",
    visual: "core-profile.svg",
    fields: [
      { name: "Symbol", value: community.symbol || "Unset", inline: true },
      { name: "Community Level", value: `${formatNumber(community.level)} - ${getCommunityLevelTitle(community.level)}`, inline: true },
      { name: "Values", value: values },
      { name: "Set Identity", value: "`/identity set motto:<text> symbol:<text> values:<comma separated>`" },
    ],
    footer: "Identity gives the server a shared self-image beyond money and XP.",
  });
}

function getCommunityLevelByXp(xp) {
  const totalXp = Math.max(0, Number(xp) || 0);
  return Math.max(1, Math.floor(Math.sqrt(totalXp / 900)) + 1);
}

function getCommunityLevelTitle(level) {
  if (level >= 10) {
    return "Mythic Community";
  }
  if (level >= 7) {
    return "United Server";
  }
  if (level >= 4) {
    return "Growing Community";
  }
  return "New Community";
}

function getCommunityNextLevelXp(level) {
  const nextLevel = Math.max(2, Number(level) + 1);
  return Math.pow(nextLevel - 1, 2) * 900;
}

function addCommunityProjectProgress(settings, project, template) {
  const community = normalizeCommunityIdentity(settings);
  const materialTotal = getServerProjectMaterialTotal(project);
  community.xp += template.communityXp || 1000;
  community.completedProjects += 1;
  community.totalAuraContributed += Number(project.aura) || 0;
  community.totalMaterialsContributed += materialTotal;
  community.lastProjectCompletedAt = new Date();
  community.level = getCommunityLevelByXp(community.xp);
  settings.markModified("community");
  return community;
}

function getCurrentWorldSeason(date = new Date()) {
  const index = Math.floor(date.getUTCMonth() / 3) % WORLD_SEASONS.length;
  const season = WORLD_SEASONS[index] || WORLD_SEASONS[0];
  return {
    ...season,
    key: `${date.getUTCFullYear()}-${season.id}`,
  };
}

function normalizeWorldState(settings) {
  const season = getCurrentWorldSeason();
  settings.worldState ||= {};
  const world = settings.worldState;
  if (world.seasonId !== season.key) {
    world.seasonId = season.key;
    world.seasonName = season.name;
    world.tension = Math.max(0, Math.floor((Number(world.tension) || 0) * 0.5));
    world.activeEncounter = null;
    world.storyLog ||= [];
    world.storyLog.unshift({
      title: `Season Turn: ${season.name}`,
      text: `The server enters ${season.name}. ${season.economy}.`,
      actorId: null,
      createdAt: new Date(),
    });
    world.storyLog = world.storyLog.slice(0, WORLD_STORY_LIMIT);
  }
  if (!Array.isArray(world.factions) || world.factions.length !== WORLD_FACTIONS.length) {
    const existing = new Map((world.factions || []).map((faction) => [faction.id, faction]));
    world.factions = WORLD_FACTIONS.map((faction) => ({
      id: faction.id,
      name: faction.name,
      influence: clamp(Number(existing.get(faction.id)?.influence) || 50, 0, 100),
      reputation: Number(existing.get(faction.id)?.reputation) || 0,
    }));
  }
  world.factions.forEach((faction) => {
    faction.influence = clamp(Number(faction.influence) || 0, 0, 100);
    faction.reputation = Number(faction.reputation) || 0;
  });
  normalizeWorldArtifact(settings, world);
  world.storyLog ||= [];
  world.storyLog = world.storyLog.slice(0, WORLD_STORY_LIMIT);
  settings.markModified("worldState");
  return world;
}

function getWorldFaction(factionId) {
  return WORLD_FACTIONS.find((faction) => faction.id === factionId) || WORLD_FACTIONS[0];
}

function getFactionChoiceEntries() {
  return WORLD_FACTIONS.map((faction) => ({ name: faction.name, value: faction.id }));
}

function normalizeUserFaction(user) {
  user.faction ||= { id: null, pledgedAt: null };
  if (user.faction.id && !WORLD_FACTIONS.some((faction) => faction.id === user.faction.id)) {
    user.faction.id = null;
    user.faction.pledgedAt = null;
  }
  return user.faction;
}

function getPlayerPowerScore(user) {
  const inventoryPower = (user.inventory || []).reduce((sum, entry) => sum + Math.max(0, Number(entry.quantity) || 0), 0);
  const relicPower = (user.relics || []).reduce((sum, relic) => sum + Math.max(1, Number(relic.count) || 1), 0);
  return Math.floor(
    (Number(user.xp) || 0) / 120
    + (Number(user.aura) || 0) / 1200
    + (Number(user.vaultAura) || 0) / 1800
    + (Number(user.prestige) || 0) * 950
    + (Number(user.rankIndex) || 0) * 180
    + inventoryPower * 9
    + relicPower * 14
    + (Number(user.stats?.bossWins) || 0) * 85
    + (Number(user.stats?.pvpWins) || 0) * 110
  );
}

function getRarestRelicLabel(user) {
  const rarityWeight = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5, mythic: 6 };
  const best = [...(user.relics || [])]
    .sort((a, b) => (rarityWeight[b.rarity] || 0) - (rarityWeight[a.rarity] || 0) || String(a.name).localeCompare(String(b.name)))[0];
  return best ? `${best.name || best.relicId} (${best.rarity || "unknown"})` : "No relic flex yet";
}

function getBlackMarketCycleId(date = new Date()) {
  const day = Math.floor(date.getTime() / (24 * 60 * 60 * 1000));
  return `bm-${day}`;
}

function getBlackMarketOffer(settings, date = new Date()) {
  const world = normalizeWorldState(settings);
  const dominant = getDominantWorldFaction(world);
  const cycleId = getBlackMarketCycleId(date);
  const seed = `${settings.guildId}:${world.seasonId}:${cycleId}:${dominant?.id || "none"}`;
  let pool = BLACK_MARKET_OFFERS.filter((offer) => !offer.factionId || offer.factionId === dominant?.id);
  if (!pool.length) {
    pool = [...BLACK_MARKET_OFFERS];
  }
  const offer = pool[Math.abs(hashString(seed)) % pool.length];
  return { ...offer, cycleId, purchaseKey: `${cycleId}:${offer.id}`, dominantFaction: dominant };
}

function grantBlackMarketOffer(user, offer) {
  normalizeCosmetics(user);
  if (offer.type === "title") {
    if (!user.cosmetics.ownedTitles.includes(offer.value)) {
      user.cosmetics.ownedTitles.push(offer.value);
    }
    user.cosmetics.activeTitle = offer.value;
    return `Title equipped: ${offer.value}`;
  }
  if (offer.type === "frame") {
    if (!user.cosmetics.ownedFrames.includes(offer.value)) {
      user.cosmetics.ownedFrames.push(offer.value);
    }
    user.cosmetics.activeFrame = offer.value;
    return `Frame equipped: ${offer.value}`;
  }
  if (offer.type === "item") {
    addInventoryItem(user, offer.itemId, offer.quantity || 1);
    return `${getInventoryLabel(offer.itemId)} x${formatNumber(offer.quantity || 1)}`;
  }
  return "Contraband claimed";
}

function normalizeBounties(settings) {
  settings.bounties = Array.isArray(settings.bounties) ? settings.bounties : [];
  const now = Date.now();
  settings.bounties = settings.bounties
    .filter((bounty) => bounty?.targetUserId && Number(bounty.amount) > 0)
    .filter((bounty) => bounty.claimedAt || !bounty.expiresAt || new Date(bounty.expiresAt).getTime() > now)
    .slice(-50);
  settings.markModified("bounties");
  return settings.bounties;
}

function getActiveBountiesFor(settings, userId) {
  return normalizeBounties(settings).filter((bounty) => bounty.targetUserId === userId && !bounty.claimedAt);
}

function getActiveBountyValue(settings, userId) {
  return getActiveBountiesFor(settings, userId).reduce((sum, bounty) => sum + Math.max(0, Number(bounty.amount) || 0), 0);
}

function markBountiesClaimed(settings, targetUserId, claimedByUserId) {
  const active = getActiveBountiesFor(settings, targetUserId);
  const payout = active.reduce((sum, bounty) => sum + Math.max(0, Number(bounty.amount) || 0), 0);
  active.forEach((bounty) => {
    bounty.claimedByUserId = claimedByUserId;
    bounty.claimedAt = new Date();
  });
  settings.markModified("bounties");
  return { payout, count: active.length };
}

function isNewbieProtected(user) {
  return (Number(user.rankIndex) || 0) < HEIST_RULES.newbieRankFloor && (Number(user.aura) || 0) < HEIST_RULES.newbieAuraFloor;
}

function hasActiveProtection(user) {
  return user.protectionUntil && new Date(user.protectionUntil).getTime() > Date.now();
}

function hasRevengeMark(attacker, targetId) {
  return attacker.revengeTargetId === targetId && attacker.revengeExpiresAt && new Date(attacker.revengeExpiresAt).getTime() > Date.now();
}

function setRevengeMark(user, targetId) {
  user.revengeTargetId = targetId;
  user.revengeExpiresAt = new Date(Date.now() + REVENGE_WINDOW_MS);
}

function getHeistPlanLabel(plan) {
  const labels = {
    quiet: "Quiet Cut",
    smash: "Smash Raid",
    frame: "Frame Job",
  };
  return labels[plan] || labels.quiet;
}

function getHeistOutcome(thief, victim, plan) {
  normalizeUserFaction(thief);
  normalizeUserFaction(victim);
  const revenge = hasRevengeMark(thief, victim.userId);
  const sameFaction = thief.faction?.id && thief.faction.id === victim.faction?.id;
  const protectedTarget = hasActiveProtection(victim);
  const powerDelta = clamp((getPlayerPowerScore(thief) - getPlayerPowerScore(victim)) / 12000, -0.12, 0.12);
  const planRisk = plan === "smash" ? 0.1 : plan === "frame" ? -0.04 : 0;
  const successChance = clamp(
    0.4
      + powerDelta
      + (revenge ? 0.12 : 0)
      + (sameFaction ? -0.1 : 0)
      + (protectedTarget ? -0.16 : 0)
      + planRisk
      + (Number(thief.prestige) || 0) * 0.01
      - (Number(victim.prestige) || 0) * 0.008,
    0.18,
    0.74
  );
  let cap = HEIST_RULES.walletStealCap + (Number(thief.rankIndex) || 0) * 160;
  if (plan === "smash") {
    cap *= 1.35;
  }
  if (plan === "frame") {
    cap *= 0.65;
  }
  if (revenge) {
    cap *= HEIST_RULES.revengeStealMultiplier;
  }
  if (sameFaction) {
    cap *= HEIST_RULES.factionProtectionMultiplier;
  }
  if (protectedTarget) {
    cap *= HEIST_RULES.protectionMultiplier;
  }
  const stealable = Math.min(
    Math.max(0, Math.floor((Number(victim.aura) || 0) * HEIST_RULES.walletStealRate)),
    Math.floor(cap)
  );
  const heat = plan === "smash" ? 9 : plan === "frame" ? 6 : 4;
  return { successChance, stealable, revenge, sameFaction, protectedTarget, heat };
}

function getDominantWorldFaction(world) {
  return [...(world.factions || [])].sort((a, b) => b.influence - a.influence)[0] || world.factions?.[0];
}

function createWorldArtifact(settings, world) {
  const seed = crypto.createHash("sha256").update(`${settings.guildId}:${world.seasonId}:artifact`).digest("hex");
  const dominant = getDominantWorldFaction(world);
  const faction = getWorldFaction(dominant?.id);
  const form = WORLD_ARTIFACT_FORMS[parseInt(seed.slice(0, 2), 16) % WORLD_ARTIFACT_FORMS.length];
  const tones = WORLD_ARTIFACT_TONES[faction.id] || WORLD_ARTIFACT_TONES.wardens;
  const tone = tones[parseInt(seed.slice(2, 4), 16) % tones.length];
  const nameRoot = ["Aurix", "Moon", "Rift", "Echo", "Civic", "Star"][parseInt(seed.slice(4, 6), 16) % 6];
  return {
    name: `${nameRoot} ${form}`,
    form,
    tone,
    power: 1,
    traits: [`Touched by ${faction.name}`],
    lastChangedAt: new Date(),
  };
}

function normalizeWorldArtifact(settings, world) {
  if (!world.artifact?.name) {
    world.artifact = createWorldArtifact(settings, world);
  }
  world.artifact.power = Math.max(1, Number(world.artifact.power) || 1);
  world.artifact.traits ||= [];
  world.artifact.traits = [...new Set(world.artifact.traits)].slice(0, 6);
  world.artifact.lastChangedAt ||= new Date();
  return world.artifact;
}

function evolveWorldArtifact(settings, world, choice) {
  const artifact = normalizeWorldArtifact(settings, world);
  const faction = getWorldFaction(choice.factionId);
  const tones = WORLD_ARTIFACT_TONES[faction.id] || WORLD_ARTIFACT_TONES.wardens;
  artifact.tone = tones[(artifact.power + artifact.traits.length) % tones.length];
  artifact.power += 1;
  artifact.traits = [
    `${faction.name}: ${choice.label}`,
    ...artifact.traits.filter((trait) => !trait.startsWith(`${faction.name}:`)),
  ].slice(0, 6);
  artifact.lastChangedAt = new Date();
  world.artifact = artifact;
  return artifact;
}

function createWorldEncounter(settings) {
  const world = normalizeWorldState(settings);
  const seed = `${settings.guildId}:${world.seasonId}:${world.storyLog?.length || 0}:${Date.now()}`;
  const hash = crypto.createHash("sha256").update(seed).digest("hex");
  const template = WORLD_ENCOUNTER_TEMPLATES[parseInt(hash.slice(0, 2), 16) % WORLD_ENCOUNTER_TEMPLATES.length];
  const season = getCurrentWorldSeason();
  return {
    id: `${template.id}-${hash.slice(0, 8)}`,
    title: `${template.title}: ${season.name}`,
    description: template.description,
    seasonId: world.seasonId,
    choices: template.choices.map((choice) => ({ ...choice })),
    resolvedBy: null,
    resolvedChoiceId: null,
    expiresAt: new Date(Date.now() + WORLD_ENCOUNTER_TTL_MS),
  };
}

function getActiveWorldEncounter(settings) {
  const world = normalizeWorldState(settings);
  if (!world.activeEncounter?.id || world.activeEncounter?.resolvedChoiceId || new Date(world.activeEncounter.expiresAt || 0).getTime() <= Date.now()) {
    world.activeEncounter = createWorldEncounter(settings);
    world.lastEncounterAt = new Date();
    settings.markModified("worldState");
  }
  return world.activeEncounter;
}

function buildWorldDecisionRows(encounter, guildId) {
  if (!encounter?.choices?.length) {
    return [];
  }
  return [
    new ActionRowBuilder().addComponents(
      ...encounter.choices.slice(0, 3).map((choice) => new ButtonBuilder()
        .setCustomId(`world:choice:${guildId}:${choice.id}`)
        .setLabel(choice.label)
        .setStyle(ButtonStyle.Secondary))
    ),
  ];
}

function buildWorldPayload(settings, guildName) {
  const world = normalizeWorldState(settings);
  const season = getCurrentWorldSeason();
  const dominant = getDominantWorldFaction(world);
  const encounter = getActiveWorldEncounter(settings);
  const artifact = normalizeWorldArtifact(settings, world);
  const factionLines = world.factions
    .map((faction) => `**${faction.name}** ${progressBar(faction.influence, 100, 8)} ${formatNumber(faction.influence)} influence`)
    .join("\n");
  const storyLines = world.storyLog.length
    ? world.storyLog.slice(0, 4).map((entry) => `**${entry.title}** - ${entry.text}`).join("\n")
    : "No server stories have been written yet. Resolve a world encounter to begin.";
  return withExtraComponents(buildEmbedPayload({
    title: `${guildName} World`,
    description: `Season: **${season.name}**\nDominant faction: **${dominant?.name || "None"}**\nTension: ${progressBar(world.tension, 100, 10)} ${formatNumber(world.tension)} / 100`,
    visual: "help-summary.svg",
    fields: [
      { name: "Factions", value: factionLines || "No factions active." },
      { name: "Server Artifact", value: `**${artifact.name}**\nA ${artifact.tone} ${artifact.form.toLowerCase()} at power ${formatNumber(artifact.power)}.` },
      { name: "Active Encounter", value: `**${encounter.title}**\n${encounter.description}\nExpires in ${humanizeMs(new Date(encounter.expiresAt).getTime() - Date.now())}` },
      { name: "Story So Far", value: storyLines },
    ],
    footer: "Use /world encounter or the decision buttons to push the server story in one direction.",
  }), buildWorldDecisionRows(encounter, settings.guildId));
}

function buildWorldArtifactPayload(settings, guildName) {
  const world = normalizeWorldState(settings);
  const artifact = normalizeWorldArtifact(settings, world);
  const dominant = getDominantWorldFaction(world);
  const traits = artifact.traits?.length ? artifact.traits.map((trait) => `- ${trait}`).join("\n") : "No traits yet.";
  return buildEmbedPayload({
    title: `${guildName}'s ${artifact.name}`,
    description: `A **${artifact.tone} ${artifact.form.toLowerCase()}** shaped by this server's decisions.`,
    visual: "emblem-success.svg",
    fields: [
      { name: "Power", value: `${formatNumber(artifact.power)}`, inline: true },
      { name: "Dominant Faction", value: dominant?.name || "None", inline: true },
      { name: "Traits", value: traits },
      { name: "Share Hook", value: `This artifact is unique to **${guildName}** and changes when the community resolves world encounters.` },
    ],
    footer: artifact.lastChangedAt ? `Last changed: ${new Date(artifact.lastChangedAt).toISOString().slice(0, 10)}` : "Resolve world encounters to evolve it.",
  });
}

function buildWorldRecapPayload(settings, guildName) {
  const world = normalizeWorldState(settings);
  const season = getCurrentWorldSeason();
  const artifact = normalizeWorldArtifact(settings, world);
  const dominant = getDominantWorldFaction(world);
  const storyLines = world.storyLog.length
    ? world.storyLog.slice(0, 5).map((entry, index) => `${index + 1}. **${entry.title}** - ${entry.text}`).join("\n")
    : "No story entries yet. Use `/world encounter` to create the first one.";
  const factionSummary = [...world.factions]
    .sort((a, b) => b.influence - a.influence)
    .map((faction) => `${faction.name}: ${formatNumber(faction.influence)}`)
    .join(" | ");
  return buildEmbedPayload({
    title: `${guildName}: Story So Far`,
    description: [
      `Season: **${season.name}**`,
      `Leading faction: **${dominant?.name || "None"}**`,
      `Artifact: **${artifact.name}**, a ${artifact.tone} ${artifact.form.toLowerCase()} at power ${formatNumber(artifact.power)}`,
    ].join("\n"),
    visual: "help-summary.svg",
    fields: [
      { name: "Faction Map", value: factionSummary || "No factions active." },
      { name: "Recent Story", value: storyLines },
      { name: "Invite Prompt", value: "Bring people into the next decision with `/world encounter`. This recap is designed to be posted in announcements or shared as a screenshot." },
    ],
    footer: "Aurix turns server decisions into a persistent community myth.",
  });
}

function getMonthId(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function normalizeCreatorChallenge(settings) {
  settings.creatorChallenge ||= {};
  settings.creatorChallenge.entries ||= [];
  if (settings.creatorChallenge.expiresAt && new Date(settings.creatorChallenge.expiresAt).getTime() <= Date.now()) {
    settings.creatorChallenge.prompt = null;
    settings.creatorChallenge.theme = null;
    settings.creatorChallenge.createdBy = null;
    settings.creatorChallenge.createdAt = null;
    settings.creatorChallenge.expiresAt = null;
    settings.creatorChallenge.entries = [];
  }
  settings.markModified("creatorChallenge");
  return settings.creatorChallenge;
}

function buildCreatorChallengePayload(settings) {
  const challenge = normalizeCreatorChallenge(settings);
  if (!challenge.prompt) {
    return buildEmbedPayload({
      title: "Creator Challenge Board",
      description: "No creator challenge is active. Mods can start one with `/challenge create`.",
      visual: "help-summary.svg",
      footer: "Challenges are for memes, art, clips, screenshots, stories, builds, and server rituals.",
    });
  }
  const entries = challenge.entries
    .slice(-8)
    .reverse()
    .map((entry, index) => `${index + 1}. <@${entry.userId}> - ${entry.text}`)
    .join("\n");
  return buildEmbedPayload({
    title: `Creator Challenge: ${challenge.theme || "Server Prompt"}`,
    description: challenge.prompt,
    visual: "help-summary.svg",
    fields: [
      { name: "Entries", value: entries || "No entries yet. Submit with `/challenge submit`." },
      { name: "Ends", value: challenge.expiresAt ? new Date(challenge.expiresAt).toISOString().slice(0, 10) : "No end set", inline: true },
      { name: "Share Hook", value: "Use this for fanart, memes, screenshots, clips, and lore prompts." },
    ],
  });
}

function createMemoryQuest(settings) {
  const world = normalizeWorldState(settings);
  const artifact = normalizeWorldArtifact(settings, world);
  const dominant = getDominantWorldFaction(world);
  const title = `${artifact.name} Chronicle`;
  return {
    id: crypto.randomUUID().slice(0, 8),
    title,
    description: `Collect memories for the ${artifact.name}. The ${dominant?.name || "server"} wants proof that this season mattered.`,
    goal: 12,
    progress: 0,
    contributors: [],
    completedAt: null,
    createdAt: new Date(),
  };
}

function normalizeMemoryQuest(settings) {
  if (!settings.memoryQuest || settings.memoryQuest.completedAt) {
    settings.memoryQuest = createMemoryQuest(settings);
  }
  settings.memoryQuest.contributors ||= [];
  settings.memoryQuest.progress = Math.max(0, Number(settings.memoryQuest.progress) || 0);
  settings.markModified("memoryQuest");
  return settings.memoryQuest;
}

function buildMemoryQuestPayload(settings) {
  const quest = normalizeMemoryQuest(settings);
  const contributors = [...(quest.contributors || [])]
    .sort((a, b) => (b.amount || 0) - (a.amount || 0))
    .slice(0, 5)
    .map((entry, index) => `${index + 1}. <@${entry.userId}> - ${formatNumber(entry.amount)} memories`)
    .join("\n");
  return buildEmbedPayload({
    title: `Memory Quest: ${quest.title}`,
    description: `${quest.description}\n\n${progressBar(quest.progress, quest.goal)}\n${formatNumber(quest.progress)} / ${formatNumber(quest.goal)} memories`,
    visual: "help-summary.svg",
    fields: [
      { name: "Contribute", value: "`/memoryquest contribute memory:<short memory>`" },
      { name: "Top Memory Keepers", value: contributors || "No memories contributed yet." },
    ],
    footer: "Memory quests turn server moments into shared lore instead of disposable chat noise.",
  });
}

function getServerWeather(settings) {
  const world = normalizeWorldState(settings);
  const community = normalizeCommunityIdentity(settings);
  const memoryProgress = Number(settings.memoryQuest?.progress) || 0;
  const challengeEntries = settings.creatorChallenge?.entries?.length || 0;
  const projectWeight = community.completedProjects * 4 + (settings.serverProject?.contributors?.length || 0);
  const storyWeight = (world.storyLog?.length || 0) + world.tension / 12;
  const bloomWeight = challengeEntries * 2 + (community.totalMaterialsContributed || 0) / 80;
  const civicWeight = projectWeight + memoryProgress;
  const stormWeight = storyWeight + (getDominantWorldFaction(world)?.id === "storm" ? 4 : 0);
  const scores = [
    ["bloom", bloomWeight],
    ["civic", civicWeight],
    ["storm", stormWeight],
  ].sort((a, b) => b[1] - a[1]);
  const [weatherId, score] = scores[0];
  const weather = score > 0 ? SERVER_WEATHER_TYPES[weatherId] : SERVER_WEATHER_TYPES.quiet;
  return { id: score > 0 ? weatherId : "quiet", score, weather, scores };
}

function buildServerWeatherPayload(settings, guildName) {
  const { weather, scores } = getServerWeather(settings);
  return buildEmbedPayload({
    title: `${guildName} Weather`,
    description: weather.description,
    visual: "help-summary.svg",
    fields: [
      { name: "Current Mood", value: weather.name, inline: true },
      { name: "Signals", value: scores.map(([id, score]) => `${SERVER_WEATHER_TYPES[id].name}: ${formatNumber(score)}`).join("\n") },
      { name: "How To Shift It", value: "Creator entries strengthen Bloom. Projects and memory quests strengthen Civic. World decisions and encounters strengthen Storm." },
    ],
    footer: "Weather is social feedback, not a timer. It reflects how the server is choosing to play.",
  });
}

function buildNpcLetterPayload(settings, guildName) {
  const world = normalizeWorldState(settings);
  const artifact = normalizeWorldArtifact(settings, world);
  const faction = getWorldFaction(getDominantWorldFaction(world)?.id);
  const latestStory = world.storyLog?.[0];
  const greeting = {
    wardens: "Filed under living history",
    bloom: "Sent with warm roots",
    storm: "Carried on bright static",
  }[faction.id] || "Sent from the road";
  return buildEmbedPayload({
    title: `Letter From ${faction.name}`,
    description: [
      `**${greeting}, ${guildName}.**`,
      latestStory ? `We noticed **${latestStory.title}**. ${latestStory.text}` : `Your ${artifact.name} is still waiting for its first true legend.`,
      `The ${artifact.name} now feels ${artifact.tone}. Keep choosing together, and it will become impossible to mistake for anyone else's story.`,
    ].join("\n\n"),
    visual: "help-summary.svg",
    fields: [
      { name: "Faction Mood", value: faction.principle },
      { name: "Artifact Mentioned", value: `${artifact.name}, power ${formatNumber(artifact.power)}`, inline: true },
    ],
    footer: "NPC letters turn recent server actions into shareable lore.",
  });
}

function createPartyQuest(settings) {
  const world = normalizeWorldState(settings);
  const artifact = normalizeWorldArtifact(settings, world);
  return {
    id: crypto.randomUUID().slice(0, 8),
    title: `${artifact.name} Expedition`,
    description: `A four-role expedition to recover a missing piece of the ${artifact.name}.`,
    roles: PARTY_QUEST_ROLES.map((role) => ({ role: role.id, userId: null })),
    progress: 0,
    goal: PARTY_QUEST_ROLES.length,
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    completedAt: null,
    createdAt: new Date(),
  };
}

function normalizePartyQuest(settings) {
  if (!settings.partyQuest || settings.partyQuest.completedAt || new Date(settings.partyQuest.expiresAt || 0).getTime() <= Date.now()) {
    settings.partyQuest = createPartyQuest(settings);
  }
  settings.partyQuest.roles ||= PARTY_QUEST_ROLES.map((role) => ({ role: role.id, userId: null }));
  settings.partyQuest.progress = settings.partyQuest.roles.filter((role) => role.userId).length;
  settings.markModified("partyQuest");
  return settings.partyQuest;
}

function buildPartyQuestPayload(settings) {
  const quest = normalizePartyQuest(settings);
  const roleLines = quest.roles.map((entry) => {
    const role = PARTY_QUEST_ROLES.find((item) => item.id === entry.role) || { name: entry.role, description: "Role" };
    return `**${role.name}** - ${entry.userId ? `<@${entry.userId}>` : "Open"}\n${role.description}`;
  }).join("\n\n");
  return buildEmbedPayload({
    title: `Co-op Expedition: ${quest.title}`,
    description: `${quest.description}\n\n${progressBar(quest.progress, quest.goal)}\n${formatNumber(quest.progress)} / ${formatNumber(quest.goal)} roles filled`,
    visual: "help-summary.svg",
    fields: [
      { name: "Roles", value: roleLines },
      { name: "Join", value: "`/partyquest join role:<role>`" },
    ],
    footer: "Co-op expeditions reward a complete team, not solo grinding.",
  });
}

async function completePartyQuest(settings) {
  const quest = settings.partyQuest;
  const world = normalizeWorldState(settings);
  const artifact = normalizeWorldArtifact(settings, world);
  artifact.power += 1;
  artifact.traits = [`Co-op Expedition: ${quest.title}`, ...artifact.traits].slice(0, 6);
  artifact.lastChangedAt = new Date();
  world.storyLog.unshift({
    title: quest.title,
    text: `A full party restored a missing piece of **${artifact.name}**.`,
    actorId: null,
    createdAt: new Date(),
  });
  world.storyLog = world.storyLog.slice(0, WORLD_STORY_LIMIT);
  quest.completedAt = new Date();
  settings.markModified("worldState");
  settings.markModified("partyQuest");
  await settings.save();
}

async function buildYearbookPayload(settings, guildName) {
  const monthId = getMonthId();
  const [helpers, builders, explorers, artists] = await Promise.all([
    User.find(buildPlayerLeaderboardFilter(settings.guildId)).sort({ "stats.giftsSent": -1, updatedAt: -1 }).limit(1).lean(),
    User.find(buildPlayerLeaderboardFilter(settings.guildId)).sort({ "stats.projectContributions": -1, updatedAt: -1 }).limit(1).lean(),
    User.find(buildPlayerLeaderboardFilter(settings.guildId)).sort({ "stats.bossWins": -1, "stats.mines": -1 }).limit(1).lean(),
    Promise.resolve((settings.creatorChallenge?.entries || []).slice(-1)),
  ]);
  const highlights = [
    helpers[0] ? { category: "Welcoming Hand", userId: helpers[0].userId, label: "Most generous helper", score: helpers[0].stats?.giftsSent || 0 } : null,
    builders[0] ? { category: "Project Builder", userId: builders[0].userId, label: "Most project contributions", score: builders[0].stats?.projectContributions || 0 } : null,
    explorers[0] ? { category: "World Runner", userId: explorers[0].userId, label: "Most adventure momentum", score: (explorers[0].stats?.bossWins || 0) + (explorers[0].stats?.mines || 0) } : null,
    artists[0] ? { category: "Creator Spark", userId: artists[0].userId, label: "Latest creator challenge entry", score: 1 } : null,
  ].filter(Boolean);
  settings.yearbook = { monthId, generatedAt: new Date(), highlights };
  settings.markModified("yearbook");
  const world = normalizeWorldState(settings);
  const artifact = normalizeWorldArtifact(settings, world);
  const lines = highlights.map((entry) => `**${entry.category}** - <@${entry.userId}>\n${entry.label} (${formatNumber(entry.score)})`).join("\n\n");
  return buildEmbedPayload({
    title: `${guildName} Yearbook: ${monthId}`,
    description: `A shareable community snapshot for this server.\nArtifact: **${artifact.name}**, power ${formatNumber(artifact.power)}.`,
    visual: "core-profile.svg",
    fields: [
      { name: "Highlights", value: lines || "Not enough activity yet. Gifts, projects, memories, and creator entries fill this in." },
      { name: "Story Hook", value: world.storyLog?.[0] ? `Latest: **${world.storyLog[0].title}** - ${world.storyLog[0].text}` : "No story entries yet." },
    ],
    footer: "Post this in announcements as a lightweight community yearbook card.",
  });
}

async function resolveWorldEncounter(interaction, choiceId) {
  const settings = await getOrCreateGuildSettings(interaction.guildId);
  const world = normalizeWorldState(settings);
  const encounter = getActiveWorldEncounter(settings);
  if (encounter.resolvedChoiceId) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Encounter Resolved", description: "This world encounter has already become part of the server story.", visual: "emblem-help.svg" }), ephemeral: true });
  }
  const choice = encounter.choices.find((entry) => entry.id === choiceId);
  if (!choice) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Choice Missing", description: "That world choice is no longer available.", visual: "emblem-alert.svg" }), ephemeral: true });
  }

  const faction = world.factions.find((entry) => entry.id === choice.factionId);
  if (faction) {
    faction.influence = clamp((Number(faction.influence) || 0) + (choice.influenceDelta || 0), 0, 100);
    faction.reputation += 1;
  }
  const artifact = evolveWorldArtifact(settings, world, choice);
  world.tension = clamp((Number(world.tension) || 0) + 6, 0, 100);
  encounter.resolvedBy = interaction.user.id;
  encounter.resolvedChoiceId = choice.id;
  world.storyLog.unshift({
    title: encounter.title,
    text: `<@${interaction.user.id}> chose **${choice.label}**. ${choice.text}`,
    actorId: interaction.user.id,
    createdAt: new Date(),
  });
  world.storyLog = world.storyLog.slice(0, WORLD_STORY_LIMIT);
  world.activeEncounter = null;
  settings.markModified("worldState");

  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  if (!user.reputation?.get) {
    user.reputation = new Map(Object.entries(user.reputation || {}));
  }
  user.reputation.set(choice.factionId, (user.reputation.get(choice.factionId) || 0) + 1);
  user.xp += 120;
  await syncRank(user);
  await user.save();
  await settings.save();
  eventBus.publish("world.choice_resolved", {
    guildId: interaction.guildId,
    userId: interaction.user.id,
    metadata: {
      encounterId: encounter.id,
      choiceId: choice.id,
      factionId: choice.factionId,
      artifactPower: artifact.power,
    },
  });

  const factionInfo = getWorldFaction(choice.factionId);
  return interaction.reply(buildEmbedPayload({
    title: "World Story Advanced",
    description: `${choice.text}\n\nThe **${factionInfo.name}** gained influence, and **${artifact.name}** changed with the decision.`,
    visual: "emblem-success.svg",
    fields: [
      { name: "Reputation", value: `+1 with ${factionInfo.name}`, inline: true },
      { name: "XP", value: "+120", inline: true },
      { name: "Artifact", value: `${artifact.tone} ${artifact.form}, power ${formatNumber(artifact.power)}`, inline: true },
      { name: "World Tension", value: `${formatNumber(world.tension)} / 100`, inline: true },
    ],
  }));
}

function buildServerProjectPayload(project) {
  const template = getServerProjectTemplate(project.id);
  const materialTotal = getServerProjectMaterialTotal(project);
  const materialLines = Array.from(project.materials.entries ? project.materials.entries() : Object.entries(project.materials || {}))
    .filter(([, amount]) => amount > 0)
    .map(([materialId, amount]) => `${getInventoryLabel(materialId)} x${formatNumber(amount)}`)
    .join("\n");
  const topContributors = [...(project.contributors || [])]
    .sort((a, b) => (b.aura + b.materials * 1000) - (a.aura + a.materials * 1000))
    .slice(0, 5)
    .map((entry, index) => `${index + 1}. <@${entry.userId}> - ${formatNumber(entry.aura || 0)} aura, ${formatNumber(entry.materials || 0)} materials`)
    .join("\n");

  return buildEmbedPayload({
    title: `Server Project: ${project.name}`,
    description: `${project.description}\n\n${progressBar(project.aura, project.auraGoal)}\n${formatNumber(project.aura)} / ${formatNumber(project.auraGoal)} aura\n${progressBar(materialTotal, project.materialGoal)}\n${formatNumber(materialTotal)} / ${formatNumber(project.materialGoal)} materials`,
    visual: "clan-hall.svg",
    fields: [
      { name: "Contribute Aura", value: "`/project contribute-aura amount:<amount>`", inline: true },
      { name: "Contribute Materials", value: "`/project contribute-material material:<id> amount:<amount>`", inline: true },
      { name: "Completion Reward", value: `Contribution-weighted pool up to ${formatNumber(Math.floor(template.rewardAura * ECONOMY_RULES.projectRewardPoolCapContributors))} aura, plus XP${Object.entries(template.rewardCrates || {}).length ? ` and major-contributor crates` : ""}` },
      { name: "Materials Banked", value: materialLines || "No materials donated yet." },
      { name: "Top Contributors", value: topContributors || "No contributors yet." },
    ],
    footer: "Projects are shared server sinks. Donations are spent into the project and cannot be withdrawn.",
  });
}

function buildCommunityPayload(settings, guildName = "This server") {
  const community = normalizeCommunityIdentity(settings);
  const project = normalizeServerProject(settings);
  const nextLevelXp = getCommunityNextLevelXp(community.level);
  const currentLevelBaseXp = getCommunityNextLevelXp(Math.max(1, community.level - 1));
  const currentProgress = Math.max(0, community.xp - currentLevelBaseXp);
  const neededProgress = Math.max(1, nextLevelXp - currentLevelBaseXp);

  return buildEmbedPayload({
    title: `${guildName} Community`,
    description: `${getCommunityLevelTitle(community.level)}\n${progressBar(currentProgress, neededProgress)}\n${formatNumber(currentProgress)} / ${formatNumber(neededProgress)} community XP to level ${community.level + 1}.`,
    visual: "clan-hall.svg",
    fields: [
      { name: "Community Level", value: `${formatNumber(community.level)}`, inline: true },
      { name: "Projects Completed", value: `${formatNumber(community.completedProjects)}`, inline: true },
      { name: "Total Contributions", value: `${formatNumber(community.totalAuraContributed)} aura\n${formatNumber(community.totalMaterialsContributed)} materials`, inline: true },
      { name: "Active Project", value: `**${project.name}**\n${formatNumber(project.aura)} / ${formatNumber(project.auraGoal)} aura\n${formatNumber(getServerProjectMaterialTotal(project))} / ${formatNumber(project.materialGoal)} materials` },
      { name: "Identity", value: "Community levels come from shared projects, not solo cooldown grinding. Higher levels can later unlock server cosmetics, titles, event themes, and role-shop perks." },
    ],
    footer: community.lastProjectCompletedAt ? `Last project completed: ${community.lastProjectCompletedAt.toISOString().slice(0, 10)}` : "Complete projects to shape this server's identity.",
  });
}

function isServerProjectComplete(project) {
  return project.aura >= project.auraGoal && getServerProjectMaterialTotal(project) >= project.materialGoal;
}

async function completeServerProject(settings, project) {
  const template = getServerProjectTemplate(project.id);
  const contributors = [...(project.contributors || [])].filter((entry) => (entry.aura || 0) > 0 || (entry.materials || 0) > 0);
  const contributorIds = contributors.map((entry) => entry.userId);
  const users = contributorIds.length
    ? await User.find({ ...buildPlayerLeaderboardFilter(settings.guildId), userId: { $in: contributorIds } })
    : [];
  const usersById = new Map(users.map((user) => [user.userId, user]));
  const contributionScores = contributors.map((contributor) => ({
    userId: contributor.userId,
    score: Math.max(0, ((contributor.aura || 0) / Math.max(1, project.auraGoal)) + ((contributor.materials || 0) / Math.max(1, project.materialGoal))),
  }));
  const totalScore = contributionScores.reduce((sum, entry) => sum + entry.score, 0) || 1;
  const scoresByUserId = new Map(contributionScores.map((entry) => [entry.userId, entry.score]));
  const auraRewardPool = Math.min(
    template.rewardAura * Math.min(contributors.length, ECONOMY_RULES.projectRewardPoolCapContributors),
    Math.floor((Number(project.aura) || 0) * ECONOMY_RULES.projectRewardMaxSinkRatio)
  );

  for (const contributor of contributors) {
    const user = usersById.get(contributor.userId);
    if (!user) {
      continue;
    }
    const rawShare = (scoresByUserId.get(contributor.userId) || 0) / totalScore;
    const share = Math.min(rawShare, 0.45);
    user.aura += Math.floor(auraRewardPool * share);
    user.xp += Math.floor(template.rewardXp * Math.max(0.25, share * contributors.length));
    if (rawShare >= 0.08) {
      Object.entries(template.rewardCrates || {}).forEach(([crateId, amount]) => {
        user.crates.set(crateId, (user.crates.get(crateId) || 0) + amount);
      });
    }
    await syncRank(user);
    await user.save();
  }

  addCommunityProjectProgress(settings, project, template);
  project.completedAt = new Date();
  settings.serverProject = createServerProject();
  settings.markModified("serverProject");
  await settings.save();
  return { template, contributors: contributors.length };
}

function withExtraComponents(payload, rows = []) {
  const components = [...(payload.components || []), ...rows].slice(0, 5);
  return components.length ? { ...payload, components } : payload;
}

function normalizeTutorialState(user) {
  user.tutorial ||= {};
  user.tutorial.step = Number(user.tutorial.step) || 0;
  user.tutorial.completed = Boolean(user.tutorial.completed);
  user.tutorial.claimedSteps ||= [];
}

function getTutorialStatusLines(user) {
  normalizeTutorialState(user);
  return TUTORIAL_STEPS.map((step, index) => {
    const complete = user.tutorial.claimedSteps.includes(step.id);
    const active = !user.tutorial.completed && index === user.tutorial.step;
    const status = complete ? "Done" : active ? "Next" : "Locked";
    return `${index + 1}. ${step.label} - ${status}`;
  }).join("\n");
}

async function advanceTutorial(user, commandName, subcommand = null) {
  normalizeTutorialState(user);
  if (user.tutorial.completed) {
    return null;
  }
  const step = TUTORIAL_STEPS[user.tutorial.step];
  if (!step || step.command !== commandName || (step.id === "vault" && subcommand !== "deposit")) {
    return null;
  }
  if (!user.tutorial.claimedSteps.includes(step.id)) {
    user.tutorial.claimedSteps.push(step.id);
  }
  user.tutorial.step += 1;
  user.aura += step.rewardAura;
  user.xp += step.rewardXp;
  const completed = user.tutorial.step >= TUTORIAL_STEPS.length;
  user.tutorial.completed = completed;
  await syncRank(user);
  return {
    step,
    completed,
    message: completed
      ? `Tutorial complete. Bonus paid: ${formatNumber(step.rewardAura)} aura and ${formatNumber(step.rewardXp)} XP.`
      : `Tutorial step complete: ${step.label}. Bonus paid: ${formatNumber(step.rewardAura)} aura and ${formatNumber(step.rewardXp)} XP.`,
  };
}

function getActiveServerEvent(settings) {
  const event = settings?.activeEvent;
  if (!event?.id || !event.expiresAt) {
    return null;
  }
  return new Date(event.expiresAt).getTime() > Date.now() ? event : null;
}

function formatServerEvent(event) {
  const activityLine = event.activity?.prompt ? `\nActivity: ${event.activity.prompt}` : "";
  return `**${event.name}**\n${event.description}${activityLine}\nReward: ${formatNumber(event.rewardAura)} aura, ${formatNumber(event.rewardXp)} XP\nExpires in ${humanizeMs(new Date(event.expiresAt).getTime() - Date.now())}`;
}

function normalizeRecentServerEventIds(settings) {
  if (!Array.isArray(settings.recentEventIds)) {
    settings.recentEventIds = [];
  }
  settings.recentEventIds = settings.recentEventIds
    .filter(Boolean)
    .slice(-SERVER_EVENT_RECENT_HISTORY_LIMIT);
  return settings.recentEventIds;
}

function pickServerEventTemplate(settings) {
  const recentEventIds = normalizeRecentServerEventIds(settings);
  const availableTemplates = SERVER_EVENT_TEMPLATES.filter((template) => !recentEventIds.includes(template.id));
  return pickFlavor(availableTemplates.length ? availableTemplates : SERVER_EVENT_TEMPLATES);
}

function rememberServerEventId(settings, eventId) {
  const recentEventIds = normalizeRecentServerEventIds(settings);
  settings.recentEventIds = [...recentEventIds.filter((id) => id !== eventId), eventId]
    .slice(-SERVER_EVENT_RECENT_HISTORY_LIMIT);
}

function buildServerEventActivity(template) {
  const activity = template?.activity;
  if (!activity?.choices?.length) {
    return null;
  }
  const correctChoice = activity.choices.find((choice) => choice.correct) || activity.choices[0];
  return {
    prompt: activity.prompt,
    choices: activity.choices.map(({ id, label }) => ({ id, label })),
    answer: correctChoice.id,
    success: activity.success,
    failure: activity.failure,
  };
}

function buildServerEventActivityRows(guildId, activity) {
  const choices = activity?.choices || [];
  if (!guildId || !choices.length) {
    return [];
  }
  return [
    new ActionRowBuilder().addComponents(
      ...choices.slice(0, 5).map((choice) => new ButtonBuilder()
        .setCustomId(`event:activity:${guildId}:${choice.id}`)
        .setLabel(choice.label)
        .setStyle(ButtonStyle.Primary))
    ),
  ];
}

function formatServerEventBonus(event) {
  const bonus = event?.bonus || {};
  const lines = [];

  if (bonus.auraMultiplier) {
    lines.push(`+${formatNumber(Math.floor((Number(event.rewardAura) || 0) * bonus.auraMultiplier))} bonus aura`);
  }
  if (bonus.xpMultiplier) {
    lines.push(`+${formatNumber(Math.floor((Number(event.rewardXp) || 0) * bonus.xpMultiplier))} bonus XP`);
  }
  if (bonus.vaultAura) {
    lines.push(`${formatNumber(bonus.vaultAura)} aura deposited into your vault`);
  }
  Object.entries(bonus.crates || {}).forEach(([crateId, quantity]) => {
    if (CRATES[crateId] && quantity > 0) {
      lines.push(`${getCrateLabel(crateId)} x${formatNumber(quantity)}`);
    }
  });
  Object.entries(bonus.materials || {}).forEach(([materialId, quantity]) => {
    if (MATERIALS[materialId] && quantity > 0) {
      lines.push(`${getInventoryLabel(materialId)} x${formatNumber(quantity)}`);
    }
  });
  Object.entries(bonus.items || {}).forEach(([itemId, quantity]) => {
    if (getItem(itemId) && quantity > 0) {
      lines.push(`${getInventoryLabel(itemId)} x${formatNumber(quantity)}`);
    }
  });

  return lines;
}

function applyServerEventRewards(user, event) {
  const bonus = event?.bonus || {};
  let auraReward = (Number(event.rewardAura) || 0) + Math.floor((Number(event.rewardAura) || 0) * (Number(bonus.auraMultiplier) || 0));
  const xpReward = (Number(event.rewardXp) || 0) + Math.floor((Number(event.rewardXp) || 0) * (Number(bonus.xpMultiplier) || 0));
  const bonusLines = formatServerEventBonus(event);

  auraReward = applyFaucetDamping(user, auraReward);
  user.aura += auraReward;
  user.xp += xpReward;

  if (bonus.vaultAura > 0) {
    user.vaultAura += bonus.vaultAura;
  }
  Object.entries(bonus.crates || {}).forEach(([crateId, quantity]) => {
    if (CRATES[crateId] && quantity > 0) {
      user.crates.set(crateId, (user.crates.get(crateId) || 0) + quantity);
    }
  });
  Object.entries(bonus.materials || {}).forEach(([materialId, quantity]) => {
    if (MATERIALS[materialId] && quantity > 0) {
      addInventoryItem(user, materialId, quantity);
    }
  });
  Object.entries(bonus.items || {}).forEach(([itemId, quantity]) => {
    if (getItem(itemId) && quantity > 0) {
      addInventoryItem(user, itemId, quantity);
    }
  });

  return { auraReward, xpReward, bonusLines };
}

async function reserveServerEventClaim(settings, event, userId) {
  if (!settings?._id || !event?.id || !userId) {
    return false;
  }

  const result = await GuildSettings.updateOne(
    {
      _id: settings._id,
      "activeEvent.id": event.id,
      "activeEvent.expiresAt": { $gt: new Date() },
      "activeEvent.claimedUserIds": { $ne: userId },
    },
    { $addToSet: { "activeEvent.claimedUserIds": userId } }
  );
  return result.modifiedCount > 0;
}

async function reserveServerEventActivityAttempt(settings, event, userId, correct) {
  if (!settings?._id || !event?.id || !userId) {
    return false;
  }

  const update = {
    $addToSet: {
      "activeEvent.attemptedUserIds": userId,
    },
  };
  if (correct) {
    update.$addToSet["activeEvent.claimedUserIds"] = userId;
  }

  const result = await GuildSettings.updateOne(
    {
      _id: settings._id,
      "activeEvent.id": event.id,
      "activeEvent.expiresAt": { $gt: new Date() },
      "activeEvent.attemptedUserIds": { $ne: userId },
      "activeEvent.claimedUserIds": { $ne: userId },
    },
    update
  );
  return result.modifiedCount > 0;
}

async function claimServerEvent(interaction) {
  const settings = await getOrCreateGuildSettings(interaction.guildId);
  const activeServerEvent = getActiveServerEvent(settings);
  if (!activeServerEvent) {
    return interaction.reply({ ...buildEmbedPayload({ title: "No Server Event", description: "No claimable server event is active right now.", visual: "emblem-alert.svg" }), ephemeral: true });
  }
  if (activeServerEvent.claimedUserIds?.includes(interaction.user.id)) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Already Claimed", description: "You already claimed this server event.", visual: "emblem-help.svg" }), ephemeral: true });
  }
  if (activeServerEvent.attemptedUserIds?.includes(interaction.user.id)) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Already Attempted", description: "You already used your attempt for this server event.", visual: "emblem-help.svg" }), ephemeral: true });
  }
  if (activeServerEvent.activity?.answer) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Activity Required", description: activeServerEvent.activity.prompt || "Use the event buttons to complete this server event.", visual: "emblem-help.svg" }), ephemeral: true });
  }
  const reserved = await reserveServerEventClaim(settings, activeServerEvent, interaction.user.id);
  if (!reserved) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Already Claimed", description: "You already claimed this server event, or it just expired.", visual: "emblem-help.svg" }), ephemeral: true });
  }
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const reward = applyServerEventRewards(user, activeServerEvent);
  await syncRank(user);
  await user.save();
  return interaction.reply(buildEmbedPayload({
    title: `${activeServerEvent.name} Claimed`,
    description: "You caught the server event before it faded.",
    visual: "emblem-success.svg",
    fields: [
      { name: "Aura", value: `${formatNumber(reward.auraReward)}`, inline: true },
      { name: "XP", value: `${formatNumber(reward.xpReward)}`, inline: true },
      { name: "Claimed By", value: `${(activeServerEvent.claimedUserIds?.length || 0) + 1} player(s)`, inline: true },
      { name: "Unique Bonus", value: reward.bonusLines.join("\n") || "Base event payout only." },
    ],
  }));
}

async function completeServerEventActivity(interaction, selectedChoiceId) {
  const settings = await getOrCreateGuildSettings(interaction.guildId);
  const activeServerEvent = getActiveServerEvent(settings);
  if (!activeServerEvent) {
    return interaction.reply({ ...buildEmbedPayload({ title: "No Server Event", description: "That activity is no longer active.", visual: "emblem-alert.svg" }), ephemeral: true });
  }
  if (activeServerEvent.claimedUserIds?.includes(interaction.user.id)) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Already Claimed", description: "You already completed this server event.", visual: "emblem-help.svg" }), ephemeral: true });
  }
  if (activeServerEvent.attemptedUserIds?.includes(interaction.user.id)) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Already Attempted", description: "You already used your attempt for this server event.", visual: "emblem-help.svg" }), ephemeral: true });
  }

  const correct = Boolean(activeServerEvent.activity?.answer && selectedChoiceId === activeServerEvent.activity.answer);
  const reserved = await reserveServerEventActivityAttempt(settings, activeServerEvent, interaction.user.id, correct);
  if (!reserved) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Already Attempted", description: "You already used your attempt for this server event, or it just expired.", visual: "emblem-help.svg" }), ephemeral: true });
  }

  if (!correct) {
    return interaction.reply({
      ...buildEmbedPayload({
        title: `${activeServerEvent.name} Missed`,
        description: activeServerEvent.activity?.failure || "That activity choice did not work.",
        visual: "emblem-alert.svg",
      }),
      ephemeral: true,
    });
  }

  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const reward = applyServerEventRewards(user, activeServerEvent);
  await syncRank(user);
  await user.save();
  return interaction.reply(buildEmbedPayload({
    title: `${activeServerEvent.name} Completed`,
    description: activeServerEvent.activity?.success || "You completed the server event activity.",
    visual: "emblem-success.svg",
    fields: [
      { name: "Aura", value: `${formatNumber(reward.auraReward)}`, inline: true },
      { name: "XP", value: `${formatNumber(reward.xpReward)}`, inline: true },
      { name: "Claimed By", value: `${(activeServerEvent.claimedUserIds?.length || 0) + 1} player(s)`, inline: true },
      { name: "Unique Bonus", value: reward.bonusLines.join("\n") || "Base event payout only." },
    ],
  }));
}

async function maybeSpawnServerEvent(interaction) {
  if (!interaction?.guildId || !interaction.channel?.send) {
    return null;
  }
  const settings = await getOrCreateGuildSettings(interaction.guildId);
  if (!settings || getActiveServerEvent(settings)) {
    return null;
  }
  const lastSpawn = settings.lastEventSpawnAt?.getTime?.() || 0;
  if (Date.now() - lastSpawn < SERVER_EVENT_SPAWN_COOLDOWN_MS || Math.random() > 0.12) {
    return null;
  }
  const template = pickServerEventTemplate(settings);
  settings.activeEvent = {
    ...template,
    activity: buildServerEventActivity(template),
    expiresAt: new Date(Date.now() + SERVER_EVENT_DURATION_MS),
    claimedUserIds: [],
    attemptedUserIds: [],
  };
  rememberServerEventId(settings, template.id);
  settings.lastEventSpawnAt = new Date();
  await settings.save();
  const payload = buildEmbedPayload({
    title: `Server Event: ${template.name}`,
    description: `${template.description}\nUse \`/event action:claim\` before it fades.`,
    visual: "help-summary.svg",
    fields: [
      { name: "Activity", value: settings.activeEvent.activity?.prompt || "Use the event controls to complete it." },
      { name: "Reward", value: `${formatNumber(template.rewardAura)} aura + ${formatNumber(template.rewardXp)} XP`, inline: true },
      { name: "Unique Bonus", value: formatServerEventBonus(template).join("\n") || "Base event payout only.", inline: true },
      { name: "Window", value: humanizeMs(SERVER_EVENT_DURATION_MS), inline: true },
    ],
  });
  await interaction.channel.send(withExtraComponents(payload, buildServerEventActivityRows(interaction.guildId, settings.activeEvent.activity))).catch(() => null);
  return template;
}

const MILESTONE_RULES = Object.freeze([
  { id: "rank_3", title: "Rank Milestone", test: (user) => user.rankIndex >= 3, text: (user) => `reached **${getRankLabel(RANKS[user.rankIndex])}**.` },
  { id: "prestige_1", title: "Prestige Milestone", test: (user) => user.prestige >= 1, text: (user) => `entered **Prestige ${user.prestige}**.` },
  { id: "vault_100k", title: "Vault Milestone", test: (user) => user.vaultAura >= 100000, text: () => "built a vault worth **100,000+ aura**." },
  { id: "pvp_5", title: "PvP Milestone", test: (user) => user.stats.pvpWins >= 5, text: () => "won **5 PvP duels**." },
  { id: "boss_5", title: "Boss Milestone", test: (user) => user.stats.bossWins >= 5, text: () => "defeated **5 bosses**." },
]);

async function maybeAnnounceMilestones(interaction, user) {
  if (!interaction?.guildId || !interaction.channel?.send || !user) {
    return;
  }
  user.announcedMilestones ||= [];
  const milestone = MILESTONE_RULES.find((rule) => !user.announcedMilestones.includes(rule.id) && rule.test(user));
  if (!milestone) {
    return;
  }
  user.announcedMilestones.push(milestone.id);
  await user.save();
  await interaction.channel.send(buildEmbedPayload({
    title: milestone.title,
    description: `<@${user.userId}> ${milestone.text(user)}`,
    visual: "emblem-success.svg",
    footer: "Milestones are public so the server can celebrate progress together.",
  })).catch(() => null);
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
  user.reminders.enabledActions = user.reminders.enabledActions.filter((action) => HEALTHY_REMINDER_ACTIONS.has(action));

  if (!user.reminders.lastNotifiedAt?.get) {
    user.reminders.lastNotifiedAt = new Map(mapEntries(user.reminders.lastNotifiedAt));
  }
  for (const action of Array.from(user.reminders.lastNotifiedAt.keys())) {
    if (!HEALTHY_REMINDER_ACTIONS.has(action)) {
      user.reminders.lastNotifiedAt.delete(action);
    }
  }
}

function normalizeTopggState(user) {
  user.topgg ||= {};
  user.topgg.voteCount = Number(user.topgg.voteCount) || 0;
  user.topgg.voteWeight = Number(user.topgg.voteWeight) || 0;
  user.topgg.lastVoteAt = user.topgg.lastVoteAt || null;
  user.topgg.nextVoteAt = user.topgg.nextVoteAt || null;
  user.topgg.lastPromptAt = user.topgg.lastPromptAt || null;
  user.topgg.lastVoteEventId = user.topgg.lastVoteEventId || null;
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
    "Premium welcome bundle on purchase: modest aura, crates, and profile cosmetics",
    "Premium Chest command: recurring prestige cache with capped progression loot",
    "Extra garden plots for relaxed material convenience",
    "PvP integrity: no premium HP, crit, or PvP reward advantage",
    "Premium-only shop items focus on prestige and light convenience",
    "Gentle garden reminders remain opt-in and low-pressure",
    "Profile membership status shown in /profile and /premium",
    "Premium profile cosmetics: Aurix VIP Title, Gold Profile Frame, Storm Nameplate, and paid style drops",
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
    `Prestige cosmetics and premium profile status`,
    `+${formatPercent(effects.workAuraBoost)} work aura, +${formatPercent(effects.workXpBoost)} work XP`,
    `+${formatPercent(effects.mineYieldBoost)} mining yield, +${formatPercent(effects.mineXpBoost)} mining XP`,
    `+${formatPercent(plan.dailyMultiplier - 1)} relaxed daily check-in aura and XP`,
    plan.dailyRareCrates > 0 ? `+${plan.dailyRareCrates} rare ${plan.dailyRareCrates === 1 ? "crate" : "crates"} from /daily` : "No daily crate flood",
    `${plan.gardenPlots} garden plots total`,
    `/premium-chest every ${plan.chestCooldownHours}h`,
    "No premium combat stats in PvP",
    "No premium cooldown pressure or cap expansion",
    `+${formatPercent(effects.vaultInterestBoost)}/hr vault interest`,
    `+${formatPercent(effects.bossRewardBoost)} boss rewards, +0% PvP rewards`,
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
    "First Spark": {
      label: "\u2726 FIRST SPARK",
      badge: "\u2726 SPARK",
      color: 0x5ce1a1,
      description: "Starter supporter nameplate active",
    },
    "Vault Legend": {
      label: "\u265B VAULT LEGEND",
      badge: "\u265B LEGEND",
      color: 0xffc857,
      description: "Legendary prestige nameplate active",
    },
    "Supply Runner": {
      label: "\u25C6 SUPPLY RUNNER",
      badge: "\u25C6 RUNNER",
      color: 0x69c7ff,
      description: "Utility supporter nameplate active",
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
    "Rival Frame": {
      label: "RIVAL FRAME",
      left: "[[ ",
      right: " ]]",
      color: 0xff6b88,
      divider: "=".repeat(18),
      description: "Rivalry profile frame active",
    },
    "Legend Frame": {
      label: "LEGEND FRAME",
      left: "<< ",
      right: " >>",
      color: 0xffd166,
      divider: "#".repeat(18),
      description: "Legendary supporter frame active",
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

function getRelic(relicId) {
  return AURIX_RELICS.find((relic) => relic.id === relicId) || null;
}

function findRelicByInput(value) {
  const normalized = normalizeGuess(value);
  return AURIX_RELICS.find((relic) => relic.id === value || normalizeGuess(relic.id) === normalized || normalizeGuess(relic.name) === normalized) || null;
}

function getRelicRarity(relic) {
  return RELIC_RARITIES[relic?.rarity] || RELIC_RARITIES.common;
}

function getRelicLabel(relicId) {
  const relic = getRelic(relicId);
  return formatEntityLabel("RELIC", relicId, relic?.name || relicId);
}

function getRelicEntry(user, relicId) {
  user.relics ||= [];
  return user.relics.find((entry) => entry.id === relicId) || null;
}

function ensureRelicEntry(user, relicId) {
  let entry = getRelicEntry(user, relicId);
  if (!entry) {
    user.relics.push({ id: relicId, quantity: 0, firstPrint: null, bestPrint: null, shiny: 0, lastPrintAt: null, level: 1, essence: 0, corruption: 0, factionId: null, origin: null, traits: [], history: [] });
    entry = user.relics[user.relics.length - 1];
  }
  entry.level = Math.max(1, Number(entry.level) || 1);
  entry.essence = Math.max(0, Number(entry.essence) || 0);
  entry.corruption = clamp(Number(entry.corruption) || 0, 0, 100);
  entry.traits = Array.isArray(entry.traits) ? entry.traits.slice(0, 6) : [];
  entry.history = Array.isArray(entry.history) ? entry.history.slice(0, 8) : [];
  return entry;
}

function getRelicScore(entry) {
  const relic = getRelic(entry?.id);
  if (!relic || !entry?.quantity) {
    return 0;
  }
  const rarity = getRelicRarity(relic);
  const printBonus = entry.bestPrint ? Math.max(0, 120 - Math.min(entry.bestPrint, 120)) / 10 : 0;
  return Math.floor((rarity.value * entry.quantity + (entry.shiny || 0) * rarity.value * 12 + printBonus) * 100);
}

function getRelicCollectionStats(user) {
  user.relics ||= [];
  const ownedEntries = user.relics.filter((entry) => entry.quantity > 0);
  const shinyCount = ownedEntries.reduce((sum, entry) => sum + (entry.shiny || 0), 0);
  const score = ownedEntries.reduce((sum, entry) => sum + getRelicScore(entry), 0);
  const bestEntry = ownedEntries
    .slice()
    .sort((left, right) => getRelicScore(right) - getRelicScore(left))[0] || null;
  return {
    ownedCount: ownedEntries.length,
    totalCount: AURIX_RELICS.length,
    totalQuantity: ownedEntries.reduce((sum, entry) => sum + entry.quantity, 0),
    shinyCount,
    score,
    bestEntry,
  };
}

function rollRelicForUser(user) {
  const effects = getCombinedEffects(user);
  const rarityEntries = Object.entries(RELIC_RARITIES).map(([rarityId, rarity]) => {
    const rareBoost = ["epic", "legendary", "mythic"].includes(rarityId) ? 1 + Math.min(0.35, effects.crateAuraBoost || 0) : 1;
    return { rarityId, weight: rarity.weight * rareBoost };
  });
  const rarity = pickWeighted(rarityEntries, (entry) => entry.weight)?.rarityId || "common";
  const relics = AURIX_RELICS.filter((relic) => relic.rarity === rarity);
  return relics[randInt(0, relics.length - 1)] || AURIX_RELICS[0];
}

function rollRelicForSpawn() {
  const rarity = pickWeighted(Object.entries(RELIC_RARITIES), ([, config]) => config.weight)?.[0] || "common";
  const relics = AURIX_RELICS.filter((relic) => relic.rarity === rarity);
  return relics[randInt(0, relics.length - 1)] || AURIX_RELICS[0];
}

function rollRelicForWorld(settings, source = "chat") {
  const world = settings ? normalizeWorldState(settings) : null;
  const dominant = world ? getDominantWorldFaction(world) : null;
  const eventChance = source === "summon" ? 0.025 : source === "incense" ? 0.012 : 0.008;
  if (Math.random() < eventChance) {
    const eventRelics = AURIX_RELICS.filter((relic) => relic.eventExclusive && (!relic.factionId || relic.factionId === dominant?.id));
    if (eventRelics.length) {
      return eventRelics[randInt(0, eventRelics.length - 1)];
    }
  }
  return rollRelicForSpawn();
}

function getRelicTrait(relic, printNumber, slot = 0) {
  const rarityTraits = RELIC_TRAITS[relic?.rarity] || RELIC_TRAITS.common;
  const seed = Math.abs(hashString(`${relic?.id}:${printNumber}:${slot}`));
  return rarityTraits[seed % rarityTraits.length] || "etched";
}

function addRelicHistory(entry, type, userId, guildId, detail) {
  entry.history ||= [];
  entry.history.unshift({ type, userId, guildId, detail, createdAt: new Date() });
  entry.history = entry.history.slice(0, 8);
}

async function nextRelicPrint(relicId) {
  const counter = await CollectiblePrintCounter.findOneAndUpdate(
    { itemId: relicId },
    { $inc: { count: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return counter.count;
}

function addRelicToUser(user, relic, printNumber, shiny = false, context = {}) {
  const entry = ensureRelicEntry(user, relic.id);
  const isNew = entry.quantity <= 0;
  entry.quantity += 1;
  entry.firstPrint = entry.firstPrint || printNumber;
  entry.bestPrint = entry.bestPrint ? Math.min(entry.bestPrint, printNumber) : printNumber;
  entry.lastPrintAt = new Date();
  entry.origin ||= context.source || "chat";
  if (context.factionId && !entry.factionId) {
    entry.factionId = context.factionId;
  }
  const rarity = getRelicRarity(relic);
  entry.essence += Math.max(1, rarity.value || 1);
  const trait = getRelicTrait(relic, printNumber, entry.traits.length);
  if (!entry.traits.includes(trait) && entry.traits.length < 6) {
    entry.traits.push(trait);
  }
  if (relic.eventExclusive && !entry.traits.includes("event-forged")) {
    entry.traits.unshift("event-forged");
  }
  if (["epic", "legendary", "mythic"].includes(relic.rarity) && Math.random() < (relic.rarity === "mythic" ? 0.35 : relic.rarity === "legendary" ? 0.22 : 0.1)) {
    entry.corruption = clamp(entry.corruption + randInt(6, 18), 0, 100);
    if (!entry.traits.includes("corrupted")) {
      entry.traits.push("corrupted");
    }
  }
  if (shiny) {
    entry.shiny = (entry.shiny || 0) + 1;
  }
  addRelicHistory(entry, "claim", context.userId || user.userId, context.guildId || user.guildId, `${RELIC_ORIGIN_LABELS[context.source] || "Relic Drop"} print #${printNumber}`);
  user.markModified("relics");
  return { entry, isNew };
}

function formatRelicLine(entry) {
  const relic = getRelic(entry.id);
  const rarity = getRelicRarity(relic);
  const shinyText = entry.shiny ? ` | shiny x${entry.shiny}` : "";
  const mythicText = entry.level > 1 || entry.corruption ? ` | lvl ${formatNumber(entry.level || 1)} | corruption ${formatNumber(entry.corruption || 0)}` : "";
  return `**${getRelicLabel(entry.id)}** [${rarity.label}] x${formatNumber(entry.quantity)} | \`${entry.id}\` | best print #${formatNumber(entry.bestPrint || entry.firstPrint || 0)}${shinyText}${mythicText}`;
}

function normalizeGuess(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function getRelicShortGuess(name) {
  return String(name || "")
    .split(/\s+/)
    .filter((part) => !["of", "the"].includes(part.toLowerCase()))
    .slice(0, 2)
    .join(" ");
}

function isCorrectRelicGuess(guess, relicName) {
  const normalizedGuess = normalizeGuess(guess);
  const normalizedName = normalizeGuess(relicName);
  const normalizedShortGuess = normalizeGuess(getRelicShortGuess(relicName));
  return normalizedGuess === normalizedName || normalizedGuess === normalizedShortGuess;
}

function getRelicSpawnRemainingMs(current) {
  const spawnedAt = current?.spawnedAt ? new Date(current.spawnedAt).getTime() : 0;
  if (!spawnedAt || Number.isNaN(spawnedAt)) {
    return 0;
  }
  return Math.max(0, spawnedAt + RELIC_SPAWN_TTL_MS - Date.now());
}

async function clearExpiredRelicSpawn(settings, spawnState) {
  const current = spawnState?.current;
  if (!current?.relicId || getRelicSpawnRemainingMs(current) > 0) {
    return false;
  }
  spawnState.current = null;
  settings.markModified("relicSpawn");
  await settings.save();
  return true;
}

function formatRelicHint(name, hintUses = 0) {
  const shortGuess = getRelicShortGuess(name);
  if (hintUses >= 3 && shortGuess) {
    return `Short claim: ${shortGuess}`;
  }
  const revealEvery = Math.max(2, 4 - Math.min(2, hintUses));
  return String(name || "")
    .split("")
    .map((char, index) => {
      if (!/[a-z0-9]/i.test(char)) {
        return char;
      }
      return index % revealEvery === 0 ? char : "_";
    })
    .join("");
}

function getSpecialRelicChance(streak) {
  return (7 + Math.sqrt(Math.max(0, Number(streak) || 0))) / 28672;
}

function buildPixelArtRelicSpawnAttachment(relic) {
  const sourceWidth = 240;
  const sourceHeight = 135;
  const scale = 4;
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const source = Buffer.alloc(sourceWidth * sourceHeight * 4);
  const pixels = Buffer.alloc(width * height * 4);
  const rarityColor = {
    common: 0x9ca3af,
    uncommon: 0x5ce1a1,
    rare: 0x69c7ff,
    epic: 0xa78bfa,
    legendary: 0xffc857,
    mythic: 0xff6b88,
  }[relic.rarity] || COLORS.primary;
  const toRgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  const put = (x, y, hex, alpha = 255) => {
    if (x < 0 || y < 0 || x >= sourceWidth || y >= sourceHeight) return;
    const index = (Math.floor(y) * sourceWidth + Math.floor(x)) * 4;
    const [r, g, b] = toRgb(hex);
    const existingAlpha = source[index + 3] / 255;
    const nextAlpha = alpha / 255;
    const outAlpha = nextAlpha + existingAlpha * (1 - nextAlpha);
    if (outAlpha <= 0) return;
    source[index] = Math.round((r * nextAlpha + source[index] * existingAlpha * (1 - nextAlpha)) / outAlpha);
    source[index + 1] = Math.round((g * nextAlpha + source[index + 1] * existingAlpha * (1 - nextAlpha)) / outAlpha);
    source[index + 2] = Math.round((b * nextAlpha + source[index + 2] * existingAlpha * (1 - nextAlpha)) / outAlpha);
    source[index + 3] = Math.round(outAlpha * 255);
  };
  const fill = (x, y, w, h, hex, alpha = 255) => {
    for (let yy = Math.floor(y); yy < Math.floor(y + h); yy += 1) {
      for (let xx = Math.floor(x); xx < Math.floor(x + w); xx += 1) put(xx, yy, hex, alpha);
    }
  };
  const stroke = (x, y, w, h, hex, thickness = 1) => {
    fill(x, y, w, thickness, hex);
    fill(x, y + h - thickness, w, thickness, hex);
    fill(x, y, thickness, h, hex);
    fill(x + w - thickness, y, thickness, h, hex);
  };
  const line = (x1, y1, x2, y2, hex, thickness = 1, alpha = 255) => {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    for (let step = 0; step <= steps; step += 1) {
      const t = steps === 0 ? 0 : step / steps;
      fill(Math.round(x1 + (x2 - x1) * t), Math.round(y1 + (y2 - y1) * t), thickness, thickness, hex, alpha);
    }
  };
  const circle = (cx, cy, radius, hex, alpha = 255) => {
    for (let y = cy - radius; y <= cy + radius; y += 1) {
      for (let x = cx - radius; x <= cx + radius; x += 1) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) put(x, y, hex, alpha);
      }
    }
  };
  const triangle = (ax, ay, bx, by, cx, cy, hex, alpha = 255) => {
    const minX = Math.floor(Math.min(ax, bx, cx));
    const maxX = Math.ceil(Math.max(ax, bx, cx));
    const minY = Math.floor(Math.min(ay, by, cy));
    const maxY = Math.ceil(Math.max(ay, by, cy));
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (!area) return;
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const w1 = ((bx - x) * (cy - y) - (by - y) * (cx - x)) / area;
        const w2 = ((cx - x) * (ay - y) - (cy - y) * (ax - x)) / area;
        const w3 = 1 - w1 - w2;
        if ((w1 >= 0 && w2 >= 0 && w3 >= 0) || (w1 <= 0 && w2 <= 0 && w3 <= 0)) put(x, y, hex, alpha);
      }
    }
  };
  const diamond = (cx, cy, radius, hex, alpha = 255) => {
    for (let y = cy - radius; y <= cy + radius; y += 1) {
      for (let x = cx - radius; x <= cx + radius; x += 1) {
        if (Math.abs(x - cx) + Math.abs(y - cy) <= radius) put(x, y, hex, alpha);
      }
    }
  };
  const hashRelic = (value) => String(value || "").split("").reduce((hash, char) => ((hash * 33) ^ char.charCodeAt(0)) >>> 0, 5381);
  const seed = hashRelic(relic.id);
  const relicIndexMatch = String(relic.id || "").match(/^relic_(\d+)/);
  const visualSerial = relicIndexMatch ? Number(relicIndexMatch[1]) : seed;
  let state = seed || 1;
  const rand = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const themes = [
    { sky: 0x9be7ef, sky2: 0x5fb3ce, ground: 0x3f8f3b, ground2: 0x286b35, dark: 0x17324b, mid: 0x315f7d, light: 0xbff8ff, accent: 0xffd166 },
    { sky: 0x06091f, sky2: 0x15104a, ground: 0x101827, ground2: 0x020617, dark: 0x000814, mid: 0x1d4ed8, light: 0xe0f2fe, accent: 0xffe066 },
    { sky: 0x6ee7d8, sky2: 0xa7f3d0, ground: 0x14b8a6, ground2: 0x0f766e, dark: 0x0f172a, mid: 0x2dd4bf, light: 0xecfeff, accent: 0xfacc15 },
    { sky: 0x1f1635, sky2: 0x432874, ground: 0x111827, ground2: 0x09090b, dark: 0x030712, mid: 0x7c3aed, light: 0xf5d0fe, accent: 0xff6b88 },
    { sky: 0xfbd38d, sky2: 0xfb923c, ground: 0x7f1d1d, ground2: 0x450a0a, dark: 0x1c0804, mid: 0xdc2626, light: 0xffedd5, accent: 0xffc857 },
    { sky: 0xc7d2fe, sky2: 0x818cf8, ground: 0x334155, ground2: 0x0f172a, dark: 0x020617, mid: 0x64748b, light: 0xf8fafc, accent: 0x93c5fd },
    { sky: 0x0d1b2a, sky2: 0x1b263b, ground: 0x133c55, ground2: 0x061826, dark: 0x030712, mid: 0x2dd4bf, light: 0xccfbf1, accent: 0xf0abfc },
    { sky: 0x072c24, sky2: 0x14532d, ground: 0x052e16, ground2: 0x022c22, dark: 0x02130d, mid: 0x22c55e, light: 0xdcfce7, accent: 0xfef08a },
  ];
  const theme = themes[seed % themes.length];
  const scene = (seed >> 5) % 8;

  for (let y = 0; y < sourceHeight; y += 1) {
    const hex = y < sourceHeight / 2 ? theme.sky : theme.sky2;
    fill(0, y, sourceWidth, 1, hex);
  }
  if (scene === 0) {
    triangle(18, 95, 66, 30, 112, 95, theme.mid);
    triangle(78, 95, 135, 18, 197, 95, theme.dark);
    triangle(122, 95, 183, 38, 238, 95, theme.mid);
    triangle(56, 52, 66, 30, 77, 52, theme.light);
    triangle(124, 44, 135, 18, 150, 44, theme.light);
    fill(0, 92, sourceWidth, 43, theme.ground);
    for (let x = -20; x < sourceWidth; x += 24) triangle(x, 135, x + 18, 94, x + 48, 135, theme.ground2, 210);
    line(118, 135, 142, 92, 0xf7e6a4, 3, 190);
  } else if (scene === 1) {
    fill(0, 0, sourceWidth, sourceHeight, theme.dark);
    for (let i = 0; i < 55; i += 1) {
      const x = Math.floor(rand() * sourceWidth);
      const y = Math.floor(rand() * 82);
      fill(x, y, 1 + Math.floor(rand() * 2), 1 + Math.floor(rand() * 2), rand() > 0.82 ? theme.accent : theme.light);
    }
    for (let x = 4; x < sourceWidth; x += 18 + Math.floor(rand() * 16)) {
      const h = 24 + Math.floor(rand() * 42);
      fill(x, sourceHeight - h, 12 + Math.floor(rand() * 14), h, theme.ground2);
      for (let y = sourceHeight - h + 6; y < sourceHeight - 6; y += 8) fill(x + 4, y, 2, 2, theme.mid);
    }
  } else if (scene === 2) {
    for (let y = 0; y < sourceHeight; y += 8) {
      for (let x = 0; x < sourceWidth; x += 8) fill(x, y, 8, 8, ((x + y) / 8) % 2 ? theme.sky : theme.sky2);
    }
    for (let i = 0; i < 18; i += 1) diamond(Math.floor(rand() * sourceWidth), Math.floor(rand() * sourceHeight), 3 + Math.floor(rand() * 3), theme.accent, 210);
  } else if (scene === 3) {
    fill(0, 0, sourceWidth, sourceHeight, theme.sky);
    fill(0, 70, sourceWidth, 65, theme.ground2);
    for (let x = -8; x < sourceWidth; x += 18) {
      fill(x + 7, 64, 5, 38, 0x4a2c16);
      triangle(x, 72, x + 10, 30 + Math.floor(rand() * 18), x + 24, 72, theme.ground);
      triangle(x - 2, 58, x + 10, 25, x + 22, 58, theme.mid);
    }
    fill(98, 72, 44, 44, 0x1f2937);
    triangle(90, 73, 120, 48, 150, 73, theme.accent);
    fill(113, 90, 14, 26, theme.dark);
  } else if (scene === 4) {
    fill(0, 0, sourceWidth, 66, theme.sky);
    fill(0, 66, sourceWidth, 69, theme.mid);
    for (let y = 74; y < sourceHeight; y += 12) {
      for (let x = -12; x < sourceWidth; x += 30) line(x, y, x + 18, y - 4, theme.light, 2, 150);
    }
    circle(42, 24, 12, theme.accent, 210);
    fill(0, 105, sourceWidth, 30, theme.ground);
  } else if (scene === 5) {
    fill(0, 0, sourceWidth, sourceHeight, theme.dark);
    triangle(0, 118, 54, 42, 114, 118, theme.ground2);
    triangle(92, 118, 154, 35, 230, 118, theme.ground2);
    fill(0, 106, sourceWidth, 29, theme.ground);
    for (let x = 0; x < sourceWidth; x += 20) line(x, 132, x + 12, 108, theme.accent, 3, 230);
  } else if (scene === 6) {
    fill(0, 0, sourceWidth, sourceHeight, theme.dark);
    for (let i = 0; i < 80; i += 1) put(Math.floor(rand() * sourceWidth), Math.floor(rand() * sourceHeight), rand() > 0.5 ? theme.light : theme.mid);
    circle(188, 42, 15, theme.mid, 230);
    circle(195, 36, 15, theme.dark, 230);
    for (let i = 0; i < 4; i += 1) line(30 + i * 26, 95 - i * 9, 106 + i * 23, 64 + i * 6, theme.mid, 3, 95);
  } else {
    fill(0, 0, sourceWidth, sourceHeight, theme.sky);
    fill(0, 72, sourceWidth, 63, theme.ground);
    for (let y = 82; y < sourceHeight; y += 14) {
      for (let x = 0; x < sourceWidth; x += 18) {
        fill(x, y, 10, 3, theme.ground2);
        fill(x + 5, y - 5, 3, 8, theme.mid);
      }
    }
    for (let i = 0; i < 12; i += 1) circle(Math.floor(rand() * sourceWidth), 80 + Math.floor(rand() * 48), 2, theme.accent, 220);
  }

  fill(66, 12, 108, 108, theme.dark, 95);
  stroke(63, 9, 114, 114, rarityColor, 2);
  stroke(68, 14, 104, 104, theme.light, 1);

  const spriteGrid = 31;
  const spriteCell = 3;
  const spriteStartX = 120 - Math.floor((spriteGrid * spriteCell) / 2);
  const spriteStartY = 68 - Math.floor((spriteGrid * spriteCell) / 2);
  const spriteCellFill = (gx, gy, hex, alpha = 255, inset = 0) => fill(spriteStartX + gx * spriteCell + inset, spriteStartY + gy * spriteCell + inset, spriteCell - inset * 2, spriteCell - inset * 2, hex, alpha);
  const body = new Set();
  const add = (x, y) => {
    if (x >= 0 && y >= 0 && x < spriteGrid && y < spriteGrid) body.add(`${x},${y}`);
  };
  const archetype = seed % 48;
  const family = archetype % 16;
  const profile = Math.floor(archetype / 16);
  for (let y = 2; y < spriteGrid - 2; y += 1) {
    for (let x = 0; x <= 15; x += 1) {
      const dx = Math.abs(x - 15);
      const dy = y - 15;
      const ady = Math.abs(dy);
      let inside = false;
      const pinch = profile === 0 ? 0.42 : profile === 1 ? 0.65 : 0.25;
      const wide = profile === 1 ? 2 : profile === 2 ? -1 : 0;
      if (family === 0) inside = (dx * dx) / (56 + wide * 8) + (dy * dy) / 86 <= 1;
      else if (family === 1) inside = dx + ady * (0.72 + pinch * 0.18) <= 10 + wide;
      else if (family === 2) inside = y >= 5 && y <= 24 && dx <= Math.max(2, 10 + wide - Math.floor(ady * pinch));
      else if (family === 3) inside = dx <= 3 || (ady <= 4 && dx <= 11 + wide) || (ady <= 9 && dx <= 6 + wide);
      else if (family === 4) inside = (y >= 7 && y <= 23 && dx <= 8 + wide) || (y >= 3 && y < 7 && dx <= y - 1 + wide);
      else if (family === 5) inside = (dx * dx) / (70 + wide * 8) + (dy * dy) / 70 <= 1 && !(dx < 4 && ady < 4);
      else if (family === 6) inside = y >= 5 && y <= 25 && dx <= Math.max(1, Math.floor((y < 15 ? y - 2 : 28 - y) * (0.62 + pinch * 0.25)));
      else if (family === 7) inside = dx <= 4 || (y >= 11 && y <= 19 && dx <= 11 + wide) || (y >= 6 && y <= 10 && dx <= 3 + (y - 6));
      else if (family === 8) inside = dx <= 7 + wide && ady <= 9 && !(dx <= 3 && ady <= 4);
      else if (family === 9) inside = (dx <= 2 && y >= 4 && y <= 26) || (ady <= 2 && dx <= 11) || (dx + ady <= 8);
      else if (family === 10) inside = (dx * dx) / 45 + (dy * dy) / 100 <= 1 || (y >= 18 && dx <= 9 - Math.floor((y - 18) * 0.9));
      else if (family === 11) inside = (y >= 4 && y <= 22 && dx <= 5 + Math.floor(Math.sin(y * 0.9) * 2)) || (ady <= 2 && dx <= 11);
      else if (family === 12) inside = (dx <= 8 && ady <= 8 && (dx + ady > 3)) || (dx <= 2 && ady <= 12);
      else if (family === 13) inside = (dx * dx) / 88 + (dy * dy) / 48 <= 1 || (dx <= 2 && y >= 4 && y <= 26);
      else if (family === 14) inside = y >= 5 && y <= 25 && dx <= Math.max(2, Math.floor(3 + Math.abs(Math.sin(y * 0.55 + profile)) * 8));
      else inside = (dx * dx) / 72 + (dy * dy) / 90 <= 1 || dx + ady <= 9 || (y >= 8 && y <= 22 && dx <= 3);
      if (profile === 2 && dx <= 2 && ady <= 3) inside = false;
      if (inside) {
        add(x, y);
        add(30 - x, y);
      }
    }
  }
  const addMirror = (x, y) => {
    add(x, y);
    add(30 - x, y);
  };
  const ornament = (seed >> 9) % 16;
  if (ornament === 0 || ((seed >> 3) & 1)) for (let i = 0; i < 7; i += 1) { addMirror(15 - i, 4 + i); }
  if (ornament === 1 || ((seed >> 7) & 1)) for (let y = 12; y < 22; y += 1) { addMirror(3, y); if (y % 2) addMirror(2, y); }
  if (ornament === 2 || ((seed >> 11) & 1)) for (let y = 23; y < 30; y += 1) { add(15, y); if (y < 27) { add(14, y); add(16, y); } }
  if (ornament === 3 || ((seed >> 14) & 1)) for (let x = 9; x <= 21; x += 1) add(x, 2 + Math.abs(15 - x) % 3);
  if (ornament === 4) for (let i = 0; i < 8; i += 1) { addMirror(6 - Math.floor(i / 3), 7 + i); }
  if (ornament === 5) for (let i = 0; i < 9; i += 1) { addMirror(4 + i, 3); addMirror(5 + i, 4); }
  if (ornament === 6) for (let y = 7; y <= 24; y += 1) { add(15, y); if (y % 3 === 0) { add(14, y); add(16, y); } }
  if (ornament === 7) for (let i = 0; i < 7; i += 1) { addMirror(10 - i, 22 + Math.floor(i / 2)); }
  if (ornament === 8) for (let i = 0; i < 8; i += 1) { addMirror(5, 8 + i); addMirror(4, 9 + i); }
  if (ornament === 9) for (let x = 8; x <= 22; x += 1) { if (x % 2 === 0) add(x, 28); }
  if (ornament === 10) for (let i = 0; i < 6; i += 1) { addMirror(2 + i, 13 - i); }
  if (ornament === 11) for (let i = 0; i < 8; i += 1) { addMirror(8 + Math.floor(i / 2), 5 + i); }
  if (ornament === 12) for (let y = 6; y <= 24; y += 1) { if (y % 2 === 0) addMirror(1 + (y % 4), y); }
  if (ornament === 13) for (let i = 0; i < 6; i += 1) { add(15 - i, 2 + i); add(15 + i, 2 + i); add(15, 2 + i); }
  if (ornament === 14) for (let y = 9; y <= 21; y += 1) { addMirror(25 - Math.floor(y / 3), y); }
  if (ornament === 15) for (let i = 0; i < 10; i += 1) { addMirror(7 + (i % 3), 25 + Math.floor(i / 3)); }

  for (let ring = 0; ring < 5 + (seed % 4); ring += 1) {
    const angle = (Math.PI * 2 * ring) / (5 + (seed % 4)) + (seed % 19) / 19;
    spriteCellFill(Math.round(15 + Math.cos(angle) * 14), Math.round(15 + Math.sin(angle) * 11), ring % 2 ? theme.accent : theme.light, 220, 1);
  }

  for (const cell of body) {
    const [x, y] = cell.split(",").map(Number);
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !body.has(`${x + dx},${y + dy}`));
    const lit = x < 15 && y < 17;
    spriteCellFill(x, y, edge ? theme.dark : lit ? theme.light : theme.mid, edge ? 255 : 235);
    if (!edge && (x === 15 || y === 15 || (x + y + seed) % 7 === 0)) spriteCellFill(x, y, rarityColor, 220, 1);
  }
  const gemPattern = (seed >> 17) % 4;
  const gemCells = gemPattern === 0
    ? [[15, 15], [14, 15], [16, 15], [15, 14], [15, 16]]
    : gemPattern === 1
      ? [[15, 8], [15, 12], [15, 16], [15, 20]]
      : gemPattern === 2
        ? [[11, 10], [19, 10], [15, 15], [12, 21], [18, 21]]
        : [[10, 15], [13, 15], [16, 15], [19, 15], [15, 11], [15, 19]];
  gemCells.forEach(([x, y]) => {
    if (body.has(`${x},${y}`)) spriteCellFill(x, y, theme.accent, 255, 0);
  });

  const signatureBits = visualSerial.toString(2).padStart(24, "0").slice(-24);
  for (let bit = 0; bit < signatureBits.length; bit += 1) {
    const row = Math.floor(bit / 12);
    const col = bit % 12;
    const hex = signatureBits[bit] === "1" ? theme.accent : theme.mid;
    fill(28 + col * 4, 119 + row * 4, 2, 2, hex, 235);
    fill(210 - col * 4, 119 + row * 4, 2, 2, signatureBits[bit] === "1" ? theme.light : theme.dark, 215);
  }
  for (let bit = 0; bit < 12; bit += 1) {
    const active = (visualSerial >> bit) & 1;
    const x = 6 + bit * 2;
    const y = active ? 6 : 9;
    fill(x, y, 1, 2, active ? theme.accent : theme.mid, 225);
    fill(sourceWidth - x - 1, y, 1, 2, active ? theme.light : theme.dark, 205);
  }
  const serialRuneCells = [
    [8, 8], [22, 8], [7, 15], [23, 15], [9, 22], [21, 22],
    [12, 6], [18, 6], [12, 24], [18, 24], [15, 5], [15, 25],
  ];
  serialRuneCells.forEach(([x, y], index) => {
    if (body.has(`${x},${y}`)) {
      spriteCellFill(x, y, ((visualSerial >> index) & 1) ? theme.accent : rarityColor, 245, 1);
    }
  });

  stroke(4, 4, sourceWidth - 8, sourceHeight - 8, rarityColor, 2);
  stroke(8, 8, sourceWidth - 16, sourceHeight - 16, theme.dark, 1);

  for (let sy = 0; sy < sourceHeight; sy += 1) {
    for (let sx = 0; sx < sourceWidth; sx += 1) {
      const sourceIndex = (sy * sourceWidth + sx) * 4;
      for (let yy = 0; yy < scale; yy += 1) {
        for (let xx = 0; xx < scale; xx += 1) {
          const targetIndex = ((sy * scale + yy) * width + (sx * scale + xx)) * 4;
          pixels[targetIndex] = source[sourceIndex];
          pixels[targetIndex + 1] = source[sourceIndex + 1];
          pixels[targetIndex + 2] = source[sourceIndex + 2];
          pixels[targetIndex + 3] = source[sourceIndex + 3];
        }
      }
    }
  }
  return new AttachmentBuilder(encodePng(width, height, pixels), { name: "aurix-relic-spawn.png" });
}

function buildRelicSpawnAttachment(relic) {
  return buildPixelArtRelicSpawnAttachment(relic);

  const width = 960;
  const height = 540;
  const color = {
    common: 0x9ca3af,
    uncommon: 0x5ce1a1,
    rare: 0x69c7ff,
    epic: 0xa78bfa,
    legendary: 0xffc857,
    mythic: 0xff6b88,
  }[relic.rarity] || COLORS.primary;
  const pixels = Buffer.alloc(width * height * 4);
  const toRgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  const put = (x, y, hex, alpha = 255) => {
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return;
    }
    const [r, g, b] = toRgb(hex);
    const index = (Math.floor(y) * width + Math.floor(x)) * 4;
    const existingAlpha = pixels[index + 3] / 255;
    const nextAlpha = alpha / 255;
    const outAlpha = nextAlpha + existingAlpha * (1 - nextAlpha);
    pixels[index] = Math.round((r * nextAlpha + pixels[index] * existingAlpha * (1 - nextAlpha)) / outAlpha);
    pixels[index + 1] = Math.round((g * nextAlpha + pixels[index + 1] * existingAlpha * (1 - nextAlpha)) / outAlpha);
    pixels[index + 2] = Math.round((b * nextAlpha + pixels[index + 2] * existingAlpha * (1 - nextAlpha)) / outAlpha);
    pixels[index + 3] = Math.round(outAlpha * 255);
  };
  const fillRect = (x, y, w, h, hex, alpha = 255) => {
    for (let yy = y; yy < y + h; yy += 1) {
      for (let xx = x; xx < x + w; xx += 1) {
        put(xx, yy, hex, alpha);
      }
    }
  };
  const strokeRect = (x, y, w, h, hex, thickness = 1) => {
    fillRect(x, y, w, thickness, hex);
    fillRect(x, y + h - thickness, w, thickness, hex);
    fillRect(x, y, thickness, h, hex);
    fillRect(x + w - thickness, y, thickness, h, hex);
  };
  const fillCircle = (cx, cy, radius, hex, alpha = 255) => {
    for (let y = cy - radius; y <= cy + radius; y += 1) {
      for (let x = cx - radius; x <= cx + radius; x += 1) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) {
          put(x, y, hex, alpha);
        }
      }
    }
  };
  const drawDiamond = (cx, cy, radius, hex, alpha = 255) => {
    for (let y = cy - radius; y <= cy + radius; y += 1) {
      for (let x = cx - radius; x <= cx + radius; x += 1) {
        if (Math.abs(x - cx) + Math.abs(y - cy) <= radius) {
          put(x, y, hex, alpha);
        }
      }
    }
  };
  const fillEllipse = (cx, cy, rx, ry, hex, alpha = 255) => {
    for (let y = cy - ry; y <= cy + ry; y += 1) {
      for (let x = cx - rx; x <= cx + rx; x += 1) {
        if (((x - cx) ** 2) / (rx ** 2) + ((y - cy) ** 2) / (ry ** 2) <= 1) {
          put(x, y, hex, alpha);
        }
      }
    }
  };
  const drawLine = (x1, y1, x2, y2, thickness, hex, alpha = 255) => {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    for (let step = 0; step <= steps; step += 1) {
      const t = steps === 0 ? 0 : step / steps;
      fillCircle(Math.round(x1 + (x2 - x1) * t), Math.round(y1 + (y2 - y1) * t), thickness, hex, alpha);
    }
  };
  const fillTriangle = (ax, ay, bx, by, cx, cy, hex, alpha = 255) => {
    const minX = Math.floor(Math.min(ax, bx, cx));
    const maxX = Math.ceil(Math.max(ax, bx, cx));
    const minY = Math.floor(Math.min(ay, by, cy));
    const maxY = Math.ceil(Math.max(ay, by, cy));
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (area === 0) {
      return;
    }
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const w1 = ((bx - x) * (cy - y) - (by - y) * (cx - x)) / area;
        const w2 = ((cx - x) * (ay - y) - (cy - y) * (ax - x)) / area;
        const w3 = 1 - w1 - w2;
        if ((w1 >= 0 && w2 >= 0 && w3 >= 0) || (w1 <= 0 && w2 <= 0 && w3 <= 0)) {
          put(x, y, hex, alpha);
        }
      }
    }
  };
  const hashRelic = (value) => String(value || "").split("").reduce((hash, char) => ((hash * 33) ^ char.charCodeAt(0)) >>> 0, 5381);
  const relicSeed = hashRelic(relic.id);
  const generatedCores = ["seed", "crescent", "shield", "knot", "compass", "chip", "mask", "sun", "crown", "heart", "zero", "lens"];
  const motif = RELIC_VISUAL_MOTIFS[relic.id] || {
    core: generatedCores[relicSeed % generatedCores.length],
    wings: (relicSeed >> 3) % 6,
    orbit: 2 + ((relicSeed >> 7) % 8),
    spikes: (relicSeed >> 11) % 13,
  };
  const shadow = 0x03040a;
  const relief = 0x111522;
  const cx = 480;
  const cy = 270;
  const drawOrbitals = () => {
    for (let index = 0; index < motif.orbit; index += 1) {
      const angle = (Math.PI * 2 * index) / motif.orbit + (relicSeed % 17) / 17;
      const radius = 150 + ((relicSeed + index * 13) % 34);
      const size = 9 + ((relicSeed >> (index % 12)) % 10);
      const x = Math.round(cx + Math.cos(angle) * radius);
      const y = Math.round(cy + Math.sin(angle) * radius * 0.72);
      index % 2 === 0 ? drawDiamond(x, y, size, shadow) : fillCircle(x, y, size, shadow);
      fillCircle(x, y, Math.max(2, Math.floor(size / 3)), relief, 160);
    }
  };
  const drawSpikes = () => {
    for (let index = 0; index < motif.spikes; index += 1) {
      const angle = (Math.PI * 2 * index) / Math.max(1, motif.spikes) - Math.PI / 2;
      const inner = 92 + ((relicSeed + index * 7) % 20);
      const outer = 152 + ((relicSeed + index * 11) % 26);
      const widthAngle = 0.12 + ((relicSeed + index) % 5) * 0.01;
      fillTriangle(
        cx + Math.cos(angle - widthAngle) * inner,
        cy + Math.sin(angle - widthAngle) * inner,
        cx + Math.cos(angle + widthAngle) * inner,
        cy + Math.sin(angle + widthAngle) * inner,
        cx + Math.cos(angle) * outer,
        cy + Math.sin(angle) * outer,
        shadow
      );
    }
  };
  const drawWings = () => {
    for (let index = 0; index < motif.wings; index += 1) {
      const offset = 42 + index * 22;
      fillEllipse(cx - 108 - offset / 2, cy - 36 + index * 18, 54 - index * 4, 18 + index * 2, shadow);
      fillEllipse(cx + 108 + offset / 2, cy - 36 + index * 18, 54 - index * 4, 18 + index * 2, shadow);
    }
  };
  const drawCore = () => {
    switch (motif.core) {
      case "seed":
        fillEllipse(cx, cy, 52, 98, shadow);
        drawLine(cx, cy - 78, cx + 42, cy - 132, 8, shadow);
        fillEllipse(cx + 66, cy - 132, 38, 18, shadow);
        break;
      case "crescent":
        fillCircle(cx - 22, cy, 96, shadow);
        fillCircle(cx + 26, cy - 6, 92, 0x171b28);
        fillCircle(cx - 20, cy, 28, shadow);
        break;
      case "shield":
        fillTriangle(cx - 88, cy - 88, cx + 88, cy - 88, cx, cy + 122, shadow);
        fillRect(cx - 78, cy - 98, 156, 80, shadow);
        drawLine(cx, cy - 78, cx, cy + 82, 7, relief, 180);
        break;
      case "knot":
        fillEllipse(cx - 46, cy, 62, 86, shadow);
        fillEllipse(cx + 46, cy, 62, 86, shadow);
        fillCircle(cx, cy, 42, relief, 210);
        drawLine(cx - 98, cy - 72, cx + 98, cy + 72, 10, shadow);
        drawLine(cx - 98, cy + 72, cx + 98, cy - 72, 10, shadow);
        break;
      case "compass":
        fillCircle(cx, cy, 90, shadow);
        fillTriangle(cx, cy - 136, cx - 32, cy + 18, cx + 32, cy + 18, relief, 210);
        fillTriangle(cx, cy + 136, cx - 28, cy - 18, cx + 28, cy - 18, shadow);
        drawLine(cx - 128, cy, cx + 128, cy, 8, shadow);
        break;
      case "chip":
        fillRect(cx - 78, cy - 78, 156, 156, shadow);
        for (let pin = -78; pin <= 78; pin += 26) {
          fillRect(cx - 116, cy + pin, 36, 8, shadow);
          fillRect(cx + 80, cy + pin, 36, 8, shadow);
          fillRect(cx + pin, cy - 116, 8, 36, shadow);
          fillRect(cx + pin, cy + 80, 8, 36, shadow);
        }
        fillRect(cx - 34, cy - 34, 68, 68, relief, 190);
        break;
      case "mask":
        fillEllipse(cx, cy, 116, 78, shadow);
        fillEllipse(cx - 42, cy - 8, 28, 16, relief, 230);
        fillEllipse(cx + 42, cy - 8, 28, 16, relief, 230);
        fillTriangle(cx - 22, cy + 22, cx + 22, cy + 22, cx, cy + 64, relief, 180);
        break;
      case "sun":
        drawSpikes();
        fillCircle(cx, cy, 86, shadow);
        fillCircle(cx, cy, 36, relief, 190);
        break;
      case "crown":
        fillRect(cx - 92, cy - 22, 184, 88, shadow);
        fillTriangle(cx - 92, cy - 22, cx - 52, cy - 124, cx - 12, cy - 22, shadow);
        fillTriangle(cx - 38, cy - 22, cx, cy - 142, cx + 38, cy - 22, shadow);
        fillTriangle(cx + 12, cy - 22, cx + 52, cy - 124, cx + 92, cy - 22, shadow);
        break;
      case "heart":
        fillCircle(cx - 44, cy - 32, 56, shadow);
        fillCircle(cx + 44, cy - 32, 56, shadow);
        fillTriangle(cx - 100, cy - 4, cx + 100, cy - 4, cx, cy + 126, shadow);
        fillRect(cx - 18, cy - 70, 36, 136, relief, 180);
        break;
      case "zero":
        fillCircle(cx, cy, 112, shadow);
        fillCircle(cx, cy, 62, 0x171b28);
        drawLine(cx - 74, cy + 74, cx + 74, cy - 74, 12, shadow);
        break;
      case "lens":
      default:
        fillEllipse(cx, cy, 112, 86, shadow);
        fillCircle(cx, cy, 48, relief, 190);
        drawLine(cx + 70, cy + 60, cx + 132, cy + 122, 12, shadow);
        break;
    }
  };
  const applyPixelArtPass = (blockSize = 12) => {
    const snap = (value) => Math.max(0, Math.min(255, Math.round(value / 17) * 17));
    for (let blockY = 0; blockY < height; blockY += blockSize) {
      for (let blockX = 0; blockX < width; blockX += blockSize) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let count = 0;
        const maxY = Math.min(height, blockY + blockSize);
        const maxX = Math.min(width, blockX + blockSize);
        for (let y = blockY; y < maxY; y += 1) {
          for (let x = blockX; x < maxX; x += 1) {
            const index = (y * width + x) * 4;
            r += pixels[index];
            g += pixels[index + 1];
            b += pixels[index + 2];
            a += pixels[index + 3];
            count += 1;
          }
        }
        const blockR = snap(r / count);
        const blockG = snap(g / count);
        const blockB = snap(b / count);
        const blockA = Math.round(a / count);
        for (let y = blockY; y < maxY; y += 1) {
          for (let x = blockX; x < maxX; x += 1) {
            const index = (y * width + x) * 4;
            pixels[index] = blockR;
            pixels[index + 1] = blockG;
            pixels[index + 2] = blockB;
            pixels[index + 3] = blockA;
          }
        }
      }
    }
  };
  const drawPixelRelicSprite = () => {
    const cell = 14;
    const gridSize = 23;
    const mid = Math.floor(gridSize / 2);
    const startX = cx - Math.floor((gridSize * cell) / 2);
    const startY = cy - Math.floor((gridSize * cell) / 2);
    const themes = [
      { panel: 0x10151f, body: 0x4a1d16, shade: 0x1d0b09, trim: 0xff7a1a, glow: 0xffd166, gem: 0xfff1a8 },
      { panel: 0x0c1720, body: 0x123d52, shade: 0x061520, trim: 0x53d8ff, glow: 0xc7f9ff, gem: 0xffffff },
      { panel: 0x11131d, body: 0x2b2359, shade: 0x0b0920, trim: 0xa78bfa, glow: 0xf0d5ff, gem: 0xffd6e7 },
      { panel: 0x0e1912, body: 0x164b34, shade: 0x06140d, trim: 0x5ce1a1, glow: 0xd8ffcf, gem: 0xffffba },
      { panel: 0x17120b, body: 0x5a3a12, shade: 0x1c1004, trim: 0xffc857, glow: 0xfff7cc, gem: 0xffffff },
      { panel: 0x10151c, body: 0x314158, shade: 0x0a111a, trim: 0x9ca3af, glow: 0xe5eefb, gem: 0xc7f9ff },
      { panel: 0x170d17, body: 0x5b1837, shade: 0x190711, trim: 0xff6b88, glow: 0xffc3d4, gem: 0xfff1f6 },
      { panel: 0x080b12, body: 0x151a2f, shade: 0x03040a, trim: 0x69c7ff, glow: 0xc7d2fe, gem: 0xffffff },
      { panel: 0x15120f, body: 0x3b3025, shade: 0x0f0a07, trim: 0xd8b56d, glow: 0xf4e2b8, gem: 0xfff7cc },
      { panel: 0x111015, body: 0x36323f, shade: 0x09080d, trim: 0xf0abfc, glow: 0xfae8ff, gem: 0xfef3c7 },
      { panel: 0x091313, body: 0x15464a, shade: 0x031010, trim: 0x2dd4bf, glow: 0xccfbf1, gem: 0xffffff },
      { panel: 0x17110f, body: 0x6b2f1a, shade: 0x1c0804, trim: 0xfb923c, glow: 0xfde68a, gem: 0xffedd5 },
    ];
    const theme = themes[relicSeed % themes.length];
    let randomState = relicSeed || 1;
    const rand = () => {
      randomState ^= randomState << 13;
      randomState ^= randomState >>> 17;
      randomState ^= randomState << 5;
      return (randomState >>> 0) / 4294967296;
    };
    const drawCell = (gridX, gridY, hex, alpha = 255, inset = 1) => {
      fillRect(startX + gridX * cell + inset, startY + gridY * cell + inset, cell - inset * 2, cell - inset * 2, hex, alpha);
    };
    const key = (x, y) => `${x},${y}`;
    const mask = new Set();
    const trim = new Set();
    const gems = new Set();
    const runes = new Set();
    const shape = relicSeed % 9;
    const rx = 5.2 + rand() * 2.8;
    const ry = 6.2 + rand() * 3.3;
    const waist = 0.55 + rand() * 0.3;
    const heightShift = Math.floor(rand() * 3) - 1;
    const bodyTest = (x, y) => {
      const dx = Math.abs(x - mid);
      const dy = y - mid - heightShift;
      const absDy = Math.abs(dy);
      if (shape === 0) return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
      if (shape === 1) return dx / rx + absDy / ry <= 1;
      if (shape === 2) return y >= 4 && y <= 18 && dx <= Math.max(2, 7 - Math.floor(absDy * waist));
      if (shape === 3) return (y >= 5 && y <= 16 && dx <= 5) || (y >= 15 && dx <= 7 - Math.floor((y - 15) * 1.2));
      if (shape === 4) return dx <= 2 || (absDy <= 3 && dx <= 7) || (absDy <= 6 && dx <= 4);
      if (shape === 5) return (dx * dx) / ((rx - 1) ** 2) + (dy * dy) / (ry ** 2) <= 1 && !(dx <= 2 && absDy <= 2 && rand() > 0.35);
      if (shape === 6) return y >= 4 && y <= 18 && dx <= Math.max(1, Math.floor((y < mid ? y - 2 : 20 - y) * 0.65));
      if (shape === 7) return dx <= 3 || (y >= 7 && y <= 15 && dx <= 7) || (y >= 3 && y <= 6 && dx <= 1 + (y - 3));
      return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1 || dx + absDy <= 7;
    };

    for (let y = 2; y < gridSize - 2; y += 1) {
      for (let x = 0; x <= mid; x += 1) {
        if (bodyTest(x, y)) {
          mask.add(key(x, y));
          mask.add(key(gridSize - 1 - x, y));
        }
      }
    }

    if ((relicSeed >> 4) & 1) {
      for (let i = 0; i < 4; i += 1) {
        mask.add(key(mid - i, 3 + i));
        mask.add(key(mid + i, 3 + i));
      }
    }
    if ((relicSeed >> 6) & 1) {
      for (let y = 8; y <= 14; y += 1) {
        mask.add(key(2, y));
        mask.add(key(20, y));
        if (y % 2 === 0) {
          mask.add(key(1, y));
          mask.add(key(21, y));
        }
      }
    }
    if ((relicSeed >> 8) & 1) {
      for (let y = 16; y <= 20; y += 1) {
        mask.add(key(mid, y));
        if (y < 19) {
          mask.add(key(mid - 1, y));
          mask.add(key(mid + 1, y));
        }
      }
    }

    for (const cellKey of mask) {
      const [x, y] = cellKey.split(",").map(Number);
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !mask.has(key(x + dx, y + dy)));
      if (edge) trim.add(cellKey);
      if (!edge && (x === mid || y === mid || (x + y + relicSeed) % (4 + (relicSeed % 3)) === 0)) runes.add(cellKey);
    }

    const gemStyle = (relicSeed >> 10) % 4;
    const addGem = (x, y) => {
      if (mask.has(key(x, y))) gems.add(key(x, y));
    };
    if (gemStyle === 0) {
      [[mid, mid], [mid - 1, mid], [mid + 1, mid], [mid, mid - 1], [mid, mid + 1]].forEach(([x, y]) => addGem(x, y));
    } else if (gemStyle === 1) {
      for (let y = 6; y <= 16; y += 2) addGem(mid, y);
    } else if (gemStyle === 2) {
      [[mid - 3, 8], [mid + 3, 8], [mid, 12], [mid - 2, 15], [mid + 2, 15]].forEach(([x, y]) => addGem(x, y));
    } else {
      for (let x = mid - 4; x <= mid + 4; x += 2) addGem(x, mid);
      for (let y = mid - 4; y <= mid + 4; y += 2) addGem(mid, y);
    }

    fillRect(cx - 184, cy - 184, 368, 368, theme.panel, 242);
    strokeRect(cx - 184, cy - 184, 368, 368, color, 5);
    strokeRect(cx - 166, cy - 166, 332, 332, theme.trim, 2);

    for (let orbit = 0; orbit < motif.orbit; orbit += 1) {
      const angle = (Math.PI * 2 * orbit) / Math.max(1, motif.orbit) + (relicSeed % 31) / 31;
      const gridX = Math.round(mid + Math.cos(angle) * (9 + (orbit % 2)));
      const gridY = Math.round(mid + Math.sin(angle) * (8 + (orbit % 3)));
      drawCell(gridX, gridY, orbit % 3 === 0 ? theme.gem : theme.trim, 220, 3);
    }

    for (const cellKey of mask) {
      const [x, y] = cellKey.split(",").map(Number);
      const edge = trim.has(cellKey);
      const upperLight = y < mid && x <= mid;
      const lowerShade = y > mid + 3;
      drawCell(x, y, edge ? theme.shade : lowerShade ? theme.body : upperLight ? theme.glow : theme.body, edge ? 255 : 235, edge ? 0 : 1);
      if (runes.has(cellKey) && !edge) drawCell(x, y, theme.trim, 215, 5);
      if (gems.has(cellKey)) drawCell(x, y, theme.gem, 245, 3);
    }

    for (let corner = 0; corner < 4; corner += 1) {
      const x = corner % 2 === 0 ? 1 : 21;
      const y = corner < 2 ? 1 : 21;
      drawCell(x, y, theme.trim, 190, 4);
      drawCell(corner % 2 === 0 ? x + 1 : x - 1, y, theme.glow, 150, 5);
    }
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const t = (x / width) * 0.65 + (y / height) * 0.35;
      const base = Math.floor(15 + t * 18);
      const index = (y * width + x) * 4;
      pixels[index] = base;
      pixels[index + 1] = base + 4;
      pixels[index + 2] = base + 14;
      pixels[index + 3] = 255;
    }
  }
  strokeRect(28, 28, 904, 484, color, 6);
  strokeRect(48, 48, 864, 444, 0xffffff, 1);
  fillCircle(480, 270, 138, color, 45);
  drawOrbitals();
  drawWings();
  if (motif.core !== "sun") {
    drawSpikes();
  }
  drawCore();
  for (let x = 130; x <= 830; x += 70) {
    drawDiamond(x, 94 + ((x / 70) % 2) * 340, 9, color, 220);
  }
  applyPixelArtPass(18);
  drawPixelRelicSprite();
  return new AttachmentBuilder(encodePng(width, height, pixels), { name: "aurix-relic-spawn.png" });
}

function buildRelicSpawnPayload(relic, source = "chat") {
  const rarity = getRelicRarity(relic);
  const attachment = buildRelicSpawnAttachment(relic);
  const sourceLabels = {
    chat: "Chat activity",
    incense: "Incense",
    summon: "Aura summon",
    event: "World event",
    faction: "Faction surge",
  };
  const eventLine = relic.eventExclusive ? "Event-exclusive signal detected. If claimed, this relic will scar the server story." : null;
  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setAuthor({ name: "Aurix" })
    .setTitle("Relic Spawn")
    .setDescription([
      "A shadowed relic slipped into the channel.",
      eventLine,
      "First correct `/claim guess:<relic name>` wins it.",
      "Generated relics can be claimed with the first two main words.",
      "Use `/hint` if the server gets stuck.",
    ].filter(Boolean).join("\n"))
    .addFields(
      { name: "Rarity Signal", value: rarity.label, inline: true },
      { name: "Source", value: sourceLabels[source] || sourceLabels.chat, inline: true },
      { name: "Expires", value: humanizeMs(RELIC_SPAWN_TTL_MS), inline: true }
    )
    .setImage("attachment://aurix-relic-spawn.png")
    .setFooter({ text: "AURIX • Failed guesses do not despawn the relic." })
    .setTimestamp();
  return { embeds: [embed], files: [attachment] };
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
  return { ...EFFECT_CAPS };
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

  (grants.cosmetics || []).forEach((cosmetic) => {
    if (!cosmetic?.slot || !cosmetic?.value) {
      return;
    }
    const granted = grantCosmetic(user, { grantsCosmetic: cosmetic });
    if (granted) {
      summary.push(`${cosmetic.value} ${cosmetic.slot}`);
    }
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

function getDailyCatchup(previousDailyAt, currentStreak) {
  if (!previousDailyAt) {
    return { missedDays: 0, auraBonus: 0, xpBonus: 0, protectedStreak: 1, message: "First daily claimed." };
  }

  const elapsedMs = Date.now() - previousDailyAt.getTime();
  const missedDays = Math.max(0, Math.floor(elapsedMs / COOLDOWNS.dailyMs) - 1);
  if (missedDays <= 0) {
    return { missedDays: 0, auraBonus: 0, xpBonus: 0, protectedStreak: currentStreak + 1, message: "Daily rhythm continued." };
  }

  const cappedMissedDays = Math.min(missedDays, 5);
  const protectedStreak = Math.max(1, Math.floor((Number(currentStreak) || 0) * 0.75));
  return {
    missedDays,
    auraBonus: cappedMissedDays * 220,
    xpBonus: cappedMissedDays * 90,
    protectedStreak,
    message: `Welcome back. ${formatNumber(missedDays)} missed day${missedDays === 1 ? "" : "s"} converted into rested catch-up instead of wiping your rhythm.`,
  };
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
  user.relics ||= [];
  user.stats ||= {};
  user.stats.summons ||= 0;
  user.stats.relicsBurned ||= 0;
  user.stats.giftsSent ||= 0;
  user.stats.appreciationsGiven ||= 0;
  user.stats.appreciationsReceived ||= 0;
  user.stats.campfireShares ||= 0;
  user.stats.flexes ||= 0;
  user.stats.factionStrikes ||= 0;
  user.stats.blackMarketBuys ||= 0;
  user.stats.bountiesPlaced ||= 0;
  user.stats.bountiesClaimed ||= 0;
  user.stats.projectContributions ||= 0;
  user.notoriety = Math.max(0, Number(user.notoriety) || 0);
  user.faction ||= { id: null, pledgedAt: null };
  user.blackMarketPurchases ||= [];
  if (!user.reputation?.get) {
    user.reputation = new Map(Object.entries(user.reputation || {}));
  }
  normalizeInventoryState(user);
  normalizeProgressionSystems(user);
  normalizeTutorialState(user);
  if (!user.lastVaultInterestAt) {
    user.lastVaultInterestAt = new Date();
  }
  normalizePremiumState(user);
  ensureGardenPlotLimit(user);
  normalizeReminderState(user);
  normalizeTopggState(user);
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

function getTopggVoteUrl() {
  const botId = process.env.TOPGG_BOT_ID?.trim() || process.env.DISCORD_CLIENT_ID?.trim();
  return botId ? `https://top.gg/bot/${botId}/vote` : "https://top.gg/";
}

function resolveTopggVotePayload(payload = {}) {
  const data = payload.data || {};
  const isV1 = payload.type === "vote.create" || payload.type === "webhook.test";
  const voteType = isV1 ? payload.type : payload.type;
  const eventId = isV1 ? data.id || null : payload.id || null;
  const userId = isV1
    ? data.user?.platform_id || data.user?.platformId || data.user?.id || null
    : payload.user || null;
  const weight = isV1
    ? Number(data.weight) || 1
    : payload.isWeekend ? 2 : 1;
  const createdAt = isV1 && data.created_at ? new Date(data.created_at) : new Date();
  const expiresAt = isV1 && data.expires_at
    ? new Date(data.expires_at)
    : new Date(createdAt.getTime() + TOPGG_VOTE_COOLDOWN_MS);
  const project = data.project || {};

  return {
    eventId,
    userId: userId ? String(userId) : null,
    voteType,
    isTest: voteType === "webhook.test" || voteType === "test",
    isVote: voteType === "vote.create" || voteType === "upvote",
    weight: clamp(weight, 1, 5),
    createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
    expiresAt: Number.isNaN(expiresAt.getTime()) ? new Date(Date.now() + TOPGG_VOTE_COOLDOWN_MS) : expiresAt,
    projectId: project.id || payload.entity || payload.bot || null,
    projectPlatformId: project.platform_id || project.platformId || payload.bot || null,
  };
}

function buildTopggVoteKey(vote) {
  if (!vote?.userId || !vote?.createdAt) {
    return null;
  }
  const bucketMs = 5 * 60 * 1000;
  const createdBucket = Math.floor(vote.createdAt.getTime() / bucketMs);
  return [
    vote.eventId || "no-event-id",
    vote.userId,
    vote.voteType || "vote",
    vote.projectPlatformId || vote.projectId || "unknown-project",
    createdBucket,
  ].join(":");
}

function buildTopggReward(weight) {
  const multiplier = clamp(Number(weight) || 1, 1, 5);
  const crates = Object.entries(TOPGG_VOTE_REWARD.crates).reduce((drops, [crateId, amount]) => {
    const total = Math.floor((Number(amount) || 0) * multiplier);
    if (total > 0) {
      drops[crateId] = total;
    }
    return drops;
  }, {});

  return {
    aura: Math.floor(TOPGG_VOTE_REWARD.aura * multiplier),
    xp: Math.floor(TOPGG_VOTE_REWARD.xp * multiplier),
    crates,
  };
}

function formatTopggReward(reward) {
  const crates = Object.entries(reward.crates || {})
    .map(([crateId, amount]) => `${getCrateLabel(crateId)} x${amount}`)
    .join(", ");
  return [
    `${formatNumber(reward.aura)} aura`,
    `${formatNumber(reward.xp)} XP`,
    crates,
  ].filter(Boolean).join(", ");
}

function buildVotePromptPayload(user) {
  const voteUrl = getTopggVoteUrl();
  const rewardSummary = formatTopggReward(buildTopggReward(1));
  const reminderEnabled = user.reminders?.enabledActions?.includes("vote");
  return {
    ...buildEmbedPayload({
      title: "Vote Reward Ready",
      description: `Vote for Aurix on Top.gg and get **${rewardSummary}** automatically.`,
      visual: "emblem-success.svg",
      fields: [
        { name: "Vote Link", value: voteUrl },
        { name: "Reminder", value: reminderEnabled ? "Your vote reminder is already enabled, so you can be tagged when voting is available again." : "Want a ping next time voting opens? Use `/reminders enable action:Top.gg Vote`." },
      ],
      footer: "Top.gg votes refresh about every 12 hours.",
    }),
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel("Vote on Top.gg").setStyle(ButtonStyle.Link).setURL(voteUrl)
      ),
    ],
  };
}

async function maybePromptTopggVote(interaction, user, commandName) {
  if (TOPGG_VOTE_PROMPT_CHANCE <= 0) {
    return;
  }
  if (!interaction?.guildId || !interaction.user?.id || !interaction.followUp || !user || commandName === "vote") {
    return;
  }

  normalizeTopggState(user);
  const now = Date.now();
  const readyAt = getReminderReadyTimestamp(user, "vote");
  if (readyAt && readyAt > now) {
    return;
  }

  const lastPrompt = user.topgg.lastPromptAt?.getTime?.() || 0;
  if (now - lastPrompt < TOPGG_VOTE_PROMPT_COOLDOWN_MS) {
    return;
  }

  const neverVoted = !user.topgg.lastVoteAt;
  const promptChance = neverVoted ? Math.max(TOPGG_VOTE_PROMPT_CHANCE, 0.22) : TOPGG_VOTE_PROMPT_CHANCE;
  if (Math.random() > promptChance) {
    return;
  }

  user.topgg.lastPromptAt = new Date(now);
  user.markModified("topgg");
  await user.save();
  await interaction.followUp({
    ...buildVotePromptPayload(user),
    ephemeral: true,
  }).catch(() => null);
}

async function applyTopggVoteWebhookEvent(payload) {
  const vote = resolveTopggVotePayload(payload);
  if (!vote.userId) {
    return { ok: false, action: "ignored", reason: "missing_user" };
  }
  if (!vote.isVote) {
    return { ok: true, action: vote.isTest ? "test_received" : "ignored", userId: vote.userId, voteType: vote.voteType };
  }
  if (vote.eventId) {
    const existing = await TopggVoteLog.findOne({ eventId: vote.eventId }).lean();
    if (existing) {
      return { ok: true, action: "duplicate", userId: vote.userId, eventId: vote.eventId, reward: existing.reward || null };
    }
  }
  const voteKey = buildTopggVoteKey(vote);
  if (voteKey) {
    const existing = await TopggVoteLog.findOne({ voteKey }).lean();
    if (existing) {
      return { ok: true, action: "duplicate", userId: vote.userId, eventId: vote.eventId, voteKey, reward: existing.reward || null };
    }
  }

  let user = isGlobalPlayerDataEnabled()
    ? await getOrCreatePlayer(null, vote.userId)
    : await User.findOne({ userId: vote.userId }).sort({ updatedAt: -1, createdAt: 1 });
  if (!user) {
    user = await getOrCreatePlayer(null, vote.userId);
  } else {
    setQuestSet(user);
    normalizeInventoryState(user);
    normalizeProgressionSystems(user);
    normalizeTutorialState(user);
    normalizePremiumState(user);
    normalizeReminderState(user);
  }
  normalizeTopggState(user);
  if (user.topgg.lastVoteAt && vote.createdAt.getTime() - user.topgg.lastVoteAt.getTime() < TOPGG_VOTE_COOLDOWN_MS - 5 * 60 * 1000) {
    return {
      ok: true,
      action: "duplicate",
      reason: "within_vote_cooldown",
      userId: vote.userId,
      eventId: vote.eventId,
      voteKey,
      nextVoteAt: user.topgg.nextVoteAt || null,
    };
  }
  const reward = buildTopggReward(vote.weight);
  reward.aura = applyFaucetDamping(user, reward.aura);

  user.aura += reward.aura;
  user.xp += reward.xp;
  Object.entries(reward.crates).forEach(([crateId, amount]) => {
    user.crates.set(crateId, (user.crates.get(crateId) || 0) + amount);
  });
  user.topgg.voteCount += 1;
  user.topgg.voteWeight += vote.weight;
  user.topgg.lastVoteAt = vote.createdAt;
  user.topgg.nextVoteAt = vote.expiresAt;
  user.topgg.lastVoteEventId = vote.eventId;

  await syncRank(user);
  await user.save();

  await TopggVoteLog.create({
    eventId: vote.eventId,
    voteKey,
    userId: vote.userId,
    voteType: vote.voteType,
    weight: vote.weight,
    projectId: vote.projectId,
    projectPlatformId: vote.projectPlatformId,
    reward,
    payload,
  }).catch((error) => {
    if (error?.code !== 11000) {
      throw error;
    }
  });

  return {
    ok: true,
    action: "rewarded",
    userId: vote.userId,
    eventId: vote.eventId,
    weight: vote.weight,
    reward,
    rewardSummary: formatTopggReward(reward),
    nextVoteAt: vote.expiresAt,
    announcementGuildId: user.botContext?.lastGuildId || user.reminders?.guildId || user.guildId || null,
    announcementChannelId: user.botContext?.lastChannelId || user.reminders?.channelId || null,
  };
}

async function getGuildSettings(guildId) {
  if (!guildId) {
    return null;
  }
  return GuildSettings.findOne({ guildId });
}

async function getOrCreateGuildSettings(guildId) {
  if (!guildId) {
    return null;
  }
  return GuildSettings.findOneAndUpdate(
    { guildId },
    { $setOnInsert: { guildId } },
    { new: true, upsert: true }
  );
}

function normalizeRelicSpawnState(settings) {
  settings.relicSpawn ||= { current: null, incenseRemaining: 0, lastIncenseSpawnAt: null };
  settings.relicSpawn.incenseRemaining = Math.max(0, Number(settings.relicSpawn.incenseRemaining) || 0);
  settings.relicSpawn.lastIncenseSpawnAt ||= null;
  return settings.relicSpawn;
}

async function spawnRelicInChannel(channel, source = "chat") {
  if (!channel?.guildId || !channel?.send) {
    return null;
  }
  const settings = await getOrCreateGuildSettings(channel.guildId);
  const spawnState = normalizeRelicSpawnState(settings);
  const relic = rollRelicForWorld(settings, source);
  const rarity = getRelicRarity(relic);
  spawnState.current = {
    relicId: relic.id,
    relicName: relic.name,
    rarity: relic.rarity,
    spawnedAt: new Date(),
    spawnedBy: source,
    source,
    hintUses: 0,
  };
  settings.markModified("relicSpawn");
  await settings.save();
  await channel.send(buildRelicSpawnPayload(relic, source)).catch(() => null);
  return { relic, rarity };
}

function getCommandChannelId(settings) {
  return settings?.commandChannelId || settings?.aurixChannelId || null;
}

function getDropsChannelId(settings) {
  return settings?.dropsChannelId || settings?.aurixChannelId || null;
}

async function setAurixChannel(guildId, channelId, configuredBy, mode = "commands") {
  const set = {
    guildId,
    configuredBy,
    configuredAt: new Date(),
  };
  if (mode === "drops") {
    set.dropsChannelId = channelId;
  } else if (mode === "both") {
    set.aurixChannelId = channelId;
    set.commandChannelId = channelId;
    set.dropsChannelId = channelId;
  } else {
    set.commandChannelId = channelId;
  }

  return GuildSettings.findOneAndUpdate(
    { guildId },
    { $set: set },
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
  if (action === "vote") {
    normalizeTopggState(user);
    if (user.topgg.nextVoteAt) {
      return user.topgg.nextVoteAt.getTime();
    }
    if (user.topgg.lastVoteAt) {
      return user.topgg.lastVoteAt.getTime() + TOPGG_VOTE_COOLDOWN_MS;
    }
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
    return "Plant something first, then this gentle reminder can tell you when a crop is ready. It is optional and low-frequency.";
  }
  return "This reminder is only for slow, low-pressure activities.";
}

function buildBalancePayload(user, targetUser) {
  const combinedEffects = getCombinedEffects(user);
  const vaultRate = getVaultRate(user, combinedEffects);
  return buildEmbedPayload({
    title: `${targetUser.username}'s Balance`,
    description: "A quick look at wallet, vault, and passive income.",
    visual: "economy-vault.svg",
    fields: [
      { name: "Wallet", value: `${formatNumber(user.aura)} aura`, inline: true },
      { name: "Vault", value: `${formatNumber(user.vaultAura)} aura`, inline: true },
      { name: "Vault Rate", value: `${(vaultRate * 100).toFixed(2)}% per hour`, inline: true },
      { name: "Membership", value: formatPremiumStatus(user), inline: true },
      { name: "Prestige", value: `${user.prestige}`, inline: true },
      { name: "Daily Rhythm", value: `${user.streak} gentle check-in${user.streak === 1 ? "" : "s"}`, inline: true },
      { name: "Faucet Multiplier", value: `${Math.round(getFaucetMultiplier(user) * 100)}%`, inline: true },
    ],
    footer: "Large vaults earn lower marginal yield so old wealth cannot compound forever.",
  });
}

function buildReminderStatusPayload(user) {
  normalizeReminderState(user);
  const reminderLimit = getReminderLimit(user);
  const enabled = user.reminders.enabledActions
    .map((action) => `\`${REMINDER_ACTIONS[action]?.command || action}\``)
    .join(", ");

  return buildEmbedPayload({
    title: "Gentle Reminder Settings",
    description: user.reminders.enabledActions.length
      ? "The bot will only tag you for slow, low-pressure activities you explicitly enabled."
      : "No reminders are enabled right now. That is perfectly fine.",
    visual: "emblem-help.svg",
    fields: [
      { name: "Enabled", value: enabled || "None" },
      { name: "Slots", value: `${user.reminders.enabledActions.length} / ${reminderLimit}`, inline: true },
      { name: "Channel", value: user.reminders.channelId ? `<#${user.reminders.channelId}>` : "Not set", inline: true },
      { name: "Server", value: user.reminders.guildId || "Not set", inline: true },
    ],
    footer: "Reminders are optional. Core progression does not require checking back on timers.",
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
      content: `<@${user.userId}> ${REMINDER_ACTIONS[action].command} is ready when you feel like checking in.`,
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

async function handleChatRelicSpawnMessage(message) {
  if (!message?.guildId || message.author?.bot || !message.channel?.send) {
    return null;
  }
  const settings = await getGuildSettings(message.guildId);
  const dropsChannelId = getDropsChannelId(settings);
  if (!dropsChannelId || dropsChannelId !== message.channelId) {
    return null;
  }

  const now = Date.now();
  const state = chatSpawnCounters.get(message.channelId) || {
    count: 0,
    lastUserId: null,
    distinctUserIds: new Set(),
    lastCountedByUser: new Map(),
  };
  const lastCountedAt = state.lastCountedByUser.get(message.author.id) || 0;
  if (now - lastCountedAt < CHAT_SPAWN_USER_RATE_LIMIT_MS) {
    chatSpawnCounters.set(message.channelId, state);
    return null;
  }

  state.count += 1;
  state.distinctUserIds.add(message.author.id);
  state.lastCountedByUser.set(message.author.id, now);
  const alternating = state.lastUserId && state.lastUserId !== message.author.id;
  state.lastUserId = message.author.id;
  const threshold = state.distinctUserIds.size >= 2 && alternating
    ? CHAT_SPAWN_MULTI_USER_THRESHOLD
    : CHAT_SPAWN_SINGLE_USER_THRESHOLD;

  if (state.count < threshold) {
    chatSpawnCounters.set(message.channelId, state);
    return null;
  }

  chatSpawnCounters.set(message.channelId, {
    count: 0,
    lastUserId: null,
    distinctUserIds: new Set(),
    lastCountedByUser: new Map(),
  });
  return spawnRelicInChannel(message.channel, "chat");
}

async function checkIncenseSpawns(client) {
  await GuildSettings.updateMany(
    { "relicSpawn.current.spawnedAt": { $lte: new Date(Date.now() - RELIC_SPAWN_TTL_MS) } },
    { $set: { "relicSpawn.current": null } }
  );

  const settingsRows = await GuildSettings.find({
    $or: [
      { dropsChannelId: { $ne: null } },
      { aurixChannelId: { $ne: null } },
    ],
    "relicSpawn.incenseRemaining": { $gt: 0 },
  }).limit(50);

  for (const settings of settingsRows) {
    const channelId = getDropsChannelId(settings);
    const channel = channelId ? await client.channels.fetch(channelId).catch(() => null) : null;
    if (!channel?.send) {
      continue;
    }
    await spawnRelicInChannel(channel, "incense");
    await GuildSettings.updateOne(
      { _id: settings._id, "relicSpawn.incenseRemaining": { $gt: 0 } },
      {
        $inc: { "relicSpawn.incenseRemaining": -1 },
        $set: { "relicSpawn.lastIncenseSpawnAt": new Date() },
      }
    );
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

function startRelicSpawnLoop(client) {
  if (relicSpawnIntervals.has(client)) {
    return;
  }

  const tick = () => checkIncenseSpawns(client).catch((error) => {
    console.error("Relic incense loop failed:", error);
  });

  tick();
  const interval = setInterval(tick, INCENSE_TICK_MS);
  interval.unref?.();
  relicSpawnIntervals.set(client, interval);
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

function getPathValue(target, pathValue) {
  return String(pathValue || "").split(".").reduce((value, key) => value?.[key], target);
}

function setPathValue(target, pathValue, value) {
  const keys = String(pathValue || "").split(".").filter(Boolean);
  if (!keys.length) {
    return;
  }

  let cursor = target;
  keys.slice(0, -1).forEach((key) => {
    cursor[key] ||= {};
    cursor = cursor[key];
  });
  cursor[keys[keys.length - 1]] = value;
}

async function reserveUserCooldown(user, fieldName, durationMs) {
  if (!user?._id || !fieldName) {
    return { ok: false, remaining: 0 };
  }

  const cooldownMs = getEffectiveCooldownMs(user, durationMs);
  const now = new Date();
  const cutoff = new Date(now.getTime() - cooldownMs);
  const currentValue = getPathValue(user, fieldName);
  const remaining = getCooldownRemaining(currentValue, durationMs, user);
  if (remaining > 0) {
    return { ok: false, remaining };
  }

  const result = await User.updateOne(
    {
      _id: user._id,
      $or: [
        { [fieldName]: { $exists: false } },
        { [fieldName]: null },
        { [fieldName]: { $lte: cutoff } },
      ],
    },
    { $set: { [fieldName]: now } }
  );

  if (result.modifiedCount <= 0) {
    return { ok: false, remaining: cooldownMs };
  }

  setPathValue(user, fieldName, now);
  return { ok: true, remaining: 0 };
}

function humanizeMs(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes <= 0 ? `${seconds}s` : `${minutes}m ${seconds}s`;
}

function hashString(value) {
  return String(value || "").split("").reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0);
}

async function claimVaultInterest(user) {
  const effects = getCombinedEffects(user);
  const now = new Date();
  const elapsedMs = now.getTime() - (user.lastVaultInterestAt?.getTime() || now.getTime());
  const elapsedHours = Math.min(ECONOMY_RULES.vaultMaxAccrualHours, Math.max(0, elapsedMs / (60 * 60 * 1000)));
  const rate = getVaultRate(user, effects);
  const accruedInterest = user.vaultAura * rate * elapsedHours;
  const totalInterest = accruedInterest + (Number(user.vaultInterestRemainder) || 0);
  const interest = Math.floor(totalInterest);
  user.vaultInterestRemainder = Math.max(0, totalInterest - interest);
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
      { name: "Daily Rhythm", value: `${user.streak} gentle check-ins`, inline: true },
      { name: "Rank Progress", value: `${progressBar(rankProgressCurrent, rankProgressTotal)}\n${formatNumber(rankProgressCurrent)} / ${formatNumber(rankProgressTotal)} XP` },
      { name: "Battle Record", value: `PvP ${user.stats.pvpWins}-${user.stats.pvpLosses} | Boss ${user.stats.bossWins}-${user.stats.bossLosses}` },
      { name: "PvP Streak", value: `${formatNumber(getPvpStreak(user))} current | ${formatNumber(getBestPvpStreak(user))} best`, inline: true },
    ],
    footer: "Progress is meant to be paced. The healthiest long-term goals are collection, world story, and community projects.",
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
      { name: "/tutorial", description: "Follow the guided first-session reward path." },
      { name: "/profile [user]", description: "View your or another player's profile." },
      { name: "/stats [user]", description: "See a fuller breakdown of player activity." },
      { name: "/event action:<status|claim>", description: "View world events or claim active server events." },
      { name: "/project", description: "Build a shared server project by donating aura and materials." },
      { name: "/community", description: "View this server's shared identity, level, and active project." },
      { name: "/identity", description: "View or set the server's motto, symbol, and values." },
      { name: "/campfire", description: "Share memories and low-pressure community prompts." },
      { name: "/appreciate", description: "Recognize another member without turning it into a grind reward." },
      { name: "/faction", description: "Pledge to a faction and push the server warboard." },
      { name: "/flex", description: "Post a public status card built from real progression." },
      { name: "/bounty", description: "Post public grudges and fund revenge arcs." },
      { name: "/blackmarket", description: "Buy scarce rotating prestige contraband." },
      { name: "/world", description: "View the living server world, factions, seasons, and story encounters." },
      { name: "/ask", description: "Ask in natural language and get routed to the right Aurix feature." },
      { name: "/serverquest", description: "View the rotating community quest." },
      { name: "/setup", description: "Admin/mod command to choose where Aurix commands work." },
      { name: "/help", description: "Browse every command grouped by category." },
    ],
  },
  {
    id: "community_play",
    name: "Community Play",
    visual: "help-summary.svg",
    commands: [
      { name: "/appreciate user:<member>", description: "Publicly thank someone for kindness, creativity, help, welcoming, or humor." },
      { name: "/campfire status", description: "Open the current server prompt and recent appreciation log." },
      { name: "/campfire share text:<message>", description: "Save a memory, idea, or thanks into the server story." },
      { name: "/identity view", description: "View the server's shared motto, symbol, values, and community level." },
      { name: "/identity set", description: "Manager-only update for server identity." },
      { name: "/partyquest", description: "Complete a cooperative four-role server expedition." },
      { name: "/weather", description: "See the server's current social mood weather." },
      { name: "/letter", description: "Receive a faction letter about the server's story." },
      { name: "/shrine", description: "Restore the shared artifact shrine with materials." },
      { name: "/memoryquest", description: "Turn server memories into shared lore." },
      { name: "/yearbook", description: "Generate a shareable monthly community card." },
      { name: "/gallery", description: "Show the server's artifact and identity gallery." },
      { name: "/social [user]", description: "View a member's social reputation and contribution identity." },
    ],
  },
  {
    id: "chaos",
    name: "Controlled Chaos",
    visual: "help-bosses.svg",
    commands: [
      { name: "/faction status", description: "View the faction warboard, server tension, and influence race." },
      { name: "/faction pledge faction:<side>", description: "Publicly pick a faction identity." },
      { name: "/faction strike", description: "Spend aura to push your faction and raise server tension." },
      { name: "/flex [user]", description: "Show power, prestige, rare relics, faction, and battle reputation." },
      { name: "/bounty status", description: "View active public grudges and bounty values." },
      { name: "/bounty place user:<target>", description: "Fund a revenge arc for PvP and heist conflict." },
      { name: "/blackmarket status", description: "View the current rotating contraband drop." },
      { name: "/blackmarket buy", description: "Burn aura on scarce cosmetics or materials." },
      { name: "/world encounter", description: "Force a community decision point into the server story." },
      { name: "/pvp", description: "Duel or enter matchmaking for social rivalry." },
      { name: "/clan war enemy:<code>", description: "Challenge another clan by code." },
    ],
  },
  {
    id: "economy",
    name: "Economy",
    visual: "economy-vault.svg",
    commands: [
      { name: "/daily", description: "Claim a relaxed daily check-in and refresh quests." },
      { name: "/vote", description: "Vote on Top.gg for webhook-delivered aura, XP, and crates." },
      { name: "/premium-chest", description: "Premium-only recurring loot chest with aura, XP, crates, and materials." },
      { name: "/work", description: "Complete a shift for steady aura and XP." },
      { name: "/mine", description: "Gather crafting materials on a cooldown." },
      { name: "/spin", description: "Spin for aura and XP on a cooldown." },
      { name: "/coinflip", description: "Bet aura on heads or tails on a cooldown." },
      { name: "/rob user:<player>", description: "Run a capped strategic heist with revenge, protection, and faction counterplay." },
      { name: "/bounty", description: "Post or inspect bounties that turn grudges into public conflict." },
      { name: "/vault deposit", description: "Move aura into the vault." },
      { name: "/vault withdraw", description: "Take aura back from the vault." },
      { name: "/vault interest", description: "Collect the vault's accumulated interest." },
      { name: "/shop", description: "Browse perks, crates, and unlocks." },
      { name: "/buy item:<id>", description: "Purchase a shop item by id." },
      { name: "/roleshop", description: "Browse and buy server roles listed by admins." },
      { name: "/gift user:<player> amount:<amount>", description: "Send aura to another player." },
      { name: "/trade", description: "Offer aura or items to another player." },
      { name: "/inventory", description: "Review owned items, battle consumables, skills, and crates." },
      { name: "/collection", description: "View collection progress and trophies." },
      { name: "/summon", description: "Spend aura to print a collectible Aurix relic." },
      { name: "/claim guess:<name>", description: "Race to claim the active chat-spawned relic." },
      { name: "/hint", description: "Reveal an obfuscated hint for the active relic spawn." },
      { name: "/relic", description: "Inspect, evolve, purify, or faction-bind owned relics." },
      { name: "/incense", description: "Buy or check channel relic incense for quiet servers." },
      { name: "/burn relic:<id>", description: "Destroy duplicate relics for aura and XP." },
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
      { name: "/season", description: "View current clan season standings." },
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
  { id: "shadow_winner", name: "Shadow Operator", description: "Win 5 non-stealing shadow heists.", metric: (user) => user.stats.robWins, goal: 5, rewardAura: 2600, rewardXp: 650 },
  { id: "ore_runner", name: "Ore Runner", description: "Mine 10 times.", metric: (user) => user.stats.mines, goal: 10, rewardAura: 2100, rewardXp: 480 },
  { id: "relic_hunter", name: "Relic Hunter", description: "Summon 10 relics.", metric: (user) => user.stats.summons || 0, goal: 10, rewardAura: 2600, rewardXp: 620 },
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
  normalizeTutorialState(user);
  const current = TUTORIAL_STEPS[user.tutorial.step];
  return buildEmbedPayload({
    title: "Aurix Tutorial",
    description: `Your save is ready with **${formatNumber(user.aura)} aura**. Follow this route to learn the economy, relics, progression, and combat without guessing what matters first.`,
    visual: "help-core.svg",
    fields: [
      { name: "1. First Money", value: "`/daily`, `/work`, `/spin`, and `/mine` are your starter loop. They give aura, XP, crates, or materials on cooldown." },
      { name: "2. Guided Rewards", value: getTutorialStatusLines(user) },
      { name: "3. Relic Hunting", value: "`/summon` spends aura to spawn a public relic. Chat activity and `/incense buy` can spawn relics too. Use `/hint`, then `/claim guess:<name>`." },
      { name: "4. Wallet And Vault", value: "`/balance` checks your money. `/vault deposit` protects aura and starts interest growth. `/vault interest` claims the passive payout." },
      { name: "5. Inventory Path", value: "`/inventory`, `/collection`, `/crate`, `/shop`, `/craft`, `/forge`, and `/gear` turn drops into long-term power." },
      { name: "6. Daily Direction", value: "`/quests`, `/achievements`, `/rank`, and `/prestige` show what to chase next once the basics are moving." },
      { name: "7. Server Play", value: "`/boss`, `/pvp`, `/clan`, `/leaderboard`, `/event`, and `/serverquest` are the bigger multiplayer loops." },
      { name: "Next Step", value: current ? `Do **${current.label}** for ${formatNumber(current.rewardAura)} aura + ${formatNumber(current.rewardXp)} XP.` : "Tutorial complete. Keep building through quests, relics, clans, bosses, and PvP." },
    ],
    footer: "Use /tutorial any time to check your guided step progress. Use /help for the full command list.",
  });
}

function buildServerSetupPayload(guildName) {
  return buildEmbedPayload({
    title: "Setup Completed",
    description: `Aurix is ready in **${guildName}**. Commands and drops can now use separate channels.`,
    visual: "help-core.svg",
    fields: [
      { name: "Player Onboarding", value: "Members should run `/start` to create their save and see the quick-start path." },
      { name: "Recommended Split", value: "Use `/setup mode:commands channel:#economy` for economy commands and `/setup mode:drops channel:#aurix-drops` for relic chat spawns." },
      { name: "Best First Commands", value: "`/daily`, `/work`, `/spin`, `/mine`, `/profile`, `/help`" },
      { name: "Changing Channels", value: "Admins can rerun `/setup mode:commands`, `/setup mode:drops`, or `/setup mode:both` any time." },
      { name: "Official Server", value: buildOfficialServerValue() },
    ],
    footer: "Aurix setup v4 - command and drops channels can be configured separately.",
  });
}

function getMissingSetupChannelPermissions(channel, botMember) {
  const permissions = channel?.permissionsFor?.(botMember);
  if (!permissions) {
    return ["View Channel", "Send Messages"];
  }

  const requiredPermissions = [
    [PermissionsBitField.Flags.ViewChannel, "View Channel"],
    [PermissionsBitField.Flags.SendMessages, "Send Messages"],
    [PermissionsBitField.Flags.EmbedLinks, "Embed Links"],
  ];
  return requiredPermissions
    .filter(([flag]) => !permissions.has(flag))
    .map(([, label]) => label);
}

function buildSetupPlainText(guildName) {
  return [
    `Aurix is ready in ${guildName}.`,
    "Members should run /start to create their save and see the quick-start path.",
    "Recommended split: /setup mode:commands channel:#economy and /setup mode:drops channel:#aurix-drops.",
    "Best first commands: /daily, /work, /spin, /mine, /profile, /help.",
  ].join("\n");
}

function buildSetupGuidePayloadForPermissions(guildName, permissions) {
  const payload = buildServerSetupPayload(guildName);
  if (permissions?.has(PermissionsBitField.Flags.AttachFiles)) {
    return payload;
  }

  const { files, ...payloadWithoutFiles } = payload;
  if (payloadWithoutFiles.embeds?.[0]?.setImage) {
    payloadWithoutFiles.embeds[0].setImage(null);
  }
  return payloadWithoutFiles;
}

async function sendSetupGuideToChannel(channel, guildName) {
  const botMember = channel.guild?.members?.me || await channel.guild?.members?.fetchMe?.().catch(() => null);
  const permissions = channel.permissionsFor?.(botMember);
  const payload = buildSetupGuidePayloadForPermissions(guildName, permissions);
  return channel.send(payload).catch(() => channel.send({ content: buildSetupPlainText(guildName) }));
}

function buildServerJoinPayload(guildName) {
  return buildEmbedPayload({
    title: "Aurix Setup Required",
    description: `Thanks for adding Aurix to **${guildName}**. An admin should choose the channel where Aurix is allowed to work before members start using commands.`,
    visual: "help-core.svg",
    fields: [
      { name: "1. Create a Drops Channel", value: "Recommended: make a separate channel like `#aurix-drops`, `#relic-drops`, or `#bot-drops` for relic spawns, claims, hints, and economy commands." },
      { name: "2. Configure Channels", value: "Run `/setup mode:commands channel:#economy` for commands, then `/setup mode:drops channel:#aurix-drops` for chat-spawn relic drops. Use `mode:both` if you want one channel for everything." },
      { name: "3. Player Start", value: "Members should run `/start`, then use `/daily`, `/work`, `/spin`, `/mine`, and `/profile`." },
      { name: "4. Premium and Support", value: "Use `/premium` to view membership status and `/help` to browse every command." },
      { name: "Official Server", value: buildOfficialServerValue() },
    ],
    footer: "Aurix setup v4 - admins can rerun /setup any time to change command or drops channels.",
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
    ...addQuickActions(buildPlayerStartPayload(user), interaction.user.id, ["daily", "work", "spin", "tutorial"]),
    ephemeral: true,
  });
}

async function handleTutorial(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  normalizeTutorialState(user);
  const current = TUTORIAL_STEPS[user.tutorial.step];
  await user.save();
  return interaction.reply({
    ...addQuickActions(buildEmbedPayload({
      title: "Aurix Tutorial",
      description: user.tutorial.completed
        ? "Tutorial complete. You can keep growing through quests, vault interest, clans, bosses, and PvP."
        : `Next step: **${current?.label || "Complete"}**`,
      visual: "help-summary.svg",
      fields: [
        { name: "Path", value: getTutorialStatusLines(user) },
        { name: "Step Reward", value: current ? `${formatNumber(current.rewardAura)} aura + ${formatNumber(current.rewardXp)} XP` : "Complete", inline: true },
      ],
      footer: "Use the buttons below for fast first steps.",
    }), interaction.user.id, ["daily", "work", "spin", "profile"]),
    ephemeral: true,
  });
}

async function handleProfile(interaction) {
  const target = interaction.options?.getUser?.("user") || interaction.user;
  const user = await getOrCreatePlayer(interaction.guildId, target.id);
  await user.save();
  return interaction.reply(buildProfileEmbed(user, target));
}

async function handleBalance(interaction) {
  const target = interaction.options?.getUser?.("user") || interaction.user;
  const user = await getOrCreatePlayer(interaction.guildId, target.id);
  return interaction.reply(buildBalancePayload(user, target));
}

async function handleStats(interaction) {
  const target = interaction.options?.getUser?.("user") || interaction.user;
  const user = await getOrCreatePlayer(interaction.guildId, target.id);
  await user.save();

  const totalBattles = user.stats.pvpWins + user.stats.pvpLosses + user.stats.bossWins + user.stats.bossLosses;
  return interaction.reply(buildEmbedPayload({
    title: `${target.username}'s Combat and Economy Stats`,
    description: "A deeper look at activity, wins, and long-term progress.",
    visual: "help-summary.svg",
    fields: [
      { name: "Spins", value: `${formatNumber(user.stats.spins)}`, inline: true },
      { name: "Relic Finds", value: `${formatNumber(user.stats.summons || 0)}`, inline: true },
      { name: "Coinflips", value: `${formatNumber(user.stats.coinflips)}`, inline: true },
      { name: "Shop Buys", value: `${formatNumber(user.stats.shopBuys)}`, inline: true },
      { name: "Gifts Sent", value: `${formatNumber(user.stats.giftsSent || 0)}`, inline: true },
      { name: "Project Help", value: `${formatNumber(user.stats.projectContributions || 0)}`, inline: true },
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

  const transferFee = getTransferFee(amount);
  const totalCost = amount + transferFee;
  if (amount <= 0 || totalCost > sender.aura) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Gift Failed", description: `Send an amount inside your current aura wallet. Large transfers include a ${Math.round(ECONOMY_RULES.transferFeeRate * 100)}% burn fee above ${formatNumber(ECONOMY_RULES.transferFeeThreshold)} aura.`, visual: "emblem-alert.svg" }), ephemeral: true });
  }

  const receiver = await getOrCreatePlayer(interaction.guildId, target.id);
  sender.aura -= totalCost;
  receiver.aura += amount;
  sender.stats.giftsSent = (sender.stats.giftsSent || 0) + 1;
  await applyQuestProgress(sender, "giftsSent", 1);
  await sender.save();
  await receiver.save();

  return interaction.reply(buildEmbedPayload({
    title: "Aura Gift Sent",
    description: `${interaction.user.username} sent **${formatNumber(amount)} aura** to ${target.username}.`,
    visual: "emblem-success.svg",
    fields: [
      { name: "Sender Wallet", value: `${formatNumber(sender.aura)} aura`, inline: true },
      { name: "Receiver Wallet", value: `${formatNumber(receiver.aura)} aura`, inline: true },
      { name: "Burned Fee", value: `${formatNumber(transferFee)} aura`, inline: true },
      { name: "Social Progress", value: "Gift quests and server bonds can progress from helping others.", inline: false },
    ],
  }));
}

function getTradableQuantity(user, itemId) {
  if (!itemId) {
    return 0;
  }
  if (itemId.startsWith("crate:")) {
    const crateId = itemId.slice(6);
    return CRATES[crateId] ? user.crates.get(crateId) || 0 : 0;
  }
  if (!isTradableItemId(itemId)) {
    return 0;
  }
  return getInventoryQuantity(user, itemId);
}

function isTradableItemId(itemId) {
  if (!itemId) {
    return false;
  }
  if (MATERIALS[itemId]) {
    return true;
  }
  const item = getItem(itemId);
  return item?.type === "combat";
}

function getTradeItemHelpText() {
  const materialExamples = Object.keys(MATERIALS).slice(0, 3).map((id) => `\`${id}\``).join(", ");
  return `Tradable ids are materials like ${materialExamples}, combat consumables, or crates like \`crate:rare\`. Permanent perks, skills, and cosmetics are account-bound.`;
}

function buildTradeActionRows(offer) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`trade:accept:${offer.offerId}:${offer.toUserId}`).setLabel("Accept Trade").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`trade:decline:${offer.offerId}:${offer.toUserId}`).setLabel("Decline").setStyle(ButtonStyle.Secondary)
    ),
  ];
}

function addTradableItem(user, itemId, quantity) {
  if (itemId.startsWith("crate:")) {
    const crateId = itemId.slice(6);
    user.crates.set(crateId, (user.crates.get(crateId) || 0) + quantity);
    return;
  }
  addInventoryItem(user, itemId, quantity);
}

function removeTradableItem(user, itemId, quantity) {
  if (itemId.startsWith("crate:")) {
    const crateId = itemId.slice(6);
    user.crates.set(crateId, Math.max(0, (user.crates.get(crateId) || 0) - quantity));
    return;
  }
  const entry = user.inventory.find((item) => item.id === itemId);
  if (entry) {
    entry.quantity = Math.max(0, entry.quantity - quantity);
  }
}

function getTradableLabel(itemId) {
  if (!itemId) {
    return "None";
  }
  if (itemId.startsWith("crate:")) {
    return getCrateLabel(itemId.slice(6));
  }
  return getInventoryLabel(itemId);
}

async function acceptTradeOffer(interaction, offerId) {
  const offer = await TradeOffer.findOne({ offerId, guildId: interaction.guildId, status: "pending" });
  if (!offer || offer.expiresAt.getTime() <= Date.now()) {
    if (offer) {
      offer.status = "expired";
      await offer.save();
    }
    return interaction.reply({ ...buildEmbedPayload({ title: "Trade Missing", description: "That pending trade was not found or already expired.", visual: "emblem-alert.svg" }), ephemeral: true });
  }

  if (offer.toUserId !== interaction.user.id) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Trade Blocked", description: "Only the receiving player can accept this trade.", visual: "emblem-alert.svg" }), ephemeral: true });
  }

  const sender = await getOrCreatePlayer(interaction.guildId, offer.fromUserId);
  const receiver = await getOrCreatePlayer(interaction.guildId, offer.toUserId);
  const transferFee = getTransferFee(offer.aura);
  const totalAuraCost = offer.aura + transferFee;
  if (totalAuraCost > sender.aura || (offer.itemId && getTradableQuantity(sender, offer.itemId) < offer.quantity)) {
    offer.status = "failed";
    await offer.save();
    return interaction.reply({ ...buildEmbedPayload({ title: "Trade Failed", description: "The sender no longer has the offered assets.", visual: "emblem-alert.svg" }), ephemeral: true });
  }

  sender.aura -= totalAuraCost;
  receiver.aura += offer.aura;
  if (offer.itemId && offer.quantity > 0) {
    removeTradableItem(sender, offer.itemId, offer.quantity);
    addTradableItem(receiver, offer.itemId, offer.quantity);
  }
  offer.status = "accepted";
  await sender.save();
  await receiver.save();
  await offer.save();
  return interaction.reply(buildEmbedPayload({
    title: "Trade Accepted",
    description: `Trade \`${offerId}\` completed.`,
    visual: "emblem-success.svg",
    fields: [
      { name: "Aura", value: `${formatNumber(offer.aura)}`, inline: true },
      { name: "Burned Fee", value: `${formatNumber(transferFee)}`, inline: true },
      { name: "Item", value: offer.itemId ? `${getTradableLabel(offer.itemId)} x${formatNumber(offer.quantity)}` : "None", inline: true },
    ],
  }));
}

async function handleTrade(interaction) {
  const subcommand = interaction.options.getSubcommand();
  await TradeOffer.updateMany({ status: "pending", expiresAt: { $lte: new Date() } }, { $set: { status: "expired" } }).catch(() => null);

  if (subcommand === "offer") {
    const target = interaction.options.getUser("user", true);
    const aura = interaction.options.getInteger("aura") || 0;
    const itemId = (interaction.options.getString("item") || "").trim();
    const quantity = interaction.options.getInteger("quantity") || (itemId ? 1 : 0);
    if (target.bot || target.id === interaction.user.id) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Trade Blocked", description: "Choose another human player.", visual: "emblem-alert.svg" }), ephemeral: true });
    }
    if (aura <= 0 && (!itemId || quantity <= 0)) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Trade Empty", description: "Offer aura, an item, or both.", visual: "emblem-alert.svg" }), ephemeral: true });
    }
    const sender = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
    if (itemId && !itemId.startsWith("crate:") && !isTradableItemId(itemId)) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Trade Item Locked", description: getTradeItemHelpText(), visual: "emblem-alert.svg" }), ephemeral: true });
    }
    const transferFee = getTransferFee(aura);
    if (aura + transferFee > sender.aura) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Trade Blocked", description: `You need ${formatNumber(aura + transferFee)} aura including the ${formatNumber(transferFee)} aura large-transfer burn fee.`, visual: "emblem-alert.svg" }), ephemeral: true });
    }
    if (itemId && getTradableQuantity(sender, itemId) < quantity) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Trade Blocked", description: `You do not have ${formatNumber(quantity)} ${getTradableLabel(itemId)}.\n${getTradeItemHelpText()}`, visual: "emblem-alert.svg" }), ephemeral: true });
    }

    const offerId = crypto.randomUUID().slice(0, 8);
    const offer = await TradeOffer.create({
      guildId: interaction.guildId,
      offerId,
      fromUserId: interaction.user.id,
      toUserId: target.id,
      aura,
      itemId: itemId || null,
      quantity: itemId ? quantity : 0,
      expiresAt: new Date(Date.now() + TRADE_OFFER_TIMEOUT_MS),
    });
    return interaction.reply(withExtraComponents(buildEmbedPayload({
      title: "Trade Offered",
      description: `${interaction.user.username} offered a trade to ${target.username}.`,
      visual: "emblem-success.svg",
      fields: [
        { name: "Offer ID", value: `\`${offerId}\``, inline: true },
        { name: "Aura", value: `${formatNumber(aura)}`, inline: true },
        { name: "Item", value: itemId ? `${getTradableLabel(itemId)} x${formatNumber(quantity)}` : "None", inline: true },
      ],
      footer: `${target.username} can accept with /trade accept id:${offerId}. Offers expire in ${humanizeMs(TRADE_OFFER_TIMEOUT_MS)}.`,
    }), buildTradeActionRows(offer)));
  }

  const offerId = interaction.options.getString("id", true).trim();
  const offer = await TradeOffer.findOne({ offerId, guildId: interaction.guildId, status: "pending" });
  if (!offer || offer.expiresAt.getTime() <= Date.now()) {
    if (offer) {
      offer.status = "expired";
      await offer.save();
    }
    return interaction.reply({ ...buildEmbedPayload({ title: "Trade Missing", description: "That pending trade was not found or already expired.", visual: "emblem-alert.svg" }), ephemeral: true });
  }

  if (subcommand === "cancel") {
    if (offer.fromUserId !== interaction.user.id) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Trade Blocked", description: "Only the sender can cancel this trade.", visual: "emblem-alert.svg" }), ephemeral: true });
    }
    offer.status = "cancelled";
    await offer.save();
    return interaction.reply(buildEmbedPayload({ title: "Trade Cancelled", description: `Trade \`${offerId}\` was cancelled.`, visual: "emblem-success.svg" }));
  }

  return acceptTradeOffer(interaction, offerId);
}

async function handleSummon(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  if (user.aura < SUMMON_COST) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Not Enough Aura", description: `A relic summon costs ${formatNumber(SUMMON_COST)} aura.`, visual: "emblem-economy.svg" }), ephemeral: true });
  }
  if (!interaction.channel?.send) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Summon Blocked", description: "I need a normal text channel where I can post the relic spawn.", visual: "emblem-alert.svg" }), ephemeral: true });
  }
  const cooldown = await reserveUserCooldown(user, "lastSummonAt", SUMMON_COOLDOWN_MS);
  if (!cooldown.ok) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Summon Cooling Down", description: `The relic gate can be opened again in **${humanizeMs(cooldown.remaining)}**.`, visual: "emblem-help.svg" }), ephemeral: true });
  }

  user.aura -= SUMMON_COST;
  user.stats.summons = (user.stats.summons || 0) + 1;
  await user.save();
  const spawned = await spawnRelicInChannel(interaction.channel, "summon");

  return interaction.reply(addQuickActions(buildEmbedPayload({
    title: "Relic Summoned",
    description: spawned
      ? `${interaction.user.username} spent **${formatNumber(SUMMON_COST)} aura** to pull a claimable relic into this channel.`
      : "The aura was spent, but I could not post the relic spawn in this channel.",
    visual: "emblem-success.svg",
    fields: [
      { name: "Cost", value: `${formatNumber(SUMMON_COST)} aura`, inline: true },
      { name: "Wallet", value: `${formatNumber(user.aura)} aura`, inline: true },
      { name: "Claim", value: "Use `/claim guess:<relic name>` to win it.", inline: false },
    ],
    footer: "Use /hint if the server gets stuck.",
  }), interaction.user.id, ["hint", "claim", "summon", "collection"]));
}

async function handleBurn(interaction) {
  const relicInput = interaction.options.getString("relic", true).trim();
  const matchedRelic = findRelicByInput(relicInput);
  const relicId = matchedRelic?.id || relicInput;
  const quantity = interaction.options.getInteger("quantity") || 1;
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const relic = matchedRelic || getRelic(relicId);
  const entry = getRelicEntry(user, relicId);
  if (!relic || !entry || entry.quantity <= 1) {
    const ownedRelicIds = (user.relics || [])
      .filter((owned) => owned.quantity > 1)
      .slice(0, 10)
      .map((owned) => `\`${owned.id}\``)
      .join(", ");
    return interaction.reply({ ...buildEmbedPayload({ title: "Burn Blocked", description: `You can only burn duplicate relics. Keep at least one copy in the collection.${ownedRelicIds ? `\nDuplicate relic ids: ${ownedRelicIds}` : ""}`, visual: "emblem-alert.svg" }), ephemeral: true });
  }
  const burnQuantity = Math.min(quantity, entry.quantity - 1);
  const rarity = getRelicRarity(relic);
  let auraReward = rarity.burnAura * burnQuantity;
  const xpReward = rarity.burnXp * burnQuantity;
  entry.quantity -= burnQuantity;
  auraReward = applyFaucetDamping(user, auraReward);
  user.aura += auraReward;
  user.xp += xpReward;
  user.stats.relicsBurned = (user.stats.relicsBurned || 0) + burnQuantity;
  user.markModified("relics");
  await syncRank(user);
  await user.save();

  return interaction.reply(addQuickActions(buildEmbedPayload({
    title: "Relic Burned",
    description: `Converted **${formatNumber(burnQuantity)}** duplicate ${getRelicLabel(relicId)} into spendable progression.`,
    visual: "emblem-economy.svg",
    fields: [
      { name: "Aura Recovered", value: `${formatNumber(auraReward)}`, inline: true },
      { name: "XP Recovered", value: `${formatNumber(xpReward)}`, inline: true },
      { name: "Remaining Copies", value: `x${formatNumber(entry.quantity)}`, inline: true },
    ],
  }), interaction.user.id, ["collection", "summon", "shop", "rank"]));
}

function buildRelicInspectPayload(user, entry) {
  const relic = getRelic(entry.id);
  const rarity = getRelicRarity(relic);
  const history = (entry.history || []).length
    ? entry.history.slice(0, 5).map((item) => `**${item.type}** - ${item.detail || "No detail"}${item.userId ? ` by <@${item.userId}>` : ""}`).join("\n")
    : "No recorded history yet.";
  const faction = entry.factionId ? getWorldFaction(entry.factionId).name : relic?.factionId ? getWorldFaction(relic.factionId).name : "Unbound";
  return buildEmbedPayload({
    title: `${relic?.name || entry.id} Relic Record`,
    description: relic?.description || "A procedurally archived Aurix relic.",
    visual: "emblem-success.svg",
    fields: [
      { name: "Rarity", value: rarity.label, inline: true },
      { name: "Copies", value: `${formatNumber(entry.quantity || 0)}`, inline: true },
      { name: "Best Print", value: `#${formatNumber(entry.bestPrint || entry.firstPrint || 0)}`, inline: true },
      { name: "Level", value: `${formatNumber(entry.level || 1)}`, inline: true },
      { name: "Essence", value: `${formatNumber(entry.essence || 0)}`, inline: true },
      { name: "Corruption", value: `${formatNumber(entry.corruption || 0)} / 100`, inline: true },
      { name: "Origin", value: RELIC_ORIGIN_LABELS[entry.origin] || entry.origin || "Unknown", inline: true },
      { name: "Faction", value: faction, inline: true },
      { name: "Traits", value: entry.traits?.length ? entry.traits.join(", ") : "No traits awakened yet." },
      { name: "History", value: history },
      { name: "Growth", value: `Evolve: ${formatNumber(RELIC_EVOLVE_COST.aura)} aura + ${RELIC_EVOLVE_COST.essence} essence.\nPurify: ${formatNumber(RELIC_PURIFY_COST.aura)} aura + ${RELIC_PURIFY_COST.essence} essence.` },
    ],
    footer: "Relics are prestige artifacts. Power comes from story, identity, and collection score rather than PvP stat inflation.",
  });
}

async function handleRelic(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const relicInput = interaction.options.getString("relic", true).trim();
  const matchedRelic = findRelicByInput(relicInput);
  const relicId = matchedRelic?.id || relicInput;
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const entry = ensureRelicEntry(user, relicId);
  const relic = matchedRelic || getRelic(relicId);
  if (!relic || entry.quantity <= 0) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Relic Not Owned", description: "You need to own that relic before inspecting or shaping it.", visual: "emblem-alert.svg" }), ephemeral: true });
  }

  if (subcommand === "inspect") {
    await user.save();
    return interaction.reply(buildRelicInspectPayload(user, entry));
  }

  if (subcommand === "evolve") {
    if ((entry.essence || 0) < RELIC_EVOLVE_COST.essence || user.aura < RELIC_EVOLVE_COST.aura) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Evolution Blocked", description: `Needs ${formatNumber(RELIC_EVOLVE_COST.aura)} aura and ${RELIC_EVOLVE_COST.essence} relic essence. Duplicate claims feed essence.`, visual: "emblem-alert.svg" }), ephemeral: true });
    }
    user.aura -= RELIC_EVOLVE_COST.aura;
    entry.essence -= RELIC_EVOLVE_COST.essence;
    entry.level = Math.min(10, (entry.level || 1) + 1);
    const trait = getRelicTrait(relic, entry.bestPrint || entry.firstPrint || entry.level, entry.level + entry.traits.length);
    if (!entry.traits.includes(trait)) {
      entry.traits.push(trait);
      entry.traits = entry.traits.slice(0, 6);
    }
    if (entry.corruption > 0 && Math.random() < 0.35) {
      entry.corruption = clamp(entry.corruption + randInt(2, 8), 0, 100);
    }
    addRelicHistory(entry, "evolve", interaction.user.id, interaction.guildId, `Awakened to level ${entry.level}`);
    user.markModified("relics");
    await user.save();
    eventBus.publish("relic.evolved", { guildId: interaction.guildId, userId: interaction.user.id, metadata: { relicId, level: entry.level } });
    return interaction.reply(buildEmbedPayload({
      title: "Relic Evolved",
      description: `**${relic.name}** awakened to level **${formatNumber(entry.level)}**.`,
      visual: "emblem-success.svg",
      fields: [
        { name: "Trait", value: trait, inline: true },
        { name: "Corruption", value: `${formatNumber(entry.corruption || 0)} / 100`, inline: true },
      ],
    }));
  }

  if (subcommand === "purify") {
    if ((entry.corruption || 0) <= 0) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Already Pure", description: "This relic has no corruption to purify.", visual: "emblem-help.svg" }), ephemeral: true });
    }
    if ((entry.essence || 0) < RELIC_PURIFY_COST.essence || user.aura < RELIC_PURIFY_COST.aura) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Purification Blocked", description: `Needs ${formatNumber(RELIC_PURIFY_COST.aura)} aura and ${RELIC_PURIFY_COST.essence} relic essence.`, visual: "emblem-alert.svg" }), ephemeral: true });
    }
    user.aura -= RELIC_PURIFY_COST.aura;
    entry.essence -= RELIC_PURIFY_COST.essence;
    const removed = Math.min(entry.corruption, randInt(12, 28));
    entry.corruption = Math.max(0, entry.corruption - removed);
    addRelicHistory(entry, "purify", interaction.user.id, interaction.guildId, `Removed ${removed} corruption`);
    user.markModified("relics");
    await user.save();
    eventBus.publish("relic.purified", { guildId: interaction.guildId, userId: interaction.user.id, metadata: { relicId, removed } });
    return interaction.reply(buildEmbedPayload({
      title: "Relic Purified",
      description: `**${relic.name}** shed **${formatNumber(removed)} corruption**.`,
      visual: "emblem-success.svg",
      fields: [
        { name: "Remaining Corruption", value: `${formatNumber(entry.corruption)} / 100`, inline: true },
      ],
    }));
  }

  const factionId = interaction.options.getString("faction", true);
  const faction = getWorldFaction(factionId);
  entry.factionId = faction.id;
  if (!entry.traits.includes(`${faction.id}-bound`)) {
    entry.traits.unshift(`${faction.id}-bound`);
    entry.traits = entry.traits.slice(0, 6);
  }
  addRelicHistory(entry, "bind", interaction.user.id, interaction.guildId, `Bound to ${faction.name}`);
  user.markModified("relics");
  await user.save();
  return interaction.reply(buildEmbedPayload({
    title: "Relic Bound",
    description: `**${relic.name}** now carries the mark of **${faction.name}**.`,
    visual: "emblem-success.svg",
    fields: [
      { name: "Faction Principle", value: faction.principle },
    ],
  }));
}

async function handleClaim(interaction) {
  const guess = interaction.options.getString("guess", true);
  const settings = await getOrCreateGuildSettings(interaction.guildId);
  const spawnState = normalizeRelicSpawnState(settings);
  const current = spawnState.current;
  if (!current?.relicId) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Nothing To Claim", description: "No relic is currently spawned in this channel.", visual: "emblem-help.svg" }), ephemeral: true });
  }
  if (await clearExpiredRelicSpawn(settings, spawnState)) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Relic Faded", description: "That relic spawn expired before it was claimed. Wait for the next chat spawn or use `/summon`.", visual: "emblem-help.svg" }), ephemeral: true });
  }
  if (!isCorrectRelicGuess(guess, current.relicName)) {
    const hintUses = Number(current.hintUses) || 0;
    return interaction.reply({ ...buildEmbedPayload({
      title: "Wrong Guess",
      description: [
        "That was not the relic.",
        `Current hint: \`${formatRelicHint(current.relicName, hintUses)}\``,
        "Try the full name, or the first two main words.",
      ].join("\n"),
      visual: "emblem-alert.svg",
    }), ephemeral: true });
  }

  const claimLock = await GuildSettings.findOneAndUpdate(
    {
      guildId: interaction.guildId,
      "relicSpawn.current.relicId": current.relicId,
      "relicSpawn.current.spawnedAt": current.spawnedAt,
    },
    { $set: { "relicSpawn.current": null } },
    { new: false }
  );
  if (!claimLock?.relicSpawn?.current) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Already Claimed", description: "Someone else claimed that relic first.", visual: "emblem-alert.svg" }), ephemeral: true });
  }

  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  if (!user.relicHuntStreaks?.get) {
    user.relicHuntStreaks = new Map(Object.entries(user.relicHuntStreaks || {}));
  }
  const previousStreak = Number(user.relicHuntStreaks.get(current.relicId) || 0);
  const specialChance = getSpecialRelicChance(previousStreak);
  const shiny = Math.random() < specialChance;
  const printNumber = await nextRelicPrint(current.relicId);
  const relic = getRelic(current.relicId);
  const rarity = getRelicRarity(relic);
  const world = normalizeWorldState(settings);
  const dominantFaction = getDominantWorldFaction(world);
  const { entry, isNew } = addRelicToUser(user, relic, printNumber, shiny, {
    source: current.source || current.spawnedBy || "chat",
    factionId: relic.factionId || dominantFaction?.id || null,
    userId: interaction.user.id,
    guildId: interaction.guildId,
  });
  user.relicHuntStreaks = new Map([[current.relicId, previousStreak + 1]]);
  user.stats.summons = (user.stats.summons || 0) + 1;
  user.xp += 120 + rarity.value * 35 + (shiny ? 500 : 0);
  user.markModified("relicHuntStreaks");
  if (["epic", "legendary", "mythic"].includes(relic.rarity) || relic.eventExclusive) {
    const influenceTarget = world.factions.find((faction) => faction.id === (relic.factionId || dominantFaction?.id));
    if (influenceTarget) {
      influenceTarget.influence = clamp((Number(influenceTarget.influence) || 0) + (relic.rarity === "mythic" ? 5 : relic.rarity === "legendary" ? 3 : 1), 0, 100);
    }
    world.tension = clamp((Number(world.tension) || 0) + (entry.corruption ? 4 : 2), 0, 100);
    world.storyLog.unshift({
      title: `${rarity.label} Relic Claimed`,
      text: `<@${interaction.user.id}> claimed **${relic.name}** print #${printNumber}${entry.corruption ? ` with ${formatNumber(entry.corruption)} corruption` : ""}.`,
      actorId: interaction.user.id,
      createdAt: new Date(),
    });
    world.storyLog = world.storyLog.slice(0, WORLD_STORY_LIMIT);
    settings.markModified("worldState");
  }
  await syncRank(user);

  await Promise.all([user.save(), settings.save()]);
  eventBus.publish("relic.claimed", { guildId: interaction.guildId, userId: interaction.user.id, metadata: { relicId: relic.id, rarity: relic.rarity, printNumber, source: current.source || current.spawnedBy || "chat", eventExclusive: Boolean(relic.eventExclusive) } });

  return interaction.reply(addQuickActions(buildEmbedPayload({
    title: relic.eventExclusive || ["legendary", "mythic"].includes(relic.rarity) ? "Relic Claimed - Server Myth" : "Relic Claimed",
    description: `${interaction.user.username} correctly claimed **${getRelicLabel(current.relicId)}**.${shiny ? "\nA special variant sparked on capture." : ""}${entry.corruption ? `\nThe relic carries **${formatNumber(entry.corruption)} corruption**.` : ""}`,
    visual: "emblem-success.svg",
    fields: [
      { name: "Rarity", value: `${rarity.label}${shiny ? " Special" : ""}`, inline: true },
      { name: "Print", value: `#${formatNumber(printNumber)}`, inline: true },
      { name: "Streak", value: `${formatNumber(previousStreak + 1)} on this relic`, inline: true },
      { name: "Owned", value: `x${formatNumber(entry.quantity)}${isNew ? " | new" : ""}`, inline: true },
      { name: "Traits", value: entry.traits.length ? entry.traits.join(", ") : "None", inline: false },
    ],
    footer: "Relics now keep history, evolve, corrupt, and push world stories.",
  }), interaction.user.id, ["collection", "relic", "burn", "rank"]));
}

async function handleHint(interaction) {
  const settings = await getOrCreateGuildSettings(interaction.guildId);
  const spawnState = normalizeRelicSpawnState(settings);
  const current = spawnState.current;
  if (!current?.relicName) {
    return interaction.reply({ ...buildEmbedPayload({ title: "No Hint Available", description: "No relic is currently spawned.", visual: "emblem-help.svg" }), ephemeral: true });
  }
  if (await clearExpiredRelicSpawn(settings, spawnState)) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Relic Faded", description: "That relic spawn expired before anyone claimed it.", visual: "emblem-help.svg" }), ephemeral: true });
  }
  current.hintUses = (Number(current.hintUses) || 0) + 1;
  settings.markModified("relicSpawn");
  await settings.save();
  return interaction.reply(buildEmbedPayload({
    title: "Relic Hint",
    description: [
      `Name pattern: \`${formatRelicHint(current.relicName, current.hintUses)}\``,
      "You can claim generated relics with the first two main words.",
    ].join("\n"),
    visual: "help-summary.svg",
    footer: `Use /claim guess:<name> when you know it. Fades in ${humanizeMs(getRelicSpawnRemainingMs(current))}.`,
  }));
}

async function handleIncense(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const settings = await getOrCreateGuildSettings(interaction.guildId);
  const spawnState = normalizeRelicSpawnState(settings);

  if (subcommand === "status") {
    await settings.save();
    return interaction.reply(buildEmbedPayload({
      title: "Relic Incense",
      description: spawnState.incenseRemaining > 0
        ? `This channel has **${formatNumber(spawnState.incenseRemaining)}** incense spawns remaining.`
        : "No incense is active in this channel.",
      visual: "emblem-economy.svg",
      fields: [
        { name: "Buy Cost", value: `${formatNumber(INCENSE_COST)} aura`, inline: true },
        { name: "Spawns", value: `${formatNumber(INCENSE_SPAWNS)}`, inline: true },
        { name: "Pace", value: `1 spawn every ${humanizeMs(INCENSE_TICK_MS)}`, inline: true },
      ],
    }));
  }

  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  if (user.aura < INCENSE_COST) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Not Enough Aura", description: `Relic incense costs ${formatNumber(INCENSE_COST)} aura.`, visual: "emblem-economy.svg" }), ephemeral: true });
  }
  user.aura -= INCENSE_COST;
  spawnState.incenseRemaining += INCENSE_SPAWNS;
  settings.markModified("relicSpawn");
  await user.save();
  await settings.save();

  return interaction.reply(buildEmbedPayload({
    title: "Relic Incense Lit",
    description: `${interaction.user.username} bought channel incense. Relic spawns will continue even if the bot restarts; the counter pauses while offline.`,
    visual: "emblem-success.svg",
    fields: [
      { name: "Added", value: `${formatNumber(INCENSE_SPAWNS)} spawns`, inline: true },
      { name: "Remaining", value: `${formatNumber(spawnState.incenseRemaining)}`, inline: true },
      { name: "Cost", value: `${formatNumber(INCENSE_COST)} aura`, inline: true },
    ],
  }));
}

async function handleCollection(interaction) {
  const target = interaction.options?.getUser?.("user") || interaction.user;
  const user = await getOrCreatePlayer(interaction.guildId, target.id);
  user.relics ||= [];
  const perkTotal = SHOP_ITEMS.filter((item) => item.type === "perk").length;
  const skillUnlockTotal = SHOP_ITEMS.filter((item) => item.type === "skill_unlock").length;
  const relicStats = getRelicCollectionStats(user);
  const materialCount = user.inventory.filter((entry) => MATERIALS[entry.id] && entry.quantity > 0).length;
  const perkCount = user.ownedPerks.length;
  const skillCount = user.skills.length;
  const unlockSkillCount = user.skills.filter((skillId) => skillId !== "focus").length;
  const crateTypes = Array.from(user.crates.entries()).filter(([, count]) => count > 0).length;
  const bossTrophies = [
    user.stats.bossWins >= 1 ? "First Boss Clear" : null,
    user.stats.bossWins >= 5 ? "Boss Hunter" : null,
    user.stats.pvpWins >= 5 ? "Duelist Mark" : null,
    user.prestige >= 1 ? "Prestige Sigil" : null,
  ].filter(Boolean);
  const featuredRelics = user.relics
    .filter((entry) => entry.quantity > 0)
    .sort((left, right) => getRelicScore(right) - getRelicScore(left))
    .slice(0, 5)
    .map(formatRelicLine);
  const totalSlots = Object.keys(MATERIALS).length + perkTotal + skillUnlockTotal + Object.keys(CRATES).length + 4 + AURIX_RELICS.length;
  const ownedSlots = materialCount + Math.min(perkCount, perkTotal) + Math.min(unlockSkillCount, skillUnlockTotal) + crateTypes + bossTrophies.length + relicStats.ownedCount;
  return interaction.reply(buildEmbedPayload({
    title: `${target.username}'s Collection`,
    description: withFlavor(
      pickFlavor([
        "The collection cabinet lights up row by row.",
        "A profile archivist counts the rare pieces first.",
        "Your trophies, crates, and materials settle into view.",
      ]),
      `${progressBar(ownedSlots, totalSlots)}\n${formatNumber(ownedSlots)} / ${formatNumber(totalSlots)} collection marks found.`
    ),
    visual: "core-profile.svg",
    fields: [
      { name: "Materials", value: `${materialCount} / ${Object.keys(MATERIALS).length}`, inline: true },
      { name: "Perks", value: `${Math.min(perkCount, perkTotal)} / ${perkTotal}`, inline: true },
      { name: "Skill Unlocks", value: `${Math.min(unlockSkillCount, skillUnlockTotal)} / ${skillUnlockTotal}`, inline: true },
      { name: "Crate Types", value: `${crateTypes} / ${Object.keys(CRATES).length}`, inline: true },
      { name: "Known Skills", value: `${skillCount}`, inline: true },
      { name: "Aurix Relics", value: `${relicStats.ownedCount} / ${relicStats.totalCount} | score ${formatNumber(relicStats.score)} | shiny ${formatNumber(relicStats.shinyCount)}`, inline: true },
      { name: "Featured Relics", value: featuredRelics.join("\n") || "No relics yet. Use `/summon` to open the gate." },
      { name: "Trophies", value: bossTrophies.join("\n") || "No trophies yet." },
    ],
    footer: "Collection marks are earned from relics, materials, perks, crates, prestige, PvP, and bosses.",
  }));
}

function getSeasonId(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function handleSeason(interaction) {
  const clans = await Clan.find(buildClanLeaderboardFilter(interaction.guildId)).sort({ trophies: -1, wins: -1 }).limit(10);
  const lines = clans.length
    ? clans.map((clan, index) => `${index + 1}. **${clan.name}** - ${formatNumber(clan.trophies)} trophies, ${formatNumber(clan.wins)} war wins`).join("\n")
    : "No clans are competing yet.";
  return interaction.reply(buildEmbedPayload({
    title: `Clan Season ${getSeasonId()}`,
    description: lines,
    visual: "clan-top.svg",
    fields: [
      { name: "How To Score", value: "Win clan raids and wars to gain trophies. Higher arsenal and hall upgrades improve your odds." },
      { name: "Season Hook", value: "Use this leaderboard for monthly rewards, shoutouts, and server events." },
    ],
    footer: "Season standings are based on current clan trophies.",
  }));
}

function getServerQuestTemplate() {
  const templates = [
    { id: "spins", label: "Server Spin Drive", metric: "stats.spins", goal: 100, description: "Use /spin as a community." },
    { id: "mines", label: "Server Mining Push", metric: "stats.mines", goal: 80, description: "Run /mine and stock the server economy with materials." },
    { id: "bosses", label: "Boss Hunt", metric: "stats.bossWins", goal: 25, description: "Defeat bosses across the server." },
    { id: "vault", label: "Vault Builders", metric: "stats.vaultDeposit", goal: 250000, description: "Deposit aura into personal vaults." },
  ];
  const dayIndex = Math.floor(Date.now() / (24 * 60 * 60 * 1000)) % templates.length;
  return templates[dayIndex];
}

async function handleServerQuest(interaction) {
  const quest = getServerQuestTemplate();
  const users = await User.find(buildPlayerLeaderboardFilter(interaction.guildId)).select(quest.metric).lean();
  const totalProgress = users.reduce((sum, user) => {
    const value = quest.metric.split(".").reduce((acc, key) => acc?.[key], user);
    return sum + (Number(value) || 0);
  }, 0);
  const completedCycles = Math.floor(totalProgress / quest.goal);
  const currentTier = Math.floor(Math.max(0, totalProgress - 1) / quest.goal) + 1;
  const displayProgress = totalProgress === 0 ? 0 : ((totalProgress - 1) % quest.goal) + 1;
  return interaction.reply(buildEmbedPayload({
    title: quest.label,
    description: `${quest.description}\n${progressBar(displayProgress, quest.goal)}\n${formatNumber(displayProgress)} / ${formatNumber(quest.goal)} toward community tier ${formatNumber(currentTier)}`,
    visual: "help-summary.svg",
    fields: [
      { name: "Participants", value: `${formatNumber(users.length)} player profiles counted`, inline: true },
      { name: "Completed Tiers", value: `${formatNumber(completedCycles)}`, inline: true },
      { name: "Total Server Progress", value: `${formatNumber(totalProgress)}`, inline: true },
    ],
    footer: "The focus rotates daily. Server progress loops into repeatable community tiers.",
  }));
}

async function handleProject(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const settings = await getOrCreateGuildSettings(interaction.guildId);
  const project = normalizeServerProject(settings);

  if (subcommand === "status") {
    await settings.save();
    return interaction.reply(buildServerProjectPayload(project));
  }

  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);

  if (subcommand === "contribute-aura") {
    const amount = interaction.options.getInteger("amount", true);
    if (amount <= 0 || amount > user.aura) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Project Donation Failed", description: "Donate an amount inside your current aura wallet.", visual: "emblem-alert.svg" }), ephemeral: true });
    }
    user.aura -= amount;
    project.aura += amount;
    const contributor = getServerProjectContributor(project, interaction.user.id);
    contributor.aura += amount;
    user.stats.projectContributions = (user.stats.projectContributions || 0) + 1;
    await applyQuestProgress(user, "projectContributions", 1);
    await user.save();
  } else if (subcommand === "contribute-material") {
    const materialId = interaction.options.getString("material", true);
    const amount = interaction.options.getInteger("amount", true);
    if (!MATERIALS[materialId]) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Project Donation Failed", description: "That material does not exist.", visual: "emblem-alert.svg" }), ephemeral: true });
    }
    const entry = user.inventory.find((item) => item.id === materialId);
    if (!entry || amount <= 0 || entry.quantity < amount) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Project Donation Failed", description: `You do not have ${formatNumber(amount)} ${getInventoryLabel(materialId)}.`, visual: "emblem-alert.svg" }), ephemeral: true });
    }
    entry.quantity -= amount;
    project.materials.set(materialId, (project.materials.get(materialId) || 0) + amount);
    const contributor = getServerProjectContributor(project, interaction.user.id);
    contributor.materials += amount;
    user.markModified("inventory");
    user.stats.projectContributions = (user.stats.projectContributions || 0) + 1;
    await applyQuestProgress(user, "projectContributions", 1);
    await user.save();
  }

  settings.markModified("serverProject");
  if (isServerProjectComplete(project)) {
    const completion = await completeServerProject(settings, project);
    return interaction.reply(buildEmbedPayload({
      title: `${completion.template.name} Complete`,
      description: `The server finished the project. Rewards were paid to **${formatNumber(completion.contributors)}** contributor(s), community identity grew, and a new project has started.`,
      visual: "emblem-success.svg",
      fields: [
        { name: "Next Project", value: settings.serverProject?.name || "Ready", inline: true },
        { name: "Community Level", value: `${formatNumber(settings.community?.level || 1)}`, inline: true },
        { name: "Why It Matters", value: "Projects remove aura and materials from the economy while creating shared goals." },
      ],
    }));
  }

  await settings.save();
  return interaction.reply(buildServerProjectPayload(project));
}

async function handleCommunity(interaction) {
  const settings = await getOrCreateGuildSettings(interaction.guildId);
  normalizeCommunityIdentity(settings);
  normalizeServerProject(settings);
  await settings.save();
  return interaction.reply(buildCommunityPayload(settings, interaction.guild?.name || "This server"));
}

async function handleWorld(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const settings = await getOrCreateGuildSettings(interaction.guildId);
  normalizeWorldState(settings);

  if (subcommand === "status") {
    const payload = buildWorldPayload(settings, interaction.guild?.name || "This server");
    await settings.save();
    return interaction.reply(payload);
  }

  if (subcommand === "encounter") {
    const encounter = getActiveWorldEncounter(settings);
    await settings.save();
    return interaction.reply(withExtraComponents(buildEmbedPayload({
      title: encounter.title,
      description: encounter.description,
      visual: "help-summary.svg",
      fields: encounter.choices.map((choice) => ({
        name: choice.label,
        value: `${choice.text}\nFaction: ${getWorldFaction(choice.factionId).name}`,
        inline: true,
      })),
      footer: "One choice becomes part of this server's story.",
    }), buildWorldDecisionRows(encounter, interaction.guildId)));
  }

  if (subcommand === "artifact") {
    const payload = buildWorldArtifactPayload(settings, interaction.guild?.name || "This server");
    await settings.save();
    return interaction.reply(payload);
  }

  if (subcommand === "recap") {
    const payload = buildWorldRecapPayload(settings, interaction.guild?.name || "This server");
    await settings.save();
    return interaction.reply(payload);
  }

  if (subcommand === "decide") {
    const choiceId = interaction.options.getString("choice", true);
    return resolveWorldEncounter(interaction, choiceId);
  }

  return interaction.reply({ ...buildEmbedPayload({ title: "World Command", description: "Use status, encounter, artifact, recap, or decide.", visual: "emblem-help.svg" }), ephemeral: true });
}

async function handleAsk(interaction) {
  const text = interaction.options.getString("text", true);
  const intent = classifyIntent(text);
  return interaction.reply(buildEmbedPayload({
    title: "Aurix Assistant",
    description: intent?.response || "I could not understand that yet. Try /help for the command map.",
    visual: "help-summary.svg",
    fields: [
      { name: "Detected Intent", value: intent?.intent || "unknown", inline: true },
      { name: "Confidence", value: `${Math.round((intent?.confidence || 0) * 100)}%`, inline: true },
      { name: "Suggested Command", value: intent?.command || "/help", inline: true },
    ],
    footer: "This is a local intent router. It can later be backed by an LLM without changing command handlers.",
  }));
}

async function handleYearbook(interaction) {
  const settings = await getOrCreateGuildSettings(interaction.guildId);
  const payload = await buildYearbookPayload(settings, interaction.guild?.name || "This server");
  await settings.save();
  eventBus.publish("yearbook.generated", { guildId: interaction.guildId, userId: interaction.user.id, metadata: { monthId: settings.yearbook?.monthId || getMonthId() } });
  return interaction.reply(payload);
}

async function handleChallenge(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const settings = await getOrCreateGuildSettings(interaction.guildId);
  const challenge = normalizeCreatorChallenge(settings);

  if (subcommand === "status") {
    await settings.save();
    return interaction.reply(buildCreatorChallengePayload(settings));
  }

  if (subcommand === "create") {
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member?.permissions?.has(PermissionsBitField.Flags.ManageGuild)) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Challenge Locked", description: "Server managers can create creator challenges.", visual: "emblem-alert.svg" }), ephemeral: true });
    }
    const prompt = interaction.options.getString("prompt", true).slice(0, 300);
    const theme = (interaction.options.getString("theme") || "Community Challenge").slice(0, 80);
    const days = clamp(interaction.options.getInteger("days") || 7, 1, 30);
    settings.creatorChallenge = {
      prompt,
      theme,
      createdBy: interaction.user.id,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      entries: [],
    };
    settings.markModified("creatorChallenge");
    await settings.save();
    return interaction.reply(buildCreatorChallengePayload(settings));
  }

  const text = interaction.options.getString("text", true).slice(0, 240);
  if (!challenge.prompt) {
    return interaction.reply({ ...buildEmbedPayload({ title: "No Active Challenge", description: "There is no creator challenge active right now.", visual: "emblem-help.svg" }), ephemeral: true });
  }
  challenge.entries = challenge.entries.filter((entry) => entry.userId !== interaction.user.id);
  challenge.entries.push({ userId: interaction.user.id, text, createdAt: new Date() });
  challenge.entries = challenge.entries.slice(-40);
  settings.markModified("creatorChallenge");
  await settings.save();
  eventBus.publish("challenge.entry_submitted", { guildId: interaction.guildId, userId: interaction.user.id, metadata: { theme: challenge.theme || null } });
  return interaction.reply(buildEmbedPayload({
    title: "Challenge Entry Submitted",
    description: `${interaction.user.username} added an entry to **${challenge.theme || "the creator challenge"}**.`,
    visual: "emblem-success.svg",
    fields: [
      { name: "Entry", value: text },
      { name: "Why It Spreads", value: "Challenge entries give creators, artists, memers, and quiet contributors a reason to be seen." },
    ],
  }));
}

async function handleMemoryQuest(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const settings = await getOrCreateGuildSettings(interaction.guildId);
  const quest = normalizeMemoryQuest(settings);

  if (subcommand === "status") {
    await settings.save();
    return interaction.reply(buildMemoryQuestPayload(settings));
  }

  const memory = interaction.options.getString("memory", true).slice(0, 220);
  quest.progress += 1;
  let contributor = quest.contributors.find((entry) => entry.userId === interaction.user.id);
  if (!contributor) {
    quest.contributors.push({ userId: interaction.user.id, amount: 0 });
    contributor = quest.contributors[quest.contributors.length - 1];
  }
  contributor.amount += 1;
  const world = normalizeWorldState(settings);
  world.storyLog.unshift({
    title: quest.title,
    text: `<@${interaction.user.id}> remembered: ${memory}`,
    actorId: interaction.user.id,
    createdAt: new Date(),
  });
  world.storyLog = world.storyLog.slice(0, WORLD_STORY_LIMIT);

  let completed = false;
  if (quest.progress >= quest.goal) {
    completed = true;
    quest.completedAt = new Date();
    const community = normalizeCommunityIdentity(settings);
    community.xp += 700;
    community.level = getCommunityLevelByXp(community.xp);
    settings.markModified("community");
  }
  settings.markModified("memoryQuest");
  settings.markModified("worldState");
  await settings.save();
  eventBus.publish("memoryquest.contributed", { guildId: interaction.guildId, userId: interaction.user.id, metadata: { completed } });
  return interaction.reply(buildEmbedPayload({
    title: completed ? "Memory Quest Complete" : "Memory Added",
    description: completed ? `The server completed **${quest.title}**. A new memory quest will appear next time.` : `Your memory was added to **${quest.title}**.`,
    visual: "emblem-success.svg",
    fields: [
      { name: "Memory", value: memory },
      { name: "Progress", value: `${formatNumber(Math.min(quest.progress, quest.goal))} / ${formatNumber(quest.goal)}`, inline: true },
    ],
  }));
}

async function handleSocial(interaction) {
  const target = interaction.options?.getUser?.("user") || interaction.user;
  const user = await getOrCreatePlayer(interaction.guildId, target.id);
  const reputation = user.reputation?.get ? Array.from(user.reputation.entries()) : Object.entries(user.reputation || {});
  const reputationLines = reputation.length
    ? reputation.map(([factionId, amount]) => `${APPRECIATION_TAGS[factionId]?.label || getWorldFaction(factionId).name}: ${formatNumber(amount)}`).join("\n")
    : "No social reputation yet.";
  const socialScore = (user.stats.giftsSent || 0) * 3 + (user.stats.projectContributions || 0) * 4 + reputation.reduce((sum, [, amount]) => sum + Number(amount || 0) * 5, 0);
  return interaction.reply(buildEmbedPayload({
    title: `${target.username}'s Social Identity`,
    description: "A profile for how this member shapes the community, not just how much they grind.",
    visual: "core-profile.svg",
    fields: [
      { name: "Social Score", value: `${formatNumber(socialScore)}`, inline: true },
      { name: "Gifts Sent", value: `${formatNumber(user.stats.giftsSent || 0)}`, inline: true },
      { name: "Project Help", value: `${formatNumber(user.stats.projectContributions || 0)}`, inline: true },
      { name: "Appreciations", value: `${formatNumber(user.stats.appreciationsReceived || 0)} received | ${formatNumber(user.stats.appreciationsGiven || 0)} given`, inline: true },
      { name: "Campfire Shares", value: `${formatNumber(user.stats.campfireShares || 0)}`, inline: true },
      { name: "Reputation", value: reputationLines },
    ],
  }));
}

async function handleGallery(interaction) {
  const settings = await getOrCreateGuildSettings(interaction.guildId);
  normalizeWorldState(settings);
  normalizeServerProject(settings);
  const artifactPayload = buildWorldArtifactPayload(settings, interaction.guild?.name || "This server");
  artifactPayload.embeds[0].addFields(
    { name: "Active Project", value: settings.serverProject?.name || "None", inline: true },
    { name: "Community Level", value: `${formatNumber(settings.community?.level || 1)}`, inline: true },
    { name: "Gallery Use", value: "Use this as the server's identity card: artifact, project, faction state, and community level in one place." }
  );
  await settings.save();
  return interaction.reply(artifactPayload);
}

async function handleWeather(interaction) {
  const settings = await getOrCreateGuildSettings(interaction.guildId);
  normalizeWorldState(settings);
  normalizeMemoryQuest(settings);
  normalizeServerProject(settings);
  await settings.save();
  return interaction.reply(buildServerWeatherPayload(settings, interaction.guild?.name || "This server"));
}

async function handleLetter(interaction) {
  const settings = await getOrCreateGuildSettings(interaction.guildId);
  normalizeWorldState(settings);
  await settings.save();
  return interaction.reply(buildNpcLetterPayload(settings, interaction.guild?.name || "this server"));
}

async function handlePartyQuest(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const settings = await getOrCreateGuildSettings(interaction.guildId);
  const quest = normalizePartyQuest(settings);

  if (subcommand === "status") {
    await settings.save();
    return interaction.reply(buildPartyQuestPayload(settings));
  }

  const roleId = interaction.options.getString("role", true);
  const slot = quest.roles.find((entry) => entry.role === roleId);
  if (!slot) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Role Missing", description: "That expedition role does not exist.", visual: "emblem-alert.svg" }), ephemeral: true });
  }
  if (quest.roles.some((entry) => entry.userId === interaction.user.id)) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Already Joined", description: "You already hold a role in this co-op expedition.", visual: "emblem-help.svg" }), ephemeral: true });
  }
  if (slot.userId) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Role Taken", description: "That role is already filled. Pick another open role.", visual: "emblem-help.svg" }), ephemeral: true });
  }
  slot.userId = interaction.user.id;
  quest.progress = quest.roles.filter((entry) => entry.userId).length;
  settings.markModified("partyQuest");
  let completed = false;
  if (quest.progress >= quest.goal) {
    completed = true;
    await completePartyQuest(settings);
  } else {
    await settings.save();
  }
  eventBus.publish("partyquest.joined", { guildId: interaction.guildId, userId: interaction.user.id, metadata: { roleId, completed } });
  return interaction.reply(completed
    ? buildEmbedPayload({ title: "Co-op Expedition Complete", description: `The party completed **${quest.title}** and strengthened the server artifact.`, visual: "emblem-success.svg" })
    : buildPartyQuestPayload(settings));
}

async function handleShrine(interaction) {
  const settings = await getOrCreateGuildSettings(interaction.guildId);
  const world = normalizeWorldState(settings);
  const artifact = normalizeWorldArtifact(settings, world);
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const cost = 3;
  const dust = user.inventory.find((entry) => entry.id === "vault_dust");
  if (!dust || dust.quantity < cost) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Shrine Needs Dust", description: `Restoring the shrine needs ${cost} Vault Dust. Use /mine or trade with the server.`, visual: "emblem-alert.svg" }), ephemeral: true });
  }
  dust.quantity -= cost;
  artifact.power += 1;
  artifact.traits = [`Shrine restored by ${interaction.user.username}`, ...artifact.traits].slice(0, 6);
  artifact.lastChangedAt = new Date();
  world.storyLog.unshift({
    title: "Artifact Shrine Restored",
    text: `<@${interaction.user.id}> spent Vault Dust to restore **${artifact.name}**.`,
    actorId: interaction.user.id,
    createdAt: new Date(),
  });
  world.storyLog = world.storyLog.slice(0, WORLD_STORY_LIMIT);
  user.markModified("inventory");
  settings.markModified("worldState");
  await user.save();
  await settings.save();
  eventBus.publish("shrine.restored", { guildId: interaction.guildId, userId: interaction.user.id, metadata: { artifactPower: artifact.power } });
  return interaction.reply(buildEmbedPayload({
    title: "Shrine Restored",
    description: `The shrine around **${artifact.name}** glows brighter. This is the bot-native version of a collaborative Activity ritual.`,
    visual: "emblem-success.svg",
    fields: [
      { name: "Artifact Power", value: `${formatNumber(artifact.power)}`, inline: true },
      { name: "Spent", value: `${cost} Vault Dust`, inline: true },
    ],
  }));
}

async function handleAppreciate(interaction) {
  const target = interaction.options.getUser("user", true);
  const tag = interaction.options.getString("tag") || "kindness";
  const note = (interaction.options.getString("note") || "").trim().slice(0, 180);
  if (target.bot || target.id === interaction.user.id) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Appreciation Needs Someone Else", description: "Use this to notice another person, not yourself or a bot.", visual: "emblem-help.svg" }), ephemeral: true });
  }
  const sender = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const cooldown = await reserveUserCooldown(sender, "lastAppreciateAt", APPRECIATE_COOLDOWN_MS);
  if (!cooldown.ok) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Appreciation Resting", description: `You can appreciate someone again in ${humanizeMs(cooldown.remaining)}. This stays slow on purpose so it feels real.`, visual: "emblem-help.svg" }), ephemeral: true });
  }

  const receiver = await getOrCreatePlayer(interaction.guildId, target.id);
  const settings = await getOrCreateGuildSettings(interaction.guildId);
  normalizeCommunityIdentity(settings);
  const tagConfig = APPRECIATION_TAGS[tag] || APPRECIATION_TAGS.kindness;
  sender.stats.appreciationsGiven = (sender.stats.appreciationsGiven || 0) + 1;
  receiver.stats.appreciationsReceived = (receiver.stats.appreciationsReceived || 0) + 1;
  if (!receiver.reputation?.get) {
    receiver.reputation = new Map(Object.entries(receiver.reputation || {}));
  }
  receiver.reputation.set(tag, (receiver.reputation.get(tag) || 0) + tagConfig.reputation);
  settings.appreciations.unshift({
    fromUserId: interaction.user.id,
    toUserId: target.id,
    tag,
    note: note || null,
    createdAt: new Date(),
  });
  settings.appreciations = settings.appreciations.slice(0, 25);
  settings.community.xp += 35;
  settings.community.level = getCommunityLevelByXp(settings.community.xp);
  settings.markModified("community");
  settings.markModified("appreciations");
  receiver.markModified("reputation");
  await Promise.all([sender.save(), receiver.save(), settings.save()]);
  eventBus.publish("appreciation.created", { guildId: interaction.guildId, userId: interaction.user.id, metadata: { targetUserId: target.id, tag } });
  return interaction.reply(buildEmbedPayload({
    title: "Appreciation Shared",
    description: `<@${interaction.user.id}> appreciated <@${target.id}> for **${tagConfig.label}**.`,
    visual: "emblem-success.svg",
    fields: [
      { name: "Note", value: note || "No note added." },
      { name: "Design", value: "This gives social reputation and community identity progress, not a cash payout." },
    ],
  }));
}

async function handleCampfire(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const settings = await getOrCreateGuildSettings(interaction.guildId);
  normalizeCommunityIdentity(settings);
  normalizeWorldState(settings);
  if (subcommand === "status") {
    await settings.save();
    return interaction.reply(buildCampfirePayload(settings, interaction.guild?.name || "This server"));
  }

  const text = interaction.options.getString("text", true).trim().slice(0, 240);
  const world = normalizeWorldState(settings);
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  user.stats.campfireShares = (user.stats.campfireShares || 0) + 1;
  settings.community.xp += 45;
  settings.community.level = getCommunityLevelByXp(settings.community.xp);
  world.storyLog.unshift({
    title: "Campfire Share",
    text: `<@${interaction.user.id}> shared: ${text}`,
    actorId: interaction.user.id,
    createdAt: new Date(),
  });
  world.storyLog = world.storyLog.slice(0, WORLD_STORY_LIMIT);
  settings.markModified("community");
  settings.markModified("worldState");
  await Promise.all([user.save(), settings.save()]);
  eventBus.publish("campfire.shared", { guildId: interaction.guildId, userId: interaction.user.id, metadata: { prompt: getCampfirePrompt(settings) } });
  return interaction.reply(buildEmbedPayload({
    title: "Campfire Moment Saved",
    description: text,
    visual: "emblem-success.svg",
    fields: [
      { name: "Prompt", value: getCampfirePrompt(settings) },
      { name: "Where It Goes", value: "This becomes part of the server story log and can appear in recaps/yearbooks." },
    ],
    footer: "No streak required. One good memory is enough.",
  }));
}

async function handleIdentity(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const settings = await getOrCreateGuildSettings(interaction.guildId);
  normalizeCommunityIdentity(settings);
  if (subcommand === "view") {
    await settings.save();
    return interaction.reply(buildIdentityPayload(settings, interaction.guild?.name || "This server"));
  }

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member?.permissions?.has(PermissionsBitField.Flags.ManageGuild)) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Identity Locked", description: "Server managers can update the shared identity.", visual: "emblem-alert.svg" }), ephemeral: true });
  }
  const motto = (interaction.options.getString("motto") || "").trim().slice(0, 140);
  const symbol = (interaction.options.getString("symbol") || "").trim().slice(0, 60);
  const values = (interaction.options.getString("values") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((value) => value.slice(0, 40));
  if (motto) {
    settings.community.motto = motto;
  }
  if (symbol) {
    settings.community.symbol = symbol;
  }
  if (values.length) {
    settings.community.values = values;
  }
  settings.community.xp += 120;
  settings.community.level = getCommunityLevelByXp(settings.community.xp);
  settings.markModified("community");
  await settings.save();
  eventBus.publish("identity.updated", { guildId: interaction.guildId, userId: interaction.user.id, metadata: { values: settings.community.values || [] } });
  return interaction.reply(buildIdentityPayload(settings, interaction.guild?.name || "This server"));
}

async function handleFaction(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const settings = await getOrCreateGuildSettings(interaction.guildId);
  const world = normalizeWorldState(settings);
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  normalizeUserFaction(user);

  if (subcommand === "status") {
    const factionLines = [...world.factions]
      .sort((a, b) => b.influence - a.influence)
      .map((faction) => {
        const base = getWorldFaction(faction.id);
        return `**${base.name}** ${progressBar(faction.influence, 100, 8)} ${formatNumber(faction.influence)}\n${base.principle}`;
      })
      .join("\n\n");
    await settings.save();
    return interaction.reply(buildEmbedPayload({
      title: "Faction Warboard",
      description: "Pick a side, push influence, and make the server's culture visibly tilt.",
      visual: "help-summary.svg",
      fields: [
        { name: "Your Pledge", value: user.faction.id ? getWorldFaction(user.faction.id).name : "Unpledged", inline: true },
        { name: "Server Tension", value: `${formatNumber(world.tension)} / 100`, inline: true },
        { name: "Factions", value: factionLines || "No faction state yet." },
        { name: "Moves", value: "`/faction pledge faction:<side>`\n`/faction strike` spends aura to push your faction." },
      ],
      footer: "Rivalry is server-shaping, not wallet-stealing.",
    }));
  }

  if (subcommand === "pledge") {
    const factionId = interaction.options.getString("faction", true);
    const faction = getWorldFaction(factionId);
    user.faction = { id: faction.id, pledgedAt: new Date() };
    if (!user.reputation?.get) {
      user.reputation = new Map(Object.entries(user.reputation || {}));
    }
    user.reputation.set(faction.id, (user.reputation.get(faction.id) || 0) + 2);
    user.markModified("reputation");
    await user.save();
    return interaction.reply(buildEmbedPayload({
      title: `${faction.name} Pledge Locked`,
      description: `<@${interaction.user.id}> pledged to **${faction.name}**.`,
      visual: "emblem-success.svg",
      fields: [
        { name: "Principle", value: faction.principle },
        { name: "Next Move", value: "`/faction strike` to spend aura and push faction influence." },
      ],
    }));
  }

  if (!user.faction.id) {
    return interaction.reply({ ...buildEmbedPayload({ title: "No Faction Pledge", description: "Use `/faction pledge` before launching a strike.", visual: "emblem-alert.svg" }), ephemeral: true });
  }
  const cost = Math.min(Math.max(2500, Math.floor((user.aura || 0) * 0.04)), 25000);
  if (user.aura < cost) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Strike Underfunded", description: `You need ${formatNumber(cost)} aura to fund this faction move.`, visual: "emblem-alert.svg" }), ephemeral: true });
  }
  const cooldown = await reserveUserCooldown(user, "lastFactionStrikeAt", FACTION_STRIKE_COOLDOWN_MS);
  if (!cooldown.ok) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Strike Crew Rebuilding", description: `Your faction can use you again in ${humanizeMs(cooldown.remaining)}. Strategy beats spam.`, visual: "emblem-alert.svg" }), ephemeral: true });
  }
  const factionState = world.factions.find((entry) => entry.id === user.faction.id);
  const faction = getWorldFaction(user.faction.id);
  user.aura -= cost;
  user.stats.factionStrikes = (user.stats.factionStrikes || 0) + 1;
  if (!user.reputation?.get) {
    user.reputation = new Map(Object.entries(user.reputation || {}));
  }
  user.reputation.set(faction.id, (user.reputation.get(faction.id) || 0) + 3);
  if (factionState) {
    factionState.influence = clamp((Number(factionState.influence) || 0) + 4, 0, 100);
    factionState.reputation = (Number(factionState.reputation) || 0) + 1;
  }
  world.tension = clamp((Number(world.tension) || 0) + 6, 0, 100);
  world.storyLog.unshift({
    title: `${faction.name} Strike`,
    text: `<@${interaction.user.id}> funded a ${faction.name} power move for ${formatNumber(cost)} aura.`,
    actorId: interaction.user.id,
    createdAt: new Date(),
  });
  world.storyLog = world.storyLog.slice(0, WORLD_STORY_LIMIT);
  settings.markModified("worldState");
  user.markModified("reputation");
  await Promise.all([user.save(), settings.save()]);
  eventBus.publish("faction.strike", { guildId: interaction.guildId, userId: interaction.user.id, metadata: { factionId: faction.id, cost } });
  return interaction.reply(buildEmbedPayload({
    title: `${faction.name} Strike Landed`,
    description: `A controlled burst of chaos just moved the server warboard.`,
    visual: "emblem-success.svg",
    fields: [
      { name: "Aura Burned", value: `${formatNumber(cost)}`, inline: true },
      { name: "Influence", value: `${formatNumber(factionState?.influence || 0)} / 100`, inline: true },
      { name: "Server Tension", value: `${formatNumber(world.tension)} / 100`, inline: true },
    ],
  }));
}

async function handleFlex(interaction) {
  const target = interaction.options?.getUser?.("user") || interaction.user;
  const user = await getOrCreatePlayer(interaction.guildId, target.id);
  normalizeUserFaction(user);
  if (target.id === interaction.user.id) {
    const cooldown = await reserveUserCooldown(user, "lastFlexAt", FLEX_COOLDOWN_MS);
    if (!cooldown.ok) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Flex Cooling Down", description: `Let the last flex breathe. You can post another in ${humanizeMs(cooldown.remaining)}.`, visual: "emblem-help.svg" }), ephemeral: true });
    }
    user.stats.flexes = (user.stats.flexes || 0) + 1;
    await user.save();
  }
  const power = getPlayerPowerScore(user);
  const rank = RANKS[user.rankIndex] || RANKS[0];
  const faction = user.faction.id ? getWorldFaction(user.faction.id).name : "Unpledged";
  return interaction.reply(buildEmbedPayload({
    title: `${target.username}'s Flex Card`,
    description: `Power Score: **${formatNumber(power)}**\nFaction: **${faction}**`,
    visual: "core-profile.svg",
    thumbnail: target.displayAvatarURL?.({ extension: "png", size: 128 }) || null,
    fields: [
      { name: "Rank", value: getRankLabel(rank), inline: true },
      { name: "Prestige", value: `${formatNumber(user.prestige || 0)}`, inline: true },
      { name: "Vault", value: `${formatNumber(user.vaultAura || 0)} aura`, inline: true },
      { name: "Rarest Relic", value: getRarestRelicLabel(user) },
      { name: "Combat Reputation", value: `PvP ${formatNumber(user.stats.pvpWins || 0)}-${formatNumber(user.stats.pvpLosses || 0)} | Boss ${formatNumber(user.stats.bossWins || 0)}-${formatNumber(user.stats.bossLosses || 0)}` },
    ],
    footer: "Flex culture is cosmetic status. No payout, no exploit, all signal.",
  }));
}

async function handleBlackMarket(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const settings = await getOrCreateGuildSettings(interaction.guildId);
  const offer = getBlackMarketOffer(settings);
  const heatText = `${formatNumber(offer.heat)} heat`;
  if (subcommand === "status") {
    await settings.save();
    return interaction.reply(buildEmbedPayload({
      title: "Black Market",
      description: `Tonight's contraband: **${offer.name}**`,
      visual: "economy-vault.svg",
      fields: [
        { name: "Cost", value: `${formatNumber(offer.cost)} aura`, inline: true },
        { name: "Heat", value: heatText, inline: true },
        { name: "Faction Signal", value: offer.dominantFaction?.name || "No dominant faction", inline: true },
        { name: "Buy", value: "`/blackmarket buy`" },
      ],
      footer: "Rotating prestige sink. Expensive on purpose, because flex needs scarcity.",
    }));
  }

  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  user.blackMarketPurchases ||= [];
  if (user.blackMarketPurchases.includes(offer.purchaseKey)) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Already Bought", description: "You already hit this black-market drop. Wait for the next rotation.", visual: "emblem-help.svg" }), ephemeral: true });
  }
  if (user.aura < offer.cost) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Not Enough Aura", description: `This deal needs **${formatNumber(offer.cost)} aura**. The market does not do pity discounts.`, visual: "emblem-alert.svg" }), ephemeral: true });
  }
  user.aura -= offer.cost;
  const granted = grantBlackMarketOffer(user, offer);
  user.blackMarketPurchases.push(offer.purchaseKey);
  user.blackMarketPurchases = user.blackMarketPurchases.slice(-40);
  user.stats.blackMarketBuys = (user.stats.blackMarketBuys || 0) + 1;
  normalizeWorldState(settings);
  settings.worldState.tension = clamp((Number(settings.worldState.tension) || 0) + offer.heat, 0, 100);
  settings.worldState.storyLog.unshift({
    title: "Black Market Deal",
    text: `<@${interaction.user.id}> bought **${offer.name}** and raised market heat.`,
    actorId: interaction.user.id,
    createdAt: new Date(),
  });
  settings.worldState.storyLog = settings.worldState.storyLog.slice(0, WORLD_STORY_LIMIT);
  user.markModified("inventory");
  user.markModified("cosmetics");
  settings.markModified("worldState");
  await Promise.all([user.save(), settings.save()]);
  eventBus.publish("blackmarket.bought", { guildId: interaction.guildId, userId: interaction.user.id, metadata: { offerId: offer.id, cost: offer.cost } });
  return interaction.reply(buildEmbedPayload({
    title: "Black Market Deal Closed",
    description: `You burned **${formatNumber(offer.cost)} aura** and walked away with **${offer.name}**.`,
    visual: "emblem-success.svg",
    fields: [
      { name: "Granted", value: granted, inline: true },
      { name: "Market Heat", value: heatText, inline: true },
      { name: "Wallet", value: `${formatNumber(user.aura)} aura`, inline: true },
    ],
  }));
}

async function handleWork(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const cooldown = await reserveUserCooldown(user, "lastWorkAt", COOLDOWNS.workMs);
  if (!cooldown.ok) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Work Cooling Down", description: `Your next shift opens in ${humanizeMs(cooldown.remaining)}.`, visual: "economy-vault.svg" }), ephemeral: true });
  }

  const effects = getCombinedEffects(user);
  const auraReward = applyFaucetDamping(user, Math.floor((randInt(260, 620) * (1 + (effects.spinRewardBoost || 0) * 0.5 + (effects.workAuraBoost || 0))) + user.prestige * 55));
  const xpReward = Math.floor((randInt(70, 140) + user.rankIndex * 10) * (1 + (effects.workXpBoost || 0)));
  user.aura += auraReward;
  user.xp += xpReward;
  user.stats.works += 1;
  await applyQuestProgress(user, "works", 1);
  await syncRank(user);
  await user.save();

  const footer = await buildSocialProofFooter(
    interaction.guildId,
    { "stats.works": { $gte: user.stats.works } },
    (count) => `${formatOtherPlayers(count)} completed this many shifts.`
  );

  return interaction.reply(addQuickActions(buildEmbedPayload({
    title: "Shift Complete",
    description: withFlavor(
      pickFlavor([
        "The ledger clicks shut with another clean entry.",
        "The market lights flicker as your shift wraps up.",
        "A steady route, a steady payout, and a little more momentum.",
        "The work board clears your name for the next cycle.",
      ]),
      `You earned **${formatNumber(auraReward)} aura** plus **${formatNumber(xpReward)} XP**.`
    ),
    visual: "economy-vault.svg",
    fields: [
      { name: "Total Shifts", value: `${formatNumber(user.stats.works)}`, inline: true },
      { name: "Next Shift", value: humanizeMs(getEffectiveCooldownMs(user, COOLDOWNS.workMs)), inline: true },
      { name: "Wallet", value: `${formatNumber(user.aura)} aura`, inline: true },
      { name: "Premium", value: isPremiumActive(user) ? "Work boost applied" : "No premium boost", inline: true },
    ],
    footer,
  }), interaction.user.id, ["work", "mine", "spin", "rank"]));
}

async function handleMine(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const cooldown = await reserveUserCooldown(user, "lastMineAt", COOLDOWNS.mineMs);
  if (!cooldown.ok) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Mine Cooling Down", description: `The mine resets in ${humanizeMs(cooldown.remaining)}.`, visual: "economy-vault.svg" }), ephemeral: true });
  }

  const effects = getCombinedEffects(user);
  const materials = [
    { id: "iron_ore", quantity: randInt(2, 5) + (effects.mineIronBonus || 0) },
    { id: "ember_shard", quantity: randInt(0, 2) },
    { id: "vault_dust", quantity: randInt(0, 2) },
  ];
  const gained = materials.map((entry) => ({ ...entry, quantity: Math.max(0, Math.floor(entry.quantity * (1 + (effects.mineYieldBoost || 0)))) })).filter((entry) => entry.quantity > 0);
  gained.forEach((entry) => addInventoryItem(user, entry.id, entry.quantity));

  const auraReward = applyFaucetDamping(user, randInt(80, 220));
  const xpReward = Math.floor(randInt(60, 130) * (1 + (effects.mineXpBoost || 0)));
  user.aura += auraReward;
  user.xp += xpReward;
  user.stats.mines += 1;
  await applyQuestProgress(user, "mines", 1);
  await syncRank(user);
  await user.save();

  const materialLines = gained.map((entry) => `${getInventoryLabel(entry.id)} x${entry.quantity}`).join("\n");
  const footer = await buildSocialProofFooter(
    interaction.guildId,
    { "stats.mines": { $gte: user.stats.mines } },
    (count) => `${formatOtherPlayers(count)} reached this mining count.`
  );
  return interaction.reply(addQuickActions(buildEmbedPayload({
    title: "Mining Run Complete",
    description: withFlavor(
      pickFlavor([
        "Dust settles over the tunnel mouth as your pack hits the floor.",
        "The scanner chirps twice before the haul is counted.",
        "A quiet vein opens just long enough to make the run worth it.",
        "Your tools cool down with a soft metallic tick.",
      ]),
      "You returned with fresh materials and a little spare aura."
    ),
    visual: "economy-vault.svg",
    fields: [
      { name: "Materials", value: materialLines || "Nothing useful found." },
      { name: "Aura", value: `${formatNumber(auraReward)}`, inline: true },
      { name: "XP", value: `${formatNumber(xpReward)}`, inline: true },
      { name: "Next Mine", value: "12 minutes", inline: true },
      { name: "Premium", value: isPremiumActive(user) ? "Mining boost applied" : "No premium boost", inline: true },
    ],
    footer,
  }), interaction.user.id, ["mine", "inventory", "collection", "quests"]));
}

async function handleRob(interaction) {
  const thief = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const target = interaction.options.getUser("user", true);
  const plan = interaction.options.getString("plan") || "quiet";
  if (target.bot || target.id === interaction.user.id) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Invalid Target", description: "Choose another human player.", visual: "emblem-alert.svg" }), ephemeral: true });
  }

  const victim = await getOrCreatePlayer(interaction.guildId, target.id);
  if (isNewbieProtected(victim) && !hasRevengeMark(thief, target.id)) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Target Under Newbie Protection", description: `${target.username} is still under starter protection. Build a rivalry through PvP, factions, or bounties first.`, visual: "emblem-alert.svg" }), ephemeral: true });
  }
  const outcome = getHeistOutcome(thief, victim, plan);
  if (outcome.stealable <= 0) {
    return interaction.reply({ ...buildEmbedPayload({ title: "No Clean Angle", description: `${target.username}'s exposed wallet is too small or too protected for a meaningful heist.`, visual: "emblem-alert.svg" }), ephemeral: true });
  }
  const cooldown = await reserveUserCooldown(thief, "lastRobAt", COOLDOWNS.robMs);
  if (!cooldown.ok) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Heist Crew Cooling Down", description: `You can run another heist in ${humanizeMs(cooldown.remaining)}. Pick targets, don't spam them.`, visual: "emblem-alert.svg" }), ephemeral: true });
  }

  const settings = await getOrCreateGuildSettings(interaction.guildId);
  const world = normalizeWorldState(settings);
  const success = Math.random() < outcome.successChance;
  let description = "";
  let bountyResult = { payout: 0, count: 0 };

  if (success) {
    const stolen = Math.min(victim.aura, Math.max(1, outcome.stealable));
    const xpReward = randInt(90, 170);
    victim.aura = Math.max(0, victim.aura - stolen);
    victim.protectionUntil = new Date(Date.now() + PROTECTION_WINDOW_MS);
    setRevengeMark(victim, thief.userId);
    thief.aura += stolen;
    thief.xp += xpReward;
    thief.notoriety = Math.max(0, (Number(thief.notoriety) || 0) + outcome.heat);
    thief.stats.robWins += 1;
    if (outcome.revenge) {
      thief.revengeTargetId = null;
      thief.revengeExpiresAt = null;
    }
    await applyQuestProgress(thief, "robWins", 1);
    await syncRank(thief);
    description = `**${getHeistPlanLabel(plan)}** landed. You stole **${formatNumber(stolen)} aura** from ${target.username}'s exposed wallet. They gained protection and a revenge mark.`;
  } else {
    const fine = Math.min(thief.aura, Math.max(180, Math.floor(outcome.stealable * 0.35)));
    const xpLoss = randInt(40, 90);
    thief.aura = Math.max(0, thief.aura - fine);
    thief.xp = Math.max(0, thief.xp - xpLoss);
    victim.aura += Math.floor(fine * 0.35);
    setRevengeMark(thief, victim.userId);
    thief.notoriety = Math.max(0, (Number(thief.notoriety) || 0) + Math.floor(outcome.heat / 2));
    thief.stats.robLosses += 1;
    await syncRank(thief);
    description = `**${getHeistPlanLabel(plan)}** got burned. You paid **${formatNumber(fine)} aura** in heat costs; ${target.username} recovered **${formatNumber(Math.floor(fine * 0.35))} aura** from your failed move.`;
  }

  const factionState = world.factions.find((entry) => entry.id === thief.faction?.id);
  if (factionState) {
    factionState.reputation = (Number(factionState.reputation) || 0) + 1;
    factionState.influence = clamp((Number(factionState.influence) || 0) + (success ? 2 : 1), 0, 100);
  }
  world.tension = clamp((Number(world.tension) || 0) + outcome.heat, 0, 100);
  world.storyLog.unshift({
    title: success ? "Heist Landed" : "Heist Burned",
    text: `<@${interaction.user.id}> ran **${getHeistPlanLabel(plan)}** on <@${target.id}>. ${success ? "The wallet bled." : "The alarm sang."}`,
    actorId: interaction.user.id,
    createdAt: new Date(),
  });
  world.storyLog = world.storyLog.slice(0, WORLD_STORY_LIMIT);
  settings.markModified("worldState");

  if (success && getActiveBountyValue(settings, victim.userId) > 0) {
    bountyResult = markBountiesClaimed(settings, victim.userId, thief.userId);
    thief.aura += bountyResult.payout;
    thief.stats.bountiesClaimed = (thief.stats.bountiesClaimed || 0) + bountyResult.count;
  } else if (!success && getActiveBountyValue(settings, thief.userId) > 0) {
    bountyResult = markBountiesClaimed(settings, thief.userId, victim.userId);
    victim.aura += bountyResult.payout;
    victim.stats.bountiesClaimed = (victim.stats.bountiesClaimed || 0) + bountyResult.count;
  }

  await Promise.all([thief.save(), victim.save(), settings.save()]);
  eventBus.publish("heist.resolved", { guildId: interaction.guildId, userId: interaction.user.id, metadata: { targetUserId: target.id, success, plan, stolen: success ? outcome.stealable : 0 } });

  return interaction.reply(buildEmbedPayload({
    title: success ? "Heist Success" : "Heist Failed",
    description,
    visual: success ? "emblem-success.svg" : "emblem-alert.svg",
    fields: [
      { name: "Plan", value: getHeistPlanLabel(plan), inline: true },
      { name: "Chance", value: `${Math.round(outcome.successChance * 100)}%`, inline: true },
      { name: "Notoriety", value: `${formatNumber(thief.notoriety)}`, inline: true },
      { name: "Next Attempt", value: "20 minutes", inline: true },
      { name: "Wallet", value: `${formatNumber(thief.aura)} aura`, inline: true },
      { name: "Counterplay", value: outcome.protectedTarget ? "Target protection reduced the payout." : outcome.sameFaction ? "Same-faction protection reduced your angle." : "Vaulting aura, faction loyalty, and revenge marks all matter." },
      bountyResult.payout > 0 ? { name: "Bounty Claimed", value: success ? `You claimed ${formatNumber(bountyResult.payout)} aura from active contracts on ${target.username}.` : `${target.username} claimed ${formatNumber(bountyResult.payout)} aura from contracts on you.` } : null,
    ].filter(Boolean),
  }));
}

async function handleBounty(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const settings = await getOrCreateGuildSettings(interaction.guildId);
  normalizeBounties(settings);

  if (subcommand === "status") {
    const active = settings.bounties.filter((bounty) => !bounty.claimedAt).slice(-10).reverse();
    const lines = active.length
      ? active.map((bounty, index) => `${index + 1}. <@${bounty.targetUserId}> - ${formatNumber(bounty.amount)} aura${bounty.reason ? ` - ${bounty.reason}` : ""}`).join("\n")
      : "No active bounties. Peace never lasts.";
    await settings.save();
    return interaction.reply(buildEmbedPayload({
      title: "Bounty Board",
      description: lines,
      visual: "pvp-challenge.svg",
      fields: [
        { name: "Claiming", value: "Bounties are auto-claimed when you defeat the target in PvP or punish their failed/successful heist route." },
        { name: "Place", value: "`/bounty place user:<target> amount:<aura> reason:<optional>`" },
      ],
    }));
  }

  const target = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);
  const reason = (interaction.options.getString("reason") || "").trim().slice(0, 120);
  if (target.bot || target.id === interaction.user.id) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Invalid Bounty", description: "Put bounties on rival humans, not yourself or bots.", visual: "emblem-alert.svg" }), ephemeral: true });
  }
  const placer = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  if (amount < 500 || amount > 100000 || amount > placer.aura) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Bounty Rejected", description: "Bounty amount must be 500-100,000 aura and inside your wallet.", visual: "emblem-alert.svg" }), ephemeral: true });
  }
  placer.aura -= amount;
  placer.stats.bountiesPlaced = (placer.stats.bountiesPlaced || 0) + 1;
  settings.bounties.push({
    bountyId: crypto.randomBytes(4).toString("hex"),
    targetUserId: target.id,
    placedByUserId: interaction.user.id,
    amount,
    reason: reason || null,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + BOUNTY_TTL_MS),
  });
  normalizeWorldState(settings);
  settings.worldState.tension = clamp((Number(settings.worldState.tension) || 0) + 5, 0, 100);
  settings.worldState.storyLog.unshift({
    title: "Bounty Posted",
    text: `<@${interaction.user.id}> posted ${formatNumber(amount)} aura on <@${target.id}>${reason ? `: ${reason}` : "."}`,
    actorId: interaction.user.id,
    createdAt: new Date(),
  });
  settings.worldState.storyLog = settings.worldState.storyLog.slice(0, WORLD_STORY_LIMIT);
  settings.markModified("bounties");
  settings.markModified("worldState");
  await Promise.all([placer.save(), settings.save()]);
  eventBus.publish("bounty.placed", { guildId: interaction.guildId, userId: interaction.user.id, metadata: { targetUserId: target.id, amount } });
  return interaction.reply(buildEmbedPayload({
    title: "Bounty Posted",
    description: `<@${target.id}> is now worth **${formatNumber(amount)} aura** to anyone who can settle it through conflict.`,
    visual: "pvp-challenge.svg",
    fields: [
      { name: "Reason", value: reason || "No reason given." },
      { name: "Expires", value: "7 days", inline: true },
      { name: "Your Wallet", value: `${formatNumber(placer.aura)} aura`, inline: true },
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
    const featuredAchievement = available[available.length - 1];
    const footer = await buildSocialProofFooter(
      interaction.guildId,
      { claimedAchievements: featuredAchievement.id },
      (count) => `${formatOtherPlayers(count)} claimed ${featuredAchievement.name}.`
    );
    return interaction.reply(buildEmbedPayload({
      title: "Achievements Claimed",
      description: withFlavor(
        pickFlavor([
          "The achievement ledger stamps the new milestone.",
          "A quiet flare marks the progress you just locked in.",
          "The milestone panel updates before the rewards arrive.",
          "A new badge line joins your account history.",
        ]),
        claimedLines
      ),
      visual: "help-summary.svg",
      fields: [
        { name: "Aura Earned", value: `${formatNumber(rewardAura)}`, inline: true },
        { name: "XP Earned", value: `${formatNumber(rewardXp)}`, inline: true },
        { name: "Claimed", value: `${available.length} achievement(s)`, inline: true },
      ],
      footer,
    }));
  }

  const lines = ACHIEVEMENTS.map((achievement) => {
    const progress = achievement.metric(user);
    const status = user.claimedAchievements.includes(achievement.id) ? "Claimed" : progress >= achievement.goal ? "Ready to claim" : `${Math.min(progress, achievement.goal)} / ${achievement.goal}`;
    return `**${achievement.name}**\n${achievement.description}\n${status}\nReward: ${formatNumber(achievement.rewardAura)} aura, ${formatNumber(achievement.rewardXp)} XP`;
  }).join("\n\n");

  return interaction.reply(buildEmbedPayload({
    title: "Achievements",
    description: withFlavor(
      pickFlavor([
        "The milestone board slides open for review.",
        "Your progress markers settle into their current slots.",
        "The achievement panel checks every route you have touched.",
        "A full milestone scan runs across your profile.",
      ]),
      lines
    ),
    visual: "help-summary.svg",
    footer: "This command auto-claims every unlocked achievement.",
  }));
}

async function handleEvent(interaction) {
  const action = interaction.options.getString("action") || "status";
  const event = getCurrentWorldEvent();
  const settings = await getOrCreateGuildSettings(interaction.guildId);
  const activeServerEvent = getActiveServerEvent(settings);

  if (action === "claim") {
    return claimServerEvent(interaction);
  }

  return interaction.reply(buildEmbedPayload({
    title: `World Event: ${event.name}`,
    description: activeServerEvent
      ? `${event.description}\n\nActive server event:\n${formatServerEvent(activeServerEvent)}`
      : `${event.description}\n\nNo server event is active right now. Keep using Aurix commands and one may appear.`,
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
            description: `You can enable up to **${reminderLimit}** gentle reminders right now. Disable another reminder first.`,
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
      title: "Gentle Reminder Enabled",
      description: `You may be tagged in <#${interaction.channelId}> when ${REMINDER_ACTIONS[action].command} is ready. No streak or reward depends on responding quickly.`,
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

function getOwnedGearEntries(user) {
  return Object.entries(GEAR_ITEMS)
    .filter(([gearId]) => getInventoryQuantity(user, gearId) > 0)
    .map(([gearId, gear]) => ({ gearId, gear }));
}

function buildOwnedGearOptions(user, action) {
  const ownedGear = getOwnedGearEntries(user);
  if (!ownedGear.length) {
    return [
      {
        label: "No crafted gear owned",
        value: "none",
        description: "Craft gear before using this panel.",
      },
    ];
  }

  return ownedGear.map(({ gearId, gear }) => {
    const level = getGearUpgradeLevel(user, gearId);
    const durability = getGearDurability(user, gearId);
    const actionText = action === "repair" ? `${durability}% durability` : `+${level} forge level`;
    return {
      label: gear.name.slice(0, 100),
      value: gearId,
      description: `${gear.slot} slot | ${actionText}`.slice(0, 100),
    };
  }).slice(0, 25);
}

function buildGearEquipComponents(user, ownerId) {
  const ownedGear = getOwnedGearEntries(user);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`gear:equip:${ownerId}`)
    .setPlaceholder(ownedGear.length ? "Choose gear to equip" : "Craft gear to unlock equip choices")
    .setDisabled(!ownedGear.length)
    .addOptions(buildOwnedGearOptions(user, "equip"));
  return [new ActionRowBuilder().addComponents(menu)];
}

function buildForgeActionComponents(user, ownerId) {
  const ownedGear = getOwnedGearEntries(user);
  const disabled = !ownedGear.length;
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`forge:upgrade:${ownerId}`)
        .setPlaceholder(ownedGear.length ? "Choose gear to upgrade" : "Craft gear to unlock forge upgrades")
        .setDisabled(disabled)
        .addOptions(buildOwnedGearOptions(user, "upgrade"))
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`forge:repair:${ownerId}`)
        .setPlaceholder(ownedGear.length ? "Choose gear to repair" : "Craft gear to unlock repairs")
        .setDisabled(disabled)
        .addOptions(buildOwnedGearOptions(user, "repair"))
    ),
  ];
}

function respondWithMutablePanel(interaction, payload) {
  if (interaction.isButton?.() || interaction.isStringSelectMenu?.()) {
    return interaction.update(payload);
  }
  return interaction.reply(payload);
}

async function applyForgeAction(interaction, user, gearId, action) {
  const gear = getGearItem(gearId);
  if (!gear || getInventoryQuantity(user, gearId) <= 0) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Forge Failed", description: "You need to own that crafted gear before forging it.", visual: "emblem-alert.svg" }), ephemeral: true });
  }

  if (action === "repair") {
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
    return respondWithMutablePanel(interaction, {
      ...buildEmbedPayload({
        title: "Gear Repaired",
        description: `${getInventoryLabel(gearId)} is back to full durability.`,
        visual: "emblem-success.svg",
        fields: [
          { name: "Cost", value: `${formatNumber(cost)} aura`, inline: true },
          { name: "Wallet", value: `${formatNumber(user.aura)} aura`, inline: true },
        ],
      }),
      components: buildForgeActionComponents(user, interaction.user.id),
    });
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

  return respondWithMutablePanel(interaction, {
    ...buildEmbedPayload({
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
    }),
    components: buildForgeActionComponents(user, interaction.user.id),
  });
}

async function handleForge(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  normalizeProgressionSystems(user);

  if (subcommand === "status") {
    return interaction.reply({
      ...buildEmbedPayload({
        title: "Aura Forge",
        description: "Upgrade crafted gear for stronger effects. Failed upgrades still consume aura and chip durability.",
        visual: "help-skills.svg",
        fields: [
          { name: "Gear", value: formatForgeStatus(user) },
          { name: "Rules", value: `Max upgrade: +${FORGE_MAX_LEVEL}\nBroken gear works at half power until repaired.` },
        ],
      }),
      components: buildForgeActionComponents(user, interaction.user.id),
    });
  }

  const gearId = interaction.options.getString("item", true);
  return applyForgeAction(interaction, user, gearId, subcommand);
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

  const auraReward = applyFaucetDamping(user, randInt(config.aura[0], config.aura[1]));
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
  normalizeProgressionSystems(user);

  if (subcommand === "loadout") {
    const loadout = cloneLoadout(user.equippedGear);
    const lines = Object.entries(loadout).map(([slot, gearId]) => {
      if (!gearId) {
        return `${slot}: Empty`;
      }
      return `${slot}: ${getInventoryLabel(gearId)} +${getGearUpgradeLevel(user, gearId)} (${getGearDurability(user, gearId)}% durability)`;
    }).join("\n");
    return interaction.reply({
      ...buildEmbedPayload({
        title: "Gear Loadout",
        description: lines,
        visual: "help-skills.svg",
        footer: "Choose owned gear below, or use /forge to upgrade and repair.",
      }),
      components: buildGearEquipComponents(user, interaction.user.id),
    });
  }

  const gearId = interaction.options.getString("item", true);
  return equipGearItem(interaction, user, gearId);
}

async function equipGearItem(interaction, user, gearId) {
  const gear = getGearItem(gearId);
  if (!gear) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Gear Missing", description: "That gear item does not exist.", visual: "emblem-alert.svg" }), ephemeral: true });
  }
  const ownedQuantity = getInventoryQuantity(user, gearId);
  if (ownedQuantity <= 0) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Gear Not Owned", description: `You do not own **${getInventoryLabel(gearId)}** yet. Craft it first.`, visual: "emblem-alert.svg" }), ephemeral: true });
  }

  user.equippedGear = cloneLoadout(user.equippedGear);
  user.equippedGear[gear.slot] = gearId;
  user.markModified("equippedGear");
  await user.save();
  return respondWithMutablePanel(interaction, {
    ...buildEmbedPayload({
      title: "Gear Equipped",
      description: `You equipped **${getInventoryLabel(gearId)}** in the **${gear.slot}** slot.`,
      visual: "help-skills.svg",
      fields: [
        { name: "Effect", value: gear.description },
      ],
    }),
    components: buildGearEquipComponents(user, interaction.user.id),
  });
}

async function handleSpin(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const cooldown = await reserveUserCooldown(user, "lastSpinAt", COOLDOWNS.spinMs);
  if (!cooldown.ok) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Spin Resting", description: `The spinner will be available in ${humanizeMs(cooldown.remaining)}. No need to wait here.`, visual: "core-arcade.svg" }), ephemeral: true });
  }

  const effects = getCombinedEffects(user);
  const baseReward = randInt(180, 540);
  const jackpot = Math.random() < 0.07 ? randInt(500, 1400) : 0;
  const reward = applyFaucetDamping(user, Math.floor((baseReward + jackpot) * (1 + (effects.spinRewardBoost || 0))));
  const xpGain = randInt(60, 120);
  user.aura += reward;
  user.xp += xpGain;
  user.stats.spins += 1;
  await applyQuestProgress(user, "spins", 1);
  await syncRank(user);
  await user.save();

  const footer = await buildSocialProofFooter(
    interaction.guildId,
    { "stats.spins": { $gte: user.stats.spins } },
    (count) => `${formatOtherPlayers(count)} spun this many times.`
  );

  return interaction.reply(addQuickActions(buildEmbedPayload({
    title: "Spin Complete",
    description: withFlavor(
      pickFlavor([
        "The wheel creaks once, then snaps into place.",
        "The aura dial pulses brighter just before the result locks.",
        "A clean spin sends sparks across the arcade glass.",
        "The spinner hums like it knew where it wanted to land.",
      ]),
      `You gained **${formatNumber(reward)} aura** and **${formatNumber(xpGain)} XP**.`
    ),
    visual: "core-arcade.svg",
    fields: [
      { name: "Bonus Spark", value: jackpot > 0 ? `${formatNumber(jackpot)} aura` : "Quiet spin", inline: true },
      { name: "Session Note", value: "Spin is optional filler, not a main progression requirement.", inline: true },
      { name: "Wallet", value: `${formatNumber(user.aura)} aura`, inline: true },
      { name: "Premium", value: isPremiumActive(user) ? "Spin boost applied" : "No premium boost", inline: true },
    ],
    footer,
  }), interaction.user.id, ["rank", "collection", "quests"]));
}

async function handleCoinflip(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const amount = interaction.options.getInteger("amount", true);
  const choice = interaction.options.getString("choice", true);
  const maxBet = getCoinflipMaxBet(user);
  if (amount <= 0 || amount > user.aura) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Invalid Bet", description: "Your bet must be above 0 and within your aura wallet.", visual: "emblem-alert.svg" }), ephemeral: true });
  }
  if (amount > maxBet) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Bet Too Large", description: `To prevent whale-only jackpot swings, your current max coinflip bet is **${formatNumber(maxBet)} aura**.`, visual: "emblem-alert.svg" }), ephemeral: true });
  }

  const cooldown = await reserveUserCooldown(user, "lastCoinflipAt", COOLDOWNS.coinflipMs);
  if (!cooldown.ok) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Arcade Flip Resting", description: `The arcade table will be available in ${humanizeMs(cooldown.remaining)}. This is optional and not needed for healthy progress.`, visual: "emblem-core-arcade.svg" }), ephemeral: true });
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
    title: "Arcade Flip Resolved",
    description,
    visual: "emblem-core-arcade.svg",
    fields: [
      { name: "Choice", value: choice, inline: true },
      { name: "Multiplier", value: choiceWins ? `${multiplier}x` : "0x", inline: true },
      { name: "XP Delta", value: `${xpDelta >= 0 ? "+" : ""}${formatNumber(xpDelta)}`, inline: true },
    ],
    footer: "Arcade flips are intentionally capped and optional.",
  }));
}

async function handleDaily(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const previousDailyAt = user.lastDailyAt;
  const cooldown = await reserveUserCooldown(user, "lastDailyAt", COOLDOWNS.dailyMs);
  if (!cooldown.ok) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Daily Already Checked In", description: `Another relaxed check-in is available in ${humanizeMs(cooldown.remaining)}. You will not lose progress by stepping away.`, visual: "emblem-help.svg" }), ephemeral: true });
  }

  const catchup = getDailyCatchup(previousDailyAt, user.streak);
  user.streak = catchup.protectedStreak;
  const premiumRareCrates = getPremiumDailyRareCrates(user);
  const premiumMultiplier = getPremiumDailyMultiplier(user);
  const auraReward = applyFaucetDamping(user, Math.floor((700 + user.streak * 90 + user.prestige * 140) * premiumMultiplier));
  const xpReward = Math.floor((180 + user.streak * 40) * premiumMultiplier);
  const catchupAuraBonus = applyFaucetDamping(user, catchup.auraBonus);
  user.aura += auraReward + catchupAuraBonus;
  user.xp += xpReward + catchup.xpBonus;
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

  return interaction.reply(addQuickActions(buildEmbedPayload({
    title: "Daily Check-In",
    description: withFlavor(
      pickFlavor([
        "The daily seal opens with a warm flash.",
        "A fresh reward packet drops into your route.",
        "The rhythm counter notes the visit without asking you to rush.",
        "Today's check-in lands quietly.",
      ]),
      `Your rhythm is now **${user.streak}**. ${catchup.message}`
    ),
    visual: "emblem-success.svg",
    fields: [
      { name: "Aura", value: `${formatNumber(auraReward)}`, inline: true },
      { name: "XP", value: `${formatNumber(xpReward)}`, inline: true },
      { name: "Bonus", value: premiumRareCrates > 0 ? `Premium bonus ${getCrateLabel("rare")} x${premiumRareCrates} + ${user.streak % 7 === 0 ? `weekly rhythm ${getCrateLabel("rare")}` : getCrateLabel("common")}` : user.streak % 7 === 0 ? `${getCrateLabel("rare")} earned` : `${getCrateLabel("common")} earned`, inline: true },
      { name: "Rested Catch-up", value: catchupAuraBonus || catchup.xpBonus ? `${formatNumber(catchupAuraBonus)} aura + ${formatNumber(catchup.xpBonus)} XP` : "No missed days to recover.", inline: true },
      { name: "Economy Scaling", value: `${Math.round(getFaucetMultiplier(user) * 100)}% faucet rate`, inline: true },
    ],
    footer: "You can miss days. Rested catch-up exists so the bot does not punish normal life.",
  }), interaction.user.id, ["quests", "tutorial", "profile"]));
}

async function handleVote(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  normalizeTopggState(user);

  const readyAt = getReminderReadyTimestamp(user, "vote");
  const remaining = readyAt ? Math.max(0, readyAt - Date.now()) : 0;
  const voteUrl = getTopggVoteUrl();
  const reminderEnabled = user.reminders?.enabledActions?.includes("vote");

  return interaction.reply(buildEmbedPayload({
    title: "Vote Rewards",
    description: remaining > 0
      ? `Thanks for voting. Your next Top.gg vote should unlock in about **${humanizeMs(remaining)}**.`
      : "Vote for Aurix on Top.gg and your reward will arrive automatically after Top.gg sends the webhook.",
    visual: "emblem-success.svg",
    fields: [
      { name: "Vote Link", value: voteUrl },
      { name: "Reward", value: formatTopggReward(buildTopggReward(1)), inline: true },
      { name: "Weekend", value: "Top.gg double-vote weekends pay double when Top.gg sends weight 2.", inline: true },
      { name: "Reminders", value: reminderEnabled ? "Enabled. You can disable it with `/reminders disable action:Top.gg Vote`." : "Optional: use `/reminders enable action:Top.gg Vote` to get tagged when your next vote is available." },
    ],
    footer: user.topgg.voteCount > 0 ? `Votes rewarded: ${formatNumber(user.topgg.voteCount)}` : "Rewards are delivered by the Top.gg webhook.",
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

  const cooldown = await reserveUserCooldown(user, "premium.lastChestAt", getPremiumChestCooldownMs(user));
  if (!cooldown.ok) {
    return interaction.reply({
      ...buildEmbedPayload({
        title: "Premium Chest Recharging",
        description: `Your next Premium Chest opens in ${humanizeMs(cooldown.remaining)}.`,
        visual: "emblem-alert.svg",
      }),
      ephemeral: true,
    });
  }

  const chest = plan.chest;
  const auraReward = applyFaucetDamping(user, randInt(chest.aura[0], chest.aura[1]));
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
  await syncRank(user);
  await user.save();

  return interaction.reply(buildEmbedPayload({
    title: "Premium Chest Opened",
    description: "Your membership cache opened with prestige-forward, economy-capped loot.",
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
  const vaultRate = getVaultRate(user, combinedEffects);
  const bonusLines = [
    `Base: ${(ECONOMY_RULES.vaultBaseRatePerHour * 100).toFixed(2)}%/hr`,
    `Bonus Sources: ${formatEffectValue(vaultPerkBonus)}/hr (cap ${formatEffectCapValue("vaultInterestBoost", getEffectCapsForUser(user))}/hr)`,
    `Prestige: +${(user.prestige * ECONOMY_RULES.vaultPrestigeRatePerHour * 100).toFixed(2)}%/hr`,
    `Large-vault scaling: effective rate shown below`,
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

  const footer = await buildSocialProofFooter(
    interaction.guildId,
    { vaultAura: { $gte: user.vaultAura } },
    (count) => `${formatOtherPlayers(count)} built a vault this large.`
  );

  return interaction.reply(addQuickActions(buildEmbedPayload({
    title: "Vault Updated",
    description: withFlavor(
      pickFlavor([
        "The vault seals rotate and settle into place.",
        "A low chime rolls through the vault chamber.",
        "The ledger recalculates before the doors lock again.",
        "Stored aura glows behind the reinforced glass.",
      ]),
      `${interest > 0 ? `Interest added before processing: **${formatNumber(interest)} aura**.\n` : ""}Your vault is secure and compounding.`
    ),
    visual: "economy-vault.svg",
    fields: [
      { name: "Wallet", value: `${formatNumber(user.aura)} aura`, inline: true },
      { name: "Vault", value: `${formatNumber(user.vaultAura)} aura`, inline: true },
      { name: "Current Interest", value: `${(vaultRate * 100).toFixed(2)}% per hour`, inline: true },
      { name: "Rate Breakdown", value: bonusLines.join("\n") },
    ],
    footer,
  }), interaction.user.id, ["balance", "rank", "collection", "quests"]));
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
  const roleListings = interaction.guildId
    ? await RoleListing.find({ guildId: interaction.guildId, enabled: true }).sort({ price: 1, name: 1 }).limit(8).lean()
    : [];
  const roleLines = roleListings.map(formatRoleListingLine).join("\n");
  return interaction.reply(buildEmbedPayload({
    title: "Aura Shop",
    description: lines || "No shop items available.",
    visual: "emblem-economy.svg",
    fields: [
      { name: "Membership", value: formatPremiumStatus(user), inline: true },
      { name: "Server Roles", value: roleLines || "No server roles are listed yet.", inline: false },
    ],
    footer: "Use /buy item:<id> for items or /buy role:<listing id> for server roles.",
  }));
}

async function handleBuy(interaction) {
  const roleListingId = interaction.options.getString("role", false);
  if (roleListingId) {
    return buyRoleListing(interaction, roleListingId);
  }

  const itemId = interaction.options.getString("item", false);
  if (!itemId) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Choose Purchase", description: "Use `/buy item:<id>` for shop items or `/buy role:<listing id>` for server roles.", visual: "emblem-help.svg" }), ephemeral: true });
  }
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

function formatRoleListingLine(listing) {
  const description = listing.description ? ` - ${listing.description}` : "";
  return `\`${listing._id}\` | <@&${listing.roleId}> | ${formatNumber(listing.price)} aura${description}`;
}

async function getManageableGuildRole(interaction, roleId) {
  const guild = interaction.guild;
  if (!guild) {
    return { error: "Role purchases can only be used inside a server." };
  }

  const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!botMember?.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    return { error: "Aurix needs the Manage Roles permission before it can sell server roles." };
  }

  const role = await guild.roles.fetch(roleId).catch(() => null);
  if (!role || role.managed || role.id === guild.id) {
    return { error: "That server role no longer exists or cannot be assigned." };
  }

  if (role.position >= botMember.roles.highest.position) {
    return { error: `Move the Aurix bot role above **${role.name}** in Server Settings before selling it.` };
  }

  return { role };
}

async function buyRoleListing(interaction, listingId) {
  const normalizedListingId = String(listingId || "").trim();
  if (!interaction.guildId) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Server Only", description: "Role purchases only work inside a Discord server.", visual: "emblem-alert.svg" }), ephemeral: true });
  }
  if (!/^[a-f\d]{24}$/i.test(normalizedListingId)) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Invalid Listing", description: "Use a listing id from `/shop`.", visual: "emblem-alert.svg" }), ephemeral: true });
  }

  const listing = await RoleListing.findOne({ _id: normalizedListingId, guildId: interaction.guildId, enabled: true });
  if (!listing) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Role Not Listed", description: "That role listing is not active in this server.", visual: "emblem-alert.svg" }), ephemeral: true });
  }

  const roleResult = await getManageableGuildRole(interaction, listing.roleId);
  if (roleResult.error) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Role Purchase Blocked", description: roleResult.error, visual: "emblem-alert.svg" }), ephemeral: true });
  }

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Member Missing", description: "Aurix could not load your server member record. Try again in a moment.", visual: "emblem-alert.svg" }), ephemeral: true });
  }

  if (member.roles.cache.has(listing.roleId)) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Already Owned", description: `You already have <@&${listing.roleId}>.`, visual: "emblem-help.svg" }), ephemeral: true });
  }

  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  if (user.aura < listing.price) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Not Enough Aura", description: `<@&${listing.roleId}> costs ${formatNumber(listing.price)} aura. You have ${formatNumber(user.aura)} aura.`, visual: "emblem-alert.svg" }), ephemeral: true });
  }

  user.aura -= listing.price;
  await user.save();

  try {
    await member.roles.add(roleResult.role, "Aurix role shop purchase");
  } catch (error) {
    user.aura += listing.price;
    await user.save().catch(() => null);
    return interaction.reply({ ...buildEmbedPayload({ title: "Role Purchase Failed", description: `Aurix could not assign **${roleResult.role.name}**. Check the bot role position and Manage Roles permission.`, visual: "emblem-alert.svg" }), ephemeral: true });
  }

  listing.purchaseCount += 1;
  await listing.save();
  await RolePurchase.create({
    guildId: interaction.guildId,
    userId: interaction.user.id,
    listingId: listing._id,
    roleId: listing.roleId,
    price: listing.price,
  });

  return interaction.reply(buildEmbedPayload({
    title: "Role Purchased",
    description: `You bought <@&${listing.roleId}> for ${formatNumber(listing.price)} aura.`,
    visual: "emblem-success.svg",
    fields: [
      { name: "Wallet", value: `${formatNumber(user.aura)} aura`, inline: true },
      { name: "Role", value: roleResult.role.name, inline: true },
    ],
  }));
}

async function handleRoleShop(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (!interaction.guildId) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Server Only", description: "Role shop purchases only work inside a Discord server.", visual: "emblem-alert.svg" }), ephemeral: true });
  }

  if (subcommand === "list") {
    const listings = await RoleListing.find({ guildId: interaction.guildId, enabled: true }).sort({ price: 1, name: 1 }).limit(15).lean();
    return interaction.reply(buildEmbedPayload({
      title: "Role Shop",
      description: listings.length ? listings.map(formatRoleListingLine).join("\n") : "No server roles are listed yet. Ask an admin to add roles from the Aurix website dashboard.",
      visual: "emblem-success.svg",
      footer: listings.length ? "Use /roleshop buy listing:<listing id> to purchase a role." : "Admins can configure listings from the website dashboard.",
    }));
  }

  const listingId = interaction.options.getString("listing", true).trim();
  return buyRoleListing(interaction, listingId);
}

async function handleRank(interaction) {
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const current = RANKS[user.rankIndex];
  const next = nextRank(user.rankIndex);
  const currentXp = user.xp - current.xpRequired;
  const totalXp = Math.max(1, next.xpRequired - current.xpRequired);
  const footer = await buildSocialProofFooter(
    interaction.guildId,
    { rankIndex: { $gte: user.rankIndex } },
    (count) => `${formatOtherPlayers(count)} reached ${getRankLabel(current)} or higher.`
  );
  return interaction.reply(addQuickActions(buildEmbedPayload({
    title: "Rank Progress",
    description: withFlavor(
      pickFlavor([
        "The rank board refreshes and finds your marker.",
        "Your XP trail sharpens into the next visible step.",
        "The ladder holds steady while the next tier waits.",
        "Progress scans clean across the current bracket.",
      ]),
      "Rank is based on XP, separate from aura. Treat it as a long-term trail, not a timer to chase."
    ),
    visual: "core-profile.svg",
    fields: [
      { name: "Current Rank", value: getRankLabel(current), inline: true },
      { name: "Next Rank", value: getRankLabel(next), inline: true },
      { name: "Prestige", value: `${user.prestige}`, inline: true },
      { name: "Progress", value: `${progressBar(currentXp, totalXp)}\n${formatNumber(currentXp)} / ${formatNumber(totalXp)} XP` },
    ],
    footer,
  }), interaction.user.id, ["profile", "quests", "achievements", "collection"]));
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

  const footer = await buildSocialProofFooter(
    interaction.guildId,
    { prestige: { $gte: user.prestige } },
    (count) => `${formatOtherPlayers(count)} reached prestige ${user.prestige} or higher.`
  );

  return interaction.reply(buildEmbedPayload({
    title: "Prestige Complete",
    description: withFlavor(
      pickFlavor([
        "The ladder folds inward, then opens at a higher layer.",
        "A new prestige mark burns into the profile ledger.",
        "The old climb resets, but the account remembers the height.",
        "The next run starts with a brighter baseline.",
      ]),
      `You reset your rank ladder and advanced to prestige **${user.prestige}**.`
    ),
    visual: "emblem-success.svg",
    fields: [
      { name: "Aura Cost", value: `${formatNumber(auraCost)}`, inline: true },
      { name: "Reward", value: "1 epic crate + modest future daily and vault scaling", inline: true },
    ],
    footer,
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

  auraReward = applyFaucetDamping(user, auraReward);
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
  const settings = state.isBoss ? null : await getOrCreateGuildSettings(interaction.guildId);

  if (state.isBoss) {
    if (playerWon) {
      const effects = getCombinedEffects(first);
      const auraReward = applyFaucetDamping(first, Math.floor(state.rewardAura * (1 + (effects.bossRewardBoost || 0))));
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
    const streakBonus = 0;
    const auraReward = applyFaucetDamping(first, Math.floor(state.rewardAura * (1 + (effects.pvpRewardBoost || 0))));
    const bountyResult = settings ? markBountiesClaimed(settings, second.userId, first.userId) : { payout: 0, count: 0 };
    first.aura += auraReward;
    first.aura += bountyResult.payout;
    first.xp += state.rewardXp;
    second.xp = Math.max(0, second.xp - Math.floor(state.rewardXp / 2));
    first.notoriety = Math.max(0, (Number(first.notoriety) || 0) + 2);
    second.protectionUntil = new Date(Date.now() + PROTECTION_WINDOW_MS);
    setRevengeMark(second, first.userId);
    first.stats.pvpWins += 1;
    first.stats.bountiesClaimed = (first.stats.bountiesClaimed || 0) + bountyResult.count;
    second.stats.pvpLosses += 1;
    applyCombatLoot(first, loot);
    await applyQuestProgress(first, "pvpWins", 1);
    await syncRank(first);
    await syncRank(second);
    await first.save();
    await second.save();
    if (settings) {
      await settings.save();
    }

    const payload = {
      ...buildEmbedPayload({
        title: "PvP Battle Finished",
        description: `**${state.playerOne.name}** won the duel in **${state.arena?.name || "the arena"}** and claimed ${formatNumber(auraReward)} aura plus ${formatNumber(state.rewardXp)} XP.`,
        visual: "pvp-victory.svg",
        fields: [
          { name: "Loot Drops", value: loot.length ? loot.map((entry) => entry.label).join(", ") : "None", inline: true },
          { name: "Win Streak", value: `${formatNumber(first.stats.pvpStreak)} current | ${formatNumber(first.stats.bestPvpStreak)} best`, inline: true },
          { name: "Bounty", value: bountyResult.payout > 0 ? `${formatNumber(bountyResult.payout)} aura claimed` : "No active bounty", inline: true },
          { name: "Aura Bonus", value: "No win-streak payout. PvP records are expressive, not pressure multipliers.", inline: true },
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
    const streakBonus = 0;
    const auraReward = applyFaucetDamping(second, Math.floor(state.rewardAura * (1 + (effects.pvpRewardBoost || 0))));
    const bountyResult = settings ? markBountiesClaimed(settings, first.userId, second.userId) : { payout: 0, count: 0 };
    second.aura += auraReward;
    second.aura += bountyResult.payout;
    second.xp += state.rewardXp;
    first.xp = Math.max(0, first.xp - Math.floor(state.rewardXp / 2));
    second.notoriety = Math.max(0, (Number(second.notoriety) || 0) + 2);
    first.protectionUntil = new Date(Date.now() + PROTECTION_WINDOW_MS);
    setRevengeMark(first, second.userId);
    second.stats.pvpWins += 1;
    second.stats.bountiesClaimed = (second.stats.bountiesClaimed || 0) + bountyResult.count;
    first.stats.pvpLosses += 1;
    applyCombatLoot(second, loot);
    await applyQuestProgress(second, "pvpWins", 1);
    await syncRank(first);
    await syncRank(second);
    await first.save();
    await second.save();
    if (settings) {
      await settings.save();
    }

    const payload = {
      ...buildEmbedPayload({
        title: "PvP Battle Finished",
        description: `**${state.playerTwo.name}** won the duel in **${state.arena?.name || "the arena"}** and claimed ${formatNumber(auraReward)} aura plus ${formatNumber(state.rewardXp)} XP.`,
        visual: "pvp-victory.svg",
        fields: [
          { name: "Loot Drops", value: loot.length ? loot.map((entry) => entry.label).join(", ") : "None", inline: true },
          { name: "Win Streak", value: `${formatNumber(second.stats.pvpStreak)} current | ${formatNumber(second.stats.bestPvpStreak)} best`, inline: true },
          { name: "Bounty", value: bountyResult.payout > 0 ? `${formatNumber(bountyResult.payout)} aura claimed` : "No active bounty", inline: true },
          { name: "Aura Bonus", value: "No win-streak payout. PvP records are expressive, not pressure multipliers.", inline: true },
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

async function handleQuickActionButton(interaction) {
  const [, action, ownerId] = interaction.customId.split(":");
  if (ownerId !== interaction.user.id) {
    return interaction.reply({ content: "Only the player who opened this panel can use these shortcuts.", ephemeral: true });
  }
  const handlers = {
    daily: handleDaily,
    work: handleWork,
    mine: handleMine,
    summon: handleSummon,
    spin: handleSpin,
    balance: handleBalance,
    profile: handleProfile,
    rank: handleRank,
    quests: handleQuests,
    achievements: handleAchievements,
    tutorial: handleTutorial,
    inventory: handleInventory,
    collection: handleCollection,
  };
  const handler = handlers[action];
  if (!handler) {
    return interaction.reply({ content: "That shortcut is not available anymore.", ephemeral: true });
  }
  const result = await handler(interaction);
  await runPostCommandEngagement(interaction, action, null);
  await sendPendingRankUpMessages(interaction);
  return result;
}

async function handleGearComponentInteraction(interaction) {
  const [, action, ownerId] = interaction.customId.split(":");
  if (ownerId !== interaction.user.id) {
    return interaction.reply({ content: "Only the player who opened this gear panel can use it.", ephemeral: true });
  }
  if (!interaction.isStringSelectMenu() || action !== "equip") {
    return interaction.reply({ content: "That gear action is not supported anymore.", ephemeral: true });
  }
  const gearId = interaction.values[0];
  if (!gearId || gearId === "none") {
    return interaction.reply({ content: "Craft gear first, then reopen `/gear loadout`.", ephemeral: true });
  }
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  normalizeProgressionSystems(user);
  return equipGearItem(interaction, user, gearId);
}

async function handleForgeComponentInteraction(interaction) {
  const [, action, ownerId] = interaction.customId.split(":");
  if (ownerId !== interaction.user.id) {
    return interaction.reply({ content: "Only the player who opened this forge panel can use it.", ephemeral: true });
  }
  if (!interaction.isStringSelectMenu() || !["upgrade", "repair"].includes(action)) {
    return interaction.reply({ content: "That forge action is not supported anymore.", ephemeral: true });
  }
  const gearId = interaction.values[0];
  if (!gearId || gearId === "none") {
    return interaction.reply({ content: "Craft gear first, then reopen `/forge status`.", ephemeral: true });
  }
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  normalizeProgressionSystems(user);
  return applyForgeAction(interaction, user, gearId, action);
}

async function handleTradeButton(interaction) {
  const [, action, offerId, targetUserId] = interaction.customId.split(":");
  if (targetUserId !== interaction.user.id) {
    return interaction.reply({ content: "Only the trade recipient can use this button.", ephemeral: true });
  }
  if (action === "accept") {
    return acceptTradeOffer(interaction, offerId);
  }
  if (action === "decline") {
    const offer = await TradeOffer.findOne({ offerId, guildId: interaction.guildId, status: "pending" });
    if (!offer) {
      return interaction.reply({ ...buildEmbedPayload({ title: "Trade Missing", description: "That trade is no longer pending.", visual: "emblem-alert.svg" }), ephemeral: true });
    }
    offer.status = "declined";
    await offer.save();
    return interaction.reply(buildEmbedPayload({ title: "Trade Declined", description: `Trade \`${offerId}\` was declined.`, visual: "emblem-success.svg" }));
  }
  return interaction.reply({ content: "That trade action is not supported.", ephemeral: true });
}

async function handleEventButton(interaction) {
  const [, action, guildId, choiceId] = interaction.customId.split(":");
  if (guildId !== interaction.guildId) {
    return interaction.reply({ content: "That event action is no longer available here.", ephemeral: true });
  }
  if (action === "activity") {
    return completeServerEventActivity(interaction, choiceId);
  }
  if (action !== "claim") {
    return interaction.reply({ content: "That event action is no longer available here.", ephemeral: true });
  }
  return claimServerEvent(interaction);
}

async function handleWorldButton(interaction) {
  const [, action, guildId, choiceId] = interaction.customId.split(":");
  if (guildId !== interaction.guildId || action !== "choice") {
    return interaction.reply({ content: "That world decision is no longer available here.", ephemeral: true });
  }
  return resolveWorldEncounter(interaction, choiceId);
}

async function runPostCommandEngagement(interaction, commandName, subcommand = null) {
  if (!interaction?.guildId || !interaction.user?.id || !ENGAGEMENT_COMMANDS.has(commandName)) {
    return;
  }
  const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
  const tutorialResult = await advanceTutorial(user, commandName, subcommand);
  await user.save();
  if (tutorialResult && interaction.followUp) {
    await interaction.followUp({
      ...buildEmbedPayload({
        title: tutorialResult.completed ? "Tutorial Complete" : "Tutorial Progress",
        description: tutorialResult.message,
        visual: "emblem-success.svg",
      }),
      ephemeral: true,
    }).catch(() => null);
  }
  await maybeAnnounceMilestones(interaction, user);
  await maybePromptTopggVote(interaction, user, commandName);
  await maybeSpawnServerEvent(interaction);
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
  const cooldown = await reserveUserCooldown(user, "lastBossAt", COOLDOWNS.bossMs);
  if (!cooldown.ok) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Boss Cooling Down", description: `You can challenge another boss in ${humanizeMs(cooldown.remaining)}.`, visual: "emblem-alert.svg" }), ephemeral: true });
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
  });
}

async function handleSetup(interaction) {
  if (!hasSetupAccess(interaction.memberPermissions)) {
    return interaction.reply({
      ...buildEmbedPayload({
        title: "Setup Locked",
        description: "Only admins or moderators can use `/setup` to choose Aurix channels.",
        visual: "emblem-alert.svg",
      }),
      ephemeral: true,
    });
  }

  const optionChannel = interaction.options.getChannel("channel");
  const mode = interaction.options.getString("mode") || "commands";
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
  const missingPermissions = getMissingSetupChannelPermissions(selectedChannel, botMember);
  if (missingPermissions.length) {
    return interaction.reply({
      ...buildEmbedPayload({
        title: "Setup Channel Blocked",
        description: `I need these permissions in ${selectedChannel}: **${missingPermissions.join(", ")}**.`,
        visual: "emblem-alert.svg",
      }),
      ephemeral: true,
    });
  }

  await setAurixChannel(interaction.guildId, selectedChannel.id, interaction.user.id, mode);
  const guildName = interaction.guild?.name || "this server";
  if (selectedChannel.id === interaction.channelId) {
    const permissions = selectedChannel.permissionsFor?.(botMember);
    return interaction.reply(buildSetupGuidePayloadForPermissions(guildName, permissions));
  }

  const posted = await sendSetupGuideToChannel(selectedChannel, guildName).then(() => true).catch((error) => {
    console.warn("Failed to post setup guide:", error?.code || error?.message || error);
    return false;
  });
  if (!posted) {
    return interaction.reply({
      ...buildEmbedPayload({
        title: "Setup Saved, Post Failed",
        description: `I saved ${selectedChannel} for setup, but Discord blocked my starter-guide message there. Check my channel permissions, especially Embed Links and Attach Files.`,
        visual: "emblem-alert.svg",
      }),
      ephemeral: true,
    });
  }

  const modeLabel = mode === "both" ? "commands and drops" : mode === "drops" ? "relic drops" : "economy commands";
  return interaction.reply({
    ...buildEmbedPayload({
      title: "Setup Completed",
      description: `Aurix is now configured to use ${selectedChannel} for **${modeLabel}**. I posted the short starter guide there.`,
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

  const sortMap = {
    aura: { aura: -1 },
    xp: { xp: -1 },
    prestige: { prestige: -1, xp: -1 },
    vault: { vaultAura: -1 },
    pvp: { "stats.pvpWins": -1, "stats.bestPvpStreak": -1, "stats.pvpLosses": 1 },
  };
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
    const value = category === "xp"
      ? `${formatNumber(entry.player.xp)} XP`
      : category === "prestige"
        ? `${entry.player.prestige} prestige`
        : category === "vault"
          ? `${formatNumber(entry.player.vaultAura)} vault aura`
          : category === "pvp"
            ? `${formatNumber(entry.player.stats?.pvpWins || 0)}W-${formatNumber(entry.player.stats?.pvpLosses || 0)}L | streak ${formatNumber(getPvpStreak(entry.player))} current, ${formatNumber(getBestPvpStreak(entry.player))} best`
            : `${formatNumber(entry.player.aura)} aura`;
    return `${index + 1}. **${entry.name}** - ${value}`;
  }).join("\n");
  const titleLabel = category === "pvp" ? "PvP Leaderboard" : "Player Leaderboard";
  return interaction.reply(buildEmbedPayload({ title: `${serverOnly ? "Server" : "Global"} ${titleLabel}`, description: lines || "No player data yet.", visual: category === "pvp" ? "emblem-pvp.svg" : "help-summary.svg" }));
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
  const cooldown = await reserveUserCooldown(user, "lastAuthorityAt", COOLDOWNS.authorityMs);
  if (!cooldown.ok) {
    return interaction.reply({ ...buildEmbedPayload({ title: "Authority Cooling Down", description: `You can use this again in ${humanizeMs(cooldown.remaining)}.`, visual: "emblem-help.svg" }), ephemeral: true });
  }

  const target = interaction.options.getUser("user", true);
  const targetProfile = await getOrCreatePlayer(interaction.guildId, target.id);
  const auraGain = 150 + user.rankIndex * 50;
  const xpGain = 100 + user.rankIndex * 35;
  targetProfile.aura += auraGain;
  targetProfile.xp += xpGain;
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
    new SlashCommandBuilder().setName("event").setDescription("View or claim current events.").addStringOption((option) => option.setName("action").setDescription("Event action").addChoices({ name: "status", value: "status" }, { name: "claim", value: "claim" })),
    new SlashCommandBuilder().setName("setup").setDescription("Configure Aurix command and drops channels.")
      .addStringOption((option) => option.setName("mode").setDescription("What this channel should handle").addChoices({ name: "commands", value: "commands" }, { name: "drops", value: "drops" }, { name: "both", value: "both" }))
      .addChannelOption((option) => option.setName("channel").setDescription("Optional channel; leave empty to use this channel").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
    new SlashCommandBuilder().setName("start").setDescription("Create your save and open the quick-start guide."),
    new SlashCommandBuilder().setName("tutorial").setDescription("Follow the guided first-session reward path."),
    new SlashCommandBuilder().setName("profile").setDescription("View your or another player's profile.").addUserOption((option) => option.setName("user").setDescription("Optional target")),
    new SlashCommandBuilder().setName("stats").setDescription("View deeper player stats.").addUserOption((option) => option.setName("user").setDescription("Optional target")),
    new SlashCommandBuilder().setName("balance").setDescription("Check wallet and vault balance.").addUserOption((option) => option.setName("user").setDescription("Optional target")),
    new SlashCommandBuilder().setName("work").setDescription("Complete a shift for steady aura and XP."),
    new SlashCommandBuilder().setName("mine").setDescription("Gather crafting materials for projects and crafting."),
    new SlashCommandBuilder().setName("summon").setDescription("Spend aura to print a collectible Aurix relic."),
    new SlashCommandBuilder().setName("claim").setDescription("Claim the active chat-spawned relic by name.")
      .addStringOption((option) => option.setName("guess").setDescription("Relic name").setRequired(true)),
    new SlashCommandBuilder().setName("hint").setDescription("Show a hint for the active chat-spawned relic."),
    new SlashCommandBuilder().setName("incense").setDescription("Buy or check channel relic incense.")
      .addSubcommand((sub) => sub.setName("buy").setDescription(`Buy ${INCENSE_SPAWNS} channel relic spawns for ${INCENSE_COST} aura.`))
      .addSubcommand((sub) => sub.setName("status").setDescription("Check remaining channel incense spawns.")),
    new SlashCommandBuilder().setName("burn").setDescription("Burn duplicate relics into aura and XP.")
      .addStringOption((option) => option.setName("relic").setDescription("Relic id or exact relic name").setRequired(true))
      .addIntegerOption((option) => option.setName("quantity").setDescription("Duplicate copies to burn").setMinValue(1)),
    new SlashCommandBuilder().setName("relic").setDescription("Inspect and shape owned relics.")
      .addSubcommand((sub) => sub.setName("inspect").setDescription("Inspect relic history, traits, and corruption.").addStringOption((option) => option.setName("relic").setDescription("Relic id or name").setRequired(true)))
      .addSubcommand((sub) => sub.setName("evolve").setDescription("Spend aura and relic essence to evolve a relic.").addStringOption((option) => option.setName("relic").setDescription("Relic id or name").setRequired(true)))
      .addSubcommand((sub) => sub.setName("purify").setDescription("Spend aura and relic essence to reduce corruption.").addStringOption((option) => option.setName("relic").setDescription("Relic id or name").setRequired(true)))
      .addSubcommand((sub) => sub.setName("bind").setDescription("Bind a relic to a faction identity.").addStringOption((option) => option.setName("relic").setDescription("Relic id or name").setRequired(true)).addStringOption((option) => option.setName("faction").setDescription("Faction").setRequired(true).addChoices(...getFactionChoiceEntries()))),
    new SlashCommandBuilder().setName("spin").setDescription("Use a small optional arcade spin."),
    new SlashCommandBuilder().setName("coinflip").setDescription("Play a capped optional arcade flip.").addIntegerOption((option) => option.setName("amount").setDescription("Aura to risk").setRequired(true).setMinValue(1)).addStringOption((option) => option.setName("choice").setDescription("Choose heads or tails").setRequired(true).addChoices({ name: "heads", value: "heads" }, { name: "tails", value: "tails" })),
    new SlashCommandBuilder().setName("rob").setDescription("Run a capped strategic heist against another player.")
      .addUserOption((option) => option.setName("user").setDescription("Target player").setRequired(true))
      .addStringOption((option) => option.setName("plan").setDescription("Heist plan").addChoices({ name: "Quiet Cut", value: "quiet" }, { name: "Smash Raid", value: "smash" }, { name: "Frame Job", value: "frame" })),
    new SlashCommandBuilder().setName("bounty").setDescription("Post and inspect public revenge contracts.")
      .addSubcommand((sub) => sub.setName("status").setDescription("View active bounties."))
      .addSubcommand((sub) => sub.setName("place").setDescription("Place a bounty on a rival.").addUserOption((option) => option.setName("user").setDescription("Bounty target").setRequired(true)).addIntegerOption((option) => option.setName("amount").setDescription("Aura bounty").setRequired(true).setMinValue(500).setMaxValue(100000)).addStringOption((option) => option.setName("reason").setDescription("Optional reason").setMaxLength(120))),
    new SlashCommandBuilder().setName("daily").setDescription("Claim a relaxed daily check-in."),
    new SlashCommandBuilder().setName("vote").setDescription("Get the Top.gg vote link and reward reminder info."),
    new SlashCommandBuilder().setName("reminders").setDescription("Manage gentle low-pressure reminders.")
      .addSubcommand((sub) => sub.setName("status").setDescription("View your reminder settings."))
      .addSubcommand((sub) => sub.setName("enable").setDescription("Tag me when an action is ready.").addStringOption((option) => option.setName("action").setDescription("Action to track").setRequired(true).addChoices(...REMINDER_ACTION_CHOICES)))
      .addSubcommand((sub) => sub.setName("disable").setDescription("Stop tagging me for an action.").addStringOption((option) => option.setName("action").setDescription("Action to stop tracking").setRequired(true).addChoices(...REMINDER_ACTION_CHOICES))),
    new SlashCommandBuilder().setName("vault").setDescription("Manage your aura vault.").addSubcommand((sub) => sub.setName("deposit").setDescription("Deposit aura.").addIntegerOption((option) => option.setName("amount").setDescription("Amount").setRequired(true).setMinValue(1))).addSubcommand((sub) => sub.setName("withdraw").setDescription("Withdraw aura.").addIntegerOption((option) => option.setName("amount").setDescription("Amount").setRequired(true).setMinValue(1))).addSubcommand((sub) => sub.setName("interest").setDescription("Claim accumulated vault interest.")),
    new SlashCommandBuilder().setName("shop").setDescription("Browse shop items, perks, and server roles."),
    new SlashCommandBuilder().setName("buy").setDescription("Buy an item or server role from the shop.")
      .addStringOption((option) => option.setName("item").setDescription("Item id from /shop"))
      .addStringOption((option) => option.setName("role").setDescription("Server role listing id from /shop")),
    new SlashCommandBuilder().setName("roleshop").setDescription("Browse and buy server roles listed by admins.")
      .addSubcommand((sub) => sub.setName("list").setDescription("View purchasable server roles."))
      .addSubcommand((sub) => sub.setName("buy").setDescription("Buy a listed server role with aura.").addStringOption((option) => option.setName("listing").setDescription("Listing id from /roleshop list").setRequired(true))),
    new SlashCommandBuilder().setName("gift").setDescription("Send aura to another player.").addUserOption((option) => option.setName("user").setDescription("Receiving player").setRequired(true)).addIntegerOption((option) => option.setName("amount").setDescription("Aura to send").setRequired(true).setMinValue(1)),
    new SlashCommandBuilder().setName("trade").setDescription("Offer or accept player trades.")
      .addSubcommand((sub) => sub.setName("offer").setDescription("Offer aura or an item to another player.").addUserOption((option) => option.setName("user").setDescription("Receiving player").setRequired(true)).addIntegerOption((option) => option.setName("aura").setDescription("Aura to offer").setMinValue(1)).addStringOption((option) => option.setName("item").setDescription("Item id, or crate:<type> for crates")).addIntegerOption((option) => option.setName("quantity").setDescription("Item quantity").setMinValue(1)))
      .addSubcommand((sub) => sub.setName("accept").setDescription("Accept a pending trade.").addStringOption((option) => option.setName("id").setDescription("Trade offer id").setRequired(true)))
      .addSubcommand((sub) => sub.setName("cancel").setDescription("Cancel your pending trade.").addStringOption((option) => option.setName("id").setDescription("Trade offer id").setRequired(true))),
    new SlashCommandBuilder().setName("inventory").setDescription("View your items, perks, skills, and crates."),
    new SlashCommandBuilder().setName("collection").setDescription("View a player's collection progress.").addUserOption((option) => option.setName("user").setDescription("Optional target")),
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
    new SlashCommandBuilder().setName("partyquest").setDescription("Join a cooperative server expedition.")
      .addSubcommand((sub) => sub.setName("status").setDescription("View the active co-op expedition."))
      .addSubcommand((sub) => sub.setName("join").setDescription("Take a role in the co-op expedition.").addStringOption((option) => option.setName("role").setDescription("Expedition role").setRequired(true).addChoices(...PARTY_QUEST_ROLES.map((role) => ({ name: role.name, value: role.id }))))),
    new SlashCommandBuilder().setName("weather").setDescription("View this server's social mood weather."),
    new SlashCommandBuilder().setName("letter").setDescription("Receive an NPC faction letter about the server story."),
    new SlashCommandBuilder().setName("shrine").setDescription("Spend materials to restore the server artifact shrine."),
    new SlashCommandBuilder().setName("appreciate").setDescription("Recognize another member with low-pressure social reputation.")
      .addUserOption((option) => option.setName("user").setDescription("Member to appreciate").setRequired(true))
      .addStringOption((option) => option.setName("tag").setDescription("What you are appreciating").addChoices(...Object.entries(APPRECIATION_TAGS).map(([value, entry]) => ({ name: entry.label, value }))))
      .addStringOption((option) => option.setName("note").setDescription("Optional short note").setMaxLength(180)),
    new SlashCommandBuilder().setName("campfire").setDescription("Share memories, gratitude, and creative prompts.")
      .addSubcommand((sub) => sub.setName("status").setDescription("View the current campfire prompt."))
      .addSubcommand((sub) => sub.setName("share").setDescription("Add a memory, idea, or thanks to the server story.").addStringOption((option) => option.setName("text").setDescription("Memory, idea, or thanks").setRequired(true).setMaxLength(240))),
    new SlashCommandBuilder().setName("identity").setDescription("View or set this server's shared identity.")
      .addSubcommand((sub) => sub.setName("view").setDescription("View the server identity."))
      .addSubcommand((sub) => sub.setName("set").setDescription("Manager-only identity update.").addStringOption((option) => option.setName("motto").setDescription("Short server motto").setMaxLength(140)).addStringOption((option) => option.setName("symbol").setDescription("Server symbol, phrase, or emblem").setMaxLength(60)).addStringOption((option) => option.setName("values").setDescription("Comma-separated values").setMaxLength(180))),
    new SlashCommandBuilder().setName("faction").setDescription("Pledge, flex, and push the faction warboard.")
      .addSubcommand((sub) => sub.setName("status").setDescription("View faction influence and your pledge."))
      .addSubcommand((sub) => sub.setName("pledge").setDescription("Pledge to a faction.").addStringOption((option) => option.setName("faction").setDescription("Faction").setRequired(true).addChoices(...getFactionChoiceEntries())))
      .addSubcommand((sub) => sub.setName("strike").setDescription("Spend aura to push your pledged faction.")),
    new SlashCommandBuilder().setName("flex").setDescription("Post a public power and prestige flex card.").addUserOption((option) => option.setName("user").setDescription("Optional member to inspect")),
    new SlashCommandBuilder().setName("blackmarket").setDescription("Rotating high-heat prestige sink.")
      .addSubcommand((sub) => sub.setName("status").setDescription("View the current contraband drop."))
      .addSubcommand((sub) => sub.setName("buy").setDescription("Buy the current contraband drop.")),
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
    new SlashCommandBuilder().setName("leaderboard").setDescription("View top players and clans.").addStringOption((option) => option.setName("category").setDescription("Leaderboard type").setRequired(true).addChoices({ name: "aura", value: "aura" }, { name: "vault", value: "vault" }, { name: "xp", value: "xp" }, { name: "prestige", value: "prestige" }, { name: "pvp", value: "pvp" }, { name: "clans", value: "clans" })).addStringOption((option) => option.setName("scope").setDescription("Global or this server only").addChoices({ name: "global", value: "global" }, { name: "server", value: "server" })),
    new SlashCommandBuilder().setName("season").setDescription("View the current clan season standings."),
    new SlashCommandBuilder().setName("serverquest").setDescription("View the rotating community quest."),
    new SlashCommandBuilder().setName("project").setDescription("Build shared server projects with aura and materials.")
      .addSubcommand((sub) => sub.setName("status").setDescription("View the active server project."))
      .addSubcommand((sub) => sub.setName("contribute-aura").setDescription("Donate aura into the shared server project.").addIntegerOption((option) => option.setName("amount").setDescription("Aura to donate").setRequired(true).setMinValue(1)))
      .addSubcommand((sub) => sub.setName("contribute-material").setDescription("Donate crafting materials into the shared server project.").addStringOption((option) => option.setName("material").setDescription("Material to donate").setRequired(true).addChoices(...Object.entries(MATERIALS).map(([materialId, material]) => ({ name: material.name, value: materialId })))).addIntegerOption((option) => option.setName("amount").setDescription("Material quantity").setRequired(true).setMinValue(1))),
    new SlashCommandBuilder().setName("community").setDescription("View this server's shared identity and community progress."),
    new SlashCommandBuilder().setName("yearbook").setDescription("Generate a shareable monthly community yearbook card."),
    new SlashCommandBuilder().setName("challenge").setDescription("Run creator/community challenges.")
      .addSubcommand((sub) => sub.setName("status").setDescription("View the active creator challenge."))
      .addSubcommand((sub) => sub.setName("create").setDescription("Create a creator challenge for this server.").addStringOption((option) => option.setName("prompt").setDescription("Challenge prompt").setRequired(true).setMaxLength(300)).addStringOption((option) => option.setName("theme").setDescription("Challenge theme").setMaxLength(80)).addIntegerOption((option) => option.setName("days").setDescription("Days active").setMinValue(1).setMaxValue(30)))
      .addSubcommand((sub) => sub.setName("submit").setDescription("Submit a creator challenge entry.").addStringOption((option) => option.setName("text").setDescription("Link, caption, or short entry").setRequired(true).setMaxLength(240))),
    new SlashCommandBuilder().setName("memoryquest").setDescription("Build server lore from community memories.")
      .addSubcommand((sub) => sub.setName("status").setDescription("View the active memory quest."))
      .addSubcommand((sub) => sub.setName("contribute").setDescription("Add a memory to the active quest.").addStringOption((option) => option.setName("memory").setDescription("A short server memory").setRequired(true).setMaxLength(220))),
    new SlashCommandBuilder().setName("social").setDescription("View social reputation and community identity.").addUserOption((option) => option.setName("user").setDescription("Optional member")),
    new SlashCommandBuilder().setName("gallery").setDescription("Show this server's artifact and identity gallery."),
    new SlashCommandBuilder().setName("world").setDescription("Shape this server's living world.")
      .addSubcommand((sub) => sub.setName("status").setDescription("View factions, season, tension, and story log."))
      .addSubcommand((sub) => sub.setName("encounter").setDescription("Open the active procedural world encounter."))
      .addSubcommand((sub) => sub.setName("artifact").setDescription("View this server's unique evolving artifact."))
      .addSubcommand((sub) => sub.setName("recap").setDescription("Create a shareable recap of this server's story."))
      .addSubcommand((sub) => sub.setName("decide").setDescription("Resolve the active world encounter.").addStringOption((option) => option.setName("choice").setDescription("World choice").setRequired(true).addChoices(
        ...WORLD_ENCOUNTER_TEMPLATES.flatMap((template) => template.choices).map((choice) => ({ name: choice.label, value: choice.id }))
      ))),
    new SlashCommandBuilder().setName("ask").setDescription("Ask Aurix where to go in natural language.").addStringOption((option) => option.setName("text").setDescription("What do you want to do?").setRequired(true).setMaxLength(300)),
    new SlashCommandBuilder().setName("premium").setDescription("View your premium status."),
    new SlashCommandBuilder().setName("premium-chest").setDescription("Open your premium recurring loot chest."),
    new SlashCommandBuilder().setName("clan").setDescription("Manage your clan.").addSubcommand((sub) => sub.setName("create").setDescription("Create a clan for 50,000 aura.").addStringOption((option) => option.setName("name").setDescription("Clan name").setRequired(true))).addSubcommand((sub) => sub.setName("join").setDescription("Join a clan by code.").addStringOption((option) => option.setName("code").setDescription("Clan code").setRequired(true))).addSubcommand((sub) => sub.setName("apply").setDescription("Send a join request for approval.").addStringOption((option) => option.setName("code").setDescription("Clan code").setRequired(true))).addSubcommand((sub) => sub.setName("leave").setDescription("Leave your clan.")).addSubcommand((sub) => sub.setName("info").setDescription("View your clan.")).addSubcommand((sub) => sub.setName("members").setDescription("List clan members.")).addSubcommand((sub) => sub.setName("log").setDescription("View recent clan activity.")).addSubcommand((sub) => sub.setName("kick").setDescription("Owner-only member removal.").addUserOption((option) => option.setName("user").setDescription("Clan member").setRequired(true))).addSubcommand((sub) => sub.setName("approve").setDescription("Owner or officer request approval.").addUserOption((option) => option.setName("user").setDescription("Applicant").setRequired(true))).addSubcommand((sub) => sub.setName("decline").setDescription("Owner or officer reject an applicant.").addUserOption((option) => option.setName("user").setDescription("Applicant").setRequired(true))).addSubcommand((sub) => sub.setName("role").setDescription("Owner-only officer management.").addUserOption((option) => option.setName("user").setDescription("Clan member").setRequired(true)).addStringOption((option) => option.setName("role").setDescription("Role to set").setRequired(true).addChoices({ name: "officer", value: "officer" }, { name: "member", value: "member" }))).addSubcommand((sub) => sub.setName("transfer").setDescription("Owner-only leadership transfer.").addUserOption((option) => option.setName("user").setDescription("New owner").setRequired(true))).addSubcommand((sub) => sub.setName("disband").setDescription("Owner-only full clan deletion.")).addSubcommand((sub) => sub.setName("upgrade").setDescription("Spend clan vault aura on upgrades.").addStringOption((option) => option.setName("path").setDescription("Upgrade path").setRequired(true).addChoices({ name: "hall", value: "hall" }, { name: "vault", value: "vault" }, { name: "arsenal", value: "arsenal" }))).addSubcommand((sub) => sub.setName("raid").setDescription("Launch a cooldown-based clan raid.")).addSubcommand((sub) => sub.setName("donate").setDescription("Donate aura to your clan.").addIntegerOption((option) => option.setName("amount").setDescription("Amount").setRequired(true).setMinValue(1))).addSubcommand((sub) => sub.setName("war").setDescription("Fight another clan by code.").addStringOption((option) => option.setName("enemy").setDescription("Enemy clan code").setRequired(true))),
    new SlashCommandBuilder().setName("authority").setDescription("Rank-only blessing command.").addUserOption((option) => option.setName("user").setDescription("Target player").setRequired(true)),
  ].map((command) => command.toJSON());
}

async function routeInteraction(interaction) {
  const routeStartedAt = Date.now();
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

  if (interaction.isButton() && interaction.customId?.startsWith("quick:")) {
    return handleQuickActionButton(interaction);
  }

  if (interaction.isStringSelectMenu() && interaction.customId?.startsWith("gear:")) {
    const result = await handleGearComponentInteraction(interaction);
    await sendPendingRankUpMessages(interaction);
    return result;
  }

  if (interaction.isStringSelectMenu() && interaction.customId?.startsWith("forge:")) {
    const result = await handleForgeComponentInteraction(interaction);
    await sendPendingRankUpMessages(interaction);
    return result;
  }

  if (interaction.isButton() && interaction.customId?.startsWith("trade:")) {
    const result = await handleTradeButton(interaction);
    await sendPendingRankUpMessages(interaction);
    return result;
  }

  if (interaction.isButton() && interaction.customId?.startsWith("event:")) {
    const result = await handleEventButton(interaction);
    await sendPendingRankUpMessages(interaction);
    return result;
  }

  if (interaction.isButton() && interaction.customId?.startsWith("world:")) {
    const result = await handleWorldButton(interaction);
    await sendPendingRankUpMessages(interaction);
    return result;
  }

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

  if (!interaction.guildId) {
    return interaction.reply({
      ...buildEmbedPayload({
        title: "Server Only",
        description: "Aurix commands need to be used inside a Discord server.",
        visual: "emblem-alert.svg",
      }),
      ephemeral: true,
    });
  }

  const handlers = { help: handleHelp, event: handleEvent, setup: handleSetup, start: handleStart, tutorial: handleTutorial, profile: handleProfile, stats: handleStats, balance: handleBalance, work: handleWork, mine: handleMine, summon: handleSummon, claim: handleClaim, hint: handleHint, incense: handleIncense, burn: handleBurn, relic: handleRelic, spin: handleSpin, coinflip: handleCoinflip, rob: handleRob, bounty: handleBounty, daily: handleDaily, vote: handleVote, "premium-chest": handlePremiumChest, reminders: handleReminders, vault: handleVault, shop: handleShop, buy: handleBuy, roleshop: handleRoleShop, gift: handleGift, trade: handleTrade, inventory: handleInventory, collection: handleCollection, craft: handleCraft, forge: handleForge, "crafting-guide": handleCraftingGuide, garden: handleGarden, property: handleProperty, expedition: handleExpedition, partyquest: handlePartyQuest, weather: handleWeather, letter: handleLetter, shrine: handleShrine, appreciate: handleAppreciate, campfire: handleCampfire, identity: handleIdentity, faction: handleFaction, flex: handleFlex, blackmarket: handleBlackMarket, gear: handleGear, rank: handleRank, prestige: handlePrestige, achievements: handleAchievements, quests: handleQuests, crate: handleCrate, skills: handleSkills, pvp: handlePvp, boss: handleBoss, leaderboard: handleLeaderboard, season: handleSeason, serverquest: handleServerQuest, project: handleProject, community: handleCommunity, yearbook: handleYearbook, challenge: handleChallenge, memoryquest: handleMemoryQuest, social: handleSocial, gallery: handleGallery, world: handleWorld, ask: handleAsk, premium: handlePremium, clan: handleClan, authority: handleAuthority };
  const handler = handlers[interaction.commandName];
  if (!handler) {
    return interaction.reply({ content: "Unknown command.", ephemeral: true });
  }

  if (interaction.guildId && interaction.commandName !== "setup") {
    const settings = await getGuildSettings(interaction.guildId);
    const commandChannelId = getCommandChannelId(settings);
    if (commandChannelId && commandChannelId !== interaction.channelId) {
      return interaction.reply({
        ...buildEmbedPayload({
          title: "Aurix Channel",
          description: `Aurix commands are configured to work in <#${commandChannelId}> for this server.`,
          visual: "emblem-help.svg",
        }),
        ephemeral: true,
      });
    }

    const user = await getOrCreatePlayer(interaction.guildId, interaction.user.id);
    await rememberPlayerContext(user, interaction);
    await user.save();
  }

  try {
    const result = await handler(interaction);
    const subcommand = interaction.options?.getSubcommand?.(false) || null;
    await runPostCommandEngagement(interaction, interaction.commandName, subcommand);
    await sendPendingRankUpMessages(interaction);
    eventBus.publish("interaction.completed", {
      guildId: interaction.guildId,
      userId: interaction.user?.id || null,
      commandName: interaction.commandName,
      durationMs: Date.now() - routeStartedAt,
      metadata: { subcommand },
    });
    return result;
  } catch (error) {
    eventBus.publish("interaction.failed", {
      guildId: interaction.guildId,
      userId: interaction.user?.id || null,
      commandName: interaction.commandName,
      durationMs: Date.now() - routeStartedAt,
      metadata: { message: error?.message || String(error) },
    });
    throw error;
  }
}

module.exports = {
  applyTopggVoteWebhookEvent,
  applyPaddleWebhookEvent,
  buildCommands,
  recentInteractions,
  handleChatRelicSpawnMessage,
  routeInteraction,
  sendServerJoinMessage,
  sendServerSetupMessage,
  startReminderLoop,
  startRelicSpawnLoop,
};
