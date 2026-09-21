import SourcingRule from '../models/SourcingRule.js';
import AsinSourcingBatch from '../models/AsinSourcingBatch.js';
import SourcingRuleRun from '../models/SourcingRuleRun.js';
import CsvStorage from '../models/CsvStorage.js';
import FeedUpload from '../models/FeedUpload.js';
import { getEffectiveTemplate } from '../utils/templateMerger.js';
import { searchAmazonAsinsPage } from '../utils/amazonSearchScraper.js';
import { loadActiveSkuSet, precheckAsin, passesPrecheckFilters } from '../utils/asinPrecheckCore.js';
import { callInternalApi } from './internalApiClient.js';
import { checkUploadLimit, performFeedUpload } from './ebayFeedUpload.js';
import { classifyEbayMotorsTitle } from './ebayMotorsClassifier.js';

// eBay Feed API marketplace country codes (CsvStorage.country enum) —
// region 'CA' in Sourcing Rules maps to 'Canada' here, matching how the
// manual Feed Upload page labels it.
export const REGION_TO_FEED_COUNTRY = { US: 'US', UK: 'UK', AU: 'AU', CA: 'Canada' };

// How many Amazon search-result pages one run will page through while still
// short of targetAsinCount, before giving up and reporting a shortfall.
// Keep trying rather than stopping early — the old 5-page cap gave up well
// before genuinely exhausting Amazon's results for the keyword.
const MAX_SEARCH_PAGES = parseInt(process.env.SOURCING_MAX_SEARCH_PAGES, 10) || 100;
const ENRICH_CONCURRENCY = parseInt(process.env.ASIN_PRECHECK_CONCURRENCY, 10)
  || parseInt(process.env.SCRAPER_API_CONCURRENT, 10)
  || 10;

async function runWithConcurrency(items, concurrency, worker) {
  const limit = Math.max(1, Math.min(concurrency, items.length));
  let nextIndex = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await worker(items[currentIndex], currentIndex);
    }
  });
  await Promise.allSettled(workers);
}

export const SAVABLE_STATUSES = new Set(['success', 'warning']);
export const SAVED_RESULT_STATUSES = new Set(['created', 'updated', 'reactivated']);

/**
 * Records live progress on a SourcingRuleRun (see lib/sourcingRuleRunQueue.js
 * and models/SourcingRuleRun.js) so any page load — not just the request
 * that triggered the run — can see what stage it's at. No-ops when `runDoc`
 * is null (e.g. direct/legacy calls to runSourcingRule without a tracked run).
 */
async function setStage(runDoc, stage, stageDetail = '') {
  if (!runDoc) return;
  try {
    await SourcingRuleRun.updateOne({ _id: runDoc._id }, { $set: { stage, stageDetail, updatedAt: new Date() } });
  } catch (err) {
    console.warn(`[Sourcing Automation] Failed to update run stage (${runDoc._id}):`, err.message);
  }
}

/**
 * Exports exactly `listingIds` (not "everything pending" — see export-csv's
 * listingIds filter, routes/templateListings.js) to CSV, records it in CSV
 * Storage, and immediately uploads it to eBay's Feed API. Never throws —
 * returns a result object describing what happened at each step.
 *
 * `target` is a plain {template, seller, region, createdBy, logLabel}
 * config rather than a full SourcingRule doc, so this is reusable both by
 * the sourcing-rule automation and by the manual "Save All" review flow
 * (routes/templateListings.js bulk-save, when saving from a sourcing batch).
 */
