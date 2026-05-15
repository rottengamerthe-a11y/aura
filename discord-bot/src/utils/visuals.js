const fs = require("fs");
const path = require("path");
const { AttachmentBuilder, EmbedBuilder } = require("discord.js");
const { COLORS, VISUALS_DIR } = require("../config/gameConfig");
const { buildThemeBannerAttachment } = require("./cosmeticArt");

const DIVIDER = "\u2501".repeat(20);
const FOOTER_PREFIX = "AURIX";
const HUD_VERSION = "Live";

const EMBED_THEMES = [
  { match: /alert|invalid|failed|locked|cooling down|missing|blocked|not enough/i, emoji: "\u26A0\uFE0F", color: COLORS.warning, label: "ALERT", iconEnv: "AURIX_ICON_ALERT" },
  { match: /success|claimed|joined|opened|complete|crafted|equipped|purchased|victory|finished/i, emoji: "\u2705", color: COLORS.success, label: "SUCCESS", iconEnv: "AURIX_ICON_SUCCESS" },
  { match: /clan|raid|war/i, emoji: "\u{1F6E1}\uFE0F", color: 0x7dd3fc, label: "CLAN", iconEnv: "AURIX_ICON_CLAN" },
  { match: /vault|economy|shop|buy|gift|deposit|withdraw|donat|aura|balance/i, emoji: "\u{1F4B0}", color: 0xf4c95d, label: "ECONOMY", iconEnv: "AURIX_ICON_ECONOMY" },
  { match: /mine|craft|gear|garden|crop|harvest/i, emoji: "\u{1F33F}", color: 0x74d680, label: "GATHERING", iconEnv: "AURIX_ICON_GATHERING" },
  { match: /pvp|boss|skill|battle|authority|duel/i, emoji: "\u2694\uFE0F", color: COLORS.danger, label: "COMBAT", iconEnv: "AURIX_ICON_COMBAT" },
  { match: /rank|prestige|leaderboard|profile|stats/i, emoji: "\u{1F3C6}", color: 0xa78bfa, label: "PROGRESS", iconEnv: "AURIX_ICON_PROGRESS" },
  { match: /quest|help|guide|setup|start|crate|inventory|premium/i, emoji: "\u2728", color: COLORS.primary, label: "AURIX", iconEnv: "AURIX_ICON_AURIX" },
];

const FIELD_NAME_MARKS = ["\u{1F539}", "\u{1F538}", "\u2726", "\u{1F4A0}", "\u25AA"];
const COMMAND_ICON_RULES = [
  { match: /spin|spinner|arcade/i, env: "AURIX_CMD_ICON_SPIN" },
  { match: /daily|streak/i, env: "AURIX_CMD_ICON_DAILY" },
  { match: /work|shift/i, env: "AURIX_CMD_ICON_WORK" },
  { match: /mine|mining/i, env: "AURIX_CMD_ICON_MINE" },
  { match: /coinflip|flip/i, env: "AURIX_CMD_ICON_COINFLIP" },
  { match: /vault|deposit|withdraw/i, env: "AURIX_CMD_ICON_VAULT" },
  { match: /shop|buy|purchase|item/i, env: "AURIX_CMD_ICON_SHOP" },
  { match: /inventory/i, env: "AURIX_CMD_ICON_INVENTORY" },
  { match: /profile/i, env: "AURIX_CMD_ICON_PROFILE" },
  { match: /stats/i, env: "AURIX_CMD_ICON_STATS" },
  { match: /rank/i, env: "AURIX_CMD_ICON_RANK" },
  { match: /prestige/i, env: "AURIX_CMD_ICON_PRESTIGE" },
  { match: /leaderboard|top/i, env: "AURIX_CMD_ICON_LEADERBOARD" },
  { match: /clan/i, env: "AURIX_CMD_ICON_CLAN" },
  { match: /raid|war/i, env: "AURIX_CMD_ICON_RAID" },
  { match: /boss/i, env: "AURIX_CMD_ICON_BOSS" },
  { match: /pvp|duel/i, env: "AURIX_CMD_ICON_PVP" },
  { match: /skill|combat kit/i, env: "AURIX_CMD_ICON_SKILLS" },
  { match: /craft/i, env: "AURIX_CMD_ICON_CRAFT" },
  { match: /garden|crop|harvest/i, env: "AURIX_CMD_ICON_GARDEN" },
  { match: /gear|loadout/i, env: "AURIX_CMD_ICON_GEAR" },
  { match: /crate/i, env: "AURIX_CMD_ICON_CRATE" },
  { match: /quest/i, env: "AURIX_CMD_ICON_QUESTS" },
  { match: /achievement/i, env: "AURIX_CMD_ICON_ACHIEVEMENTS" },
  { match: /premium|membership/i, env: "AURIX_CMD_ICON_PREMIUM" },
  { match: /setup/i, env: "AURIX_CMD_ICON_SETUP" },
  { match: /help|guide/i, env: "AURIX_CMD_ICON_HELP" },
  { match: /alert|failed|invalid|locked|cooling down|missing|blocked/i, env: "AURIX_CMD_ICON_ALERT" },
];

