import mongoose from 'mongoose';

const ImageOverlaySettingsSchema = new mongoose.Schema(
  {
    settingsKey: { type: String, required: true, unique: true, default: 'global', trim: true },
    enabled: { type: Boolean, default: false },
    activeBadge: { type: String, default: 'usa-seller', trim: true },
    maxImages: { type: Number, default: 3, min: 1, max: 12 },
    /** frame = product inside overlay template; corner = badge on product; full = stretch overlay on product */
    overlayMode: { type: String, enum: ['frame', 'corner', 'full'], default: 'frame' },
    /** Inset from each edge of overlay canvas when overlayMode=frame (% of overlay size) */
    framePaddingPercent: { type: Number, default: 0, min: 0, max: 40 },
    overlayScalePercent: { type: Number, default: 30, min: 8, max: 80 },
    overlayPosition: {
      type: String,
      enum: ['bottom-left', 'bottom-right', 'top-left', 'top-right', 'center'],
      default: 'bottom-left',
    },
    outputMaxPx: { type: Number, default: 1600, min: 400, max: 2400 },
  },
  { timestamps: true }
);

export default mongoose.model('ImageOverlaySettings', ImageOverlaySettingsSchema);
