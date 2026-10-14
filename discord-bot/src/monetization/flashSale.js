const crypto = require("crypto");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { User } = require("../data/models");
const { buildEmbedPayload } = require("../utils/visuals");

const FLASH_SALE_DURATION_MS = 15 * 60 * 1000;
const FLASH_SALE_ITEM = Object.freeze({ id: "rare_crate", label: "Rare Crate", basePrice: 8600, discountPercent: 25 });

function buildFlashSalePayload(userId, offer) {
  const discountedPrice = Math.floor(offer.basePrice * (1 - offer.discountPercent / 100));
  return {
    ...buildEmbedPayload({
      title: "Boss Victory Flash Sale",
      description: `<@${userId}> earned a private victory offer. The **${FLASH_SALE_ITEM.label}** is available once at a milestone-only price.`,
      visual: "emblem-success.svg",
      fields: [
        { name: "Offer", value: FLASH_SALE_ITEM.label, inline: true },
        { name: "Price", value: `${discountedPrice.toLocaleString("en-US")} aura (${offer.discountPercent}% off)`, inline: true },
        { name: "Expires", value: `<t:${Math.floor(new Date(offer.expiresAt).getTime() / 1000)}:R>`, inline: true },
      ],
      footer: "One claim per boss victory. The offer is bound to the winning player.",
    }),
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`flashsale:buy:${userId}:${offer.offerId}`)
          .setLabel(`Buy ${FLASH_SALE_ITEM.label}`)
          .setStyle(ButtonStyle.Success)
      ),
    ],
  };
}

function attachFlashSaleSubscriber(eventBus, client) {
  return eventBus.subscribe("boss.defeated", async (event) => {
    const { guildId, userId, channelId, sourceEventId } = event.payload || {};
    if (!guildId || !userId || !channelId || !client?.isReady?.()) {
      return;
    }

    const offer = {
      offerId: crypto.randomUUID().slice(0, 12),
      itemId: FLASH_SALE_ITEM.id,
      basePrice: FLASH_SALE_ITEM.basePrice,
      discountPercent: FLASH_SALE_ITEM.discountPercent,
      sourceEventId: sourceEventId || event.createdAt.toISOString(),
      expiresAt: new Date(Date.now() + FLASH_SALE_DURATION_MS),
      claimedAt: null,
    };
    const user = await User.findOneAndUpdate(
      { userId, $or: [{ guildId }, { guildId: { $exists: false } }] },
      { $set: { flashSale: offer } },
      { new: true }
    ).catch(() => null);
    if (!user) {
      return;
    }

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (channel?.isTextBased?.() && channel.send) {
      await channel.send(buildFlashSalePayload(userId, offer)).catch(() => null);
    }
  });
}

module.exports = { attachFlashSaleSubscriber, FLASH_SALE_ITEM };