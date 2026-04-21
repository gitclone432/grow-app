import sharp from 'sharp';
import axios from 'axios';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { uploadToImgBB } from './imgbbUploader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Downloads an image from a URL and returns a buffer
 * @param {string} imageUrl - The URL of the image to download
 * @returns {Promise<Buffer>} - Image buffer
 */
async function downloadImage(imageUrl) {
  try {
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 10000,
    });
    return Buffer.from(response.data);
  } catch (error) {
    throw new Error(`Failed to download image from ${imageUrl}: ${error.message}`);
  }
}

/**
 * Composites an overlay badge onto a product image
 * @param {string} productImageUrl - URL of the Amazon product image
 * @param {string} overlayBadgeName - Name of the overlay badge (usa-seller, free-shipping, fast-shipping)
 * @returns {Promise<string>} - Path to the processed image relative to public folder
 */
async function createEbayImageWithOverlay(productImageUrl, overlayBadgeName = 'usa-seller') {
  try {
    // Download the product image
    const productImageBuffer = await downloadImage(productImageUrl);

    // Define overlay badge path
    const overlayBadgePath = path.join(
      __dirname,
      '../../public/uploads/overlay-badges',
      `${overlayBadgeName}.png`
    );

    // Check if overlay badge exists
    try {
      await fs.access(overlayBadgePath);
    } catch (error) {
      console.warn(`Overlay badge not found: ${overlayBadgePath}. Using product image without overlay.`);
      // Process and upload original image without overlay
      const outputFilename = `ebay-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
      const outputPath = path.join(__dirname, '../../public/uploads/ebay-images', outputFilename);
      
      await sharp(productImageBuffer)
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toFile(outputPath);
      
      // Upload to ImgBB and get public URL
      console.log(`Uploading image (no overlay) to ImgBB: ${outputFilename}`);
      const publicUrl = await uploadToImgBB(outputPath, outputFilename);
      console.log(`Successfully uploaded to ImgBB: ${publicUrl}`);

      // Clean up local file after upload
      try {
        await fs.unlink(outputPath);
      } catch (cleanupError) {
        console.warn(`Failed to clean up local file: ${cleanupError.message}`);
      }

      return publicUrl;
    }

    // Get product image metadata
    const productImage = sharp(productImageBuffer);
    const metadata = await productImage.metadata();

    // Resize product image to standard size (800x800 max, maintaining aspect ratio)
    const resizedProductImage = await productImage
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .toBuffer();

    // Get resized dimensions
    const resizedMetadata = await sharp(resizedProductImage).metadata();
    const productWidth = resizedMetadata.width;
    const productHeight = resizedMetadata.height;

    // Load and resize overlay badge to match the product image size (full coverage)
    const overlayBuffer = await sharp(overlayBadgePath)
      .resize(productWidth, productHeight, { fit: 'cover', position: 'center' })
      .toBuffer();

    // Get overlay dimensions after resize
    const overlayMetadata = await sharp(overlayBuffer).metadata();
    const overlayWidth = overlayMetadata.width;
    const overlayHeight = overlayMetadata.height;

    // Composite the overlay onto the product image (full coverage, top-left at 0,0)
    const outputFilename = `ebay-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
    const outputPath = path.join(__dirname, '../../public/uploads/ebay-images', outputFilename);

    await sharp(resizedProductImage)
      .composite([
        {
          input: overlayBuffer,
          top: 0,
          left: 0,
        },
      ])
      .jpeg({ quality: 85 })
      .toFile(outputPath);

    // Upload to ImgBB and get public URL
    console.log(`Uploading eBay image to ImgBB: ${outputFilename}`);
    const publicUrl = await uploadToImgBB(outputPath, outputFilename);
    console.log(`Successfully uploaded to ImgBB: ${publicUrl}`);

    // Clean up local file after upload
    try {
      await fs.unlink(outputPath);
      console.log(`Cleaned up local file: ${outputPath}`);
    } catch (cleanupError) {
      console.warn(`Failed to clean up local file: ${cleanupError.message}`);
    }

    // Return the public ImgBB URL
    return publicUrl;
  } catch (error) {
    console.error('Error creating eBay image with overlay:', error);
    throw new Error(`Failed to create eBay image: ${error.message}`);
  }
}

/**
 * Deletes an eBay image (Note: ImgBB free tier doesn't support deletion)
 * @param {string} imageUrl - Public URL of the image (e.g., https://i.ibb.co/...)
 */
async function deleteEbayImage(imageUrl) {
  // Note: ImgBB free tier doesn't provide deletion API
  // Images are stored on ImgBB permanently
  // Local temporary files are already cleaned up after upload
  console.log('ImgBB does not support deletion for free tier:', imageUrl);
}

export {
  createEbayImageWithOverlay,
  deleteEbayImage,
  downloadImage,
};
