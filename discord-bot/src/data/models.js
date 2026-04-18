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

const gardenPlotSchema = new mongoose.Schema(
  {
    cropId: String,
    plantedAt: { type: Date, default: null },
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

const userSchema = new mongoose.Schema(
  {
    guildId: { type: String, index: true },
    userId: { type: String, index: true },
    aura: { type: Number, default: 1200 },
    vaultAura: { type: Number, default: 0 },
    xp: { type: Number, default: 0 },
    rankIndex: { type: Number, default: 0 },
    prestige: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    lastDailyAt: { type: Date, default: null },
    lastSpinAt: { type: Date, default: null },
    lastCoinflipAt: { type: Date, default: null },
    lastWorkAt: { type: Date, default: null },
    lastRobAt: { type: Date, default: null },
    lastMineAt: { type: Date, default: null },
    lastAuthorityAt: { type: Date, default: null },
    lastVaultInterestAt: { type: Date, default: null },
    inventory: { type: [inventoryEntrySchema], default: [] },
    gardenPlots: { type: [gardenPlotSchema], default: [{ cropId: null, plantedAt: null }, { cropId: null, plantedAt: null }] },
    ownedPerks: { type: [String], default: [] },
    skills: { type: [String], default: ["focus"] },
    equippedGear: {
      tool: { type: String, default: null },
      charm: { type: String, default: null },
      relic: { type: String, default: null },
    },
    crates: { type: Map, of: Number, default: {} },
    quests: { type: [questSchema], default: [] },
    claimedAchievements: { type: [String], default: [] },
    premium: {
      active: { type: Boolean, default: false },
      expiresAt: { type: Date, default: null },
      lifetime: { type: Boolean, default: false },
      grantedBy: { type: String, default: null },
      source: { type: String, default: null },
    },
    billing: {
      provider: { type: String, default: null },
      razorpayPaymentLinkId: { type: String, default: null },
      razorpayPaymentId: { type: String, default: null },
      razorpayOrderId: { type: String, default: null },
      razorpayReferenceId: { type: String, default: null },
      razorpayLastEventId: { type: String, default: null },
      razorpayPlanId: { type: String, default: null },
      razorpayLinkStatus: { type: String, default: null },
    },
    stats: {
      spins: { type: Number, default: 0 },
      works: { type: Number, default: 0 },
      mines: { type: Number, default: 0 },
      crafts: { type: Number, default: 0 },
      harvests: { type: Number, default: 0 },
      coinflips: { type: Number, default: 0 },
      robWins: { type: Number, default: 0 },
      robLosses: { type: Number, default: 0 },
      pvpWins: { type: Number, default: 0 },
      pvpLosses: { type: Number, default: 0 },
      bossWins: { type: Number, default: 0 },
      bossLosses: { type: Number, default: 0 },
      vaultDeposit: { type: Number, default: 0 },
      shopBuys: { type: Number, default: 0 },
    },
    clanId: { type: mongoose.Schema.Types.ObjectId, ref: "Clan", default: null },
    clanMemberships: { type: Map, of: mongoose.Schema.Types.ObjectId, default: {} },
  },
  { timestamps: true }
);

userSchema.index({ guildId: 1, userId: 1 }, { unique: true });

const clanSchema = new mongoose.Schema(
  {
    guildId: { type: String, index: true },
    name: String,
    code: { type: String, index: true },
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

const User = mongoose.models.User || mongoose.model("User", userSchema);
const Clan = mongoose.models.Clan || mongoose.model("Clan", clanSchema);

module.exports = { Clan, User };
