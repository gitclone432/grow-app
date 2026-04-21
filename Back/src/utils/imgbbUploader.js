import axios from 'axios';
import fs from 'fs/promises';
import FormData from 'form-data';

/**
 * Uploads an image file to ImgBB and returns the public URL
 * @param {string} imagePath - Absolute path to the image file
 * @param {string} name - Optional name for the image
 * @returns {Promise<string>} - Public URL of the uploaded image
 */
async function uploadToImgBB(imagePath, name = null) {
  try {
    const apiKey = process.env.IMGBB_API_KEY;
    
    if (!apiKey) {
      throw new Error('IMGBB_API_KEY not found in environment variables');
    }

    // Read the image file
    const imageBuffer = await fs.readFile(imagePath);
    const base64Image = imageBuffer.toString('base64');

    // Create form data
    const formData = new FormData();
    formData.append('image', base64Image);
    if (name) {
      formData.append('name', name);
    }

    // Upload to ImgBB
    const response = await axios.post(
      `https://api.imgbb.com/1/upload?key=${apiKey}`,
      formData,
      {
        headers: formData.getHeaders(),
        timeout: 30000, // 30 seconds
      }
    );

    if (response.data && response.data.data && response.data.data.url) {
      return response.data.data.url;
    }

    throw new Error('Invalid response from ImgBB');
  } catch (error) {
    console.error('Error uploading to ImgBB:', error.message);
    throw new Error(`Failed to upload image to ImgBB: ${error.message}`);
  }
}

/**
 * Deletes an image from ImgBB (Note: ImgBB free tier doesn't support deletion)
 * @param {string} imageUrl - URL of the image to delete
 */
async function deleteFromImgBB(imageUrl) {
  // Note: ImgBB free tier doesn't provide a deletion API
  // Images uploaded to ImgBB are permanent unless you upgrade to a paid plan
  console.log('ImgBB free tier does not support image deletion:', imageUrl);
}

export {
  uploadToImgBB,
  deleteFromImgBB,
};
