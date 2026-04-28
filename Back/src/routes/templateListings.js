import express from 'express';
import { requireAuth, requireAuthSSE } from '../middleware/auth.js';
import TemplateListing from '../models/TemplateListing.js';
import ListingTemplate from '../models/ListingTemplate.js';
import Seller from '../models/Seller.js';
import SellerPricingConfig from '../models/SellerPricingConfig.js';
import { fetchAmazonData, applyFieldConfigs } from '../utils/asinAutofill.js';
import { generateSKUFromASIN, generateSKUWithCount } from '../utils/skuGenerator.js';
import { getEffectiveTemplate } from '../utils/templateMerger.js';
import { processImagePlaceholders } from '../utils/imageReplacer.js';
import { getUsageStats, getFieldExtractionStats, getRecentErrors, checkQuotaStatus } from '../utils/apiUsageTracker.js';
import { getAsinCacheStats, clearAsinCache, invalidateAsinCache } from '../utils/asinCache.js';
import AsinDirectory from '../models/AsinDirectory.js';

const router = express.Router();

function formatBulletLi(text, isLast = false) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const words = cleaned.split(' ');
  const firstThree = words.slice(0, 3).join(' ');
  const rest = words.slice(3).join(' ');
  const borderCss = isLast ? '' : 'border-bottom:1px solid #e8d88a;';
  return `<li style='padding:10px 14px;${borderCss}font-size:16px;color:#1a1a1a;'><span style='color:#b8960c;margin-right:8px;'>&#9658;</span><strong>${firstThree}</strong>${rest ? ` ${rest}` : ''}</li>`;
}

