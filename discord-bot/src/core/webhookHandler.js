const crypto = require("crypto");
const { GuildSettings, PaddleWebhookLog } = require("../data/models");
const { applyPaddleWebhookEvent, applyTopggVoteWebhookEvent } = require("../game/service");
const { buildEmbedPayload } = require("../utils/visuals");

const recentPaddleWebhooks = [];
const recentTopggWebhooks = [];

function rememberPaddleWebhook(entry) {
  recentPaddleWebhooks.unshift({
    at: new Date().toISOString(),
    ...entry,
  });
  recentPaddleWebhooks.splice(10);
  PaddleWebhookLog.create(entry).catch((error) => {
    console.error("Failed to save Paddle webhook debug log:", error);
  });
}

function parsePaddleSignatureHeader(headerValue) {
  return String(headerValue || "").split(";").reduce((parts, piece) => {
    const [key, value] = piece.split("=");
    if (key && value) {
      parts[key.trim()] = value.trim();
    }
    return parts;
  }, {});
}

function verifyPaddleWebhookSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) {
    return false;
  }

  const signatureParts = parsePaddleSignatureHeader(signatureHeader);
  const timestamp = signatureParts.ts;
  const signatures = String(signatureParts.h1 || "").split(",").filter(Boolean);

  if (!timestamp || signatures.length === 0) {
    return false;
  }

  const toleranceSeconds = Number(process.env.PADDLE_WEBHOOK_TOLERANCE_SECONDS) || 300;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}:${rawBody}`)
    .digest("hex");

  return signatures.some((signature) => {
    const expectedBuffer = Buffer.from(expected, "hex");
    const signatureBuffer = Buffer.from(signature, "hex");
    return expectedBuffer.length === signatureBuffer.length && crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
  });
}

function parseTopggSignatureHeader(headerValue) {
  return String(headerValue || "").split(",").reduce((parts, piece) => {
    const [key, value] = piece.split("=");
    if (key && value) {
      parts[key.trim()] = value.trim();
    }
    return parts;
  }, {});
}

function verifyTopggWebhookSignature(rawBody, signatureHeader, secret) {
  if (!rawBody || !signatureHeader || !secret) {
    return false;
  }

  const signatureParts = parseTopggSignatureHeader(signatureHeader);
  const timestamp = signatureParts.t;
  const receivedSignature = signatureParts.v1;
  if (!timestamp || !receivedSignature) {
    return false;
  }

  const toleranceSeconds = Number(process.env.TOPGG_WEBHOOK_TOLERANCE_SECONDS) || 300;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(receivedSignature);
  return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function verifySharedSecret(providedValue, expectedValue) {
  if (!providedValue || !expectedValue) {
    return false;
  }

  const providedBuffer = Buffer.from(String(providedValue));
  const expectedBuffer = Buffer.from(String(expectedValue));
  return providedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function getBearerToken(headerValue) {
  const match = String(headerValue || "").match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

async function sendPremiumAnnouncement(result, getClient) {
  const discordClient = getClient();
  const isPremiumActivation = result?.shouldAnnounce && result.userId;
  const isPurchaseGrant = result?.action === "purchase_granted" && result.userId;
  if (!discordClient?.isReady?.() || (!isPremiumActivation && !isPurchaseGrant)) {
    return { sent: false, reason: "not_ready_or_not_needed" };
  }

  const planLabel = result.planLabel || result.planId || "Premium";
  const embed = isPurchaseGrant
    ? {
      color: 0x69c7ff,
      title: "Aurix Purchase Delivered",
      description: `<@${result.userId}> received **${result.productLabel || result.productId}**.`,
      fields: [
        { name: "Delivered", value: result.grantSummary?.length ? result.grantSummary.join("\n") : "Your digital items were added to your Aurix profile." },
        { name: "Start Here", value: "`/inventory`, `/crate`, `/profile`, `/shop`" },
      ],
      footer: { text: "All Aurix items are virtual bot features with no cash value." },
      timestamp: new Date().toISOString(),
    }
    : {
      color: 0xffc857,
      title: "Premium Activated",
      description: `<@${result.userId}> just unlocked **${planLabel} Premium** for Aurix.`,
      fields: [
        { name: "Unlocked", value: "Premium Chest, extra garden plots, battle bonuses, profile cosmetics, extra reminder slots, and premium-only shop items." },
        { name: "Start Here", value: "`/premium`, `/premium-chest`, `/profile`, `/garden status`, `/shop`" },
      ],
      footer: { text: "Thanks for supporting Aurix Bot." },
      timestamp: new Date().toISOString(),
    };

  const guildSettings = result.announcementGuildId
    ? await GuildSettings.findOne({ guildId: result.announcementGuildId }).lean()
    : null;
  const channelIds = [
    guildSettings?.commandChannelId,
    guildSettings?.aurixChannelId,
    process.env.PREMIUM_ANNOUNCEMENT_CHANNEL_ID,
    result.announcementChannelId,
  ].filter(Boolean);

  for (const channelId of channelIds) {
    const channel = await discordClient.channels.fetch(channelId).catch(() => null);
    if (channel?.isTextBased?.() && channel.send) {
      await channel.send({
        content: `<@${result.userId}>`,
        embeds: [embed],
        allowedMentions: { users: [result.userId] },
      });
      return { sent: true, target: "channel", channelId };
    }
  }

  const user = await discordClient.users.fetch(result.userId).catch(() => null);
  if (user) {
    const dm = await user.send({ embeds: [embed] }).then(() => true).catch(() => false);
    if (dm) {
      return { sent: true, target: "dm" };
    }
  }

  return { sent: false, reason: "no_target" };
}

async function sendTopggVoteAnnouncement(result, getClient) {
  const discordClient = getClient();
  if (!discordClient?.isReady?.() || result?.action !== "rewarded" || !result.userId) {
    return { sent: false, reason: "not_ready_or_not_rewarded" };
  }

  const embedPayload = buildEmbedPayload({
    title: "Top.gg Vote Reward",
    description: `<@${result.userId}> voted for Aurix on Top.gg and received **${result.rewardSummary}**.`,
    visual: "emblem-success.svg",
    fields: [
      { name: "Vote Weight", value: `${result.weight || 1}x`, inline: true },
      { name: "Next Vote", value: result.nextVoteAt ? `<t:${Math.floor(new Date(result.nextVoteAt).getTime() / 1000)}:R>` : "About 12 hours", inline: true },
      { name: "Reminder", value: "Use `/reminders enable action:Top.gg Vote` to get tagged when voting is ready again." },
    ],
  });

  const channelIds = [
    result.announcementChannelId,
    process.env.TOPGG_VOTE_ANNOUNCEMENT_CHANNEL_ID,
  ].filter(Boolean);

  for (const channelId of channelIds) {
    const channel = await discordClient.channels.fetch(channelId).catch(() => null);
    if (channel?.isTextBased?.() && channel.send) {
      await channel.send({
        content: `<@${result.userId}>`,
        ...embedPayload,
        allowedMentions: { users: [result.userId] },
      });
      return { sent: true, target: "channel", channelId };
    }
  }

  const user = await discordClient.users.fetch(result.userId).catch(() => null);
  if (user) {
    const dm = await user.send(embedPayload).then(() => true).catch(() => false);
    if (dm) {
      return { sent: true, target: "dm" };
    }
  }

  return { sent: false, reason: "no_target" };
}

function registerWebhookRoutes(app, { getClient }) {
  const express = require("express");
  const paddleWebhookSecret = process.env.PADDLE_WEBHOOK_SECRET?.trim();
  const topggWebhookSecret = process.env.TOPGG_WEBHOOK_SECRET?.trim();
  const topggWebhookAuth = process.env.TOPGG_WEBHOOK_AUTH?.trim();

  app.get("/paddle/webhook", (_req, res) => {
    return res.status(200).json({
      ok: true,
      endpoint: "/paddle/webhook",
      message: "Webhook endpoint is reachable. Paddle must send POST requests here.",
    });
  });

  app.get("/topgg/webhook", (_req, res) => {
    return res.status(200).json({
      ok: true,
      endpoint: "/topgg/webhook",
      message: "Top.gg webhook endpoint is reachable. Top.gg must send POST requests here.",
    });
  });

  app.post("/topgg/webhook", express.raw({ type: "application/json", limit: "1mb" }), async (req, res) => {
    const signature = req.headers["x-topgg-signature"];
    const rawBody = req.body.toString("utf8");

    if (signature) {
      if (!topggWebhookSecret) {
        recentTopggWebhooks.unshift({ at: new Date().toISOString(), ok: false, error: "topgg_v1_not_configured" });
        recentTopggWebhooks.splice(10);
        return res.status(503).json({ ok: false, error: "topgg_v1_not_configured" });
      }
      if (!verifyTopggWebhookSignature(rawBody, signature, topggWebhookSecret)) {
        recentTopggWebhooks.unshift({ at: new Date().toISOString(), ok: false, error: "invalid_signature", trace: req.headers["x-topgg-trace"] || null });
        recentTopggWebhooks.splice(10);
        return res.status(401).json({ ok: false, error: "invalid_signature" });
      }
    } else if (!topggWebhookAuth) {
      recentTopggWebhooks.unshift({ at: new Date().toISOString(), ok: false, error: "topgg_not_configured" });
      recentTopggWebhooks.splice(10);
      return res.status(503).json({ ok: false, error: "topgg_not_configured" });
    } else if (!verifySharedSecret(req.headers.authorization, topggWebhookAuth)) {
      recentTopggWebhooks.unshift({ at: new Date().toISOString(), ok: false, error: "invalid_authorization" });
      recentTopggWebhooks.splice(10);
      return res.status(401).json({ ok: false, error: "invalid_authorization" });
    }

    try {
      const payload = JSON.parse(rawBody);
      const result = await applyTopggVoteWebhookEvent(payload || {});
      const announcement = await sendTopggVoteAnnouncement(result, getClient);
      recentTopggWebhooks.unshift({
        at: new Date().toISOString(),
        ok: result.ok,
        action: result.action,
        userId: result.userId || null,
        eventId: result.eventId || null,
        trace: req.headers["x-topgg-trace"] || null,
        announcement,
      });
      recentTopggWebhooks.splice(10);
      console.log("Top.gg webhook processed:", { result, announcement });
      return res.status(200).json({ ok: true, ...result });
    } catch (error) {
      console.error("Top.gg webhook processing failed:", error);
      return res.status(500).json({ ok: false, error: "webhook_processing_failed" });
    }
  });

  app.post("/paddle/webhook", express.raw({ type: "application/json", limit: "1mb" }), async (req, res) => {
    if (!paddleWebhookSecret) {
      rememberPaddleWebhook({ ok: false, error: "paddle_not_configured" });
      return res.status(503).json({ ok: false, error: "paddle_not_configured" });
    }

    const signature = req.headers["paddle-signature"];
    const rawBody = req.body.toString("utf8");

    if (!verifyPaddleWebhookSignature(rawBody, signature, paddleWebhookSecret)) {
      console.error("Paddle webhook signature verification failed.");
      rememberPaddleWebhook({ ok: false, error: "invalid_signature" });
      return res.status(400).json({ ok: false, error: "invalid_signature" });
    }

    try {
      const event = JSON.parse(rawBody);
      const result = await applyPaddleWebhookEvent(event, event.event_id || event.eventId || null);
      const announcement = await sendPremiumAnnouncement(result, getClient);
      rememberPaddleWebhook({
        ok: true,
        eventType: event.event_type || event.eventType || event.type || null,
        eventId: event.event_id || event.eventId || null,
        customData: event.data?.custom_data || event.data?.customData || null,
        result,
        announcement,
      });
      console.log("Paddle webhook processed:", {
        eventType: event.event_type || event.eventType || event.type,
        eventId: event.event_id || event.eventId || null,
        result,
        announcement,
      });
      return res.status(200).json({ ok: true, ...result });
    } catch (error) {
      console.error("Paddle webhook processing failed:", error);
      return res.status(500).json({ ok: false, error: "webhook_processing_failed" });
    }
  });
}

module.exports = {
  registerWebhookRoutes,
  verifySharedSecret,
  getBearerToken,
  recentPaddleWebhooks,
  recentTopggWebhooks,
};
