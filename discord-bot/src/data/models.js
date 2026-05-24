const mongoose = require("mongoose");

const questSchema = new mongoose.Schema(
  {
    id: String,
    name: String,
    description: String,
    metric: String,
    goal: Number,
    progress: { type: Number, default: 0 },
    rewardAura: Number,
    rewardXp: Number,
    completed: { type: Boolean, default: false },
  },
  { _id: false }
);

const inventoryEntrySchema = new mongoose.Schema(
  {
    id: String,
    quantity: { type: Number, default: 0 },
  },
  { _id: false }
);

const relicEntrySchema = new mongoose.Schema(
  {
    id: String,
    quantity: { type: Number, default: 0 },
    firstPrint: { type: Number, default: null },
    bestPrint: { type: Number, default: null },
    shiny: { type: Number, default: 0 },
    lastPrintAt: { type: Date, default: null },
  },
  { _id: false }
);

const gardenPlotSchema = new mongoose.Schema(
  {
    cropId: String,
    plantedAt: { type: Date, default: null },
  },
  { _id: false }
);

const propertyEntrySchema = new mongoose.Schema(
  {
    level: { type: Number, default: 1 },
    lastClaimAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const expeditionSchema = new mongoose.Schema(
  {
    type: { type: String, default: null },
    startedAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
  },
  { _id: false }
);

const clanLogEntrySchema = new mongoose.Schema(
  {
    type: String,
    actorId: String,
    targetId: String,
    details: String,
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const activeEventSchema = new mongoose.Schema(
  {
    id: { type: String, default: null },
    name: { type: String, default: null },
    description: { type: String, default: null },
    rewardAura: { type: Number, default: 0 },
    rewardXp: { type: Number, default: 0 },
    activity: { type: mongoose.Schema.Types.Mixed, default: null },
    expiresAt: { type: Date, default: null },
    claimedUserIds: { type: [String], default: [] },
    attemptedUserIds: { type: [String], default: [] },
  },
  { _id: false }
);

const serverProjectContributorSchema = new mongoose.Schema(
  {
    userId: String,
    aura: { type: Number, default: 0 },
    materials: { type: Number, default: 0 },
  },
  { _id: false }
);

const serverProjectSchema = new mongoose.Schema(
  {
    id: { type: String, default: null },
    name: { type: String, default: null },
    description: { type: String, default: null },
    auraGoal: { type: Number, default: 0 },
    materialGoal: { type: Number, default: 0 },
    aura: { type: Number, default: 0 },
    materials: { type: Map, of: Number, default: {} },
    contributors: { type: [serverProjectContributorSchema], default: [] },
    completedAt: { type: Date, default: null },
    startedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const communityIdentitySchema = new mongoose.Schema(
  {
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    motto: { type: String, default: null },
    symbol: { type: String, default: null },
    values: { type: [String], default: [] },
    completedProjects: { type: Number, default: 0 },
    totalAuraContributed: { type: Number, default: 0 },
    totalMaterialsContributed: { type: Number, default: 0 },
    lastProjectCompletedAt: { type: Date, default: null },
  },
  { _id: false }
);

const worldFactionSchema = new mongoose.Schema(
  {
    id: String,
    name: String,
    influence: { type: Number, default: 50 },
    reputation: { type: Number, default: 0 },
  },
  { _id: false }
);

const worldEncounterChoiceSchema = new mongoose.Schema(
  {
    id: String,
    label: String,
    factionId: String,
    text: String,
    influenceDelta: { type: Number, default: 0 },
  },
  { _id: false }
);

const worldEncounterSchema = new mongoose.Schema(
  {
    id: { type: String, default: null },
    title: { type: String, default: null },
    description: { type: String, default: null },
    seasonId: { type: String, default: null },
    choices: { type: [worldEncounterChoiceSchema], default: [] },
    resolvedBy: { type: String, default: null },
    resolvedChoiceId: { type: String, default: null },
    expiresAt: { type: Date, default: null },
  },
  { _id: false }
);

const worldStoryEntrySchema = new mongoose.Schema(
  {
    title: String,
    text: String,
    actorId: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const worldArtifactSchema = new mongoose.Schema(
  {
    name: { type: String, default: null },
    form: { type: String, default: null },
    tone: { type: String, default: null },
    power: { type: Number, default: 1 },
    traits: { type: [String], default: [] },
    lastChangedAt: { type: Date, default: null },
  },
  { _id: false }
);

const worldStateSchema = new mongoose.Schema(
  {
    seasonId: { type: String, default: null },
    seasonName: { type: String, default: null },
    tension: { type: Number, default: 0 },
    factions: { type: [worldFactionSchema], default: [] },
    activeEncounter: { type: worldEncounterSchema, default: null },
    artifact: { type: worldArtifactSchema, default: null },
    storyLog: { type: [worldStoryEntrySchema], default: [] },
    lastEncounterAt: { type: Date, default: null },
  },
  { _id: false }
);

const creatorChallengeEntrySchema = new mongoose.Schema(
  {
    userId: String,
    text: String,
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const creatorChallengeSchema = new mongoose.Schema(
  {
    prompt: { type: String, default: null },
    theme: { type: String, default: null },
    createdBy: { type: String, default: null },
    createdAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    entries: { type: [creatorChallengeEntrySchema], default: [] },
  },
  { _id: false }
);

const memoryQuestContributorSchema = new mongoose.Schema(
  {
    userId: String,
    amount: { type: Number, default: 0 },
  },
  { _id: false }
);

const memoryQuestSchema = new mongoose.Schema(
  {
    id: { type: String, default: null },
    title: { type: String, default: null },
    description: { type: String, default: null },
    goal: { type: Number, default: 0 },
    progress: { type: Number, default: 0 },
    contributors: { type: [memoryQuestContributorSchema], default: [] },
    completedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const yearbookHighlightSchema = new mongoose.Schema(
  {
    category: String,
    userId: String,
    label: String,
    score: { type: Number, default: 0 },
  },
  { _id: false }
);

const yearbookSchema = new mongoose.Schema(
  {
    monthId: { type: String, default: null },
    generatedAt: { type: Date, default: null },
    highlights: { type: [yearbookHighlightSchema], default: [] },
  },
  { _id: false }
);

const appreciationSchema = new mongoose.Schema(
  {
    fromUserId: String,
    toUserId: String,
    tag: { type: String, default: "kindness" },
    note: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const partyQuestRoleSchema = new mongoose.Schema(
  {
    role: String,
    userId: { type: String, default: null },
  },
  { _id: false }
);

const partyQuestSchema = new mongoose.Schema(
  {
    id: { type: String, default: null },
    title: { type: String, default: null },
    description: { type: String, default: null },
    roles: { type: [partyQuestRoleSchema], default: [] },
    progress: { type: Number, default: 0 },
    goal: { type: Number, default: 4 },
    expiresAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const bountySchema = new mongoose.Schema(
  {
    bountyId: String,
    targetUserId: String,
    placedByUserId: String,
    amount: { type: Number, default: 0 },
    reason: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null },
    claimedByUserId: { type: String, default: null },
    claimedAt: { type: Date, default: null },
  },
  { _id: false }
);

const activeRelicSpawnSchema = new mongoose.Schema(
  {
    relicId: { type: String, default: null },
    relicName: { type: String, default: null },
    rarity: { type: String, default: null },
    spawnedAt: { type: Date, default: null },
    spawnedBy: { type: String, default: null },
    hintUses: { type: Number, default: 0 },
  },
  { _id: false }
);

const relicSpawnStateSchema = new mongoose.Schema(
  {
    current: { type: activeRelicSpawnSchema, default: null },
    incenseRemaining: { type: Number, default: 0 },
    lastIncenseSpawnAt: { type: Date, default: null },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    guildId: { type: String, index: true },
    userId: String,
    aura: { type: Number, default: 1200 },
    vaultAura: { type: Number, default: 0 },
    xp: { type: Number, default: 0 },
    rankIndex: { type: Number, default: 0 },
    prestige: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    lastDailyAt: { type: Date, default: null },
    lastAppreciateAt: { type: Date, default: null },
    lastFactionStrikeAt: { type: Date, default: null },
    lastFlexAt: { type: Date, default: null },
    lastSpinAt: { type: Date, default: null },
    lastCoinflipAt: { type: Date, default: null },
    lastWorkAt: { type: Date, default: null },
    lastRobAt: { type: Date, default: null },
    lastMineAt: { type: Date, default: null },
    lastSummonAt: { type: Date, default: null },
    lastBossAt: { type: Date, default: null },
    lastAuthorityAt: { type: Date, default: null },
    protectionUntil: { type: Date, default: null },
    revengeTargetId: { type: String, default: null },
    revengeExpiresAt: { type: Date, default: null },
    notoriety: { type: Number, default: 0 },
    lastVaultInterestAt: { type: Date, default: null },
    vaultInterestRemainder: { type: Number, default: 0 },
    inventory: { type: [inventoryEntrySchema], default: [] },
    relics: { type: [relicEntrySchema], default: [] },
    gardenPlots: { type: [gardenPlotSchema], default: [{ cropId: null, plantedAt: null }, { cropId: null, plantedAt: null }] },
    ownedPerks: { type: [String], default: [] },
    skills: { type: [String], default: ["focus"] },
    equippedGear: {
      tool: { type: String, default: null },
      charm: { type: String, default: null },
      relic: { type: String, default: null },
    },
    gearUpgrades: { type: Map, of: Number, default: {} },
    gearDurability: { type: Map, of: Number, default: {} },
    properties: { type: Map, of: propertyEntrySchema, default: {} },
    expedition: { type: expeditionSchema, default: () => ({ type: null, startedAt: null, endsAt: null }) },
    cosmetics: {
      activeTitle: { type: String, default: null },
      activeFrame: { type: String, default: null },
      ownedTitles: { type: [String], default: [] },
      ownedFrames: { type: [String], default: [] },
    },
    faction: {
      id: { type: String, default: null },
      pledgedAt: { type: Date, default: null },
    },
    blackMarketPurchases: { type: [String], default: [] },
    crates: { type: Map, of: Number, default: {} },
    quests: { type: [questSchema], default: [] },
    claimedAchievements: { type: [String], default: [] },
    announcedMilestones: { type: [String], default: [] },
    tutorial: {
      step: { type: Number, default: 0 },
      completed: { type: Boolean, default: false },
      claimedSteps: { type: [String], default: [] },
    },
    premium: {
      active: { type: Boolean, default: false },
      expiresAt: { type: Date, default: null },
      lifetime: { type: Boolean, default: false },
      grantedBy: { type: String, default: null },
      source: { type: String, default: null },
      lastAnnouncementEventId: { type: String, default: null },
      lastWelcomeGrantEventId: { type: String, default: null },
      lastChestAt: { type: Date, default: null },
    },
    topgg: {
      voteCount: { type: Number, default: 0 },
      voteWeight: { type: Number, default: 0 },
      lastVoteAt: { type: Date, default: null },
      nextVoteAt: { type: Date, default: null },
      lastPromptAt: { type: Date, default: null },
      lastVoteEventId: { type: String, default: null },
    },
    billing: {
      provider: { type: String, default: null },
      paddleCustomerId: { type: String, default: null },
      paddleSubscriptionId: { type: String, default: null },
      paddleTransactionId: { type: String, default: null },
      paddlePriceId: { type: String, default: null },
      paddleLastEventId: { type: String, default: null },
      paddlePlanId: { type: String, default: null },
      paddleStatus: { type: String, default: null },
      paddleGrantedTransactionIds: { type: [String], default: [] },
    },
    stats: {
      spins: { type: Number, default: 0 },
      works: { type: Number, default: 0 },
      mines: { type: Number, default: 0 },
      summons: { type: Number, default: 0 },
      relicsBurned: { type: Number, default: 0 },
      crafts: { type: Number, default: 0 },
      harvests: { type: Number, default: 0 },
      coinflips: { type: Number, default: 0 },
      robWins: { type: Number, default: 0 },
      robLosses: { type: Number, default: 0 },
      pvpWins: { type: Number, default: 0 },
      pvpLosses: { type: Number, default: 0 },
      pvpStreak: { type: Number, default: 0 },
      bestPvpStreak: { type: Number, default: 0 },
      bossWins: { type: Number, default: 0 },
      bossLosses: { type: Number, default: 0 },
      vaultDeposit: { type: Number, default: 0 },
      shopBuys: { type: Number, default: 0 },
      giftsSent: { type: Number, default: 0 },
      appreciationsGiven: { type: Number, default: 0 },
      appreciationsReceived: { type: Number, default: 0 },
      campfireShares: { type: Number, default: 0 },
      flexes: { type: Number, default: 0 },
      factionStrikes: { type: Number, default: 0 },
      blackMarketBuys: { type: Number, default: 0 },
      bountiesPlaced: { type: Number, default: 0 },
      bountiesClaimed: { type: Number, default: 0 },
      projectContributions: { type: Number, default: 0 },
    },
    reminders: {
      guildId: { type: String, default: null },
      channelId: { type: String, default: null },
      enabledActions: { type: [String], default: [] },
      lastNotifiedAt: { type: Map, of: Date, default: {} },
    },
    relicHuntStreaks: { type: Map, of: Number, default: {} },
    reputation: { type: Map, of: Number, default: {} },
    botContext: {
      lastGuildId: { type: String, default: null },
      lastChannelId: { type: String, default: null },
    },
    clanId: { type: mongoose.Schema.Types.ObjectId, ref: "Clan", default: null },
    clanMemberships: { type: Map, of: mongoose.Schema.Types.ObjectId, default: {} },
  },
  { timestamps: true }
);

userSchema.index({ guildId: 1, userId: 1 }, { unique: true });
userSchema.index(
  { userId: 1 },
  {
    unique: true,
    partialFilterExpression: { guildId: { $exists: false } },
  }
);

const clanSchema = new mongoose.Schema(
  {
    guildId: { type: String, index: true },
    name: String,
    code: String,
    ownerId: String,
    memberIds: { type: [String], default: [] },
    officerIds: { type: [String], default: [] },
    pendingApplicantIds: { type: [String], default: [] },
    log: { type: [clanLogEntrySchema], default: [] },
    level: { type: Number, default: 1 },
    upgrades: {
      hall: { type: Number, default: 1 },
      vault: { type: Number, default: 1 },
      arsenal: { type: Number, default: 1 },
    },
    vaultAura: { type: Number, default: 0 },
    trophies: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    raidWins: { type: Number, default: 0 },
    raidLosses: { type: Number, default: 0 },
    lastRaidAt: { type: Date, default: null },
  },
  { timestamps: true }
);

clanSchema.index({ guildId: 1, code: 1 });
clanSchema.index({ code: 1 });

const paddleWebhookLogSchema = new mongoose.Schema(
  {
    ok: { type: Boolean, default: false },
    error: { type: String, default: null },
    eventType: { type: String, default: null },
    eventId: { type: String, default: null },
    customData: { type: mongoose.Schema.Types.Mixed, default: null },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

const topggVoteLogSchema = new mongoose.Schema(
  {
    eventId: { type: String, default: null },
    voteKey: { type: String, default: null },
    userId: { type: String, required: true, index: true },
    voteType: { type: String, default: null },
    weight: { type: Number, default: 1 },
    projectId: { type: String, default: null },
    projectPlatformId: { type: String, default: null },
    source: { type: String, default: "topgg" },
    reward: { type: mongoose.Schema.Types.Mixed, default: null },
    payload: { type: mongoose.Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

topggVoteLogSchema.index(
  { eventId: 1 },
  {
    unique: true,
    partialFilterExpression: { eventId: { $type: "string" } },
  }
);
topggVoteLogSchema.index(
  { voteKey: 1 },
  {
    unique: true,
    partialFilterExpression: { voteKey: { $type: "string" } },
  }
);

const pvpInviteSchema = new mongoose.Schema(
  {
    battleId: { type: String, required: true, unique: true, index: true },
    guildId: { type: String, default: null },
    channelId: { type: String, default: null },
    messageId: { type: String, default: null },
    challengerId: { type: String, required: true },
    challengerName: { type: String, required: true },
    opponentId: { type: String, required: true },
    opponentName: { type: String, required: true },
    arena: { type: mongoose.Schema.Types.Mixed, default: null },
    inviteExpiresAt: { type: Date, required: true, index: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

const pvpMatchmakingQueueSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    guildId: { type: String, default: null },
    channelId: { type: String, required: true },
    messageId: { type: String, default: null },
    displayName: { type: String, required: true },
    joinedAt: { type: Date, default: Date.now, index: true },
    expiresAt: { type: Date, required: true, index: true },
  },
  { versionKey: false }
);

const battleSessionSchema = new mongoose.Schema(
  {
    battleId: { type: String, required: true, unique: true, index: true },
    state: { type: mongoose.Schema.Types.Mixed, required: true },
    expiresAt: { type: Date, required: true, index: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

const guildSettingsSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    aurixChannelId: { type: String, default: null },
    commandChannelId: { type: String, default: null },
    dropsChannelId: { type: String, default: null },
    configuredBy: { type: String, default: null },
    configuredAt: { type: Date, default: null },
    activeEvent: { type: activeEventSchema, default: null },
    recentEventIds: { type: [String], default: [] },
    serverProject: { type: serverProjectSchema, default: null },
    community: { type: communityIdentitySchema, default: () => ({}) },
    worldState: { type: worldStateSchema, default: () => ({}) },
    creatorChallenge: { type: creatorChallengeSchema, default: () => ({}) },
    memoryQuest: { type: memoryQuestSchema, default: null },
    yearbook: { type: yearbookSchema, default: () => ({}) },
    partyQuest: { type: partyQuestSchema, default: null },
    appreciations: { type: [appreciationSchema], default: [] },
    bounties: { type: [bountySchema], default: [] },
    relicSpawn: { type: relicSpawnStateSchema, default: () => ({ current: null, incenseRemaining: 0, lastIncenseSpawnAt: null }) },
    lastEventSpawnAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const tradeOfferSchema = new mongoose.Schema(
  {
    guildId: { type: String, default: null, index: true },
    offerId: { type: String, required: true, unique: true, index: true },
    fromUserId: { type: String, required: true, index: true },
    toUserId: { type: String, required: true, index: true },
    aura: { type: Number, default: 0 },
    itemId: { type: String, default: null },
    quantity: { type: Number, default: 0 },
    status: { type: String, default: "pending", index: true },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

const collectiblePrintCounterSchema = new mongoose.Schema(
  {
    itemId: { type: String, required: true, unique: true, index: true },
    count: { type: Number, default: 0 },
  },
  { versionKey: false }
);

const roleListingSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    roleId: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    price: { type: Number, required: true, min: 1 },
    enabled: { type: Boolean, default: true, index: true },
    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
    purchaseCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

roleListingSchema.index({ guildId: 1, roleId: 1 }, { unique: true });

const rolePurchaseSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: "RoleListing", required: true },
    roleId: { type: String, required: true },
    price: { type: Number, required: true },
    purchasedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

rolePurchaseSchema.index({ guildId: 1, userId: 1, roleId: 1 });

const analyticsEventSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, index: true },
    guildId: { type: String, default: null, index: true },
    userId: { type: String, default: null, index: true },
    commandName: { type: String, default: null, index: true },
    customId: { type: String, default: null },
    ok: { type: Boolean, default: true, index: true },
    durationMs: { type: Number, default: 0 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

analyticsEventSchema.index({ guildId: 1, createdAt: -1 });
analyticsEventSchema.index({ commandName: 1, createdAt: -1 });

const User = mongoose.models.User || mongoose.model("User", userSchema);
const AnalyticsEvent = mongoose.models.AnalyticsEvent || mongoose.model("AnalyticsEvent", analyticsEventSchema);
const BattleSession = mongoose.models.BattleSession || mongoose.model("BattleSession", battleSessionSchema);
const Clan = mongoose.models.Clan || mongoose.model("Clan", clanSchema);
const CollectiblePrintCounter = mongoose.models.CollectiblePrintCounter || mongoose.model("CollectiblePrintCounter", collectiblePrintCounterSchema);
const GuildSettings = mongoose.models.GuildSettings || mongoose.model("GuildSettings", guildSettingsSchema);
const PaddleWebhookLog = mongoose.models.PaddleWebhookLog || mongoose.model("PaddleWebhookLog", paddleWebhookLogSchema);
const PvpInvite = mongoose.models.PvpInvite || mongoose.model("PvpInvite", pvpInviteSchema);
const PvpMatchmakingQueue = mongoose.models.PvpMatchmakingQueue || mongoose.model("PvpMatchmakingQueue", pvpMatchmakingQueueSchema);
const RoleListing = mongoose.models.RoleListing || mongoose.model("RoleListing", roleListingSchema);
const RolePurchase = mongoose.models.RolePurchase || mongoose.model("RolePurchase", rolePurchaseSchema);
const TopggVoteLog = mongoose.models.TopggVoteLog || mongoose.model("TopggVoteLog", topggVoteLogSchema);
const TradeOffer = mongoose.models.TradeOffer || mongoose.model("TradeOffer", tradeOfferSchema);

module.exports = { AnalyticsEvent, BattleSession, Clan, CollectiblePrintCounter, GuildSettings, PaddleWebhookLog, PvpInvite, PvpMatchmakingQueue, RoleListing, RolePurchase, TopggVoteLog, TradeOffer, User };
