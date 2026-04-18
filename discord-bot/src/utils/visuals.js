const fs = require("fs");
const path = require("path");
const { AttachmentBuilder, EmbedBuilder } = require("discord.js");
const { COLORS, VISUALS_DIR } = require("../config/gameConfig");

const EMBED_THEME_EMOJIS = [
  { match: /clan|raid|war/i, emoji: "🛡️" },
  { match: /vault|economy|shop|buy|gift|deposit|withdraw|donat/i, emoji: "💰" },
  { match: /mine|craft|gear|garden|crop|harvest/i, emoji: "🌿" },
  { match: /pvp|boss|skill|battle|authority/i, emoji: "⚔️" },
  { match: /rank|prestige|leaderboard|profile|stats/i, emoji: "🏆" },
  { match: /quest|help|guide|setup|start|crate|inventory/i, emoji: "✨" },
  { match: /alert|invalid|failed|locked|cooling down|missing|blocked/i, emoji: "⚠️" },
];

function buildAttachment(fileName) {
  const filePath = path.join(VISUALS_DIR, fileName);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  return new AttachmentBuilder(filePath, { name: fileName });
}

function pickEmbedEmoji({ title = "", description = "", footer = "", visual = "" }) {
  const text = [title, description, footer, visual].filter(Boolean).join(" ");
  const themed = EMBED_THEME_EMOJIS.find(({ match }) => match.test(text));
  return themed ? themed.emoji : "✨";
}

function hasLeadingEmoji(text) {
  return /^[\p{Extended_Pictographic}\p{Emoji_Presentation}]/u.test(text.trim());
}

function decorateText(text, emoji) {
  if (!text) {
    return text;
  }

  return hasLeadingEmoji(text) ? text : `${emoji} ${text}`;
}

function decorateDescription(description, emoji) {
  if (!description) {
    return description;
  }

  const lines = description.split("\n");
  return lines
    .map((line) => {
      if (!line.trim() || /^\s*[•\-*>`]/.test(line) || hasLeadingEmoji(line)) {
        return line;
      }

      return `${emoji} ${line}`;
    })
    .join("\n");
}

function decorateFields(fields, emoji) {
  return fields.map((field) => ({
    ...field,
    name: decorateText(field.name, emoji),
    value: decorateDescription(field.value, "•"),
  }));
}

function createGameEmbed({ title, description, color = COLORS.primary, fields = [], footer, visual }) {
  const emoji = pickEmbedEmoji({ title, description, footer, visual });
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(decorateText(title, emoji))
    .setDescription(decorateDescription(description, emoji))
    .addFields(decorateFields(fields, emoji));

  if (footer) {
    embed.setFooter({ text: decorateText(footer, "✦") });
  }

  if (visual) {
    embed.setImage(`attachment://${visual}`);
  }

  return embed;
}

function buildEmbedPayload(options) {
  const attachment = options.visual ? buildAttachment(options.visual) : null;
  const embed = createGameEmbed(options);
  return attachment ? { embeds: [embed], files: [attachment] } : { embeds: [embed] };
}

module.exports = {
  buildAttachment,
  buildEmbedPayload,
  createGameEmbed,
};
