/**
 * Buyer Messages inbox data from Commerce Message conversation cache
 * (EbayMessageConversation / EbayMessageConversationMessage), mapped to the
 * thread/message shapes BuyerChatPage already expects.
 */
import mongoose from 'mongoose';
import Seller from '../models/Seller.js';
import Order from '../models/Order.js';
import Listing from '../models/Listing.js';
import Message from '../models/Message.js';
import {
  EbayMessageConversation,
  EbayMessageConversationMessage
} from '../models/EbayMessageConversation.js';

function escapeRegexLiteral(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Buyer Messages inbox display name — eBay registration fullName.
 */
export function buyerDisplayNameFromOrder(order) {
  const username = String(order?.buyer?.username || '').trim();
  const registrationName = String(order?.buyer?.buyerRegistrationAddress?.fullName || '').trim();
  if (registrationName && registrationName.toLowerCase() !== username.toLowerCase()) {
    return registrationName;
  }
  const shippingName = String(order?.shippingFullName || '').trim();
  if (shippingName && shippingName.toLowerCase() !== username.toLowerCase()) {
    return shippingName;
  }
  const shipTo = String(
    order?.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo?.fullName || ''
  ).trim();
  if (shipTo && shipTo.toLowerCase() !== username.toLowerCase()) {
    return shipTo;
  }
  return '';
}

/**
 * Manage Case / INR Open — prefer shipping address name on the order.
 */
export function buyerShippingNameFromOrder(order) {
  const username = String(order?.buyer?.username || '').trim();
  const shippingName = String(order?.shippingFullName || '').trim();
  if (shippingName && shippingName.toLowerCase() !== username.toLowerCase()) {
    return shippingName;
  }
  const shipTo = String(
    order?.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo?.fullName || ''
  ).trim();
  if (shipTo && shipTo.toLowerCase() !== username.toLowerCase()) {
    return shipTo;
  }
  const registrationName = String(order?.buyer?.buyerRegistrationAddress?.fullName || '').trim();
  if (registrationName && registrationName.toLowerCase() !== username.toLowerCase()) {
    return registrationName;
  }
  return '';
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function getSellerIdentityNames(seller, extraNames = []) {
  return [
    seller?.user?.username,
    seller?.user?.email,
    seller?.ebayUserId,
    seller?.ebayUsername,
    seller?.username,
    ...(Array.isArray(extraNames) ? extraNames : [extraNames])
  ]
    .filter(Boolean)
    .map((s) => String(s).trim());
}

/**
 * App username often differs from eBay UserID in sender/recipient
 * (e.g. techmania vs techkey2025, raveoli vs raveoli_cart).
 * Infer seller as the party that appears in (nearly) every conversation pair.
 */
function inferSellerEbayUsername(conversations = []) {
  const counts = new Map();
  let pairCount = 0;
  for (const conv of conversations || []) {
    const sender = String(conv?.latestMessage?.senderUsername || '').trim();
    const recipient = String(conv?.latestMessage?.recipientUsername || '').trim();
    if (!sender || !recipient) continue;
    pairCount += 1;
    const sKey = sender.toLowerCase();
    const rKey = recipient.toLowerCase();
    counts.set(sKey, (counts.get(sKey) || 0) + 1);
    counts.set(rKey, (counts.get(rKey) || 0) + 1);
  }
  if (pairCount === 0) return '';

  let bestKey = '';
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      bestKey = key;
      bestCount = count;
    }
  }
  const tied = [...counts.values()].filter((c) => c === bestCount).length > 1;
  if (tied) return '';
  if (bestCount < Math.max(1, Math.ceil(pairCount * 0.6))) return '';

  for (const conv of conversations || []) {
    const sender = String(conv?.latestMessage?.senderUsername || '').trim();
    const recipient = String(conv?.latestMessage?.recipientUsername || '').trim();
    if (sender && sender.toLowerCase() === bestKey) return sender;
    if (recipient && recipient.toLowerCase() === bestKey) return recipient;
  }
  return bestKey;
}

/** Buyer = the non-seller ID from the sender/recipient pair. Never return the seller. */
function resolveBuyerUsername(sellerNames = [], { senderUsername, recipientUsername, otherPartyUsername } = {}) {
  const sellerSet = new Set(
    (sellerNames || []).map((s) => String(s).trim().toLowerCase()).filter(Boolean)
  );
  const sender = String(senderUsername || '').trim();
  const recipient = String(recipientUsername || '').trim();
  const other = String(otherPartyUsername || '').trim();

  if (sender && recipient && sellerSet.size > 0) {
    const senderIsSeller = sellerSet.has(sender.toLowerCase());
    const recipientIsSeller = sellerSet.has(recipient.toLowerCase());
    if (senderIsSeller && !recipientIsSeller) return recipient;
    if (recipientIsSeller && !senderIsSeller) return sender;
  }

  // Never trust otherParty when it is the seller store / eBay id
  if (other && sellerSet.size > 0 && !sellerSet.has(other.toLowerCase())) {
    if (
      !sender ||
      !recipient ||
      other.toLowerCase() === sender.toLowerCase() ||
      other.toLowerCase() === recipient.toLowerCase()
    ) {
      return other;
    }
  }

  if (sender && sellerSet.size > 0 && !sellerSet.has(sender.toLowerCase())) return sender;
  if (recipient && sellerSet.size > 0 && !sellerSet.has(recipient.toLowerCase())) return recipient;
  return '';
}

function resolveSenderRole(senderUsername, buyerUsername, sellerNames = [], recipientUsername = '') {
  const sender = String(senderUsername || '').trim().toLowerCase();
  const recipient = String(recipientUsername || '').trim().toLowerCase();
  const buyer = String(buyerUsername || '').trim().toLowerCase();
  const sellerSet = new Set(
    sellerNames.map((s) => String(s).trim().toLowerCase()).filter(Boolean)
  );

  if (sender && buyer && sender === buyer) return 'BUYER';
  if (sender && sellerSet.has(sender)) return 'SELLER';

  // Empty/unknown sender: infer from recipient
  if (!sender) {
    if (buyer && recipient === buyer) return 'SELLER';
    if (recipient && sellerSet.has(recipient)) return 'BUYER';
  }

  if (buyer && sender && sender !== buyer) return 'SELLER';
  if (buyer && recipient && recipient === buyer) return 'SELLER';
  return sender ? 'BUYER' : 'SELLER';
}

function messageTypeFromThread({ orderId, itemId }) {
  if (orderId) return 'ORDER';
  if (!itemId || itemId === 'DIRECT_MESSAGE') return 'DIRECT';
  return 'INQUIRY';
}

function marketplaceFromCurrency(currency) {
  const map = {
    USD: 'EBAY_US',
    CAD: 'EBAY_CA',
    AUD: 'EBAY_AU',
    GBP: 'EBAY_GB',
    EUR: 'EBAY_DE'
  };
  return map[String(currency || '').toUpperCase()] || null;
}

/** eBay Fulfillment line items use image.imageUrl; some stores flatten to imageUrl. */
function imageFromLineItem(li) {
  if (!li) return null;
  return (
    li.imageUrl ||
    li.image?.imageUrl ||
    li.thumbnailImages?.[0]?.imageUrl ||
    li.image?.url ||
    null
  );
}

/**
 * Grow groups inbox rows by orderId+buyer+item. Commerce cache is one row per
 * eBay conversationId, so the same order can appear twice. Collapse those.
 * When an orderId is present, ignore itemId so multi-conversation order chats
 * (as in the Nguyet Tran duplicate) become a single inbox row.
 */
function threadDedupeKey(t) {
  const seller = String(t.sellerId || '');
  const buyer = String(t.buyerUsername || '').trim().toLowerCase();
  const orderId = String(t.orderId || '').trim();
  if (orderId) return `${seller}|o:${orderId}|b:${buyer}`;
  const item = String(t.itemId || '').trim() || 'DIRECT_MESSAGE';
  return `${seller}|b:${buyer}|i:${item}`;
}

function dedupeThreadsLikeGrow(threads = []) {
  const map = new Map();
  for (const t of threads) {
    const key = threadDedupeKey(t);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...t });
      continue;
    }
    const ta = t.lastDate ? new Date(t.lastDate).getTime() : 0;
    const tb = existing.lastDate ? new Date(existing.lastDate).getTime() : 0;
    const newer = ta >= tb ? t : existing;
    const older = ta >= tb ? existing : t;
    map.set(key, {
      ...newer,
      unreadCount: (Number(existing.unreadCount) || 0) + (Number(t.unreadCount) || 0),
      productImageUrl: newer.productImageUrl || older.productImageUrl || null,
      itemTitle: newer.itemTitle || older.itemTitle || '',
      buyerName: newer.buyerName || older.buyerName || '',
      orderId: newer.orderId || older.orderId || null,
      itemId: newer.itemId || older.itemId || null
    });
  }
  return [...map.values()].sort((a, b) => {
    const ta = a.lastDate ? new Date(a.lastDate).getTime() : 0;
    const tb = b.lastDate ? new Date(b.lastDate).getTime() : 0;
    return tb - ta;
  });
}

