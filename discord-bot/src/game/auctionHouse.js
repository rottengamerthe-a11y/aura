const { AuctionListing, User } = require('../data/models');

const AUCTION_DURATIONS = { short: 6, medium: 12, long: 24 }; // hours
const AUCTION_FEE_PERCENT = 0.05; // 5% listing fee
const MAX_ACTIVE_LISTINGS = 5;
const MIN_BID_INCREMENT = 100;
const MIN_LISTING_PRICE = 500;

function createListing(user, { itemType, itemId, quantity, startingPrice, buyNowPrice, duration }) {
  if (user.aura < startingPrice * AUCTION_FEE_PERCENT) {
    throw new Error('Not enough aura to pay the listing fee.');
  }

  const fee = Math.max(100, Math.floor(startingPrice * AUCTION_FEE_PERCENT));
  if (user.aura < fee) {
    throw new Error(`You need at least ${fee} aura for the listing fee.`);
  }

  if (startingPrice < MIN_LISTING_PRICE) {
    throw new Error(`Minimum listing price is ${MIN_LISTING_PRICE} aura.`);
  }

  const durationHours = AUCTION_DURATIONS[duration];
  if (!durationHours) {
    throw new Error('Invalid duration. Use short, medium, or long.');
  }

  // Deduct item
  let hasItem = false;
  if (itemType === 'material' || itemType === 'pet_food') {
    const itemIndex = user.inventory.findIndex(i => i.itemId === itemId);
    if (itemIndex > -1 && user.inventory[itemIndex].quantity >= quantity) {
      user.inventory[itemIndex].quantity -= quantity;
      if (user.inventory[itemIndex].quantity <= 0) {
        user.inventory.splice(itemIndex, 1);
      }
      hasItem = true;
    }
  } else if (itemType === 'crate') {
    const currentCount = user.crates.get(itemId) || 0;
    if (currentCount >= quantity) {
      user.crates.set(itemId, currentCount - quantity);
      hasItem = true;
    }
  } else if (itemType === 'relic') {
    const relicIndex = user.relics.findIndex(r => r.relicId === itemId);
    if (relicIndex > -1) {
      user.relics.splice(relicIndex, 1);
      hasItem = true;
    }
  } else if (itemType === 'cosmetic') {
    const cosIndex = user.cosmetics.findIndex(c => c.cosmeticId === itemId);
    if (cosIndex > -1) {
      user.cosmetics.splice(cosIndex, 1);
      hasItem = true;
    }
  }

  if (!hasItem) {
    throw new Error('You do not have enough of this item to list.');
  }

  // Deduct fee
  user.aura -= fee;

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + durationHours);

  return {
    sellerId: user.userId,
    sellerGuildId: user.guildId,
    itemType,
    itemId,
    quantity,
    startingPrice,
    buyNowPrice,
    currentBid: 0,
    bidCount: 0,
    expiresAt,
    status: 'active'
  };
}

async function saveListing(listingData) {
  const listing = new AuctionListing(listingData);
  return listing.save();
}

async function placeBid(bidderId, bidderGuildId, listingId, bidAmount) {
  const listing = await AuctionListing.findById(listingId);
  if (!listing) return { error: 'Listing not found.' };
  if (listing.status !== 'active') return { error: 'Listing is not active.' };
  if (listing.expiresAt < new Date()) return { error: 'Listing has expired.' };
  if (listing.sellerId === bidderId) return { error: 'You cannot bid on your own listing.' };

  const minBid = Math.max(listing.startingPrice, listing.currentBid + MIN_BID_INCREMENT);
  if (bidAmount < minBid) return { error: `Bid must be at least ${minBid} aura.` };

  const bidder = await User.findOne({ userId: bidderId, guildId: bidderGuildId });
  if (!bidder) return { error: 'Bidder not found.' };
  if (bidder.aura < bidAmount) return { error: 'Not enough aura to place bid.' };

  let outbidUserId = null;
  let outbidGuildId = null;
  let outbidRefund = 0;

  if (listing.currentBidderId) {
    outbidUserId = listing.currentBidderId;
    outbidGuildId = listing.currentBidderGuildId;
    outbidRefund = listing.currentBid;
  }

  // Atomic update for bid
  const updatedListing = await AuctionListing.findOneAndUpdate(
    { _id: listingId, currentBid: listing.currentBid, status: 'active' },
    {
      $set: {
        currentBid: bidAmount,
        currentBidderId: bidderId,
        currentBidderGuildId: bidderGuildId
      },
      $inc: { bidCount: 1 }
    },
    { new: true }
  );

  if (!updatedListing) {
    return { error: 'Bid was rejected (someone else may have bid first).' };
  }

  // Deduct aura from new bidder
  await User.updateOne({ userId: bidderId, guildId: bidderGuildId }, { $inc: { aura: -bidAmount } });

  // Refund outbid user
  if (outbidUserId) {
    await User.updateOne({ userId: outbidUserId, guildId: outbidGuildId }, { $inc: { aura: outbidRefund } });
  }

  return { success: true, outbidUserId, outbidGuildId };
}

