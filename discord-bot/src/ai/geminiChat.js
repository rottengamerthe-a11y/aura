const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.0-flash'; // fast and cheap
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

// Rate limiting per user
const userCooldowns = new Map();
const COOLDOWN_MS = 15 * 1000; // 15 seconds between AI calls per user
const MAX_TOKENS = 200; // keep responses short
const DAILY_LIMIT = 20; // max AI calls per user per day
const dailyUsage = new Map(); // userId -> { count, resetDate }

// System prompts for different NPC personalities
const NPC_PERSONALITIES = {
  merchant: {
    name: 'Zephyr the Merchant',
    emoji: '🏪',
    systemPrompt: `You are Zephyr, a quirky traveling merchant in a fantasy Discord RPG called Aurix. You speak in a theatrical, slightly mysterious way. You love haggling and dropping hints about rare items. Keep responses under 3 sentences. Never break character. You can:
- Give shopping advice about items in the game
- Share rumors about rare drops and hidden features
- React dramatically to the player's inventory or wealth
- Tease upcoming features as "merchant gossip"
Do NOT reveal exact game mechanics or numbers. Be entertaining.`,
  },
  sage: {
    name: 'Elder Minos',
    emoji: '📚',
    systemPrompt: `You are Elder Minos, a wise old sage in the Aurix RPG. You speak in calm, measured tones with occasional proverbs. You help players understand game strategy. Keep responses under 3 sentences. Never break character. You can:
- Give strategic advice about which activities to focus on
- Explain the benefits of different progression paths
- Share wisdom about economy management (saving, investing in vault)
- Encourage patience and consistent play
Do NOT reveal exact formulas. Be wise and encouraging.`,
  },
  trickster: {
    name: 'Jinx',
    emoji: '🃏',
    systemPrompt: `You are Jinx, a chaotic trickster spirit in the Aurix RPG. You speak in riddles, use lots of emojis, and love chaos. Keep responses under 3 sentences. Never break character. You can:
- Challenge players to gamble or take risks
- Drop cryptic hints about secret features
- Mock players playfully for being cautious
- Encourage risky plays (rob, coinflip, casino)
Be entertaining and mischievous, never mean.`,
  },
  warrior: {
    name: 'Commander Theron',
    emoji: '⚔️',
    systemPrompt: `You are Commander Theron, a grizzled PvP veteran in the Aurix RPG. You speak like a military commander — direct, bold, motivational. Keep responses under 3 sentences. Never break character. You can:
- Give PvP and boss battle advice
- Motivate players to fight and compete
- Share tales of legendary battles
- Comment on a player's combat stats
Be inspiring and competitive.`,
  },
};

// Check rate limit
function checkRateLimit(userId) {
  const now = Date.now();
  // Cooldown check
  const lastUse = userCooldowns.get(userId);
  if (lastUse && now - lastUse < COOLDOWN_MS) {
    const remaining = Math.ceil((COOLDOWN_MS - (now - lastUse)) / 1000);
    return { allowed: false, error: `Please wait ${remaining}s before talking to NPCs again.` };
  }
  // Daily limit check
  const today = new Date().toISOString().slice(0, 10);
  const usage = dailyUsage.get(userId);
  if (usage && usage.resetDate === today && usage.count >= DAILY_LIMIT) {
    return { allowed: false, error: `You've reached your daily NPC chat limit (${DAILY_LIMIT}). Try again tomorrow!` };
  }
  return { allowed: true };
}

// Record usage
function recordUsage(userId) {
  userCooldowns.set(userId, Date.now());
  const today = new Date().toISOString().slice(0, 10);
  const usage = dailyUsage.get(userId) || { count: 0, resetDate: today };
  if (usage.resetDate !== today) { usage.count = 0; usage.resetDate = today; }
  usage.count++;
  dailyUsage.set(userId, usage);
}

// Build context from user data (non-sensitive summary)
function buildUserContext(user) {
  const lines = [];
  lines.push(`Player has ${user.aura?.toLocaleString() || 0} aura and ${user.xp?.toLocaleString() || 0} XP.`);
  if (user.prestige) lines.push(`Prestige level: ${user.prestige}.`);
  if (user.pet?.id) lines.push(`Has a pet: ${user.pet.name} (level ${user.pet.level}).`);
  if (user.dailyStreak) lines.push(`Daily streak: ${user.dailyStreak} days.`);
  if (user.premium?.active) lines.push(`Premium member.`);
  return lines.join(' ');
}

// Call Gemini API
async function callGemini(systemPrompt, userMessage, userContext = '') {
  if (!GEMINI_API_KEY) return { error: 'AI features are not configured.' };

  const fullSystem = `${systemPrompt}\n\nPlayer context: ${userContext}`;
  const body = {
    contents: [{ parts: [{ text: userMessage }] }],
    systemInstruction: { parts: [{ text: fullSystem }] },
    generationConfig: {
      maxOutputTokens: MAX_TOKENS,
      temperature: 0.9,
      topP: 0.95,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  };

  try {
    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return { error: `AI service error (${response.status}). Try again later.` };
    }
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { error: 'The NPC is speechless... try again.' };
    // Truncate to 500 chars max for safety
    return { text: text.slice(0, 500) };
  } catch (err) {
    return { error: 'Failed to reach the AI service. Try again later.' };
  }
}

// Main chat function
async function chatWithNPC(userId, npcId, message, user = null) {
  const npc = NPC_PERSONALITIES[npcId];
  if (!npc) return { error: 'Unknown NPC. Choose: merchant, sage, trickster, or warrior.' };

  const rateCheck = checkRateLimit(userId);
  if (!rateCheck.allowed) return { error: rateCheck.error };

  const userContext = user ? buildUserContext(user) : '';
  const result = await callGemini(npc.systemPrompt, message, userContext);
  if (result.error) return result;

  recordUsage(userId);
  return { text: result.text, npc: { name: npc.name, emoji: npc.emoji } };
}

// Get available NPCs
function getAvailableNPCs() {
  return Object.entries(NPC_PERSONALITIES).map(([id, npc]) => ({ id, name: npc.name, emoji: npc.emoji }));
}

// Get remaining daily uses
function getRemainingUses(userId) {
  const today = new Date().toISOString().slice(0, 10);
  const usage = dailyUsage.get(userId);
  if (!usage || usage.resetDate !== today) return DAILY_LIMIT;
  return Math.max(0, DAILY_LIMIT - usage.count);
}

module.exports = { chatWithNPC, getAvailableNPCs, getRemainingUses, NPC_PERSONALITIES, checkRateLimit };
