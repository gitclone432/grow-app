/**
 * Hardcoded Seller Hub–style threshold labels (not sourced from eBay API bounds).
 */
export const SELLER_STANDARDS_THRESHOLD_BY_METRIC_KEY = {
  MIN_DAYS_ON_SITE: 'Min 90 Days',
  MIN_TXN_COUNT: 'Min 100 Sales',
  MIN_GMV: 'Min $1000',
  DEFECTIVE_TRANSACTION_RATE: 'Min 0.50% / Max 2%',
  CLAIMS_SAF_RATE: 'Max 2 Txn',
  SHIPPING_MISS_RATE: 'Max 3%',
  VALID_TRACKING_UPLOADED_WITHIN_HANDLING_RATE: 'Min 95%',
};

export function getSellerStandardsThresholdDisplay(metricKey) {
  const key = String(metricKey || '').trim().toUpperCase();
  return SELLER_STANDARDS_THRESHOLD_BY_METRIC_KEY[key] || null;
}

export function applySellerStandardsThresholdLabels(report) {
  if (!report || !Array.isArray(report.standardsProfiles)) {
    return report;
  }

  return {
    ...report,
    standardsProfiles: report.standardsProfiles.map((profile) => ({
      ...profile,
      metrics: (profile.metrics || []).map((metric) => {
        const thresholdDisplay = getSellerStandardsThresholdDisplay(metric?.metricKey);
        if (!thresholdDisplay) return { ...metric };
        return {
          ...metric,
          thresholdDisplay,
        };
      }),
    })),
  };
}
