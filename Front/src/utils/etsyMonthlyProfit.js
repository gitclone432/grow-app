import {
  enrichOrderWithAmazonPricing,
  formatRs,
  formatUsd,
  parseMoney,
} from './etsyOrderPricing.js';

const SUM_KEYS = [
  'qty',
  'tax',
  'total',
  'etsyFee',
  'processingFee',
  'regulatoryOperatingFee',
  'tds',
  'tcs',
  'offsiteAds',
  'coupons',
  'additionalFees',
  'relistFee',
  'tId',
  'net',
  'itemCost',
  'shipCost',
  'amazonTax',
  'totalInUsd',
  'totalInRs',
  'markUpFee',
  'igst',
  'amazonTotal',
  'inHand',
];

const USD_KEYS = new Set(['itemCost', 'shipCost', 'amazonTax', 'totalInUsd']);

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pad2(value) {
  return String(value).padStart(2, '0');
}

function toMonthKey(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || m < 1 || m > 12) return '';
  return `${y}-${pad2(m)}`;
}

export function resolveProfitSheetOrderDate(dateSold) {
  if (dateSold instanceof Date && !Number.isNaN(dateSold.getTime())) {
    const iso = `${dateSold.getFullYear()}-${pad2(dateSold.getMonth() + 1)}-${pad2(dateSold.getDate())}`;
    return { iso, monthKey: toMonthKey(dateSold.getFullYear(), dateSold.getMonth() + 1) };
  }

  const text = String(dateSold || '').trim();
  if (!text || text === '-') return { iso: '', monthKey: '' };

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    return {
      iso: `${iso[1]}-${iso[2]}-${iso[3]}`,
      monthKey: toMonthKey(year, month),
    };
  }

  const named = text.match(/^(\d{1,2})[-/\s]+([A-Za-z]{3,9})[-/\s,]+(\d{2,4})$/)
    || text.match(/^([A-Za-z]{3,9})[-/\s]+(\d{1,2})[-/\s,]+(\d{2,4})$/);
  if (named) {
    const monthToken = named[1].match(/[A-Za-z]/) ? named[1] : named[2];
    const year = named[3].length === 2 ? 2000 + Number(named[3]) : named[3];
    const monthIndex = MONTH_NAMES.findIndex((name) => name.toLowerCase().startsWith(monthToken.toLowerCase().slice(0, 3)));
    if (monthIndex >= 0) {
      return {
        iso: '',
        monthKey: toMonthKey(year, monthIndex + 1),
      };
    }
  }

  const slash = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) {
    let day = Number(slash[1]);
    let month = Number(slash[2]);
    let year = Number(slash[3]);
    if (slash[3].length === 2) year += 2000;
    if (day <= 12 && month > 12) {
      const swap = day;
      day = month;
      month = swap;
    }
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return { iso: `${year}-${pad2(month)}-${pad2(day)}`, monthKey: toMonthKey(year, month) };
    }
  }

  return { iso: '', monthKey: '' };
}

export function monthKeyFromDateSold(dateSold) {
  return resolveProfitSheetOrderDate(dateSold).monthKey;
}

export function formatMonthLabel(monthKey) {
  if (!monthKey) return 'Undated';
  const [year, month] = monthKey.split('-');
  const monthName = MONTH_NAMES[Number(month) - 1];
  if (!monthName) return monthKey;
  return `${monthName} ${year}`;
}

function parseQty(value) {
  const num = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

function emptyTotals() {
  return Object.fromEntries(SUM_KEYS.map((key) => [key, 0]));
}

function addOrderTotals(target, order) {
  target.qty += parseQty(order.qty);
  for (const key of SUM_KEYS) {
    if (key === 'qty') continue;
    target[key] += parseMoney(order[key]);
  }
}

function formatTotals(totals) {
  const formatted = {};
  for (const key of SUM_KEYS) {
    if (key === 'qty') {
      formatted.qty = totals.qty || '';
      continue;
    }
    formatted[key] = USD_KEYS.has(key) ? formatUsd(totals[key]) : formatRs(totals[key]);
  }
  return formatted;
}

export function aggregateProfitSheetByMonth(orders = []) {
  const groups = new Map();

  for (const raw of orders) {
    const order = enrichOrderWithAmazonPricing(raw);
    const monthKey = monthKeyFromDateSold(order.dateSold);
    const storeId = String(order.store || '');
    const storeName = order.storeName || '';
    const groupKey = `${monthKey}|${storeId}`;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        id: groupKey,
        monthKey,
        monthLabel: formatMonthLabel(monthKey),
        storeId,
        storeName,
        orderCount: 0,
        totals: emptyTotals(),
      });
    }

    const group = groups.get(groupKey);
    group.orderCount += 1;
    addOrderTotals(group.totals, order);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      ...formatTotals(group.totals),
      inHandValue: group.totals.inHand,
    }))
    .sort((a, b) => {
      if (!a.monthKey && b.monthKey) return 1;
      if (a.monthKey && !b.monthKey) return -1;
      if (a.monthKey !== b.monthKey) return b.monthKey.localeCompare(a.monthKey);
      return String(a.storeName).localeCompare(String(b.storeName));
    });
}