async function resolveOrderId({ sellerId, conversationId, buyerUsername, referenceId, existingOrderId, buyerFullName }) {
  if (existingOrderId) return String(existingOrderId);
  const buyer = String(buyerUsername || '').trim();
  const itemId = String(referenceId || '').trim();
  const convId = String(conversationId || '').trim();

  if (convId) {
    // Legacy Message store keyed by conversationId
    const byConv = await Message.findOne({
      seller: sellerId,
      conversationId: convId,
      orderId: { $nin: [null, ''] }
    })
      .select('orderId buyerUsername')
      .lean();
    if (byConv?.orderId) {
      // Only accept if the order's buyer matches this conversation's buyer.
      // Same-item inquiries were historically stamped with another buyer's orderId.
      const order = await Order.findOne({ orderId: String(byConv.orderId) })
        .select('buyer.username')
        .lean();
      const orderBuyer = String(order?.buyer?.username || '').trim().toLowerCase();
      const threadBuyer = String(buyer || byConv.buyerUsername || '').trim().toLowerCase();
      if (!orderBuyer || !threadBuyer || orderBuyer === threadBuyer) {
        return String(byConv.orderId);
      }
    }

    // Cached commerce messages sometimes carry the order in their raw payload
    const cachedMsg = await EbayMessageConversationMessage.findOne({
      seller: sellerId,
      conversationId: convId,
      'raw.orderId': { $nin: [null, ''] }
    })
      .select('raw.orderId')
      .lean();
    if (cachedMsg?.raw?.orderId) {
      const order = await Order.findOne({ orderId: String(cachedMsg.raw.orderId) })
        .select('buyer.username')
        .lean();
      const orderBuyer = String(order?.buyer?.username || '').trim().toLowerCase();
      const threadBuyer = String(buyer || '').trim().toLowerCase();
      if (!orderBuyer || !threadBuyer || orderBuyer === threadBuyer) {
        return String(cachedMsg.raw.orderId);
      }
    }
  }

  if (buyer && itemId) {
    const byThread = await Message.findOne({
      seller: sellerId,
      buyerUsername: new RegExp(`^${escapeRegexLiteral(buyer)}$`, 'i'),
      itemId,
      orderId: { $nin: [null, ''] }
    })
      .select('orderId')
      .lean();
    if (byThread?.orderId) return String(byThread.orderId);

    // Match the order by item + buyer. eBay uses the buyer's UserID, but some
    // records carry the registration full name, so match either reliably.
    const buyerMatchers = [new RegExp(`^${escapeRegexLiteral(buyer)}$`, 'i')];
    const fullName = String(buyerFullName || '').trim();
    const order = await Order.findOne({
      seller: sellerId,
      'lineItems.legacyItemId': itemId,
      $or: [
        { 'buyer.username': { $in: buyerMatchers } },
        ...(fullName
          ? [{ 'buyer.buyerRegistrationAddress.fullName': new RegExp(`^${escapeRegexLiteral(fullName)}$`, 'i') }]
          : [])
      ]
    })
      .select('orderId')
      .sort({ creationDate: -1 })
      .lean();
    if (order?.orderId) return String(order.orderId);
  }
  return '';
}

/**
 * Resolve missing orderIds for a small page of candidates in a few batch queries
 * (not N×4 per-row lookups). Used by the V2 inbox path so All Messages can show
 * correct Order/Inquiry badges without the 7s serial resolve cost.
 *
 * CRITICAL: never attach an order whose buyer.username does not match the
 * conversation buyer. Legacy Message rows sometimes stamped a listing's order
 * onto a different buyer's inquiry (same itemId) — that made two buyers show
 * the same name/order in the inbox.
 */
async function batchResolveOrderIds(candidates = []) {
  const resolved = new Map(); // row._id -> orderId
  const needing = (candidates || []).filter(
    (c) => !c.cachedOrderId && (c.row?.conversationId || c.row?.referenceId || c.itemId)
  );
  if (!needing.length) return resolved;

  const convIds = [
    ...new Set(needing.map((c) => String(c.row?.conversationId || '').trim()).filter(Boolean))
  ];
  const sellerOids = [
    ...new Set(
      needing
        .map((c) => String(c.sellerIdVal || ''))
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
    )
  ].map((id) => new mongoose.Types.ObjectId(id));

  // conversationId -> tentative orderId from Message / commerce raw (unverified)
  const convToOrderTentative = new Map();

  if (convIds.length) {
    const [byConv, byRaw] = await Promise.all([
      Message.find({
        conversationId: { $in: convIds },
        orderId: { $nin: [null, ''] },
        ...(sellerOids.length ? { seller: { $in: sellerOids } } : {})
      })
        .select('conversationId orderId seller buyerUsername')
        .lean(),
      EbayMessageConversationMessage.find({
        conversationId: { $in: convIds },
        'raw.orderId': { $nin: [null, ''] },
        ...(sellerOids.length ? { seller: { $in: sellerOids } } : {})
      })
        .select('conversationId raw.orderId seller')
        .lean()
    ]);

    // Index candidates by conversation for buyer checks
    const buyerByConv = new Map();
    for (const c of needing) {
      const key = `${c.sellerIdVal}|${c.row?.conversationId}`;
      buyerByConv.set(key, String(c.buyerUsername || '').trim().toLowerCase());
    }

    for (const m of byConv) {
      const key = `${m.seller}|${m.conversationId}`;
      if (convToOrderTentative.has(key) || !m.orderId) continue;
      const threadBuyer = buyerByConv.get(key);
      const msgBuyer = String(m.buyerUsername || '').trim().toLowerCase();
      // Message.buyerUsername must match the conversation buyer when present
      if (threadBuyer && msgBuyer && threadBuyer !== msgBuyer) continue;
      convToOrderTentative.set(key, String(m.orderId));
    }
    for (const m of byRaw) {
      const key = `${m.seller}|${m.conversationId}`;
      const oid = m.raw?.orderId;
      if (!convToOrderTentative.has(key) && oid) {
        convToOrderTentative.set(key, String(oid));
      }
    }
  }

  // Verify every tentative orderId against Order.buyer.username
  const tentativePairs = [];
  for (const c of needing) {
    const key = `${c.sellerIdVal}|${c.row?.conversationId}`;
    const oid = convToOrderTentative.get(key);
    if (oid) tentativePairs.push({ c, oid });
  }

  const tentativeOrderIds = [...new Set(tentativePairs.map((p) => p.oid))];
  const orderBuyerById = new Map();
  if (tentativeOrderIds.length) {
    const orders = await Order.find({ orderId: { $in: tentativeOrderIds } })
      .select('orderId buyer.username')
      .lean();
    for (const o of orders) {
      orderBuyerById.set(
        String(o.orderId),
        String(o.buyer?.username || '').trim().toLowerCase()
      );
    }
  }

  const stillNeeding = [];
  for (const c of needing) {
    const key = `${c.sellerIdVal}|${c.row?.conversationId}`;
    const oid = convToOrderTentative.get(key);
    if (oid) {
      const orderBuyer = orderBuyerById.get(String(oid)) || '';
      const threadBuyer = String(c.buyerUsername || '').trim().toLowerCase();
      if (orderBuyer && threadBuyer && orderBuyer === threadBuyer) {
        resolved.set(String(c.row._id), String(oid));
        continue;
      }
      // Tentative order belongs to a different buyer — ignore it
    }
    stillNeeding.push(c);
  }

  if (stillNeeding.length) {
    const itemIds = [
      ...new Set(
        stillNeeding
          .map((c) => String(c.itemId || c.row?.referenceId || '').trim())
          .filter((id) => id && id !== 'DIRECT_MESSAGE')
      )
    ];
    const buyerNames = [
      ...new Set(stillNeeding.map((c) => String(c.buyerUsername || '').trim()).filter(Boolean))
    ];

    if (itemIds.length && buyerNames.length && sellerOids.length) {
      const buyerRegexes = buyerNames.map(
        (b) => new RegExp(`^${escapeRegexLiteral(b)}$`, 'i')
      );
      const orders = await Order.find({
        seller: { $in: sellerOids },
        'lineItems.legacyItemId': { $in: itemIds },
        'buyer.username': { $in: buyerRegexes }
      })
        .select('orderId seller buyer lineItems creationDate')
        .sort({ creationDate: -1 })
        .lean();

      const orderKeyMap = new Map();
      for (const o of orders) {
        const buyerU = String(o.buyer?.username || '').toLowerCase();
        const sid = String(o.seller);
        for (const li of o.lineItems || []) {
          const item = String(li.legacyItemId || '').trim();
          if (!item) continue;
          const key = `${sid}|${item}|${buyerU}`;
          if (!orderKeyMap.has(key)) orderKeyMap.set(key, String(o.orderId));
        }
      }

      for (const c of stillNeeding) {
        const item = String(c.itemId || c.row?.referenceId || '').trim();
        if (!item || item === 'DIRECT_MESSAGE') continue;
        const key = `${c.sellerIdVal}|${item}|${String(c.buyerUsername || '').toLowerCase()}`;
        const oid = orderKeyMap.get(key);
        if (oid) resolved.set(String(c.row._id), oid);
      }
    }
  }

  return resolved;
}

