// src/game/casino.js

const BLACKJACK_MIN_BET = 500;
const SLOTS_MIN_BET = 200;
const SLOTS_MAX_BET = 25000;
const SCRATCH_CARD_COST = 2000;
const SCRATCH_CARD_PREMIUM_COST = 5000;

// --- BLACKJACK ---

const SUITS = [
    { name: 'hearts', emoji: '♥️' },
    { name: 'diamonds', emoji: '♦️' },
    { name: 'clubs', emoji: '♣️' },
    { name: 'spades', emoji: '♠️' }
];

const RANKS = [
    { name: 'A', value: 11 }, // Value is base, adjusted in calculateHandTotal
    { name: '2', value: 2 },
    { name: '3', value: 3 },
    { name: '4', value: 4 },
    { name: '5', value: 5 },
    { name: '6', value: 6 },
    { name: '7', value: 7 },
    { name: '8', value: 8 },
    { name: '9', value: 9 },
    { name: '10', value: 10 },
    { name: 'J', value: 10 },
    { name: 'Q', value: 10 },
    { name: 'K', value: 10 }
];

function createDeck() {
    let deck = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push({ suit: suit.name, emoji: suit.emoji, rank: rank.name, value: rank.value });
        }
    }
    // Shuffle
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function calculateHandTotal(hand) {
    let total = 0;
    let aces = 0;
    
    for (const card of hand) {
        if (card.rank === 'A') {
            aces += 1;
            total += 11;
        } else {
            total += card.value;
        }
    }
    
    while (total > 21 && aces > 0) {
        total -= 10;
        aces -= 1;
    }
    
    return total;
}

function formatHand(hand) {
    return hand.map(card => `${card.rank}${card.emoji}`).join(' ');
}

function startBlackjack(bet) {
    if (bet < BLACKJACK_MIN_BET) bet = BLACKJACK_MIN_BET;
    
    const deck = createDeck();
    const playerHand = [deck.pop(), deck.pop()];
    const dealerHand = [deck.pop(), deck.pop()];
    
    const gameId = Date.now().toString() + Math.random().toString(36).substring(7);
    
    // Check for player blackjack
    const playerTotal = calculateHandTotal(playerHand);
    let result = null;
    let payout = 0;
    let isGameOver = false;
    
    if (playerTotal === 21) {
        const dealerTotal = calculateHandTotal(dealerHand);
        if (dealerTotal === 21) {
            result = 'push';
            payout = bet;
        } else {
            result = 'blackjack';
            payout = bet * 2.5; // bet + 1.5x bet profit
        }
        isGameOver = true;
    }
    
    const game = {
        gameId,
        deck,
        playerHand,
        dealerHand,
        bet,
        canDoubleDown: playerHand.length === 2,
        isGameOver,
        result,
        payout
    };
    
    return game;
}

function blackjackHit(game) {
    game.playerHand.push(game.deck.pop());
    game.canDoubleDown = false;
    
    const total = calculateHandTotal(game.playerHand);
    let busted = false;
    
    if (total > 21) {
        busted = true;
        game.isGameOver = true;
        game.result = 'lose';
        game.payout = 0;
    } else if (total === 21) {
        // Auto stand
        return blackjackStand(game);
    }
    
    return {
        hand: game.playerHand,
        total,
        busted,
        gameId: game.gameId,
        game
    };
}

function blackjackStand(game) {
    let dealerTotal = calculateHandTotal(game.dealerHand);
    
    // Dealer hits on soft 17. (Soft 17 means total is 17 but includes an ace counting as 11)
    // Actually rule: stands on soft 17, so hits on < 17
    while (dealerTotal < 17) {
        game.dealerHand.push(game.deck.pop());
        dealerTotal = calculateHandTotal(game.dealerHand);
    }
    
    const playerTotal = calculateHandTotal(game.playerHand);
    
    let result = 'lose';
    let payout = 0;
    
    if (dealerTotal > 21 || playerTotal > dealerTotal) {
        result = 'win';
        payout = game.bet * 2;
    } else if (playerTotal === dealerTotal) {
        result = 'push';
        payout = game.bet;
    }
    
    game.isGameOver = true;
    game.result = result;
    game.payout = payout;
    
    return {
        playerTotal,
        dealerTotal,
        dealerHand: game.dealerHand,
        result,
        payout,
        game
    };
}

function blackjackDoubleDown(game) {
    game.bet *= 2;
    game.playerHand.push(game.deck.pop());
    
    const total = calculateHandTotal(game.playerHand);
    
    if (total > 21) {
        game.isGameOver = true;
        game.result = 'lose';
        game.payout = 0;
        return {
            playerTotal: total,
            dealerTotal: calculateHandTotal(game.dealerHand),
            dealerHand: game.dealerHand,
            result: 'lose',
            payout: 0,
            doubled: true,
            game
        };
    }
    
    const result = blackjackStand(game);
    result.doubled = true;
    return result;
}

function formatBlackjackResult(game, result) {
    return {
        playerHand: formatHand(game.playerHand),
        dealerHand: formatHand(game.dealerHand),
        playerTotal: calculateHandTotal(game.playerHand),
        dealerTotal: calculateHandTotal(game.dealerHand),
        result: game.result || result,
        payout: game.payout
    };
}

