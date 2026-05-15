const zlib = require("zlib");
const { AttachmentBuilder } = require("discord.js");

const WIDTH = 720;
const HEIGHT = 220;
const FILE_NAME = "aurix-profile-cosmetic.png";

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(width, height, pixels) {
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    header,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function rgb(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function createCanvas(colorA, colorB) {
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 4);
  const start = rgb(colorA);
  const end = rgb(colorB);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const t = (x / WIDTH) * 0.75 + (y / HEIGHT) * 0.25;
      const index = (y * WIDTH + x) * 4;
      pixels[index] = mix(start[0], end[0], t);
      pixels[index + 1] = mix(start[1], end[1], t);
      pixels[index + 2] = mix(start[2], end[2], t);
      pixels[index + 3] = 255;
    }
  }
  return pixels;
}

function setPixel(pixels, x, y, color, alpha = 255) {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
  const [r, g, b] = rgb(color);
  const index = (Math.floor(y) * WIDTH + Math.floor(x)) * 4;
  pixels[index] = r;
  pixels[index + 1] = g;
  pixels[index + 2] = b;
  pixels[index + 3] = alpha;
}

function fillRect(pixels, x, y, width, height, color, alpha = 255) {
  for (let row = y; row < y + height; row += 1) {
    for (let col = x; col < x + width; col += 1) {
      setPixel(pixels, col, row, color, alpha);
    }
  }
}

function strokeRect(pixels, x, y, width, height, color, thickness = 4) {
  fillRect(pixels, x, y, width, thickness, color);
  fillRect(pixels, x, y + height - thickness, width, thickness, color);
  fillRect(pixels, x, y, thickness, height, color);
  fillRect(pixels, x + width - thickness, y, thickness, height, color);
}

function fillPolygon(pixels, points, color) {
  const minY = Math.max(0, Math.floor(Math.min(...points.map((point) => point[1]))));
  const maxY = Math.min(HEIGHT - 1, Math.ceil(Math.max(...points.map((point) => point[1]))));
  for (let y = minY; y <= maxY; y += 1) {
    const intersections = [];
    for (let i = 0; i < points.length; i += 1) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        intersections.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    intersections.sort((a, b) => a - b);
    for (let i = 0; i < intersections.length; i += 2) {
      for (let x = Math.floor(intersections[i]); x <= Math.ceil(intersections[i + 1]); x += 1) {
        setPixel(pixels, x, y, color);
      }
    }
  }
}

function drawDiamond(pixels, cx, cy, radius, color) {
  fillPolygon(pixels, [[cx, cy - radius], [cx + radius, cy], [cx, cy + radius], [cx - radius, cy]], color);
}

function drawBolt(pixels, x, y, scale, color) {
  fillPolygon(pixels, [
    [x + 34 * scale, y],
    [x + 8 * scale, y + 76 * scale],
    [x + 42 * scale, y + 68 * scale],
    [x + 22 * scale, y + 138 * scale],
    [x + 90 * scale, y + 42 * scale],
    [x + 52 * scale, y + 50 * scale],
  ], color);
}

function drawCrown(pixels, x, y, scale, color) {
  fillRect(pixels, x, y + 84 * scale, 112 * scale, 24 * scale, color);
  fillPolygon(pixels, [[x, y + 84 * scale], [x + 24 * scale, y + 18 * scale], [x + 44 * scale, y + 84 * scale]], color);
  fillPolygon(pixels, [[x + 34 * scale, y + 84 * scale], [x + 56 * scale, y], [x + 78 * scale, y + 84 * scale]], color);
  fillPolygon(pixels, [[x + 68 * scale, y + 84 * scale], [x + 92 * scale, y + 18 * scale], [x + 112 * scale, y + 84 * scale]], color);
}

function drawGoldFrame(pixels) {
  strokeRect(pixels, 16, 16, WIDTH - 32, HEIGHT - 32, 0xffc857, 8);
  strokeRect(pixels, 30, 30, WIDTH - 60, HEIGHT - 60, 0x8f5f12, 3);
  [[58, 58], [WIDTH - 58, 58], [58, HEIGHT - 58], [WIDTH - 58, HEIGHT - 58]].forEach(([x, y]) => {
    drawDiamond(pixels, x, y, 18, 0xfff1a6);
  });
}

function drawStormFrame(pixels) {
  strokeRect(pixels, 16, 16, WIDTH - 32, HEIGHT - 32, 0x4cc9f0, 7);
  for (let x = 42; x < WIDTH - 42; x += 80) {
    drawBolt(pixels, x, 30, 0.22, 0xbdefff);
  }
}

function buildProfileCosmeticAttachment(user) {
  const title = user?.cosmetics?.activeTitle || null;
  const frame = user?.cosmetics?.activeFrame || null;
  if (!title && !frame) return null;

  const storm = title === "Stormbound";
  const vip = title === "Aurix VIP";
  const pixels = createCanvas(storm ? 0x14213d : 0x221a35, vip ? 0xffc857 : 0x4cc9f0);

  fillRect(pixels, 42, 54, WIDTH - 84, HEIGHT - 108, 0x0f172a, 220);
  if (frame === "Gold Frame") drawGoldFrame(pixels);
  if (storm) drawStormFrame(pixels);
  if (vip) {
    drawCrown(pixels, 76, 58, 0.78, 0xfff1a6);
    drawDiamond(pixels, 590, 74, 24, 0xfff1a6);
    drawDiamond(pixels, 632, 126, 16, 0xffd166);
  }
  if (storm) {
    drawBolt(pixels, 72, 42, 1.0, 0x9be7ff);
    drawBolt(pixels, 578, 58, 0.58, 0xe0fbff);
  }
  if (!vip && !storm) {
    drawDiamond(pixels, 96, 92, 34, 0xffc857);
    drawDiamond(pixels, 624, 124, 26, 0x4cc9f0);
  }

  return new AttachmentBuilder(encodePng(WIDTH, HEIGHT, pixels), { name: FILE_NAME });
}

module.exports = {
  buildProfileCosmeticAttachment,
  FILE_NAME,
};