/**
 * List Buyer Messages threads from EbayMessageConversation cache (LIVE page).
 *
 * Original behavior — enriches with on-the-fly resolveOrderId so All/Order views
 * classify correctly. Left UNCHANGED so the live Buyer Messages page is not
 * affected by the Test page experiments. The fast/experimental path lives in
 * listBuyerChatThreadsFromCommerceV2 and is only used when variant === 'v2'.
 */
export async function listBuyerChatThreadsFromCommerce(query = {}) {
  const {
    sellerId,
    page = 1,
    limit = 20,
    search = '',
    filterType = 'ALL',
    filterMarketplace = '',
    showUnreadOnly = 'false',
    showReadOnly = 'false',
    readFilter = '',
    maxAgeDays = '45'
  } = query;

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const skip = (pageNum - 1) * limitNum;
  let ageDays = parseInt(maxAgeDays, 10);
  if (Number.isNaN(ageDays) || ageDays <= 0) ageDays = 45;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ageDays);

  const match = {
    conversationType: 'FROM_MEMBERS',
    $or: [
      { ebayUpdatedDate: { $gte: cutoff } },
      { ebayUpdatedDate: null, lastSyncedAt: { $gte: cutoff } }
    ]
  };

  if (sellerId && mongoose.Types.ObjectId.isValid(sellerId)) {
    match.seller = new mongoose.Types.ObjectId(sellerId);
  }

  if (showUnreadOnly === 'true' || readFilter === 'unread') {
    match.unreadCount = { $gt: 0 };
  } else if (showReadOnly === 'true' || readFilter === 'read') {
    match.$and = match.$and || [];
    match.$and.push({
      $or: [{ unreadCount: 0 }, { unreadCount: { $exists: false } }, { unreadCount: null }]
    });
  }

  if (search && String(search).trim()) {
    const regex = new RegExp(escapeRegexLiteral(String(search).trim()), 'i');
    match.$and = match.$and || [];
    match.$and.push({
      $or: [
        { otherPartyUsername: regex },
        { referenceId: regex },
        { orderId: regex },
        { conversationTitle: regex },
        { conversationId: regex },
        { 'latestMessage.messageBody': regex },
        { 'latestMessage.senderUsername': regex },
        { 'latestMessage.recipientUsername': regex }
      ]
    });
  }

  const scopeMatch = { ...match };
  if (Array.isArray(match.$and)) scopeMatch.$and = [...match.$and];

  if (filterType === 'ORDER') {
    match.orderId = { $exists: true, $nin: [null, ''] };
  } else if (filterType === 'INQUIRY') {
    match.$and = match.$and || [];
    match.$and.push({
      $or: [{ orderId: null }, { orderId: '' }, { orderId: { $exists: false } }]
    });
    match.referenceId = { $exists: true, $nin: [null, '', 'DIRECT_MESSAGE'] };
  } else if (filterType === 'DIRECT') {
    match.$and = match.$and || [];
    match.$and.push({
      $or: [{ orderId: null }, { orderId: '' }, { orderId: { $exists: false } }]
    });
    match.$and.push({
      $or: [
        { referenceId: null },
        { referenceId: '' },
        { referenceId: { $exists: false } },
        { referenceId: 'DIRECT_MESSAGE' }
      ]
    });
  }

  const fetchLimit = Math.min(Math.max(limitNum * 5, 100), 500);
  const [rows, poolCount] = await Promise.all([
    EbayMessageConversation.find(match)
      .populate({ path: 'seller', populate: { path: 'user', select: 'username email' } })
      .sort({ ebayUpdatedDate: -1, lastSyncedAt: -1 })
      .limit(fetchLimit)
      .lean(),
    filterType && filterType !== 'ALL'
      ? EbayMessageConversation.countDocuments(scopeMatch)
      : null
  ]);

  const itemIds = [...new Set(rows.map((r) => r.referenceId).filter(Boolean))];
  const orderIds = [...new Set(rows.map((r) => r.orderId).filter(Boolean))];

  const [listings, orders] = await Promise.all([
    itemIds.length
      ? Listing.find({ itemId: { $in: itemIds } })
          .select('itemId mainImageUrl currency title')
          .lean()
      : [],
    orderIds.length
      ? Order.find({ orderId: { $in: orderIds } })
          .select('orderId buyer purchaseMarketplaceId lineItems productName')
          .lean()
      : []
  ]);

  const listingByItem = new Map(listings.map((l) => [String(l.itemId), l]));
  const orderById = new Map(orders.map((o) => [String(o.orderId), o]));

  const orderItemIds = [];
  for (const o of orders) {
    for (const li of o.lineItems || []) {
      const id = String(li.legacyItemId || '').trim();
      if (id && !listingByItem.has(id)) orderItemIds.push(id);
    }
  }
  if (orderItemIds.length) {
    const extraListings = await Listing.find({ itemId: { $in: [...new Set(orderItemIds)] } })
      .select('itemId mainImageUrl currency title')
      .lean();
    for (const l of extraListings) listingByItem.set(String(l.itemId), l);
  }

  const rowsBySeller = new Map();
  for (const row of rows) {
    const sid = String(row.seller?._id || row.seller || '');
    if (!sid) continue;
    if (!rowsBySeller.has(sid)) rowsBySeller.set(sid, []);
    rowsBySeller.get(sid).push(row);
  }
  const inferredEbayBySeller = new Map();
  for (const [sid, sellerRows] of rowsBySeller) {
    const inferred = inferSellerEbayUsername(sellerRows);
    if (inferred) inferredEbayBySeller.set(sid, inferred);
  }

  for (const [sid, ebayUser] of inferredEbayBySeller) {
    const sample = rowsBySeller.get(sid)?.[0]?.seller;
    if (sample && !sample.ebayUserId) {
      Seller.updateOne({ _id: sid }, { $set: { ebayUserId: ebayUser } }).catch(() => {});
    }
  }

  let threads = [];
  for (const row of rows) {
    const seller = row.seller;
    const sellerIdVal = seller?._id || row.seller;
    const sid = String(sellerIdVal || '');
    const inferredEbay = inferredEbayBySeller.get(sid) || '';
    const sellerNames = getSellerIdentityNames(seller, inferredEbay ? [inferredEbay] : []);

    const latest = row.latestMessage || {};
    let buyerUsername = resolveBuyerUsername(sellerNames, {
      senderUsername: latest.senderUsername,
      recipientUsername: latest.recipientUsername,
      otherPartyUsername: row.otherPartyUsername
    });

    if (
      buyerUsername &&
      row.otherPartyUsername &&
      String(row.otherPartyUsername).toLowerCase() !== buyerUsername.toLowerCase()
    ) {
      EbayMessageConversation.updateOne(
        { _id: row._id },
        { $set: { otherPartyUsername: buyerUsername } }
      ).catch(() => {});
    } else if (
      !buyerUsername &&
      latest.senderUsername &&
      latest.recipientUsername &&
      inferredEbay
    ) {
      buyerUsername = resolveBuyerUsername([inferredEbay, ...sellerNames], {
        senderUsername: latest.senderUsername,
        recipientUsername: latest.recipientUsername
      });
    }

    if (!buyerUsername) {
      continue;
    }

    const cachedOrderId = String(row.orderId || '').trim();
    let itemId = String(row.referenceId || '').trim();
    if (!itemId && !cachedOrderId) itemId = 'DIRECT_MESSAGE';
    const cachedType = messageTypeFromThread({
      orderId: cachedOrderId,
      itemId
    });

    if (filterType === 'ORDER' && cachedType !== 'ORDER') continue;
    if (filterType === 'INQUIRY' && cachedType !== 'INQUIRY') continue;
    if (filterType === 'DIRECT' && cachedType !== 'DIRECT') continue;

    let orderId = cachedOrderId;
    if (!orderId && filterType !== 'INQUIRY' && filterType !== 'DIRECT') {
      orderId = await resolveOrderId({
        sellerId: sellerIdVal,
        conversationId: row.conversationId,
        buyerUsername,
        referenceId: row.referenceId,
        existingOrderId: ''
      });
      if (orderId && !orderById.has(String(orderId))) {
        const fresh = await Order.findOne({ orderId: String(orderId) })
          .select('orderId buyer purchaseMarketplaceId lineItems productName')
          .lean();
        if (fresh) orderById.set(String(orderId), fresh);
      }
    }

    let listing = row.referenceId ? listingByItem.get(String(row.referenceId)) : null;
    const order = orderId ? orderById.get(String(orderId)) : null;

    if (!itemId && order?.lineItems?.[0]?.legacyItemId) {
      itemId = order.lineItems[0].legacyItemId;
    }
    if (!itemId && !orderId) itemId = 'DIRECT_MESSAGE';
    if (!listing && itemId && itemId !== 'DIRECT_MESSAGE') {
      listing = listingByItem.get(String(itemId)) || null;
    }

    const actualMessageType =
      filterType === 'INQUIRY' || filterType === 'DIRECT'
        ? cachedType
        : messageTypeFromThread({ orderId, itemId });

    const marketplaceId =
      order?.purchaseMarketplaceId ||
      marketplaceFromCurrency(listing?.currency) ||
      (itemId === 'DIRECT_MESSAGE' ? 'System' : 'Unknown');

    if (filterMarketplace && filterMarketplace !== '' && marketplaceId !== filterMarketplace) {
      continue;
    }

      const senderRole = resolveSenderRole(
        latest.senderUsername,
        buyerUsername,
        sellerNames,
        latest.recipientUsername
      );
    const sellerUsername = seller?.user?.username || '';
    const sellerEmail = seller?.user?.email || '';
    const buyerLooksLikeSeller =
      Boolean(buyerUsername) &&
      sellerNames.some((n) => n.toLowerCase() === buyerUsername.toLowerCase());

    const matchedLine =
      order?.lineItems?.find((li) => String(li.legacyItemId) === String(itemId)) ||
      order?.lineItems?.[0];

    threads.push({
      conversationId: row.conversationId,
      orderId: orderId || null,
      buyerUsername,
      buyerName: buyerDisplayNameFromOrder(order),
      buyerLooksLikeSeller,
      itemId: itemId || null,
      itemTitle:
        row.conversationTitle ||
        listing?.title ||
        matchedLine?.title ||
        order?.productName ||
        '',
      sellerId: sellerIdVal,
      sellerUsername,
      sellerEmail,
      sellerEbayUsername: inferredEbay || seller?.ebayUserId || '',
      lastSenderUsername: latest.senderUsername || '',
      lastRecipientUsername: latest.recipientUsername || '',
      lastMessage: stripHtml(latest.messageBody || latest.subject || '') || '(No messages yet)',
      lastDate: latest.createdDate || row.ebayUpdatedDate || row.lastSyncedAt || row.updatedAt,
      sender: senderRole,
      unreadCount: Number(row.unreadCount) || 0,
      messageType: actualMessageType,
      actualMessageType,
      marketplaceId,
      productImageUrl: listing?.mainImageUrl || imageFromLineItem(matchedLine) || null,
      conversationStatus: row.conversationStatus || '',
      source: 'commerce'
    });
  }

  threads.sort((a, b) => {
    const ta = a.lastDate ? new Date(a.lastDate).getTime() : 0;
    const tb = b.lastDate ? new Date(b.lastDate).getTime() : 0;
    return tb - ta;
  });

  const total = threads.length;
  const pageThreads = threads.slice(skip, skip + limitNum);

  return {
    threads: pageThreads,
    total,
    poolCount: poolCount === null ? total : poolCount,
    page: pageNum,
    pages: Math.ceil(total / limitNum) || 1,
    source: 'commerce'
  };
}