export async function exportAndFeedUploadSavedRows(target, listingIds, log, runDoc) {
  const empty = { exported: false, csvStorageId: null, listingCount: 0, taskId: null, status: '', blockedByDailyLimit: false, error: '' };
  if (listingIds.length === 0) {
    log('Nothing saved — skipping CSV export / feed upload.');
    return empty;
  }

  try {
    await setStage(runDoc, 'feed_uploading', `Exporting ${listingIds.length} saved row(s) to CSV...`);
    log(`Exporting ${listingIds.length} saved row(s) to CSV...`);
    const exportResponse = await callInternalApi({
      method: 'GET',
      path: `/template-listings/export-csv/${String(target.template)}?sellerId=${String(target.seller)}&listingIds=${listingIds.join(',')}`,
      asUserId: target.createdBy,
      responseType: 'arraybuffer',
      raw: true,
    });

    const csvBuffer = Buffer.from(exportResponse.data);
    const contentDisposition = String(exportResponse.headers?.['content-disposition'] || '');
    const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
    const fileName = filenameMatch?.[1] || `sourcing_${target.logLabel || target._id || 'batch'}_${Date.now()}.csv`;
    const country = REGION_TO_FEED_COUNTRY[target.region] || 'US';

    const csvRecord = await CsvStorage.create({
      name: fileName.replace(/\.csv$/i, ''),
      fileName,
      csvData: csvBuffer,
      mimeType: 'text/csv',
      seller: target.seller,
      templateId: target.template,
      listingCount: listingIds.length,
      source: 'sourcing_automation',
      listingStatus: 'active',
      country,
      createdBy: target.createdBy,
    });
    log(`Saved to CSV Storage: ${csvRecord._id} (${fileName})`);

    const limitCheck = await checkUploadLimit(String(target.seller), country);
    if (limitCheck.isBlocked) {
      log(`Daily upload limit reached for this seller in ${country} (${limitCheck.currentCount}/${limitCheck.limit}) — CSV saved but not uploaded.`);
      return { exported: true, csvStorageId: String(csvRecord._id), listingCount: listingIds.length, taskId: null, status: '', blockedByDailyLimit: true, error: '' };
    }

    log(`Uploading to eBay Feed API (${country})...`);
    const taskId = await performFeedUpload(String(target.seller), csvBuffer, fileName, 'FX_LISTING', '1.0', { country });
    log(`Feed task created: ${taskId}`);

    const feedUploadDoc = await FeedUpload.findOne({ taskId }).select('_id status').lean();
    if (feedUploadDoc) {
      await CsvStorage.updateOne({ _id: csvRecord._id }, { $set: { feedUploadId: feedUploadDoc._id } });
    }

    return {
      exported: true,
      csvStorageId: String(csvRecord._id),
      listingCount: listingIds.length,
      taskId,
      status: feedUploadDoc?.status || 'CREATED',
      blockedByDailyLimit: false,
      error: '',
    };
  } catch (error) {
    console.error(`[Sourcing Automation] CSV export/feed upload failed:`, error.message);
    return { ...empty, listingCount: listingIds.length, error: error.message };
  }
}

/**
 * If rule.autoGenerateAndSave is on: pre-generate listing previews
 * (/bulk-preview) right after the batch is collected, so it's already
 * populated when a human opens it in the review queue — nothing is saved
 * or fed to eBay here. The batch stays at status 'ready'; a human must
 * still dismiss unwanted items and click "Save All" in the Template
 * Listings Lab (see routes/templateListings.js bulk-save, which performs
 * the actual save + feed-upload for whatever the reviewer kept).
 *
 * bulk-preview goes through lib/internalApiClient.js (an internal,
 * authenticated request to this same server) so results never diverge from
 * the manual "Autofill" flow used when a batch is opened for review.
 *
 * Every step is logged with a `[Sourcing Automation]` prefix and recorded on
 * the batch's `generation` field. Never throws: a failure here just leaves
 * the batch without a pre-generated preview — a human can still open it
 * manually and it will be generated on demand as before.
 */
