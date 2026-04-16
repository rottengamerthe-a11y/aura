const fs = require("fs");
const path = require("path");
const { AttachmentBuilder, EmbedBuilder } = require("discord.js");
const { COLORS, VISUALS_DIR } = require("../config/gameConfig");

function buildAttachment(fileName) {
  const filePath = path.join(VISUALS_DIR, fileName);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  return new AttachmentBuilder(filePath, { name: fileName });
}

function createGameEmbed({ title, description, color = COLORS.primary, fields = [], footer, visual }) {
  const embed = new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).addFields(fields);

  if (footer) {
    embed.setFooter({ text: footer });
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
