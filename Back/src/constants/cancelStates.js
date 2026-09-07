// Centralized list of eBay cancellation states that represent a FINAL / terminal
// cancellation, i.e. the order is cancelled and should be treated as such
// everywhere (compliance board exclusions, cancelled-orders views, etc).
//
// eBay's Cancellation API does not stop at 'CANCELED'/'CANCELLED' — once a
// cancellation is fully processed it transitions into a resolved/closed
// variant (e.g. CANCEL_CLOSED_WITH_REFUND). Filters that only matched the
// two original literals let those orders "leak" back into non-cancelled
// views once eBay flips the state, which is exactly the compliance-board
// bug this constant fixes. Add any newly observed eBay terminal states here
// — this is the single place all cancellation exclusion filters read from.
export const FINAL_CANCELLED_STATES = [
  'CANCELED',
  'CANCELLED',
  'CANCEL_CLOSED',
  'CANCEL_CLOSED_WITH_REFUND',
  'CANCEL_CLOSED_WITHOUT_REFUND',
  'CANCEL_CLOSED_NO_REFUND',
];
