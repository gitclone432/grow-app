import api from '../lib/api';

export const DEFAULT_REMARK_TEMPLATES = [
  {
    id: 'delivered',
    name: 'Delivered',
    text: `Hello {{buyer_first_name}},
Thanks for your patience, we hope your package was delivered successfully and in satisfactory condition.
If there are any issues with your order, please let us know so we can take care of it quickly.
If you are satisfied, please leave us positive feedback with five stars.
Thanks again and have a wonderful day.`
  },
  {
    id: 'in-transit',
    name: 'In-transit',
    text: `Hi {{buyer_first_name}}, We're pleased to let you know that your order is currently in transit and will be delivered shortly.
Thank you for your trust and support.`
  },
  {
    id: 'processing',
    name: 'Processing',
    text: `Hi {{buyer_first_name}},
We're pleased to inform you that your order has been processed.
Also, we are actively monitoring your order to ensure it reaches you smoothly and tracking number will be updated on your eBay order page as soon as they become available.
Thank you for choosing us.`
  },
  {
    id: 'shipped',
    name: 'Shipped',
    text: `Hi {{buyer_first_name}},
Your order has been shipped.
We are still waiting for the tracking number from the warehouse and it will be updated shortly.`
  },
  {
    id: 'out-for-delivery',
    name: 'Out for delivery',
    text: `Hi {{buyer_first_name}},
Your package is currently out for delivery and should arrive shortly.`
  },
  {
    id: 'delayed',
    name: 'Delayed',
    text: `Hi {{buyer_first_name}},
We apologize for the delay in your shipment.
Your package is still in transit and should arrive soon.`
  },
  {
    id: 'refund',
    name: 'Refund',
    text: `Hi {{buyer_first_name}},
Your refund has been processed successfully.
Please allow a few business days for it to reflect in your account.`
  },
  {
    id: 'not-yet-shipped',
    name: 'Not yet shipped',
    text: `Hi {{buyer_first_name}},
Your order has not shipped yet, but our team is actively working on it.
We'll keep you updated as soon as it ships.`
  },
  {
    id: 'alternative-message',
    name: 'Alternative message',
    text: `Hello {{buyer_first_name}},
We wanted to update you regarding your order. During our final quality check, we found that the {{item_title}} did not meet our quality standards, and it was the last piece in stock.

However, we do have the newest updated design available. If you'd like, we can ship the upgraded model to you at no extra cost.

Please let us know how you'd like to proceed.
Thank you, and have a great day!`
  },
  {
    id: 'alternative-cancellation-message',
    name: 'Alternative cancellation message',
    text: `Hello {{buyer_first_name}},

We had begun preparing your order for shipment, but during our final quality check, we discovered that the {{item_title}} did not meet our quality standards. Unfortunately, it was the last one in stock, so we're unable to send a replacement.

To ensure you receive your refund promptly, please kindly start a cancellation request on your end. Once the request is submitted, we will accept it right away.

We sincerely apologize for the inconvenience and truly appreciate your understanding.`
  }
];

function normalizeTemplates(input) {
  if (!Array.isArray(input)) return [];
  const usedNames = new Set();

  return input
    .map((template, index) => {
      const name = String(template?.name || '').trim();
      const text = String(template?.text || '').trim();
      if (!name || !text) return null;
      const lower = name.toLowerCase();
      if (usedNames.has(lower)) return null;
      usedNames.add(lower);
      return {
        id: template?.id || `${lower.replace(/\s+/g, '-')}-${index}`,
        name,
        text
      };
    })
    .filter(Boolean);
}

export async function loadRemarkTemplates() {
  try {
    const { data } = await api.get('/remark-templates');
    const templates = normalizeTemplates(data?.templates || []);
    return templates;
  } catch (error) {
    return DEFAULT_REMARK_TEMPLATES;
  }
}

export async function saveRemarkTemplates(templates) {
  const normalized = normalizeTemplates(templates);
  const { data } = await api.put('/remark-templates', { templates: normalized });
  return normalizeTemplates(data?.templates || []);
}

export function findRemarkTemplateText(templates, remarkName) {
  const match = (templates || []).find((template) => template.name === remarkName);
  return match?.text || '';
}

export function remarkOptionsFromTemplates(templates) {
  return (templates || []).map((template, index) => ({
    _id: template.id || `remark-${index}`,
    name: template.name
  }));
}
