const crypto = require("crypto");
const https = require("https");
const { User } = require("../data/models");
const { buildPlayerLookup, isGlobalPlayerDataEnabled } = require("../data/playerScope");

const PREMIUM_PLAN_CONFIG = Object.freeze({
  monthly: {
    id: "monthly",
    label: "Monthly",
    envKey: "RAZORPAY_PREMIUM_MONTHLY_AMOUNT",
    durationDays: 30,
  },
  yearly: {
    id: "yearly",
    label: "Yearly",
    envKey: "RAZORPAY_PREMIUM_YEARLY_AMOUNT",
    durationDays: 365,
  },
  lifetime: {
    id: "lifetime",
    label: "Lifetime",
    envKey: "RAZORPAY_PREMIUM_LIFETIME_AMOUNT",
    durationDays: null,
  },
});

function trimEnv(key) {
  return process.env[key]?.trim() || "";
}

function getRazorpayConfig() {
  return {
    keyId: trimEnv("RAZORPAY_KEY_ID"),
    keySecret: trimEnv("RAZORPAY_KEY_SECRET"),
    webhookSecret: trimEnv("RAZORPAY_WEBHOOK_SECRET"),
    currency: trimEnv("RAZORPAY_CURRENCY") || "INR",
    callbackUrl: trimEnv("RAZORPAY_CALLBACK_URL"),
    callbackMethod: trimEnv("RAZORPAY_CALLBACK_METHOD") || "get",
  };
}

function getPremiumPlan(planId) {
  const plan = PREMIUM_PLAN_CONFIG[planId];
  if (!plan) {
    return null;
  }

  const amount = Number.parseInt(trimEnv(plan.envKey), 10);
  return {
    ...plan,
    amount,
  };
}

function getPremiumPlanChoices() {
  return Object.values(PREMIUM_PLAN_CONFIG).map((plan) => ({
    name: plan.label,
    value: plan.id,
  }));
}

function getMissingPaymentConfig(planId) {
  const plan = getPremiumPlan(planId);
  const config = getRazorpayConfig();
  const missing = [];

  if (!config.keyId) {
    missing.push("RAZORPAY_KEY_ID");
  }
  if (!config.keySecret) {
    missing.push("RAZORPAY_KEY_SECRET");
  }
  if (!plan) {
    missing.push("valid premium plan");
  } else if (!Number.isInteger(plan.amount) || plan.amount <= 0) {
    missing.push(plan.envKey);
  }

  return missing;
}

function ensureBillingState(user) {
  if (!user.premium) {
    user.premium = {
      active: false,
      expiresAt: null,
      lifetime: false,
      grantedBy: null,
      source: null,
    };
  }

  if (!user.billing) {
    user.billing = {
      provider: null,
      razorpayPaymentLinkId: null,
      razorpayPaymentId: null,
      razorpayOrderId: null,
      razorpayReferenceId: null,
      razorpayLastEventId: null,
      razorpayPlanId: null,
      razorpayLinkStatus: null,
    };
  }
}

