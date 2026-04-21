import mongoose from 'mongoose';

const OrderSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    orderId: { type: String, required: true, unique: true },
    legacyOrderId: String,
    creationDate: Date,
    lastModifiedDate: Date,
    orderFulfillmentStatus: String,
    orderPaymentStatus: String,
    sellerId: String, // eBay seller ID
    buyer: Object,
    buyerCheckoutNotes: String,
    pricingSummary: Object,
    cancelStatus: Object,
    paymentSummary: Object,
    fulfillmentStartInstructions: Array,
    lineItems: Array,
    ebayCollectAndRemitTax: Boolean,
    salesRecordReference: String,
    totalFeeBasisAmount: Object,
    totalMarketplaceFee: Object,
    fulfillmentHrefs: [String], // Array of fulfillment URLs
    // Denormalized fields for easy display
    dateSold: Date,
    shipByDate: Date,
    estimatedDelivery: Date,
    productName: String,
    itemNumber: String,
    buyerAddress: String,
    // Shipping address fields
    shippingFullName: String,
    shippingAddressLine1: String,
    shippingAddressLine2: String,
    shippingCity: String,
    shippingState: String,
    shippingPostalCode: String,
    shippingCountry: String,
    shippingPhone: String,
    quantity: Number,
    subtotal: Number,
    salesTax: Number,
    discount: Number,
    shipping: Number,
    transactionFees: Number,
    adFee: Number,
    adFeeGeneral: Number, // Manually editable ad fee
    // USD converted values
    subtotalUSD: Number,
    shippingUSD: Number,
    salesTaxUSD: Number,
    discountUSD: Number,
    transactionFeesUSD: Number,
    refundTotalUSD: Number, // Total refund amount in USD
    beforeTaxUSD: Number, // Amazon order before tax amount in USD
    estimatedTaxUSD: Number, // Amazon estimated tax in USD
    affiliatePrice: Number, // Manual affiliate page price, separate from Amazon beforeTax
    conversionRate: Number, // Stored conversion rate for reference
    cancelState: String, // NONE_REQUESTED, CANCEL_REQUESTED, CANCELED, etc.
    worksheetStatus: {
      type: String,
      enum: ['open', 'attended', 'resolved'],
      default: 'open'
    }, // Manual status for worksheet tracking
    refunds: Array, // Array of refund objects from paymentSummary.refunds (for display only)
    // Simple earnings field (auto for non-refunded orders, $0 for FULLY_REFUNDED/PARTIALLY_REFUNDED)
    orderEarnings: Number,
    trackingNumber: String, // Extracted from fulfillmentHrefs
    manualTrackingNumber: String, // Manually entered tracking number (separate from trackingNumber)
    purchaseMarketplaceId: String, // e.g., EBAY_US, EBAY_AUS, EBAY_Canada
    messagingStatus: {
      type: String,
      enum: ['Not Yet Started', 'Ongoing Conversation', 'Resolved'],
      default: 'Not Yet Started'
    },
    itemStatus: {
      type: String,
      enum: ['None', 'Out of Stock', 'Delayed Delivery', 'Label Created', 'Other'],
      default: 'None'
    },
    resolvedFrom: String, // Track which page it was resolved from: 'Return', 'Replace', or 'INR'
    sellerFault: {
      type: String,
      enum: ['Yes', 'No'],
      default: 'No'
    }, // For Account Health Report - track if seller is at fault for SNAD
    notes: String, // Notes field for internal use
    fulfillmentNotes: String,
    amazonAccount: String,
    amazonAccountAssignmentSource: {
      type: String,
      enum: ['affiliate', 'fulfillment'],
      default: null
    },
    arrivingDate: String,
    beforeTax: Number,
    estimatedTax: Number,
    azOrderId: String,
    amazonRefund: Number,
    cardName: String, // Reference to credit card name
    resolution: { type: String, default: null },
    remark: {
      type: String,
      default: null
    },
    orderTotal: Number, // Stored order total for sheet editing; defaults to pricingSummary.total.value + salesTax
    // Financial calculations (All Orders Sheet)
    tds: Number, // Tax Deducted at Source (1% of (pricingSummary.total.value + salesTax))
    tid: { type: Number, default: 0.24 }, // Transaction ID (fixed at $0.24)
    net: Number, // orderEarnings - tds - tid
    pBalanceINR: Number, // net * exchangeRate (for selected marketplace)
    ebayExchangeRate: Number, // Manual eBay exchange rate used for P.Balance calculation
    amazonExchangeRate: Number, // Manual Amazon exchange rate (set by user for Amazon purchases)
    // Amazon financial calculations
    amazonTotal: Number, // beforeTaxUSD + estimatedTaxUSD
    amazonTotalINR: Number, // amazonTotal * amazonExchangeRate
    marketplaceFee: Number, // 4% of amazonTotalINR
    igst: Number, // 18% of marketplaceFee
    totalCC: Number, // marketplaceFee + igst
    profit: { type: Number, default: 0 }, // P.Balance (INR) - A_total-inr - Total_CC

    // CRP classification (Category / Range / Product)
    orderCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'AsinListCategory', default: null },
    orderRangeId: { type: mongoose.Schema.Types.ObjectId, ref: 'AsinListRange', default: null },
    orderProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'AsinListProduct', default: null },

    // Manual logs field for internal notes (used in Issues & Resolutions)
    logs: { type: String, default: '' },

    // Policy message feature (20-minute follow-up message)
    policyMessageSent: { type: Boolean, default: false },
    policyMessageSentAt: Date,
    policyMessageDisabled: { type: Boolean, default: false },
    policyMessageEligibleAt: {
      type: Date,
      default: function () {
        const createdAt = this.creationDate ? new Date(this.creationDate) : new Date();
        const delayMs = 20 * 60 * 1000;
        if (Date.now() - createdAt.getTime() > delayMs) {
          return undefined;
        }
        return new Date(createdAt.getTime() + delayMs);
      }
    },

    // Already in use flag for Awaiting Shipment
    alreadyInUse: {
      type: String,
      enum: ['Yes', 'No'],
      default: 'No'
    },

    // Tracks whether a message was sent to the buyer when the remark was last updated
    remarkMessageSent: { type: Boolean, default: false },

    // Sourcing / Affiliate fields (used in the Affiliate Orders daily tracking page)
    affiliateLink: { type: String, default: '' },
    sourcingStatus: {
      type: String,
      enum: ['Done', 'Not Yet', 'Added to cart', 'Cancelled order'],
      default: 'Not Yet'
    },
    sourcingCompletedAt: { type: Date, default: null },
    purchaser: { type: String, default: '' },
    sourcingMessageStatus: {
      type: String,
      enum: ['Being Processed', 'Late Message', 'Cancellation Message', 'Alternative Message', 'Confirmation Message'],
      default: 'Being Processed'
    },

    // Track if listing price was updated via All Orders Sheet
    priceUpdatedViaSheet: { type: Boolean, default: false },
    lastPriceUpdateDate: { type: Date, default: null },
  },
  { timestamps: true }
);

// Index for faster queries
OrderSchema.index({ seller: 1, orderId: 1 });
OrderSchema.index({ seller: 1, creationDate: -1 });
OrderSchema.index({ seller: 1, lastModifiedDate: -1 });
OrderSchema.index({ seller: 1, creationDate: -1, lastModifiedDate: -1 }); // Compound index for polling queries
OrderSchema.index({ dateSold: 1 }); // Index for date range searches
OrderSchema.index({ cancelState: 1, creationDate: -1 }); // Index for cancelled orders queries
OrderSchema.index({ policyMessageSent: 1, policyMessageDisabled: 1, policyMessageEligibleAt: 1 }); // Index for policy message processing

export default mongoose.model('Order', OrderSchema);