/**
 * V2 (Buyer Messages TEST page only) — fast paginate-before-enrich +
 * referenceType-based classification. Selected via variant === 'v2' so it never
 * affects the live Buyer Messages page.
 */
export async function listBuyerChatThreadsFromCommerceV2(query = {}) {
  const {
    sellerId,
    page = 1,
    limit = 20,
    search = '',
    filterType = 'ALL',
    filterMarketplace = '',
    showUnreadOnly = 'false',
    showReadOnly = 'false',
    readFilter = '',
    maxAgeDays = '45'
  } = query;

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const skip = (pageNum - 1) * limitNum;
  let ageDays = parseInt(maxAgeDays, 10);
  if (Number.isNaN(ageDays) || ageDays <= 0) ageDays = 45;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ageDays);

  const match = {
    conversationType: 'FROM_MEMBERS',
    $or: [
      { ebayUpdatedDate: { $gte: cutoff } },
      { ebayUpdatedDate: null, lastSyncedAt: { $gte: cutoff } }
    ]
  };

  if (sellerId && mongoose.Types.ObjectId.isValid(sellerId)) {
    match.seller = new mongoose.Types.ObjectId(sellerId);
  }

  if (showUnreadOnly === 'true' || readFilter === 'unread') {
    match.unreadCount = { $gt: 0 };
  } else if (showReadOnly === 'true' || readFilter === 'read') {
    match.$and = match.$and || [];
    match.$and.push({
      $or: [{ unreadCount: 0 }, { unreadCount: { $exists: false } }, { unreadCount: null }]
    });
  }

  if (search && String(search).trim()) {
    const regex = new RegExp(escapeRegexLiteral(String(search).trim()), 'i');
    match.$and = match.$and || [];
    match.$and.push({
      $or: [
        { otherPartyUsername: regex },
        { referenceId: regex },
        { orderId: regex },
        { conversationTitle: regex },
        { conversationId: regex },
        { 'latestMessage.messageBody': regex },
        { 'latestMessage.senderUsername': regex },
        { 'latestMessage.recipientUsername': regex }
      ]
    });
  }

  // Snapshot the scope (seller + age + read/search) BEFORE the Type constraint.
  // The route uses poolCount to decide commerce-vs-legacy consistently across
  // filters: if the cache has ANY conversation for this scope, every Type filter
  // is served from commerce so "Inquiries Only" never falls through to a
  // different data source than "All Messages" (which was hiding inquiries).
  const scopeMatch = { ...match };
  if (Array.isArray(match.$and)) scopeMatch.$and = [...match.$and];

  // Type constraint. Inquiry/Direct can use cache fields. Order is deferred until
  // after batch-resolve (many true order chats have empty orderId in cache after
  // earlier sync wipes), otherwise "Order Related" looks empty.
  if (filterType === 'INQUIRY') {
    match.$and = match.$and || [];
    match.$and.push({
      $or: [{ orderId: null }, { orderId: '' }, { orderId: { $exists: false } }]
    });
    match.$and.push({
      $or: [
        { referenceType: { $regex: /^listing$/i } },
        {
          $and: [
            { referenceId: { $exists: true, $nin: [null, '', 'DIRECT_MESSAGE'] } },
            { referenceType: { $not: { $regex: /^order$/i } } }
          ]
        }
      ]
    });
  } else if (filterType === 'DIRECT') {
    match.$and = match.$and || [];
    match.$and.push({
      $or: [{ orderId: null }, { orderId: '' }, { orderId: { $exists: false } }]
    });
    match.$and.push({
      $or: [
        { referenceId: null },
        { referenceId: '' },
        { referenceId: { $exists: false } },
        { referenceId: 'DIRECT_MESSAGE' }
      ]
    });
  }
  // ORDER: no mongo type constraint — filter after batch-resolve below.

  // Grow-style: overfetch a window for type/marketplace filtering, but do NOT
  // enrich (order/listing lookups) until after we know which rows are on the
  // returned page — except Order filter, which must resolve before filtering.
  const needsMarketplace = Boolean(filterMarketplace && filterMarketplace !== '');
  const resolveBeforePage = needsMarketplace || filterType === 'ORDER';
  const fetchLimit = resolveBeforePage
    ? Math.min(Math.max(limitNum * 5, 100), 500)
    : Math.min(Math.max(skip + limitNum + 25, 60), 200);
  const LIST_PROJECTION =
    'seller conversationId conversationTitle conversationStatus otherPartyUsername referenceType referenceId orderId unreadCount latestMessage ebayUpdatedDate lastSyncedAt updatedAt';
  const [rows, poolExists] = await Promise.all([
    EbayMessageConversation.find(match)
      .select(LIST_PROJECTION)
      .populate({
        path: 'seller',
        select: 'ebayUserId ebayUsername username user',
        populate: { path: 'user', select: 'username email' }
      })
      .sort({ ebayUpdatedDate: -1, lastSyncedAt: -1 })
      .limit(fetchLimit)
      .lean(),
    // Cheap existence check (not countDocuments) — route only needs poolCount > 0
    // to stay on commerce when a Type filter matches 0 rows.
    filterType && filterType !== 'ALL'
      ? EbayMessageConversation.findOne(scopeMatch).select('_id').lean()
      : null
  ]);
  const poolCount =
    filterType && filterType !== 'ALL' ? (poolExists ? 1 : 0) : null;

  // Infer eBay UserID per seller in-memory only (no Seller.updateOne on the read path)
  const rowsBySeller = new Map();
  for (const row of rows) {
    const sid = String(row.seller?._id || row.seller || '');
    if (!sid) continue;
    if (!rowsBySeller.has(sid)) rowsBySeller.set(sid, []);
    rowsBySeller.get(sid).push(row);
  }
  const inferredEbayBySeller = new Map();
  for (const [sid, sellerRows] of rowsBySeller) {
    const inferred = inferSellerEbayUsername(sellerRows);
    if (inferred) inferredEbayBySeller.set(sid, inferred);
  }

  // Pass 1 — lightweight candidates from cached fields only (zero extra DB reads).
  // Type filter + sort happen here so we can paginate before enrichment.
  const candidates = [];
  for (const row of rows) {
    const seller = row.seller;
    const sellerIdVal = seller?._id || row.seller;
    const sid = String(sellerIdVal || '');
    const inferredEbay = inferredEbayBySeller.get(sid) || '';
    const sellerNames = getSellerIdentityNames(seller, inferredEbay ? [inferredEbay] : []);
    const latest = row.latestMessage || {};

    let buyerUsername = resolveBuyerUsername(sellerNames, {
      senderUsername: latest.senderUsername,
      recipientUsername: latest.recipientUsername,
      otherPartyUsername: row.otherPartyUsername
    });
    if (
      !buyerUsername &&
      latest.senderUsername &&
      latest.recipientUsername &&
      inferredEbay
    ) {
      buyerUsername = resolveBuyerUsername([inferredEbay, ...sellerNames], {
        senderUsername: latest.senderUsername,
        recipientUsername: latest.recipientUsername
      });
    }
    if (!buyerUsername) continue;

    const refType = String(row.referenceType || '').trim().toUpperCase();
    const refId = String(row.referenceId || '').trim();
    // Prefer cached orderId; fall back to eBay ORDER referenceId (sync used to
    // wipe orderId to '', which made every thread look like an inquiry).
    let cachedOrderId = String(row.orderId || '').trim();
    if (!cachedOrderId && refType === 'ORDER' && refId) cachedOrderId = refId;

    let itemId = '';
    if (refType === 'LISTING' && refId) {
      itemId = refId;
    } else if (refType !== 'ORDER' && refId && !cachedOrderId) {
      itemId = refId;
    }
    if (!itemId && !cachedOrderId) itemId = 'DIRECT_MESSAGE';

    const cachedType = messageTypeFromThread({
      orderId: cachedOrderId || (refType === 'ORDER' ? refId : ''),
      itemId: refType === 'ORDER' ? itemId || null : itemId
    });
    // Force ORDER when eBay says so even if itemId was wrongly set earlier
    const type =
      refType === 'ORDER' || cachedOrderId
        ? 'ORDER'
        : cachedType;

    if (filterType === 'INQUIRY' && type !== 'INQUIRY') continue;
    if (filterType === 'DIRECT' && type !== 'DIRECT') continue;
    // ORDER filtered after batch-resolve (see resolveBeforePage below)

    candidates.push({
      row,
      seller,
      sellerIdVal,
      inferredEbay,
      sellerNames,
      latest,
      buyerUsername,
      cachedOrderId,
      itemId,
      cachedType: type,
      lastDate: latest.createdDate || row.ebayUpdatedDate || row.lastSyncedAt || row.updatedAt
    });
  }

  candidates.sort((a, b) => {
    const ta = a.lastDate ? new Date(a.lastDate).getTime() : 0;
    const tb = b.lastDate ? new Date(b.lastDate).getTime() : 0;
    return tb - ta;
  });

  /**
   * Display enrichment for a page of candidates only.
   * For All / Order views: batch-resolve missing orderIds (2–3 queries total),
   * then load Order + Listing docs. That fixes "All Messages shows only Inquiry
   * badges" without the old per-row resolveOrderId cost.
   * Inquiry / Direct filters keep cached classification (no resolve) so true
   * listing inquiries are not reclassified as Order.
   */
  async function enrichCandidates(slice) {
    const listingByItem = new Map();
    const orderById = new Map();
    const enrichOrders = filterType !== 'INQUIRY' && filterType !== 'DIRECT';
    const resolvedOrderIds = enrichOrders
      ? await batchResolveOrderIds(slice)
      : new Map();

    const orderIds = [
      ...new Set(
        slice
          .map((c) => c.cachedOrderId || resolvedOrderIds.get(String(c.row._id)) || '')
          .filter(Boolean)
      )
    ];
    const itemIds = [
      ...new Set(
        slice
          .map((c) => String(c.row.referenceId || c.itemId || '').trim())
          .filter((id) => id && id !== 'DIRECT_MESSAGE')
      )
    ];

    const [listings, orders] = await Promise.all([
      itemIds.length
        ? Listing.find({ itemId: { $in: itemIds } })
            .select('itemId mainImageUrl currency title')
            .lean()
        : [],
      orderIds.length
        ? Order.find({ orderId: { $in: orderIds } })
            .select('orderId buyer purchaseMarketplaceId lineItems productName')
            .lean()
        : []
    ]);
    for (const l of listings) listingByItem.set(String(l.itemId), l);
    for (const o of orders) orderById.set(String(o.orderId), o);

    const orderItemIds = [];
    for (const o of orders) {
      for (const li of o.lineItems || []) {
        const id = String(li.legacyItemId || '').trim();
        if (id && !listingByItem.has(id)) orderItemIds.push(id);
      }
    }
    if (orderItemIds.length) {
      const extraListings = await Listing.find({
        itemId: { $in: [...new Set(orderItemIds)] }
      })
        .select('itemId mainImageUrl currency title')
        .lean();
      for (const l of extraListings) listingByItem.set(String(l.itemId), l);
    }

    return slice.map((c) => {
      let orderId = c.cachedOrderId;
      if (!orderId && enrichOrders) {
        orderId = resolvedOrderIds.get(String(c.row._id)) || '';
      }
      let itemId = c.itemId;
      let listing = c.row.referenceId
        ? listingByItem.get(String(c.row.referenceId))
        : null;
      let order = orderId ? orderById.get(String(orderId)) : null;

      // Drop order link if the order belongs to a different eBay buyer
      // (legacy Message rows sometimes stamped another buyer's orderId onto an inquiry).
      const threadBuyer = String(c.buyerUsername || '').trim().toLowerCase();
      const orderBuyer = String(order?.buyer?.username || '').trim().toLowerCase();
      if (order && threadBuyer && orderBuyer && threadBuyer !== orderBuyer) {
        order = null;
        orderId = '';
      }

      if (!itemId && order?.lineItems?.[0]?.legacyItemId) {
        itemId = order.lineItems[0].legacyItemId;
      }
      if (!itemId && !orderId) itemId = 'DIRECT_MESSAGE';
      if (!listing && itemId && itemId !== 'DIRECT_MESSAGE') {
        listing = listingByItem.get(String(itemId)) || null;
      }

      const actualMessageType =
        filterType === 'INQUIRY' || filterType === 'DIRECT'
          ? c.cachedType
          : messageTypeFromThread({ orderId, itemId });

      const marketplaceId =
        order?.purchaseMarketplaceId ||
        marketplaceFromCurrency(listing?.currency) ||
        (itemId === 'DIRECT_MESSAGE' ? 'System' : 'Unknown');

      const matchedLine =
        order?.lineItems?.find((li) => String(li.legacyItemId) === String(itemId)) ||
        order?.lineItems?.[0];

      const senderRole = resolveSenderRole(
        c.latest.senderUsername,
        c.buyerUsername,
        c.sellerNames,
        c.latest.recipientUsername
      );
      const buyerLooksLikeSeller =
        Boolean(c.buyerUsername) &&
        c.sellerNames.some((n) => n.toLowerCase() === c.buyerUsername.toLowerCase());

      return {
        conversationId: c.row.conversationId,
        orderId: orderId || null,
        buyerUsername: c.buyerUsername,
        buyerName: buyerDisplayNameFromOrder(order),
        buyerLooksLikeSeller,
        itemId: itemId || null,
        itemTitle:
          c.row.conversationTitle ||
          listing?.title ||
          matchedLine?.title ||
          order?.productName ||
          '',
        sellerId: c.sellerIdVal,
        sellerUsername: c.seller?.user?.username || '',
        sellerEmail: c.seller?.user?.email || '',
        sellerEbayUsername: c.inferredEbay || c.seller?.ebayUserId || '',
        lastSenderUsername: c.latest.senderUsername || '',
        lastRecipientUsername: c.latest.recipientUsername || '',
        lastMessage:
          stripHtml(c.latest.messageBody || c.latest.subject || '') ||
          '(No messages yet)',
        lastDate: c.lastDate,
        sender: senderRole,
        unreadCount: Number(c.row.unreadCount) || 0,
        messageType: actualMessageType,
        actualMessageType,
        marketplaceId,
        productImageUrl:
          listing?.mainImageUrl || imageFromLineItem(matchedLine) || null,
        conversationStatus: c.row.conversationStatus || '',
        source: 'commerce'
      };
    });
  }

  let pageThreads;
  let total;

  if (resolveBeforePage) {
    // Order / marketplace need resolved fields before we can filter rows, so
    // enrich the overfetch window, filter, then paginate.
    const enriched = await enrichCandidates(candidates);
    let filtered = enriched;
    if (filterType === 'ORDER') {
      filtered = filtered.filter((t) => t.actualMessageType === 'ORDER');
    }
    if (needsMarketplace) {
      filtered = filtered.filter((t) => t.marketplaceId === filterMarketplace);
    }
    filtered = dedupeThreadsLikeGrow(filtered);
    total = filtered.length;
    pageThreads = filtered.slice(skip, skip + limitNum);
  } else {
    // Default All / Inquiry / Direct: take a small buffer past the page so
    // same-order duplicates that sit next to each other can merge, then trim.
    total = candidates.length;
    const pageSlice = candidates.slice(skip, skip + limitNum + 20);
    let enriched = pageSlice.length ? await enrichCandidates(pageSlice) : [];
    enriched = dedupeThreadsLikeGrow(enriched);
    pageThreads = enriched.slice(0, limitNum);
    // Approximate total after merge (can't know global merge without full scan)
    if (enriched.length < pageSlice.length) {
      total = Math.max(pageThreads.length, total - (pageSlice.length - enriched.length));
    }
  }

  return {
    threads: pageThreads,
    total,
    // Number of cached conversations for this scope ignoring the Type filter.
    // null for ALL (no separate pool needed). The route uses this so ALL and
    // Inquiries/Order/Direct always read from the same source.
    poolCount: poolCount === null ? total : poolCount,
    page: pageNum,
    pages: Math.ceil(total / limitNum) || 1,
    source: 'commerce'
  };
}

