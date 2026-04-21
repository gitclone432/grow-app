import { Router } from 'express';
import axios from 'axios';
import qs from 'qs';
import mongoose from 'mongoose';
import EbayVehicleModel from '../models/EbayVehicleModel.js';
import EbayDeviceModel from '../models/EbayDeviceModel.js';
import Seller from '../models/Seller.js';
import Range from '../models/Range.js';
import Assignment from '../models/Assignment.js';
import ListingCompletion from '../models/ListingCompletion.js';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';

const router = Router();

// ============================================
// EBAY OAUTH SCOPES - Single source of truth
// ============================================
const EBAY_OAUTH_SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
  'https://api.ebay.com/oauth/api_scope/sell.payment.dispute',
  'https://api.ebay.com/oauth/api_scope/sell.finances',
  'https://api.ebay.com/oauth/api_scope/sell.account',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/commerce.identity.readonly'
].join(' ');

// ============================================
// CACHING SYSTEM FOR VEHICLE MODELS
// ============================================
// This avoids fetching 8702 documents from MongoDB on every request
// and pre-computes normalized strings for faster matching

let vehicleModelsCache = null;
let cacheLastUpdated = null;
const CACHE_TTL = 240 * 60 * 60 * 1000; // 10 days cache TTL

// Helper: Normalize text (remove hyphens, spaces, lowercase)
const normalizeText = (text) => {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[-_\s]+/g, '') // Remove hyphens, underscores, and ALL spaces
    .trim();
};

// ============================================
// SIMPLE FULL-NAME MATCHING (for both Vehicles and Devices)
// ============================================
// Only matches FULL names from cache and existing ranges
// NO model-only matching - avoids false positives like "Truck" → "Chevrolet Truck"
// Keeps longer-match preference to handle F-250 vs F-2 correctly
function findBestMatch(lineNormalized, lineLower, models, matchType = 'vehicles') {
  let bestMatch = null;
  let bestMatchPos = Infinity;
  let bestMatchLength = 0;
  
  for (const m of models) {
    let matchPos = -1;
    let matchLength = 0;
    
    // Strategy 1: Full name normalized match (e.g., "fordf250", "teslamodely")
    // Removes hyphens/spaces so "Ford F-250" matches "fordf250" in "...fordf250..."
    if (m.fullNameNormalized && m.fullNameNormalized.length > 3 && lineNormalized.includes(m.fullNameNormalized)) {
      matchPos = lineNormalized.indexOf(m.fullNameNormalized);
      matchLength = m.fullNameNormalized.length;
    }
    // Strategy 2: Full name lowercase match (e.g., "ford f-250", "tesla model y")
    // Keeps original spacing/hyphens for exact phrase matching
    else if (m.fullNameLower && m.fullNameLower.length > 4 && lineLower.includes(m.fullNameLower)) {
      matchPos = lineLower.indexOf(m.fullNameLower);
      matchLength = m.fullNameLower.length;
    }
    // NO model-only matching - this caused false positives like:
    // - "Truck" → "Chevrolet Truck"
    // - "Touch" → "UMi Touch"
    // - "Forte" → "Kia Forte"
    
    // Track best match: prefer earlier position, then LONGER match
    // This ensures "Ford F-250" (len 9) beats "Ford F-2" (len 7) when both match
    if (matchPos !== -1) {
      if (matchPos < bestMatchPos || (matchPos === bestMatchPos && matchLength > bestMatchLength)) {
        bestMatch = m;
        bestMatchPos = matchPos;
        bestMatchLength = matchLength;
      }
    }
  }
  
  return bestMatch;
}

// Load and cache vehicle models with pre-computed normalized strings
async function getVehicleModelsCache(forceRefresh = false) {
  const now = Date.now();
  
  // Return cached data if valid
  if (!forceRefresh && vehicleModelsCache && cacheLastUpdated && (now - cacheLastUpdated < CACHE_TTL)) {
    return vehicleModelsCache;
  }
  
  console.log('[Cache] Loading vehicle models into cache...');
  const startTime = Date.now();
  
  // Fetch all models from database
  const models = await EbayVehicleModel.find().select('fullName make model').lean();
  
  // Pre-compute normalized strings for each model
  vehicleModelsCache = models.map(m => ({
    fullName: m.fullName,
    make: m.make,
    model: m.model,
    makeLower: m.make.toLowerCase(),
    modelLower: m.model.toLowerCase(),
    makeNormalized: normalizeText(m.make),
    modelNormalized: normalizeText(m.model),
    fullNameLower: `${m.make.toLowerCase()} ${m.model.toLowerCase()}`,
    fullNameNormalized: `${normalizeText(m.make)} ${normalizeText(m.model)}`
  }));
  
  cacheLastUpdated = now;
  console.log(`[Cache] Loaded ${vehicleModelsCache.length} models in ${Date.now() - startTime}ms (TTL: 24 hours)`);
  
  return vehicleModelsCache;
}

