import mongoose from 'mongoose';

// Generic button/feature-level permission: superadmin always has access;
// everyone else needs their user id in allowedUserIds for the given featureId.
const featurePermissionSchema = new mongoose.Schema({
  featureId: { type: String, required: true, unique: true },
  allowedUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

export default mongoose.model('FeaturePermission', featurePermissionSchema);
