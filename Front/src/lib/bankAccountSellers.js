/** 24-hex Mongo ObjectId string (case-insensitive). */
const MONGO_ID_HEX = /^[a-f0-9]{24}$/i;

export function splitBankSellersField(sellers) {
    if (sellers == null || !String(sellers).trim()) return [];
    return String(sellers)
        .split(/[,;]+/)
        .map((t) => t.trim())
        .filter(Boolean);
}

export function isMongoIdString(s) {
    return typeof s === 'string' && MONGO_ID_HEX.test(s.trim());
}

/** eBay seller list → options for bank-account store linking and labels. */
export function buildSellerOptions(sellersList) {
    const rows = (sellersList || [])
        .map((s) => {
            const username = (s.user?.username || '').trim();
            const email = (s.user?.email || '').trim();
            const bankToken = username || email;
            if (!bankToken) return null;
            const label =
                username && email && username.toLowerCase() !== email.toLowerCase()
                    ? `${username} (${email})`
                    : bankToken;
            const matchLower = new Set(
                [username, email].filter(Boolean).map((x) => x.toLowerCase())
            );
            return { id: String(s._id), label, bankToken, matchLower };
        })
        .filter(Boolean);
    rows.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
    return rows;
}

function resolveSellerTokenLabel(token, sellerOptions) {
    const opts = sellerOptions || [];
    if (isMongoIdString(token)) {
        const match = opts.find((o) => String(o.id) === token);
        if (match) return match.bankToken || match.label;
        return null;
    }
    const tl = String(token).toLowerCase();
    const match = opts.find((o) => o.matchLower?.has(tl));
    if (match) return match.bankToken || match.label;
    return token;
}

/** Short store name(s) for menus, e.g. `bright vision` or `actus corp, rolex`. */
export function formatBankSellersHint(sellersStr, sellerOptions = []) {
    const tokens = splitBankSellersField(sellersStr);
    if (!tokens.length) return '';

    const labels = tokens
        .map((token) => resolveSellerTokenLabel(token, sellerOptions))
        .filter(Boolean);

    if (labels.length === 1) return labels[0];
    if (labels.length === 2) return labels.join(', ');
    if (labels.length > 2) return `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`;
    return '';
}

/**
 * Filter sellers linked by BankAccount.sellers: comma-separated seller _id values
 * and/or legacy username/email tokens (same rules as before).
 */
export function filterSellersLinkedToBankField(bankAccount, sellersList) {
    if (!bankAccount?.sellers?.trim() || !Array.isArray(sellersList)) return sellersList || [];
    const raw = splitBankSellersField(bankAccount.sellers);
    if (!raw.length) return sellersList;
    const idSet = new Set(raw.filter((t) => isMongoIdString(t)).map((t) => t.toLowerCase()));
    const textTokens = raw.filter((t) => !isMongoIdString(t)).map((t) => t.toLowerCase());
    return sellersList.filter((s) => {
        const sid = String(s._id).toLowerCase();
        if (idSet.has(sid)) return true;
        if (!textTokens.length) return false;
        const u = (s.user?.username || s.user?.email || '').toLowerCase();
        return textTokens.some((t) => u === t || (u && u.includes(t)));
    });
}

/**
 * Collapse legacy username/email tokens to seller ids where possible so multiple stores
 * (same user) stay distinct. Unknown tokens are kept for backward compatibility.
 * @param {string} sellersStr
 * @param {{ id: string, matchLower: Set<string> }[]} sellerOptions from buildSellerOptions
 */
export function normalizeBankSellersPayload(sellersStr, sellerOptions) {
    const opts = sellerOptions || [];
    if (!opts.length) return sellersStr == null ? '' : String(sellersStr);
    const tokens = splitBankSellersField(sellersStr);
    const out = [];
    const seen = new Set();
    for (const t of tokens) {
        const ts = String(t).trim();
        if (!ts) continue;
        if (isMongoIdString(ts)) {
            if (opts.some((o) => String(o.id) === ts) && !seen.has(ts)) {
                seen.add(ts);
                out.push(ts);
            }
            continue;
        }
        const tl = ts.toLowerCase();
        const opt = opts.find((o) => o.matchLower.has(tl));
        if (opt) {
            const id = String(opt.id);
            if (!seen.has(id)) {
                seen.add(id);
                out.push(id);
            }
            continue;
        }
        const freeKey = `free:${tl}`;
        if (!seen.has(freeKey)) {
            seen.add(freeKey);
            out.push(ts);
        }
    }
    return out.join(', ');
}
