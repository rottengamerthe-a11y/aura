const { AuditLogEvent } = require("discord.js");
const { InviteAttribution } = require("../data/models");
const { eventBus } = require("./eventBus");

const inviteCache = new Map();

async function fetchGuildInviteSnapshot(guild) {
  try {
    const invites = await guild.invites.fetch();
    return new Map(invites.map((invite) => [invite.code, {
      uses: invite.uses || 0,
      inviterId: invite.inviter?.id || null,
    }]));
  } catch (error) {
    console.warn(`Unable to read invites for ${guild.id}:`, error?.message || error);
    return new Map();
  }
}

async function refreshGuildInviteCache(guild) {
  const snapshot = await fetchGuildInviteSnapshot(guild);
  inviteCache.set(guild.id, snapshot);
  return snapshot;
}

function findUsedInvite(previous, current) {
  for (const [code, invite] of current.entries()) {
    const before = previous.get(code);
    if (before && invite.uses > before.uses) {
      return { code, inviterId: invite.inviterId };
    }
  }
  return null;
}

async function findBotJoinInviter(guild, client) {
  try {
    const auditLogs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 10 });
    const entry = auditLogs.entries.find((candidate) => {
      const targetId = candidate.target?.id || candidate.targetId;
      return targetId === client.user?.id && Date.now() - candidate.createdTimestamp < 10 * 60 * 1000;
    });
    return entry?.executor?.id || null;
  } catch (error) {
    console.warn(`Unable to read bot-add audit logs for ${guild.id}:`, error?.message || error);
    return null;
  }
}

async function recordInviteAttribution({ attributionType, guild, inviterId, invitedUserId, inviteCode }) {
  if (!guild?.id || !invitedUserId) {
    return null;
  }

  const result = await InviteAttribution.updateOne(
    { attributionType, guildId: guild.id, invitedUserId },
    {
      $setOnInsert: {
        attributionType,
        guildId: guild.id,
        inviterId: inviterId || null,
        invitedUserId,
        inviteCode: inviteCode || null,
        joinedAt: new Date(),
      },
    },
    { upsert: true }
  );
  if (result.upsertedCount !== 1) {
    return null;
  }

  const attribution = await InviteAttribution.findOne({ attributionType, guildId: guild.id, invitedUserId }).lean();
  eventBus.publish("worldBoss.riftOpened", {
    attributionId: attribution?._id?.toString() || null,
    attributionType,
    guildId: guild.id,
    inviterId: inviterId || null,
    invitedUserId,
    inviteCode: inviteCode || null,
    sourceEventId: `${attributionType}:${guild.id}:${invitedUserId}`,
  });
  return attribution;
}

module.exports = {
  inviteCache,
  fetchGuildInviteSnapshot,
  refreshGuildInviteCache,
  findUsedInvite,
  findBotJoinInviter,
  recordInviteAttribution,
};
