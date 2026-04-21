import ApiUsage from '../models/ApiUsage.js';

/**
 * Track API usage for monitoring and cost analysis
 * @param {Object} params - Usage tracking parameters
 * @param {string} params.service - Service name ('ScraperAPI', 'PAAPI', 'Gemini')
 * @param {string} params.asin - Amazon ASIN (optional)
 * @param {number} params.creditsUsed - Number of credits consumed (default: 1)
 * @param {boolean} params.success - Whether the request succeeded (default: true)
 * @param {string} params.errorMessage - Error message if failed (optional)
 * @param {number} params.responseTime - Response time in milliseconds (optional)
 * @param {Array<string>} params.extractedFields - Successfully extracted fields (optional)
 */
export async function trackApiUsage({ 
  service, 
  asin, 
  creditsUsed, 
  success, 
  errorMessage, 
  responseTime, 
  extractedFields 
}) {
  // Skip if tracking is disabled
  if (process.env.ENABLE_API_USAGE_TRACKING === 'false') {
    return;
  }

  const now = new Date();
  
  try {
    await ApiUsage.create({
      service,
      asin,
      timestamp: now,
      creditsUsed: creditsUsed || 1,
      success: success !== false, // Default to true
      errorMessage,
      responseTime,
      extractedFields,
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate()
    });
    
    console.log(`[Usage Tracker] ✅ Logged ${service} usage${asin ? ` for ${asin}` : ''}: ${creditsUsed || 1} credits`);
  } catch (error) {
    console.error(`[Usage Tracker] ❌ Failed to track usage:`, error.message);
    // Don't throw - tracking failure shouldn't break product fetching
  }
}

/**
 * Get usage statistics for a specific service and time period
 * @param {Object} query - Query parameters
 * @param {string} query.service - Service name to filter by (optional)
 * @param {number} query.year - Year to filter by (optional)
 * @param {number} query.month - Month to filter by (optional)
 * @returns {Promise<Array>} - Usage statistics
 */
export async function getUsageStats({ service, year, month }) {
  const query = {};
  if (service) query.service = service;
  if (year) query.year = year;
  if (month) query.month = month;
  
  const stats = await ApiUsage.aggregate([
    { $match: query },
    {
      $group: {
        _id: { year: '$year', month: '$month', service: '$service' },
        totalRequests: { $sum: 1 },
        totalCredits: { $sum: '$creditsUsed' },
        successfulRequests: { $sum: { $cond: ['$success', 1, 0] } },
        failedRequests: { $sum: { $cond: ['$success', 0, 1] } },
        avgResponseTime: { $avg: '$responseTime' },
        uniqueAsins: { $addToSet: '$asin' }
      }
    },
    {
      $project: {
        _id: 1,
        totalRequests: 1,
        totalCredits: 1,
        successfulRequests: 1,
        failedRequests: 1,
        avgResponseTime: 1,
        uniqueAsinCount: { $size: { $ifNull: ['$uniqueAsins', []] } }
      }
    },
    { $sort: { '_id.year': -1, '_id.month': -1 } }
  ]);
  
  return stats;
}

/**
 * Get detailed usage breakdown by field extraction
 * @param {Object} query - Query parameters
 * @param {string} query.service - Service name
 * @param {number} query.year - Year
 * @param {number} query.month - Month
 * @returns {Promise<Object>} - Field extraction statistics
 */
export async function getFieldExtractionStats({ service, year, month }) {
  const query = { service };
  if (year) query.year = year;
  if (month) query.month = month;
  
  const stats = await ApiUsage.aggregate([
    { $match: query },
    { $unwind: { path: '$extractedFields', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: '$extractedFields',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  ]);
  
  const totalRequests = await ApiUsage.countDocuments(query);
  
  return {
    totalRequests,
    fieldStats: stats.map(s => ({
      field: s._id || 'none',
      count: s.count,
      percentage: ((s.count / totalRequests) * 100).toFixed(1)
    }))
  };
}

/**
 * Get recent errors for debugging
 * @param {string} service - Service name
 * @param {number} limit - Number of errors to retrieve (default: 50)
 * @returns {Promise<Array>} - Recent errors
 */
export async function getRecentErrors(service, limit = 50) {
  const errors = await ApiUsage.find({
    service,
    success: false
  })
    .sort({ timestamp: -1 })
    .limit(limit)
    .select('asin timestamp errorMessage responseTime extractedFields');
  
  return errors;
}

/**
 * Check if monthly quota is approaching limit
 * @param {string} service - Service name
 * @param {number} quotaLimit - Monthly quota limit
 * @returns {Promise<Object>} - Quota status
 */
export async function checkQuotaStatus(service, quotaLimit = 5000) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  
  const usage = await ApiUsage.countDocuments({
    service,
    year: currentYear,
    month: currentMonth
  });
  
  const percentUsed = (usage / quotaLimit) * 100;
  const remaining = quotaLimit - usage;
  
  return {
    service,
    year: currentYear,
    month: currentMonth,
    used: usage,
    quota: quotaLimit,
    remaining,
    percentUsed: parseFloat(percentUsed.toFixed(1)),
    status: percentUsed >= 95 ? 'critical' : percentUsed >= 80 ? 'warning' : 'ok'
  };
}
