import mongoose from 'mongoose';
import { Readable } from 'stream';

let gridfsBucket;

/**
 * Initialize GridFS bucket for file storage
 * Call this after MongoDB connection is established
 */
export function initGridFS() {
  const db = mongoose.connection.db;
  gridfsBucket = new mongoose.mongo.GridFSBucket(db, {
    bucketName: 'invoices'
  });
  console.log('[GridFS] Invoice storage bucket initialized');
  return gridfsBucket;
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
    const bucket = getGridFSBucket();
    const readableStream = Readable.from(fileBuffer);
    
    const uploadStream = bucket.openUploadStream(filename, {
      metadata: {
        ...metadata,
        uploadDate: new Date()
      }
    });

    readableStream.pipe(uploadStream)
      .on('error', (error) => {
        reject(error);
      })
      .on('finish', () => {
        resolve({
          fileId: uploadStream.id,
          filename: uploadStream.filename
        });
      });
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
        reject(error);
      })
      .on('end', () => {
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
export function deleteFromGridFS(fileId) {
  return new Promise((resolve, reject) => {
    const bucket = getGridFSBucket();
    bucket.delete(new mongoose.Types.ObjectId(fileId), (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
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
