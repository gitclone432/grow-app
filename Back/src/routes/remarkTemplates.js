import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import { validate } from '../utils/validate.js';
import { updateRemarkTemplatesSchema } from '../schemas/index.js';
import RemarkTemplate from '../models/RemarkTemplate.js';

const router = Router();

const DEFAULT_REMARK_TEMPLATES = [
  {
    name: 'Delivered',
    text: `Hello {{buyer_first_name}},
Thanks for your patience, we hope your package was delivered successfully and in satisfactory condition.
If there are any issues with your order, please let us know so we can take care of it quickly.
If you are satisfied, please leave us positive feedback with five stars.
Thanks again and have a wonderful day.`
  },
  {
    name: 'In-transit',
    text: `Hi {{buyer_first_name}}, We're pleased to let you know that your order is currently in transit and will be delivered shortly.
Thank you for your trust and support.`
  },
  {
    name: 'Processing',
    text: `Hi {{buyer_first_name}},
We're pleased to inform you that your order has been processed.
Also, we are actively monitoring your order to ensure it reaches you smoothly and tracking number will be updated on your eBay order page as soon as they become available.
Thank you for choosing us.`
  },
  {
    name: 'Shipped',
    text: `Hi {{buyer_first_name}},
Your order has been shipped.
We are still waiting for the tracking number from the warehouse and it will be updated shortly.`
  },
  {
    name: 'Out for delivery',
    text: `Hi {{buyer_first_name}},
Your package is currently out for delivery and should arrive shortly.`
  },
  {
    name: 'Delayed',
    text: `Hi {{buyer_first_name}},
We apologize for the delay in your shipment.
Your package is still in transit and should arrive soon.`
  },
  {
    name: 'Refund',
    text: `Hi {{buyer_first_name}},
Your refund has been processed successfully.
Please allow a few business days for it to reflect in your account.`
  },
  {
    name: 'Not yet shipped',
    text: `Hi {{buyer_first_name}},
Your order has not shipped yet, but our team is actively working on it.
We'll keep you updated as soon as it ships.`
  },
  {
    name: 'Alternative message',
    text: `Hello {{buyer_first_name}},
We wanted to update you regarding your order. During our final quality check, we found that the {{item_title}} did not meet our quality standards, and it was the last piece in stock.

However, we do have the newest updated design available. If you'd like, we can ship the upgraded model to you at no extra cost.

Please let us know how you'd like to proceed.
Thank you, and have a great day!`
  },
  {
    name: 'Alternative cancellation message',
    text: `Hello {{buyer_first_name}},

We had begun preparing your order for shipment, but during our final quality check, we discovered that the {{item_title}} did not meet our quality standards. Unfortunately, it was the last one in stock, so we're unable to send a replacement.

To ensure you receive your refund promptly, please kindly start a cancellation request on your end. Once the request is submitted, we will accept it right away.

We sincerely apologize for the inconvenience and truly appreciate your understanding.`
  }
];

function toFrontendTemplate(template) {
  return {
    id: String(template._id),
    name: template.name,
    text: template.text
  };
}

async function ensureDefaultTemplatesPresent() {
  const existingTemplates = await RemarkTemplate.find({ isActive: true })
    .select('name sortOrder')
    .sort({ sortOrder: 1, createdAt: 1 })
    .lean();

  const existingNames = new Set(existingTemplates.map((template) => String(template.name || '').trim().toLowerCase()));
  const nextSortOrder = existingTemplates.reduce(
    (maxSortOrder, template) => Math.max(maxSortOrder, Number.isFinite(template.sortOrder) ? template.sortOrder : -1),
    -1
  );

  const missingDefaults = DEFAULT_REMARK_TEMPLATES.filter(
    (template) => !existingNames.has(template.name.trim().toLowerCase())
  );

  if (missingDefaults.length === 0) return;

  const toInsert = missingDefaults.map((template, index) => ({
    ...template,
    isActive: true,
    sortOrder: nextSortOrder + index + 1
  }));

  await RemarkTemplate.insertMany(toInsert);
}

router.get('/', requireAuth, async (req, res) => {
  try {
    await ensureDefaultTemplatesPresent();

    const templates = await RemarkTemplate.find({ isActive: true })
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean();

    res.json({ templates: templates.map(toFrontendTemplate) });
  } catch (error) {
    console.error('Error fetching remark templates:', error);
    res.status(500).json({ error: 'Failed to fetch remark templates' });
  }
});

router.put('/', requireAuth, requirePageAccess('BuyerMessages'), validate(updateRemarkTemplatesSchema), async (req, res) => {
  try {
    const incoming = Array.isArray(req.body?.templates) ? req.body.templates : null;
    if (!incoming) {
      return res.status(400).json({ error: 'templates must be an array' });
    }

    const seenNames = new Set();
    const normalized = [];
    for (let index = 0; index < incoming.length; index += 1) {
      const raw = incoming[index] || {};
      const name = String(raw.name || '').trim();
      const text = String(raw.text || '').trim();
      const id = String(raw.id || raw._id || '').trim();

      if (!name || !text) {
        return res.status(400).json({ error: 'Each template requires name and text' });
      }
      const lower = name.toLowerCase();
      if (seenNames.has(lower)) {
        return res.status(400).json({ error: `Duplicate template name: ${name}` });
      }
      seenNames.add(lower);

      normalized.push({ id, name, text, sortOrder: index });
    }

    const existing = await RemarkTemplate.find({}).select('_id').lean();
    const existingIdSet = new Set(existing.map((template) => String(template._id)));
    const keepIds = new Set();

    for (const template of normalized) {
      const canUpdate = template.id && mongoose.Types.ObjectId.isValid(template.id) && existingIdSet.has(template.id);
      if (canUpdate) {
        await RemarkTemplate.findByIdAndUpdate(template.id, {
          name: template.name,
          text: template.text,
          isActive: true,
          sortOrder: template.sortOrder
        });
        keepIds.add(template.id);
      } else {
        const created = await RemarkTemplate.create({
          name: template.name,
          text: template.text,
          isActive: true,
          sortOrder: template.sortOrder
        });
        keepIds.add(String(created._id));
      }
    }

    await RemarkTemplate.updateMany(
      { _id: { $nin: [...keepIds].map((id) => new mongoose.Types.ObjectId(id)) } },
      { isActive: false }
    );

    const saved = await RemarkTemplate.find({ isActive: true })
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean();

    res.json({ success: true, templates: saved.map(toFrontendTemplate) });
  } catch (error) {
    console.error('Error saving remark templates:', error);
    res.status(500).json({ error: 'Failed to save remark templates' });
  }
});

export default router;
