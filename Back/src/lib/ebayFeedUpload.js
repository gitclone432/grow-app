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
import SellerUploadLimit from '../models/SellerUploadLimit.js';

import { buildRefreshTokenParams } from '../utils/ebayOAuthRefresh.js';
import { prepareFxCsvBufferForUpload } from '../utils/ebayDraftListingCsv.js';

/**
 * Returns the start of the current IST day as a UTC Date.
 * IST = UTC + 5:30, so midnight IST = 18:30 UTC the previous day.
 */
function getISTDayStart() {
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // +5:30 in ms
    const now = new Date();
    // Shift now to IST, zero out the time component, then shift back to UTC.
    const nowIST = new Date(now.getTime() + IST_OFFSET_MS);
    nowIST.setUTCHours(0, 0, 0, 0); // midnight in IST-shifted space
    return new Date(nowIST.getTime() - IST_OFFSET_MS);
}

/**
 * Checks whether a seller has reached their configured daily upload limit for a given country.
 * Counts the sum of uploadSummary.successCount across all COMPLETED/COMPLETED_WITH_ERROR
 * FeedUpload records for the seller+country pair since 12:00 AM IST today.
 * The count resets automatically at midnight IST.
 *
 * Soft block: when no limit row exists, uploads are allowed.
 *
 * @param {string} sellerId
 * @param {string} country
 * @returns {Promise<{ isBlocked: boolean, currentCount: number, limit: number|null }>}
 */
export async function checkUploadLimit(sellerId, country) {
    const limitConfig = await SellerUploadLimit.findOne({ seller: sellerId, country });
    if (!limitConfig) return { isBlocked: false, currentCount: 0, limit: null };

    const istDayStart = getISTDayStart();

    const result = await FeedUpload.aggregate([
        {
            $match: {
                seller: limitConfig.seller,
                country,
                status: { $in: ['COMPLETED', 'COMPLETED_WITH_ERROR'] },
                creationDate: { $gte: istDayStart }
            }
        },
        {
            $group: {
                _id: null,
                totalSuccess: { $sum: '$uploadSummary.successCount' }
            }
        }
    ]);

    const currentCount = result[0]?.totalSuccess || 0;
    return {
        isBlocked: currentCount >= limitConfig.limit,
        currentCount,
        limit: limitConfig.limit
    };
}

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
        qs.stringify(buildRefreshTokenParams(seller)),
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
 * @param {object} [options] - Optional metadata: { country, categoryId, rangeId, productId }
 * @returns {Promise<string>} taskId
 */
export async function performFeedUpload(sellerId, fileBuffer, fileName, feedType = 'FX_LISTING', schemaVersion = '1.0', options = {}) {
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

    // Keep CSV content intact (BOM/CRLF only) — same bytes Seller Hub accepts
    const prepared = prepareFxCsvBufferForUpload(fileBuffer);
    const uploadBuffer = prepared.buffer;
    const safeName = String(fileName || 'listings.csv').replace(/\.csv\.csv$/i, '.csv');

    const formData = new FormData();
    const finalName = safeName.endsWith('.csv') ? safeName : `${safeName}.csv`;
    formData.append('file', uploadBuffer, {
      filename: finalName,
      contentType: 'text/csv',
      knownLength: uploadBuffer.length,
    });
    formData.append('fileName', finalName);
    formData.append('name', 'file');
    formData.append('type', 'form-data');

    await axios.post(
        `https://api.ebay.com/sell/feed/v1/task/${taskId}/upload_file`,
        formData,
        {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
                ...formData.getHeaders()
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
        }
    );

    // 3. Create local FeedUpload record
    const feedUploadData = {
        seller: seller._id,
        taskId,
        fileName,
        feedType,
        schemaVersion,
        status: 'CREATED'
    };
    if (options.country) feedUploadData.country = options.country;
    if (options.categoryId) feedUploadData.categoryId = options.categoryId;
    if (options.rangeId) feedUploadData.rangeId = options.rangeId;
    if (options.productId) feedUploadData.productId = options.productId;
    await FeedUpload.create(feedUploadData);

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
            const uploadCountry = full.country || 'US';

            const limitCheck = await checkUploadLimit(sellerId, uploadCountry);
            if (limitCheck.isBlocked) {
                console.warn(
                    `[CRON] Auto-upload BLOCKED for "${full.fileName}": limit of ${limitCheck.limit} reached ` +
                    `(current: ${limitCheck.currentCount}) for seller ${sellerId} in ${uploadCountry}`
                );
                await CsvStorage.findByIdAndUpdate(record._id, { scheduledUploadStatus: 'limit_blocked' });
                continue;
            }

            // Pass through metadata fields so FeedUpload record has correct
            // country, category, range, and product instead of defaulting.
            const uploadOptions = {};
            if (full.country) uploadOptions.country = full.country;
            if (full.categoryId) uploadOptions.categoryId = full.categoryId;
            if (full.rangeId) uploadOptions.rangeId = full.rangeId;
            if (full.productId) uploadOptions.productId = full.productId;

            const taskId = await performFeedUpload(
                sellerId,
                full.csvData,
                full.fileName,
                'FX_LISTING',
                '1.0',
                uploadOptions
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
