import mongoose from 'mongoose';

const SellerSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    ebayMarketplaces: [{ type: String, required: true }],
    ebayTokens: {
      access_token: String,
      refresh_token: String,
      expires_in: Number,
      refresh_token_expires_in: Number,
      token_type: String,
      scope: String,
      fetchedAt: Date
    },
    // Default: Mar 1, 2026 00:00:00 UTC
    initialSyncDate: { type: Date, default: () => new Date(Date.UTC(2026, 2, 1, 0, 0, 0, 0)) },

    // NEW: Message Polling Metadata
    lastMessagePolledAt: { type: Date, default: null },

    lastListingPolledAt: { type: Date, default: null },

    // For Edit Listings: tracks last sync of ALL listings (not just Motors)
    lastAllListingsPolledAt: { type: Date, default: null },
    isStoreActive: { type: Boolean, default: true },
    disconnectedAt: { type: Date, default: null },
    reconnectedAt: { type: Date, default: null },
    lastConnectedAt: { type: Date, default: null }

  },
  { timestamps: true }
);

export default mongoose.model('Seller', SellerSchema);