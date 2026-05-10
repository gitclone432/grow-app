import mongoose from 'mongoose';

const GalleryTemplateSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true },
    title: { type: String, default: '', trim: true },
    html: { type: String, default: '' },
  },
  { _id: false }
);

/** Singleton document: reusable HTML templates + which template each seller uses */
const DescriptionTemplateGallerySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'singleton' },
    templates: { type: [GalleryTemplateSchema], default: [] },
    storeTemplateMap: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export default mongoose.model('DescriptionTemplateGallery', DescriptionTemplateGallerySchema);
