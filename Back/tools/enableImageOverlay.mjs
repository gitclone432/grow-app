import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectToDatabase } from '../src/lib/db.js';
import ImageOverlaySettings from '../src/models/ImageOverlaySettings.js';
import {
  getImageOverlayRuntimeConfig,
  invalidateImageOverlaySettingsCache,
  listOverlayBadges,
} from '../src/utils/overlaySettings.js';

const serverRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(serverRoot, '.env'), override: true });

await connectToDatabase();
const badges = await listOverlayBadges();
const activeBadge =
  badges.find((b) => b.name === 'usa-seller')?.name || badges[0]?.name || 'usa-seller';

await ImageOverlaySettings.findOneAndUpdate(
  { settingsKey: 'global' },
  {
    $set: {
      enabled: true,
      activeBadge,
      maxImages: 3,
      overlayMode: 'frame',
      framePaddingPercent: 0,
    },
  },
  { upsert: true, new: true }
);

invalidateImageOverlaySettingsCache();
const cfg = await getImageOverlayRuntimeConfig();
console.log(
  JSON.stringify(
    {
      imgbbConfigured: cfg.imgbbConfigured,
      enabled: cfg.enabled,
      activeBadge: cfg.activeBadge,
      badges: badges.map((b) => b.name),
    },
    null,
    2
  )
);

process.exit(0);