// --- SLOTS ---

const SLOT_SYMBOLS = [
  { id: 'crystal', emoji: '🔮', name: 'Aura Crystal', weight: 30, match3: 5, match2: 1.5 },
  { id: 'sword', emoji: '⚔️', name: 'Sword', weight: 25, match3: 8, match2: 2 },
  { id: 'shield', emoji: '🛡️', name: 'Shield', weight: 20, match3: 12, match2: 2.5 },
  { id: 'diamond', emoji: '💎', name: 'Diamond', weight: 12, match3: 20, match2: 3 },
  { id: 'star', emoji: '🌟', name: 'Star', weight: 8, match3: 35, match2: 4 },
  { id: 'seven', emoji: '7️⃣', name: 'Lucky Seven', weight: 5, match3: 50, match2: 5 },
];

function getRandomSlotSymbol() {
    const totalWeight = SLOT_SYMBOLS.reduce((sum, sym) => sum + sym.weight, 0);
    let rand = Math.random() * totalWeight;
    for (const sym of SLOT_SYMBOLS) {
        if (rand < sym.weight) return sym;
        rand -= sym.weight;
    }
    return SLOT_SYMBOLS[0];
}

function spinSlots(bet) {
    const reels = [getRandomSlotSymbol(), getRandomSlotSymbol(), getRandomSlotSymbol()];
    
    let multiplier = 0;
    
    if (reels[0].id === reels[1].id && reels[1].id === reels[2].id) {
        multiplier = reels[0].match3;
    } else if (reels[0].id === reels[1].id || reels[1].id === reels[2].id || reels[0].id === reels[2].id) {
        let matchedSym = reels[0].id === reels[1].id ? reels[0] : reels[2];
        multiplier = matchedSym.match2;
    }
    
    const payout = Math.floor(bet * multiplier);
    const isJackpot = reels[0].id === 'seven' && reels[1].id === 'seven' && reels[2].id === 'seven';
    const displayString = formatSlotDisplay(reels);
    
    return {
        reels,
        multiplier,
        payout,
        isJackpot,
        displayString
    };
}

function formatSlotDisplay(reels) {
    return `[ ${reels[0].emoji} | ${reels[1].emoji} | ${reels[2].emoji} ]`;
}

// --- SCRATCH CARDS ---

const SCRATCH_SYMBOLS = [
  { id: 'coin', emoji: '🪙', name: 'Coin', weight: 35, prize: 500 },
  { id: 'gem', emoji: '💎', name: 'Gem', weight: 25, prize: 2000 },
  { id: 'crown', emoji: '👑', name: 'Crown', weight: 15, prize: 5000 },
  { id: 'trophy', emoji: '🏆', name: 'Trophy', weight: 10, prize: 10000 },
  { id: 'star', emoji: '⭐', name: 'Star', weight: 8, prize: 25000 },
  { id: 'jackpot', emoji: '💰', name: 'Jackpot', weight: 4, prize: 50000 },
  { id: 'mega', emoji: '🎆', name: 'Mega Win', weight: 3, prize: 100000 },
];

function generateScratchCard(isPremium = false) {
    const grid = [];
    const counts = {};
    
    const activeSymbols = SCRATCH_SYMBOLS.map(sym => {
        return {
            ...sym,
            weight: isPremium && sym.prize >= 10000 ? sym.weight * 2 : sym.weight
        };
    });
    
    const totalWeight = activeSymbols.reduce((sum, sym) => sum + sym.weight, 0);
    
    for (let i = 0; i < 9; i++) {
        let rand = Math.random() * totalWeight;
        let selectedSym = activeSymbols[0];
        
        for (const sym of activeSymbols) {
            if (rand < sym.weight) {
                selectedSym = sym;
                break;
            }
            rand -= sym.weight;
        }
        
        grid.push(selectedSym);
        counts[selectedSym.id] = (counts[selectedSym.id] || 0) + 1;
    }
    
    let prize = 0;
    let isWinner = false;
    let matches = [];
    
    for (const [id, count] of Object.entries(counts)) {
        if (count >= 3) {
            const sym = SCRATCH_SYMBOLS.find(s => s.id === id);
            prize += sym.prize;
            isWinner = true;
            matches.push(sym);
        }
    }
    
    return {
        grid,
        matches,
        prize,
        isWinner
    };
}

function formatScratchCardDisplay(grid) {
    return `${grid[0].emoji} ${grid[1].emoji} ${grid[2].emoji}\n${grid[3].emoji} ${grid[4].emoji} ${grid[5].emoji}\n${grid[6].emoji} ${grid[7].emoji} ${grid[8].emoji}`;
}

module.exports = {
    BLACKJACK_MIN_BET,
    SLOTS_MIN_BET,
    SLOTS_MAX_BET,
    SCRATCH_CARD_COST,
    SCRATCH_CARD_PREMIUM_COST,
    SLOT_SYMBOLS,
    SCRATCH_SYMBOLS,
    
    startBlackjack,
    blackjackHit,
    blackjackStand,
    blackjackDoubleDown,
    calculateHandTotal,
    formatHand,
    formatBlackjackResult,
    
    spinSlots,
    formatSlotDisplay,
    
    generateScratchCard,
    formatScratchCardDisplay
};
