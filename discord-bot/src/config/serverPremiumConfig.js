const SERVER_PREMIUM_TIERS = Object.freeze({
  server_plus: {
    id: 'server_plus',
    label: 'Server Plus',
    priceLabel: '$9.99/month',
    priceEnv: 'PADDLE_SERVER_PLUS_PRICE_ID',
    xpMultiplier: 1.1,
    auraMultiplier: 1.0,
    autoRoleOnRankUp: true,
    customEmbedColor: true,
    customWelcomeMessage: true,
    increasedEventFrequency: true,
    eventCooldownReduction: 0.15, // 15% faster server events
    maxCustomShopItems: 0,
    priorityResponse: false,
    serverLeaderboardWeb: false,
  },
  server_pro: {
    id: 'server_pro',
    label: 'Server Pro',
    priceLabel: '$24.99/month',
    priceEnv: 'PADDLE_SERVER_PRO_PRICE_ID',
    xpMultiplier: 1.25,
    auraMultiplier: 1.05,
    autoRoleOnRankUp: true,
    customEmbedColor: true,
    customWelcomeMessage: true,
    increasedEventFrequency: true,
    eventCooldownReduction: 0.25, // 25% faster server events
    maxCustomShopItems: 5,
    priorityResponse: true,
    serverLeaderboardWeb: true,
  },
});

module.exports = { SERVER_PREMIUM_TIERS };
