const fs = require("fs");
const path = require("path");
const { AttachmentBuilder, EmbedBuilder } = require("discord.js");
const { COLORS, VISUALS_DIR } = require("../config/gameConfig");

const DIVIDER = "\u2501".repeat(20);
const FOOTER_PREFIX = "AURIX";
const HUD_VERSION = "HUD v4";

const EMBED_THEMES = [
  { match: /alert|invalid|failed|locked|cooling down|missing|blocked|not enough/i, emoji: "\u26A0\uFE0F", color: COLORS.warning, label: "ALERT" },
  { match: /success|claimed|joined|opened|complete|crafted|equipped|purchased|victory|finished/i, emoji: "\u2705", color: COLORS.success, label: "SUCCESS" },
  { match: /clan|raid|war/i, emoji: "\u{1F6E1}\uFE0F", color: 0x7dd3fc, label: "CLAN" },
  { match: /vault|economy|shop|buy|gift|deposit|withdraw|donat|aura|balance/i, emoji: "\u{1F4B0}", color: 0xf4c95d, label: "ECONOMY" },
  { match: /mine|craft|gear|garden|crop|harvest/i, emoji: "\u{1F33F}", color: 0x74d680, label: "GATHERING" },
  { match: /pvp|boss|skill|battle|authority|duel/i, emoji: "\u2694\uFE0F", color: COLORS.danger, label: "COMBAT" },
  { match: /rank|prestige|leaderboard|profile|stats/i, emoji: "\u{1F3C6}", color: 0xa78bfa, label: "PROGRESS" },
  { match: /quest|help|guide|setup|start|crate|inventory|premium/i, emoji: "\u2728", color: COLORS.primary, label: "AURIX" },
];

const FIELD_NAME_MARKS = ["\u25C6", "\u25C7", "\u2726", "\u2B25", "\u25A3"];

function buildAttachment(fileName) {
  const filePath = path.join(VISUALS_DIR, fileName);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  return new AttachmentBuilder(filePath, { name: fileName });
}

function pickEmbedTheme({ title = "", description = "", footer = "", visual = "" }) {
  const text = [title, description, footer, visual].filter(Boolean).join(" ");
  return EMBED_THEMES.find(({ match }) => match.test(text)) || { emoji: "\u2728", color: COLORS.primary, label: "AURIX" };
}

function pickMark(index = 0) {
  return FIELD_NAME_MARKS[index % FIELD_NAME_MARKS.length];
}

function hasLeadingEmoji(text) {
  return /^[\p{Extended_Pictographic}\p{Emoji_Presentation}]/u.test(text.trim());
}

function decorateText(text, mark) {
  if (!text) {
    return text;
  }

  return hasLeadingEmoji(text) ? text : `${mark} ${text}`;
}

function formatTitle(title, theme) {
  if (!title) {
    return `${theme.emoji} AURIX`;
  }

  const cleanTitle = title.replace(/\s+/g, " ").trim();
  return hasLeadingEmoji(cleanTitle)
    ? cleanTitle
    : `${theme.emoji} [${HUD_VERSION}] ${theme.label} // ${cleanTitle.toUpperCase()}`;
}

function isPreformattedLine(line) {
  return /^\s*(```|`|>|[-*]|\d+\.|[\u2022\u25E6\u25AA\u25B8\u25C6\u25C7\u2726\u2B25\u25A3])/u.test(line);
}

function getSummaryLine(title, description) {
  const source = String(description || title || "Awaiting command result.")
    .split("\n")
    .map((line) => line.replace(/[`*_>]/g, "").trim())
    .find(Boolean);
  return source ? source.slice(0, 180) : "Awaiting command result.";
}

function decorateDescription(description, theme, title) {
  const summary = getSummaryLine(title, description);
  if (!description) {
    return [
      "```",
      `AURIX ${HUD_VERSION} | ${theme.label}`,
      `STATUS  ${summary}`,
      "```",
    ].join("\n");
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

  return [
    "```",
    `AURIX ${HUD_VERSION} | ${theme.label}`,
    `STATUS  ${summary}`,
    "```",
    body,
    DIVIDER,
  ].join("\n");
}

function decorateFields(fields) {
  return fields.map((field, index) => ({
    ...field,
    name: decorateText(field.name, pickMark(index)),
    value: field.value || "No data.",
  }));
}

function createGameEmbed({ title, description, color = COLORS.primary, fields = [], footer, visual }) {
  const theme = pickEmbedTheme({ title, description, footer, visual });
  const embed = new EmbedBuilder()
    .setColor(color === COLORS.primary ? theme.color : color)
    .setAuthor({ name: `${theme.label} MODULE | ${HUD_VERSION}` })
    .setTitle(formatTitle(title, theme))
    .setDescription(decorateDescription(description, theme, title))
    .setFooter({ text: footer ? `${FOOTER_PREFIX} \u2022 ${theme.label} \u2022 ${HUD_VERSION} \u2022 ${footer}` : `${FOOTER_PREFIX} \u2022 ${theme.label} \u2022 ${HUD_VERSION}` })
    .setTimestamp();

  if (fields.length) {
    embed.addFields(decorateFields(fields));
  }

  if (visual) {
    embed.setImage(`attachment://${visual}`);
  }

  return embed;
}

function buildEmbedPayload(options) {
  const attachment = options.visual ? buildAttachment(options.visual) : null;
  const embed = createGameEmbed(options);
  const payload = { embeds: [embed] };

  if (attachment) {
    payload.files = [attachment];
  }

  return payload;
}

module.exports = {
  buildAttachment,
  buildEmbedPayload,
  createGameEmbed,
};
