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

// eBay Feed API marketplace country codes (CsvStorage.country enum) —
// region 'CA' in Sourcing Rules maps to 'Canada' here, matching how the
// manual Feed Upload page labels it.
const REGION_TO_FEED_COUNTRY = { US: 'US', UK: 'UK', AU: 'AU', CA: 'Canada' };

// How many Amazon search-result pages one run will page through while still
// short of targetAsinCount, before giving up and reporting a shortfall.
// Keep trying rather than stopping early — the old 5-page cap gave up well
// before genuinely exhausting Amazon's results for the keyword.
const MAX_SEARCH_PAGES = parseInt(process.env.SOURCING_MAX_SEARCH_PAGES, 10) || 25;
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

const SAVABLE_STATUSES = new Set(['success', 'warning']);
const SAVED_RESULT_STATUSES = new Set(['created', 'updated', 'reactivated']);

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
 */
async function exportAndFeedUploadSavedRows(rule, listingIds, log, runDoc) {
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
      path: `/template-listings/export-csv/${String(rule.template)}?sellerId=${String(rule.seller)}&listingIds=${listingIds.join(',')}`,
      asUserId: rule.createdBy,
      responseType: 'arraybuffer',
      raw: true,
    });

    const csvBuffer = Buffer.from(exportResponse.data);
    const contentDisposition = String(exportResponse.headers?.['content-disposition'] || '');
    const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
    const fileName = filenameMatch?.[1] || `sourcing_${rule._id}_${Date.now()}.csv`;
    const country = REGION_TO_FEED_COUNTRY[rule.region] || 'US';

    const csvRecord = await CsvStorage.create({
      name: fileName.replace(/\.csv$/i, ''),
      fileName,
      csvData: csvBuffer,
      mimeType: 'text/csv',
      seller: rule.seller,
      templateId: rule.template,
      listingCount: listingIds.length,
      source: 'sourcing_automation',
      listingStatus: 'active',
      country,
      createdBy: rule.createdBy,
    });
    log(`Saved to CSV Storage: ${csvRecord._id} (${fileName})`);

    const limitCheck = await checkUploadLimit(String(rule.seller), country);
    if (limitCheck.isBlocked) {
      log(`Daily upload limit reached for this seller in ${country} (${limitCheck.currentCount}/${limitCheck.limit}) — CSV saved but not uploaded.`);
      return { exported: true, csvStorageId: String(csvRecord._id), listingCount: listingIds.length, taskId: null, status: '', blockedByDailyLimit: true, error: '' };
    }

    log(`Uploading to eBay Feed API (${country})...`);
    const taskId = await performFeedUpload(String(rule.seller), csvBuffer, fileName, 'FX_LISTING', '1.0', { country });
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
    console.error(`[Sourcing Automation] [rule ${rule._id}] CSV export/feed upload failed:`, error.message);
    return { ...empty, listingCount: listingIds.length, error: error.message };
  }
}

/**
 * If rule.autoGenerateAndSave is on: generate listings (/bulk-preview), save
 * them as Active (/bulk-save), then push the newly-saved rows to eBay via
 * the same CSV Feed pipeline the "CSV Listings" page's Download CSV button
 * uses — export exactly those rows to CSV (/export-csv, scoped by
 * listingIds so nothing else pending gets swept in), record that CSV in CSV
 * Storage (so it shows up in CSV Listings' history, same as a manual
 * download), then upload it to eBay's Feed API immediately
 * (performFeedUpload — the same function the Feed Upload page and the
 * scheduled CSV auto-upload cron both call), linking the resulting
 * FeedUpload record back onto the CSV Storage row exactly like a manual
 * upload does. Its status/success-failure counts are then visible on the
 * Feed Upload page like any other upload.
 *
 * bulk-preview/bulk-save go through lib/internalApiClient.js (an internal,
 * authenticated request to this same server) so behavior never diverges
 * from the manual "Save All" flow — matches its item filter exactly (see
 * AsinReviewModal.jsx:964-966): saves 'success' AND 'warning' items, skips
 * only error/blocked/loading. export-csv is also called that way (it's a
 * large, request-coupled route handler); CSV Storage and the Feed API
 * upload are plain model/lib calls, made directly.
 *
 * Every step is logged with a `[Sourcing Automation]` prefix and recorded on
 * the batch's `generation` field, so a run's outcome (generated? saved? fed
 * to eBay? why not?) is always inspectable without re-running anything.
 * Never throws: a failure here leaves the batch 'ready' so a human can still
 * open it manually.
 */
