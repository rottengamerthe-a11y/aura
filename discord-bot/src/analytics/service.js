const { AnalyticsEvent, GuildSettings, User } = require("../data/models");

const ANALYTICS_SAMPLE_RATE = Math.max(0, Math.min(1, Number(process.env.AURIX_ANALYTICS_SAMPLE_RATE) || 1));
const MAX_METADATA_KEYS = 24;

function shouldSample(type) {
  if (type === "error" || type === "economy_snapshot") {
    return true;
  }
  return Math.random() <= ANALYTICS_SAMPLE_RATE;
}

function sanitizeMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value) || value === null)
      .slice(0, MAX_METADATA_KEYS)
  );
}

async function recordAnalyticsEvent(type, payload = {}) {
  if (!shouldSample(type)) {
    return null;
  }
  return AnalyticsEvent.create({
    type,
    guildId: payload.guildId || null,
    userId: payload.userId || null,
    commandName: payload.commandName || null,
    customId: payload.customId || null,
    ok: payload.ok !== false,
    durationMs: Math.max(0, Math.floor(Number(payload.durationMs) || 0)),
    metadata: sanitizeMetadata(payload.metadata),
  }).catch((error) => {
    console.error("Analytics write failed:", error.message || error);
    return null;
  });
}

async function getGuildAnalyticsSummary(guildId, days = 7) {
  const since = new Date(Date.now() - Math.max(1, Math.min(90, Number(days) || 7)) * 24 * 60 * 60 * 1000);
  const [commandRows, totalEvents, activeUsers, economy, settings] = await Promise.all([
    AnalyticsEvent.aggregate([
      { $match: { guildId, createdAt: { $gte: since }, commandName: { $ne: null } } },
      { $group: { _id: "$commandName", count: { $sum: 1 }, avgDurationMs: { $avg: "$durationMs" }, errors: { $sum: { $cond: ["$ok", 0, 1] } } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]),
    AnalyticsEvent.countDocuments({ guildId, createdAt: { $gte: since } }),
    AnalyticsEvent.distinct("userId", { guildId, userId: { $ne: null }, createdAt: { $gte: since } }),
    User.aggregate([
      { $match: { guildId } },
      {
        $group: {
          _id: null,
          players: { $sum: 1 },
          totalAura: { $sum: "$aura" },
          totalVaultAura: { $sum: "$vaultAura" },
          avgXp: { $avg: "$xp" },
        },
      },
    ]),
    GuildSettings.findOne({ guildId }).lean(),
  ]);

  return {
    guildId,
    since: since.toISOString(),
    totalEvents,
    activeUsers: activeUsers.filter(Boolean).length,
    commands: commandRows.map((row) => ({
      name: row._id,
      count: row.count,
      avgDurationMs: Math.round(row.avgDurationMs || 0),
      errors: row.errors,
    })),
    economy: economy[0] || { players: 0, totalAura: 0, totalVaultAura: 0, avgXp: 0 },
    community: settings?.community || null,
    worldState: settings?.worldState || null,
  };
}

function attachAnalyticsSubscribers(eventBus) {
  eventBus.subscribe("interaction.completed", (event) => {
    recordAnalyticsEvent("interaction", event.payload);
  });
  eventBus.subscribe("interaction.failed", (event) => {
    recordAnalyticsEvent("error", { ...event.payload, ok: false });
  });
  eventBus.subscribe("economy.changed", (event) => {
    recordAnalyticsEvent("economy_snapshot", event.payload);
  });
  eventBus.subscribe("world.choice_resolved", (event) => {
    recordAnalyticsEvent("world_choice", event.payload);
  });
  eventBus.subscribe("yearbook.generated", (event) => {
    recordAnalyticsEvent("yearbook", event.payload);
  });
  eventBus.subscribe("challenge.entry_submitted", (event) => {
    recordAnalyticsEvent("creator_challenge", event.payload);
  });
  eventBus.subscribe("memoryquest.contributed", (event) => {
    recordAnalyticsEvent("memoryquest", event.payload);
  });
  eventBus.subscribe("partyquest.joined", (event) => {
    recordAnalyticsEvent("partyquest", event.payload);
  });
  eventBus.subscribe("shrine.restored", (event) => {
    recordAnalyticsEvent("shrine", event.payload);
  });
  eventBus.subscribe("appreciation.created", (event) => {
    recordAnalyticsEvent("appreciation", event.payload);
  });
  eventBus.subscribe("campfire.shared", (event) => {
    recordAnalyticsEvent("campfire", event.payload);
  });
  eventBus.subscribe("identity.updated", (event) => {
    recordAnalyticsEvent("identity", event.payload);
  });
  eventBus.subscribe("faction.strike", (event) => {
    recordAnalyticsEvent("faction_strike", event.payload);
  });
  eventBus.subscribe("blackmarket.bought", (event) => {
    recordAnalyticsEvent("blackmarket", event.payload);
  });
  eventBus.subscribe("heist.resolved", (event) => {
    recordAnalyticsEvent("heist", event.payload);
  });
  eventBus.subscribe("bounty.placed", (event) => {
    recordAnalyticsEvent("bounty", event.payload);
  });
}

module.exports = { attachAnalyticsSubscribers, getGuildAnalyticsSummary, recordAnalyticsEvent };
