const fs = require("fs");
const path = require("path");
const { AttachmentBuilder, EmbedBuilder } = require("discord.js");
const { COLORS, VISUALS_DIR } = require("../config/gameConfig");

const EMBED_THEME_EMOJIS = [
  { match: /clan|raid|war/i, emoji: "\u{1F6E1}\uFE0F" },
  { match: /vault|economy|shop|buy|gift|deposit|withdraw|donat/i, emoji: "\u{1F4B0}" },
  { match: /mine|craft|gear|garden|crop|harvest/i, emoji: "\u{1F33F}" },
  { match: /pvp|boss|skill|battle|authority/i, emoji: "\u2694\uFE0F" },
  { match: /rank|prestige|leaderboard|profile|stats/i, emoji: "\u{1F3C6}" },
  { match: /quest|help|guide|setup|start|crate|inventory/i, emoji: "\u2728" },
  { match: /alert|invalid|failed|locked|cooling down|missing|blocked/i, emoji: "\u26A0\uFE0F" },
];

const DESCRIPTION_EMOJIS = ["\u2728", "\u{1F539}", "\u{1F4AB}", "\u{1F31F}", "\u{1F338}"];
const FIELD_NAME_EMOJIS = ["\u{1F539}", "\u{1F538}", "\u2726", "\u{1F4A0}", "\u{1F3F7}\uFE0F"];
const FIELD_VALUE_EMOJIS = ["\u2022", "\u25E6", "\u25AA", "\u25B8", "\u25AB"];
const FOOTER_EMOJIS = ["\u2726", "\u2727", "\u2756"];

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
  return themed ? themed.emoji : "\u2728";
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

function decorateFields(fields, themeEmoji) {
  return fields.map((field, index) => ({
    ...field,
    name: decorateText(field.name, pickEmoji(FIELD_NAME_EMOJIS, index) || themeEmoji),
    value: decorateDescription(field.value, pickEmoji(FIELD_VALUE_EMOJIS, index)),
  }));
}

function createGameEmbed({ title, description, color = COLORS.primary, fields = [], footer, visual }) {
  const themeEmoji = pickEmbedEmoji({ title, description, footer, visual });
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(decorateText(title, themeEmoji))
    .setDescription(decorateDescription(description, pickEmoji(DESCRIPTION_EMOJIS)))
    .addFields(decorateFields(fields, themeEmoji));

  if (footer) {
    embed.setFooter({ text: decorateText(footer, pickEmoji(FOOTER_EMOJIS)) });
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