async function generateAndSaveBatch(rule, batch, runDoc) {
  const log = (...args) => console.log(`[Sourcing Automation] [rule ${rule._id}] [batch ${batch._id}]`, ...args);

  if (!rule.autoGenerateAndSave || batch.asins.length === 0) return null;

  if (!rule.createdBy) {
    const msg = 'autoGenerateAndSave is on but the rule has no createdBy (legacy rule) — skipping.';
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

    const savableItems = items.filter((i) => SAVABLE_STATUSES.has(i.status));
    const skippedItems = items.filter((i) => !SAVABLE_STATUSES.has(i.status));
    if (skippedItems.length > 0) {
      log(`Skipping ${skippedItems.length} non-savable item(s):`, skippedItems.map((i) => `${i.asin} (${i.status}: ${(i.errors || []).join('; ') || (i.warnings || []).join('; ')})`));
    }
    const listings = savableItems.map((i) => i.generatedListing).filter(Boolean);

    let saveSummary = null;
    let saveResults = [];
    if (listings.length > 0) {
      await setStage(runDoc, 'saving_listings', `Saving ${listings.length} listing(s) as Active...`);
      log(`Requesting bulk-save (Active) for ${listings.length} listing(s)...`);
      const saveResponse = await callInternalApi({
        path: '/template-listings/bulk-save',
        data: {
          templateId: String(rule.template),
          sellerId: String(rule.seller),
          listings,
          options: { skipDuplicates: true, status: 'active' },
          region: rule.region,
        },
        asUserId: rule.createdBy,
      });
      saveSummary = {
        total: saveResponse.total,
        created: saveResponse.created,
        updated: saveResponse.updated,
        reactivated: saveResponse.reactivated,
        failed: saveResponse.failed,
        skipped: saveResponse.skipped,
      };
      saveResults = saveResponse.results || [];
      log('bulk-save done:', saveSummary);
      if (saveResponse.errors?.length) {
        log('bulk-save errors:', saveResponse.errors);
      }
    } else {
      log('Nothing savable — skipping bulk-save.');
    }

    // Only feed-upload rows that actually landed in the DB
    // (created/updated/reactivated) — not ones bulk-save itself skipped/failed.
    const savedListingIds = [...new Set(
      saveResults
        .filter((r) => SAVED_RESULT_STATUSES.has(r.status) && r.listing?._id)
        .map((r) => String(r.listing._id))
    )];

    const feedUpload = await exportAndFeedUploadSavedRows(rule, savedListingIds, log, runDoc);

    const generation = {
      attempted: true,
      previewSummary: previewResponse.summary || null,
      statusBreakdown,
      saveSummary,
      skippedForWarnings: statusBreakdown.warning || 0,
      feedUpload,
      error: '',
      generatedAt: new Date(),
    };

    await AsinSourcingBatch.updateOne({ _id: batch._id }, { $set: { status: 'generated', generation } });
    log('Batch marked generated.', generation);
    return generation;
  } catch (error) {
    console.error(`[Sourcing Automation] [rule ${rule._id}] Auto-generate/save failed:`, error.message);
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

    for (let page = 1; page <= MAX_SEARCH_PAGES && qualifying.length < rule.targetAsinCount; page++) {
      await setStage(runDoc, 'collecting_asins', `Page ${page} — searching Amazon (${qualifying.length}/${rule.targetAsinCount} qualifying so far)`);
      let pageRows;
      try {
        pageRows = await searchAmazonAsinsPage({ keyword: rule.searchKeyword, region: rule.region, page });
      } catch (err) {
        if (page === 1) throw err;
        console.warn(`[Sourcing Automation] Search page ${page} failed for rule ${rule._id}, stopping pagination:`, err.message);
        break;
      }

      // No rows at all = Amazon's result set for this keyword is exhausted —
      // no point requesting further pages.
      if (!Array.isArray(pageRows) || pageRows.length === 0) break;

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
          if (passesPrecheckFilters(row, rule.filters) && !qualifyingAsinSet.has(asin)) {
            qualifyingAsinSet.add(asin);
            qualifying.push(asin);
          }
        } catch (err) {
          console.warn(`[Sourcing Automation] Failed to precheck ${asin} for rule ${rule._id}:`, err.message);
        }
      });
    }

    const finalAsins = qualifying.slice(0, rule.targetAsinCount);
    const shortfall = finalAsins.length < rule.targetAsinCount;

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

    const generation = await generateAndSaveBatch(rule, batch, runDoc);

    const durationSec = Math.round((Date.now() - startedAt) / 1000);
    let summary = shortfall
      ? `Found ${finalAsins.length}/${rule.targetAsinCount} qualifying ASINs in ${durationSec}s (shortfall).`
      : `Found ${finalAsins.length}/${rule.targetAsinCount} qualifying ASINs in ${durationSec}s.`;

    let lastRunStatus = shortfall ? 'partial' : 'success';
    if (generation) {
      if (generation.error) {
        summary += ` Auto-generate/save failed: ${generation.error}`;
        lastRunStatus = 'partial';
      } else if (generation.saveSummary) {
        const s = generation.saveSummary;
        summary += ` Auto-saved: ${s.created} created, ${s.updated} updated, ${s.reactivated} reactivated, ${s.failed} failed, ${s.skipped} skipped.`;
        const fu = generation.feedUpload;
        if (fu?.blockedByDailyLimit) {
          summary += ` CSV saved but not uploaded — daily eBay upload limit reached for this seller.`;
          lastRunStatus = 'partial';
        } else if (fu?.taskId) {
          summary += ` Fed ${fu.listingCount} to eBay (feed task ${fu.taskId}).`;
        } else if (fu?.error) {
          summary += ` CSV export/feed upload failed: ${fu.error}`;
          lastRunStatus = 'partial';
        }
      } else {
        summary += ' No listings qualified for auto-save (all had errors/blocked).';
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