function razorpayRequest({ method, path, body }) {
  const { keyId, keySecret } = getRazorpayConfig();
  if (!keyId || !keySecret) {
    return Promise.reject(new Error("Razorpay credentials are not configured."));
  }

  const payload = body ? JSON.stringify(body) : null;
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api.razorpay.com",
      path,
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        raw += chunk;
      });
      res.on("end", () => {
        let parsed = {};
        if (raw) {
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = {};
          }
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(parsed);
          return;
        }
        reject(new Error(parsed.error?.description || parsed.error?.reason || `Razorpay request failed with status ${res.statusCode}`));
      });
    });

    req.on("error", reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

function buildReferenceId(guildId, discordUserId) {
  const scope = isGlobalPlayerDataEnabled() ? "global" : guildId;
  return `premium_${scope}_${discordUserId}_${Date.now()}`;
}

async function createPremiumPaymentLink({ guildId, discordUserId, planId, username }) {
  const plan = getPremiumPlan(planId);
  const config = getRazorpayConfig();

  if (!plan || !Number.isInteger(plan.amount) || plan.amount <= 0) {
    throw new Error(`Razorpay is not configured for the ${planId} premium plan.`);
  }

  const referenceId = buildReferenceId(guildId, discordUserId);
  const notes = {
    guildId,
    discordUserId,
    planId,
  };

  const response = await razorpayRequest({
    method: "POST",
    path: "/v1/payment_links",
    body: {
      amount: plan.amount,
      currency: config.currency,
      accept_partial: false,
      description: `${plan.label} premium access for ${username}`,
      reference_id: referenceId,
      callback_url: config.callbackUrl || undefined,
      callback_method: config.callbackUrl ? config.callbackMethod : undefined,
      notes,
    },
  });

  return { paymentLink: response, plan, referenceId };
}

function verifyWebhookSignature(rawBody, signature) {
  const { webhookSecret } = getRazorpayConfig();
  if (!webhookSecret) {
    return false;
  }

  const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signature || "");
  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

async function findUserForWebhook(paymentLinkEntity = {}) {
  const notes = paymentLinkEntity.notes || {};
  if (notes.guildId && notes.discordUserId) {
    const user = await User.findOne(buildPlayerLookup(notes.guildId, notes.discordUserId)).sort({ updatedAt: -1, createdAt: 1 });
    if (user) {
      return user;
    }
  }

  if (paymentLinkEntity.id) {
    const user = await User.findOne({ "billing.razorpayPaymentLinkId": paymentLinkEntity.id });
    if (user) {
      return user;
    }
  }

  if (paymentLinkEntity.reference_id) {
    return User.findOne({ "billing.razorpayReferenceId": paymentLinkEntity.reference_id });
  }

  return null;
}

function applyRazorpayBilling(user, payload = {}) {
  ensureBillingState(user);
  user.billing.provider = "razorpay";
  user.premium.source = "razorpay";

  if (payload.paymentLinkId) {
    user.billing.razorpayPaymentLinkId = payload.paymentLinkId;
  }
  if (payload.paymentId) {
    user.billing.razorpayPaymentId = payload.paymentId;
  }
  if (payload.orderId) {
    user.billing.razorpayOrderId = payload.orderId;
  }
  if (payload.referenceId) {
    user.billing.razorpayReferenceId = payload.referenceId;
  }
  if (payload.eventId) {
    user.billing.razorpayLastEventId = payload.eventId;
  }
  if (payload.planId) {
    user.billing.razorpayPlanId = payload.planId;
  }
  if (payload.linkStatus) {
    user.billing.razorpayLinkStatus = payload.linkStatus;
  }
}

function getPremiumExpiryFromPlan(user, planId) {
  const plan = getPremiumPlan(planId);
  if (!plan) {
    return null;
  }
  if (plan.durationDays === null) {
    return null;
  }

  const baseTime = user.premium?.expiresAt && user.premium.expiresAt.getTime() > Date.now()
    ? user.premium.expiresAt.getTime()
    : Date.now();

  return new Date(baseTime + (plan.durationDays * 24 * 60 * 60 * 1000));
}

async function processWebhookEvent(event, eventId) {
  if (!event?.event) {
    return { handled: false, reason: "invalid_event" };
  }

  const paymentLinkEntity = event.payload?.payment_link?.entity;
  if (!paymentLinkEntity) {
    return { handled: false, reason: "missing_payment_link" };
  }

  const user = await findUserForWebhook(paymentLinkEntity);
  if (!user) {
    return { handled: false, reason: "user_not_found" };
  }

  ensureBillingState(user);
  if (eventId && user.billing.razorpayLastEventId === eventId) {
    return { handled: true, reason: "duplicate" };
  }

  const planId = paymentLinkEntity.notes?.planId || user.billing.razorpayPlanId || "monthly";

  applyRazorpayBilling(user, {
    paymentLinkId: paymentLinkEntity.id,
    referenceId: paymentLinkEntity.reference_id,
    eventId,
    planId,
    linkStatus: paymentLinkEntity.status,
    paymentId: event.payload?.payment?.entity?.id,
    orderId: event.payload?.order?.entity?.order_id || event.payload?.payment?.entity?.order_id,
  });

  if (event.event === "payment_link.paid") {
    if (planId === "lifetime") {
      user.premium.active = true;
      user.premium.lifetime = true;
      user.premium.expiresAt = null;
    } else {
      user.premium.active = true;
      user.premium.lifetime = false;
      user.premium.expiresAt = getPremiumExpiryFromPlan(user, planId);
    }
    await user.save();
    return { handled: true, reason: "premium_activated" };
  }

  if (event.event === "payment_link.cancelled" || event.event === "payment_link.expired") {
    await user.save();
    return { handled: true, reason: "payment_link_recorded" };
  }

  await user.save();
  return { handled: false, reason: "ignored_event" };
}

module.exports = {
  createPremiumPaymentLink,
  getMissingPaymentConfig,
  getPremiumPlan,
  getPremiumPlanChoices,
  getRazorpayConfig,
  processWebhookEvent,
  verifyWebhookSignature,
};
