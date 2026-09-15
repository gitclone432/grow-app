import { generateWithGemini } from '../utils/gemini.js';

/**
 * eBay Motors title eligibility check — shared by the manual ASIN Precheck
 * page (routes/asinPrecheck.js) and the automated Sourcing Rule run
 * (lib/asinSourcingAutomation.js) when a rule has ebayMotorsMode enabled.
 * Extracted here so both call sites stay in sync.
 */

function parseJsonObject(text = '') {
  const raw = String(text || '').trim();
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 6);
}

export function detectVehicleYearText(title = '') {
  const yearPattern = /\b(?:19[5-9]\d|20[0-4]\d)(?:\s*[-–/]\s*(?:\d{2}|19[5-9]\d|20[0-4]\d))?\b/g;
  return [...new Set(String(title || '').match(yearPattern) || [])].slice(0, 8);
}

export function detectUniversalPhrase(title = '') {
  const match = String(title || '').match(/\b(universal(?:\s+fit)?|fits\s+most\s+(?:cars|vehicles|trucks|motorcycles)|for\s+most\s+(?:cars|vehicles|trucks|motorcycles))\b/i);
  return match ? match[0] : '';
}

export function detectKnownVehicleModelPhrase(title = '') {
  const text = String(title || '');
  const knownModelPattern = /\b(?:Harley\s+Davidson|Sportster|Softail|Dyna|Electra\s+Glide|Road\s+King|Fatboy|Touring|Chevy|Chevrolet|Silverado|Colorado|Ford|F-?150|F-?250|F-?350|Ram|Dodge|Jeep|Wrangler|Toyota|Tacoma|Tundra|Camry|Corolla|Honda|Civic|Accord|BMW|Mercedes|Audi|Nissan|Altima|Sentra|Subaru|Outback|Forester|Yamaha|Kawasaki|Suzuki|Polaris|Can-Am)\b/i;
  const match = text.match(knownModelPattern);
  return match ? match[0] : '';
}

export async function classifyEbayMotorsTitle(title, asin, usageContext = {}) {
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) {
    return {
      eligible: false,
      reason: 'No title found',
      signals: { hasModel: false, hasYear: false, isUniversal: false },
      detected: { modelNames: [], years: [], universalPhrase: '' }
    };
  }

  const prompt = `
You are checking if an Amazon product title is suitable for an eBay Motors listing precheck.

Pass rule:
- eligible=true if the title contains BOTH a vehicle model name and a year/year range.
- Otherwise eligible=false.

Definitions:
- eBay Motors includes cars, trucks, motorcycles, powersports, ATV/UTV, and their parts.
- A vehicle model name can be a real vehicle make/model/trim/platform/family such as Silverado, Colorado, F-150, Civic, Wrangler, X5, G05, Camry, Tacoma, Harley Davidson Sportster, Dyna, Softail, Yamaha YZF, Polaris Ranger, etc.
- A year/year range means a model year like 2024, or a range like 2019-2024, 2023 2024 2025, 1999-06.
- Universal fit does NOT pass by itself. Universal products must still be excluded unless the title also has BOTH a vehicle model name and a year/year range.
- Do not require the exact word "model"; detect actual vehicle model names from the title.
- Engine sizes or product part numbers alone are not vehicle model names.

Return only valid JSON:
{
  "eligible": boolean,
  "reason": "short reason",
  "signals": {
    "hasModel": boolean,
    "hasYear": boolean,
    "isUniversal": boolean
  },
  "detected": {
    "modelNames": ["detected vehicle model names"],
    "years": ["detected years or year ranges"],
    "universalPhrase": "detected universal phrase or empty string"
  }
}

Examples:
- "27490-96 Carburetor for Harley Davidson Sportster 883 Sportster 1200 1988-2007" => eligible=true, hasModel=true, hasYear=true.
- "Universal Mud Flaps for Cars Trucks SUV" => eligible=false, isUniversal=true, because model and year are missing.
- "Carburetor for Predator 4000 Champion Honda 3500 Generator" => eligible=false because vehicle model and year are missing.

Title: ${cleanTitle}
`.trim();

  try {
    const response = await generateWithGemini(prompt, {
      maxTokens: 180,
      asin,
      fieldName: 'ebay_motors_title_eligibility',
      fieldType: 'precheck',
      apiKey: process.env.OPENAI_PRECHECK_API_KEY,
      ...usageContext
    });
    const parsed = parseJsonObject(response);
    if (!parsed || typeof parsed.eligible !== 'boolean') {
      throw new Error('Invalid eligibility response');
    }

    const signals = parsed.signals || {};
    const detected = parsed.detected || {};
    const modelNames = normalizeStringArray(detected.modelNames);
    const years = normalizeStringArray(detected.years);
    const universalPhrase = String(detected.universalPhrase || '').trim();
    const fallbackYears = detectVehicleYearText(cleanTitle);
    const fallbackUniversalPhrase = detectUniversalPhrase(cleanTitle);
    const fallbackModelPhrase = detectKnownVehicleModelPhrase(cleanTitle);
    const hasModel = Boolean(signals.hasModel) || modelNames.length > 0 || Boolean(fallbackModelPhrase);
    const hasYear = Boolean(signals.hasYear) || years.length > 0 || fallbackYears.length > 0;
    const isUniversal = Boolean(signals.isUniversal) || Boolean(universalPhrase) || Boolean(fallbackUniversalPhrase);
    const eligible = hasModel && hasYear;
    const normalizedDetected = {
      modelNames: modelNames.length > 0 ? modelNames : (fallbackModelPhrase ? [fallbackModelPhrase] : []),
      years: years.length > 0 ? years : fallbackYears,
      universalPhrase: universalPhrase || fallbackUniversalPhrase
    };
    const reason = eligible
      ? String(parsed.reason || 'Contains vehicle model and year fitment').slice(0, 180)
      : String(
          isUniversal
            ? 'Universal product excluded; model name and year are required'
            : parsed.reason || 'Missing vehicle model name or year'
        ).slice(0, 180);

    return {
      eligible,
      reason,
      signals: {
        hasModel,
        hasYear,
        isUniversal
      },
      detected: normalizedDetected
    };
  } catch (error) {
    console.warn(`[eBay Motors Classifier] title check failed for ${asin}:`, error.message);
    return {
      eligible: false,
      reason: 'Could not verify eBay Motors fitment from title',
      signals: { hasModel: false, hasYear: false, isUniversal: false },
      detected: { modelNames: [], years: [], universalPhrase: '' }
    };
  }
}
