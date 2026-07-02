import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import Message from '../models/Message.js';
import Order from '../models/Order.js';

const EBAY_XML_HEADERS = {
  'X-EBAY-API-SITEID': '0',
  'X-EBAY-API-COMPATIBILITY-LEVEL': '1423',
  'Content-Type': 'text/xml'
};

export function extractTextFromHtml(html) {
  if (!html) return '';

  if (!/<[^>]+>/.test(html)) {
    return html.trim();
  }

  let cleanText = '';

  const userInputMatch = html.match(/<div\s+id=["']UserInputtedText["'][^>]*>(.*?)<\/div>/is);
  if (userInputMatch && userInputMatch[1]) {
    cleanText = userInputMatch[1];
  } else {
    const v4Match = html.match(/<div\s+id=["']V4PrimaryMessage["'][^>]*>.*?<strong>Dear[^<]*<\/strong>\s*(?:<br\s*\/?>)*\s*(.*?)\s*(?:<br\s*\/?>)*\s*<\/font>/is);
    if (v4Match && v4Match[1]) {
      cleanText = v4Match[1];
    } else {
      cleanText = html;
    }
  }

  cleanText = cleanText.replace(/<[^>]+>/g, ' ');
  cleanText = cleanText
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
  cleanText = cleanText
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();

  return cleanText;
}

function normalizeBody(body = '') {
  return extractTextFromHtml(body).replace(/\s+/g, ' ').trim().toLowerCase();
}

function parseXmlDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function collectMediaUrls(msg, question) {
  const mediaUrls = [];
  const addFrom = (list) => {
    if (!Array.isArray(list)) return;
    list.forEach((media) => {
      if (media?.MediaURL?.[0]) mediaUrls.push(media.MediaURL[0]);
    });
  };
  addFrom(msg.MessageMedia);
  addFrom(question?.MessageMedia);
  return mediaUrls;
}

function getResponseBodies(msg) {
  const raw = msg?.Response;
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .map((entry) => {
      if (typeof entry === 'string') return extractTextFromHtml(entry);
      if (entry?._) return extractTextFromHtml(entry._);
      return extractTextFromHtml(String(entry ?? ''));
    })
    .map((body) => body.trim())
    .filter(Boolean);
}

async function resolveThreadContext({ itemID, senderID, itemTitle }) {
  let orderId = null;
  let messageType = 'INQUIRY';
  let finalItemId = itemID;
  let finalItemTitle = itemTitle;

  if (itemID && senderID) {
    const order = await Order.findOne({
      'lineItems.legacyItemId': itemID,
      'buyer.username': senderID
    }).select('orderId').lean();

    if (order) {
      orderId = order.orderId;
      messageType = 'ORDER';
    }
  } else if (!itemID && senderID) {
    messageType = 'DIRECT';
    finalItemId = 'DIRECT_MESSAGE';
    finalItemTitle = 'Direct Message (No Item)';
  }

  return { orderId, messageType, finalItemId, finalItemTitle };
}

function buildThreadQuery({ sellerId, buyerUsername, orderId, itemId }) {
  const query = { seller: sellerId, buyerUsername };
  if (orderId) {
    query.orderId = orderId;
  } else {
    query.itemId = itemId;
    query.orderId = null;
  }
  return query;
}

async function threadHasBody({ sellerId, buyerUsername, orderId, itemId, sender, body }) {
  const normalized = normalizeBody(body);
  if (!normalized) return true;

  const query = {
    ...buildThreadQuery({ sellerId, buyerUsername, orderId, itemId }),
    sender
  };

  const existing = await Message.find(query).select('body').lean();
  return existing.some((row) => normalizeBody(row.body) === normalized);
}

async function saveThreadMessage({
  sellerId,
  buyerUsername,
  orderId,
  itemId,
  itemTitle,
  messageType,
  sender,
  subject,
  body,
  mediaUrls = [],
  read,
  messageDate,
  externalMessageId
}) {
  const normalized = normalizeBody(body);
  if (!normalized) return false;

  if (externalMessageId) {
    const byExternal = await Message.findOne({ externalMessageId }).select('_id').lean();
    if (byExternal) return false;
  }

  if (await threadHasBody({ sellerId, buyerUsername, orderId, itemId, sender, body })) {
    return false;
  }

  await Message.create({
    seller: sellerId,
    orderId,
    itemId,
    itemTitle,
    buyerUsername,
    externalMessageId: externalMessageId || undefined,
    sender,
    subject: subject || (sender === 'SELLER' ? 'Reply' : 'Message'),
    body: extractTextFromHtml(body),
    mediaUrls,
    read: sender === 'SELLER' ? true : Boolean(read),
    messageType,
    messageDate: messageDate || new Date()
  });

  return true;
}

async function saveBuyerQuestionMessage(msg, seller, question) {
  const msgID = question.MessageID?.[0];
  const senderID = question.SenderID?.[0];
  if (!msgID || !senderID) return false;

  const rawBody = question.Body?.[0];
  const body = extractTextFromHtml(rawBody);
  if (!body) return false;

  const itemID = msg.Item?.[0]?.ItemID?.[0];
  const itemTitle = msg.Item?.[0]?.Title?.[0];
  const subject = question.Subject?.[0];
  const mediaUrls = collectMediaUrls(msg, question);

  const messageDate = parseXmlDate(question.CreationDate?.[0])
    || parseXmlDate(msg.CreationDate?.[0])
    || new Date();

  const context = await resolveThreadContext({ itemID, senderID, itemTitle });

  return saveThreadMessage({
    sellerId: seller._id,
    buyerUsername: senderID,
    orderId: context.orderId,
    itemId: context.finalItemId,
    itemTitle: context.finalItemTitle,
    messageType: context.messageType,
    sender: 'BUYER',
    subject,
    body,
    mediaUrls,
    read: false,
    messageDate,
    externalMessageId: msgID
  });
}

async function saveSellerResponsesFromExchange(msg, seller, question, context) {
  const responses = getResponseBodies(msg);
  if (responses.length === 0) return 0;

  const questionMsgId = question.MessageID?.[0];
  const buyerUsername = question.SenderID?.[0];
  const subject = question.Subject?.[0];
  if (!questionMsgId || !buyerUsername) return 0;

  const creationDate = parseXmlDate(msg.CreationDate?.[0]) || parseXmlDate(question.CreationDate?.[0]) || new Date();
  const lastModified = parseXmlDate(msg.LastModifiedDate?.[0]) || creationDate;

  let saved = 0;
  for (let i = 0; i < responses.length; i++) {
    const responseDate = responses.length === 1
      ? lastModified
      : new Date(lastModified.getTime() + i * 1000);

    const inserted = await saveThreadMessage({
      sellerId: seller._id,
      buyerUsername,
      orderId: context.orderId,
      itemId: context.finalItemId,
      itemTitle: context.finalItemTitle,
      messageType: context.messageType,
      sender: 'SELLER',
      subject,
      body: responses[i],
      read: true,
      messageDate: responseDate,
      externalMessageId: `ebay-resp-${questionMsgId}-${i}`
    });

    if (inserted) saved++;
  }

  return saved;
}

export async function processEbayMessage(msg, seller) {
  try {
    const question = msg.Question?.[0];
    if (!question) return { buyerNew: false, sellerNew: 0 };

    const itemID = msg.Item?.[0]?.ItemID?.[0];
    const itemTitle = msg.Item?.[0]?.Title?.[0];
    const senderID = question.SenderID?.[0];
    const context = await resolveThreadContext({ itemID, senderID, itemTitle });

    const buyerNew = await saveBuyerQuestionMessage(msg, seller, question);
    const sellerNew = await saveSellerResponsesFromExchange(msg, seller, question, context);

    return { buyerNew, sellerNew };
  } catch (err) {
    console.error('Error processing message:', err.message);
    return { buyerNew: false, sellerNew: 0 };
  }
}

function splitThreadText(text) {
  const cleaned = extractTextFromHtml(text);
  if (!cleaned) return [];

  const parts = cleaned
    .split(/(?:_{10,}|-{5,}\s*Original Message\s*-{5,}|From:\s|Sent:\s|On .+ wrote:)/i)
    .map((part) => part.trim())
    .filter((part) => part.length >= 12);

  if (parts.length === 0 && cleaned.length >= 12) return [cleaned];
  return parts;
}

function inferSenderFromSegment(segment, { sellerUsername, buyerUsername, envelopeSender }) {
  const lower = segment.toLowerCase();
  const seller = String(sellerUsername || '').toLowerCase();
  const buyer = String(buyerUsername || '').toLowerCase();
  const envelope = String(envelopeSender || '').toLowerCase();

  if (seller && (lower.includes(seller) || lower.startsWith(`hi ${seller}`))) return 'SELLER';
  if (buyer && (lower.includes(buyer) || lower.includes(`@${buyer}`))) return 'BUYER';
  if (envelope && envelope === seller) return 'SELLER';
  if (envelope && envelope === buyer) return 'BUYER';
  return envelope === seller ? 'SELLER' : 'BUYER';
}

async function fetchMyMessagesByExternalIds(token, externalMessageIds) {
  const ids = [...new Set(externalMessageIds.filter(Boolean))].slice(0, 10);
  if (ids.length === 0) return [];

  const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
    <GetMyMessagesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
      <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
      <DetailLevel>ReturnMessages</DetailLevel>
      <ExternalMessageIDs>
        ${ids.map((id) => `<ExternalMessageID>${id}</ExternalMessageID>`).join('')}
      </ExternalMessageIDs>
    </GetMyMessagesRequest>`;

  const response = await axios.post('https://api.ebay.com/ws/api.dll', xmlRequest, {
    headers: { ...EBAY_XML_HEADERS, 'X-EBAY-API-CALL-NAME': 'GetMyMessages' }
  });

  const result = await parseStringPromise(response.data);
  if (result.GetMyMessagesResponse?.Ack?.[0] === 'Failure') {
    return [];
  }

  const messages = result.GetMyMessagesResponse?.Messages?.[0]?.Message;
  if (!messages) return [];
  return Array.isArray(messages) ? messages : [messages];
}

export async function enrichThreadFromMyMessages({
  token,
  seller,
  externalMessageIds,
  buyerUsername,
  orderId,
  itemId,
  itemTitle,
  messageType
}) {
  const sellerUsername = seller.user?.username || seller.user?.email || '';
  let sellerNew = 0;
  let buyerNew = 0;

  const uniqueIds = [...new Set(externalMessageIds.filter(Boolean))];
  for (let i = 0; i < uniqueIds.length; i += 10) {
    const batch = uniqueIds.slice(i, i + 10);
    const messages = await fetchMyMessagesByExternalIds(token, batch);

    for (const myMsg of messages) {
      const messageId = myMsg.MessageID?.[0] || myMsg.MessageID;
      const envelopeSender = myMsg.Sender?.[0] || myMsg.Sender || '';
      const receiveDate = parseXmlDate(myMsg.ReceiveDate?.[0] || myMsg.ReceiveDate) || new Date();
      const subject = myMsg.Subject?.[0] || myMsg.Subject || 'Message';
      const text = myMsg.Text?.[0] || myMsg.Text || '';
      const segments = splitThreadText(text);

      const parts = segments.length > 0 ? segments : [extractTextFromHtml(text)].filter(Boolean);
      for (let idx = 0; idx < parts.length; idx++) {
        const body = parts[idx];
        const sender = inferSenderFromSegment(body, { sellerUsername, buyerUsername, envelopeSender });
        const saved = await saveThreadMessage({
          sellerId: seller._id,
          buyerUsername,
          orderId,
          itemId,
          itemTitle,
          messageType,
          sender,
          subject,
          body,
          read: sender === 'SELLER',
          messageDate: receiveDate,
          externalMessageId: messageId ? `mymsg-${messageId}-${idx}` : undefined
        });

        if (!saved) continue;
        if (sender === 'SELLER') sellerNew++;
        else buyerNew++;
      }
    }
  }

  return { sellerNew, buyerNew };
}

export function collectExternalMessageIdsFromExchanges(exchanges = []) {
  const ids = [];
  for (const msg of exchanges) {
    const questionId = msg?.Question?.[0]?.MessageID?.[0];
    if (questionId) ids.push(questionId);
  }
  return ids;
}

function messageRelatesToThread(myMsg, { buyerUsername, itemId }) {
  const sender = (myMsg.Sender?.[0] || myMsg.Sender || '').toString();
  const recipient = (myMsg.RecipientUserID?.[0] || myMsg.RecipientUserID || myMsg.SendToName?.[0] || myMsg.SendToName || '').toString();
  const msgItemId = (myMsg.ItemID?.[0] || myMsg.ItemID || '').toString();
  const buyer = String(buyerUsername || '').toLowerCase();

  const buyerLower = buyer;
  const parties = [sender, recipient].map((v) => v.toLowerCase());
  const buyerMatches = parties.some((p) => p === buyerLower || p.includes(buyerLower));

  if (!buyerMatches) return false;
  if (!itemId || itemId === 'DIRECT_MESSAGE') return true;
  return !msgItemId || msgItemId === String(itemId);
}

async function fetchMyMessagesInRange(token, startTime, endTime) {
  const all = [];
  let page = 1;
  let totalPages = 1;

  do {
    const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
      <GetMyMessagesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
        <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
        <DetailLevel>ReturnMessages</DetailLevel>
        <StartTime>${startTime}</StartTime>
        <EndTime>${endTime}</EndTime>
        <Pagination>
          <EntriesPerPage>200</EntriesPerPage>
          <PageNumber>${page}</PageNumber>
        </Pagination>
      </GetMyMessagesRequest>`;

    const response = await axios.post('https://api.ebay.com/ws/api.dll', xmlRequest, {
      headers: { ...EBAY_XML_HEADERS, 'X-EBAY-API-CALL-NAME': 'GetMyMessages' }
    });

    const result = await parseStringPromise(response.data);
    if (result.GetMyMessagesResponse?.Ack?.[0] === 'Failure') break;

    const batch = result.GetMyMessagesResponse?.Messages?.[0]?.Message;
    if (batch) {
      all.push(...(Array.isArray(batch) ? batch : [batch]));
    }

    const pagination = result.GetMyMessagesResponse?.PaginationResult?.[0];
    totalPages = parseInt(pagination?.TotalNumberOfPages?.[0] || '1', 10);
    page++;
  } while (page <= totalPages && page <= 10);

  return all;
}

export async function syncMyMessagesForThread({
  token,
  seller,
  buyerUsername,
  orderId,
  itemId,
  itemTitle,
  messageType,
  lookbackDays = 90
}) {
  const sellerUsername = seller.user?.username || seller.user?.email || '';
  const now = new Date();
  const start = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  const end = now.toISOString();

  const myMessages = await fetchMyMessagesInRange(token, start, end);
  const relevant = myMessages.filter((m) => messageRelatesToThread(m, { buyerUsername, itemId }));

  let sellerNew = 0;
  let buyerNew = 0;

  for (const myMsg of relevant) {
    const messageId = myMsg.MessageID?.[0] || myMsg.MessageID;
    const envelopeSender = myMsg.Sender?.[0] || myMsg.Sender || '';
    const receiveDate = parseXmlDate(myMsg.ReceiveDate?.[0] || myMsg.ReceiveDate) || new Date();
    const subject = myMsg.Subject?.[0] || myMsg.Subject || 'Message';
    const text = myMsg.Text?.[0] || myMsg.Text || '';
    const messageTypeCode = (myMsg.MessageType?.[0] || myMsg.MessageType || '').toString();
    const segments = splitThreadText(text);
    const senderLower = String(envelopeSender).toLowerCase();
    const buyerLower = String(buyerUsername).toLowerCase();
    const envelopeIsSeller = senderLower !== buyerLower
      || messageTypeCode.toLowerCase().includes('response')
      || messageTypeCode.toLowerCase().includes('contact');

    if (segments.length > 1) {
      for (let idx = 0; idx < segments.length; idx++) {
        const body = segments[idx];
        const sender = inferSenderFromSegment(body, { sellerUsername, buyerUsername, envelopeSender });
        const saved = await saveThreadMessage({
          sellerId: seller._id,
          buyerUsername,
          orderId,
          itemId,
          itemTitle,
          messageType,
          sender,
          subject,
          body,
          read: sender === 'SELLER',
          messageDate: receiveDate,
          externalMessageId: messageId ? `mymsg-${messageId}-${idx}` : undefined
        });

        if (!saved) continue;
        if (sender === 'SELLER') sellerNew++;
        else buyerNew++;
      }
      continue;
    }

    const fullBody = extractTextFromHtml(text);
    if (!fullBody) continue;

    const sender = envelopeIsSeller ? 'SELLER' : 'BUYER';
    const saved = await saveThreadMessage({
      sellerId: seller._id,
      buyerUsername,
      orderId,
      itemId,
      itemTitle,
      messageType,
      sender,
      subject,
      body: fullBody,
      read: sender === 'SELLER',
      messageDate: receiveDate,
      externalMessageId: messageId ? `mymail-${messageId}` : undefined
    });
    if (saved) {
      if (sender === 'SELLER') sellerNew++;
      else buyerNew++;
    }
  }

  return { sellerNew, buyerNew, fetched: relevant.length };
}

export async function backfillThreadOrderId({ sellerId, buyerUsername, itemId, orderId, messageType = 'ORDER' }) {
  if (!orderId) return 0;

  const result = await Message.updateMany(
    {
      seller: sellerId,
      buyerUsername,
      itemId,
      $or: [{ orderId: null }, { orderId: '' }, { orderId: { $exists: false } }]
    },
    { $set: { orderId, messageType } }
  );

  return result.modifiedCount || 0;
}
