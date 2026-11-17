import api from '../lib/api';

export const ISSUE_REASON_OPTIONS_ENDPOINT = '/issue-reason-options';

const DEFAULT_ISSUE_REASON_OPTIONS = ['Out of Stock', 'Late Delivery', 'Listing Issue'].map((name) => ({
  _id: name,
  name
}));

export async function loadIssueReasonOptions() {
  try {
    const { data } = await api.get(ISSUE_REASON_OPTIONS_ENDPOINT);
    return data || [];
  } catch (error) {
    console.error('Failed to load reason options', error);
    return DEFAULT_ISSUE_REASON_OPTIONS;
  }
}

// An order can hold a reason that was later renamed or deleted; keep it selectable so it still displays.
export function withCurrentIssueReason(options, currentValue) {
  if (!currentValue || (options || []).some((option) => option.name === currentValue)) {
    return options || [];
  }
  return [...(options || []), { _id: `current-${currentValue}`, name: currentValue }];
}
