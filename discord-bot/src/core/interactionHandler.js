const { EmbedBuilder } = require("discord.js");
const { acquireLock, releaseLock, isRedisAvailable } = require("./redis");

const interactionUserLocks = new Map();
const recentDiscordResponses = [];

function getInteractionUserLockKey(interaction) {
  const userId = interaction?.user?.id;
  if (!userId) {
    return null;
  }
  return `${interaction.guildId || "dm"}:${userId}`;
}

async function withInteractionUserLock(interaction, task) {
  const key = getInteractionUserLockKey(interaction);
  if (!key) {
    return task();
  }

  // Try Redis distributed lock first (works across shards)
  if (isRedisAvailable()) {
    const lockKey = await acquireLock(`interaction:${key}`, 30000);
    if (lockKey) {
      try {
        return await task();
      } finally {
        await releaseLock(lockKey);
      }
    }
    // If Redis lock acquisition fails, fall through to in-memory
  }

  // In-memory lock fallback (single-process only)
  const previous = interactionUserLocks.get(key) || Promise.resolve();
  let releaseLockFn;
  const current = new Promise((resolve) => {
    releaseLockFn = resolve;
  });
  const queue = previous.catch(() => null).then(() => current);
  interactionUserLocks.set(key, queue);

  await previous.catch(() => null);
  try {
    return await task();
  } finally {
    releaseLockFn();
    if (interactionUserLocks.get(key) === queue) {
      interactionUserLocks.delete(key);
    }
  }
}

async function prepareInteractionResponse(interaction) {
  const canAutoDeferCommand = interaction.isChatInputCommand?.();
  const canAutoDeferComponent = interaction.isButton?.() || interaction.isStringSelectMenu?.();
  if (!canAutoDeferCommand && !canAutoDeferComponent) {
    return () => {};
  }

  const originalReply = interaction.reply.bind(interaction);
  const originalEditReply = interaction.editReply.bind(interaction);
  const originalDeleteReply = interaction.deleteReply?.bind(interaction);
  const originalUpdate = interaction.update?.bind(interaction);
  const originalFollowUp = interaction.followUp.bind(interaction);
  const defer = canAutoDeferComponent ? interaction.deferUpdate.bind(interaction) : interaction.deferReply.bind(interaction);
  let deferOk = false;
  let deferStarted = false;
  let deferPromise = null;
  let responseStarted = false;

  const startDeferredResponse = () => {
    if (responseStarted || deferStarted || interaction.deferred || interaction.replied) {
      return;
    }
    deferStarted = true;
    deferPromise = defer()
      .then(() => {
        deferOk = true;
      })
      .catch((error) => {
        console.warn("Failed to defer interaction:", error?.code || error?.message || error);
      });
  };

  const deferTimer = setTimeout(startDeferredResponse, 1800);
  const clearDeferredResponseTimer = () => clearTimeout(deferTimer);
  const waitForDeferredResponse = async () => {
    if (deferPromise) {
      await deferPromise;
    }
  };

  interaction.reply = async (options) => {
    responseStarted = true;
    clearDeferredResponseTimer();
    const normalizedOptions = enforceHudEmbedStyle(options);
    await waitForDeferredResponse();
    if (deferOk || interaction.deferred) {
      if (isEphemeralResponse(normalizedOptions)) {
        const response = await originalFollowUp(normalizedOptions);
        if (canAutoDeferCommand && originalDeleteReply) {
          await originalDeleteReply().catch(() => null);
        }
        return response;
      }
      const { ephemeral, flags, ...editOptions } = normalizedOptions || {};
      return originalEditReply(editOptions);
    }
    return originalReply(normalizedOptions);
  };

  if (originalUpdate) {
    interaction.update = async (options) => {
      responseStarted = true;
      clearDeferredResponseTimer();
      const normalizedOptions = enforceHudEmbedStyle(options);
      await waitForDeferredResponse();
      if (deferOk || interaction.deferred) {
        return originalEditReply(normalizedOptions);
      }
      return originalUpdate(normalizedOptions);
    };
  }

  interaction.followUp = async (options) => {
    clearDeferredResponseTimer();
    return originalFollowUp(enforceHudEmbedStyle(options));
  };

  return clearDeferredResponseTimer;
}

function isEphemeralResponse(options) {
  if (!options || typeof options === "string") {
    return false;
  }
  const flags = Number(options.flags || 0);
  return Boolean(options.ephemeral || (flags & 64));
}

function enforceHudEmbedStyle(options) {
  if (!options || typeof options === "string" || !Array.isArray(options.embeds)) {
    return options;
  }

  const normalized = {
    ...options,
    embeds: options.embeds.map((embed) => {
      const builder = EmbedBuilder.from(embed);
      const data = builder.toJSON();
      const title = data.title || "AURIX";
      const footerText = data.footer?.text || "";

      return builder;
    }),
  };
  rememberDiscordResponse(normalized);
  return normalized;
}

function rememberDiscordResponse(options) {
  const embeds = (options.embeds || []).map((embed) => {
    const data = EmbedBuilder.from(embed).toJSON();
    return {
      title: data.title || null,
      author: data.author?.name || null,
      footer: data.footer?.text || null,
      descriptionStart: data.description ? data.description.slice(0, 220) : null,
    };
  });
  recentDiscordResponses.unshift({
    at: new Date().toISOString(),
    content: options.content || null,
    embeds,
  });
  recentDiscordResponses.splice(20);
}

module.exports = {
  withInteractionUserLock,
  prepareInteractionResponse,
  isEphemeralResponse,
  enforceHudEmbedStyle,
  rememberDiscordResponse,
  recentDiscordResponses,
};