async function buyNow(buyerId, buyerGuildId, listingId) {
  const listing = await AuctionListing.findById(listingId);
  if (!listing) return { error: 'Listing not found.' };
  if (listing.status !== 'active') return { error: 'Listing is not active.' };
  if (listing.expiresAt < new Date()) return { error: 'Listing has expired.' };
  if (!listing.buyNowPrice) return { error: 'Listing does not have a buy-now price.' };
  if (listing.sellerId === buyerId) return { error: 'You cannot buy your own listing.' };

  const buyer = await User.findOne({ userId: buyerId, guildId: buyerGuildId });
  if (!buyer) return { error: 'Buyer not found.' };
  if (buyer.aura < listing.buyNowPrice) return { error: 'Not enough aura for buy-now.' };

  const updatedListing = await AuctionListing.findOneAndUpdate(
    { _id: listingId, status: 'active' },
    {
      $set: {
        status: 'sold',
        soldAt: new Date(),
        soldTo: buyerId,
        finalPrice: listing.buyNowPrice
      }
    }
  );

  if (!updatedListing) return { error: 'Listing is no longer available.' };

  // Deduct from buyer
  await User.updateOne({ userId: buyerId, guildId: buyerGuildId }, { $inc: { aura: -listing.buyNowPrice } });

  // Refund current bidder if exists
  if (updatedListing.currentBidderId) {
    await User.updateOne(
      { userId: updatedListing.currentBidderId, guildId: updatedListing.currentBidderGuildId },
      { $inc: { aura: updatedListing.currentBid } }
    );
  }

  // Pay seller
  await User.updateOne(
    { userId: updatedListing.sellerId, guildId: updatedListing.sellerGuildId },
    { $inc: { aura: listing.buyNowPrice } }
  );

  // Transfer item to buyer
  await transferItem(buyerId, buyerGuildId, listing.itemType, listing.itemId, listing.quantity);

  return { success: true };
}

async function cancelListing(userId, listingId) {
  const listing = await AuctionListing.findById(listingId);
  if (!listing) return { error: 'Listing not found.' };
  if (listing.sellerId !== userId) return { error: 'You can only cancel your own listings.' };
  if (listing.status !== 'active') return { error: 'Listing is not active.' };

  const updatedListing = await AuctionListing.findOneAndUpdate(
    { _id: listingId, status: 'active' },
    { $set: { status: 'cancelled' } }
  );

  if (!updatedListing) return { error: 'Failed to cancel listing.' };

  // Refund current bidder if exists
  if (listing.currentBidderId) {
    await User.updateOne(
      { userId: listing.currentBidderId, guildId: listing.currentBidderGuildId },
      { $inc: { aura: listing.currentBid } }
    );
  }

  // Return item to seller
  await transferItem(listing.sellerId, listing.sellerGuildId, listing.itemType, listing.itemId, listing.quantity);

  return { success: true };
}

