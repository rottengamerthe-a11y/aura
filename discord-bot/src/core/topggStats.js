const TOPGG_STATS_INTERVAL_MS = Number(process.env.TOPGG_STATS_INTERVAL_MS) || 30 * 60 * 1000;
const TOPGG_STATS_DEBOUNCE_MS = 60 * 1000;

const recentTopggStatsPosts = [];
let topggStatsTimer = null;
let topggStatsDebounceTimer = null;
let topggStatsPosting = false;
let topggStatsConfigWarningShown = false;

function getTopggApiToken() {
  return process.env.TOPGG_TOKEN?.trim()
    || process.env.TOPGG_API_TOKEN?.trim()
    || process.env.TOPGG_STATS_TOKEN?.trim()
    || null;
}

function rememberTopggStatsPost(entry) {
  recentTopggStatsPosts.unshift({
    at: new Date().toISOString(),
    ...entry,
  });
  recentTopggStatsPosts.splice(20);
}

async function getDiscordGuildStats(client) {
  if (client.shard) {
    const shardGuildCounts = await client.shard.fetchClientValues("guilds.cache.size");
    const shards = shardGuildCounts.map((count) => Number(count) || 0);
    return {
      serverCount: shards.reduce((sum, count) => sum + count, 0),
      shards,
      shardCount: shards.length,
    };
  }

  return {
    serverCount: client.guilds.cache.size,
    shards: [],
    shardCount: 1,
  };
}

async function postTopggStats(client, reason = "scheduled") {
  if (!client?.isReady?.() || topggStatsPosting) {
    return null;
  }

  const token = getTopggApiToken();
  const botId = process.env.TOPGG_BOT_ID?.trim() || process.env.DISCORD_CLIENT_ID?.trim();
  if (!token || !botId) {
    if (!topggStatsConfigWarningShown) {
      topggStatsConfigWarningShown = true;
      console.warn(
        `Top.gg stats posting is disabled: ${!token ? "missing TOPGG_TOKEN/TOPGG_API_TOKEN/TOPGG_STATS_TOKEN" : "missing TOPGG_BOT_ID/DISCORD_CLIENT_ID"}.`
      );
    }
    rememberTopggStatsPost({
      ok: false,
      reason,
      skipped: true,
      error: !token ? "missing_topgg_token" : "missing_bot_id",
    });
    return null;
  }

  topggStatsPosting = true;
  try {
    const stats = await getDiscordGuildStats(client);
    const body = {
      server_count: stats.shards.length ? stats.shards : stats.serverCount,
      shard_count: stats.shardCount,
    };

    const response = await fetch(`https://top.gg/api/bots/${botId}/stats`, {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const payload = await response.text().catch(() => "");
    const entry = {
      ok: response.ok,
      reason,
      status: response.status,
      serverCount: stats.serverCount,
      shardCount: stats.shardCount,
      body,
      response: payload.slice(0, 300) || null,
    };
    rememberTopggStatsPost(entry);
    if (response.ok) {
      console.log(`Top.gg stats posted: ${stats.serverCount} servers (${reason}).`);
    } else {
      console.warn("Top.gg stats post failed:", entry);
    }
    return entry;
  } catch (error) {
    const entry = {
      ok: false,
      reason,
      error: error.message || String(error),
    };
    rememberTopggStatsPost(entry);
    console.warn("Top.gg stats post failed:", entry);
    return entry;
  } finally {
    topggStatsPosting = false;
  }
}

function scheduleTopggStatsPost(client, reason = "guild_update") {
  if (topggStatsDebounceTimer) {
    clearTimeout(topggStatsDebounceTimer);
  }
  topggStatsDebounceTimer = setTimeout(() => {
    topggStatsDebounceTimer = null;
    postTopggStats(client, reason).catch((error) => {
      console.warn("Top.gg debounced stats post failed:", error);
    });
  }, TOPGG_STATS_DEBOUNCE_MS);
}

function startTopggStatsLoop(client) {
  if (topggStatsTimer) {
    return;
  }

  postTopggStats(client, "ready").catch((error) => {
    console.warn("Initial Top.gg stats post failed:", error);
  });

  topggStatsTimer = setInterval(() => {
    postTopggStats(client, "scheduled").catch((error) => {
      console.warn("Scheduled Top.gg stats post failed:", error);
    });
  }, TOPGG_STATS_INTERVAL_MS);
  topggStatsTimer.unref?.();
}

function stopTopggStatsLoop() {
  if (topggStatsTimer) {
    clearInterval(topggStatsTimer);
    topggStatsTimer = null;
  }
  if (topggStatsDebounceTimer) {
    clearTimeout(topggStatsDebounceTimer);
    topggStatsDebounceTimer = null;
  }
}

module.exports = {
  getTopggApiToken,
  getDiscordGuildStats,
  postTopggStats,
  scheduleTopggStatsPost,
  startTopggStatsLoop,
  stopTopggStatsLoop,
  recentTopggStatsPosts,
  TOPGG_STATS_INTERVAL_MS,
};
