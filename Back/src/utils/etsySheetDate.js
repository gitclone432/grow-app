const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;
export const ETSY_SHEET_DATE_FIELDS = ['dateSold'];

function pad2(value) {
  return String(value).padStart(2, '0');
}

export function swapAmbiguousIsoDayMonth(value) {
  const text = String(value || '').trim();
  const match = text.match(ISO_DATE);
  if (!match) return text;

  const year = match[1];
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (day >= 1 && day <= 12 && month >= 1 && month <= 12) {
    return `${year}-${pad2(day)}-${pad2(month)}`;
  }
  return text.slice(0, 10);
}

export function applyAmbiguousDateSwap(row = {}) {
  const next = { ...row };
  let changed = false;
  for (const key of ETSY_SHEET_DATE_FIELDS) {
    const current = String(next[key] || '').trim();
    if (!current) continue;
    const corrected = swapAmbiguousIsoDayMonth(current);
    if (corrected !== current) {
      next[key] = corrected;
      changed = true;
    }
  }
  return { row: next, changed };
}

export async function correctStoredSheetDates(Model, orders = []) {
  const writes = [];

  for (const order of orders) {
    if (order?.ambiguousDatesSwapped) continue;
    const { row, changed } = applyAmbiguousDateSwap(order);
    if (changed) {
      Object.assign(order, row);
    }
    order.ambiguousDatesSwapped = true;
    writes.push({
      updateOne: {
        filter: { _id: order._id },
        update: {
          $set: {
            ...Object.fromEntries(ETSY_SHEET_DATE_FIELDS.map((key) => [key, order[key] || ''])),
            ambiguousDatesSwapped: true,
          },
        },
      },
    });
  }

  if (writes.length === 0) return 0;
  await Model.bulkWrite(writes, { ordered: false });
  return writes.length;
}