async function generatePreviewForBatch(rule, batch, runDoc) {
  const log = (...args) => console.log(`[Sourcing Automation] [rule ${rule._id}] [batch ${batch._id}]`, ...args);

  if (!rule.autoGenerateAndSave || batch.asins.length === 0) return null;

  if (!rule.createdBy) {
    const msg = 'autoGenerateAndSave is on but the rule has no createdBy (legacy rule) — skipping preview.';
    console.warn(`[Sourcing Automation] [rule ${rule._id}]`, msg);
    await AsinSourcingBatch.updateOne(
      { _id: batch._id },
      { $set: { 'generation.attempted': true, 'generation.error': msg } }
    );
    return { attempted: true, error: msg };
  }

  try {
    await setStage(runDoc, 'generating_listings', `Requesting bulk-preview for ${batch.asins.length} ASIN(s)...`);
    log(`Requesting bulk-preview for ${batch.asins.length} ASIN(s)...`);
    const previewResponse = await callInternalApi({
      path: '/template-listings/bulk-preview',
      data: { templateId: String(rule.template), sellerId: String(rule.seller), asins: batch.asins, region: rule.region },
      asUserId: rule.createdBy,
    });

    const items = previewResponse.items || [];
    const statusBreakdown = items.reduce((acc, i) => {
      acc[i.status] = (acc[i.status] || 0) + 1;
      return acc;
    }, {});
    log(`bulk-preview done: ${items.length} item(s) —`, statusBreakdown);

    const generation = {
      attempted: true,
      previewSummary: previewResponse.summary || {
        total: items.length,
        successful: statusBreakdown.success || 0,
        warnings: statusBreakdown.warning || 0,
        failed: (statusBreakdown.error || 0) + (statusBreakdown.blocked || 0),
      },
      statusBreakdown,
      skippedForWarnings: statusBreakdown.warning || 0,
      error: '',
      generatedAt: new Date(),
    };

    // status stays 'ready' — this batch still needs a human review + Save All.
    await AsinSourcingBatch.updateOne({ _id: batch._id }, { $set: { generation } });
    log('Preview pre-generated for review.', generation);
    return generation;
  } catch (error) {
    console.error(`[Sourcing Automation] [rule ${rule._id}] Preview pre-generation failed:`, error.message);
    const generation = { attempted: true, error: error.message };
    await AsinSourcingBatch.updateOne(
      { _id: batch._id },
      { $set: { 'generation.attempted': true, 'generation.error': error.message } }
    );
    return generation;
  }
}

/**
 * Runs one SourcingRule end to end: search Amazon -> precheck-enrich ->
 * apply universal filters -> take up to targetAsinCount qualifying
 * (inactive) ASINs -> save as an AsinSourcingBatch. Mirrors the manual
 * ASIN Sourcing -> ASIN Precheck -> "Select All Inactive" -> "Continue" flow.
 */
