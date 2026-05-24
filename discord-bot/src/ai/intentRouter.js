const INTENT_PATTERNS = [
  { intent: "help", pattern: /\b(help|what can|how do|commands?)\b/i, command: "/help" },
  { intent: "profile", pattern: /\b(profile|stats|who am i|my progress)\b/i, command: "/profile" },
  { intent: "world", pattern: /\b(world|story|faction|season|encounter)\b/i, command: "/world status" },
  { intent: "recap", pattern: /\b(recap|share|summary|what happened|story so far)\b/i, command: "/world recap" },
  { intent: "artifact", pattern: /\b(artifact|relic|server item|server symbol)\b/i, command: "/world artifact" },
  { intent: "relic", pattern: /\b(relic inspect|relic evolve|relic history|corrupted relic|purify relic|owned relic)\b/i, command: "/relic inspect" },
  { intent: "yearbook", pattern: /\b(yearbook|monthly|spotlight|highlights|wrapped)\b/i, command: "/yearbook" },
  { intent: "challenge", pattern: /\b(challenge|contest|prompt|creator|fanart|meme|clip)\b/i, command: "/challenge status" },
  { intent: "memoryquest", pattern: /\b(memory|remember|lore quest|chronicle)\b/i, command: "/memoryquest status" },
  { intent: "social", pattern: /\b(social|reputation|rep|helper|identity)\b/i, command: "/social" },
  { intent: "gallery", pattern: /\b(gallery|showcase|server card|identity card)\b/i, command: "/gallery" },
  { intent: "partyquest", pattern: /\b(co-?op|party|team expedition|group quest)\b/i, command: "/partyquest status" },
  { intent: "weather", pattern: /\b(weather|mood|vibe|server mood)\b/i, command: "/weather" },
  { intent: "letter", pattern: /\b(letter|npc|message from|faction letter)\b/i, command: "/letter" },
  { intent: "shrine", pattern: /\b(shrine|restore|ritual|activity)\b/i, command: "/shrine" },
  { intent: "appreciate", pattern: /\b(thank|appreciate|shoutout|kindness|helped me)\b/i, command: "/appreciate" },
  { intent: "campfire", pattern: /\b(campfire|memory|gratitude|prompt|share moment)\b/i, command: "/campfire status" },
  { intent: "identity", pattern: /\b(identity|motto|values|server culture|symbol)\b/i, command: "/identity view" },
  { intent: "faction", pattern: /\b(faction|warboard|pledge|influence|strike)\b/i, command: "/faction status" },
  { intent: "flex", pattern: /\b(flex|power score|prestige card|show off|status card)\b/i, command: "/flex" },
  { intent: "blackmarket", pattern: /\b(black ?market|contraband|rare drop|illegal|market heat)\b/i, command: "/blackmarket status" },
  { intent: "bounty", pattern: /\b(bounty|revenge|hunt|wanted|contract)\b/i, command: "/bounty status" },
  { intent: "heist", pattern: /\b(rob|heist|steal|raid wallet|revenge hit)\b/i, command: "/rob" },
  { intent: "project", pattern: /\b(project|community goal|donate|contribute)\b/i, command: "/project status" },
  { intent: "inventory", pattern: /\b(inventory|items|crates|materials)\b/i, command: "/inventory" },
  { intent: "economy", pattern: /\b(balance|wallet|vault|aura|money)\b/i, command: "/balance" },
];

function classifyIntent(text) {
  const content = String(text || "").trim();
  if (!content) {
    return null;
  }

  const match = INTENT_PATTERNS.find((entry) => entry.pattern.test(content));
  if (!match) {
    return {
      intent: "unknown",
      confidence: 0.2,
      command: "/help",
      response: "I can help with profiles, world story, projects, inventory, and economy. Try /help for the full menu.",
    };
  }

  return {
    intent: match.intent,
    confidence: 0.75,
    command: match.command,
    response: `That sounds like **${match.command}**.`,
  };
}

module.exports = { classifyIntent };
