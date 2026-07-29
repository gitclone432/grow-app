import sharp from 'sharp';
import axios from 'axios';
import path from 'path';
import fs from 'fs/promises';
import { uploadToImgBB } from './imgbbUploader.js';
import {
  OVERLAY_EXTENSIONS,
  getImageOverlayRuntimeConfig,
  resolveOverlayBadgePath,
  SERVER_ROOT,
} from './overlaySettings.js';

const EBAY_IMAGES_DIR = path.join(SERVER_ROOT, 'public', 'uploads', 'ebay-images');

const OVERLAY_POSITIONS = new Set([
  'bottom-left',
  'bottom-right',
  'top-left',
  'top-right',
  'center',
]);

/**
 * Request a higher-resolution Amazon CDN variant when possible.
 */
export function upgradeAmazonProductImageUrl(url) {
  const s = String(url || '').trim();
  if (!s) return s;
  if (!/media-amazon\.com|images-amazon\.com|ssl-images-amazon/i.test(s)) return s;
  return s
    .replace(/_AC_SX\d+_/gi, '_AC_SL1500_')
    .replace(/_AC_SY\d+_/gi, '_AC_SL1500_')
    .replace(/_AC_UL\d+_/gi, '_AC_SL1500_')
    .replace(/_AC_SR\d+,\d+_/gi, '_AC_SL1500_')
    .replace(/_AC_S\d+_/gi, '_AC_SL1500_');
}

/**
 * Downloads an image from a URL and returns a buffer
 */
async function downloadImage(imageUrl) {
  try {
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 20000,
    });
    return Buffer.from(response.data);
  } catch (error) {
    throw new Error(`Failed to download image from ${imageUrl}: ${error.message}`);
  }
}

function computeOverlayPlacement(productWidth, productHeight, overlayWidth, overlayHeight, position, paddingPx) {
  const pad = Math.max(0, paddingPx);
  let left = pad;
  let top = pad;

  switch (position) {
    case 'top-right':
      left = productWidth - overlayWidth - pad;
      top = pad;
      break;
    case 'bottom-left':
      left = pad;
      top = productHeight - overlayHeight - pad;
      break;
    case 'bottom-right':
      left = productWidth - overlayWidth - pad;
      top = productHeight - overlayHeight - pad;
      break;
    case 'center':
      left = Math.round((productWidth - overlayWidth) / 2);
      top = Math.round((productHeight - overlayHeight) / 2);
      break;
    case 'top-left':
    default:
      left = pad;
      top = pad;
      break;
  }

  return {
    left: Math.max(0, Math.min(left, productWidth - overlayWidth)),
    top: Math.max(0, Math.min(top, productHeight - overlayHeight)),
  };
}