export async function runSourcingRule(rule, runDoc = null) {
  const startedAt = Date.now();
  try {
    const template = await getEffectiveTemplate(rule.template, rule.seller);
    if (!template) {
      throw new Error('Template not found or not resolvable for this seller');
    }

    // ASINs already handed out by prior batches for this rule shouldn't be
    // re-collected even if they're still "inactive" (e.g. batch not consumed yet).
    const priorBatchAsins = await AsinSourcingBatch.find({ rule: rule._id })
      .select('asins')
      .lean();
    const alreadyBatched = new Set(priorBatchAsins.flatMap((b) => b.asins || []));

    const qualifying = [];
    const qualifyingAsinSet = new Set();
    const seenCandidates = new Set();

    const priceMin = rule.priceMin != null && Number.isFinite(Number(rule.priceMin)) ? Number(rule.priceMin) : null;
    const priceMax = rule.priceMax != null && Number.isFinite(Number(rule.priceMax)) ? Number(rule.priceMax) : null;

    // A page fetch failing (e.g. a transient 429 from the shared scraper
    // account while other Sourcing Rule runs are also active) isn't reason
    // enough to give up on the whole run — searchAmazonAsinsPage already
    // retries transient errors internally with backoff, so a failure here
    // means those retries were exhausted. Skip just that page and keep
    // going; only give up once several pages in a row have failed, which
    // means something is genuinely wrong (bad keyword, API down, etc.).
    const MAX_CONSECUTIVE_PAGE_FAILURES = 3;
    let consecutivePageFailures = 0;

    // Diagnostics — a "shortfall" with no further detail gives no way to
    // tell "Amazon genuinely has no more matching products for this
    // keyword" apart from "the scraper kept failing" apart from "the
    // filters are too strict for this niche." Track exactly why candidates
    // were rejected and why the loop eventually stopped, and surface it in
    // the run summary so that's diagnosable from the Sourcing Rules table
    // instead of guessing.
    let pagesSearched = 0;
    let stopReason = 'target_reached';
    const rejectCounts = { alreadyActive: 0, lowRating: 0, slowDelivery: 0, outOfStock: 0, excludedKeyword: 0, motorsIneligible: 0, precheckFailed: 0 };

    for (let page = 1; page <= MAX_SEARCH_PAGES && qualifying.length < rule.targetAsinCount; page++) {
      await setStage(runDoc, 'collecting_asins', `Page ${page} — searching Amazon (${qualifying.length}/${rule.targetAsinCount} qualifying so far)`);
      let pageRows;
      try {
        pageRows = await searchAmazonAsinsPage({ keyword: rule.searchKeyword, region: rule.region, page });
        consecutivePageFailures = 0;
      } catch (err) {
        if (page === 1) throw err;
        consecutivePageFailures += 1;
        console.warn(`[Sourcing Automation] Search page ${page} failed for rule ${rule._id} (${consecutivePageFailures}/${MAX_CONSECUTIVE_PAGE_FAILURES} consecutive):`, err.message);
        if (consecutivePageFailures >= MAX_CONSECUTIVE_PAGE_FAILURES) {
          console.warn(`[Sourcing Automation] Giving up on rule ${rule._id} after ${consecutivePageFailures} consecutive page failures.`);
          stopReason = 'scraper_errors';
          break;
        }
        continue;
      }

      pagesSearched = page;

      // No rows at all = Amazon's result set for this keyword is exhausted —
      // no point requesting further pages.
      if (!Array.isArray(pageRows) || pageRows.length === 0) {
        stopReason = 'no_more_results';
        break;
      }

      const candidates = pageRows
        .filter((r) => priceMin == null || r.price == null || r.price >= priceMin)
        .filter((r) => priceMax == null || r.price == null || r.price <= priceMax)
        .map((r) => r.asin)
        .filter((asin) => asin && !alreadyBatched.has(asin) && !seenCandidates.has(asin));

      candidates.forEach((asin) => seenCandidates.add(asin));
      if (candidates.length === 0) continue;

      await setStage(runDoc, 'prechecking_asins', `Page ${page} — prechecking ${candidates.length} candidate(s), ${qualifying.length}/${rule.targetAsinCount} qualifying so far`);
      const { activeSkuSet, rowByAsin } = await loadActiveSkuSet(rule.seller, candidates);

      await runWithConcurrency(candidates, ENRICH_CONCURRENCY, async (asin) => {
        if (qualifying.length >= rule.targetAsinCount) return;
        try {
          const generated = rowByAsin.get(asin);
          const row = await precheckAsin(asin, rule.region, template, activeSkuSet, generated);
          if (qualifyingAsinSet.has(asin)) return;
          if (!passesPrecheckFilters(row, rule.filters)) {
            const f = rule.filters || {};
            if ((f.active ?? 'all') === 'inactive' && row.active === true) rejectCounts.alreadyActive += 1;
            else if (Number.isFinite(Number(f.minRating)) && String(f.minRating ?? '') !== '' && !(Number(row.rating) >= Number(f.minRating))) rejectCounts.lowRating += 1;
            else if (Number.isFinite(Number(f.deliveryWithinDays)) && String(f.deliveryWithinDays ?? '') !== '' && !(Number(row.deliveryDays) <= Number(f.deliveryWithinDays))) rejectCounts.slowDelivery += 1;
            else if ((f.stock ?? 'all') === 'in_stock' && row.inStock !== true) rejectCounts.outOfStock += 1;
            else rejectCounts.excludedKeyword += 1;
            return;
          }

          if (rule.ebayMotorsMode) {
            const classification = await classifyEbayMotorsTitle(row.title, asin);
            if (!classification.eligible) {
              rejectCounts.motorsIneligible += 1;
              return;
            }
          }

          qualifyingAsinSet.add(asin);
          qualifying.push(asin);
        } catch (err) {
          rejectCounts.precheckFailed += 1;
          console.warn(`[Sourcing Automation] Failed to precheck ${asin} for rule ${rule._id}:`, err.message);
        }
      });
    }

    if (stopReason === 'target_reached' && qualifying.length < rule.targetAsinCount) {
      stopReason = 'max_pages_reached';
    }

    const finalAsins = qualifying.slice(0, rule.targetAsinCount);
    const shortfall = finalAsins.length < rule.targetAsinCount;

    const stopReasonText = {
      no_more_results: `Amazon had no more results for "${rule.searchKeyword}" after page ${pagesSearched}`,
      max_pages_reached: `hit the ${MAX_SEARCH_PAGES}-page search cap`,
      scraper_errors: `the scraper kept failing after page ${pagesSearched} (rate-limited or provider down)`,
      target_reached: '',
    }[stopReason];

    const rejectSummary = Object.entries(rejectCounts)
      .filter(([, count]) => count > 0)
      .map(([reason, count]) => `${count} ${reason.replace(/([A-Z])/g, ' $1').toLowerCase()}`)
      .join(', ');

    const shortfallDetail = shortfall
      ? ` — stopped: ${stopReasonText}${seenCandidates.size ? `; saw ${seenCandidates.size} candidate(s) across ${pagesSearched} page(s)` : ''}${rejectSummary ? `; rejected ${rejectSummary}` : ''}.`
      : '';

    const batch = await AsinSourcingBatch.create({
      rule: rule._id,
      seller: rule.seller,
      template: rule.template,
      region: rule.region,
      asins: finalAsins,
      targetCount: rule.targetAsinCount,
      foundCount: finalAsins.length,
      shortfall,
    });
    // Link the run to its batch as soon as it exists, not just at the end —
    // so a page checking run status mid-flight can already jump to it.
    if (runDoc) {
      await SourcingRuleRun.updateOne(
        { _id: runDoc._id },
        { $set: { batch: batch._id, foundCount: finalAsins.length, targetCount: rule.targetAsinCount, shortfall } }
      );
    }

    const generation = await generatePreviewForBatch(rule, batch, runDoc);

    const durationSec = Math.round((Date.now() - startedAt) / 1000);
    let summary = shortfall
      ? `Found ${finalAsins.length}/${rule.targetAsinCount} qualifying ASINs in ${durationSec}s (shortfall)${shortfallDetail}`
      : `Found ${finalAsins.length}/${rule.targetAsinCount} qualifying ASINs in ${durationSec}s.`;

    let lastRunStatus = shortfall ? 'partial' : 'success';
    if (generation) {
      if (generation.error) {
        summary += ` Preview pre-generation failed: ${generation.error}`;
        lastRunStatus = 'partial';
      } else if (generation.previewSummary) {
        const s = generation.previewSummary;
        summary += ` Preview ready for review: ${s.successful} success, ${s.warnings} warning, ${s.failed} failed/blocked.`;
      }
    }

    await SourcingRule.updateOne(
      { _id: rule._id },
      {
        $set: {
          lastRunAt: new Date(),
          lastRunStatus,
          lastRunSummary: summary,
          lastRunAsinCount: finalAsins.length,
        },
      }
    );

    await setStage(runDoc, 'completed', summary);

    return { batch, summary, shortfall, generation };
  } catch (error) {
    console.error(`[Sourcing Automation] Rule ${rule._id} failed:`, error.message);
    await SourcingRule.updateOne(
      { _id: rule._id },
      {
        $set: {
          lastRunAt: new Date(),
          lastRunStatus: 'error',
          lastRunSummary: error.message || 'Sourcing run failed',
          lastRunAsinCount: 0,
        },
      }
    );
    throw error;
  }
}
