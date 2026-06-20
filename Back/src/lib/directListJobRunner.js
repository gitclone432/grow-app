import DirectListJob, {
  DIRECT_LIST_JOB_DEFAULT_BATCH_SIZE,
  DIRECT_LIST_JOB_DEFAULT_DELAY_MINUTES,
  DIRECT_LIST_JOB_DEFAULT_DELAY_SECONDS,
  DIRECT_LIST_JOB_MAX_DELAY_SECONDS,
  DIRECT_LIST_JOB_MIN_DELAY_SECONDS,
} from '../models/DirectListJob.js';
import Seller from '../models/Seller.js';
import { ensureValidToken } from '../routes/ebay.js';
import { processDirectListBulk } from './directListPrepare.js';

export function chunkDirectListAsins(asins, size = DIRECT_LIST_JOB_DEFAULT_BATCH_SIZE) {
  const chunks = [];
  for (let i = 0; i < asins.length; i += size) {
    chunks.push(asins.slice(i, i + size));
  }
  return chunks;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapBulkRowToJobResult(row = {}) {
  return {
    asin: row.asin,
    status: row.status === 'success' ? 'success' : 'error',
    sku: row.sku || row.listing?.customLabel || '',
    itemId: row.itemId != null ? String(row.itemId) : '',
    listingUrl: row.listingUrl || '',
    error: row.error || '',
  };
}

function normalizeDelaySeconds(value) {
  return Math.min(
    Math.max(Number.parseInt(value, 10) || DIRECT_LIST_JOB_DEFAULT_DELAY_SECONDS, DIRECT_LIST_JOB_MIN_DELAY_SECONDS),
    DIRECT_LIST_JOB_MAX_DELAY_SECONDS
  );
}

async function listSingleAsin(job, token, asin) {
  const bulkResult = await processDirectListBulk({
    templateId: String(job.templateId),
    sellerId: String(job.sellerId),
    asins: [asin],
    region: job.region || 'US',
    verifyOnly: false,
    token,
    concurrency: 1,
  });
  return (bulkResult.results || []).map(mapBulkRowToJobResult);
}

async function processListingGapJob(job, seller, token) {
  const delaySeconds = normalizeDelaySeconds(job.delaySecondsBetweenListings);
  const total = job.asins.length;
  let startIndex = job.currentBatchIndex;

  job.status = 'processing';
  job.startedAt = job.startedAt || new Date();
  await job.save();

  console.log(`[DirectListJob] ${job._id} listing mode ${startIndex + 1}-${total} (${delaySeconds}s gap)`);

  try {
    for (let i = startIndex; i < total; i += 1) {
      const asin = job.asins[i];
      job.nextRunAt = new Date(Date.now() + 3 * 60 * 1000);
      await job.save();

      const batchResults = await listSingleAsin(job, token, asin);
      job.results.push(...batchResults);
      job.successfulCount += batchResults.filter((row) => row.status === 'success').length;
      job.failedCount += batchResults.filter((row) => row.status === 'error').length;
      job.currentBatchIndex = i + 1;
      await job.save();

      if (i < total - 1) {
        await sleep(delaySeconds * 1000);
      }
    }

    job.status = 'done';
    job.completedAt = new Date();
    job.nextRunAt = null;
    console.log(`[DirectListJob] ${job._id} completed OK ${job.successfulCount}/${total}`);
  } catch (error) {
    job.status = 'failed';
    job.lastError = error.message || 'Listing job failed';
    job.completedAt = new Date();
    job.nextRunAt = null;
    console.error(`[DirectListJob] ${job._id} failed:`, job.lastError);
  }

  await job.save();
  return job;
}

async function processBatchGapJob(job, seller, token) {
  const batchSize = Math.min(Math.max(Number(job.batchSize) || DIRECT_LIST_JOB_DEFAULT_BATCH_SIZE, 1), 25);
  const delayMinutes = Math.min(Math.max(Number(job.delayMinutesBetweenBatches) || DIRECT_LIST_JOB_DEFAULT_DELAY_MINUTES, 1), 60);
  const batches = chunkDirectListAsins(job.asins, batchSize);

  if (job.currentBatchIndex >= batches.length) {
    job.status = 'done';
    job.completedAt = new Date();
    job.nextRunAt = null;
    await job.save();
    return job;
  }

  job.status = 'processing';
  job.startedAt = job.startedAt || new Date();
  job.nextRunAt = new Date(Date.now() + 35 * 60 * 1000);
  await job.save();

  const batchAsins = batches[job.currentBatchIndex];
  console.log(`[DirectListJob] ${job._id} batch ${job.currentBatchIndex + 1}/${batches.length} (${batchAsins.length} ASINs)`);

  try {
    const bulkResult = await processDirectListBulk({
      templateId: String(job.templateId),
      sellerId: String(job.sellerId),
      asins: batchAsins,
      region: job.region || 'US',
      verifyOnly: false,
      token,
      concurrency: 2,
    });

    const batchResults = (bulkResult.results || []).map(mapBulkRowToJobResult);
    job.results.push(...batchResults);
    job.successfulCount += batchResults.filter((row) => row.status === 'success').length;
    job.failedCount += batchResults.filter((row) => row.status === 'error').length;
    job.currentBatchIndex += 1;

    if (job.currentBatchIndex >= batches.length) {
      job.status = 'done';
      job.completedAt = new Date();
      job.nextRunAt = null;
      console.log(`[DirectListJob] ${job._id} completed OK ${job.successfulCount}/${job.asins.length}`);
    } else {
      job.nextRunAt = new Date(Date.now() + delayMinutes * 60 * 1000);
      console.log(`[DirectListJob] ${job._id} next batch at ${job.nextRunAt.toISOString()}`);
    }
  } catch (error) {
    job.status = 'failed';
    job.lastError = error.message || 'Batch processing failed';
    job.completedAt = new Date();
    job.nextRunAt = null;
    console.error(`[DirectListJob] ${job._id} failed:`, job.lastError);
  }

  await job.save();
  return job;
}

export async function processDirectListJobBatch(jobDoc) {
  const job = jobDoc;
  if (!job || !['pending', 'processing'].includes(job.status)) {
    return null;
  }

  const seller = await Seller.findById(job.sellerId);
  if (!seller) {
    job.status = 'failed';
    job.lastError = 'Seller not found';
    job.completedAt = new Date();
    await job.save();
    return job;
  }

  const token = await ensureValidToken(seller);
  const batchSize = Math.min(Math.max(Number(job.batchSize) || DIRECT_LIST_JOB_DEFAULT_BATCH_SIZE, 1), 25);

  if (batchSize === 1) {
    return processListingGapJob(job, seller, token);
  }

  return processBatchGapJob(job, seller, token);
}

export async function runScheduledDirectListJobs() {
  const now = new Date();

  const job = await DirectListJob.findOne({
    $or: [
      { status: 'pending', scheduledAt: { $lte: now } },
      { status: 'processing', nextRunAt: { $lte: now } },
    ],
  }).sort({ scheduledAt: 1, nextRunAt: 1 });

  if (job) {
    await processDirectListJobBatch(job);
  }
}
