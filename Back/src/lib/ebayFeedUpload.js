/**
 * Shared helper: perform an eBay Feed API upload for a given seller and CSV buffer.
 * Used by both the manual POST /ebay/feed/upload route (via scheduledJobs) and
 * the scheduled auto-upload cron job.
 *
 * Returns the eBay taskId on success, throws on failure.
 */
import axios from 'axios';
import qs from 'qs';
import FormData from 'form-data';
import Seller from '../models/Seller.js';
import FeedUpload from '../models/FeedUpload.js';
import CsvStorage from '../models/CsvStorage.js';

const EBAY_OAUTH_SCOPES = 'https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account https://api.ebay.com/oauth/api_scope/sell.fulfillment https://api.ebay.com/oauth/api_scope/sell.marketing https://api.ebay.com/oauth/api_scope/sell.analytics.readonly';

async function ensureValidToken(seller) {
    const now = Date.now();
    const fetchedAt = seller.ebayTokens.fetchedAt ? new Date(seller.ebayTokens.fetchedAt).getTime() : 0;
    const expiresInMs = (seller.ebayTokens.expires_in || 0) * 1000;
    const bufferTime = 2 * 60 * 1000;

    if (fetchedAt && (now - fetchedAt < expiresInMs - bufferTime)) {
        return seller.ebayTokens.access_token;
    }

    const refreshRes = await axios.post(
        'https://api.ebay.com/identity/v1/oauth2/token',
        qs.stringify({
            grant_type: 'refresh_token',
            refresh_token: seller.ebayTokens.refresh_token,
            scope: EBAY_OAUTH_SCOPES
        }),
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: 'Basic ' + Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString('base64'),
            },
            timeout: 10000
        }
    );

    seller.ebayTokens.access_token = refreshRes.data.access_token;
    seller.ebayTokens.expires_in = refreshRes.data.expires_in;
    seller.ebayTokens.fetchedAt = new Date();
    await seller.save();

    return refreshRes.data.access_token;
}

/**
 * Uploads a CSV buffer to eBay Feed API for the given seller.
 * Creates a FeedUpload DB record and returns the taskId.
 *
 * @param {string} sellerId - Seller _id
 * @param {Buffer} fileBuffer - The CSV file content
 * @param {string} fileName - Original filename for the upload
 * @param {string} feedType - eBay feed type (default: 'FX_LISTING')
 * @param {string} schemaVersion - eBay schema version (default: '1.0')
 * @returns {Promise<string>} taskId
 */
export async function performFeedUpload(sellerId, fileBuffer, fileName, feedType = 'FX_LISTING', schemaVersion = '1.0') {
    const seller = await Seller.findById(sellerId);
    if (!seller) throw new Error(`Seller not found: ${sellerId}`);

    const accessToken = await ensureValidToken(seller);

    // 1. Create eBay task
    const createTaskRes = await axios.post(
        'https://api.ebay.com/sell/feed/v1/task',
        { feedType, schemaVersion },
        {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
            }
        }
    );

    const locationHeader = createTaskRes.headers.location;
    if (!locationHeader) throw new Error('Failed to get task location from eBay');
    const taskId = locationHeader.split('/').pop();

    // 2. Upload file to task
    const formData = new FormData();
    formData.append('file', fileBuffer, { filename: fileName, contentType: 'text/csv' });
    formData.append('fileName', fileName);
    formData.append('name', 'file');
    formData.append('type', 'form-data');

    await axios.post(
        `https://api.ebay.com/sell/feed/v1/task/${taskId}/upload_file`,
        formData,
        {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                ...formData.getHeaders()
            }
        }
    );

    // 3. Create local FeedUpload record
    await FeedUpload.create({
        seller: seller._id,
        taskId,
        fileName,
        feedType,
        schemaVersion,
        status: 'CREATED'
    });

    return taskId;
}

/**
 * Runs scheduled auto-uploads: finds all CsvStorage records whose
 * scheduledUploadAt has passed and status is 'pending', then uploads each.
 */
export async function runScheduledUploads() {
    const due = await CsvStorage.find({
        scheduledUploadAt: { $lte: new Date() },
        scheduledUploadStatus: 'pending'
    });

    if (due.length === 0) return;

    console.log(`[CRON] Auto-upload: ${due.length} record(s) due`);

    for (const record of due) {
        // Mark as processing first to prevent double-fire
        await CsvStorage.findByIdAndUpdate(record._id, { scheduledUploadStatus: 'processing' });

        try {
            const full = await CsvStorage.findById(record._id);
            const sellerId = (full.scheduledSellerId || full.seller).toString();

            const taskId = await performFeedUpload(
                sellerId,
                full.csvData,
                full.fileName
            );

            // Link FeedUpload record back to CsvStorage
            const feedUpload = await FeedUpload.findOne({ taskId });
            await CsvStorage.findByIdAndUpdate(record._id, {
                scheduledUploadStatus: 'done',
                feedUploadId: feedUpload?._id || null
            });

            console.log(`[CRON] Auto-upload done: ${full.fileName} → taskId ${taskId}`);
        } catch (err) {
            console.error(`[CRON] Auto-upload failed for ${record._id}: ${err.message}`);
            await CsvStorage.findByIdAndUpdate(record._id, { scheduledUploadStatus: 'failed' });
        }
    }
}
