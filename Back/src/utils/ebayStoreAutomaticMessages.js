export const AUTOMATIC_MESSAGE_IDS = [
  'gift_message',
  'feedback',
  'order_placed',
  'tracking_available',
  'order_delivered',
];

export const DEFAULT_AUTOMATIC_MESSAGES = [
  {
    id: 'gift_message',
    label: 'Gift Message',
    enabled: false,
    body: 'Thank you for buying from us!',
  },
  {
    id: 'feedback',
    label: 'Feedback',
    enabled: false,
    body: 'An exceptionally first-rate buyer. We can\'t wait to do business with you again!',
  },
  {
    id: 'order_placed',
    label: 'Order was placed',
    enabled: false,
    body: [
      'Dear {{ buyer_first_name }},',
      '',
      'Your order is being processed and will be shipped soon. We will add a Tracking Number for your order as soon as it gets shipped, so you can track the delivery progress.',
      '',
      'Once your item arrives in satisfactory condition, please leave positive feedback and five stars for us. If there are any issues, please let us know and we will be happy to help.',
      '',
      'Thank you once again and have a great day!',
    ].join('\n'),
  },
  {
    id: 'tracking_available',
    label: 'Tracking number available',
    enabled: false,
    body: [
      'Dear {{ buyer_first_name }},',
      '',
      'Your package is on its way! The tracking number is updated on your order details.',
      '',
      'The tracking carrier is {{ shipping_carrier }}, and the tracking number is {{ tracking_number }}. It will arrive soon.',
      '',
      'Thank you for your patience!',
    ].join('\n'),
  },
  {
    id: 'order_delivered',
    label: 'Order was delivered',
    enabled: false,
    body: [
      'Dear {{ buyer_first_name }},',
      '',
      'Thank you for buying from us. We hope your package was delivered successfully and in satisfactory condition.',
      '',
      'If there are any issues with your order, please let us know as fast as you can so we can take care of it quickly.',
      '',
      'If you are satisfied with your purchase, please leave us a positive feedback with five stars. We really appreciate it, and hope to see you again!',
      '',
      '{{ feedback_url }}',
      '',
      'Thanks again and have a wonderful day,',
    ].join('\n'),
  },
];

export function mergeAutomaticMessages(input) {
  const byId = new Map(DEFAULT_AUTOMATIC_MESSAGES.map((message) => [message.id, { ...message }]));

  for (const item of Array.isArray(input) ? input : []) {
    const id = String(item?.id || '').trim();
    if (!byId.has(id)) continue;

    const base = byId.get(id);
    byId.set(id, {
      ...base,
      enabled: Boolean(item.enabled),
      body: String(item.body ?? base.body).trim() || base.body,
    });
  }

  return AUTOMATIC_MESSAGE_IDS.map((id) => byId.get(id)).filter(Boolean);
}