async function buildCornerOverlayLayer(overlayBadgePath, productWidth, productHeight, config) {
  const scalePercent = Math.max(8, Math.min(80, Number(config.overlayScalePercent) || 30));
  const targetOverlayWidth = Math.round(productWidth * (scalePercent / 100));

  const overlayBuffer = await sharp(overlayBadgePath)
    .ensureAlpha()
    .resize(targetOverlayWidth, null, {
      fit: 'inside',
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();

  const overlayMeta = await sharp(overlayBuffer).metadata();
  const overlayWidth = overlayMeta.width || targetOverlayWidth;
  const overlayHeight = overlayMeta.height || targetOverlayWidth;

  const paddingPx = Math.round(Math.min(productWidth, productHeight) * 0.02);
  const position = OVERLAY_POSITIONS.has(config.overlayPosition)
    ? config.overlayPosition
    : 'bottom-left';
  const { left, top } = computeOverlayPlacement(
    productWidth,
    productHeight,
    overlayWidth,
    overlayHeight,
    position,
    paddingPx
  );

  return { overlayBuffer, left, top };
}

async function buildFullOverlayLayer(overlayBadgePath, productWidth, productHeight) {
  const overlayBuffer = await sharp(overlayBadgePath)
    .ensureAlpha()
    .resize(productWidth, productHeight, { fit: 'cover', position: 'center' })
    .png()
    .toBuffer();
  return { overlayBuffer, left: 0, top: 0 };
}

const ALPHA_TRANSPARENT_THRESHOLD = 128;

/**
 * Bounding box of transparent pixels in the overlay (the product window).
 */
async function detectOverlayTransparentWindow(overlayBuffer) {
  const { data, info } = await sharp(overlayBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  if (!width || !height || channels < 4) return null;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * channels + 3];
      if (alpha < ALPHA_TRANSPARENT_THRESHOLD) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) return null;

  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function applyFramePadding(rect, canvasW, canvasH, framePaddingPercent) {
  if (!rect || framePaddingPercent <= 0) return rect;
  const padX = Math.round(rect.width * (framePaddingPercent / 100));
  const padY = Math.round(rect.height * (framePaddingPercent / 100));
  const left = Math.max(0, rect.left + padX);
  const top = Math.max(0, rect.top + padY);
  const width = Math.max(1, Math.min(canvasW - left, rect.width - padX * 2));
  const height = Math.max(1, Math.min(canvasH - top, rect.height - padY * 2));
  return { left, top, width, height };
}

/**
 * Product fills the overlay window edge-to-edge (cover), then the frame PNG is layered on top.
 */
async function buildFrameCompositeBuffer(overlayBadgePath, productImageBuffer, config) {
  const outputMaxPx = Math.max(400, Math.min(2400, Number(config.outputMaxPx) || 1600));
  const framePaddingPercent = Math.max(
    0,
    Math.min(40, Number.isFinite(Number(config.framePaddingPercent)) ? Number(config.framePaddingPercent) : 0)
  );

  const overlayScaled = await sharp(overlayBadgePath)
    .resize(outputMaxPx, outputMaxPx, { fit: 'inside', withoutEnlargement: false })
    .ensureAlpha()
    .png()
    .toBuffer();

  const canvasMeta = await sharp(overlayScaled).metadata();
  const canvasW = canvasMeta.width || outputMaxPx;
  const canvasH = canvasMeta.height || outputMaxPx;

  let productRect =
    (await detectOverlayTransparentWindow(overlayScaled)) || {
      left: 0,
      top: 0,
      width: canvasW,
      height: canvasH,
    };

  productRect = applyFramePadding(productRect, canvasW, canvasH, framePaddingPercent);

  const innerW = Math.max(1, productRect.width);
  const innerH = Math.max(1, productRect.height);

  // cover = fill the window completely (no letterboxing on left/right)
  const productLayer = await sharp(productImageBuffer)
    .resize(innerW, innerH, { fit: 'cover', position: 'centre' })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .toBuffer();

  return sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      { input: productLayer, left: productRect.left, top: productRect.top },
      { input: overlayScaled, left: 0, top: 0 },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}

/**
 * Composites an overlay badge onto a product image
 */
async function createEbayImageWithOverlay(productImageUrl, overlayBadgeName = 'usa-seller') {
  try {
    await fs.mkdir(EBAY_IMAGES_DIR, { recursive: true });

    const config = await getImageOverlayRuntimeConfig();
    const outputMaxPx = Math.max(400, Math.min(2400, Number(config.outputMaxPx) || 1600));
    const downloadUrl = upgradeAmazonProductImageUrl(productImageUrl);

    let productImageBuffer;
    try {
      productImageBuffer = await downloadImage(downloadUrl);
    } catch {
      productImageBuffer = await downloadImage(productImageUrl);
    }

    const overlayBadgePath = await resolveOverlayBadgePath(overlayBadgeName);

    if (!overlayBadgePath) {
      console.warn(
        `Overlay badge not found for "${overlayBadgeName}". Using product image without overlay.`
      );
      const outputFilename = `ebay-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
      const outputPath = path.join(EBAY_IMAGES_DIR, outputFilename);

      await sharp(productImageBuffer)
        .resize(outputMaxPx, outputMaxPx, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 90 })
        .toFile(outputPath);

      const publicUrl = await uploadToImgBB(outputPath, outputFilename);
      try {
        await fs.unlink(outputPath);
      } catch {
        // ignore
      }
      return publicUrl;
    }

    const outputFilename = `ebay-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
    const outputPath = path.join(EBAY_IMAGES_DIR, outputFilename);

    if (config.overlayMode === 'frame') {
      const frameBuffer = await buildFrameCompositeBuffer(
        overlayBadgePath,
        productImageBuffer,
        config
      );
      await fs.writeFile(outputPath, frameBuffer);
    } else {
      const resizedProductImage = await sharp(productImageBuffer)
        .resize(outputMaxPx, outputMaxPx, { fit: 'inside', withoutEnlargement: true })
        .toBuffer();

      const resizedMetadata = await sharp(resizedProductImage).metadata();
      const productWidth = resizedMetadata.width;
      const productHeight = resizedMetadata.height;

      const useFullCover = config.overlayMode === 'full';
      const { overlayBuffer, left, top } = useFullCover
        ? await buildFullOverlayLayer(overlayBadgePath, productWidth, productHeight)
        : await buildCornerOverlayLayer(overlayBadgePath, productWidth, productHeight, config);

      await sharp(resizedProductImage)
        .composite([
          {
            input: overlayBuffer,
            top,
            left,
          },
        ])
        .jpeg({ quality: 90 })
        .toFile(outputPath);
    }

    const publicUrl = await uploadToImgBB(outputPath, outputFilename);

    try {
      await fs.unlink(outputPath);
    } catch {
      // ignore
    }

    return publicUrl;
  } catch (error) {
    console.error('Error creating eBay image with overlay:', error);
    throw new Error(`Failed to create eBay image: ${error.message}`);
  }
}

async function deleteEbayImage(imageUrl) {
  console.log('ImgBB does not support deletion for free tier:', imageUrl);
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function hexToRgb(hex) {
  const raw = String(hex || '').trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
  };
}

function wrapOverlayText(text, maxCharsPerLine = 36, maxLines = 3) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxCharsPerLine) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length >= maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (words.join(' ').length > lines.join(' ').length) {
    const last = lines[lines.length - 1] || '';
    lines[lines.length - 1] = `${last.slice(0, Math.max(0, maxCharsPerLine - 1))}…`;
  }
  return lines.slice(0, maxLines);
}

/**
 * Draws scraped/custom text onto a product image and uploads to ImgBB.
 */
async function createEbayImageWithTextOverlay(productImageUrl, text, style = {}) {
  const label = String(text || '').trim();
  if (!label) {
    throw new Error('Text overlay requires non-empty text');
  }

  await fs.mkdir(EBAY_IMAGES_DIR, { recursive: true });

  const downloadUrl = upgradeAmazonProductImageUrl(productImageUrl);
  let productImageBuffer;
  try {
    productImageBuffer = await downloadImage(downloadUrl);
  } catch {
    productImageBuffer = await downloadImage(productImageUrl);
  }

  const config = await getImageOverlayRuntimeConfig();
  const outputMaxPx = Math.max(400, Math.min(2400, Number(config.outputMaxPx) || 1600));

  const resized = await sharp(productImageBuffer)
    .resize(outputMaxPx, outputMaxPx, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 92 })
    .toBuffer();

  const meta = await sharp(resized).metadata();
  const width = meta.width || outputMaxPx;
  const height = meta.height || outputMaxPx;

  const fontSize = Math.max(
    16,
    Math.min(
      96,
      Number(style.fontSize) > 0
        ? Number(style.fontSize)
        : Math.round(width * 0.045)
    )
  );
  const maxChars = Math.max(12, Math.floor(width / (fontSize * 0.55)));
  const lines = wrapOverlayText(label, maxChars, 3);
  if (lines.length === 0) {
    throw new Error('Text overlay requires non-empty text');
  }

  const paddingY = Math.round(fontSize * 0.55);
  const lineGap = Math.round(fontSize * 0.25);
  const barHeight = paddingY * 2 + lines.length * fontSize + (lines.length - 1) * lineGap;
  const position = ['top', 'bottom', 'center'].includes(style.position)
    ? style.position
    : 'bottom';
  const barY =
    position === 'top'
      ? 0
      : position === 'center'
        ? Math.max(0, Math.round((height - barHeight) / 2))
        : Math.max(0, height - barHeight);

  const textColor = String(style.textColor || '#FFFFFF').trim() || '#FFFFFF';
  const bg = hexToRgb(style.backgroundColor || '#000000');
  const opacity = Math.max(0, Math.min(1, Number(style.backgroundOpacity) ?? 0.55));

  const textNodes = lines
    .map((line, index) => {
      const y = barY + paddingY + fontSize + index * (fontSize + lineGap);
      return `<text x="50%" y="${y}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700" fill="${escapeXml(textColor)}">${escapeXml(line)}</text>`;
    })
    .join('');

  const svg = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="${barY}" width="${width}" height="${barHeight}" fill="rgb(${bg.r},${bg.g},${bg.b})" fill-opacity="${opacity}" />
      ${textNodes}
    </svg>`
  );

  const outputFilename = `ebay-text-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
  const outputPath = path.join(EBAY_IMAGES_DIR, outputFilename);

  await sharp(resized)
    .composite([{ input: svg, top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toFile(outputPath);

  const publicUrl = await uploadToImgBB(outputPath, outputFilename);
  try {
    await fs.unlink(outputPath);
  } catch {
    // ignore
  }
  return publicUrl;
}

export {
  createEbayImageWithOverlay,
  createEbayImageWithTextOverlay,
  deleteEbayImage,
  downloadImage,
  OVERLAY_EXTENSIONS,
};
