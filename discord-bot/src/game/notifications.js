const { EmbedBuilder } = require('discord.js');

const DM_RATE_LIMIT_MS = 60 * 1000; // 1 min between DMs per user
const MAX_DMS_PER_HOUR = 5;

// Track recent DMs to prevent spam
const recentDMs = new Map(); // userId -> [timestamps]

function canSendDM(userId) {
  const now = Date.now();
  const history = recentDMs.get(userId) || [];
  
  // Clean up old timestamps (older than 1 hour)
  const oneHourAgo = now - 60 * 60 * 1000;
  const recentHistory = history.filter(time => time > oneHourAgo);
  recentDMs.set(userId, recentHistory);

  if (recentHistory.length >= MAX_DMS_PER_HOUR) return false;
  if (recentHistory.length > 0) {
    const lastMessageTime = recentHistory[recentHistory.length - 1];
    if (now - lastMessageTime < DM_RATE_LIMIT_MS) return false;
  }

  return true;
}

function recordDMSent(userId) {
  const now = Date.now();
  const history = recentDMs.get(userId) || [];
  history.push(now);
  recentDMs.set(userId, history);
}

async function sendNotification(client, userId, embed) {
  if (!canSendDM(userId)) return false;
  
  try {
    const user = await client.users.fetch(userId);
    if (!user) return false;
    
    await user.send({ embeds: [embed] });
    recordDMSent(userId);
    return true;
  } catch (error) {
    // DMs fail silently if user has DMs disabled or blocked the bot
    return false;
  }
}

async function notifyPlayerRobbed(client, victimUser, thiefName, amount) {
  if (victimUser.reminders && victimUser.reminders.notifyOnRobbed === false) return;
  
  const embed = new EmbedBuilder()
    .setTitle('🚨 You were robbed!')
    .setDescription(`**${thiefName}** just successfully stole **${amount} aura** from you!`)
    .setColor('#FF0000');
    
  await sendNotification(client, victimUser.userId, embed);
}

async function notifyTradeReceived(client, targetUser, fromName, offer) {
  if (targetUser.reminders && targetUser.reminders.notifyOnTrade === false) return;
  
  const embed = new EmbedBuilder()
    .setTitle('🤝 New Trade Offer')
    .setDescription(`**${fromName}** has sent you a trade offer:\n\n${offer}`)
    .setColor('#00FF00');
    
  await sendNotification(client, targetUser.userId, embed);
}

async function notifyPetHungry(client, user) {
  if (user.reminders && user.reminders.notifyOnPetHungry === false) return;
  
  const petName = user.pet?.name || 'Your pet';
  const embed = new EmbedBuilder()
    .setTitle('🐾 Pet is Hungry!')
    .setDescription(`**${petName}** is starving! Feed them before their happiness drops.`)
    .setColor('#FFA500');
    
  await sendNotification(client, user.userId, embed);
}

async function notifyWeeklyReset(client, user) {
  if (user.reminders && user.reminders.notifyOnWeeklyReset === false) return;
  
  const embed = new EmbedBuilder()
    .setTitle('🔄 Weekly Reset Complete')
    .setDescription('Weekly quests, leaderboards, and limits have been reset. Dive back in to earn new rewards!')
    .setColor('#0099FF');
    
  await sendNotification(client, user.userId, embed);
}

async function notifyDailyShopFeatured(client, user, featuredItem) {
  if (user.reminders && user.reminders.notifyOnDailyShop === false) return;
  
  const embed = new EmbedBuilder()
    .setTitle('🏪 Daily Shop Update')
    .setDescription(`Today's featured item in the shop is **${featuredItem}**! Grab it before it's gone!`)
    .setColor('#FFD700');
    
  await sendNotification(client, user.userId, embed);
}

module.exports = {
  canSendDM,
  recordDMSent,
  notifyPlayerRobbed,
  notifyTradeReceived,
  notifyPetHungry,
  notifyWeeklyReset,
  notifyDailyShopFeatured
};
