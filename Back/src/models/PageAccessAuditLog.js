import mongoose from 'mongoose';

const auditUserSchema = new mongoose.Schema(
  {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String, required: true },
    email: { type: String },
    role: { type: String, required: true },
  },
  { _id: false }
);

const permissionSnapshotSchema = new mongoose.Schema(
  {
    role: { type: String, required: true },
    useCustomPermissions: { type: Boolean, required: true },
    pagePermissions: [{ type: String }],
    effectivePagePermissions: [{ type: String }],
    permissionsVersion: { type: Number, required: true },
  },
  { _id: false }
);

const permissionDiffSchema = new mongoose.Schema(
  {
    addedStoredPermissions: [{ type: String }],
    removedStoredPermissions: [{ type: String }],
    grantedEffectivePermissions: [{ type: String }],
    revokedEffectivePermissions: [{ type: String }],
    useCustomPermissionsChanged: { type: Boolean, default: false },
    roleChanged: { type: Boolean, default: false },
    configurationChanged: { type: Boolean, default: false },
    effectiveAccessChanged: { type: Boolean, default: false },
  },
  { _id: false }
);

const requestMetadataSchema = new mongoose.Schema(
  {
    ipAddress: { type: String },
    userAgent: { type: String },
  },
  { _id: false }
);

const PageAccessAuditLogSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      enum: ['user_created', 'page_permissions_updated'],
      required: true,
      index: true,
    },
    source: {
      type: String,
      enum: ['user_creation', 'page_access_management', 'system'],
      default: 'page_access_management',
      required: true,
    },
    actor: { type: auditUserSchema, required: true },
    target: { type: auditUserSchema, required: true },
    before: { type: permissionSnapshotSchema, default: null },
    after: { type: permissionSnapshotSchema, required: true },
    diff: { type: permissionDiffSchema, required: true },
    affectedPageIds: [{ type: String }],
    effectiveAccessChanged: { type: Boolean, default: false, index: true },
    sessionInvalidated: { type: Boolean, default: false },
    reason: { type: String, trim: true, default: '' },
    metadata: { type: requestMetadataSchema, default: () => ({}) },
  },
  { timestamps: true }
);

PageAccessAuditLogSchema.index({ createdAt: -1 });
PageAccessAuditLogSchema.index({ 'target.id': 1, createdAt: -1 });
PageAccessAuditLogSchema.index({ 'actor.id': 1, createdAt: -1 });
PageAccessAuditLogSchema.index({ affectedPageIds: 1, createdAt: -1 });

export default mongoose.model('PageAccessAuditLog', PageAccessAuditLogSchema);