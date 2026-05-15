const fs = require("fs");
const path = require("path");
const { AttachmentBuilder, EmbedBuilder } = require("discord.js");
const { COLORS, VISUALS_DIR } = require("../config/gameConfig");

const DIVIDER = "━━━━━━━━━━━━━━━━━━━━";
const FOOTER_PREFIX = "AURIX";

const EMBED_THEMES = [
  { match: /alert|invalid|failed|locked|cooling down|missing|blocked|not enough/i, emoji: "⚠️", color: COLORS.warning, label: "ALERT" },
  { match: /success|claimed|joined|opened|complete|crafted|equipped|purchased|victory|finished/i, emoji: "✅", color: COLORS.success, label: "SUCCESS" },
  { match: /clan|raid|war/i, emoji: "🛡️", color: 0x7dd3fc, label: "CLAN" },
  { match: /vault|economy|shop|buy|gift|deposit|withdraw|donat|aura|balance/i, emoji: "💰", color: 0xf4c95d, label: "ECONOMY" },
  { match: /mine|craft|gear|garden|crop|harvest/i, emoji: "🌿", color: 0x74d680, label: "GATHERING" },
  { match: /pvp|boss|skill|battle|authority|duel/i, emoji: "⚔️", color: COLORS.danger, label: "COMBAT" },
  { match: /rank|prestige|leaderboard|profile|stats/i, emoji: "🏆", color: 0xa78bfa, label: "PROGRESS" },
  { match: /quest|help|guide|setup|start|crate|inventory|premium/i, emoji: "✨", color: COLORS.primary, label: "AURIX" },
];

const FIELD_NAME_EMOJIS = ["◆", "◇", "✦", "⬥", "▣"];

function buildAttachment(fileName) {
  const filePath = path.join(VISUALS_DIR, fileName);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  return new AttachmentBuilder(filePath, { name: fileName });
}

function pickEmbedTheme({ title = "", description = "", footer = "", visual = "" }) {
  const text = [title, description, footer, visual].filter(Boolean).join(" ");
  return EMBED_THEMES.find(({ match }) => match.test(text)) || { emoji: "✨", color: COLORS.primary, label: "AURIX" };
}

function pickEmoji(list, index = 0) {
  return list[index % list.length];
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

function formatTitle(title, theme) {
  if (!title) {
    return `${theme.emoji} AURIX`;
  }

  const cleanTitle = title.replace(/\s+/g, " ").trim();
  return hasLeadingEmoji(cleanTitle)
    ? cleanTitle
    : `${theme.emoji} ${theme.label} // ${cleanTitle.toUpperCase()}`;
}

function isPreformattedLine(line) {
  return /^\s*(```|`|>|[-*]|\d+\.|[•◦▪▸◆◇✦⬥▣])/u.test(line);
}

function decorateDescription(description) {
  if (!description) {
    return DIVIDER;
  }

  const body = description
    .split("\n")
    .map((line) => {
      if (!line.trim() || isPreformattedLine(line) || hasLeadingEmoji(line)) {
        return line;
      }

      return `> ${line}`;
    })
    .join("\n");

  return `${DIVIDER}\n${body}\n${DIVIDER}`;
}

function decorateFields(fields, themeEmoji) {
  return fields.map((field, index) => ({
    ...field,
    name: decorateText(field.name, pickEmoji(FIELD_NAME_EMOJIS, index) || themeEmoji),
    value: field.value || "No data.",
  }));
}

function createGameEmbed({ title, description, color = COLORS.primary, fields = [], footer, visual }) {
  const theme = pickEmbedTheme({ title, description, footer, visual });
  const embed = new EmbedBuilder()
    .setColor(color === COLORS.primary ? theme.color : color)
    .setTitle(formatTitle(title, theme))
    .setDescription(decorateDescription(description))
    .setFooter({ text: footer ? `${FOOTER_PREFIX} • ${footer}` : `${FOOTER_PREFIX} • ${theme.label}` })
    .setTimestamp();

  if (fields.length) {
    embed.addFields(decorateFields(fields, theme.emoji));
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