function buildFallbackFeatureBullets(rawDescription = '') {
  const source = String(rawDescription || '').trim();
  if (!source) return '';
  const lines = source
    .split(/\r?\n|[•●▪‣]/g)
    .map(s => s.replace(/^[\-\*\d\.\)\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, 6);
  if (lines.length === 0) return '';
  return lines.map((line, idx) => formatBulletLi(line, idx === lines.length - 1)).join('');
}

function normalizeAiFeatureBullets(aiDescription = '') {
  const text = String(aiDescription || '').trim();
  if (!text) return '';
  // If AI returned full HTML with <li> tags, keep only those.
  const liMatches = text.match(/<li[\s\S]*?<\/li>/gi);
  if (liMatches?.length) return liMatches.join('');
  // If plain text came back, convert line-by-line to expected list items.
  const lines = text
    .split(/\r?\n|[•●▪‣]/g)
    .map(s => s.replace(/^[\-\*\d\.\)\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, 6);
  return lines.map((line, idx) => formatBulletLi(line, idx === lines.length - 1)).join('');
}

function parseAmazonPriceToNumber(priceValue) {
  const numeric = parseFloat(String(priceValue || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function mergeTemplateCoreFields(coreFieldDefaults = {}, autoCoreFields = {}, amazonData = {}) {
  const merged = {
    ...(coreFieldDefaults || {}),
    ...(autoCoreFields || {})
  };

  // Apply resilient fallbacks so preview still has usable output
  // even when field configs are missing or incomplete.
  if (!String(merged.title || '').trim() && String(amazonData?.title || '').trim()) {
    merged.title = String(amazonData.title).trim().slice(0, 80);
  }

  if (!String(merged.itemPhotoUrl || '').trim() && Array.isArray(amazonData?.images) && amazonData.images[0]) {
    merged.itemPhotoUrl = amazonData.images[0];
  }

  if (!String(merged.description || '').trim() && String(amazonData?.description || '').trim()) {
    merged.description = String(amazonData.description).trim();
  }

  if (merged.startPrice === undefined || merged.startPrice === null || merged.startPrice === '') {
    const parsedAmazonPrice = parseAmazonPriceToNumber(amazonData?.price);
    // Keep the listing valid even when Amazon price is unavailable.
    merged.startPrice = parsedAmazonPrice ? parsedAmazonPrice.toFixed(2) : '0.01';
  }

  const templateDescription = coreFieldDefaults?.description;
  if (typeof templateDescription !== 'string' || !templateDescription) {
    return merged;
  }

  const aiDescription = typeof autoCoreFields?.description === 'string'
    ? autoCoreFields.description
    : '';
  const normalizedAiBullets = normalizeAiFeatureBullets(aiDescription);
  const fallbackBullets = buildFallbackFeatureBullets(amazonData?.description || '');
  const resolvedBullets = normalizedAiBullets || fallbackBullets;
  // Use source Amazon title in description placeholders when available,
  // so description content is not limited by eBay title-length constraints.
  const titleClean = typeof amazonData?.title === 'string' && amazonData.title.trim()
    ? amazonData.title.trim()
    : (typeof merged?.title === 'string' ? merged.title : '');
  const imageUrls = Array.isArray(amazonData?.images) ? amazonData.images : [];

  let composedDescription = templateDescription;
  const placeholderMap = {
    '{{AI_FEATURE_BULLETS}}': resolvedBullets,
    '{{AI_DESCRIPTION}}': resolvedBullets || aiDescription,
    '{{TITLE_CLEAN}}': titleClean,
    '{{MAIN_IMAGE}}': '{image_main}',
    '{{SUB1}}': '{image_sub1}',
    '{{SUB2}}': '{image_sub2}',
    '{{SUB3}}': '{image_sub3}',
    '{{SUB4}}': '{image_sub4}',
    '{{SUB5}}': '{image_sub5}',
    '{{SUB6}}': '{image_sub6}',
    '{{SUB7}}': '{image_sub7}',
  };
  let usedPlaceholder = false;
  for (const [token, replacement] of Object.entries(placeholderMap)) {
    if (composedDescription.includes(token)) {
      composedDescription = composedDescription.split(token).join(replacement || '');
      usedPlaceholder = true;
    }
  }

  if (usedPlaceholder) {
    composedDescription = processImagePlaceholders(composedDescription, imageUrls);
    merged.description = composedDescription;
  }

  return merged;
}

function getImageCount(images) {
  if (Array.isArray(images)) {
    return images.filter(url => String(url || '').trim()).length;
  }
  if (typeof images === 'string') {
    return images.split(' | ').filter(url => url.trim()).length;
  }
  return 0;
}

function getOrderedUniqueCustomColumns(customColumns = []) {
  const seen = new Set();
  return (Array.isArray(customColumns) ? customColumns : [])
    .slice()
    .sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0))
    .filter((col) => {
      const name = String(col?.name || '').trim();
      if (!name) return false;
      const normalized = name.toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

function sanitizeCustomCsvValueByHeader(header, value) {
  const headerName = String(header || '').trim().toLowerCase();
  const raw = value == null ? '' : String(value);

  // eBay category template constraint: C:Feature max length is 65 chars.
  if (headerName === 'c:feature' && raw.length > 65) {
    return raw.slice(0, 65);
  }

  return raw;
}

// Get all listings for a template
router.get('/', requireAuth, async (req, res) => {
  try {
    const { templateId, sellerId, page = 1, limit = 50, batchFilter = 'active', batchId, status = 'active', minPrice, maxPrice, search } = req.query;
    
    if (!templateId) {
      return res.status(400).json({ error: 'Template ID is required' });
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build filter with optional seller filtering
    const filter = { templateId };
    if (sellerId) {
      filter.sellerId = sellerId;
    }
    
    // Filter by status (default to 'active' to only show active listings)
    if (status && status !== 'all') {
      filter.status = status;
    }
    
    // Price range filter
    if (minPrice || maxPrice) {
      filter.startPrice = {};
      if (minPrice) filter.startPrice.$gte = parseFloat(minPrice);
      if (maxPrice) filter.startPrice.$lte = parseFloat(maxPrice);
    }
    
    // Keyword / ASIN search
    if (search && search.trim()) {
      const rx = { $regex: search.trim(), $options: 'i' };
      filter.$or = [{ title: rx }, { customLabel: rx }];
    }
    
    // Apply batch filtering
    if (batchId) {
      // Specific batch
      filter.downloadBatchId = batchId;
    } else if (batchFilter === 'active') {
      // Active batch: not yet downloaded OR flagged for re-download after duplicate update
      filter.$or = [{ downloadBatchId: null }, { pendingRedownload: true }];
    } else if (batchFilter === 'all') {
      // All batches (no filter on downloadBatchId)
    }
    
    const [listings, total] = await Promise.all([
      TemplateListing.find(filter)
        .select('+_asinReference')
        .populate('createdBy', 'name email')
        .populate({
          path: 'sellerId',
          populate: {
            path: 'user',
            select: 'username email'
          }
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      TemplateListing.countDocuments(filter)
    ]);
    
    res.json({
      listings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching listings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Database view endpoint with comprehensive filters (MUST be before /:id route)
router.get('/database-view', requireAuth, async (req, res) => {
  try {
    const { 
      sellerId, 
      templateId, 
      status, 
      search, 
      page = 1, 
      limit = 50 
    } = req.query;
    
    // Build query - exclude soft-deleted items
    const query = { deletedAt: null };
    
    if (sellerId) query.sellerId = sellerId;
    if (templateId) query.templateId = templateId;
    if (status) query.status = status;
    
    // Search across ASIN, SKU (customLabel), and Title
    if (search) {
      query.$or = [
        { _asinReference: new RegExp(search, 'i') },
        { customLabel: new RegExp(search, 'i') },
        { title: new RegExp(search, 'i') }
      ];
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Fetch with populated fields
    const [listings, total] = await Promise.all([
      TemplateListing.find(query)
        .select('+_asinReference') // Include ASIN in results
        .populate({
          path: 'sellerId',
          populate: {
            path: 'user',
            select: 'username email'
          }
        })
        .populate('templateId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      TemplateListing.countDocuments(query)
    ]);
    
    res.json({
      listings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Database view error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Database statistics endpoint (MUST be before /:id route)
router.get('/database-stats', requireAuth, async (req, res) => {
  try {
    const stats = await TemplateListing.aggregate([
      { $match: { deletedAt: null } },
      {
        $group: {
          _id: null,
          totalListings: { $sum: 1 },
          uniqueSellers: { $addToSet: '$sellerId' },
          uniqueTemplates: { $addToSet: '$templateId' },
          draftCount: {
            $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] }
          },
          activeCount: {
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
          },
          inactiveCount: {
            $sum: { $cond: [{ $eq: ['$status', 'inactive'] }, 1, 0] }
          }
        }
      }
    ]);
    
    res.json({
      total: stats[0]?.totalListings || 0,
      sellers: stats[0]?.uniqueSellers?.length || 0,
      templates: stats[0]?.uniqueTemplates?.length || 0,
      draft: stats[0]?.draftCount || 0,
      active: stats[0]?.activeCount || 0,
      inactive: stats[0]?.inactiveCount || 0
    });
  } catch (error) {
    console.error('Database stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get statistics for template listings (today, week, month, total)
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const { templateId, sellerId } = req.query;
    
    if (!templateId) {
      return res.status(400).json({ error: 'Template ID is required' });
    }
    
    const filter = { templateId };
    if (sellerId) {
      filter.sellerId = sellerId;
    }
    
    // Calculate date ranges
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    
    // Run queries in parallel
    const [todayCount, weekCount, monthCount, totalCount] = await Promise.all([
      TemplateListing.countDocuments({
        ...filter,
        status: 'active',
        createdAt: { $gte: todayStart, $lte: todayEnd }
      }),
      TemplateListing.countDocuments({
        ...filter,
        status: 'active',
        createdAt: { $gte: weekStart }
      }),
      TemplateListing.countDocuments({
        ...filter,
        status: 'active',
        createdAt: { $gte: monthStart }
      }),
      TemplateListing.countDocuments({
        ...filter,
        status: 'active'
      })
    ]);
    
    res.json({
      today: todayCount,
      thisWeek: weekCount,
      thisMonth: monthCount,
      total: totalCount
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get detailed analytics for template listings
router.get('/analytics', requireAuth, async (req, res) => {
  try {
    const { templateId, sellerId, startDate, endDate, userId, page = 1, limit = 100 } = req.query;
    
    if (!templateId) {
      return res.status(400).json({ error: 'Template ID is required' });
    }
    
    const filter = { templateId };
    if (sellerId) {
      filter.sellerId = sellerId;
    }
    
    // Apply date range filter
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.createdAt.$lte = new Date(endDate);
      }
    }
    
    // Apply user filter
    if (userId && userId !== 'all') {
      filter.createdBy = userId;
    }
    
    // Get paginated listings
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [listings, total] = await Promise.all([
      TemplateListing.find(filter)
        .populate('createdBy', 'username email role')
        .select('customLabel title _asinReference createdBy createdAt status')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      TemplateListing.countDocuments(filter)
    ]);
    
    // Get daily breakdown using aggregation
    const dailyBreakdown = await TemplateListing.aggregate([
      {
        $match: filter
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            userId: "$createdBy"
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: "$_id.date",
          total: { $sum: "$count" },
          users: {
            $push: {
              userId: "$_id.userId",
              count: "$count"
            }
          }
        }
      },
      {
        $sort: { _id: -1 }
      },
      {
        $limit: 30 // Last 30 days
      }
    ]);
    
    // Populate user details in daily breakdown
    const userIds = [...new Set(dailyBreakdown.flatMap(d => d.users.map(u => u.userId)))].filter(Boolean);
    const users = await TemplateListing.model('User').find({ _id: { $in: userIds } }).select('username email role');
    const userMap = new Map(users.map(u => [u._id.toString(), u]));
    
    // Enrich daily breakdown with user details
    const enrichedDailyBreakdown = dailyBreakdown.map(day => ({
      date: day._id,
      total: day.total,
      users: day.users
        .filter(u => u.userId)
        .map(u => ({
          userId: u.userId,
          username: userMap.get(u.userId.toString())?.username || 'Unknown',
          count: u.count
        }))
    }));
    
    // Get user breakdown
    const userBreakdown = await TemplateListing.aggregate([
      {
        $match: filter
      },
      {
        $group: {
          _id: "$createdBy",
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);
    
    // Populate user details in user breakdown
    const enrichedUserBreakdown = await Promise.all(
      userBreakdown
        .filter(u => u._id)
        .map(async (u) => {
          const user = userMap.get(u._id.toString());
          return {
            userId: u._id,
            username: user?.username || 'Unknown',
            role: user?.role || 'N/A',
            count: u.count
          };
        })
    );
    
    res.json({
      listings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      dailyBreakdown: enrichedDailyBreakdown,
      userBreakdown: enrichedUserBreakdown,
      summary: {
        totalInPeriod: total,
        uniqueUsers: enrichedUserBreakdown.length
      }
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk preview with SSE streaming (real-time updates) - MUST be before /:id route
router.get('/bulk-preview-stream', requireAuthSSE, async (req, res) => {
  try {
    const { templateId, sellerId, asins: asinsParam, region = 'US' } = req.query;
    
    if (!templateId || !sellerId || !asinsParam) {
      return res.status(400).json({ error: 'Template ID, Seller ID, and ASINs are required' });
    }
    
    const asins = asinsParam.split(',').map(a => a.trim()).filter(Boolean);
    
    if (asins.length === 0) {
      return res.status(400).json({ error: 'At least one ASIN is required' });
    }
    
    if (asins.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 ASINs allowed per batch' });
    }
    
    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Disable nginx buffering
    });
    
    console.log(`📡 [SSE Stream] Starting for ${asins.length} ASINs...`);
    
    // Send initial event
    res.write(`data: ${JSON.stringify({ type: 'started', total: asins.length })}\n\n`);
    
    // Validate seller and template
    const [seller, template] = await Promise.all([
      Seller.findById(sellerId),
      getEffectiveTemplate(templateId, sellerId)
    ]);
    
    if (!seller || !template) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Seller or template not found' })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    const fieldConfigs = Array.isArray(template?.asinAutomation?.fieldConfigs)
      ? template.asinAutomation.fieldConfigs
      : [];
    
    // Get pricing config
    let pricingConfig = template.pricingConfig;
    const sellerConfig = await SellerPricingConfig.findOne({ sellerId, templateId });
    if (sellerConfig) {
      pricingConfig = sellerConfig.pricingConfig;
    }
    
    // Check for existing ASINs and SKUs (same as bulk-preview)
    const existingAsinListings = await TemplateListing.find({
      sellerId,
      _asinReference: { $in: asins },
      status: 'active'
    }).select('+_asinReference').lean();
    
    const asinInCurrentTemplate = new Map(); // Changed to Map to store full listing data
    const asinInOtherTemplates = new Map();
    
    existingAsinListings.forEach(listing => {
      if (listing.templateId.toString() === templateId.toString()) {
        asinInCurrentTemplate.set(listing._asinReference, listing); // Store full listing
      } else {
        asinInOtherTemplates.set(listing._asinReference, listing.templateId);
      }
    });
    
    // Pre-generate SKUs and check conflicts
    const generatedSKUs = asins.map(asin => ({
      asin,
      sku: generateSKUFromASIN(asin)
    }));
    
    const existingBySKU = await TemplateListing.find({
      templateId,
      sellerId,
      customLabel: { $in: generatedSKUs.map(item => item.sku) },
      status: { $in: ['active', 'draft'] }
    }).select('customLabel _asinReference _id').lean();
    
    const existingSKUMap = new Map(
      existingBySKU.map(listing => [listing.customLabel, {
        id: listing._id,
        asin: listing._asinReference
      }])
    );
    
    // Process ASINs in parallel and stream results as they complete
    let completed = 0;
    
    const processPromises = asins.map(async (asin) => {
      try {
        // Check for blocking conditions
        if (asinInOtherTemplates.has(asin)) {
          const item = {
            id: `preview-${asin}`,
            asin,
            sku: generateSKUFromASIN(asin),
            status: 'blocked',
            blockedReason: 'cross_template_duplicate',
            errors: [`ASIN exists in another template`]
          };
          res.write(`data: ${JSON.stringify({ type: 'item', item, progress: ++completed, total: asins.length })}\n\n`);
          return;
        }
        
        // Check if ASIN exists in current template (duplicate_updateable case)
        // This must be checked BEFORE SKU conflict check because duplicate ASINs
        // will have the same SKU and should be updateable, not blocked
        if (asinInCurrentTemplate.has(asin)) {
          const existingListing = asinInCurrentTemplate.get(asin);

          // Get existing customFields (already an object from .lean())
          const existingCustomFields = existingListing.customFields || {};

          // Compute future SKU based on current listing count
          const asinCountDoc = await AsinDirectory.findOne({ asin }).select('listingCount').lean();
          const futureSKU = generateSKUWithCount(asin, asinCountDoc?.listingCount || 0);

          // Return existing listing data for editing (no re-fetch)
          const item = {
            id: `preview-${asin}`,
            asin,
            sku: futureSKU,
            status: 'duplicate_updateable',

            // Return existing data as generatedListing so modal can display it
            generatedListing: {
              title: existingListing.title,
              description: existingListing.description,
              startPrice: existingListing.startPrice,
              quantity: existingListing.quantity,
              itemPhotoUrl: existingListing.itemPhotoUrl || '',
              conditionId: existingListing.conditionId || '',
              format: existingListing.format || '',
              duration: existingListing.duration || '',
              location: existingListing.location || '',
              customLabel: futureSKU,
              customFields: existingCustomFields,
              _asinReference: asin,
              _existingListingId: existingListing._id // Track which listing to update
            },

            warnings: [
              `This ASIN already exists in this template.`,
              existingListing.duplicateCount > 0
                ? `Previously updated ${existingListing.duplicateCount} time(s).`
                : `First time editing this ASIN.`
            ],
            errors: []
          };

          res.write(`data: ${JSON.stringify({ type: 'item', item, progress: ++completed, total: asins.length })}\n\n`);
          return;
        }
        
        // Check for SKU conflicts (only for new ASINs, not duplicates)
        const sku = generateSKUFromASIN(asin);
        const existingSKU = existingSKUMap.get(sku);
        
        if (existingSKU) {
          const item = {
            id: `preview-${asin}`,
            asin,
            sku,
            status: 'blocked',
            blockedReason: 'sku_conflict',
            errors: [`SKU ${sku} already exists`]
          };
          res.write(`data: ${JSON.stringify({ type: 'item', item, progress: ++completed, total: asins.length })}\n\n`);
          return;
        }
        
        // Fetch and process ASIN (new listing case)
        const amazonData = await fetchAmazonData(asin, region);
        const { coreFields, customFields, pricingCalculation } = 
          await applyFieldConfigs(amazonData, fieldConfigs, pricingConfig);
        
        const mergedCoreFields = mergeTemplateCoreFields(template.coreFieldDefaults, coreFields, amazonData);
        
        if (template?.customColumns && template.customColumns.length > 0) {
          template.customColumns.forEach(col => {
            if (col.defaultValue && !customFields[col.name]) {
              customFields[col.name] = col.defaultValue;
            }
          });
        }
        
        const warnings = [];
        const validationErrors = [];
        
        if (!mergedCoreFields.title) {
          validationErrors.push('Missing required field: title');
        }
        
        if (mergedCoreFields.startPrice === undefined || mergedCoreFields.startPrice === null || mergedCoreFields.startPrice === '') {
          validationErrors.push('Missing required field: startPrice');
        }
        
        if (!mergedCoreFields.description) {
          warnings.push('Missing description');
        }

        // Compute count-based SKU for new listing preview
        const countDoc = await AsinDirectory.findOne({ asin }).select('listingCount').lean();
        const finalSKU = generateSKUWithCount(asin, countDoc?.listingCount || 0);

        const item = {
          id: `preview-${asin}`,
          asin,
          sku: finalSKU,
          sourceData: {
            title: amazonData.title,
            brand: amazonData.brand,
            price: amazonData.price,
            description: amazonData.description,
            images: amazonData.images,
            color: amazonData.color,
            compatibility: amazonData.compatibility,
            model: amazonData.model,
            material: amazonData.material,
            specialFeatures: amazonData.specialFeatures,
            size: amazonData.size,
            formFactor: amazonData.formFactor,
            screenSize: amazonData.screenSize,
            bandMaterial: amazonData.bandMaterial,
            bandWidth: amazonData.bandWidth,
            bandColor: amazonData.bandColor,
            includedComponents: amazonData.includedComponents
          },
          generatedListing: {
            ...mergedCoreFields,
            customLabel: finalSKU,
            customFields,
            _asinReference: asin
          },
          pricingCalculation,
          warnings,
          errors: validationErrors,
          status: validationErrors.length > 0 ? 'error' : (warnings.length > 0 ? 'warning' : 'success')
        };

        // Stream the completed item
        res.write(`data: ${JSON.stringify({ type: 'item', item, progress: ++completed, total: asins.length })}\n\n`);

      } catch (error) {
        console.error(`❌ Error processing ASIN ${asin}:`, error);
        const item = {
          id: `preview-${asin}`,
          asin,
          sku: generateSKUFromASIN(asin),
          status: 'error',
          errors: [error.message]
        };
        res.write(`data: ${JSON.stringify({ type: 'item', item, progress: ++completed, total: asins.length })}\n\n`);
      }
    });

    // Wait for all to complete
    await Promise.allSettled(processPromises);

    // Send completion event
    res.write(`data: ${JSON.stringify({ type: 'complete', total: completed })}\n\n`);
    res.write('data: [DONE]\n\n');

    console.log(`📡 [SSE Stream] Completed: ${completed}/${asins.length} ASINs`);
    res.end();

  } catch (error) {
    console.error('SSE Stream error:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

// Bulk preview from ASIN Directory (no scraping — reads stored data) with SSE streaming
router.get('/bulk-preview-from-directory-stream', requireAuthSSE, async (req, res) => {
  try {
    const { templateId, sellerId, asins: asinsParam } = req.query;

    if (!templateId || !sellerId || !asinsParam) {
      return res.status(400).json({ error: 'Template ID, Seller ID, and ASINs are required' });
    }

    const asins = asinsParam.split(',').map(a => a.trim()).filter(Boolean);

    if (asins.length === 0) {
      return res.status(400).json({ error: 'At least one ASIN is required' });
    }

    if (asins.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 ASINs allowed per batch' });
    }

    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    console.log(`📂 [Directory SSE] Starting for ${asins.length} ASINs...`);
    res.write(`data: ${JSON.stringify({ type: 'started', total: asins.length })}\n\n`);

    // Validate seller and template
    const [seller, template] = await Promise.all([
      Seller.findById(sellerId),
      getEffectiveTemplate(templateId, sellerId)
    ]);

    if (!seller || !template) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Seller or template not found' })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    const fieldConfigs = Array.isArray(template?.asinAutomation?.fieldConfigs)
      ? template.asinAutomation.fieldConfigs
      : [];

    // Get pricing config (seller override takes priority)
    let pricingConfig = template.pricingConfig;
    const sellerConfig = await SellerPricingConfig.findOne({ sellerId, templateId });
    if (sellerConfig) {
      pricingConfig = sellerConfig.pricingConfig;
    }

    // Check for existing ASINs and SKU conflicts
    const existingAsinListings = await TemplateListing.find({
      sellerId,
      _asinReference: { $in: asins },
      status: 'active'
    }).select('+_asinReference').lean();

    const asinInCurrentTemplate = new Map();
    const asinInOtherTemplates = new Map();

    existingAsinListings.forEach(listing => {
      if (listing.templateId.toString() === templateId.toString()) {
        asinInCurrentTemplate.set(listing._asinReference, listing);
      } else {
        asinInOtherTemplates.set(listing._asinReference, listing.templateId);
      }
    });

    const generatedSKUs = asins.map(asin => ({ asin, sku: generateSKUFromASIN(asin) }));
    const existingBySKU = await TemplateListing.find({
      templateId,
      sellerId,
      customLabel: { $in: generatedSKUs.map(item => item.sku) },
      status: { $in: ['active', 'draft'] }
    }).select('customLabel _asinReference _id').lean();

    const existingSKUMap = new Map(
      existingBySKU.map(listing => [listing.customLabel, { id: listing._id, asin: listing._asinReference }])
    );

    let completed = 0;

    const processPromises = asins.map(async (asin) => {
      try {
        // Existing in other template — blocked
        if (asinInOtherTemplates.has(asin)) {
          const item = {
            id: `preview-${asin}`, asin, sku: generateSKUFromASIN(asin),
            status: 'blocked', blockedReason: 'cross_template_duplicate',
            errors: ['ASIN exists in another template']
          };
          res.write(`data: ${JSON.stringify({ type: 'item', item, progress: ++completed, total: asins.length })}\n\n`);
          return;
        }

        // Duplicate in current template — updateable
        if (asinInCurrentTemplate.has(asin)) {
          const existingListing = asinInCurrentTemplate.get(asin);
          // Compute future SKU based on current listing count
          const asinCountDoc = await AsinDirectory.findOne({ asin }).select('listingCount').lean();
          const futureSKU = generateSKUWithCount(asin, asinCountDoc?.listingCount || 0);
          const item = {
            id: `preview-${asin}`, asin,
            sku: futureSKU,
            status: 'duplicate_updateable',
            generatedListing: {
              title: existingListing.title,
              description: existingListing.description,
              startPrice: existingListing.startPrice,
              quantity: existingListing.quantity,
              itemPhotoUrl: existingListing.itemPhotoUrl || '',
              conditionId: existingListing.conditionId || '',
              format: existingListing.format || '',
              duration: existingListing.duration || '',
              location: existingListing.location || '',
              customLabel: futureSKU,
              customFields: existingListing.customFields || {},
              _asinReference: asin,
              _existingListingId: existingListing._id
            },
            warnings: [
              'This ASIN already exists in this template.',
              existingListing.duplicateCount > 0
                ? `Previously updated ${existingListing.duplicateCount} time(s).`
                : 'First time editing this ASIN.'
            ],
            errors: []
          };
          res.write(`data: ${JSON.stringify({ type: 'item', item, progress: ++completed, total: asins.length })}\n\n`);
          return;
        }

        // SKU conflict
        const sku = generateSKUFromASIN(asin);
        if (existingSKUMap.has(sku)) {
          const item = {
            id: `preview-${asin}`, asin, sku,
            status: 'blocked', blockedReason: 'sku_conflict',
            errors: [`SKU ${sku} already exists`]
          };
          res.write(`data: ${JSON.stringify({ type: 'item', item, progress: ++completed, total: asins.length })}\n\n`);
          return;
        }

        // Look up ASIN in the directory
        const doc = await AsinDirectory.findOne({ asin }).lean();

        // Build amazonData from stored document (no scraping).
        // Shape must match fetchAmazonData() output so applyFieldConfigs works identically,
        // including the `asin` property used in AI prompt placeholders ({{asin}}).
        const amazonData = doc ? {
          asin,
          title: doc.title || '',
          brand: doc.brand || '',
          price: doc.price || '',
          description: doc.description || '',
          images: doc.images || [],
          color: doc.color || '',
          compatibility: doc.compatibility || '',
          model: doc.model || '',
          material: doc.material || '',
          specialFeatures: doc.specialFeatures || '',
          size: doc.size || '',
          includedComponents: doc.includedComponents || ''
        } : {
          asin,
          title: '', brand: '', price: '', description: '',
          images: [], color: '', compatibility: '',
          model: '', material: '', specialFeatures: '', size: '',
          includedComponents: ''
        };

        const { coreFields, customFields, pricingCalculation } =
          await applyFieldConfigs(amazonData, fieldConfigs, pricingConfig);

        const mergedCoreFields = mergeTemplateCoreFields(template.coreFieldDefaults, coreFields, amazonData);

        if (template?.customColumns && template.customColumns.length > 0) {
          template.customColumns.forEach(col => {
            if (col.defaultValue && !customFields[col.name]) {
              customFields[col.name] = col.defaultValue;
            }
          });
        }

        const warnings = [];
        const validationErrors = [];

        // Warn if ASIN was never scraped or not found in directory
        if (!doc) {
          warnings.push('ASIN not found in directory — fields may be empty');
        } else if (!doc.scraped) {
          warnings.push('ASIN has not been scraped yet — some fields may be missing');
        }

        if (!mergedCoreFields.title) validationErrors.push('Missing required field: title');
        if (mergedCoreFields.startPrice === undefined || mergedCoreFields.startPrice === null || mergedCoreFields.startPrice === '') {
          validationErrors.push('Missing required field: startPrice');
        }
        if (!mergedCoreFields.description) warnings.push('Missing description');

        // Compute count-based SKU using the already-fetched directory doc
        const finalSKU = generateSKUWithCount(asin, doc?.listingCount || 0);

        const item = {
          id: `preview-${asin}`,
          asin,
          sku: finalSKU,
          sourceData: {
            title: amazonData.title,
            brand: amazonData.brand,
            price: amazonData.price,
            description: amazonData.description,
            images: amazonData.images,
            color: amazonData.color,
            compatibility: amazonData.compatibility,
            model: amazonData.model,
            material: amazonData.material,
            specialFeatures: amazonData.specialFeatures,
            size: amazonData.size,
            formFactor: amazonData.formFactor,
            screenSize: amazonData.screenSize,
            bandMaterial: amazonData.bandMaterial,
            bandWidth: amazonData.bandWidth,
            bandColor: amazonData.bandColor,
            includedComponents: amazonData.includedComponents
          },
          generatedListing: {
            ...mergedCoreFields,
            customLabel: finalSKU,
            customFields,
            _asinReference: asin
          },
          pricingCalculation,
          warnings,
          errors: validationErrors,
          status: validationErrors.length > 0 ? 'error' : (warnings.length > 0 ? 'warning' : 'success')
        };

        res.write(`data: ${JSON.stringify({ type: 'item', item, progress: ++completed, total: asins.length })}\n\n`);

      } catch (error) {
        console.error(`❌ Error processing ASIN ${asin} from directory:`, error);
        const item = {
          id: `preview-${asin}`, asin, sku: generateSKUFromASIN(asin),
          status: 'error', errors: [error.message]
        };
        res.write(`data: ${JSON.stringify({ type: 'item', item, progress: ++completed, total: asins.length })}\n\n`);
      }
    });

    await Promise.allSettled(processPromises);

    res.write(`data: ${JSON.stringify({ type: 'complete', total: completed })}\n\n`);
    res.write('data: [DONE]\n\n');
    console.log(`📂 [Directory SSE] Completed: ${completed}/${asins.length} ASINs`);
    res.end();

  } catch (error) {
    console.error('Directory SSE Stream error:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

// Get single listing by ID
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const listing = await TemplateListing.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('templateId');
    
    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }
    
    res.json(listing);
  } catch (error) {
    console.error('Error fetching listing:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create new listing
router.post('/', requireAuth, async (req, res) => {
  try {
    const listingData = req.body;
    
    if (!listingData.templateId) {
      return res.status(400).json({ error: 'Template ID is required' });
    }
    
    if (!listingData.sellerId) {
      return res.status(400).json({ error: 'Seller ID is required' });
    }
    
    // Validate seller exists
    const seller = await Seller.findById(listingData.sellerId);
    if (!seller) {
      return res.status(404).json({ error: 'Seller not found' });
    }
    
    if (!listingData.customLabel) {
      return res.status(400).json({ error: 'SKU (Custom label) is required' });
    }
    
    if (!listingData.title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    if (!listingData.startPrice && listingData.startPrice !== 0) {
      return res.status(400).json({ error: 'Start price is required' });
    }
    
    // Convert customFields object to Map
    if (listingData.customFields && typeof listingData.customFields === 'object') {
      listingData.customFields = new Map(Object.entries(listingData.customFields));
    }
    
    // Check if SKU exists as active (block duplicate)
    const activeExists = await TemplateListing.findOne({
      templateId: listingData.templateId,
      sellerId: listingData.sellerId,
      customLabel: listingData.customLabel,
      status: 'active'
    });
    
    if (activeExists) {
      return res.status(409).json({ 
        error: 'An active listing with this SKU already exists' 
      });
    }
    
    // Check if SKU exists as inactive (reactivate instead of creating new)
    const inactiveExists = await TemplateListing.findOne({
      templateId: listingData.templateId,
      sellerId: listingData.sellerId,
      customLabel: listingData.customLabel,
      status: 'inactive'
    });
    
    let listing;
    let wasReactivated = false;
    
    if (inactiveExists) {
      // Reactivate existing inactive listing and update with new data
      Object.assign(inactiveExists, {
        ...listingData,
        customFields: listingData.customFields,
        status: 'active',
        updatedAt: Date.now()
      });
      
      await inactiveExists.save();
      listing = inactiveExists;
      wasReactivated = true;
      
      console.log(`✅ Reactivated inactive listing: ${listingData.customLabel}`);
    } else {
      // Create new listing
      listing = new TemplateListing({
        ...listingData,
        status: 'active',
        createdBy: req.user.userId
      });
      
      await listing.save();
    }
    
    await listing.populate([
      { path: 'createdBy', select: 'name email' },
      { 
        path: 'sellerId',
        populate: {
          path: 'user',
          select: 'username email'
        }
      }
    ]);
    
    res.status(201).json({
      listing,
      wasReactivated
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'A listing with this SKU already exists in this template' });
    }
    console.error('Error creating listing:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// BULK APPLY SCHEDULE TIMES
// POST /template-listings/bulk-apply-schedule
// Body: { templateId, sellerId, startDateTime (YYYY-MM-DD HH:MM:SS), stepMinutes }
// Assigns sequential scheduleTime values to all listings for the template+seller,
// ordered by createdAt ASC, spaced by stepMinutes.
// ============================================
router.post('/bulk-apply-schedule', requireAuth, async (req, res) => {
  try {
    const { templateId, sellerId, startDateTime, stepMinutes, batchFilter, batchId, fromRow, toRow } = req.body;

    if (!templateId || !sellerId || !startDateTime || stepMinutes == null) {
      return res.status(400).json({ error: 'templateId, sellerId, startDateTime, and stepMinutes are required' });
    }

    const step = parseInt(stepMinutes, 10);
    if (isNaN(step) || step < 1) {
      return res.status(400).json({ error: 'stepMinutes must be a positive integer' });
    }

    // Parse "YYYY-MM-DD HH:MM:SS" — pure string arithmetic, no Date objects.
    // This ensures the stored value exactly matches what the user entered (IST wall-clock).
    const dtMatch = startDateTime.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
    if (!dtMatch) {
      return res.status(400).json({ error: 'Invalid startDateTime format. Expected YYYY-MM-DD HH:MM:SS' });
    }
    const baseYear = parseInt(dtMatch[1]);
    const baseMonth = parseInt(dtMatch[2]);
    const baseDay = parseInt(dtMatch[3]);
    const baseHour = parseInt(dtMatch[4]);
    const baseMinute = parseInt(dtMatch[5]);
    const baseSec = parseInt(dtMatch[6]);

    // Fetch listings matching the same filter the user is currently viewing
    const listingFilter = { templateId, sellerId };
    if (batchId) {
      listingFilter.downloadBatchId = batchId;
    } else if (!batchFilter || batchFilter === 'active') {
      listingFilter.$or = [{ downloadBatchId: null }, { pendingRedownload: true }];
    }
    // batchFilter === 'all' → no additional filter

    // Fetch all listings for this template + seller, sorted by creation order
    const listings = await TemplateListing.find(listingFilter)
      .sort({ createdAt: 1 })
      .select('_id')
      .lean();

    if (listings.length === 0) {
      return res.json({ updated: 0, firstTime: null, lastTime: null });
    }

    // Optional row range (1-based, inclusive). Defaults to the full list.
    const from = fromRow && parseInt(fromRow) >= 1 ? parseInt(fromRow) - 1 : 0;
    const to   = toRow   && parseInt(toRow)   >= 1 ? parseInt(toRow)       : listings.length;
    const targetListings = listings.slice(from, to);

    if (targetListings.length === 0) {
      return res.json({ updated: 0, firstTime: null, lastTime: null });
    }

    // Pure arithmetic: add totalMinutes to the base time and return "YYYY-MM-DD HH:MM:SS"
    const pad = n => String(n).padStart(2, '0');
    const daysInMonth = (y, m) => new Date(y, m, 0).getDate(); // m is 1-based

    function addMinutesAndFormat(addMin) {
      let totalMin = baseHour * 60 + baseMinute + addMin;
      let extraDays = Math.floor(totalMin / 1440); // 1440 = 24*60
      totalMin = totalMin % 1440;
      if (totalMin < 0) { totalMin += 1440; extraDays--; }

      const hh = Math.floor(totalMin / 60);
      const mm = totalMin % 60;

      // Add extra days to date
      let y = baseYear, m = baseMonth, d = baseDay + extraDays;
      while (d > daysInMonth(y, m)) {
        d -= daysInMonth(y, m);
        m++;
        if (m > 12) { m = 1; y++; }
      }
      while (d < 1) {
        m--;
        if (m < 1) { m = 12; y--; }
        d += daysInMonth(y, m);
      }

      return `${y}-${pad(m)}-${pad(d)} ${pad(hh)}:${pad(mm)}:${pad(baseSec)}`;
    }

    const bulkOps = targetListings.map((listing, i) => ({
      updateOne: {
        filter: { _id: listing._id },
        update: { $set: { scheduleTime: addMinutesAndFormat(i * step) } }
      }
    }));

    await TemplateListing.bulkWrite(bulkOps);

    res.json({
      updated: targetListings.length,
      firstTime: addMinutesAndFormat(0),
      lastTime: addMinutesAndFormat((targetListings.length - 1) * step)
    });
  } catch (error) {
    console.error('[Bulk Apply Schedule] Error:', error.message);
    res.status(500).json({ error: error.message || 'Failed to apply schedule times' });
  }
});

// ============================================
// CLEAR SCHEDULE TIMES
// POST /template-listings/clear-schedule
// Clears scheduleTime for all active-batch listings
// ============================================
router.post('/clear-schedule', requireAuth, async (req, res) => {
  try {
    const { templateId, sellerId, batchFilter, batchId } = req.body;

    if (!templateId || !sellerId) {
      return res.status(400).json({ error: 'templateId and sellerId are required' });
    }

    const filter = { templateId, sellerId };
    if (batchId) {
      filter.downloadBatchId = batchId;
    } else if (!batchFilter || batchFilter === 'active') {
      filter.$or = [{ downloadBatchId: null }, { pendingRedownload: true }];
    }

    const result = await TemplateListing.updateMany(filter, { $set: { scheduleTime: '' } });

    res.json({ cleared: result.modifiedCount });
  } catch (error) {
    console.error('[Clear Schedule] Error:', error.message);
    res.status(500).json({ error: error.message || 'Failed to clear schedule times' });
  }
});

// Bulk update listings
router.put('/bulk-update', requireAuth, async (req, res) => {
  try {
    const { listings } = req.body;

    if (!listings || !Array.isArray(listings) || listings.length === 0) {
      return res.status(400).json({ error: 'Listings array is required' });
    }

    const EDITABLE_FIELDS = [
      'action', 'customLabel', 'title', 'startPrice',
      'categoryId', 'categoryName', 'relationship', 'relationshipDetails',
      'scheduleTime', 'customFields', 'description', 'condition',
      'conditionDescription', 'quantity', 'format', 'duration',
    ];

    let updated = 0;
    for (const listing of listings) {
      const id = listing._existingListingId || listing._id;
      if (!id) continue;

      const patch = {};
      for (const field of EDITABLE_FIELDS) {
        if (listing[field] !== undefined) patch[field] = listing[field];
      }

      if (Object.keys(patch).length > 0) {
        await TemplateListing.findByIdAndUpdate(id, { $set: patch });
        updated++;
      }
    }

    res.json({ updated });
  } catch (error) {
    console.error('Bulk update error:', error);
    res.status(500).json({ error: error.message || 'Failed to bulk update listings' });
  }
});

// Update listing
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const listingData = req.body;
    
    // Convert customFields object to Map
    if (listingData.customFields && typeof listingData.customFields === 'object') {
      listingData.customFields = new Map(Object.entries(listingData.customFields));
    }
    
    listingData.updatedAt = Date.now();
    
    const listing = await TemplateListing.findByIdAndUpdate(
      req.params.id,
      listingData,
      { new: true, runValidators: true }
    )
      .populate('createdBy', 'name email')
      .populate('templateId');
    
    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }
    
    res.json(listing);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'A listing with this SKU already exists in this template' });
    }
    console.error('Error updating listing:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete listing
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const listing = await TemplateListing.findByIdAndDelete(req.params.id);
    
    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }
    
    res.json({ message: 'Listing deleted successfully' });
  } catch (error) {
    console.error('Error deleting listing:', error);
    res.status(500).json({ error: error.message });
  }
});

// ASIN Autofill endpoint
router.post('/autofill-from-asin', requireAuth, async (req, res) => {
  try {
    const { asin, templateId, sellerId, region = 'US' } = req.body;
    
    if (!asin || !templateId) {
      return res.status(400).json({ 
        error: 'ASIN and Template ID are required' 
      });
    }
    
    // 1. Fetch effective template with automation config (includes seller overrides)
    const template = await getEffectiveTemplate(templateId, sellerId);
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const fieldConfigs = Array.isArray(template?.asinAutomation?.fieldConfigs)
      ? template.asinAutomation.fieldConfigs
      : [];
    
    // 1.5. Get seller-specific pricing config if sellerId is provided
    let pricingConfig = template.pricingConfig;
    if (sellerId) {
      const sellerConfig = await SellerPricingConfig.findOne({
        sellerId,
        templateId
      });
      if (sellerConfig) {
        pricingConfig = sellerConfig.pricingConfig;
      }
    }
    
    // 2. Fetch fresh Amazon data
    console.log(`Fetching Amazon data for ASIN: ${asin} (${region})`);
    const amazonData = await fetchAmazonData(asin, region);
    
    // 3. Apply field configurations (AI + direct mappings)
    console.log(`Processing ${fieldConfigs.length} field configs`);
    const { coreFields, customFields, pricingCalculation } = await applyFieldConfigs(
      amazonData,
      fieldConfigs,
      pricingConfig  // Use seller-specific or template default pricing config
    );
    const mergedCoreFields = mergeTemplateCoreFields(template.coreFieldDefaults, coreFields, amazonData);
    
    // 4. Return auto-filled data (separated by type)
    res.json({
      success: true,
      asin,
      autoFilledData: {
        coreFields: mergedCoreFields,
        customFields
      },
      amazonSource: {
        title: amazonData.title,
        brand: amazonData.brand,
        price: amazonData.price,
        imageCount: getImageCount(amazonData.images)
      },
      pricingCalculation: pricingCalculation || null
    });
    
  } catch (error) {
    console.error('ASIN autofill error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to fetch and process ASIN data' 
    });
  }
});

// Bulk auto-fill from multiple ASINs
router.post('/bulk-autofill-from-asins', requireAuth, async (req, res) => {
  try {
    const { asins, templateId, sellerId, region = 'US' } = req.body;
    
    if (!asins || !Array.isArray(asins) || asins.length === 0) {
      return res.status(400).json({ 
        error: 'ASINs array is required and must not be empty' 
      });
    }
    
    if (!templateId) {
      return res.status(400).json({ error: 'Template ID is required' });
    }
    
    if (!sellerId) {
      return res.status(400).json({ error: 'Seller ID is required' });
    }
    
    // Validate batch size
    if (asins.length > 100) {
      return res.status(400).json({ 
        error: 'Maximum 100 ASINs allowed per batch' 
      });
    }
    
    // Fetch effective template with automation config (includes seller overrides)
    const template = await getEffectiveTemplate(templateId, sellerId);
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const fieldConfigs = Array.isArray(template?.asinAutomation?.fieldConfigs)
      ? template.asinAutomation.fieldConfigs
      : [];
    
    // Get seller-specific pricing config if available
    let pricingConfig = template.pricingConfig;
    const sellerConfig = await SellerPricingConfig.findOne({
      sellerId,
      templateId
    });
    if (sellerConfig) {
      pricingConfig = sellerConfig.pricingConfig;
    }
    
    // Clean and deduplicate ASINs
    const cleanedAsins = [...new Set(
      asins.map(asin => asin.trim().toUpperCase()).filter(asin => asin.length > 0)
    )];
    
    console.log(`\n========== BULK AUTOFILL: ${cleanedAsins.length} ASINs ==========`);
    console.log(`Template: ${template.name || templateId}`);
    console.log(`Seller: ${sellerId}`);
    console.log(`AI Fields: ${fieldConfigs.filter(c => c.source === 'ai' && c.enabled).length}`);
    
    // Check for existing ACTIVE listings with these ASINs across ALL templates for this seller
    const existingListings = await TemplateListing.find({
      sellerId,  // Check across all templates for this seller
      _asinReference: { $in: cleanedAsins },
      status: 'active'
    }).select('+_asinReference').lean();
    
    // Create maps for both current template and cross-template duplicates
    const existingInCurrentTemplate = new Map(); // Changed to Map to store full listing data
    const existingInOtherTemplates = new Map();
    
    existingListings.forEach(listing => {
      if (listing.templateId.toString() === templateId.toString()) {
        existingInCurrentTemplate.set(listing._asinReference, listing); // Store full listing
      } else {
        existingInOtherTemplates.set(listing._asinReference, listing.templateId);
      }
    });
    
    console.log(`Found ${existingInCurrentTemplate.size} ASINs in current template (will update)`);
    console.log(`Found ${existingInOtherTemplates.size} ASINs in other templates (will block)\n`);
    
    // Pre-generate all SKUs and check for collisions with existing SKUs
    const generatedSKUs = cleanedAsins.map(asin => ({
      asin,
      sku: generateSKUFromASIN(asin)
    }));
    
    // Check if any generated SKUs already exist (from both ASIN imports and SKU imports)
    const existingBySKU = await TemplateListing.find({
      templateId,
      sellerId,
      customLabel: { $in: generatedSKUs.map(item => item.sku) },
      status: { $in: ['active', 'draft'] }
    }).select('customLabel _asinReference _id');
    
    const existingSKUMap = new Map(
      existingBySKU.map(listing => [listing.customLabel, {
        id: listing._id,
        asin: listing._asinReference
      }])
    );
    
    console.log(`Found ${existingSKUMap.size} SKU conflicts (will block)\n`);
    
    const startTime = Date.now();
    const results = [];
    
    // Process ASINs in batches of 20 (parallel within batch, parallel between batches)
    const batchSize = parseInt(process.env.BACKEND_BATCH_SIZE) || 20;
    const batches = [];
    for (let i = 0; i < cleanedAsins.length; i += batchSize) {
      batches.push(cleanedAsins.slice(i, i + batchSize));
    }
    
    console.log(`🚀 Processing ${batches.length} batches in parallel (${batchSize} ASINs per batch)...`);
    
    // Process all batches in parallel
    const batchPromises = batches.map(async (batch, batchIndex) => {
      const batchNum = batchIndex + 1;
      console.log(`  ⏳ Batch ${batchNum}/${batches.length}: Starting ${batch.length} ASINs...`);
      
      const batchPromises = batch.map(async (asin) => {
        // Check if ASIN exists in OTHER templates for this seller (block)
        if (existingInOtherTemplates.has(asin)) {
          return {
            asin,
            status: 'blocked',
            existingTemplateId: existingInOtherTemplates.get(asin).toString(),
            error: 'ASIN already exists for this seller in another template. Each ASIN can only be used once per seller.'
          };
        }
        
        // Check if ASIN already exists in CURRENT template (duplicate_updateable)
        if (existingInCurrentTemplate.has(asin)) {
          const existingListing = existingInCurrentTemplate.get(asin);
          const generatedSKU = generateSKUFromASIN(asin);
          
          // Get existing customFields (already an object from .lean())
          const existingCustomFields = existingListing.customFields || {};
          
          // Return existing listing data for editing (no re-fetch)
          return {
            asin,
            status: 'duplicate_updateable',
            
            // Return existing data for editing
            autoFilledData: {
              coreFields: {
                title: existingListing.title,
                description: existingListing.description,
                startPrice: existingListing.startPrice,
                quantity: existingListing.quantity,
                itemPhotoUrl: existingListing.itemPhotoUrl || '',
                conditionId: existingListing.conditionId || '',
                format: existingListing.format || '',
                duration: existingListing.duration || '',
                location: existingListing.location || ''
              },
              customFields: existingCustomFields
            },
            sku: existingListing.customLabel || generatedSKU,
            _existingListingId: existingListing._id, // Track which listing to update
            warnings: [
              `This ASIN already exists in this template.`,
              existingListing.duplicateCount > 0 
                ? `Previously updated ${existingListing.duplicateCount} time(s).`
                : `First time editing this ASIN.`
            ]
          };
        }
        
        // Check if generated SKU already exists (from ASIN imports or SKU imports)
        const generatedSKU = generateSKUFromASIN(asin);
        const existingSKU = existingSKUMap.get(generatedSKU);
        if (existingSKU) {
          return {
            asin,
            sku: generatedSKU,
            status: 'blocked',
            blockedReason: 'sku_conflict',
            existingListingId: existingSKU.id.toString(),
            error: existingSKU.asin 
              ? `SKU ${generatedSKU} already exists for ASIN ${existingSKU.asin} in this template`
              : `SKU ${generatedSKU} already exists in this template (imported via SKU import)`
          };
        }
        
        try {
          // Fetch Amazon data
          const amazonData = await fetchAmazonData(asin, region);
          
          // Apply field configurations
          const { coreFields, customFields, pricingCalculation } = await applyFieldConfigs(
            amazonData,
            fieldConfigs,
            pricingConfig  // Use seller-specific or template default pricing config
          );
          const mergedCoreFields = mergeTemplateCoreFields(template.coreFieldDefaults, coreFields, amazonData);
          
          return {
            asin,
            status: 'success',
            autoFilledData: {
              coreFields: mergedCoreFields,
              customFields
            },
            amazonSource: {
              title: amazonData.title,
              brand: amazonData.brand,
              price: amazonData.price,
              imageCount: getImageCount(amazonData.images)
            },
            pricingCalculation: pricingCalculation || null
          };
        } catch (error) {
          console.error(`\n❌ ERROR processing ASIN ${asin}:`);
          console.error(`   Message: ${error.message}`);
          console.error(`   Stack: ${error.stack?.split('\n').slice(0, 3).join('\n   ')}`);
          return {
            asin,
            status: 'error',
            error: error.message || 'Failed to fetch or process ASIN data'
          };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      console.log(`  ✅ Batch ${batchNum}/${batches.length}: Completed`);
      return batchResults;
    });
    
    // Wait for all batches to complete (use allSettled for resilience)
    const allBatchResults = await Promise.allSettled(batchPromises);
    
    // Flatten and collect all results
    allBatchResults.forEach((batchResult, batchIndex) => {
      if (batchResult.status === 'fulfilled') {
        results.push(...batchResult.value);
      } else {
        // Entire batch failed (rare) - mark all ASINs in batch as failed
        const batch = batches[batchIndex];
        console.error(`❌ Batch ${batchIndex + 1} completely failed:`, batchResult.reason);
        batch.forEach(asin => {
          results.push({
            asin,
            status: 'error',
            error: `Batch processing failed: ${batchResult.reason?.message || 'Unknown error'}`
          });
        });
      }
    });
    
    const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);
    const successful = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'error').length;
    const duplicates = results.filter(r => r.status === 'duplicate').length;
    const blocked = results.filter(r => r.status === 'blocked').length;
    
    console.log(`\n========== BULK AUTOFILL COMPLETE ==========`);
    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⏭️  Duplicates: ${duplicates}`);
    console.log(`🚫 Blocked: ${blocked}`);
    console.log(`⏱️  Total Time: ${processingTime}s`);
    console.log(`⚡ Avg per ASIN: ${(parseFloat(processingTime) / cleanedAsins.length).toFixed(2)}s`);
    console.log(`==========================================\n`);
    
    res.json({
      success: true,
      total: cleanedAsins.length,
      successful,
      failed,
      duplicates,
      blocked,
      results,
      processingTime: `${processingTime}s`
    });
    
  } catch (error) {
    console.error('Bulk ASIN autofill error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to process bulk ASIN autofill' 
    });
  }
});

// Bulk update existing listings (used by Proof Read → List Directly flow)
// Bulk delete listings
router.post('/bulk-delete', requireAuth, async (req, res) => {
  try {
    const { listingIds } = req.body;
    
    if (!listingIds || !Array.isArray(listingIds) || listingIds.length === 0) {
      return res.status(400).json({ error: 'Listing IDs array is required' });
    }
    
    const result = await TemplateListing.deleteMany({
      _id: { $in: listingIds }
    });
    
    res.json({ 
      message: 'Listings deleted successfully',
      deletedCount: result.deletedCount 
    });
  } catch (error) {
    console.error('Error bulk deleting listings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk create listings from auto-fill results
router.post('/bulk-create', requireAuth, async (req, res) => {
  try {
    const { templateId, sellerId, listings, options = {} } = req.body;
    
    if (!templateId) {
      return res.status(400).json({ error: 'Template ID is required' });
    }
    
    if (!sellerId) {
      return res.status(400).json({ error: 'Seller ID is required' });
    }
    
    // Validate seller exists
    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return res.status(404).json({ error: 'Seller not found' });
    }
    
    if (!listings || !Array.isArray(listings) || listings.length === 0) {
      return res.status(400).json({ error: 'Listings array is required' });
    }
    
    // Validate batch size
    if (listings.length > 50) {
      return res.status(400).json({ 
        error: 'Maximum 50 listings allowed per batch' 
      });
    }
    
    const {
      autoGenerateSKU = true,
      skipDuplicates = true
    } = options;
    
    // Fetch effective template to get next SKU counter (includes seller overrides)
    const template = await getEffectiveTemplate(templateId, sellerId);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const results = [];
    const errors = [];
    let skippedCount = 0;
    
    // Get existing ACTIVE SKUs to avoid duplicates
    const existingActiveSKUs = await TemplateListing.find({ 
      templateId,
      sellerId,
      status: 'active'
    }).distinct('customLabel');
    
    // Get existing INACTIVE listings for potential reactivation
    const inactiveListings = await TemplateListing.find({
      templateId,
      sellerId,
      status: 'inactive'
    }).select('+_asinReference');
    
    const inactiveMap = new Map(
      inactiveListings.map(l => [l.customLabel, l])
    );
    
    const skuSet = new Set(existingActiveSKUs);
    let skuCounter = Date.now();
    
    console.log(`📊 Pre-check: ${existingActiveSKUs.length} active SKUs, ${inactiveListings.length} inactive listings`);
    console.log(`📋 Inactive SKUs: ${Array.from(inactiveMap.keys()).join(', ')}`);
    
    // Pre-check for SKU conflicts with existing listings (including drafts from SKU imports)
    const potentialSKUs = listings
      .map(l => l.customLabel || (l._asinReference ? generateSKUFromASIN(l._asinReference) : null))
      .filter(sku => sku);
    
    const existingBySKU = await TemplateListing.find({
      templateId,
      sellerId,
      customLabel: { $in: potentialSKUs },
      status: { $in: ['active', 'draft'] }
    }).select('customLabel _asinReference _id').lean();
    
    const existingSKUMap = new Map(
      existingBySKU.map(listing => [listing.customLabel, {
        id: listing._id,
        asin: listing._asinReference
      }])
    );
    
    console.log(`🔍 SKU pre-check: ${existingSKUMap.size} SKU conflicts detected`);
    
    // Process each listing
    for (const listingData of listings) {
      try {
        // Validate required fields
        if (!listingData.title) {
          errors.push({
            asin: listingData._asinReference,
            error: 'Title is required',
            details: 'Missing required field: title'
          });
          results.push({
            status: 'failed',
            asin: listingData._asinReference,
            error: 'Title is required'
          });
          continue;
        }
        
        if (listingData.startPrice === undefined || listingData.startPrice === null) {
          errors.push({
            asin: listingData._asinReference,
            error: 'Start price is required',
            details: 'Missing required field: startPrice'
          });
          results.push({
            status: 'failed',
            asin: listingData._asinReference,
            error: 'Start price is required'
          });
          continue;
        }
        
        // Generate SKU if not provided
        let sku = listingData.customLabel;
        if (!sku && autoGenerateSKU) {
          // Generate SKU using GRW25 + last 5 chars of ASIN
          if (listingData._asinReference) {
            sku = generateSKUFromASIN(listingData._asinReference);
          } else {
            sku = `SKU-${skuCounter++}`;
          }
          
          // Check if generated SKU conflicts with existing (from ASIN or SKU imports)
          const existingSKU = existingSKUMap.get(sku);
          if (existingSKU) {
            errors.push({
              asin: listingData._asinReference,
              sku,
              error: existingSKU.asin 
                ? `Generated SKU ${sku} already exists for ASIN ${existingSKU.asin}`
                : `Generated SKU ${sku} already exists (imported via SKU import)`,
              details: 'SKU conflict detected'
            });
            results.push({
              status: 'blocked',
              asin: listingData._asinReference,
              sku,
              blockedReason: 'sku_conflict',
              error: existingSKU.asin 
                ? `SKU already exists for ASIN ${existingSKU.asin}`
                : `SKU already exists (imported via SKU import)`
            });
            console.log(`🚫 Blocked SKU conflict: ${sku}`);
            continue;
          }
          
          // Ensure uniqueness within current batch
          while (skuSet.has(sku)) {
            // If collision within batch, append timestamp suffix
            sku = `${generateSKUFromASIN(listingData._asinReference)}-${skuCounter++}`;
          }
        }
        
        if (!sku) {
          errors.push({
            asin: listingData._asinReference,
            error: 'SKU (Custom label) is required',
            details: 'No SKU provided and auto-generation disabled'
          });
          results.push({
            status: 'failed',
            asin: listingData._asinReference,
            error: 'SKU is required'
          });
          continue;
        }
        
        console.log(`🔍 Processing SKU: ${sku}, inInactiveMap: ${inactiveMap.has(sku)}, inActiveSet: ${skuSet.has(sku)}`);
        
        // Check if SKU exists as inactive - reactivate instead of create
        const inactiveListing = inactiveMap.get(sku);
        
        if (inactiveListing) {
          // Found an inactive listing with this SKU - reactivate it
          // Convert customFields object to Map
          const customFieldsMap = listingData.customFields && typeof listingData.customFields === 'object'
            ? new Map(Object.entries(listingData.customFields))
            : new Map();
          
          // Update existing inactive listing
          Object.assign(inactiveListing, {
            ...listingData,
            customLabel: sku,
            customFields: customFieldsMap,
            templateId,
            sellerId,
            status: 'active',
            updatedAt: Date.now()
          });
          
          await inactiveListing.save();
          skuSet.add(sku);
          
          results.push({
            status: 'reactivated',
            listing: inactiveListing.toObject(),
            asin: listingData._asinReference,
            sku
          });
          
          console.log(`✅ Reactivated: ${sku}`);
          continue;
        }
        
        // Check for duplicate SKU in active listings (within this batch or existing)
        if (skuSet.has(sku)) {
          if (skipDuplicates) {
            skippedCount++;
            results.push({
              status: 'skipped',
              asin: listingData._asinReference,
              sku,
              error: 'Duplicate SKU (active listing exists)'
            });
            console.log(`⏭️ Skipped duplicate: ${sku}`);
            continue;
          } else {
            // Make SKU unique by appending suffix
            const baseSKU = sku;
            let suffix = 1;
            
            do {
              sku = `${baseSKU}-${suffix++}`;
            } while (skuSet.has(sku) || inactiveMap.has(sku));
            
            console.log(`SKU collision detected: ${baseSKU} → ${sku}`);
          }
        }
        
        // Convert customFields object to Map
        const customFieldsMap = listingData.customFields && typeof listingData.customFields === 'object'
          ? new Map(Object.entries(listingData.customFields))
          : new Map();
        
        // Create new listing
        const listing = new TemplateListing({
          ...listingData,
          customLabel: sku,
          customFields: customFieldsMap,
          templateId,
          sellerId,
          status: 'active',
          createdBy: req.user.userId
        });
        
        await listing.save();
        skuSet.add(sku);
        
        results.push({
          status: 'created',
          listing: listing.toObject(),
          asin: listingData._asinReference,
          sku
        });
        
      } catch (error) {
        console.error('Error creating listing:', error);
        
        if (error.code === 11000) {
          // Duplicate key error
          skippedCount++;
          results.push({
            status: 'skipped',
            asin: listingData._asinReference,
            error: 'Duplicate SKU'
          });
        } else {
          errors.push({
            asin: listingData._asinReference,
            error: error.message,
            details: error.toString()
          });
          results.push({
            status: 'failed',
            asin: listingData._asinReference,
            error: error.message
          });
        }
      }
    }
    
    const created = results.filter(r => r.status === 'created').length;
    const reactivated = results.filter(r => r.status === 'reactivated').length;
    const failed = results.filter(r => r.status === 'failed').length;
    
    console.log(`Bulk create completed: ${created} created, ${reactivated} reactivated, ${failed} failed, ${skippedCount} skipped`);
    
    res.json({
      success: true,
      total: listings.length,
      created,
      reactivated,
      failed,
      skipped: skippedCount,
      results,
      errors
    });
    
  } catch (error) {
    console.error('Bulk create error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to bulk create listings' 
    });
  }
});

// Bulk preview: Process ASINs and return preview data (no save to database)
router.post('/bulk-preview', requireAuth, async (req, res) => {
  try {
    const { templateId, sellerId, asins, region = 'US' } = req.body;
    
    if (!templateId) {
      return res.status(400).json({ error: 'Template ID is required' });
    }
    
    if (!sellerId) {
      return res.status(400).json({ error: 'Seller ID is required' });
    }
    
    if (!asins || !Array.isArray(asins) || asins.length === 0) {
      return res.status(400).json({ error: 'ASINs array is required' });
    }
    
    // Validate batch size
    if (asins.length > 100) {
      return res.status(400).json({ 
        error: 'Maximum 100 ASINs allowed per batch' 
      });
    }
    
    // Validate seller exists
    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return res.status(404).json({ error: 'Seller not found' });
    }
    
    // Fetch effective template (includes seller overrides)
    const template = await getEffectiveTemplate(templateId, sellerId);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const fieldConfigs = Array.isArray(template?.asinAutomation?.fieldConfigs)
      ? template.asinAutomation.fieldConfigs
      : [];
    
    // Get seller-specific pricing config if available
    let pricingConfig = template.pricingConfig;
    if (sellerId) {
      const sellerConfig = await SellerPricingConfig.findOne({
        sellerId,
        templateId
      });
      if (sellerConfig) {
        pricingConfig = sellerConfig.pricingConfig;
      }
    }
    
    console.log(`💰 Pricing config enabled: ${pricingConfig?.enabled}, multiplier: ${pricingConfig?.multiplier}`);
    if (pricingConfig?.enabled) {
      console.log(`   Desired profit: ${pricingConfig.desiredProfit} INR`);
      console.log(`   Profit tiers: ${pricingConfig.profitTiers?.length || 0} configured`);
      if (pricingConfig.profitTiers?.length > 0) {
        pricingConfig.profitTiers.forEach((tier, idx) => {
          console.log(`     Tier ${idx + 1}: $${tier.minCost}-$${tier.maxCost} → +${tier.profit} INR`);
        });
      }
    }
    console.log(`📋 Field configs: ${fieldConfigs.length} total`);
    
    // Log field config breakdown
    const coreConfigs = fieldConfigs.filter(c => c.fieldType === 'core');
    const customConfigs = fieldConfigs.filter(c => c.fieldType === 'custom');
    const aiConfigs = fieldConfigs.filter(c => c.source === 'ai');
    const directConfigs = fieldConfigs.filter(c => c.source === 'direct');
    
    console.log(`   Core: ${coreConfigs.length}, Custom: ${customConfigs.length}`);
    console.log(`   AI: ${aiConfigs.length}, Direct: ${directConfigs.length}`);
    console.log(`   Custom field names: ${customConfigs.map(c => c.ebayField).join(', ')}`);
    
    const previewItems = [];
    const errors = [];
    
    // Get existing ACTIVE SKUs to detect duplicates (ONCE per request, not per ASIN)
    const existingActiveSKUs = await TemplateListing.find({ 
      templateId,
      sellerId,
      status: 'active'
    }).lean().distinct('customLabel');
    
    const skuSet = new Set(existingActiveSKUs);
    
    // Check for existing ASINs across ALL templates for this seller
    const existingAsinListings = await TemplateListing.find({
      sellerId,
      _asinReference: { $in: asins },
      status: 'active'
    }).select('_asinReference templateId').lean();
    
    // Create maps for both current template and cross-template ASIN duplicates
    const asinInCurrentTemplate = new Set();
    const asinInOtherTemplates = new Map(); // ASIN -> templateId
    
    existingAsinListings.forEach(listing => {
      if (listing.templateId.toString() === templateId.toString()) {
        asinInCurrentTemplate.add(listing._asinReference);
      } else {
        asinInOtherTemplates.set(listing._asinReference, listing.templateId);
      }
    });
    
    console.log(`🔍 ASIN Check: ${asinInCurrentTemplate.size} in current template, ${asinInOtherTemplates.size} in other templates`);
    
    // Pre-generate all SKUs and check for SKU collisions
    const generatedSKUs = asins.map(asin => ({
      asin,
      sku: generateSKUFromASIN(asin)
    }));
    
    // Check if any generated SKUs already exist (from both ASIN imports and SKU imports)
    const existingBySKU = await TemplateListing.find({
      templateId,
      sellerId,
      customLabel: { $in: generatedSKUs.map(item => item.sku) },
      status: { $in: ['active', 'draft'] }
    }).select('customLabel _asinReference _id').lean();
    
    const existingSKUMap = new Map(
      existingBySKU.map(listing => [listing.customLabel, {
        id: listing._id,
        asin: listing._asinReference
      }])
    );
    
    console.log(`🔍 SKU Check: ${existingSKUMap.size} SKU conflicts detected`);
    
    console.log(`🚀 Processing ${asins.length} ASINs in parallel...`);
    
    // Process ALL ASINs in parallel using Promise.allSettled
    const asinPromises = asins.map(async (asin) => {
      try {
        console.log(`📦 Processing ASIN for preview: ${asin}`);
        
        // Check if ASIN exists in OTHER templates for this seller (blocking error)
        if (asinInOtherTemplates.has(asin)) {
          const otherTemplateId = asinInOtherTemplates.get(asin);
          const errorItem = {
            id: `preview-${asin}`,
            asin,
            sku: generateSKUFromASIN(asin),
            sourceData: null,
            generatedListing: null,
            pricingCalculation: null,
            warnings: [],
            errors: [`ASIN already exists for this seller in template ${otherTemplateId}. Each ASIN can only be used once per seller.`],
            status: 'blocked',
            blockedReason: 'cross_template_duplicate',
            existingTemplateId: otherTemplateId.toString()
          };
          
          return {
            success: false,
            item: errorItem,
            error: `ASIN exists in another template`
          };
        }
        
        // Generate SKU early for collision check
        const sku = generateSKUFromASIN(asin);
        
        // Check if generated SKU already exists (from ASIN imports or SKU imports)
        const existingSKU = existingSKUMap.get(sku);
        if (existingSKU) {
          const errorItem = {
            id: `preview-${asin}`,
            asin,
            sku,
            sourceData: null,
            generatedListing: null,
            pricingCalculation: null,
            warnings: [],
            errors: [existingSKU.asin 
              ? `SKU ${sku} already exists for ASIN ${existingSKU.asin} in this template`
              : `SKU ${sku} already exists in this template (imported via SKU import)`
            ],
            status: 'blocked',
            blockedReason: 'sku_conflict',
            existingListingId: existingSKU.id.toString()
          };
          
          return {
            success: false,
            item: errorItem,
            error: `SKU conflict`
          };
        }
        
        // Fetch Amazon data
        const amazonData = await fetchAmazonData(asin, region);
        
        // Apply field configurations
        const { coreFields, customFields, pricingCalculation } = 
          await applyFieldConfigs(amazonData, fieldConfigs, pricingConfig);
        
        // Apply template core field defaults as base layer (autofilled fields override these)
        const mergedCoreFields = mergeTemplateCoreFields(template.coreFieldDefaults, coreFields, amazonData);
        
        // Apply custom column default values for missing fields
        if (template?.customColumns && template.customColumns.length > 0) {
          template.customColumns.forEach(col => {
            if (col.defaultValue && !customFields[col.name]) {
              customFields[col.name] = col.defaultValue;
              console.log(`✨ Applied column default for ${col.name}: ${col.defaultValue}`);
            }
          });
        }
        
        console.log(`✅ Generated fields for ${asin}:`);
        console.log(`   Core fields: ${Object.keys(mergedCoreFields).join(', ')}`);
        console.log(`   Custom fields: ${Object.keys(customFields).join(', ')}`);
        
        // SKU already generated earlier for collision check
        
        // Check for warnings
        const warnings = [];
        const validationErrors = [];
        
        if (!mergedCoreFields.title) {
          validationErrors.push('Missing required field: title');
        }
        
        if (mergedCoreFields.startPrice === undefined || mergedCoreFields.startPrice === null || mergedCoreFields.startPrice === '') {
          if (pricingConfig?.enabled) {
            if (pricingCalculation?.error) {
              validationErrors.push(`Failed to calculate startPrice: ${pricingCalculation.error}`);
            } else {
              validationErrors.push('Pricing calculator enabled but startPrice not generated');
            }
          } else {
            validationErrors.push('Missing required field: startPrice (no pricing config or field mapping)');
          }
          console.error(`❌ [ASIN: ${asin}] startPrice validation failed. Value: ${mergedCoreFields.startPrice}, Pricing Config Enabled: ${pricingConfig?.enabled}, Error: ${pricingCalculation?.error || 'none'}`);
        } else {
          console.log(`✅ [ASIN: ${asin}] startPrice validated: $${mergedCoreFields.startPrice}`);
        }
        
        if (skuSet.has(sku)) {
          warnings.push('Duplicate SKU - will be skipped or replace existing');
        }
        
        // Check if ASIN already exists in CURRENT template (warning only)
        if (asinInCurrentTemplate.has(asin)) {
          warnings.push('ASIN already exists in this template - will be skipped during save');
        }
        
        // Check for missing important fields
        if (!mergedCoreFields.description) {
          warnings.push('Missing description');
        }
        
        previewItems.push({
          id: `preview-${asin}`,
          asin,
          sku,
          sourceData: {
            title: amazonData.title,
            brand: amazonData.brand,
            price: amazonData.price,
            description: amazonData.description,
            images: amazonData.images,
            color: amazonData.color,
            compatibility: amazonData.compatibility,
            model: amazonData.model,
            material: amazonData.material,
            specialFeatures: amazonData.specialFeatures,
            size: amazonData.size,
            formFactor: amazonData.formFactor,
            screenSize: amazonData.screenSize,
            bandMaterial: amazonData.bandMaterial,
            bandWidth: amazonData.bandWidth,
            bandColor: amazonData.bandColor,
            includedComponents: amazonData.includedComponents,
            rawData: amazonData.rawData
          },
          generatedListing: {
            ...mergedCoreFields,
            customLabel: sku,
            customFields,
            _asinReference: asin
          },
          pricingCalculation,
          warnings,
          errors: validationErrors,
          status: validationErrors.length > 0 ? 'error' : (warnings.length > 0 ? 'warning' : 'success')
        });
        
        return {
          success: true,
          item: previewItems[previewItems.length - 1]
        };
        
      } catch (error) {
        console.error(`❌ Error processing ASIN ${asin}:`, error);
        
        const errorItem = {
          id: `preview-${asin}`,
          asin,
          sku: generateSKUFromASIN(asin),
          sourceData: null,
          generatedListing: null,
          pricingCalculation: null,
          warnings: [],
          errors: [error.message],
          status: 'error'
        };
        
        return {
          success: false,
          item: errorItem,
          error: error.message
        };
      }
    });
    
    // Wait for all ASINs to complete (parallel processing)
    const results = await Promise.allSettled(asinPromises);
    
    // Collect all items from results
    const finalItems = [];
    const finalErrors = [];
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        finalItems.push(result.value.item);
        if (!result.value.success) {
          finalErrors.push({
            asin: asins[index],
            error: result.value.error
          });
        }
      } else {
        // Promise rejected (shouldn't happen with try/catch, but handle it)
        const asin = asins[index];
        finalErrors.push({
          asin,
          error: result.reason?.message || 'Unknown error'
        });
        finalItems.push({
          id: `preview-${asin}`,
          asin,
          sku: generateSKUFromASIN(asin),
          sourceData: null,
          generatedListing: null,
          pricingCalculation: null,
          warnings: [],
          errors: [result.reason?.message || 'Unknown error'],
          status: 'error'
        });
      }
    });
    
    console.log(`✅ Parallel processing complete: ${finalItems.length} items processed`);
    
    res.json({
      success: true,
      items: finalItems,
      errors: finalErrors,
      summary: {
        total: asins.length,
        successful: finalItems.filter(i => i.status !== 'error').length,
        failed: finalErrors.length,
        warnings: finalItems.filter(i => i.status === 'warning').length
      }
    });
    
  } catch (error) {
    console.error('Bulk preview error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to generate preview' 
    });
  }
});

// Bulk save: Save reviewed/edited listings to database
router.post('/bulk-save', requireAuth, async (req, res) => {
  try {
    const { templateId, sellerId, listings, options = {} } = req.body;
    
    if (!templateId) {
      return res.status(400).json({ error: 'Template ID is required' });
    }
    
    if (!sellerId) {
      return res.status(400).json({ error: 'Seller ID is required' });
    }
    
    if (!listings || !Array.isArray(listings) || listings.length === 0) {
      return res.status(400).json({ error: 'Listings array is required' });
    }
    
    // Validate seller exists
    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return res.status(404).json({ error: 'Seller not found' });
    }
    
    const {
      skipDuplicates = true
    } = options;
    
    const results = [];
    const errors = [];
    let skippedCount = 0;
    
    // Get existing ACTIVE SKUs
    const existingActiveSKUs = await TemplateListing.find({ 
      templateId,
      sellerId,
      status: 'active'
    }).distinct('customLabel');
    
    // Get existing INACTIVE listings for potential reactivation
    const inactiveListings = await TemplateListing.find({
      templateId,
      sellerId,
      status: 'inactive'
    }).select('+_asinReference');
    
    const inactiveMap = new Map(
      inactiveListings.map(l => [l.customLabel, l])
    );
    
    const skuSet = new Set(existingActiveSKUs);
    
    console.log(`📊 Bulk save: ${existingActiveSKUs.length} active SKUs, ${inactiveListings.length} inactive listings`);
    
    // Check for cross-template ASIN duplicates
    const asinsToSave = listings
      .map(l => l._asinReference)
      .filter(asin => asin && asin.trim());
    
    const crossTemplateAsins = await TemplateListing.find({
      sellerId,
      templateId: { $ne: templateId }, // Different template
      _asinReference: { $in: asinsToSave },
      status: 'active'
    }).select('_asinReference templateId').lean();
    
    const crossTemplateAsinMap = new Map(
      crossTemplateAsins.map(l => [l._asinReference, l.templateId])
    );
    
    console.log(`🚫 Found ${crossTemplateAsinMap.size} ASINs already in other templates`);
    
    // Pre-check all SKUs for collisions (including those from SKU imports)
    const skusToSave = listings
      .map(l => l.customLabel)
      .filter(sku => sku && sku.trim());
    
    const existingBySKU = await TemplateListing.find({
      templateId,
      sellerId,
      customLabel: { $in: skusToSave },
      status: { $in: ['active', 'draft'] }
    }).select('customLabel _asinReference _id').lean();
    
    const existingSKUMap = new Map(
      existingBySKU.map(listing => [listing.customLabel, {
        id: listing._id,
        asin: listing._asinReference
      }])
    );
    
    console.log(`🔍 SKU pre-check: ${existingSKUMap.size} SKU conflicts detected`);
    
    // Process each listing
    for (const listingData of listings) {
      try {
        // Check for cross-template ASIN duplicate FIRST
        if (listingData._asinReference && crossTemplateAsinMap.has(listingData._asinReference)) {
          const existingTemplateId = crossTemplateAsinMap.get(listingData._asinReference);
          errors.push({
            asin: listingData._asinReference,
            error: `ASIN already exists in template ${existingTemplateId} for this seller`
          });
          results.push({
            status: 'blocked',
            asin: listingData._asinReference,
            error: `ASIN already exists in another template for this seller`,
            existingTemplateId: existingTemplateId.toString()
          });
          console.log(`🚫 Blocked duplicate ASIN ${listingData._asinReference} (exists in template ${existingTemplateId})`);
          continue;
        }
        
        // Check if this is a duplicate update request
        if (listingData._isDuplicateUpdate && listingData._existingListingId) {
          const existingListing = await TemplateListing.findById(listingData._existingListingId).select('+_asinReference');
          
          if (!existingListing) {
            errors.push({
              asin: listingData._asinReference,
              error: 'Existing listing not found for update'
            });
            results.push({
              status: 'failed',
              asin: listingData._asinReference,
              error: 'Existing listing not found'
            });
            continue;
          }
          
          // Convert customFields
          const customFieldsMap = listingData.customFields && typeof listingData.customFields === 'object'
            ? new Map(Object.entries(listingData.customFields))
            : new Map();

          // Compute new count-based SKU fresh at save time
          const dupAsinDoc = await AsinDirectory.findOne({ asin: listingData._asinReference }).select('listingCount').lean();
          const newSKU = generateSKUWithCount(listingData._asinReference, dupAsinDoc?.listingCount || 0);

          // Update existing listing with new data
          // Build update object - only overwrite fields that are explicitly provided
          // (guards against undefined wiping values that weren't sent from the frontend)
          const updateData = {
            customLabel: newSKU,
            customFields: customFieldsMap,
            pendingRedownload: true,
            duplicateCount: (existingListing.duplicateCount || 0) + 1,
            lastDuplicateAttempt: Date.now(),
            scheduleTime: '',
            updatedAt: Date.now()
          };
          const overwritableFields = ['title', 'description', 'startPrice', 'quantity', 'itemPhotoUrl', 'conditionId', 'format', 'duration', 'location'];
          for (const field of overwritableFields) {
            if (listingData[field] !== undefined && listingData[field] !== null && listingData[field] !== '') {
              updateData[field] = listingData[field];
            }
          }
          Object.assign(existingListing, updateData);

          await existingListing.save();

          // Increment AsinDirectory listing count
          await AsinDirectory.updateOne({ asin: listingData._asinReference }, { $inc: { listingCount: 1 } });

          results.push({
            status: 'updated',
            listing: existingListing.toObject(),
            asin: listingData._asinReference,
            sku: newSKU,
            duplicateCount: existingListing.duplicateCount
          });

          console.log(`✅ Updated duplicate ASIN ${listingData._asinReference} (count: ${existingListing.duplicateCount}, newSKU: ${newSKU})`);
          continue;
        }
        
        // Validate required fields
        if (!listingData.title) {
          errors.push({
            asin: listingData._asinReference,
            error: 'Title is required'
          });
          results.push({
            status: 'failed',
            asin: listingData._asinReference,
            error: 'Title is required'
          });
          continue;
        }
        
        if (listingData.startPrice === undefined || listingData.startPrice === null) {
          errors.push({
            asin: listingData._asinReference,
            error: 'Start price is required'
          });
          results.push({
            status: 'failed',
            asin: listingData._asinReference,
            error: 'Start price is required'
          });
          continue;
        }
        
        // Compute count-based SKU fresh at save time
        let sku = listingData.customLabel;
        if (listingData._asinReference) {
          const newAsinDoc = await AsinDirectory.findOne({ asin: listingData._asinReference }).select('listingCount').lean();
          sku = generateSKUWithCount(listingData._asinReference, newAsinDoc?.listingCount || 0);
        }

        if (!sku) {
          errors.push({
            asin: listingData._asinReference,
            error: 'SKU (Custom label) is required'
          });
          results.push({
            status: 'failed',
            asin: listingData._asinReference,
            error: 'SKU is required'
          });
          continue;
        }

        console.log(`🔍 Saving SKU: ${sku}`);
        
        // Check if SKU already exists (from ASIN imports or SKU imports)
        const existingSKU = existingSKUMap.get(sku);
        if (existingSKU && existingSKU.id) {
          errors.push({
            asin: listingData._asinReference,
            sku,
            error: existingSKU.asin 
              ? `SKU ${sku} already exists for ASIN ${existingSKU.asin}`
              : `SKU ${sku} already exists (imported via SKU import)`
          });
          results.push({
            status: 'blocked',
            asin: listingData._asinReference,
            sku,
            blockedReason: 'sku_conflict',
            existingListingId: existingSKU.id.toString(),
            error: existingSKU.asin 
              ? `SKU already exists for ASIN ${existingSKU.asin}`
              : `SKU already exists (imported via SKU import)`
          });
          console.log(`🚫 Blocked SKU conflict: ${sku}`);
          continue;
        }
        
        // Check if SKU exists as inactive - reactivate
        const inactiveListing = inactiveMap.get(sku);
        
        if (inactiveListing) {
          const customFieldsMap = listingData.customFields && typeof listingData.customFields === 'object'
            ? new Map(Object.entries(listingData.customFields))
            : new Map();
          
          Object.assign(inactiveListing, {
            ...listingData,
            customLabel: sku,
            customFields: customFieldsMap,
            templateId,
            sellerId,
            status: 'active',
            updatedAt: Date.now()
          });
          
          await inactiveListing.save();
          skuSet.add(sku);
          
          results.push({
            status: 'reactivated',
            listing: inactiveListing.toObject(),
            asin: listingData._asinReference,
            sku
          });
          
          console.log(`✅ Reactivated: ${sku}`);
          continue;
        }
        
        // Check for duplicate SKU
        if (skuSet.has(sku)) {
          if (skipDuplicates) {
            skippedCount++;
            results.push({
              status: 'skipped',
              asin: listingData._asinReference,
              sku,
              reason: 'Duplicate SKU'
            });
            console.log(`⏭️ Skipped duplicate: ${sku}`);
            continue;
          } else {
            errors.push({
              asin: listingData._asinReference,
              error: 'Duplicate SKU',
              sku
            });
            results.push({
              status: 'failed',
              asin: listingData._asinReference,
              error: 'Duplicate SKU'
            });
            continue;
          }
        }
        
        // Convert customFields object to Map
        const customFieldsMap = listingData.customFields && typeof listingData.customFields === 'object'
          ? new Map(Object.entries(listingData.customFields))
          : new Map();
        
        // Create new listing
        const listing = new TemplateListing({
          ...listingData,
          customLabel: sku,
          customFields: customFieldsMap,
          templateId,
          sellerId,
          status: 'active',
          createdBy: req.user.userId
        });
        
        await listing.save();
        skuSet.add(sku);

        // Increment AsinDirectory listing count
        if (listingData._asinReference) {
          await AsinDirectory.updateOne({ asin: listingData._asinReference }, { $inc: { listingCount: 1 } });
        }

        results.push({
          status: 'created',
          listing: listing.toObject(),
          asin: listingData._asinReference,
          sku
        });

        console.log(`✅ Created: ${sku}`);

      } catch (error) {
        console.error('Error saving listing:', error);

        if (error.code === 11000) {
          skippedCount++;
          results.push({
            status: 'skipped',
            asin: listingData._asinReference,
            error: 'Duplicate SKU'
          });
        } else {
          errors.push({
            asin: listingData._asinReference,
            error: error.message
          });
          results.push({
            status: 'failed',
            asin: listingData._asinReference,
            error: error.message
          });
        }
      }
    }

    const created = results.filter(r => r.status === 'created').length;
    const updated = results.filter(r => r.status === 'updated').length;
    const reactivated = results.filter(r => r.status === 'reactivated').length;
    const failed = results.filter(r => r.status === 'failed').length;
    
    console.log(`✅ Bulk save completed: ${created} created, ${updated} updated, ${reactivated} reactivated, ${failed} failed, ${skippedCount} skipped`);
    
    res.json({
      success: true,
      total: listings.length,
      created,
      updated,
      reactivated,
      failed,
      skipped: skippedCount,
      results,
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    console.error('Bulk save error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to bulk save listings' 
    });
  }
});

// Bulk import ASINs (quick import without fetching Amazon data)
router.post('/bulk-import-asins', requireAuth, async (req, res) => {
  try {
    const { templateId, sellerId, asins } = req.body;
    
    // Validate required fields
    if (!templateId) {
      return res.status(400).json({ error: 'Template ID is required' });
    }
    
    if (!sellerId) {
      return res.status(400).json({ error: 'Seller ID is required' });
    }
    
    if (!asins || !Array.isArray(asins) || asins.length === 0) {
      return res.status(400).json({ error: 'ASINs array is required and must not be empty' });
    }
    
    console.log('📦 Bulk import request:', { templateId, sellerId, asinCount: asins.length });
    
    // Validate template (with seller overrides) and seller exist
    const [template, seller] = await Promise.all([
      getEffectiveTemplate(templateId, sellerId),
      Seller.findById(sellerId)
    ]);
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    if (!seller) {
      return res.status(404).json({ error: 'Seller not found' });
    }
    
    // Get existing SKUs for this seller to avoid duplicates
    const existingSKUs = await TemplateListing.find({ 
      templateId,
      sellerId,
      status: { $in: ['active', 'draft'] }
    }).distinct('customLabel');
    
    const skuSet = new Set(existingSKUs);
    let skuCounter = Date.now();
    
    // Process ASINs and generate SKUs
    const listingsToCreate = [];
    const skippedASINs = [];
    
    for (const asin of asins) {
      const cleanASIN = asin.trim().toUpperCase();
      
      // Basic ASIN validation (should start with B0 and be 10 chars)
      if (!cleanASIN || cleanASIN.length !== 10 || !cleanASIN.startsWith('B0')) {
        skippedASINs.push({
          asin: cleanASIN,
          reason: 'Invalid ASIN format'
        });
        continue;
      }
      
      // Generate SKU using GRW25 + last 5 chars
      let sku = generateSKUFromASIN(cleanASIN);
      
      // Check for duplicates and make unique
      if (skuSet.has(sku)) {
        // If collision, append timestamp suffix
        const baseSKU = sku;
        let suffix = 1;
        
        do {
          sku = `${baseSKU}-${suffix++}`;
        } while (skuSet.has(sku));
        
        console.log(`SKU collision detected: ${baseSKU} → ${sku}`);
      }
      
      skuSet.add(sku);
      
      // Create minimal listing object
      listingsToCreate.push({
        templateId,
        sellerId,
        _asinReference: cleanASIN,
        customLabel: sku,
        amazonLink: `https://www.amazon.com/dp/${cleanASIN}`,
        title: `Imported Product - ${cleanASIN}`,
        startPrice: 0.01, // Minimum placeholder
        quantity: 1,
        status: 'active',
        conditionId: '1000-New',
        format: 'FixedPrice',
        duration: 'GTC',
        location: 'UnitedStates',
        createdBy: req.user.userId
      });
    }
    
    console.log(`📊 Prepared ${listingsToCreate.length} listings, ${skippedASINs.length} skipped (validation)`);
    
    // Check for existing listings with same ASINs in active/draft status
    const existingByASIN = await TemplateListing.find({
      templateId,
      sellerId,
      _asinReference: { $in: listingsToCreate.map(l => l._asinReference) },
      status: { $in: ['active', 'draft'] }
    }).select('customLabel _asinReference');
    
    const existingASINs = new Set(existingByASIN.map(l => l._asinReference));
    
    console.log(`🔍 Found ${existingASINs.size} existing active/draft ASINs in database`);
    
    // Check for inactive listings that can be reactivated
    const inactiveListings = await TemplateListing.find({
      templateId,
      sellerId,
      _asinReference: { $in: listingsToCreate.map(l => l._asinReference) },
      status: 'inactive'
    }).select('customLabel _asinReference');
    
    const inactiveASINMap = new Map(inactiveListings.map(l => [l._asinReference, l]));
    
    console.log(`🔄 Found ${inactiveASINMap.size} inactive ASINs that can be reactivated`);
    
    // Separate listings into: reactivate, skip (already active), or create new
    const listingsToReactivate = [];
    const newListings = [];
    
    for (const listing of listingsToCreate) {
      if (existingASINs.has(listing._asinReference)) {
        // Already exists as active/draft - skip
        const existing = existingByASIN.find(e => e._asinReference === listing._asinReference);
        skippedASINs.push({
          asin: listing._asinReference,
          sku: listing.customLabel,
          reason: `Already exists in database (SKU: ${existing.customLabel})`
        });
      } else if (inactiveASINMap.has(listing._asinReference)) {
        // Exists as inactive - reactivate
        listingsToReactivate.push({
          existing: inactiveASINMap.get(listing._asinReference),
          newData: listing
        });
      } else {
        // Doesn't exist - create new
        newListings.push(listing);
      }
    }
    
    console.log(`✅ ${newListings.length} new listings to insert, ${listingsToReactivate.length} to reactivate`);
    
    // Reactivate inactive listings
    let reactivatedCount = 0;
    if (listingsToReactivate.length > 0) {
      const reactivateOps = listingsToReactivate.map(({ existing, newData }) => ({
        updateOne: {
          filter: { _id: existing._id },
          update: {
            $set: {
              ...newData,
              status: 'active',
              scheduleTime: '',
              downloadBatchId: null,
              downloadedAt: null,
              downloadBatchNumber: null,
              pendingRedownload: false,
              updatedAt: Date.now()
            }
          }
        }
      }));
      
      const reactivateResult = await TemplateListing.bulkWrite(reactivateOps);
      reactivatedCount = reactivateResult.modifiedCount || 0;
      console.log(`🔄 Reactivated ${reactivatedCount} inactive listings`);
    }
    
    // Bulk insert new listings
    let importedCount = 0;
    let insertErrors = [];
    
    if (newListings.length > 0) {
      try {
        const result = await TemplateListing.insertMany(newListings, {
          ordered: false, // Continue on error
          rawResult: true
        });
        
        importedCount = result.insertedCount || newListings.length;
        
        // Handle any write errors
        if (result.writeErrors && result.writeErrors.length > 0) {
          result.writeErrors.forEach(err => {
            const listing = newListings[err.index];
            if (err.code === 11000) {
              skippedASINs.push({
                asin: listing._asinReference,
                sku: listing.customLabel,
                reason: 'Duplicate key error'
              });
            } else {
              insertErrors.push({
                asin: listing._asinReference,
                sku: listing.customLabel,
                error: err.errmsg
              });
            }
          });
        }
      } catch (error) {
        // Handle bulk insert errors
        if (error.code === 11000 && error.writeErrors) {
          importedCount = error.insertedDocs ? error.insertedDocs.length : 0;
          
          error.writeErrors.forEach(err => {
            const listing = newListings[err.index];
            skippedASINs.push({
              asin: listing._asinReference,
              sku: listing.customLabel,
              reason: 'Duplicate key error'
            });
          });
        } else {
          throw error;
        }
      }
    }
    
    console.log(`🎉 Import complete: ${importedCount} new, ${reactivatedCount} reactivated, ${skippedASINs.length} skipped`);
    
    res.json({
      total: asins.length,
      imported: importedCount,
      reactivated: reactivatedCount,
      skipped: skippedASINs.length,
      skippedDetails: skippedASINs,
      errors: insertErrors.length > 0 ? insertErrors : undefined
    });
    
  } catch (error) {
    console.error('❌ Bulk import error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to bulk import ASINs' 
    });
  }
});

// Bulk import SKUs (quick import with SKUs directly)
router.post('/bulk-import-skus', requireAuth, async (req, res) => {
  try {
    const { templateId, sellerId, skus } = req.body;
    
    // Validate required fields
    if (!templateId) {
      return res.status(400).json({ error: 'Template ID is required' });
    }
    
    if (!sellerId) {
      return res.status(400).json({ error: 'Seller ID is required' });
    }
    
    if (!skus || !Array.isArray(skus) || skus.length === 0) {
      return res.status(400).json({ error: 'SKUs array is required and must not be empty' });
    }
    
    console.log('📦 Bulk SKU import request:', { templateId, sellerId, skuCount: skus.length });
    
    // Validate template (with seller overrides) and seller exist
    const [template, seller] = await Promise.all([
      getEffectiveTemplate(templateId, sellerId),
      Seller.findById(sellerId)
    ]);
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    if (!seller) {
      return res.status(404).json({ error: 'Seller not found' });
    }
    
    // Process SKUs
    const listingsToCreate = [];
    const skippedSKUs = [];
    const processedSKUs = new Set();
    
    for (const sku of skus) {
      const cleanSKU = sku.trim();
      
      // Basic SKU validation (not empty, reasonable length)
      if (!cleanSKU || cleanSKU.length === 0) {
        skippedSKUs.push({
          sku: cleanSKU,
          reason: 'Empty SKU'
        });
        continue;
      }
      
      if (cleanSKU.length > 100) {
        skippedSKUs.push({
          sku: cleanSKU,
          reason: 'SKU too long (max 100 characters)'
        });
        continue;
      }
      
      // Check for duplicates in current batch
      if (processedSKUs.has(cleanSKU)) {
        skippedSKUs.push({
          sku: cleanSKU,
          reason: 'Duplicate SKU in import batch'
        });
        continue;
      }
      
      processedSKUs.add(cleanSKU);
      
      // Create minimal listing object
      listingsToCreate.push({
        templateId,
        sellerId,
        customLabel: cleanSKU,
        title: `Product - ${cleanSKU}`,
        startPrice: 0.01, // Minimum placeholder
        quantity: 1,
        status: 'active',
        conditionId: '1000-New',
        format: 'FixedPrice',
        duration: 'GTC',
        location: 'UnitedStates',
        createdBy: req.user.userId
      });
    }
    
    console.log(`📊 Prepared ${listingsToCreate.length} listings, ${skippedSKUs.length} skipped (validation)`);
    
    // Check for existing SKUs across ALL templates for this seller (cross-template validation)
    const crossTemplateSkus = await TemplateListing.find({
      sellerId,
      templateId: { $ne: templateId }, // Different templates
      customLabel: { $in: listingsToCreate.map(l => l.customLabel) },
      status: { $in: ['active', 'draft'] }
    }).select('customLabel templateId _asinReference');
    
    const crossTemplateSKUMap = new Map(
      crossTemplateSkus.map(l => [l.customLabel, { templateId: l.templateId, asin: l._asinReference }])
    );
    
    console.log(`🚫 Found ${crossTemplateSKUMap.size} SKUs in other templates`);
    
    // Filter out SKUs that exist in other templates
    const skusNotInOtherTemplates = listingsToCreate.filter(listing => {
      if (crossTemplateSKUMap.has(listing.customLabel)) {
        const existing = crossTemplateSKUMap.get(listing.customLabel);
        skippedSKUs.push({
          sku: listing.customLabel,
          reason: existing.asin
            ? `SKU already exists in another template for ASIN ${existing.asin}`
            : `SKU already exists in another template`
        });
        return false;
      }
      return true;
    });
    
    // Check for existing listings with same SKUs in active/draft status (current template)
    const existingBySKU = await TemplateListing.find({
      templateId,
      sellerId,
      customLabel: { $in: skusNotInOtherTemplates.map(l => l.customLabel) },
      status: { $in: ['active', 'draft'] }
    }).select('customLabel _asinReference');
    
    const existingSKUs = new Set(existingBySKU.map(l => l.customLabel));
    
    console.log(`🔍 Found ${existingSKUs.size} existing active/draft SKUs in database`);
    
    // Check for inactive listings that can be reactivated
    const inactiveListings = await TemplateListing.find({
      templateId,
      sellerId,
      customLabel: { $in: skusNotInOtherTemplates.map(l => l.customLabel) },
      status: 'inactive'
    }).select('customLabel _asinReference');
    
    const inactiveSKUMap = new Map(inactiveListings.map(l => [l.customLabel, l]));
    
    console.log(`🔄 Found ${inactiveSKUMap.size} inactive SKUs that can be reactivated`);
    
    // Separate listings into: reactivate, skip (already active), or create new
    const listingsToReactivate = [];
    const newListings = [];
    
    for (const listing of skusNotInOtherTemplates) {
      if (existingSKUs.has(listing.customLabel)) {
        // Already exists as active/draft - skip
        const existing = existingBySKU.find(e => e.customLabel === listing.customLabel);
        skippedSKUs.push({
          sku: listing.customLabel,
          reason: `Already exists in database${existing._asinReference ? ` (ASIN: ${existing._asinReference})` : ''}`
        });
      } else if (inactiveSKUMap.has(listing.customLabel)) {
        // Exists as inactive - reactivate
        listingsToReactivate.push({
          existing: inactiveSKUMap.get(listing.customLabel),
          newData: listing
        });
      } else {
        // Doesn't exist - create new
        newListings.push(listing);
      }
    }
    
    console.log(`✅ ${newListings.length} new listings to insert, ${listingsToReactivate.length} to reactivate`);
    
    // Reactivate inactive listings
    let reactivatedCount = 0;
    if (listingsToReactivate.length > 0) {
      const reactivateOps = listingsToReactivate.map(({ existing, newData }) => ({
        updateOne: {
          filter: { _id: existing._id },
          update: {
            $set: {
              ...newData,
              status: 'active',
              scheduleTime: '',
              downloadBatchId: null,
              downloadedAt: null,
              downloadBatchNumber: null,
              pendingRedownload: false,
              updatedAt: Date.now()
            }
          }
        }
      }));
      
      const reactivateResult = await TemplateListing.bulkWrite(reactivateOps);
      reactivatedCount = reactivateResult.modifiedCount || 0;
      console.log(`🔄 Reactivated ${reactivatedCount} inactive listings`);
    }
    
    // Bulk insert new listings
    let importedCount = 0;
    let insertErrors = [];
    
    if (newListings.length > 0) {
      try {
        const result = await TemplateListing.insertMany(newListings, {
          ordered: false, // Continue on error
          rawResult: true
        });
        
        importedCount = result.insertedCount || newListings.length;
        
        // Handle any write errors
        if (result.writeErrors && result.writeErrors.length > 0) {
          result.writeErrors.forEach(err => {
            const listing = newListings[err.index];
            if (err.code === 11000) {
              skippedSKUs.push({
                sku: listing.customLabel,
                reason: 'Duplicate key error'
              });
            } else {
              insertErrors.push({
                sku: listing.customLabel,
                error: err.errmsg
              });
            }
          });
        }
      } catch (error) {
        // Handle bulk insert errors
        if (error.code === 11000 && error.writeErrors) {
          importedCount = error.insertedDocs ? error.insertedDocs.length : 0;
          
          error.writeErrors.forEach(err => {
            const listing = newListings[err.index];
            skippedSKUs.push({
              sku: listing.customLabel,
              reason: 'Duplicate key error'
            });
          });
        } else {
          throw error;
        }
      }
    }
    
    console.log(`🎉 SKU Import complete: ${importedCount} new, ${reactivatedCount} reactivated, ${skippedSKUs.length} skipped`);
    
    res.json({
      total: skus.length,
      imported: importedCount,
      reactivated: reactivatedCount,
      skipped: skippedSKUs.length,
      skippedDetails: skippedSKUs,
      errors: insertErrors.length > 0 ? insertErrors : undefined
    });
    
  } catch (error) {
    console.error('❌ Bulk SKU import error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to bulk import SKUs' 
    });
  }
});

// Bulk import from CSV
router.post('/bulk-import', requireAuth, async (req, res) => {
  try {
    const { templateId, listings } = req.body;
    
    if (!templateId) {
      return res.status(400).json({ error: 'Template ID is required' });
    }
    
    if (!listings || !Array.isArray(listings) || listings.length === 0) {
      return res.status(400).json({ error: 'Listings array is required' });
    }
    
    // Add metadata to each listing
    const listingsToInsert = listings.map(listing => ({
      ...listing,
      templateId,
      createdBy: req.user.userId,
      customFields: listing.customFields 
        ? new Map(Object.entries(listing.customFields))
        : new Map()
    }));
    
    const result = await TemplateListing.insertMany(listingsToInsert, { 
      ordered: false // Continue on error
    });
    
    res.json({ 
      message: 'Listings imported successfully',
      importedCount: result.length 
    });
  } catch (error) {
    if (error.code === 11000) {
      // Some duplicates were found
      const insertedCount = error.insertedDocs ? error.insertedDocs.length : 0;
      return res.status(207).json({ 
        message: 'Import completed with some duplicates skipped',
        importedCount: insertedCount,
        errors: error.writeErrors || []
      });
    }
    console.error('Error bulk importing listings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export listings as eBay CSV
router.get('/export-csv/:templateId', requireAuth, async (req, res) => {
  try {
    const { templateId } = req.params;
    const { sellerId, listingIds } = req.query;
    
    // When specific listingIds are provided, filter only by those IDs —
    // status, downloadBatchId, and sellerId filters are skipped since the
    // user has explicitly chosen which listings to export.
    // Otherwise, filter for ACTIVE listings that haven't been downloaded yet.
    let filter;
    if (listingIds) {
      const ids = listingIds.split(',').map(id => id.trim()).filter(Boolean);
      filter = { _id: { $in: ids } };
    } else {
      filter = {
        templateId,
        $or: [{ downloadBatchId: null }, { pendingRedownload: true }], // not downloaded yet OR flagged for re-download
        status: 'active',       // Only active listings (exclude inactive/draft/sold/ended)
      };
      if (sellerId) {
        filter.sellerId = sellerId;
      }
    }
    
    // Fetch effective template (includes seller overrides), seller, and filtered listings
    const [template, seller, listings] = await Promise.all([
      getEffectiveTemplate(templateId, sellerId),
      sellerId ? Seller.findById(sellerId).populate('user', 'username email') : null,
      TemplateListing.find(filter).select('+_asinReference').sort({ createdAt: -1 })
    ]);
    
    console.log('📊 Export CSV - Seller info:', seller?.user?.username || seller?.user?.email || 'No seller');
    console.log('📊 Export CSV - Listings count:', listings.length);
    console.log('📥 Exporting active listings only (excluded inactive/draft)');
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    if (listings.length === 0) {
      return res.status(400).json({ error: 'No active listings to download' });
    }
    
    // Generate batch ID and get next batch number
    const crypto = await import('crypto');
    const batchId = crypto.randomUUID();
    
    // Get next batch number for this template + seller combination
    const latestBatch = await TemplateListing.findOne({
      templateId,
      sellerId: sellerId || { $exists: true },
      downloadBatchNumber: { $ne: null }
    }).sort({ downloadBatchNumber: -1 });
    
    const batchNumber = (latestBatch?.downloadBatchNumber || 0) + 1;
    
    console.log('🔢 Batch number:', batchNumber);
    console.log('🆔 Batch ID:', batchId);
    
    // Get custom Action field from template
    const actionField = template.customActionField || '*Action(SiteID=US|Country=US|Currency=USD|Version=1193)';
    
    // Mark listings as downloaded (also clears pendingRedownload flag)
    const updateResult = await TemplateListing.updateMany(
      filter,
      {
        downloadBatchId: batchId,
        downloadedAt: new Date(),
        downloadBatchNumber: batchNumber,
        downloadedActionField: actionField,
        pendingRedownload: false
      }
    );
    
    console.log('✅ Updated listings:', updateResult.modifiedCount);
    console.log('📝 Using Action field:', actionField);
    
    // Build core headers (38 columns)
    const coreHeaders = [
      actionField,
      'Custom label (SKU)',
      'Category ID',
      'Category name',
      'Title',
      'Relationship',
      'Relationship details',
      'Schedule Time',
      'P:UPC',
      'P:EPID',
      'Start price',
      'Quantity',
      'Item photo URL',
      'VideoID',
      'Condition ID',
      'Description',
      'Format',
      'Duration',
      'Buy It Now price',
      'Best Offer Enabled',
      'Best Offer Auto Accept Price',
      'Minimum Best Offer Price',
      'Immediate pay required',
      'Location',
      'Shipping service 1 option',
      'Shipping service 1 cost',
      'Shipping service 1 priority',
      'Shipping service 2 option',
      'Shipping service 2 cost',
      'Shipping service 2 priority',
      'Max dispatch time',
      'Returns accepted option',
      'Returns within option',
      'Refund option',
      'Return shipping cost paid by',
      'Shipping profile name',
      'Return profile name',
      'Payment profile name'
    ];
    
    // Add custom column headers
    const orderedUniqueCustomColumns = getOrderedUniqueCustomColumns(template.customColumns);
    const customHeaders = orderedUniqueCustomColumns.map(col => col.name);
    
    const allHeaders = [...coreHeaders, ...customHeaders];
    const columnCount = allHeaders.length;
    
    // Generate #INFO lines (must match column count exactly)
    const emptyRow = new Array(columnCount).fill('');
    
    // INFO Line 1: Created timestamp + required field indicator
    const infoLine1 = ['#INFO', `Created=${Date.now()}`, '', '', '', '', 
                       ' Indicates missing required fields', '', '', '', '',
                       ' Indicates missing field that will be required soon',
                       ...new Array(columnCount - 12).fill('')];
    
    // INFO Line 2: Version + recommended field indicator  
    const infoLine2 = ['#INFO', 'Version=1.0', '', 
                       'Template=fx_category_template_EBAY_US', '', '',
                       ' Indicates missing recommended field', '', '', '', '',
                       ' Indicates field does not apply to this item/category',
                       ...new Array(columnCount - 12).fill('')];
    
    // INFO Line 3: All empty commas
    const infoLine3 = new Array(columnCount).fill('')
    infoLine3[0] = '#INFO';
    
    // Map listings to CSV rows
    const dataRows = listings.map(listing => {
      // Add leading slash to category name if not present
      let categoryName = listing.categoryName || '';
      if (categoryName && !categoryName.startsWith('/')) {
        categoryName = '/' + categoryName;
      }
      
      const coreValues = [
        listing.action || 'Add',
        listing.customLabel || '',
        listing.categoryId || '',
        categoryName,
        listing.title || '',
        listing.relationship || '',
        listing.relationshipDetails || '',
        listing.scheduleTime || '',
        listing.upc || '',
        listing.epid || '',
        listing.startPrice || '',
        listing.quantity || '',
        listing.itemPhotoUrl || '',
        listing.videoId || '',
        listing.conditionId || '1000-New',
        listing.description || '',
        listing.format || 'FixedPrice',
        listing.duration || 'GTC',
        listing.buyItNowPrice || '',
        listing.bestOfferEnabled || '',
        listing.bestOfferAutoAcceptPrice || '',
        listing.minimumBestOfferPrice || '',
        listing.immediatePayRequired || '',
        listing.location || 'UnitedStates',
        listing.shippingService1Option || '',
        listing.shippingService1Cost || '',
        listing.shippingService1Priority || '',
        listing.shippingService2Option || '',
        listing.shippingService2Cost || '',
        listing.shippingService2Priority || '',
        listing.maxDispatchTime || '',
        listing.returnsAcceptedOption || '',
        listing.returnsWithinOption || '',
        listing.refundOption || '',
        listing.returnShippingCostPaidBy || '',
        listing.shippingProfileName || '',
        listing.returnProfileName || '',
        listing.paymentProfileName || ''
      ];
      
      // Get custom field values in order
      const customValues = orderedUniqueCustomColumns
        .map(col => sanitizeCustomCsvValueByHeader(col.name, listing.customFields.get(col.name) || ''));
      
      return [...coreValues, ...customValues];
    });
    
    // Combine all rows
    const allRows = [infoLine1, infoLine2, infoLine3, allHeaders, ...dataRows];
    
    // Convert to CSV string with proper escaping
    const csvContent = allRows.map(row => 
      row.map(cell => {
        const value = String(cell || '');
        // Escape quotes and wrap in quotes if contains comma/quote/newline
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',')
    ).join('\n');
    
    // Send as downloadable file with template, seller, batch number and date
    const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const sellerName = seller?.user?.username || seller?.user?.email || 'seller';
    const templateName = template.name.replace(/\s+/g, '_');
    const filename = `${templateName}_${sellerName}_batch_${batchNumber}_${dateStr}.csv`;
    
    console.log('📁 Generated filename:', filename);
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);

    // Snapshot: if this is a real (non-Testing) seller, upsert TemplateListing records
    // for that seller so Template Directory can show what was listed for them.
    // Fire-and-forget — any failure must not affect the already-sent CSV response.
    try {
      const isTestingSeller = seller?.user?.username?.toLowerCase() === 'growmentality';
      if (sellerId && !isTestingSeller) {
        const upsertOps = listings.map(listing => ({
          updateOne: {
            filter: { templateId, sellerId, customLabel: listing.customLabel },
            update: {
              $set: {
                templateId,
                sellerId,
                action: listing.action || 'Add',
                customLabel: listing.customLabel,
                categoryId: listing.categoryId,
                categoryName: listing.categoryName,
                title: listing.title,
                relationship: listing.relationship,
                relationshipDetails: listing.relationshipDetails,
                scheduleTime: listing.scheduleTime,
                upc: listing.upc,
                epid: listing.epid,
                startPrice: listing.startPrice,
                quantity: listing.quantity,
                itemPhotoUrl: listing.itemPhotoUrl,
                videoId: listing.videoId,
                conditionId: listing.conditionId,
                description: listing.description,
                format: listing.format,
                duration: listing.duration,
                buyItNowPrice: listing.buyItNowPrice,
                bestOfferEnabled: listing.bestOfferEnabled,
                bestOfferAutoAcceptPrice: listing.bestOfferAutoAcceptPrice,
                minimumBestOfferPrice: listing.minimumBestOfferPrice,
                immediatePayRequired: listing.immediatePayRequired,
                location: listing.location,
                shippingService1Option: listing.shippingService1Option,
                shippingService1Cost: listing.shippingService1Cost,
                shippingService1Priority: listing.shippingService1Priority,
                shippingService2Option: listing.shippingService2Option,
                shippingService2Cost: listing.shippingService2Cost,
                shippingService2Priority: listing.shippingService2Priority,
                maxDispatchTime: listing.maxDispatchTime,
                returnsAcceptedOption: listing.returnsAcceptedOption,
                returnsWithinOption: listing.returnsWithinOption,
                refundOption: listing.refundOption,
                returnShippingCostPaidBy: listing.returnShippingCostPaidBy,
                shippingProfileName: listing.shippingProfileName,
                returnProfileName: listing.returnProfileName,
                paymentProfileName: listing.paymentProfileName,
                customFields: listing.customFields,
                amazonLink: listing.amazonLink,
                _asinReference: listing._asinReference,
                status: 'active',
                updatedAt: new Date(),
              },
              $setOnInsert: { createdAt: new Date(), downloadBatchId: null, pendingRedownload: false },
            },
            upsert: true,
          },
        }));
        await TemplateListing.bulkWrite(upsertOps, { ordered: false });
        console.log(`📋 Snapshot: upserted ${upsertOps.length} listing(s) for seller ${seller?.user?.username}`);
      }
    } catch (snapshotErr) {
      console.error('Snapshot upsert failed (non-fatal):', snapshotErr.message);
    }
    
  } catch (error) {
    console.error('Error exporting CSV:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export CSV using inline listing data (no DB read for field values — used by Proof Read → List Directly)
// Edits made in the review modal are carried into the CSV without being persisted to the database.
router.post('/export-csv-direct/:templateId', requireAuth, async (req, res) => {
  try {
    const { templateId } = req.params;
    const { sellerId, listings } = req.body;

    if (!listings || !Array.isArray(listings) || listings.length === 0) {
      return res.status(400).json({ error: 'listings array is required' });
    }

    const [template, seller] = await Promise.all([
      getEffectiveTemplate(templateId, sellerId),
      sellerId ? Seller.findById(sellerId).populate('user', 'username email') : null,
    ]);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Generate batch ID and get next batch number
    const crypto = await import('crypto');
    const batchId = crypto.randomUUID();

    const latestBatch = await TemplateListing.findOne({
      templateId,
      sellerId: sellerId || { $exists: true },
      downloadBatchNumber: { $ne: null }
    }).sort({ downloadBatchNumber: -1 });

    const batchNumber = (latestBatch?.downloadBatchNumber || 0) + 1;

    // Build CSV — identical structure to GET /export-csv
    const actionField = template.customActionField || '*Action(SiteID=US|Country=US|Currency=USD|Version=1193)';

    // Mark the underlying TemplateListing docs as downloaded (batch tracking only — field values are NOT updated)
    const existingIds = listings.map(l => l._existingListingId).filter(Boolean);
    if (existingIds.length > 0) {
      await TemplateListing.updateMany(
        { _id: { $in: existingIds } },
        {
          downloadBatchId: batchId,
          downloadedAt: new Date(),
          downloadBatchNumber: batchNumber,
          downloadedActionField: actionField,
          pendingRedownload: false
        }
      );
    }

    const coreHeaders = [
      actionField, 'Custom label (SKU)', 'Category ID', 'Category name', 'Title',
      'Relationship', 'Relationship details', 'Schedule Time', 'P:UPC', 'P:EPID',
      'Start price', 'Quantity', 'Item photo URL', 'VideoID', 'Condition ID',
      'Description', 'Format', 'Duration', 'Buy It Now price', 'Best Offer Enabled',
      'Best Offer Auto Accept Price', 'Minimum Best Offer Price', 'Immediate pay required',
      'Location', 'Shipping service 1 option', 'Shipping service 1 cost',
      'Shipping service 1 priority', 'Shipping service 2 option', 'Shipping service 2 cost',
      'Shipping service 2 priority', 'Max dispatch time', 'Returns accepted option',
      'Returns within option', 'Refund option', 'Return shipping cost paid by',
      'Shipping profile name', 'Return profile name', 'Payment profile name'
    ];

    const orderedUniqueCustomColumns = getOrderedUniqueCustomColumns(template.customColumns);
    const customHeaders = orderedUniqueCustomColumns.map(col => col.name);

    const allHeaders = [...coreHeaders, ...customHeaders];
    const columnCount = allHeaders.length;

    const infoLine1 = ['#INFO', `Created=${Date.now()}`, '', '', '', '',
      ' Indicates missing required fields', '', '', '', '',
      ' Indicates missing field that will be required soon',
      ...new Array(columnCount - 12).fill('')];

    const infoLine2 = ['#INFO', 'Version=1.0', '',
      'Template=fx_category_template_EBAY_US', '', '',
      ' Indicates missing recommended field', '', '', '', '',
      ' Indicates field does not apply to this item/category',
      ...new Array(columnCount - 12).fill('')];

    const infoLine3 = new Array(columnCount).fill('');
    infoLine3[0] = '#INFO';

    const dataRows = listings.map(listing => {
      let categoryName = listing.categoryName || '';
      if (categoryName && !categoryName.startsWith('/')) {
        categoryName = '/' + categoryName;
      }

      // customFields may be a plain object (from frontend) or a Map (from DB doc)
      const getCustomField = (name) => {
        if (!listing.customFields) return '';
        if (typeof listing.customFields.get === 'function') return listing.customFields.get(name) || '';
        return listing.customFields[name] || '';
      };

      const coreValues = [
        listing.action || 'Add', listing.customLabel || '', listing.categoryId || '',
        categoryName, listing.title || '', listing.relationship || '',
        listing.relationshipDetails || '', listing.scheduleTime || '',
        listing.upc || '', listing.epid || '', listing.startPrice || '',
        listing.quantity || '', listing.itemPhotoUrl || '', listing.videoId || '',
        listing.conditionId || '1000-New', listing.description || '',
        listing.format || 'FixedPrice', listing.duration || 'GTC',
        listing.buyItNowPrice || '', listing.bestOfferEnabled || '',
        listing.bestOfferAutoAcceptPrice || '', listing.minimumBestOfferPrice || '',
        listing.immediatePayRequired || '', listing.location || 'UnitedStates',
        listing.shippingService1Option || '', listing.shippingService1Cost || '',
        listing.shippingService1Priority || '', listing.shippingService2Option || '',
        listing.shippingService2Cost || '', listing.shippingService2Priority || '',
        listing.maxDispatchTime || '', listing.returnsAcceptedOption || '',
        listing.returnsWithinOption || '', listing.refundOption || '',
        listing.returnShippingCostPaidBy || '', listing.shippingProfileName || '',
        listing.returnProfileName || '', listing.paymentProfileName || ''
      ];

      const customValues = orderedUniqueCustomColumns
        .map(col => sanitizeCustomCsvValueByHeader(col.name, getCustomField(col.name)));

      return [...coreValues, ...customValues];
    });

    const allRows = [infoLine1, infoLine2, infoLine3, allHeaders, ...dataRows];

    const csvContent = allRows.map(row =>
      row.map(cell => {
        const value = String(cell || '');
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',')
    ).join('\n');

    const dateStr = new Date().toISOString().split('T')[0];
    const sellerName = seller?.user?.username || seller?.user?.email || 'seller';
    const templateName = template.name.replace(/\s+/g, '_');
    const filename = `${templateName}_${sellerName}_batch_${batchNumber}_${dateStr}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);

    // Snapshot: upsert TemplateListing records for the chosen real seller.
    // Uses inline-edited field values (what actually went into the CSV).
    try {
      const isTestingSeller = seller?.user?.username?.toLowerCase() === 'growmentality';
      if (sellerId && !isTestingSeller) {
        const upsertOps = listings.map(listing => {
          const getField = (name) => {
            if (!listing.customFields) return undefined;
            if (typeof listing.customFields.get === 'function') return listing.customFields.get(name);
            return listing.customFields[name];
          };
          // Rebuild customFields as a plain object for storage
          const customFieldsObj = {};
          if (listing.customFields) {
            if (typeof listing.customFields.get === 'function') {
              for (const [k, v] of listing.customFields) customFieldsObj[k] = v;
            } else {
              Object.assign(customFieldsObj, listing.customFields);
            }
          }
          return {
            updateOne: {
              filter: { templateId, sellerId, customLabel: listing.customLabel },
              update: {
                $set: {
                  templateId,
                  sellerId,
                  action: listing.action || 'Add',
                  customLabel: listing.customLabel,
                  categoryId: listing.categoryId,
                  categoryName: listing.categoryName,
                  title: listing.title,
                  relationship: listing.relationship,
                  relationshipDetails: listing.relationshipDetails,
                  scheduleTime: listing.scheduleTime,
                  upc: listing.upc,
                  epid: listing.epid,
                  startPrice: listing.startPrice,
                  quantity: listing.quantity,
                  itemPhotoUrl: listing.itemPhotoUrl,
                  videoId: listing.videoId,
                  conditionId: listing.conditionId,
                  description: listing.description,
                  format: listing.format,
                  duration: listing.duration,
                  buyItNowPrice: listing.buyItNowPrice,
                  bestOfferEnabled: listing.bestOfferEnabled,
                  bestOfferAutoAcceptPrice: listing.bestOfferAutoAcceptPrice,
                  minimumBestOfferPrice: listing.minimumBestOfferPrice,
                  immediatePayRequired: listing.immediatePayRequired,
                  location: listing.location,
                  shippingService1Option: listing.shippingService1Option,
                  shippingService1Cost: listing.shippingService1Cost,
                  shippingService1Priority: listing.shippingService1Priority,
                  shippingService2Option: listing.shippingService2Option,
                  shippingService2Cost: listing.shippingService2Cost,
                  shippingService2Priority: listing.shippingService2Priority,
                  maxDispatchTime: listing.maxDispatchTime,
                  returnsAcceptedOption: listing.returnsAcceptedOption,
                  returnsWithinOption: listing.returnsWithinOption,
                  refundOption: listing.refundOption,
                  returnShippingCostPaidBy: listing.returnShippingCostPaidBy,
                  shippingProfileName: listing.shippingProfileName,
                  returnProfileName: listing.returnProfileName,
                  paymentProfileName: listing.paymentProfileName,
                  customFields: customFieldsObj,
                  amazonLink: listing.amazonLink,
                  _asinReference: listing._asinReference,
                  status: 'active',
                  updatedAt: new Date(),
                },
                $setOnInsert: { createdAt: new Date(), downloadBatchId: null, pendingRedownload: false },
              },
              upsert: true,
            },
          };
        });
        await TemplateListing.bulkWrite(upsertOps, { ordered: false });
        console.log(`📋 Snapshot (direct): upserted ${upsertOps.length} listing(s) for seller ${seller?.user?.username}`);
      }
    } catch (snapshotErr) {
      console.error('Snapshot upsert (direct) failed (non-fatal):', snapshotErr.message);
    }

  } catch (error) {
    console.error('Error exporting CSV (direct):', error);
    res.status(500).json({ error: error.message });
  }
});

// Get download history for a template/seller
router.get('/download-history/:templateId', requireAuth, async (req, res) => {
  try {
    const { templateId } = req.params;
    const { sellerId } = req.query;
    
    console.log('📜 Download history request - Template:', templateId, 'Seller:', sellerId);
    
    // Convert string IDs to ObjectIds for aggregation
    const mongoose = await import('mongoose');
    const filter = {
      templateId: new mongoose.default.Types.ObjectId(templateId),
      downloadBatchId: { $ne: null }
    };
    
    if (sellerId) {
      filter.sellerId = new mongoose.default.Types.ObjectId(sellerId);
    }
    
    console.log('🔍 Filter:', JSON.stringify(filter));
    
    // First, let's check ALL listings for this template/seller
    const allListings = await TemplateListing.find({
      templateId,
      sellerId: sellerId || { $exists: true }
    }).select('downloadBatchId downloadBatchNumber downloadedAt customLabel');
    
    console.log('📋 Total listings found:', allListings.length);
    console.log('📊 All listings batch info:', allListings.map(l => ({
      sku: l.customLabel,
      batchId: l.downloadBatchId,
      batchNumber: l.downloadBatchNumber,
      downloadedAt: l.downloadedAt
    })));
    
    // Get unique batches with their metadata
    const batches = await TemplateListing.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$downloadBatchId',
          batchNumber: { $first: '$downloadBatchNumber' },
          downloadedAt: { $first: '$downloadedAt' },
          listingCount: { $sum: 1 }
        }
      },
      { $sort: { batchNumber: 1 } }
    ]);
    
    console.log('📊 Aggregation result:', batches);
    
    // Format response
    const history = batches.map(batch => ({
      batchId: batch._id,
      batchNumber: batch.batchNumber,
      downloadedAt: batch.downloadedAt,
      listingCount: batch.listingCount
    }));
    
    console.log('✅ Sending history:', history);
    
    res.json(history);
  } catch (error) {
    console.error('Error fetching download history:', error);
    res.status(500).json({ error: error.message });
  }
});

// Re-download a specific batch
router.get('/re-download-batch/:templateId/:batchId', requireAuth, async (req, res) => {
  try {
    const { templateId, batchId } = req.params;
    const { sellerId } = req.query;
    
    // Build filter for specific batch
    const filter = { 
      templateId,
      downloadBatchId: batchId
    };
    if (sellerId) {
      filter.sellerId = sellerId;
    }
    
    // Fetch effective template (includes seller overrides), seller, and batch listings
    const [template, seller, listings] = await Promise.all([
      getEffectiveTemplate(templateId, sellerId),
      sellerId ? Seller.findById(sellerId).populate('user', 'username email') : null,
      TemplateListing.find(filter).sort({ createdAt: -1 })
    ]);
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    if (listings.length === 0) {
      return res.status(404).json({ error: 'Batch not found' });
    }
    
    const batchNumber = listings[0].downloadBatchNumber;
    
    // Use the action field that was saved at download time; fall back to current template value
    const actionField = listings[0].downloadedActionField || template.customActionField || '*Action(SiteID=US|Country=US|Currency=USD|Version=1193)';
    console.log('📝 Using Action field:', actionField);
    
    // Build core headers (38 columns)
    const coreHeaders = [
      actionField,
      'Custom label (SKU)',
      'Category ID',
      'Category name',
      'Title',
      'Relationship',
      'Relationship details',
      'Schedule Time',
      'P:UPC',
      'P:EPID',
      'Start price',
      'Quantity',
      'Item photo URL',
      'VideoID',
      'Condition ID',
      'Description',
      'Format',
      'Duration',
      'Buy It Now price',
      'Best offer enabled',
      'Best offer: Auto accept price',
      'Minimum best offer price',
      'Immediate pay required',
      'Location',
      'Shipping service 1: option',
      'Shipping service 1: cost',
      'Shipping service 1: priority',
      'Shipping service 2: option',
      'Shipping service 2: cost',
      'Shipping service 2: priority',
      'Max dispatch time',
      'Returns accepted option',
      'Returns within option',
      'Refund option',
      'Return shipping cost paid by',
      'Shipping profile name',
      'Return profile name',
      'Payment profile name'
    ];
    
    // Add custom column headers
    const orderedUniqueCustomColumns = getOrderedUniqueCustomColumns(template.customColumns);
    const customHeaders = orderedUniqueCustomColumns.map(col => col.name);
    
    const allHeaders = [...coreHeaders, ...customHeaders];
    const columnCount = allHeaders.length;
    
    // Generate #INFO lines (must match column count exactly)
    const emptyRow = new Array(columnCount).fill('');
    
    // INFO Line 1: Created timestamp + required field indicator
    const infoLine1 = ['#INFO', `Created=${Date.now()}`, '', '', '', '', 
                       ' Indicates missing required fields', '', '', '', '',
                       ' Indicates missing field that will be required soon',
                       ...new Array(columnCount - 12).fill('')];
    
    // INFO Line 2: Version + recommended field indicator  
    const infoLine2 = ['#INFO', 'Version=1.0', '', 
                       'Template=fx_category_template_EBAY_US', '', '',
                       ' Indicates missing recommended field', '', '', '', '',
                       ' Indicates field does not apply to this item/category',
                       ...new Array(columnCount - 12).fill('')];
    
    // INFO Line 3: All empty commas
    const infoLine3 = new Array(columnCount).fill('')
    infoLine3[0] = '#INFO';
    
    // Map listings to CSV rows
    const dataRows = listings.map(listing => {
      // Add leading slash to category name if not present
      let categoryName = listing.categoryName || '';
      if (categoryName && !categoryName.startsWith('/')) {
        categoryName = '/' + categoryName;
      }
      
      const coreValues = [
        listing.action || 'Add',
        listing.customLabel || '',
        listing.categoryId || '',
        categoryName,
        listing.title || '',
        listing.relationship || '',
        listing.relationshipDetails || '',
        listing.scheduleTime || '',
        listing.upc || '',
        listing.epid || '',
        listing.startPrice || '',
        listing.quantity || '',
        listing.itemPhotoUrl || '',
        listing.videoId || '',
        listing.conditionId || '1000-New',
        listing.description || '',
        listing.format || 'FixedPrice',
        listing.duration || 'GTC',
        listing.buyItNowPrice || '',
        listing.bestOfferEnabled || '',
        listing.bestOfferAutoAcceptPrice || '',
        listing.minimumBestOfferPrice || '',
        listing.immediatePayRequired || '',
        listing.location || 'UnitedStates',
        listing.shippingService1Option || '',
        listing.shippingService1Cost || '',
        listing.shippingService1Priority || '',
        listing.shippingService2Option || '',
        listing.shippingService2Cost || '',
        listing.shippingService2Priority || '',
        listing.maxDispatchTime || '',
        listing.returnsAcceptedOption || '',
        listing.returnsWithinOption || '',
        listing.refundOption || '',
        listing.returnShippingCostPaidBy || '',
        listing.shippingProfileName || '',
        listing.returnProfileName || '',
        listing.paymentProfileName || ''
      ];
      
      // Get custom field values in order
      const customValues = orderedUniqueCustomColumns
        .map(col => sanitizeCustomCsvValueByHeader(col.name, listing.customFields.get(col.name) || ''));
      
      return [...coreValues, ...customValues];
    });
    
    // Combine all rows
    const allRows = [infoLine1, infoLine2, infoLine3, allHeaders, ...dataRows];
    
    // Convert to CSV string with proper escaping
    const csvContent = allRows.map(row => 
      row.map(cell => {
        const value = String(cell || '');
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',')
    ).join('\n');
    
    // Send as downloadable file with template, seller, batch number and date
    const dateStr = new Date().toISOString().split('T')[0];
    const sellerName = seller?.user?.username || seller?.user?.email || 'seller';
    const templateName = template.name.replace(/\s+/g, '_');
    const filename = `${templateName}_${sellerName}_batch_${batchNumber}_${dateStr}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
    
  } catch (error) {
    console.error('Error re-downloading batch:', error);
    res.status(500).json({ error: error.message });
  }
});

// Search for inactive listings by SKU
router.post('/search-inactive-skus', requireAuth, async (req, res) => {
  try {
    const { templateId, sellerId, skus } = req.body;
    
    if (!templateId) {
      return res.status(400).json({ error: 'Template ID is required' });
    }
    
    if (!sellerId) {
      return res.status(400).json({ error: 'Seller ID is required' });
    }
    
    if (!skus || !Array.isArray(skus) || skus.length === 0) {
      return res.status(400).json({ error: 'SKUs array is required' });
    }
    
    // Find inactive listings
    const inactiveListings = await TemplateListing.find({
      templateId,
      sellerId,
      customLabel: { $in: skus },
      status: 'inactive'
    }).select('+_asinReference');
    
    // Find already active listings
    const activeListings = await TemplateListing.find({
      templateId,
      sellerId,
      customLabel: { $in: skus },
      status: 'active'
    }).select('customLabel');
    
    const foundSKUs = new Set(inactiveListings.map(l => l.customLabel));
    const activeSKUs = activeListings.map(l => l.customLabel);
    const notFoundSKUs = skus.filter(sku => !foundSKUs.has(sku) && !activeSKUs.includes(sku));
    
    console.log(`🔍 Search inactive SKUs: ${inactiveListings.length} found, ${activeSKUs.length} already active, ${notFoundSKUs.length} not found`);
    
    res.json({
      found: inactiveListings,
      notFound: notFoundSKUs,
      alreadyActive: activeSKUs
    });
  } catch (error) {
    console.error('Error searching inactive SKUs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk reactivate inactive listings
router.post('/bulk-reactivate', requireAuth, async (req, res) => {
  try {
    const { listingIds } = req.body;
    
    if (!listingIds || !Array.isArray(listingIds) || listingIds.length === 0) {
      return res.status(400).json({ error: 'listingIds array is required' });
    }
    
    // Update status to active
    const result = await TemplateListing.updateMany(
      {
        _id: { $in: listingIds },
        status: 'inactive'
      },
      {
        $set: {
          status: 'active',
          updatedAt: Date.now()
        }
      }
    );
    
    // Get updated listings for response
    const reactivatedListings = await TemplateListing.find({
      _id: { $in: listingIds },
      status: 'active'
    }).select('customLabel title _asinReference');
    
    console.log(`✅ Reactivated ${result.modifiedCount} listings`);
    
    res.json({
      success: true,
      reactivated: result.modifiedCount,
      details: reactivatedListings
    });
  } catch (error) {
    console.error('Error reactivating listings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk deactivate active listings
router.post('/bulk-deactivate', requireAuth, async (req, res) => {
  try {
    const { templateId, sellerId, skus } = req.body;
    
    if (!templateId) {
      return res.status(400).json({ error: 'Template ID is required' });
    }
    
    if (!sellerId) {
      return res.status(400).json({ error: 'Seller ID is required' });
    }
    
    if (!skus || !Array.isArray(skus) || skus.length === 0) {
      return res.status(400).json({ error: 'SKUs array is required' });
    }
    
    // Find active listings
    const activeListings = await TemplateListing.find({
      templateId,
      sellerId,
      customLabel: { $in: skus },
      status: 'active'
    }).select('customLabel title _asinReference');
    
    // Find already inactive
    const inactiveListings = await TemplateListing.find({
      templateId,
      sellerId,
      customLabel: { $in: skus },
      status: 'inactive'
    }).select('customLabel');
    
    const foundSKUs = new Set(activeListings.map(l => l.customLabel));
    const alreadyInactiveSKUs = inactiveListings.map(l => l.customLabel);
    const notFoundSKUs = skus.filter(sku => 
      !foundSKUs.has(sku) && !alreadyInactiveSKUs.includes(sku)
    );
    
    // Deactivate
    const result = await TemplateListing.updateMany(
      {
        templateId,
        sellerId,
        customLabel: { $in: Array.from(foundSKUs) },
        status: 'active'
      },
      {
        $set: {
          status: 'inactive',
          updatedAt: Date.now()
        }
      }
    );
    
    console.log(`⏸️ Deactivated ${result.modifiedCount} listings`);
    
    res.json({
      success: true,
      summary: {
        total: skus.length,
        deactivated: result.modifiedCount,
        notFound: notFoundSKUs.length,
        alreadyInactive: alreadyInactiveSKUs.length
      },
      details: {
        deactivated: activeListings,
        notFound: notFoundSKUs,
        alreadyInactive: alreadyInactiveSKUs
      }
    });
  } catch (error) {
    console.error('Error deactivating listings:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/seller/:sellerId/template-listings/api-usage-stats
 * Get API usage statistics (ScraperAPI, PAAPI, Gemini)
 */
router.get('/api/seller/:sellerId/template-listings/api-usage-stats', requireAuth, async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { service, year, month } = req.query;
    
    // Build query
    const query = {};
    if (service) query.service = service;
    if (year) query.year = parseInt(year);
    if (month) query.month = parseInt(month);
    
    const stats = await getUsageStats(query);
    
    res.json({
      success: true,
      stats,
      message: `Retrieved usage statistics${service ? ` for ${service}` : ''}`
    });
  } catch (error) {
    console.error('[API Usage Stats] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/seller/:sellerId/template-listings/api-usage-field-stats
 * Get field extraction statistics for a specific service
 */
router.get('/api/seller/:sellerId/template-listings/api-usage-field-stats', requireAuth, async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { service, year, month } = req.query;
    
    if (!service) {
      return res.status(400).json({
        success: false,
        message: 'Service parameter is required'
      });
    }
    
    const query = { service };
    if (year) query.year = parseInt(year);
    if (month) query.month = parseInt(month);
    
    const stats = await getFieldExtractionStats(query);
    
    res.json({
      success: true,
      stats,
      message: `Retrieved field extraction statistics for ${service}`
    });
  } catch (error) {
    console.error('[API Field Stats] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/seller/:sellerId/template-listings/api-usage-errors
 * Get recent API errors for debugging
 */
router.get('/api/seller/:sellerId/template-listings/api-usage-errors', requireAuth, async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { service, limit = 50 } = req.query;
    
    if (!service) {
      return res.status(400).json({
        success: false,
        message: 'Service parameter is required'
      });
    }
    
    const errors = await getRecentErrors(service, parseInt(limit));
    
    res.json({
      success: true,
      errors,
      count: errors.length,
      message: `Retrieved ${errors.length} recent errors for ${service}`
    });
  } catch (error) {
    console.error('[API Errors] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/seller/:sellerId/template-listings/api-quota-status
 * Check quota status for a service
 */
router.get('/api/seller/:sellerId/template-listings/api-quota-status', requireAuth, async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { service, quota = 5000 } = req.query;
    
    if (!service) {
      return res.status(400).json({
        success: false,
        message: 'Service parameter is required'
      });
    }
    
    const status = await checkQuotaStatus(service, parseInt(quota));
    
    res.json({
      success: true,
      quotaStatus: status,
      message: `Quota status: ${status.status.toUpperCase()} - ${status.percentUsed}% used`
    });
  } catch (error) {
    console.error('[Quota Status] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /template-listings/cache-stats
 * Get ASIN cache statistics
 */
router.get('/cache-stats', requireAuth, async (req, res) => {
  try {
    const stats = getAsinCacheStats();
    
    res.json({
      success: true,
      cache: stats,
      message: `Cache ${stats.enabled ? 'enabled' : 'disabled'} - ${stats.keys} ASINs cached, ${stats.hitRate}% hit rate`
    });
  } catch (error) {
    console.error('[Cache Stats] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /template-listings/cache-clear
 * Clear ASIN cache
 */
router.post('/cache-clear', requireAuth, async (req, res) => {
  try {
    clearAsinCache();
    
    res.json({
      success: true,
      message: 'ASIN cache cleared successfully'
    });
  } catch (error) {
    console.error('[Cache Clear] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /template-listings/cache-invalidate/:asin
 * Invalidate specific ASIN from cache
 */
router.post('/cache-invalidate/:asin', requireAuth, async (req, res) => {
  try {
    const { asin } = req.params;
    const invalidated = invalidateAsinCache(asin);
    
    res.json({
      success: true,
      invalidated,
      message: invalidated ? `ASIN ${asin} removed from cache` : `ASIN ${asin} not found in cache`
    });
  } catch (error) {
    console.error('[Cache Invalidate] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;