// Invalidate cache (call this after sync)
function invalidateVehicleModelsCache() {
  vehicleModelsCache = null;
  cacheLastUpdated = null;
  console.log('[Cache] Vehicle models cache invalidated');
}

// ============================================
// CACHING SYSTEM FOR DEVICE MODELS (Cell Phones & Tablets)
// ============================================

let deviceModelsCache = null;
let deviceCacheLastUpdated = null;

// Load and cache device models with pre-computed normalized strings
async function getDeviceModelsCache(forceRefresh = false) {
  const now = Date.now();
  
  // Return cached data if valid
  if (!forceRefresh && deviceModelsCache && deviceCacheLastUpdated && (now - deviceCacheLastUpdated < CACHE_TTL)) {
    return deviceModelsCache;
  }
  
  console.log('[Cache] Loading device models into cache...');
  const startTime = Date.now();
  
  // Fetch all device models from database
  const models = await EbayDeviceModel.find().select('fullName brand model deviceType').lean();
  
  // Pre-compute normalized strings for each model
  deviceModelsCache = models.map(m => ({
    fullName: m.fullName,
    brand: m.brand || '',
    model: m.model || '',
    deviceType: m.deviceType,
    fullNameLower: m.fullName.toLowerCase(),
    fullNameNormalized: normalizeText(m.fullName),
    brandLower: (m.brand || '').toLowerCase(),
    brandNormalized: normalizeText(m.brand || ''),
    modelLower: (m.model || '').toLowerCase(),
    modelNormalized: normalizeText(m.model || ''),
  }));
  
  deviceCacheLastUpdated = now;
  console.log(`[Cache] Loaded ${deviceModelsCache.length} device models in ${Date.now() - startTime}ms`);
  
  return deviceModelsCache;
}

// Invalidate device cache (call this after sync)
function invalidateDeviceModelsCache() {
  deviceModelsCache = null;
  deviceCacheLastUpdated = null;
  console.log('[Cache] Device models cache invalidated');
}

// ============================================

// Helper: Ensure Seller Token is Valid (Refreshes if < 2 mins left)
async function ensureValidToken(seller) {
  const now = Date.now();
  const fetchedAt = seller.ebayTokens.fetchedAt ? new Date(seller.ebayTokens.fetchedAt).getTime() : 0;
  const expiresInMs = (seller.ebayTokens.expires_in || 0) * 1000;
  const bufferTime = 2 * 60 * 1000; // 2 minutes buffer

  if (fetchedAt && (now - fetchedAt < expiresInMs - bufferTime)) {
    return seller.ebayTokens.access_token;
  }

  console.log(`[Token Refresh] Refreshing token for range analysis...`);
  
  const refreshRes = await axios.post(
    'https://api.ebay.com/identity/v1/oauth2/token',
    qs.stringify({
      grant_type: 'refresh_token',
      refresh_token: seller.ebayTokens.refresh_token,
      scope: EBAY_OAUTH_SCOPES // Using centralized scopes constant
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString('base64'),
      },
    }
  );

  seller.ebayTokens.access_token = refreshRes.data.access_token;
  seller.ebayTokens.expires_in = refreshRes.data.expires_in;
  seller.ebayTokens.fetchedAt = new Date();
  await seller.save();

  return refreshRes.data.access_token;
}

// Helper: Fetch compatibility values from eBay Taxonomy API
async function fetchEbayCompatibilityValues(token, propertyName, constraints = []) {
  let filterParam = '';
  if (constraints && constraints.length > 0) {
    const filters = constraints.map(c => {
      const cleanValue = String(c.value).replace(/,/g, '\\,');
      return `${c.name}:${cleanValue}`;
    });
    filterParam = filters.join(',');
  }

  const response = await axios.get(
    `https://api.ebay.com/commerce/taxonomy/v1/category_tree/100/get_compatibility_property_values`, 
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' 
      },
      params: {
        category_id: '33559', // eBay Motors Parts & Accessories
        compatibility_property: propertyName,
        filter: filterParam || undefined
      }
    }
  );

  const rawValues = response.data.compatibilityPropertyValues || [];
  return rawValues.map(item => item.value);
}

