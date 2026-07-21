import mongoose from 'mongoose';

const invoiceSchema = new mongoose.Schema(
  {
    category: { type: String, required: true, trim: true }, // OpenAI, Proxy, Claude, GetIn, Render, MongoDB, ScarperAPI, Codex, etc.
    invoiceDate: { type: Date, required: true }, // Date on the invoice
    uploadDate: { type: Date, default: () => new Date() }, // When it was uploaded
    fileName: { type: String, required: true, trim: true }, // Original file name
    filePath: { type: String }, // Legacy field for backward compatibility (deprecated)
    gridFsFileId: { type: mongoose.Schema.Types.ObjectId, required: true }, // GridFS file ID
    fileSize: { type: Number }, // File size in bytes
    mimeType: { type: String }, // MIME type of the file
    notes: { type: String, trim: true, default: '' }, // Optional notes
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Indexes for fast lookups
invoiceSchema.index({ category: 1 });
invoiceSchema.index({ invoiceDate: -1 });
invoiceSchema.index({ uploadDate: -1 });
invoiceSchema.index({ category: 1, invoiceDate: -1 });
invoiceSchema.index({ gridFsFileId: 1 });

export default mongoose.model('Invoice', invoiceSchema);
