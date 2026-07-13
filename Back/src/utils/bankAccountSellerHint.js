const MONGO_ID_HEX = /^[a-f0-9]{24}$/i;

function splitBankSellersField(sellers) {
  if (sellers == null || !String(sellers).trim()) return [];
  return String(sellers)
    .split(/[,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function sellerShortName(seller) {
  return (seller?.user?.username || seller?.user?.email || '').trim();
}

function resolveTokenLabel(token, sellersList) {
  if (MONGO_ID_HEX.test(token)) {
    const match = sellersList.find((s) => String(s._id) === token);
    return sellerShortName(match) || null;
  }
  const tl = token.toLowerCase();
  const match = sellersList.find((s) => {
    const u = (s.user?.username || s.user?.email || '').toLowerCase();
    return u === tl || (u && u.includes(tl));
  });
  return match ? sellerShortName(match) : token;
}

/** Short linked store name(s) for bank account labels (matches Front menus). */
export function formatLinkedSellerHint(sellersStr, sellersList = []) {
  const tokens = splitBankSellersField(sellersStr);
  if (!tokens.length) return '';

  const labels = tokens
    .map((token) => resolveTokenLabel(token, sellersList))
    .filter(Boolean);

  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return labels.join(', ');
  if (labels.length > 2) return `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`;
  return '';
}
