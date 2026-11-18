import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  extractAsinFromProductLink,
  formatSheetSku,
  getNextSheetSkuNumber,
  getProductLinkKey,
  normalizeSheetDate,
  normalizeSheetPrice,
} from '../src/utils/etsyProductSheet.js';

test('extracts the ASIN from the Amazon link shapes people paste', () => {
  const asin = 'B08N5WRWNW';
  const links = [
    `https://www.amazon.co.uk/dp/${asin}`,
    `https://www.amazon.co.uk/Some-Product-Name/dp/${asin}/ref=sr_1_3?crid=1&keywords=mug`,
    `https://www.amazon.com/gp/product/${asin}?th=1`,
    `https://www.amazon.co.uk/gp/aw/d/${asin}`,
    `amazon.co.uk/dp/${asin.toLowerCase()}#customerReviews`,
    `https://www.amazon.co.uk/sspa/click?ie=UTF8&url=%2FSome-Product%2Fdp%2F${asin}%2Fref%3Dsr_1_1_sspa`,
    `https://www.amazon.co.uk/s?k=mug&asin=${asin}`,
    asin,
  ];

  for (const link of links) {
    assert.equal(extractAsinFromProductLink(link), asin, link);
  }
});

test('does not mistake ordinary words or search pages for an ASIN', () => {
  assert.equal(extractAsinFromProductLink('https://www.amazon.co.uk/s?k=headphones'), '');
  assert.equal(extractAsinFromProductLink('headphones'), '');
  assert.equal(extractAsinFromProductLink('https://amzn.to/3xYzAbC'), '');
  assert.equal(extractAsinFromProductLink(''), '');
});

test('links to the same ASIN share a duplicate key regardless of marketplace or tracking params', () => {
  const key = getProductLinkKey('https://www.amazon.co.uk/dp/B08N5WRWNW');

  assert.equal(key, 'asin:B08N5WRWNW');
  assert.equal(getProductLinkKey('https://www.amazon.com/Name/dp/B08N5WRWNW/ref=abc?tag=x'), key);
  assert.notEqual(getProductLinkKey('https://www.amazon.co.uk/dp/B08N5WRWNX'), key);
});

test('links without an ASIN are matched on the link itself', () => {
  const key = getProductLinkKey('https://amzn.to/3xYzAbC');

  assert.equal(getProductLinkKey('http://AMZN.to/3xYzAbC/'), key);
  assert.notEqual(getProductLinkKey('https://amzn.to/3xyzabc'), key);
  assert.equal(getProductLinkKey('   '), '');
});

test('SKU sequence starts at UKVLAU001 and continues from the highest existing number', () => {
  assert.equal(formatSheetSku(getNextSheetSkuNumber([])), 'UKVLAU001');
  assert.equal(formatSheetSku(getNextSheetSkuNumber(['UKVLAU001', 'ukvlau007', 'UKVLAU003'])), 'UKVLAU008');
  assert.equal(formatSheetSku(getNextSheetSkuNumber(['UKVLAU999'])), 'UKVLAU1000');
  assert.equal(formatSheetSku(getNextSheetSkuNumber(['CUSTOM-42', 'UKVLAU12X', ''])), 'UKVLAU001');
});

test('dates normalize to ISO, reading numeric dates day-first', () => {
  const today = new Date(2026, 10, 18);

  assert.equal(normalizeSheetDate('2026-11-05'), '2026-11-05');
  assert.equal(normalizeSheetDate('05-11-2026'), '2026-11-05');
  assert.equal(normalizeSheetDate('5/11/26'), '2026-11-05');
  assert.equal(normalizeSheetDate('11/25/2026'), '2026-11-25');
  assert.equal(normalizeSheetDate('18 Nov 2026'), '2026-11-18');
  assert.equal(normalizeSheetDate('18-Nov', { today }), '2026-11-18');
  assert.equal(normalizeSheetDate('November 18, 2026'), '2026-11-18');
  assert.equal(normalizeSheetDate(''), '');
});

test('impossible or unrecognized dates are kept as typed', () => {
  assert.equal(normalizeSheetDate('31-02-2026'), '31-02-2026');
  assert.equal(normalizeSheetDate('next week'), 'next week');
});

test('prices drop currency formatting and keep non-numeric text', () => {
  assert.equal(normalizeSheetPrice('£12.50'), '12.5');
  assert.equal(normalizeSheetPrice('$1,234.00'), '1234');
  assert.equal(normalizeSheetPrice('12,99'), '12.99');
  assert.equal(normalizeSheetPrice(' 7 '), '7');
  assert.equal(normalizeSheetPrice('n/a'), 'n/a');
  assert.equal(normalizeSheetPrice(''), '');
});