// GET /api/range-analysis/ebay-models
// Get all eBay vehicle models from our database
router.get('/ebay-models', requireAuth, async (req, res) => {
  try {
    const models = await EbayVehicleModel.find().sort({ fullName: 1 });
    res.json({ success: true, count: models.length, models });
  } catch (error) {
    console.error('Error fetching eBay models:', error);
    res.status(500).json({ error: 'Failed to fetch eBay models' });
  }
});

// POST /api/range-analysis/sync-ebay-models
// Fetch ALL vehicle models from eBay Taxonomy API and store in database
router.post('/sync-ebay-models', requireAuth, requirePageAccess('RangeAnalyzer'), async (req, res) => {
  try {
    // 1. Find a seller with valid eBay tokens
    const seller = await Seller.findOne({ 
      'ebayTokens.access_token': { $exists: true, $ne: null } 
    }).populate('user', 'username');
    
    if (!seller) {
      return res.status(400).json({ 
        error: 'No seller with eBay connection found. Please connect an eBay account first.' 
      });
    }

    console.log(`[Range Sync] Using seller: ${seller.user?.username || seller._id}`);

    // 2. Get valid token
    const token = await ensureValidToken(seller);

    // 3. Fetch ALL Makes from eBay
    console.log('[Range Sync] Fetching all Makes from eBay...');
    const makes = await fetchEbayCompatibilityValues(token, 'Make');
    console.log(`[Range Sync] Found ${makes.length} Makes`);

    if (makes.length === 0) {
      return res.status(400).json({ error: 'No makes returned from eBay API' });
    }

    let added = 0;
    let skipped = 0;
    let errors = 0;
    const totalMakes = makes.length;
    let processedMakes = 0;

    // 4. For each Make, fetch ALL Models
    for (const make of makes) {
      processedMakes++;
      try {
        console.log(`[Range Sync] [${processedMakes}/${totalMakes}] Fetching models for: ${make}`);
        
        const models = await fetchEbayCompatibilityValues(token, 'Model', [
          { name: 'Make', value: make }
        ]);
        
        console.log(`  -> Found ${models.length} models for ${make}`);

        // 5. Save each Make+Model to database
        for (const model of models) {
          const fullName = `${make} ${model}`;
          try {
            await EbayVehicleModel.findOneAndUpdate(
              { fullName },
              { 
                make: make, 
                model: model, 
                fullName,
                source: 'ebay-api'
              },
              { upsert: true, new: true }
            );
            added++;
          } catch (e) {
            if (e.code === 11000) {
              skipped++; // Duplicate
            } else {
              errors++;
              console.error(`  Error saving ${fullName}:`, e.message);
            }
          }
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (makeError) {
        errors++;
        console.error(`[Range Sync] Error fetching models for ${make}:`, makeError.message);
      }
    }

    const totalCount = await EbayVehicleModel.countDocuments();
    
    // Invalidate cache so new models are picked up
    invalidateVehicleModelsCache();
    
    console.log(`[Range Sync] Complete! Added: ${added}, Skipped: ${skipped}, Errors: ${errors}, Total: ${totalCount}`);

    res.json({ 
      success: true, 
      message: `Synced ${added} new models from ${totalMakes} makes. ${skipped} already existed. ${errors} errors. Total in database: ${totalCount}`,
      stats: {
        makesProcessed: totalMakes,
        modelsAdded: added,
        modelsSkipped: skipped,
        errors: errors,
        totalInDatabase: totalCount
      }
    });

  } catch (error) {
    console.error('Sync Error:', error);
    res.status(500).json({ error: error.message || 'Failed to sync eBay models' });
  }
});

// ============================================
// DEVICE MODELS SYNC (Cell Phones & Tablets)
// ============================================

// Helper: Get eBay Application Token (no user auth needed for Taxonomy API)
async function getEbayApplicationToken() {
  const response = await axios.post(
    'https://api.ebay.com/identity/v1/oauth2/token',
    qs.stringify({
      grant_type: 'client_credentials',
      scope: 'https://api.ebay.com/oauth/api_scope'
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString('base64'),
      },
    }
  );
  return response.data.access_token;
}

// Helper: Fetch item aspects for a category from eBay Taxonomy API
async function fetchCategoryAspects(token, categoryId) {
  const response = await axios.get(
    `https://api.ebay.com/commerce/taxonomy/v1/category_tree/0/get_item_aspects_for_category`,
    {
      params: { category_id: categoryId },
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );
  return response.data.aspects || [];
}

// Helper: Extract brand from model name
function extractBrandFromModel(modelName) {
  // Common phone/tablet brands to look for at the start
  const brands = [
    'Apple', 'Samsung', 'Google', 'Motorola', 'LG', 'OnePlus', 'Xiaomi', 
    'Huawei', 'Sony', 'Nokia', 'HTC', 'BlackBerry', 'ASUS', 'Lenovo',
    'Amazon', 'Microsoft', 'Acer', 'Alcatel', 'ZTE', 'BLU', 'TCL',
    'Oppo', 'Vivo', 'Realme', 'Honor', 'Nothing', 'Essential', 'Razer',
    'CAT', 'Kyocera', 'Palm', 'HP', 'Dell', 'Toshiba', 'Panasonic'
  ];
  
  const modelLower = modelName.toLowerCase();
  for (const brand of brands) {
    if (modelLower.startsWith(brand.toLowerCase())) {
      return brand;
    }
  }
  
  // Try to extract first word as brand if it's capitalized
  const firstWord = modelName.split(/[\s-]/)[0];
  if (firstWord && firstWord.length > 1 && firstWord[0] === firstWord[0].toUpperCase()) {
    return firstWord;
  }
  
  return '';
}

// GET /api/range-analysis/device-models
// Get all device models from our database
router.get('/device-models', requireAuth, async (req, res) => {
  try {
    const { deviceType } = req.query; // Optional filter: 'cellphone' or 'tablet'
    const filter = deviceType ? { deviceType } : {};
    const models = await EbayDeviceModel.find(filter).sort({ fullName: 1 });
    res.json({ success: true, count: models.length, models });
  } catch (error) {
    console.error('Error fetching device models:', error);
    res.status(500).json({ error: 'Failed to fetch device models' });
  }
});

// POST /api/range-analysis/sync-device-models
// Fetch cell phone and tablet models from eBay Taxonomy API and store in database
router.post('/sync-device-models', requireAuth, requirePageAccess('RangeAnalyzer'), async (req, res) => {
  try {
    console.log('[Device Sync] Starting sync for Cell Phones and Tablets...');
    
    // 1. Get Application Token (no seller needed!)
    const token = await getEbayApplicationToken();
    console.log('[Device Sync] Got eBay application token');

    // Categories to sync
    const categoriesToSync = [
      { id: '9355', name: 'Cell Phones & Smartphones', deviceType: 'cellphone' },
      { id: '171485', name: 'Tablets & eBook Readers', deviceType: 'tablet' },
    ];

    let totalAdded = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    const results = [];

    for (const category of categoriesToSync) {
      console.log(`\n[Device Sync] Processing: ${category.name} (ID: ${category.id})`);
      
      try {
        // 2. Fetch aspects for this category
        const aspects = await fetchCategoryAspects(token, category.id);
        console.log(`[Device Sync] Found ${aspects.length} aspects for ${category.name}`);

        // 3. Find the "Model" aspect
        const modelAspect = aspects.find(a => 
          a.localizedAspectName === 'Model' || 
          a.localizedAspectName === 'Compatible Model'
        );

        if (!modelAspect || !modelAspect.aspectValues || modelAspect.aspectValues.length === 0) {
          console.log(`[Device Sync] No model values found for ${category.name}`);
          results.push({ 
            category: category.name, 
            status: 'no_models', 
            count: 0 
          });
          continue;
        }

        const modelValues = modelAspect.aspectValues;
        console.log(`[Device Sync] Found ${modelValues.length} models for ${category.name}`);

        let added = 0;
        let skipped = 0;
        let errors = 0;

        // 4. Save each model to database
        for (const modelValue of modelValues) {
          let modelName = modelValue.localizedValue;
          
          // Skip if empty
          if (!modelName || modelName.trim().length === 0) continue;
          
          // Clean up "For " prefix (from accessories categories)
          if (modelName.startsWith('For ')) {
            modelName = modelName.substring(4);
          }
          
          // Extract brand if possible
          const brand = extractBrandFromModel(modelName);
          const model = brand ? modelName.substring(brand.length).trim() : modelName;

          try {
            await EbayDeviceModel.findOneAndUpdate(
              { fullName: modelName, ebayCategoryId: category.id },
              { 
                fullName: modelName,
                normalizedName: normalizeText(modelName),
                brand: brand,
                model: model,
                deviceType: category.deviceType,
                ebayCategoryId: category.id,
              },
              { upsert: true, new: true }
            );
            added++;
          } catch (e) {
            if (e.code === 11000) {
              skipped++; // Duplicate
            } else {
              errors++;
              console.error(`  Error saving ${modelName}:`, e.message);
            }
          }
        }

        console.log(`[Device Sync] ${category.name}: Added ${added}, Skipped ${skipped}, Errors ${errors}`);
        
        results.push({
          category: category.name,
          categoryId: category.id,
          deviceType: category.deviceType,
          status: 'success',
          modelsFound: modelValues.length,
          added,
          skipped,
          errors
        });

        totalAdded += added;
        totalSkipped += skipped;
        totalErrors += errors;

      } catch (categoryError) {
        console.error(`[Device Sync] Error processing ${category.name}:`, categoryError.message);
        results.push({
          category: category.name,
          status: 'error',
          error: categoryError.message
        });
        totalErrors++;
      }
    }

    // 5. Get final counts
    const totalPhones = await EbayDeviceModel.countDocuments({ deviceType: 'cellphone' });
    const totalTablets = await EbayDeviceModel.countDocuments({ deviceType: 'tablet' });
    const totalDevices = totalPhones + totalTablets;

    // 6. Invalidate cache so new models are picked up
    invalidateDeviceModelsCache();

    console.log(`\n[Device Sync] Complete! Added: ${totalAdded}, Skipped: ${totalSkipped}, Errors: ${totalErrors}`);
    console.log(`[Device Sync] Total in database: ${totalPhones} phones + ${totalTablets} tablets = ${totalDevices} devices`);

    res.json({
      success: true,
      message: `Synced ${totalAdded} new device models. ${totalSkipped} already existed. ${totalErrors} errors.`,
      stats: {
        added: totalAdded,
        skipped: totalSkipped,
        errors: totalErrors,
        totalPhones,
        totalTablets,
        totalDevices
      },
      results
    });

  } catch (error) {
    console.error('Device Sync Error:', error);
    res.status(500).json({ error: error.message || 'Failed to sync device models' });
  }
});

// POST /api/range-analysis/analyze
// Analyze text against eBay models database AND existing Ranges - returns FIRST model per line only
// Uses CACHED models for faster performance
// Supports both vehicle models and device models (phones/tablets)
// If categoryId is provided, also searches existing Ranges for that category
router.post('/analyze', requireAuth, requirePageAccess('RangeAnalyzer', ['superadmin', 'listingadmin', 'lister', 'advancelister', 'trainee']), async (req, res) => {
  try {
    const startTime = Date.now();
    const { textToAnalyze, searchType, categoryId } = req.body;
    // searchType: 'vehicles' (default), 'devices' (phones+tablets), 'cellphones', 'tablets'
    // categoryId: optional - if provided, also search existing Ranges for this category

    if (!textToAnalyze) {
      return res.status(400).json({ error: 'No text provided for analysis.' });
    }

    // Determine which models to search
    let models = [];
    let modelType = searchType || 'vehicles';
    
    if (modelType === 'devices' || modelType === 'cellphones' || modelType === 'tablets') {
      // Use device models cache
      let allDeviceModels = await getDeviceModelsCache();
      
      // Filter by device type if specified
      if (modelType === 'cellphones') {
        models = allDeviceModels.filter(m => m.deviceType === 'cellphone');
      } else if (modelType === 'tablets') {
        models = allDeviceModels.filter(m => m.deviceType === 'tablet');
      } else {
        models = allDeviceModels; // Both phones and tablets
      }
    } else {
      // Default: Use vehicle models cache
      models = await getVehicleModelsCache();
      modelType = 'vehicles';
    }
    
    // ALSO search existing Ranges for the category (if provided)
    // This allows matching against manually added ranges that may not be in eBay's database
    let existingRanges = [];
    if (categoryId) {
      try {
        const categoryObjectId = typeof categoryId === 'string' 
          ? new mongoose.Types.ObjectId(categoryId) 
          : categoryId;
        
        const ranges = await Range.find({ category: categoryObjectId }).select('name').lean();
        existingRanges = ranges.map(r => ({
          fullName: r.name,
          fullNameLower: r.name.toLowerCase(),
          fullNameNormalized: normalizeText(r.name),
          isExistingRange: true, // Flag to identify this came from Ranges collection
          // For device matching compatibility
          brandLower: '',
          brandNormalized: '',
          modelLower: r.name.toLowerCase(),
          modelNormalized: normalizeText(r.name),
          // For vehicle matching compatibility
          makeLower: '',
          makeNormalized: '',
        }));
        console.log(`[Analyze] Also searching ${existingRanges.length} existing ranges for category ${categoryId} (searchType: ${modelType})`);
      } catch (e) {
        console.error('[Analyze] Error fetching existing ranges:', e.message);
      }
    }
    
    // Combine eBay models with existing ranges (existing ranges have priority)
    // Put existing ranges first so they match before generic eBay models
    const allModels = [...existingRanges, ...models];
    
    if (allModels.length === 0) {
      const syncType = modelType === 'vehicles' ? 'vehicles' : 'devices';
      return res.status(400).json({ 
        error: `No ${syncType} models in database. Please sync models first.`,
        needsSync: true,
        syncType
      });
    }

    // Split text into lines
    const lines = textToAnalyze.split(/\r?\n/).map((line, idx) => ({ 
      lineNumber: idx + 1, 
      text: line.trim(),
      textLower: line.trim().toLowerCase(),
      normalized: normalizeText(line)
    })).filter(l => l.text.length > 0);

    // For each line, find the BEST matching model using enhanced matching
    const lineResults = [];
    const modelCounts = new Map(); // Track counts per model

    for (const line of lines) {
      // Use the appropriate matching function based on model type:
      // - Vehicles: Aggressive matching with model-only support (e.g., "Silverado" → "Chevrolet Silverado")
      // - Devices: Conservative matching with full name only (to avoid "Touch" → "UMi Touch")
      const foundModel = findBestMatch(line.normalized, line.textLower, allModels, modelType);

      // Record result for this line
      const brandField = modelType === 'vehicles' ? 'make' : 'brand';
      lineResults.push({
        lineNumber: line.lineNumber,
        text: line.text.length > 200 ? line.text.substring(0, 200) + '...' : line.text,
        foundModel: foundModel ? foundModel.fullName : null,
        make: foundModel ? foundModel[brandField] : null,
        model: foundModel ? foundModel.model : null,
        deviceType: foundModel?.deviceType || null
      });

      // Update count for found model
      if (foundModel) {
        const currentCount = modelCounts.get(foundModel.fullName) || 0;
        modelCounts.set(foundModel.fullName, currentCount + 1);
      }
    }

    // Build summary with counts
    const foundInDatabase = [];
    for (const [modelName, count] of modelCounts) {
      const matchedRows = lineResults
        .filter(lr => lr.foundModel === modelName)
        .map(lr => ({ lineNumber: lr.lineNumber, text: lr.text }));
      
      foundInDatabase.push({ modelName, count, matchedRows });
    }

    // Sort by count descending
    foundInDatabase.sort((a, b) => b.count - a.count);

    // Count lines with no match
    const linesWithNoMatch = lineResults.filter(lr => !lr.foundModel);
    const unmatchedCount = linesWithNoMatch.length;

    const processingTime = Date.now() - startTime;
    const ebayModelCount = models.length;
    const existingRangeCount = existingRanges.length;
    console.log(`[Analyze] Processed ${lines.length} lines against ${ebayModelCount} eBay ${modelType} models + ${existingRangeCount} existing ranges in ${processingTime}ms`);

    res.json({ 
      success: true, 
      searchType: modelType,
      foundInDatabase,
      lineResults, // All lines with their detected model (or null)
      totalModelsInDatabase: allModels.length,
      ebayModelsCount: ebayModelCount,
      existingRangesCount: existingRangeCount,
      totalLinesAnalyzed: lines.length,
      totalMatchCount: lines.length - unmatchedCount,
      unmatchedCount,
      unmatchedLines: linesWithNoMatch,
      uniqueModelsFound: foundInDatabase.length,
      processingTimeMs: processingTime
    });

  } catch (error) {
    console.error('Analysis Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/range-analysis/map-to-ranges
// Maps detected model names to Range IDs for a specific category
// Creates ranges if they don't exist
router.post('/map-to-ranges', requireAuth, requirePageAccess('RangeAnalyzer', ['superadmin', 'listingadmin', 'lister', 'advancelister', 'trainee']), async (req, res) => {
  try {
    const { categoryId, modelCounts } = req.body;
    // modelCounts: [{ modelName: "Honda Accord", count: 5 }, ...]

    if (!categoryId) {
      return res.status(400).json({ error: 'categoryId is required' });
    }

    if (!modelCounts || !Array.isArray(modelCounts)) {
      return res.status(400).json({ error: 'modelCounts array is required' });
    }

    const rangeQuantities = [];

    for (const item of modelCounts) {
      const { modelName, count } = item;
      if (!modelName || !count || count <= 0) continue;

      // Try to find existing range with this name in the category
      let range = await Range.findOne({ 
        name: modelName, 
        category: categoryId 
      });

      // If not found, create it
      if (!range) {
        try {
          range = await Range.create({
            name: modelName,
            category: categoryId
          });
          console.log(`[Range Mapper] Created new range: ${modelName}`);
        } catch (e) {
          // Handle race condition - might have been created by another request
          if (e.code === 11000) {
            range = await Range.findOne({ name: modelName, category: categoryId });
          } else {
            console.error(`[Range Mapper] Error creating range ${modelName}:`, e.message);
            continue;
          }
        }
      }

      if (range) {
        rangeQuantities.push({
          rangeId: range._id,
          rangeName: range.name,
          quantity: count
        });
      }
    }

    res.json({
      success: true,
      rangeQuantities
    });

  } catch (error) {
    console.error('Map to Ranges Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/range-analysis/ensure-unknown-range
// Ensures "Unknown" range exists for a category
router.post('/ensure-unknown-range', requireAuth, requirePageAccess('RangeAnalyzer', ['superadmin', 'listingadmin', 'lister', 'advancelister', 'trainee']), async (req, res) => {
  try {
    const { categoryId } = req.body;

    if (!categoryId) {
      return res.status(400).json({ error: 'categoryId is required' });
    }

    // Try to find or create "Unknown" range
    let unknownRange = await Range.findOne({ 
      name: 'Unknown', 
      category: categoryId 
    });

    if (!unknownRange) {
      try {
        unknownRange = await Range.create({
          name: 'Unknown',
          category: categoryId
        });
        console.log(`[Range] Created Unknown range for category ${categoryId}`);
      } catch (e) {
        if (e.code === 11000) {
          unknownRange = await Range.findOne({ name: 'Unknown', category: categoryId });
        } else {
          throw e;
        }
      }
    }

    res.json({
      success: true,
      unknownRange: {
        _id: unknownRange._id,
        name: unknownRange.name
      }
    });

  } catch (error) {
    console.error('Ensure Unknown Range Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/range-analysis/save-bulk-ranges
// Saves multiple range quantities to an assignment in ONE atomic operation
// This avoids race conditions from multiple parallel requests
// Supports auto-trim: if total exceeds remainingLimit, it trims proportionally
router.post('/save-bulk-ranges', requireAuth, requirePageAccess('RangeAnalyzer', ['superadmin', 'listingadmin', 'lister', 'advancelister', 'trainee']), async (req, res) => {
  try {
    const { assignmentId, categoryId, modelCounts, unknownQty, remainingLimit } = req.body;
    // modelCounts: [{ modelName: "Honda CR-V", count: 5 }, ...]
    // remainingLimit: max total quantity that can be added (for auto-trim)
    
    console.log(`[Bulk Save] Request received:`, {
      assignmentId,
      categoryId,
      modelCountsLength: modelCounts?.length || 0,
      unknownQty,
      remainingLimit
    });

    if (!assignmentId) {
      return res.status(400).json({ error: 'assignmentId is required' });
    }
    if (!categoryId) {
      return res.status(400).json({ error: 'categoryId is required' });
    }

    // 1. Find the assignment
    const assignment = await Assignment.findById(assignmentId).populate('task', 'category subcategory');
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    // Check permission
    const me = req.user?.userId || req.user?.id;
    const isAdmin = ['superadmin', 'listingadmin'].includes(req.user?.role);
    if (!isAdmin && String(assignment.lister) !== String(me)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // 2. Convert categoryId to ObjectId if it's a string (important for MongoDB queries)
    const categoryObjectId = typeof categoryId === 'string' 
      ? new mongoose.Types.ObjectId(categoryId) 
      : categoryId;
    
    // 3. Map model names to Range IDs (create if needed)
    let rangeUpdates = []; // { rangeId, rangeName, quantity }

    for (const item of (modelCounts || [])) {
      const { modelName, count } = item;
      if (!modelName || !count || count <= 0) continue;

      let range = await Range.findOne({ name: modelName, category: categoryObjectId });
      
      if (!range) {
        try {
          range = await Range.create({ name: modelName, category: categoryObjectId });
          console.log(`[Bulk Save] Created new range: ${modelName}`);
        } catch (e) {
          if (e.code === 11000) {
            range = await Range.findOne({ name: modelName, category: categoryObjectId });
          } else {
            console.error(`[Bulk Save] Error creating range ${modelName}:`, e.message);
            continue;
          }
        }
      }

      if (range) {
        // Validate range belongs to category
        if (String(range.category) !== String(categoryObjectId)) {
          console.error(`[Bulk Save] Range ${modelName} doesn't belong to category`);
          continue;
        }
        rangeUpdates.push({ rangeId: range._id, rangeName: range.name, quantity: count });
      }
    }

    // 4. Handle Unknown range if needed
    console.log(`[Bulk Save] Processing Unknown - unknownQty: ${unknownQty}, type: ${typeof unknownQty}`);
    
    if (unknownQty && unknownQty > 0) {
      console.log(`[Bulk Save] Adding Unknown range with qty: ${unknownQty} for category: ${categoryId}`);
      
      // First, try to find existing Unknown range
      let unknownRange = await Range.findOne({ name: 'Unknown', category: categoryObjectId });
      console.log(`[Bulk Save] Initial findOne result:`, unknownRange ? `Found: ${unknownRange._id}` : 'Not found');
      
      if (!unknownRange) {
        try {
          unknownRange = await Range.create({ name: 'Unknown', category: categoryObjectId });
          console.log(`[Bulk Save] Created Unknown range: ${unknownRange._id}`);
        } catch (e) {
          console.log(`[Bulk Save] Create error: ${e.code} - ${e.message}`);
          if (e.code === 11000) {
            // Race condition - another request created it, try to find again
            console.log(`[Bulk Save] Duplicate error, searching again...`);
            unknownRange = await Range.findOne({ name: 'Unknown', category: categoryObjectId });
            console.log(`[Bulk Save] Second findOne result:`, unknownRange ? `Found: ${unknownRange._id}` : 'Still not found!');
          } else {
            console.error(`[Bulk Save] Error creating Unknown range:`, e.message);
          }
        }
      }
      
      if (unknownRange && unknownRange._id) {
        rangeUpdates.push({ rangeId: unknownRange._id, rangeName: 'Unknown', quantity: unknownQty });
        console.log(`[Bulk Save] Added Unknown to rangeUpdates, total updates now: ${rangeUpdates.length}`);
      } else {
        console.error(`[Bulk Save] Failed to get Unknown range! unknownRange:`, unknownRange);
      }
    } else {
      console.log(`[Bulk Save] Skipping Unknown - condition not met (unknownQty: ${unknownQty})`);
    }

    // 4. AUTO-TRIM: If total exceeds remainingLimit, trim quantities proportionally
    const totalRequested = rangeUpdates.reduce((sum, u) => sum + u.quantity, 0);
    let totalTrimmed = 0;
    
    if (remainingLimit !== undefined && remainingLimit !== null && totalRequested > remainingLimit) {
      console.log(`[Bulk Save] Auto-trimming: ${totalRequested} requested, ${remainingLimit} remaining limit`);
      
      // Trim proportionally - each range gets a fair share of the limit
      let budgetLeft = remainingLimit;
      const trimmedUpdates = [];
      
      for (const update of rangeUpdates) {
        if (budgetLeft <= 0) {
          totalTrimmed += update.quantity;
          continue; // Skip this range entirely
        }
        
        const trimmedQty = Math.min(update.quantity, budgetLeft);
        if (trimmedQty > 0) {
          trimmedUpdates.push({ ...update, quantity: trimmedQty });
          budgetLeft -= trimmedQty;
          totalTrimmed += (update.quantity - trimmedQty);
        }
      }
      
      rangeUpdates = trimmedUpdates;
      console.log(`[Bulk Save] Trimmed ${totalTrimmed} items, adding ${rangeUpdates.reduce((s, u) => s + u.quantity, 0)}`);
    }

    // 5. Apply ALL range updates to assignment in ONE save
    console.log(`[Bulk Save] Applying ${rangeUpdates.length} range updates:`, rangeUpdates.map(u => `${u.rangeName}: ${u.quantity}`));
    
    for (const update of rangeUpdates) {
      const existingIdx = assignment.rangeQuantities.findIndex(
        rq => String(rq.range) === String(update.rangeId)
      );
      
      if (existingIdx >= 0) {
        // Add to existing quantity
        assignment.rangeQuantities[existingIdx].quantity += update.quantity;
        console.log(`[Bulk Save] Updated existing range ${update.rangeName}: +${update.quantity}`);
      } else {
        // Add new
        assignment.rangeQuantities.push({ range: update.rangeId, quantity: update.quantity });
        console.log(`[Bulk Save] Added new range ${update.rangeName}: ${update.quantity}`);
      }
    }

    // 6. Calculate totals
    const totalDistributed = assignment.rangeQuantities.reduce((sum, rq) => sum + (rq.quantity || 0), 0);
    assignment.completedQuantity = Math.min(totalDistributed, assignment.quantity);

    // 6. Save once
    await assignment.save();

    const totalAdded = rangeUpdates.reduce((sum, u) => sum + u.quantity, 0);
    console.log(`[Bulk Save] Saved ${rangeUpdates.length} ranges (${totalAdded} qty) to assignment ${assignmentId}${totalTrimmed > 0 ? `, trimmed ${totalTrimmed}` : ''}`);

    res.json({
      success: true,
      rangesAdded: rangeUpdates.length,
      quantityAdded: totalAdded,
      quantityTrimmed: totalTrimmed,
      totalDistributed,
      remaining: Math.max(0, assignment.quantity - totalDistributed)
    });

  } catch (error) {
    console.error('Bulk Save Error:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

export default router;