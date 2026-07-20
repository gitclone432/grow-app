import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import Message from '../models/Message.js';
import Order from '../models/Order.js';

const EBAY_XML_HEADERS = {
  'X-EBAY-API-SITEID': '0',
  'X-EBAY-API-COMPATIBILITY-LEVEL': '1423',
  'Content-Type': 'text/xml'
};

function decodeHtmlEntities(text = '') {
  return String(text)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&copy;/g, '(c)');
}

function stripEbayNotificationNoise(text = '') {
  let cleanText = decodeHtmlEntities(text).replace(/\r\n?/g, '\n');
  const cssMarkers = [
    '@media only screen',
    '@-moz-document',
    'body[yahoo]',
    'td.wrapText',
    '.ExternalClass',
    '.ReadMsgBody',
    'mso-table-lspace'
  ];

  const cssStart = cssMarkers
    .map((marker) => cleanText.toLowerCase().indexOf(marker.toLowerCase()))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  if (cssStart !== undefined) {
    cleanText = cleanText.slice(0, cssStart);
  }

  const footerMarkers = [
    'Order status:',
    'We scan messages to enforce policies.',
    'Email reference id:',
    "We don't check this mailbox",
    'eBay sent this message to',
    'eBay is committed to your privacy'
  ];
  const footerStart = footerMarkers
    .map((marker) => cleanText.toLowerCase().indexOf(marker.toLowerCase()))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  if (footerStart !== undefined) {
    cleanText = cleanText.slice(0, footerStart);
  }

  cleanText = cleanText
    .replace(/\bNew message:\s*New message\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const lower = cleanText.toLowerCase();
  const cssSignalCount = ['!important', '{', '}', 'padding:', 'width:', 'font-family:', 'word-wrap:']
    .filter((token) => lower.includes(token)).length;
  if (cssSignalCount >= 3) return '';

  return cleanText;
}

export function extractTextFromHtml(html) {
  if (!html) return '';

  if (!/<[^>]+>/.test(html)) {
    return stripEbayNotificationNoise(html);
  }

  let cleanText = '';
  const htmlWithoutStyles = String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ');

  const userInputMatch = htmlWithoutStyles.match(/<div\s+id=["']UserInputtedText["'][^>]*>(.*?)<\/div>/is);
  if (userInputMatch && userInputMatch[1]) {
    cleanText = userInputMatch[1];
  } else {
    const v4Match = htmlWithoutStyles.match(/<div\s+id=["']V4PrimaryMessage["'][^>]*>.*?<strong>Dear[^<]*<\/strong>\s*(?:<br\s*\/?>)*\s*(.*?)\s*(?:<br\s*\/?>)*\s*<\/font>/is);
    if (v4Match && v4Match[1]) {
      cleanText = v4Match[1];
    } else {
      cleanText = htmlWithoutStyles;
    }
  }

  cleanText = cleanText.replace(/<[^>]+>/g, ' ');
  return stripEbayNotificationNoise(cleanText);
}

function normalizeBody(body = '') {
  return extractTextFromHtml(body).replace(/\s+/g, ' ').trim().toLowerCase();
}

function looksLikeSellerTemplate(body = '') {
  const normalized = normalizeBody(body);
  if (!normalized) return false;

  const sellerTemplateSignals = [
    "we're pleased to inform you that your order has been processed",
    'your package has been successfully delivered',
    'tracking number will be updated on your ebay order page',
    'thank you for choosing us',
    'customer support team',
    'if you have any questions or concerns, please contact us directly through ebay messages',
    'before opening any cases such as inr',
    'thank you for your recent purchase',
    'orders are typically shipped within',
    'your return request has been approved',
    'we have approved your return request',
    'we will keep you updated'
  ];

  return sellerTemplateSignals.some((signal) => normalized.includes(signal));
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

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resolveThreadContext({ itemID, senderID, itemTitle, sellerId, messageDate }) {
  let orderId = null;
  let messageType = 'INQUIRY';
  let finalItemId = itemID;
  let finalItemTitle = itemTitle;

  if (itemID && senderID) {
    const buyerUsernameRegex = new RegExp(`^${escapeRegex(senderID)}$`, 'i');
    let order = null;
    const exactBuyerOrders = await Order.find({
      ...(sellerId ? { seller: sellerId } : {}),
      'lineItems.legacyItemId': itemID,
      'buyer.username': buyerUsernameRegex
    }).select('orderId').sort({ dateSold: -1 }).limit(2).lean();
    if (exactBuyerOrders.length === 1) {
      order = exactBuyerOrders[0];
    }

    if (!order && sellerId && messageDate) {
      const center = new Date(messageDate);
      if (!Number.isNaN(center.getTime())) {
        const from = new Date(center.getTime() - 45 * 24 * 60 * 60 * 1000);
        const to = new Date(center.getTime() + 2 * 24 * 60 * 60 * 1000);
        const windowOrders = await Order.find({
          seller: sellerId,
          'lineItems.legacyItemId': itemID,
          dateSold: { $gte: from, $lte: to },
          $or: [
            { 'buyer.username': buyerUsernameRegex },
            { 'buyer.buyerRegistrationAddress.fullName': buyerUsernameRegex }
          ]
        }).select('orderId').sort({ dateSold: -1 }).limit(2).lean();
        if (windowOrders.length === 1) {
          order = windowOrders[0];
        }
      }
    }

    if (!order && sellerId) {
      const fallbackOrders = await Order.find({
        seller: sellerId,
        'lineItems.legacyItemId': itemID
      }).select('orderId').sort({ dateSold: -1 }).limit(2).lean();
      if (fallbackOrders.length === 1) {
        order = fallbackOrders[0];
      }
    }

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
  externalMessageId,
  conversationId
}) {
  const normalized = normalizeBody(body);
  if (!normalized) return false;
  const finalSender = looksLikeSellerTemplate(body) ? 'SELLER' : sender;
  const finalRead = finalSender === 'SELLER' ? true : Boolean(read);

  if (externalMessageId) {
    const byExternal = await Message.findOne({ externalMessageId }).select('sender read subject orderId itemId itemTitle messageType conversationId').lean();
    if (byExternal) {
      const repairFields = {};
      if (orderId && byExternal.orderId !== orderId) {
        repairFields.orderId = orderId;
        repairFields.messageType = messageType || 'ORDER';
      }
      if (itemId && byExternal.itemId !== itemId) repairFields.itemId = itemId;
      if (itemTitle && !byExternal.itemTitle) repairFields.itemTitle = itemTitle;
      if (conversationId && !byExternal.conversationId) repairFields.conversationId = conversationId;

      if (byExternal.sender !== finalSender || Object.keys(repairFields).length > 0) {
        await Message.updateOne(
          { _id: byExternal._id },
          {
            $set: {
              ...repairFields,
              sender: finalSender,
              subject: subject || (finalSender === 'SELLER' ? 'Reply' : 'Message'),
              read: finalRead
            }
          }
        );
        return true;
      }
      return false;
    }
  }

  const threadQuery = buildThreadQuery({ sellerId, buyerUsername, orderId, itemId });
  const sameBodyRows = await Message.find(threadQuery).select('body sender read subject externalMessageId').lean();
  const sameBody = sameBodyRows.find((row) => normalizeBody(row.body) === normalized);
  if (sameBody) {
    if (sameBody.sender === finalSender) return false;

    await Message.updateOne(
      { _id: sameBody._id },
      {
        $set: {
          sender: finalSender,
          subject: subject || (finalSender === 'SELLER' ? 'Reply' : 'Message'),
          read: finalRead,
          ...(externalMessageId && !sameBody.externalMessageId ? { externalMessageId } : {})
        }
      }
    );
    return true;
  }

  if (await threadHasBody({ sellerId, buyerUsername, orderId, itemId, sender: finalSender, body })) {
    return false;
  }

  await Message.create({
    seller: sellerId,
    orderId,
    itemId,
    itemTitle,
    buyerUsername,
    conversationId: conversationId || undefined,
    externalMessageId: externalMessageId || undefined,
    sender: finalSender,
    subject: subject || (finalSender === 'SELLER' ? 'Reply' : 'Message'),
    body: extractTextFromHtml(body),
    mediaUrls,
    read: finalRead,
    messageType,
    messageDate: messageDate || new Date()
  });

  if (conversationId) {
    const threadMatch = {
      seller: sellerId,
      buyerUsername,
      $or: [{ conversationId: null }, { conversationId: '' }, { conversationId: { $exists: false } }]
    };
    const scope = [];
    if (orderId) scope.push({ orderId });
    if (itemId) scope.push({ itemId });
    if (scope.length > 0) {
      threadMatch.$and = [{ $or: scope }];
    }
    await Message.updateMany(threadMatch, { $set: { conversationId } });
  }

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

  const context = await resolveThreadContext({ itemID, senderID, itemTitle, sellerId: seller._id, messageDate });

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
    const messageDate = parseXmlDate(question.CreationDate?.[0]) || parseXmlDate(msg.CreationDate?.[0]) || new Date();
    const context = await resolveThreadContext({ itemID, senderID, itemTitle, sellerId: seller._id, messageDate });

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

  if (envelope && envelope === seller) return 'SELLER';
  if (envelope && envelope === buyer) return 'BUYER';
  if (seller && (lower.includes(seller) || lower.startsWith(`hi ${seller}`))) return 'SELLER';
  if (buyer && (lower.includes(buyer) || lower.includes(`@${buyer}`))) return 'BUYER';
  return 'BUYER';
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
    const envelopeIsSeller = Boolean(senderLower)
      && (senderLower !== buyerLower
      || messageTypeCode.toLowerCase().includes('response')
      || messageTypeCode.toLowerCase().includes('contact'));

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

const COMMERCE_MESSAGE_BASE = 'https://api.ebay.com/commerce/message/v1';

async function fetchSellerEbayUserId(token) {
  try {
    const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<GetUserRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
  <DetailLevel>ReturnSummary</DetailLevel>
</GetUserRequest>`;

    const response = await axios.post('https://api.ebay.com/ws/api.dll', xmlRequest, {
      headers: { ...EBAY_XML_HEADERS, 'X-EBAY-API-CALL-NAME': 'GetUser' }
    });
    const result = await parseStringPromise(response.data);
    if (result.GetUserResponse?.Ack?.[0] === 'Failure') return null;
    return result.GetUserResponse?.User?.[0]?.UserID?.[0] || null;
  } catch {
    return null;
  }
}

function resolveBuyerFromCommerceMessage(msg, sellerEbayUserId, sellerAppUsername) {
  const sender = String(msg?.senderUsername || '');
  const recipient = String(msg?.recipientUsername || '');
  const sellerIds = [sellerEbayUserId, sellerAppUsername].filter(Boolean).map((s) => s.toLowerCase());

  if (sellerIds.includes(sender.toLowerCase())) return recipient;
  if (sellerIds.includes(recipient.toLowerCase())) return sender;
  return sender || recipient;
}

function resolveSenderFromCommerceMessage(msg, buyerUsername) {
  const sender = String(msg?.senderUsername || '');
  if (sender.toLowerCase() === String(buyerUsername || '').toLowerCase()) return 'BUYER';
  return 'SELLER';
}

async function saveCommerceMessage(seller, msg, conversationSummary, sellerEbayUserId) {
  const conversationId = conversationSummary.conversationId || null;
  const itemId = conversationSummary.referenceType === 'LISTING'
    ? conversationSummary.referenceId
    : null;
  const itemTitle = conversationSummary.conversationTitle || null;
  const buyerUsername = resolveBuyerFromCommerceMessage(msg, sellerEbayUserId, seller.user?.username);
  const body = extractTextFromHtml(msg?.messageBody || '');
  if (!buyerUsername || !body) return { buyerNew: false, sellerNew: false };

  const context = await resolveThreadContext({ itemID: itemId, senderID: buyerUsername, itemTitle, sellerId: seller._id, messageDate: parseXmlDate(msg?.createdDate) || new Date() });
  const sender = resolveSenderFromCommerceMessage(msg, buyerUsername);
  const read = sender === 'SELLER' || String(msg?.readStatus || '').toUpperCase() === 'READ';

  const saved = await saveThreadMessage({
    sellerId: seller._id,
    buyerUsername,
    orderId: context.orderId,
    itemId: context.finalItemId || itemId,
    itemTitle: context.finalItemTitle || itemTitle,
    messageType: context.messageType,
    sender,
    subject: msg?.subject || 'Message',
    body,
    read,
    messageDate: parseXmlDate(msg?.createdDate) || new Date(),
    externalMessageId: msg?.messageId ? `commerce-${msg.messageId}` : undefined,
    conversationId
  });

  return {
    buyerNew: saved && sender === 'BUYER',
    sellerNew: saved && sender === 'SELLER'
  };
}

async function syncCommerceConversationMessages(seller, token, conversationSummary, sellerEbayUserId) {
  const conversationId = conversationSummary.conversationId;
  if (!conversationId) return { buyerNew: 0, sellerNew: 0 };

  let offset = 0;
  let buyerNew = 0;
  let sellerNew = 0;

  while (offset < 500) {
    let messages = [];
    try {
      const res = await axios.get(`${COMMERCE_MESSAGE_BASE}/conversation/${conversationId}`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        params: { conversation_type: 'FROM_MEMBERS', limit: 50, offset }
      });
      messages = res.data?.messages || [];
    } catch (err) {
      console.error(`[Commerce Sync] getConversation ${conversationId}:`, err.response?.data || err.message);
      break;
    }

    if (messages.length === 0 && offset === 0 && conversationSummary.latestMessage) {
      const one = await saveCommerceMessage(seller, conversationSummary.latestMessage, conversationSummary, sellerEbayUserId);
      buyerNew += one.buyerNew ? 1 : 0;
      sellerNew += one.sellerNew ? 1 : 0;
      break;
    }

    for (const msg of messages) {
      const one = await saveCommerceMessage(seller, msg, conversationSummary, sellerEbayUserId);
      buyerNew += one.buyerNew ? 1 : 0;
      sellerNew += one.sellerNew ? 1 : 0;
    }

    if (messages.length < 50) break;
    offset += messages.length;
  }

  return { buyerNew, sellerNew };
}

export async function syncCommerceConversationsForSeller(seller, token, {
  buyerUsername,
  summaryOnly = false,
  maxConversations = 200
} = {}) {
  const sellerName = seller.user?.username || seller._id;
  const sellerEbayUserId = summaryOnly ? null : await fetchSellerEbayUserId(token);
  const now = new Date();
  const startTime = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

  let offset = 0;
  let buyerNew = 0;
  let sellerNew = 0;
  let conversationsFetched = 0;

  while (offset < 1000 && conversationsFetched < maxConversations) {
    const params = {
      conversation_type: 'FROM_MEMBERS',
      start_time: startTime,
      end_time: now.toISOString(),
      limit: 50,
      offset
    };
    if (buyerUsername) params.other_party_username = buyerUsername;

    let conversations = [];
    let total = 0;
    try {
      const res = await axios.get(`${COMMERCE_MESSAGE_BASE}/conversation`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        params
      });
      conversations = res.data?.conversations || [];
      total = res.data?.total ?? conversations.length;
    } catch (err) {
      const detail = err.response?.data || err.message;
      console.error(`[Commerce Sync] getConversations failed for ${sellerName}:`, detail);
      return {
        buyerNew,
        sellerNew,
        conversationsFetched,
        error: typeof detail === 'string' ? detail : JSON.stringify(detail)
      };
    }

    let processedThisPage = 0;
    for (const conv of conversations) {
      if (conversationsFetched + processedThisPage >= maxConversations) break;

      if (summaryOnly) {
        if (!conv.latestMessage) continue;
        const one = await saveCommerceMessage(seller, conv.latestMessage, conv, sellerEbayUserId);
        buyerNew += one.buyerNew ? 1 : 0;
        sellerNew += one.sellerNew ? 1 : 0;
        processedThisPage++;
        continue;
      }

      const result = await syncCommerceConversationMessages(seller, token, conv, sellerEbayUserId);
      buyerNew += result.buyerNew;
      sellerNew += result.sellerNew;
      processedThisPage++;
    }

    conversationsFetched += processedThisPage;
    offset += conversations.length;
    if (conversations.length === 0 || offset >= total || conversationsFetched >= maxConversations) break;
  }

  console.log(`[Commerce Sync] ${sellerName}: ${conversationsFetched} conversations (${summaryOnly ? 'summary' : 'full'}), saved ${buyerNew} buyer + ${sellerNew} seller messages`);
  return { buyerNew, sellerNew, conversationsFetched };
}

export async function resolveCommerceConversationId(token, { sellerId, buyerUsername, itemId, orderId }) {
  const dbQuery = {
    seller: sellerId,
    buyerUsername,
    conversationId: { $nin: [null, ''] }
  };
  const scope = [];
  if (orderId) scope.push({ orderId });
  if (itemId) scope.push({ itemId });
  if (scope.length > 0) dbQuery.$or = scope;

  const existing = await Message.findOne(dbQuery).sort({ messageDate: -1 }).select('conversationId').lean();
  if (existing?.conversationId) return existing.conversationId;

  const params = {
    conversation_type: 'FROM_MEMBERS',
    other_party_username: buyerUsername,
    limit: 50
  };

  const res = await axios.get(`${COMMERCE_MESSAGE_BASE}/conversation`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    params
  });

  const conversations = res.data?.conversations || [];
  if (itemId) {
    const byItem = conversations.find((c) => c.referenceId === itemId);
    if (byItem?.conversationId) return byItem.conversationId;
  }
  return conversations[0]?.conversationId || null;
}

export async function sendCommerceMessage(token, {
  conversationId,
  otherPartyUsername,
  messageText,
  referenceId,
  messageMedia = []
}) {
  const payload = { messageText };

  if (conversationId) {
    payload.conversationId = conversationId;
  } else if (otherPartyUsername) {
    payload.otherPartyUsername = otherPartyUsername;
    if (referenceId) {
      payload.reference = { referenceId, referenceType: 'LISTING' };
    }
  } else {
    throw new Error('conversationId or otherPartyUsername is required');
  }

  if (messageMedia.length > 0) {
    payload.messageMedia = messageMedia;
  }

  const res = await axios.post(`${COMMERCE_MESSAGE_BASE}/send_message`, payload, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  });

  return res.data;
}

export async function backfillConversationId({ sellerId, buyerUsername, itemId, orderId, conversationId }) {
  if (!conversationId) return 0;

  const filter = {
    seller: sellerId,
    buyerUsername,
    $or: [{ conversationId: null }, { conversationId: '' }, { conversationId: { $exists: false } }]
  };
  const scope = [];
  if (orderId) scope.push({ orderId });
  if (itemId) scope.push({ itemId });
  if (scope.length > 0) filter.$and = [{ $or: scope }];

  const result = await Message.updateMany(filter, { $set: { conversationId } });
  return result.modifiedCount || 0;
}
