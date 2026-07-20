import api from '../lib/api.js';

/**
 * Persist a listing CSV blob to CSV Storage. Failures are logged only —
 * callers should still proceed with the browser download.
 *
 * @returns {Promise<string|null>} Saved record _id, or null on failure / missing seller
 */
export async function saveCsvToStorage({
  blob,
  filename,
  sellerId,
  templateId = null,
  listingCount = 0,
  listingStatus = 'active',
  source = 'download',
} = {}) {
  if (!blob || !sellerId) return null;

  try {
    const csvFile =
      blob instanceof File
        ? blob
        : new File([blob], filename || `listings_${Date.now()}.csv`, { type: 'text/csv' });

    const storageForm = new FormData();
    storageForm.append('csvFile', csvFile, csvFile.name);
    storageForm.append('sellerId', sellerId);
    if (templateId) storageForm.append('templateId', templateId);
    storageForm.append('listingCount', String(listingCount || 0));
    storageForm.append('source', source || 'download');
    if (listingStatus === 'draft' || listingStatus === 'active') {
      storageForm.append('listingStatus', listingStatus);
    }

    const saveRes = await api.post('/csv-storage', storageForm, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return saveRes.data?._id || null;
  } catch (err) {
    console.error('Failed to save CSV to storage:', err.message);
    return null;
  }
}
