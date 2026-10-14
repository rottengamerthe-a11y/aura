const { ReferralCode, User } = require('../data/models');

const PLAYER_CODE_REWARD = 1000; // owner gets per referral
const REFERRED_BONUS = 500; // new user gets
const CREATOR_CODE_REWARD = 2000; // creator gets per use
const CREATOR_REFERRED_BONUS = 1000; // user using creator code gets
const MAX_PLAYER_REFERRALS = 50; // cap per player code
const REFERRAL_XP_THRESHOLD = 100; // referred user must reach this XP to count
const REFERRAL_MILESTONES = [
  { uses: 5, reward: { aura: 5000, title: 'Recruiter' } },
  { uses: 15, reward: { aura: 15000, badge: 'recruiter', title: 'Talent Scout' } },
  { uses: 30, reward: { aura: 30000, title: 'Community Builder' } },
  { uses: 50, reward: { aura: 50000, badge: 'ambassador', title: 'Aurix Ambassador' } },
];

function generateRandomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function createReferralCode(userId, customCode = null) {
  try {
    const existingCode = await ReferralCode.findOne({ ownerId: userId, active: true });
    if (existingCode) {
      return { error: 'You already have an active referral code.' };
    }

    let codeToUse = customCode;
    if (codeToUse) {
      const isValid = /^[a-zA-Z0-9-]{3,16}$/.test(codeToUse);
      if (!isValid) {
        return { error: 'Custom code must be 3-16 characters long and contain only letters, numbers, and hyphens.' };
      }
      const codeExists = await ReferralCode.findOne({ code: new RegExp(`^${codeToUse}$`, 'i') });
      if (codeExists) {
        return { error: 'This custom code is already taken.' };
      }
    } else {
      let isUnique = false;
      while (!isUnique) {
        codeToUse = generateRandomCode();
        const codeExists = await ReferralCode.findOne({ code: codeToUse });
        if (!codeExists) {
          isUnique = true;
        }
      }
    }

    const newCode = new ReferralCode({
      code: codeToUse.toUpperCase(),
      ownerId: userId,
      ownerType: 'player',
      uses: 0,
      maxUses: MAX_PLAYER_REFERRALS,
      rewardPerUse: PLAYER_CODE_REWARD,
      bonusAuraForReferred: REFERRED_BONUS,
      totalAuraEarned: 0,
      usedBy: [],
      active: true
    });

    await newCode.save();
    return { code: newCode };
  } catch (error) {
    console.error('Error creating referral code:', error);
    return { error: 'An error occurred while creating your referral code.' };
  }
}

async function createCreatorCode(userId, code, options = {}) {
  try {
    const codeExists = await ReferralCode.findOne({ code: new RegExp(`^${code}$`, 'i') });
    if (codeExists) {
      return { error: 'This custom code is already taken.' };
    }

    const newCode = new ReferralCode({
      code: code.toUpperCase(),
      ownerId: userId,
      ownerType: 'creator',
      uses: 0,
      maxUses: options.maxUses || null,
      rewardPerUse: CREATOR_CODE_REWARD,
      bonusAuraForReferred: CREATOR_REFERRED_BONUS,
      totalAuraEarned: 0,
      usedBy: [],
      active: true,
      expiresAt: options.expiresAt || null
    });

    await newCode.save();
    return { code: newCode };
  } catch (error) {
    console.error('Error creating creator code:', error);
    return { error: 'An error occurred while creating creator code.' };
  }
}

async function useReferralCode(userId, guildId, code) {
  try {
    const referralCode = await ReferralCode.findOne({ code: new RegExp(`^${code}$`, 'i'), active: true });
    if (!referralCode) {
      return { error: 'Invalid or inactive referral code.' };
    }

    if (referralCode.expiresAt && referralCode.expiresAt < new Date()) {
      return { error: 'This referral code has expired.' };
    }

    if (referralCode.maxUses && referralCode.uses >= referralCode.maxUses) {
      return { error: 'This referral code has reached its maximum uses.' };
    }

    if (referralCode.ownerId === userId) {
      return { error: 'You cannot use your own referral code.' };
    }

    const user = await User.findOne({ userId, guildId });
    if (!user) {
      return { error: 'User not found.' };
    }

    if (user.referredBy) {
      return { error: 'You have already used a referral code.' };
    }

    user.referredBy = referralCode.code;
    user.aura = (user.aura || 0) + referralCode.bonusAuraForReferred;
    
    if (!referralCode.usedBy.includes(userId)) {
        referralCode.usedBy.push(userId);
    }
    
    await user.save();
    await referralCode.save();

    return { success: true, bonusAura: referralCode.bonusAuraForReferred, codeOwner: referralCode.ownerId };
  } catch (error) {
    console.error('Error using referral code:', error);
    return { error: 'An error occurred while using the referral code.' };
  }
}

