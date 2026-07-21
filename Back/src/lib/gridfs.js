import mongoose from 'mongoose';
import { Readable } from 'stream';

let gridfsBucket;

/**
 * Initialize GridFS bucket for file storage
 * Call this after MongoDB connection is established
 */
export function initGridFS() {
  try {
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('MongoDB connection not available');
    }
    gridfsBucket = new mongoose.mongo.GridFSBucket(db, {
      bucketName: 'invoices'
    });
    console.log('[GridFS] ✓ Invoice storage bucket initialized successfully');
    return gridfsBucket;
  } catch (error) {
    console.error('[GridFS] ✗ Failed to initialize:', error.message);
    throw error;
  }
}

/**
 * Get the GridFS bucket instance
 */
export function getGridFSBucket() {
  if (!gridfsBucket) {
    throw new Error('GridFS not initialized. Call initGridFS() first.');
  }
  return gridfsBucket;
}

/**
 * Upload a file buffer to GridFS
 * @param {Buffer} fileBuffer - The file buffer to upload
 * @param {string} filename - The filename to store
 * @param {Object} metadata - Optional metadata to store with the file
 * @returns {Promise<{fileId: ObjectId, filename: string}>}
 */
export function uploadToGridFS(fileBuffer, filename, metadata = {}) {
  return new Promise((resolve, reject) => {
    try {
      const bucket = getGridFSBucket();
      const readableStream = Readable.from([fileBuffer]);
      
      const uploadStream = bucket.openUploadStream(filename, {
        metadata: {
          ...metadata,
          uploadDate: new Date()
        }
      });

      uploadStream.on('error', (error) => {
        console.error('GridFS upload stream error:', error);
        reject(error);
      });

      uploadStream.on('finish', () => {
        console.log('[GridFS] File uploaded successfully:', uploadStream.id);
        resolve({
          fileId: uploadStream.id,
          filename: uploadStream.filename
        });
      });

      readableStream.on('error', (error) => {
        console.error('Readable stream error:', error);
        reject(error);
      });

      readableStream.pipe(uploadStream);
    } catch (error) {
      console.error('GridFS upload error:', error);
      reject(error);
    }
  });
}

/**
 * Download a file from GridFS by ID
 * @param {ObjectId|string} fileId - The GridFS file ID
 * @returns {Promise<Buffer>}
 */
export function downloadFromGridFS(fileId) {
  return new Promise((resolve, reject) => {
    const bucket = getGridFSBucket();
    const chunks = [];
    
    const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(fileId));
    
    downloadStream
      .on('data', (chunk) => {
        chunks.push(chunk);
      })
      .on('error', (error) => {
        console.error('[GridFS] Download error for file:', fileId, error.message);
        reject(error);
      })
      .on('end', () => {
        console.log('[GridFS] File downloaded successfully:', fileId);
        resolve(Buffer.concat(chunks));
      });
  });
}

/**
 * Stream a file from GridFS by ID (for serving files)
 * @param {ObjectId|string} fileId - The GridFS file ID
 * @returns {ReadableStream}
 */
export function streamFromGridFS(fileId) {
  const bucket = getGridFSBucket();
  return bucket.openDownloadStream(new mongoose.Types.ObjectId(fileId));
}

/**
 * Delete a file from GridFS by ID
 * @param {ObjectId|string} fileId - The GridFS file ID
 * @returns {Promise<void>}
 */
export async function deleteFromGridFS(fileId) {
  try {
    const bucket = getGridFSBucket();
    const objectId = new mongoose.Types.ObjectId(fileId);
    
    // Check if file exists first
    const files = await bucket.find({ _id: objectId }).toArray();
    
    if (files.length === 0) {
      console.warn('[GridFS] File already deleted or never existed:', fileId);
      return; // Success - file doesn't exist, which is what we want
    }
    
    // File exists, delete it
    return new Promise((resolve, reject) => {
      bucket.delete(objectId, (error) => {
        if (error) {
          console.error('[GridFS] Delete error:', error);
          reject(error);
        } else {
          console.log('[GridFS] File deleted successfully:', fileId);
          resolve();
        }
      });
    });
  } catch (error) {
    // Handle any synchronous errors
    const isNotFoundError = 
      error.code === 'ENOENT' || 
      error.message?.includes('not found') ||
      error.message?.includes('FileNotFound') ||
      error.name === 'MongoRuntimeError';
    
    if (isNotFoundError) {
      console.warn('[GridFS] File not found during delete:', fileId);
      return; // Success - file doesn't exist
    }
    
    throw error;
  }
}

/**
 * Get file info from GridFS by ID
 * @param {ObjectId|string} fileId - The GridFS file ID
 * @returns {Promise<Object>}
 */
export async function getFileInfo(fileId) {
  const bucket = getGridFSBucket();
  const files = await bucket.find({ _id: new mongoose.Types.ObjectId(fileId) }).toArray();
  return files[0] || null;
}
