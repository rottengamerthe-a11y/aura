const { User } = require("../data/models");

const DEFAULT_POLICY = Object.freeze({
  faucetMultiplier: 1,
  sinkMultiplier: 1,
  newPlayerBoost: 1.15,
  whaleDamping: 0.85,
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function calculateServerEconomyPolicy(guildId) {
  const rows = await User.aggregate([
    { $match: { guildId, xp: { $gt: 0 } } },
    {
      $project: {
        aura: { $ifNull: ["$aura", 0] },
        vaultAura: { $ifNull: ["$vaultAura", 0] },
        total: { $add: [{ $ifNull: ["$aura", 0] }, { $ifNull: ["$vaultAura", 0] }] },
      },
    },
    {
      $group: {
        _id: null,
        players: { $sum: 1 },
        totalAura: { $sum: "$aura" },
        totalVaultAura: { $sum: "$vaultAura" },
        maxHoldings: { $max: "$total" },
        avgHoldings: { $avg: "$total" },
      },
    },
  ]);

  const economy = rows[0] || {};
  const players = economy.players || 0;
  if (players < 5) {
    return { ...DEFAULT_POLICY, reason: "small_server", economy: { players } };
  }

  const wealthGap = economy.avgHoldings > 0 ? economy.maxHoldings / economy.avgHoldings : 1;
  const inflationPressure = (economy.totalAura + economy.totalVaultAura) / Math.max(1, players);
  const faucetMultiplier = clamp(1 - Math.max(0, wealthGap - 6) * 0.03 - Math.max(0, inflationPressure - 250000) / 2500000, 0.55, 1.1);
  const sinkMultiplier = clamp(1 + Math.max(0, wealthGap - 4) * 0.04 + Math.max(0, inflationPressure - 200000) / 1600000, 1, 1.8);

  return {
    faucetMultiplier,
    sinkMultiplier,
    newPlayerBoost: DEFAULT_POLICY.newPlayerBoost,
    whaleDamping: clamp(1 - Math.max(0, wealthGap - 5) * 0.025, 0.65, 1),
    reason: "dynamic",
    economy: {
      players,
      totalAura: Math.floor(economy.totalAura || 0),
      totalVaultAura: Math.floor(economy.totalVaultAura || 0),
      maxHoldings: Math.floor(economy.maxHoldings || 0),
      avgHoldings: Math.floor(economy.avgHoldings || 0),
      wealthGap: Number(wealthGap.toFixed(2)),
      inflationPressure: Math.floor(inflationPressure),
    },
  };
}

module.exports = { calculateServerEconomyPolicy };