/**
 * Load chat messages for BuyerChat from conversation message cache.
 * Falls back to Message collection when no commerce conversation is found.
 */
/**
 * Find the Buyer Messages Commerce conversation(s) for a case/thread identity.
 * Prefer exact seller + buyerId + orderId (one specific chat), same as BM.
 */
export async function findBuyerChatConversationsFromCommerce(query = {}) {
  const { orderId, buyerUsername, itemId, sellerId, conversationId } = query;

  let conv = null;
  let orderMatchedConversations = null;
  let trustedOrderId = '';
  let strictSingleConversation = false;
  const sellerOid =
    sellerId && mongoose.Types.ObjectId.isValid(sellerId)
      ? new mongoose.Types.ObjectId(sellerId)
      : null;
  const oid = String(orderId || '').trim();
  const requestedBuyer = String(buyerUsername || '').trim();
  const requestedBuyerLc = requestedBuyer.toLowerCase();
  const buyerRe = requestedBuyer
    ? new RegExp(`^${escapeRegexLiteral(requestedBuyer)}$`, 'i')
    : null;

  // 0) Explicit conversationId — must still match buyer when buyer is known
  if (conversationId) {
    const convQuery = { conversationId: String(conversationId) };
    if (sellerOid) convQuery.seller = sellerOid;
    conv = await EbayMessageConversation.findOne(convQuery)
      .sort({ ebayUpdatedDate: -1 })
      .lean();
    if (conv) {
      const other = String(conv.otherPartyUsername || '').trim().toLowerCase();
      if (!requestedBuyer || !other || other === requestedBuyerLc) {
        return {
          conv,
          orderMatchedConversations: [conv],
          trustedOrderId: String(conv.orderId || oid || '').trim(),
          requestedBuyer,
          strictSingleConversation: true
        };
      }
      conv = null;
    }
  }

  // 1) Exact trio: seller + buyerId + orderId (user-requested match for Manage Case)
  if (sellerOid && buyerRe && oid) {
    const order = await Order.findOne({
      orderId: oid,
      seller: sellerOid,
      'buyer.username': buyerRe
    })
      .select('orderId buyer.username lineItems.legacyItemId')
      .lean();

    if (order) {
      trustedOrderId = oid;
      let candidates = await EbayMessageConversation.find({
        seller: sellerOid,
        orderId: oid,
        otherPartyUsername: buyerRe
      })
        .sort({ ebayUpdatedDate: -1 })
        .lean();

      // Order stamp missing on commerce rows — match buyer + listing from this order
      if (!candidates.length) {
        const orderItems = (order.lineItems || [])
          .map((li) => String(li?.legacyItemId || '').trim())
          .filter(Boolean);
        const itemIds = [
          ...new Set([
            ...(itemId && itemId !== 'DIRECT_MESSAGE' ? [String(itemId)] : []),
            ...orderItems
          ])
        ];
        if (itemIds.length) {
          candidates = await EbayMessageConversation.find({
            seller: sellerOid,
            otherPartyUsername: buyerRe,
            referenceId: { $in: itemIds }
          })
            .sort({ ebayUpdatedDate: -1 })
            .lean();
          // Prefer rows already linked to this orderId when present
          const stamped = candidates.filter((c) => String(c.orderId || '') === oid);
          if (stamped.length) candidates = stamped;
        }
      }

      // Confirm buyer appears in message usernames when otherParty was empty/wrong historically
      if (!candidates.length) {
        const involved = await EbayMessageConversationMessage.find({
          seller: sellerOid,
          $or: [{ senderUsername: buyerRe }, { recipientUsername: buyerRe }]
        })
          .select('conversationId')
          .limit(200)
          .lean();
        const ids = [...new Set(involved.map((m) => String(m.conversationId || '')).filter(Boolean))];
        if (ids.length) {
          const linkQuery = {
            seller: sellerOid,
            conversationId: { $in: ids },
            orderId: oid
          };
          candidates = await EbayMessageConversation.find(linkQuery)
            .sort({ ebayUpdatedDate: -1 })
            .lean();
          if (!candidates.length && itemId && itemId !== 'DIRECT_MESSAGE') {
            candidates = await EbayMessageConversation.find({
              seller: sellerOid,
              conversationId: { $in: ids },
              referenceId: String(itemId)
            })
              .sort({ ebayUpdatedDate: -1 })
              .lean();
          }
        }
      }

      if (candidates.length) {
        orderMatchedConversations = candidates;
        conv = candidates[0];
        strictSingleConversation = true;
        return {
          conv,
          orderMatchedConversations: [conv],
          trustedOrderId,
          requestedBuyer,
          strictSingleConversation
        };
      }
    }
  }

  // 2) Seller + buyer + item (no usable order match)
  if (!conv && sellerOid && buyerRe && itemId && itemId !== 'DIRECT_MESSAGE') {
    const buyerItemConvs = await EbayMessageConversation.find({
      seller: sellerOid,
      otherPartyUsername: buyerRe,
      referenceId: String(itemId)
    })
      .sort({ ebayUpdatedDate: -1 })
      .lean();
    if (buyerItemConvs.length) {
      // If orderId known, prefer the row for that order
      const forOrder = oid
        ? buyerItemConvs.filter((c) => String(c.orderId || '') === oid)
        : [];
      orderMatchedConversations = forOrder.length ? forOrder : [buyerItemConvs[0]];
      conv = orderMatchedConversations[0];
      trustedOrderId = String(conv.orderId || oid || '').trim();
      strictSingleConversation = true;
      return {
        conv,
        orderMatchedConversations: [conv],
        trustedOrderId,
        requestedBuyer,
        strictSingleConversation
      };
    }
  }

  // 3) Seller + buyer only when a single conversation exists
  if (!conv && sellerOid && buyerRe) {
    const buyerConvs = await EbayMessageConversation.find({
      seller: sellerOid,
      otherPartyUsername: buyerRe
    })
      .sort({ ebayUpdatedDate: -1 })
      .limit(5)
      .lean();
    if (buyerConvs.length === 1) {
      conv = buyerConvs[0];
      orderMatchedConversations = [conv];
      trustedOrderId = String(conv.orderId || oid || '').trim();
      strictSingleConversation = true;
    }
  }

  return {
    conv,
    orderMatchedConversations,
    trustedOrderId,
    requestedBuyer,
    strictSingleConversation
  };
}

