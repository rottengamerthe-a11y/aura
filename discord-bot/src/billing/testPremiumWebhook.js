const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const mongoose = require("mongoose");
const { User } = require("../data/models");
const { applyPaddleWebhookEvent } = require("../game/service");

async function main() {
  const [, , userId, planId = "monthly"] = process.argv;

  if (!userId) {
    throw new Error("Usage: node src/billing/testPremiumWebhook.js <discordUserId> [monthly|yearly|lifetime]");
  }

  if (!process.env.MONGODB_URI) {
    throw new Error("Missing MONGODB_URI.");
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });

  const event = {
    event_id: `test_${Date.now()}`,
    event_type: "transaction.completed",
    data: {
      id: `txn_test_${Date.now()}`,
      status: "completed",
      custom_data: {
        discord_user_id: userId,
        plan_id: planId,
      },
      items: [
        {
          price: {
            id: process.env[`PADDLE_${planId.toUpperCase()}_PRICE_ID`] || `price_test_${planId}`,
          },
        },
      ],
    },
  };

  const result = await applyPaddleWebhookEvent(event, event.event_id);
  const user = await User.findOne({ userId }).sort({ updatedAt: -1 });

  console.log(JSON.stringify({
    result,
    premium: user?.premium || null,
    billing: user?.billing || null,
  }, null, 2));

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => null);
  process.exit(1);
});