async function confirmReferral(userId, guildId) {
    try {
        const user = await User.findOne({ userId, guildId });
        if (!user || !user.referredBy) return null;
        
        if ((user.xp || 0) < REFERRAL_XP_THRESHOLD) return null;
        
        const referralCode = await ReferralCode.findOne({ code: user.referredBy });
        if (!referralCode) return null;
        
        if (user.referralConfirmed) return null;
        
        user.referralConfirmed = true;
        await user.save();
        
        const owner = await User.findOne({ userId: referralCode.ownerId, guildId });
        if (!owner) return null;
        
        owner.aura = (owner.aura || 0) + referralCode.rewardPerUse;
        referralCode.uses += 1;
        referralCode.totalAuraEarned += referralCode.rewardPerUse;
        
        const milestoneReward = checkMilestoneRewards(referralCode, owner);
        
        await owner.save();
        await referralCode.save();
        
        return { confirmed: true, ownerReward: referralCode.rewardPerUse, milestone: milestoneReward };
    } catch (error) {
        console.error('Error confirming referral:', error);
        return null;
    }
}

async function getReferralStats(userId) {
  try {
    const code = await ReferralCode.findOne({ ownerId: userId, active: true });
    
    const user = await User.findOne({ userId }); 
    
    let milestones = [];
    if (code) {
      milestones = REFERRAL_MILESTONES.filter(m => code.uses >= m.uses);
    }
    
    return {
      code: code ? code.code : null,
      uses: code ? code.uses : 0,
      totalAuraEarned: code ? code.totalAuraEarned : 0,
      milestones,
      usedCode: user ? user.referredBy : null
    };
  } catch (error) {
    console.error('Error getting referral stats:', error);
    return { error: 'An error occurred while getting referral stats.' };
  }
}

async function getUserCode(userId) {
  try {
    return await ReferralCode.findOne({ ownerId: userId, active: true });
  } catch (error) {
    return null;
  }
}

async function deactivateCode(userId) {
  try {
    const code = await ReferralCode.findOne({ ownerId: userId, active: true });
    if (!code) return { error: 'No active code found.' };
    
    code.active = false;
    await code.save();
    return { success: true };
  } catch (error) {
    return { error: 'Error deactivating code.' };
  }
}

function checkMilestoneRewards(code, user) {
  const milestone = REFERRAL_MILESTONES.find(m => m.uses === code.uses);
  if (!milestone) return null;
  
  if (milestone.reward.aura) {
      user.aura = (user.aura || 0) + milestone.reward.aura;
  }
  if (milestone.reward.title) {
      if (!user.titles) user.titles = [];
      if (!user.titles.includes(milestone.reward.title)) {
          user.titles.push(milestone.reward.title);
      }
  }
  if (milestone.reward.badge) {
      if (!user.cosmetics) user.cosmetics = { badges: [] };
      if (!user.cosmetics.badges) user.cosmetics.badges = [];
      if (!user.cosmetics.badges.includes(milestone.reward.badge)) {
          user.cosmetics.badges.push(milestone.reward.badge);
      }
  }
  return milestone;
}

async function getTopReferrers(limit = 10) {
  return ReferralCode.find({ active: true }).sort({ uses: -1 }).limit(limit).lean();
}

module.exports = {
  createReferralCode, createCreatorCode, useReferralCode, confirmReferral,
  getReferralStats, getUserCode, deactivateCode, getTopReferrers, checkMilestoneRewards,
  REFERRAL_MILESTONES, PLAYER_CODE_REWARD, REFERRED_BONUS,
};