/**
 * Resolve the Buyer Messages conversationId for an INR/CM case Open action.
 */
export async function resolveBuyerChatConversationFromCommerce(query = {}) {
  const { conv, trustedOrderId, requestedBuyer } = await findBuyerChatConversationsFromCommerce(query);
  if (!conv?.conversationId) return null;

  let order = null;
  const oid = String(conv.orderId || trustedOrderId || query.orderId || '').trim();
  if (oid) {
    order = await Order.findOne({ orderId: oid })
      .select('buyer.username buyer.buyerRegistrationAddress.fullName shippingFullName fulfillmentStartInstructions productName lineItems.legacyItemId')
      .lean();
  }
  if (!order && requestedBuyer && query.sellerId && mongoose.Types.ObjectId.isValid(query.sellerId)) {
    const q = {
      seller: query.sellerId,
      'buyer.username': new RegExp(`^${escapeRegexLiteral(requestedBuyer)}$`, 'i')
    };
    if (query.itemId) q['lineItems.legacyItemId'] = String(query.itemId);
    order = await Order.findOne(q).sort({ creationDate: -1 }).lean();
  }

  const buyerUsername =
    requestedBuyer ||
    String(conv.otherPartyUsername || order?.buyer?.username || '').trim();

  return {
    conversationId: String(conv.conversationId),
    orderId: String(conv.orderId || order?.orderId || trustedOrderId || '').trim() || null,
    itemId: String(conv.referenceId || query.itemId || '').trim() || null,
    itemTitle: conv.conversationTitle || order?.productName || '',
    buyerUsername,
    buyerName: buyerShippingNameFromOrder(order),
    sellerId: conv.seller,
    source: 'commerce'
  };
}