function buildAttachment(fileName) {
  const extension = path.extname(fileName || "").toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(extension)) {
    return null;
  }

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

function getCommandIcon(options = {}) {
  const text = [options.title, options.description, options.footer, options.visual].filter(Boolean).join(" ");
  const rule = COMMAND_ICON_RULES.find(({ match }) => match.test(text));
  return rule ? process.env[rule.env] : null;
}

function getThemeIcon(theme, options = {}) {
  const commandIcon = getCommandIcon(options);
  if (commandIcon) {
    return commandIcon;
  }
  const customIcon = theme.iconEnv ? process.env[theme.iconEnv] : null;
  return customIcon || theme.emoji || "\u2728";
}

function pickMark(index = 0) {
  const customIcon = process.env[`AURIX_FIELD_ICON_${index + 1}`];
  return customIcon || FIELD_NAME_MARKS[index % FIELD_NAME_MARKS.length];
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

function formatTitle(title, theme, options) {
  if (!title) {
    return `${getThemeIcon(theme, options)} AURIX`;
  }

  const cleanTitle = title.replace(/\s+/g, " ").trim();
  return hasLeadingEmoji(cleanTitle)
    ? cleanTitle
    : `${getThemeIcon(theme, options)} ${cleanTitle}`;
}

function isPreformattedLine(line) {
  return /^\s*(```|`|>|[-*]|\d+\.|[\u2022\u25E6\u25AA\u25B8\u25C6\u25C7\u2726\u2B25\u25A3])/u.test(line);
}

function decorateDescription(description, theme, options) {
  if (!description) {
    return [
      `${getThemeIcon(theme, options)} **${theme.label}**`,
      DIVIDER,
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
    `${getThemeIcon(theme, options)} **${theme.label}**`,
    DIVIDER,
    body,
  ].join("\n");
}

function decorateFields(fields) {
  return fields.map((field, index) => ({
    ...field,
    name: decorateText(field.name, pickMark(index)),
    value: field.value || "No data.",
  }));
}

function createGameEmbed({ title, description, color = COLORS.primary, fields = [], footer, visual, thumbnail }) {
  const options = { title, description, footer, visual };
  const theme = pickEmbedTheme(options);
  const embed = new EmbedBuilder()
    .setColor(color === COLORS.primary ? theme.color : color)
    .setAuthor({ name: "Aurix" })
    .setTitle(formatTitle(title, theme, options))
    .setDescription(decorateDescription(description, theme, options))
    .setFooter({ text: footer ? `${FOOTER_PREFIX} \u2022 ${footer}` : `${FOOTER_PREFIX} \u2022 ${theme.label}` })
    .setTimestamp();

  if (fields.length) {
    embed.addFields(decorateFields(fields));
  }

  if (visual) {
    embed.setImage(`attachment://${visual}`);
  }
  if (thumbnail) {
    embed.setThumbnail(thumbnail);
  }

  return embed;
}

function buildEmbedPayload(options) {
  const attachment = options.visual ? buildAttachment(options.visual) : null;
  const theme = pickEmbedTheme(options || {});
  const themeBanner = options.banner === false || attachment ? null : buildThemeBannerAttachment(theme);
  const embed = createGameEmbed({ ...options, visual: attachment ? options.visual : null });
  const payload = { embeds: [embed] };

  if (attachment) {
    payload.files = [attachment];
  } else if (themeBanner) {
    const fileName = themeBanner.name;
    payload.files = [themeBanner];
    payload.embeds[0].setImage(`attachment://${fileName}`);
  }

  return payload;
}

module.exports = {
  buildAttachment,
  buildEmbedPayload,
  createGameEmbed,
};