async function processExpiredAuctions() {
  const expiredListings = await AuctionListing.find({
    status: 'active',
    expiresAt: { $lte: new Date() }
  });

  for (const listing of expiredListings) {
    if (listing.currentBidderId) {
      // Complete sale
      listing.status = 'sold';
      listing.soldAt = new Date();
      listing.soldTo = listing.currentBidderId;
      listing.finalPrice = listing.currentBid;
      await listing.save();

      // Pay seller
      await User.updateOne(
        { userId: listing.sellerId, guildId: listing.sellerGuildId },
        { $inc: { aura: listing.currentBid } }
      );

      // Transfer item to winner
      await transferItem(listing.currentBidderId, listing.currentBidderGuildId, listing.itemType, listing.itemId, listing.quantity);
    } else {
      // Mark expired, return item
      listing.status = 'expired';
      await listing.save();
      await transferItem(listing.sellerId, listing.sellerGuildId, listing.itemType, listing.itemId, listing.quantity);
    }
  }
}

async function searchListings({ itemType, itemId, sortBy, page = 1, limit = 10 }) {
  const query = { status: 'active' };
  if (itemType) query.itemType = itemType;
  if (itemId) query.itemId = itemId;

  let sortCriteria = {};
  switch (sortBy) {
    case 'price_asc':
      sortCriteria = { currentBid: 1, startingPrice: 1 };
      break;
    case 'price_desc':
      sortCriteria = { currentBid: -1, startingPrice: -1 };
      break;
    case 'ending_soon':
      sortCriteria = { expiresAt: 1 };
      break;
    case 'newest':
    default:
      sortCriteria = { _id: -1 };
      break;
  }

  const skip = (page - 1) * limit;
  const listings = await AuctionListing.find(query).sort(sortCriteria).skip(skip).limit(limit).lean();
  const total = await AuctionListing.countDocuments(query);

  return {
    listings,
    total,
    page,
    pages: Math.ceil(total / limit)
  };
}

async function getUserListings(userId, status = 'active') {
  return await AuctionListing.find({ sellerId: userId, status }).lean();
}

async function getUserBids(userId) {
  return await AuctionListing.find({ currentBidderId: userId, status: 'active' }).lean();
}

async function getListingById(listingId) {
  return await AuctionListing.findById(listingId).lean();
}

function formatListingDisplay(listing) {
  let description = `**Item:** ${listing.quantity}x ${listing.itemId} (${listing.itemType})\n`;
  description += `**Seller:** <@${listing.sellerId}>\n`;
  
  if (listing.currentBid > 0) {
    description += `**Current Bid:** ${listing.currentBid} Aura (by <@${listing.currentBidderId}>)\n`;
  } else {
    description += `**Starting Price:** ${listing.startingPrice} Aura\n`;
  }

  if (listing.buyNowPrice) {
    description += `**Buy-Now Price:** ${listing.buyNowPrice} Aura\n`;
  }

  description += `**Ends In:** ${formatTimeRemaining(listing.expiresAt)}`;

  return {
    title: `Auction: ${listing.itemId}`,
    description,
    fields: []
  };
}

function formatTimeRemaining(expiresAt) {
  const diff = new Date(expiresAt) - new Date();
  if (diff <= 0) return 'Ended';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

// Helper to add items back to a user
async function transferItem(userId, guildId, itemType, itemId, quantity) {
  const user = await User.findOne({ userId, guildId });
  if (!user) return; // Edge case: user deleted

  if (itemType === 'material' || itemType === 'pet_food') {
    const item = user.inventory.find(i => i.itemId === itemId);
    if (item) {
      item.quantity += quantity;
    } else {
      user.inventory.push({ itemId, quantity });
    }
  } else if (itemType === 'crate') {
    const count = user.crates.get(itemId) || 0;
    user.crates.set(itemId, count + quantity);
  } else if (itemType === 'relic') {
    for (let i = 0; i < quantity; i++) {
      user.relics.push({ relicId: itemId });
    }
  } else if (itemType === 'cosmetic') {
    for (let i = 0; i < quantity; i++) {
      user.cosmetics.push({ cosmeticId: itemId });
    }
  }
  await user.save();
}

module.exports = {
  createListing,
  saveListing,
  placeBid,
  buyNow,
  cancelListing,
  processExpiredAuctions,
  searchListings,
  getUserListings,
  getUserBids,
  getListingById,
  formatListingDisplay,
  formatTimeRemaining
};