/**
 * Load chat messages for BuyerChat from conversation message cache.
 * Falls back to Message collection when no commerce conversation is found.
 */
export async function listBuyerChatMessagesFromCommerce(query = {}) {
  const { orderId, buyerUsername, itemId, sellerId, conversationId } = query;

  const {
    conv,
    orderMatchedConversations,
    trustedOrderId,
    requestedBuyer,
    strictSingleConversation
  } = await findBuyerChatConversationsFromCommerce({
    orderId,
    buyerUsername,
    itemId,
    sellerId,
    conversationId
  });

  if (!conv) {
    return { messages: null, source: null };
  }

  const seller = await Seller.findById(conv.seller).populate('user', 'username email').lean();
  // Also peek sibling conversations to infer eBay seller UserID when app username differs
  const siblingRows = await EbayMessageConversation.find({ seller: conv.seller })
    .select('latestMessage')
    .limit(40)
    .lean();
  const inferredEbay = inferSellerEbayUsername(siblingRows) || seller?.ebayUserId || '';
  if (inferredEbay && seller && !seller.ebayUserId) {
    Seller.updateOne({ _id: seller._id }, { $set: { ebayUserId: inferredEbay } }).catch(() => {});
  }
  const sellerNames = getSellerIdentityNames(seller, inferredEbay ? [inferredEbay] : []);
  const buyer =
    requestedBuyer ||
    resolveBuyerUsername(sellerNames, {
      senderUsername: conv.latestMessage?.senderUsername,
      recipientUsername: conv.latestMessage?.recipientUsername,
      otherPartyUsername: conv.otherPartyUsername
    }) ||
    '';

  if (buyer && conv.otherPartyUsername && String(conv.otherPartyUsername).toLowerCase() !== buyer.toLowerCase()) {
    EbayMessageConversation.updateOne(
      { _id: conv._id },
      { $set: { otherPartyUsername: buyer } }
    ).catch(() => {});
  }

  // Manage Case Open: load ONLY the resolved conversationId (seller+buyer+order).
  // Do not merge sibling/item conversations — that pulled unrelated "Hi Anthony" threads.
  let conversationIds = [String(conv.conversationId)].filter(Boolean);
  const resolvedOid = String(conv.orderId || trustedOrderId || '').trim();
  const buyerKey = String(buyer || requestedBuyer || '').trim();
  if (!strictSingleConversation) {
    if (Array.isArray(orderMatchedConversations) && orderMatchedConversations.length) {
      conversationIds = [
        ...new Set(
          orderMatchedConversations
            .map((s) => String(s.conversationId || '').trim())
            .filter(Boolean)
        )
      ];
    } else if (resolvedOid && buyerKey) {
      const siblings = await EbayMessageConversation.find({
        seller: conv.seller,
        orderId: resolvedOid,
        otherPartyUsername: new RegExp(`^${escapeRegexLiteral(buyerKey)}$`, 'i')
      })
        .select('conversationId')
        .lean();
      conversationIds = [
        ...new Set(siblings.map((s) => String(s.conversationId || '').trim()).filter(Boolean))
      ];
      if (!conversationIds.length) conversationIds = [String(conv.conversationId)];
    }
  } else if (resolvedOid && buyerKey) {
    // Still allow true same-order siblings for this buyer only
    const siblings = await EbayMessageConversation.find({
      seller: conv.seller,
      orderId: resolvedOid,
      otherPartyUsername: new RegExp(`^${escapeRegexLiteral(buyerKey)}$`, 'i')
    })
      .select('conversationId')
      .lean();
    if (siblings.length) {
      conversationIds = [
        ...new Set(siblings.map((s) => String(s.conversationId || '').trim()).filter(Boolean))
      ];
    }
  }

  const rows = await EbayMessageConversationMessage.find({
    seller: conv.seller,
    conversationId: { $in: conversationIds }
  })
    .sort({ createdDate: 1 })
    .lean();

  // Deduplicate identical messageIds across sibling conversations
  const seenMsg = new Set();
  const uniqueRows = [];
  for (const m of rows) {
    const mid = String(m.messageId || m._id);
    if (seenMsg.has(mid)) continue;
    seenMsg.add(mid);
    uniqueRows.push(m);
  }

  // Soft-dedupe: same body + sender within 15m across sibling conversationIds
  const normalizeBody = (body) =>
    String(body || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  const softUnique = [];
  for (const m of uniqueRows) {
    const body = normalizeBody(m.messageBody);
    const when = new Date(m.createdDate || m.createdAt || 0).getTime();
    const sender = String(m.senderUsername || '').trim().toLowerCase();
    const dupIdx = softUnique.findIndex((x) => {
      if (normalizeBody(x.messageBody) !== body || !body) return false;
      if (String(x.senderUsername || '').trim().toLowerCase() !== sender) return false;
      const t = new Date(x.createdDate || x.createdAt || 0).getTime();
      return Math.abs(t - when) <= 15 * 60 * 1000;
    });
    if (dupIdx === -1) softUnique.push(m);
  }

  // If cache only has summary seed, keep UI usable but signal thin cache
  const messages = softUnique.map((m) => {
    const sender = resolveSenderRole(
      m.senderUsername,
      buyer,
      sellerNames,
      m.recipientUsername
    );
    const readStatus = String(m.readStatus ?? '').toUpperCase();
    const read =
      sender === 'SELLER' ||
      readStatus === 'READ' ||
      readStatus === 'TRUE' ||
      m.readStatus === true;

    return {
      _id: m.messageId || String(m._id),
      messageId: m.messageId,
      seller: conv.seller,
      orderId: conv.orderId || trustedOrderId || null,
      itemId: conv.referenceId || itemId || null,
      buyerUsername: buyer,
      conversationId: conv.conversationId,
      sender,
      senderUsername: m.senderUsername || '',
      recipientUsername: m.recipientUsername || '',
      subject: m.subject || '',
      body: stripHtml(m.messageBody) || '',
      mediaUrls: Array.isArray(m.messageMedia)
        ? m.messageMedia.map((x) => x?.mediaUrl).filter(Boolean)
        : [],
      messageMedia: m.messageMedia || [],
      read,
      messageDate: m.createdDate || m.createdAt || new Date(),
      messageType: messageTypeFromThread({
        orderId: conv.orderId || trustedOrderId,
        itemId: conv.referenceId || itemId
      }),
      source: 'commerce'
    };
  });

  return {
    messages,
    conversation: conv,
    source: 'commerce'
  };
}

/**
 * Upsert one eBay conversation summary into the Commerce cache used by Buyer Messages.
 */
/**
 * eBay may return reference / otherParty as nested objects or top-level fields.
 */
export function normalizeCommerceConversation(conv = {}) {
  const referenceId = String(
    conv.referenceId || conv.reference?.referenceId || ''
  ).trim();
  const referenceType = String(
    conv.referenceType || conv.reference?.referenceType || ''
  ).trim();
  const otherPartyUsername = String(
    conv.otherPartyUsername || conv.otherParty?.username || ''
  ).trim();
  return {
    ...conv,
    referenceId,
    referenceType,
    otherPartyUsername
  };
}

/**
 * Upsert one eBay conversation summary into the Commerce cache used by Buyer Messages.
 *
 * Order rules (must not break Inquiry filter OR wipe true orders):
 * - eBay referenceType ORDER → store referenceId as orderId
 * - eBay referenceType LISTING → leave/clear orderId (true inquiry; do NOT
 *   auto-link from our Orders collection — that hid inquiries before)
 * - Otherwise preserve existing orderId (never blank it on every sync)
 */
export async function upsertCommerceConversationCache(seller, conv, { buyerUsername, orderId } = {}) {
  const conversationId = String(conv?.conversationId || '').trim();
  if (!conversationId || !seller?._id) return false;

  const normalized = normalizeCommerceConversation(conv);
  const latest = normalized.latestMessage || null;
  const sellerNames = getSellerIdentityNames(seller);
  // Prefer resolving from sender/recipient only — ignore eBay otherParty when it may be the seller
  let buyer =
    buyerUsername ||
    resolveBuyerUsername(sellerNames, {
      senderUsername: latest?.senderUsername,
      recipientUsername: latest?.recipientUsername,
      otherPartyUsername: ''
    });
  if (!buyer) {
    buyer = resolveBuyerUsername(sellerNames, {
      senderUsername: latest?.senderUsername,
      recipientUsername: latest?.recipientUsername,
      otherPartyUsername: normalized.otherPartyUsername
    });
  }

  const refType = String(normalized.referenceType || '').trim().toUpperCase();
  const refId = String(normalized.referenceId || '').trim();

  const doc = {
    seller: seller._id,
    conversationId,
    conversationType: normalized.conversationType || 'FROM_MEMBERS',
    conversationTitle: normalized.conversationTitle || '',
    conversationStatus: normalized.conversationStatus || '',
    otherPartyUsername: buyer || '',
    referenceType: normalized.referenceType || '',
    referenceId: normalized.referenceId || '',
    unreadCount: Number(normalized.unreadCount) || 0,
    latestMessage: latest
      ? {
          messageId: latest.messageId || '',
          messageBody: latest.messageBody || '',
          subject: latest.subject || '',
          senderUsername: latest.senderUsername || '',
          recipientUsername: latest.recipientUsername || '',
          createdDate: latest.createdDate ? new Date(latest.createdDate) : null,
          readStatus: latest.readStatus ?? null
        }
      : null,
    ebayCreatedDate: normalized.createdDate ? new Date(normalized.createdDate) : null,
    ebayUpdatedDate: normalized.updatedDate
      ? new Date(normalized.updatedDate)
      : latest?.createdDate
        ? new Date(latest.createdDate)
        : new Date(),
    lastSyncedAt: new Date(),
    raw: conv
  };

  if (orderId !== undefined) {
    doc.orderId = String(orderId || '').trim();
  } else if (refType === 'ORDER' && refId) {
    doc.orderId = refId;
  } else if (refType === 'LISTING') {
    doc.orderId = '';
  }
  // else: omit orderId from $set so existing value is preserved

  await EbayMessageConversation.findOneAndUpdate(
    {
      seller: seller._id,
      conversationId,
      conversationType: doc.conversationType
    },
    { $set: doc },
    { upsert: true, setDefaultsOnInsert: true }
  );

  if (latest && (latest.messageId || latest.messageBody)) {
    const messageId =
      String(latest.messageId || '').trim() ||
      `seed-${conversationId}-${Date.parse(latest.createdDate) || 0}`;
    await EbayMessageConversationMessage.findOneAndUpdate(
      { seller: seller._id, conversationId, messageId },
      {
        $set: {
          seller: seller._id,
          conversationId,
          conversationType: doc.conversationType,
          messageId,
          senderUsername: latest.senderUsername || '',
          recipientUsername: latest.recipientUsername || '',
          subject: latest.subject || '',
          messageBody: latest.messageBody || '',
          readStatus: latest.readStatus ?? null,
          createdDate: latest.createdDate ? new Date(latest.createdDate) : null,
          messageMedia: Array.isArray(latest.messageMedia) ? latest.messageMedia : [],
          lastSyncedAt: new Date(),
          raw: latest
        }
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
  }

  return true;
}

/** Pull first name from common seller templates: "Hello Jeffery,", "Hi derrick," */
export function extractGreetingFirstName(body) {
  const text = String(body || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .trim();
  const m = text.match(/^(?:hello|hi|hey)\s+([a-z][a-z0-9'._-]{1,40})/i);
  return m ? m[1] : '';
}

/**
 * When Message.buyerUsername was wrongly saved as the store eBay id,
 * recover the real buyer from orders for that listing (greeting name preferred).
 */
export async function resolveBuyerFromItemOrders({ sellerId, itemId, lastMessage }) {
  const item = String(itemId || '').trim();
  if (!sellerId || !item || item === 'DIRECT_MESSAGE') return null;

  const orders = await Order.find({
    seller: sellerId,
    'lineItems.legacyItemId': item
  })
    .select('orderId buyer creationDate lastModifiedDate')
    .sort({ creationDate: -1 })
    .limit(25)
    .lean();

  if (!orders.length) return null;

  const firstName = extractGreetingFirstName(lastMessage).toLowerCase();
  if (firstName) {
    const match = orders.find((o) => {
      const full = String(o.buyer?.buyerRegistrationAddress?.fullName || '').toLowerCase();
      const user = String(o.buyer?.username || '').toLowerCase();
      if (!full && !user) return false;
      const first = full.split(/\s+/)[0] || '';
      return first === firstName || full.startsWith(firstName) || user.startsWith(firstName);
    });
    if (match?.buyer?.username) {
      return {
        buyerUsername: String(match.buyer.username),
        buyerName: buyerDisplayNameFromOrder(match),
        orderId: match.orderId || ''
      };
    }
  }

  // Single distinct buyer for this listing → safe
  const distinct = [
    ...new Set(orders.map((o) => String(o.buyer?.username || '').trim()).filter(Boolean))
  ];
  if (distinct.length === 1) {
    const o = orders.find((x) => String(x.buyer?.username || '') === distinct[0]) || orders[0];
    return {
      buyerUsername: distinct[0],
      buyerName: buyerDisplayNameFromOrder(o),
      orderId: o?.orderId || ''
    };
  }

  // Most recent order as last resort (better than showing the store id)
  const recent = orders[0];
  if (recent?.buyer?.username) {
    return {
      buyerUsername: String(recent.buyer.username),
      buyerName: buyerDisplayNameFromOrder(recent),
      orderId: recent.orderId || ''
    };
  }
  return null;
}

/**
 * Enrich legacy inbox threads where buyerUsername is the seller store / eBay id.
 * Mutates threads in place; optionally persists Message fixes.
 */
export async function enrichLegacyThreadsBuyerUsername(threads = [], { persist = true } = {}) {
  if (!Array.isArray(threads) || threads.length === 0) return threads;

  const sellerIds = [
    ...new Set(threads.map((t) => String(t.sellerId || t.seller || '')).filter(Boolean))
  ];
  const sellers = await Seller.find({ _id: { $in: sellerIds } })
    .populate('user', 'username email')
    .select('ebayUserId user')
    .lean();
  const sellerById = new Map(sellers.map((s) => [String(s._id), s]));

  for (const thread of threads) {
    const seller = sellerById.get(String(thread.sellerId || thread.seller || ''));
    const sellerNames = new Set(
      getSellerIdentityNames(seller)
        .map((n) => n.toLowerCase())
        .filter(Boolean)
    );
    const ebayId = String(seller?.ebayUserId || '').trim();
    if (ebayId) thread.sellerEbayUsername = thread.sellerEbayUsername || ebayId;
    if (seller?.user?.username) {
      thread.sellerUsername = thread.sellerUsername || seller.user.username;
    }

    const buyer = String(thread.buyerUsername || '').trim();
    const looksLikeSeller =
      Boolean(buyer) && (sellerNames.has(buyer.toLowerCase()) || thread.buyerLooksLikeSeller === true);
    thread.buyerLooksLikeSeller = looksLikeSeller;

    if (!looksLikeSeller) continue;

    const resolved = await resolveBuyerFromItemOrders({
      sellerId: thread.sellerId || thread.seller,
      itemId: thread.itemId,
      lastMessage: thread.lastMessage
    });
    if (!resolved?.buyerUsername) continue;

    const prevBuyer = buyer;
    thread.buyerUsername = resolved.buyerUsername;
    if (resolved.buyerName) thread.buyerName = resolved.buyerName;
    if (resolved.orderId && !thread.orderId) {
      thread.orderId = resolved.orderId;
      thread.actualMessageType = 'ORDER';
      thread.messageType = 'ORDER';
    }
    thread.buyerLooksLikeSeller = false;
    thread.buyerResolvedFrom = 'order';

    if (persist && prevBuyer) {
      const filter = {
        seller: thread.sellerId || thread.seller,
        buyerUsername: new RegExp(`^${escapeRegexLiteral(prevBuyer)}$`, 'i'),
        itemId: String(thread.itemId || '')
      };
      const $set = { buyerUsername: resolved.buyerUsername };
      if (resolved.orderId) $set.orderId = resolved.orderId;
      Message.updateMany(filter, { $set }).catch(() => {});
    }
  }

  return threads;
}

/**
 * One-shot / maintenance: rewrite Message rows where buyerUsername is the store eBay id.
 */
export async function backfillMessageBuyerUsernameForSeller(seller, { limit = 500 } = {}) {
  const ebayId = String(seller?.ebayUserId || '').trim();
  if (!ebayId || !seller?._id) return { scanned: 0, updated: 0 };

  const rows = await Message.find({
    seller: seller._id,
    buyerUsername: new RegExp(`^${escapeRegexLiteral(ebayId)}$`, 'i')
  })
    .sort({ messageDate: -1 })
    .limit(limit)
    .select('_id itemId body orderId buyerUsername')
    .lean();

  let updated = 0;
  const byItem = new Map();
  for (const row of rows) {
    const key = String(row.itemId || '');
    if (!byItem.has(key)) byItem.set(key, []);
    byItem.get(key).push(row);
  }

  for (const [itemId, itemRows] of byItem) {
    const sample = itemRows[0];
    const resolved = await resolveBuyerFromItemOrders({
      sellerId: seller._id,
      itemId,
      lastMessage: sample?.body
    });
    if (!resolved?.buyerUsername) continue;

    const ids = itemRows.map((r) => r._id);
    const $set = { buyerUsername: resolved.buyerUsername };
    if (resolved.orderId) $set.orderId = resolved.orderId;
    const res = await Message.updateMany({ _id: { $in: ids } }, { $set });
    updated += res.modifiedCount || 0;
  }

  return { scanned: rows.length, updated };
}

