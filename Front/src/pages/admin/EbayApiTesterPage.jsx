import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import api from '../../lib/api';

const PRESETS = [
  // Sell Account / eBay Parameters
  { group: 'Sell Account', label: 'Selling Privileges (All Stores)', method: 'GET', path: '/ebay/selling/summary/all', params: {} },
  { group: 'Sell Account', label: 'Selling Summary (Single Seller)', method: 'GET', path: '/ebay/selling/summary', params: { sellerId: '<sellerId>' } },
  { group: 'Sell Account', label: 'eBay API Usage Stats (All Stores)', method: 'GET', path: '/ebay/api-usage-stats/all', params: {} },
  { group: 'Sell Account', label: 'eBay API Usage Stats (Single Seller)', method: 'GET', path: '/ebay/api-usage-stats', params: { sellerId: '<sellerId>' } },
  { group: 'Sell Account', label: 'Seller Funds Summary', method: 'GET', path: '/ebay/seller-funds-summary', params: {} },

  // Payouts / Finances
  { group: 'Payouts & Finances', label: 'Processing Transactions', method: 'GET', path: '/ebay/processing-transactions/<sellerId>', params: {} },
  { group: 'Payouts & Finances', label: 'On Hold Transactions', method: 'GET', path: '/ebay/onhold-transactions/<sellerId>', params: {} },
  { group: 'Payouts & Finances', label: 'Upcoming + Recent Payouts', method: 'GET', path: '/ebay/upcoming-payouts/<sellerId>', params: {} },
  { group: 'Payouts & Finances', label: 'Payoneer Recent Completed Feed', method: 'GET', path: '/ebay/payoneer-recent-completed-feed', params: {} },
  { group: 'Payouts & Finances', label: 'Best Offers Eligible (All Stores)', method: 'GET', path: '/ebay/best-offers/eligible/all', params: { status: 'Active', entriesPerPage: 100, maxPages: 5 } },

  // Negotiation / Send Offers
  { group: 'Negotiation / Offers', label: 'Negotiation: Find Eligible Items', method: 'GET', path: '/sell/negotiation/v1/find_eligible_items', params: { limit: 50, offset: 0 } },
  {
    group: 'Negotiation / Offers',
    label: 'Negotiation: Send Offer to Interested Buyers',
    method: 'POST',
    path: '/sell/negotiation/v1/send_offer_to_interested_buyers',
    params: {},
  },

  // Sell Analytics
  {
    group: 'Sell Analytics',
    label: 'Analytics: Traffic Report',
    method: 'GET',
    path: '/sell/analytics/v1/traffic_report',
    params: {
      dimension: 'LISTING',
      metric: 'LISTING_IMPRESSION_SEARCH_RESULTS_PAGE,LISTING_IMPRESSION_STORE,LISTING_IMPRESSION_TOTAL',
      filter: 'marketplace_ids:{EBAY_US},date_range:[20260401..20260430]',
      limit: 50,
      offset: 0
    },
  },
  {
    group: 'Sell Analytics',
    label: 'Analytics: Traffic Report (DAY + Conversion)',
    method: 'GET',
    path: '/sell/analytics/v1/traffic_report',
    params: {
      filter: 'marketplace_ids:{EBAY_US},date_range:[20160601..20160828]',
      dimension: 'DAY',
      metric: 'LISTING_IMPRESSION_SEARCH_RESULTS_PAGE,LISTING_IMPRESSION_STORE,SALES_CONVERSION_RATE'
    },
  },

  // Post-Order (Legacy)
  {
    group: 'Post-Order: Cancellation',
    label: 'Post-Order: Approve Cancellation',
    method: 'POST',
    path: '/post-order/v2/cancellation/<cancelId>/approve',
    params: {},
  },
  {
    group: 'Post-Order: Cancellation',
    label: 'Post-Order: Check Cancellation Eligibility',
    method: 'POST',
    path: '/post-order/v2/cancellation/check_eligibility',
    params: {},
  },
  {
    group: 'Post-Order: Cancellation',
    label: 'Post-Order: Create Cancellation Request',
    method: 'POST',
    path: '/post-order/v2/cancellation',
    params: {},
  },
  {
    group: 'Post-Order: Cancellation',
    label: 'Post-Order: Get Cancellation',
    method: 'GET',
    path: '/post-order/v2/cancellation/<cancelId>',
    params: {},
  },
  {
    group: 'Post-Order: Cancellation',
    label: 'Post-Order: Reject Cancellation',
    method: 'POST',
    path: '/post-order/v2/cancellation/<cancelId>/reject',
    params: {},
  },
  {
    group: 'Post-Order: Cancellation',
    label: 'Post-Order: Search Cancellations',
    method: 'GET',
    path: '/post-order/v2/cancellation/search',
    params: { limit: 25, offset: 0 },
  },
  {
    group: 'Post-Order: Case Management',
    label: 'Post-Order: Appeal Case Decision [Compliance overlap]',
    method: 'POST',
    path: '/post-order/v2/casemanagement/<caseId>/appeal',
    params: {},
  },
  {
    group: 'Post-Order: Case Management',
    label: 'Post-Order: Get Case [Compliance overlap]',
    method: 'GET',
    path: '/post-order/v2/casemanagement/<caseId>',
    params: {},
  },
  {
    group: 'Post-Order: Case Management',
    label: 'Post-Order: Search Cases [Compliance overlap]',
    method: 'GET',
    path: '/post-order/v2/casemanagement/search',
    params: { limit: 25, offset: 0 },
  },
  {
    group: 'Post-Order: Inquiry',
    label: 'Post-Order: Escalate Inquiry [Compliance overlap]',
    method: 'POST',
    path: '/post-order/v2/inquiry/<inquiryId>/escalate',
    params: {},
  },
  {
    group: 'Post-Order: Inquiry',
    label: 'Post-Order: Get Inquiry [Compliance overlap]',
    method: 'GET',
    path: '/post-order/v2/inquiry/<inquiryId>',
    params: {},
  },
  {
    group: 'Post-Order: Inquiry',
    label: 'Post-Order: Issue Inquiry Refund [Compliance overlap]',
    method: 'POST',
    path: '/post-order/v2/inquiry/<inquiryId>/issue_refund',
    params: {},
  },
  {
    group: 'Post-Order: Inquiry',
    label: 'Post-Order: Provide Inquiry Shipment Info [Compliance overlap]',
    method: 'POST',
    path: '/post-order/v2/inquiry/<inquiryId>/provide_shipment_info',
    params: {},
  },
  {
    group: 'Post-Order: Inquiry',
    label: 'Post-Order: Inquiry Search [Compliance overlap]',
    method: 'GET',
    path: '/post-order/v2/inquiry/search',
    params: {
      limit: 25,
      offset: 0
    },
  },
  {
    group: 'Post-Order: Inquiry',
    label: 'Post-Order: Send Inquiry Message [Compliance overlap]',
    method: 'POST',
    path: '/post-order/v2/inquiry/<inquiryId>/send_message',
    params: {},
  },
  {
    group: 'Post-Order: Return',
    label: 'Post-Order: Add Shipping Label Info [Compliance overlap]',
    method: 'POST',
    path: '/post-order/v2/return/<returnId>/add_shipping_label',
    params: {},
  },
  {
    group: 'Post-Order: Return',
    label: 'Post-Order: Create Return Request [Compliance overlap]',
    method: 'POST',
    path: '/post-order/v2/return',
    params: {},
  },
  {
    group: 'Post-Order: Return',
    label: 'Post-Order: Escalate Return [Compliance overlap]',
    method: 'POST',
    path: '/post-order/v2/return/<returnId>/escalate',
    params: {},
  },
  {
    group: 'Post-Order: Return',
    label: 'Post-Order: Get Return [Compliance overlap]',
    method: 'GET',
    path: '/post-order/v2/return/<returnId>',
    params: {},
  },
  {
    group: 'Post-Order: Return',
    label: 'Post-Order: Get Return Files [Compliance overlap]',
    method: 'GET',
    path: '/post-order/v2/return/<returnId>/files',
    params: {},
  },
  {
    group: 'Post-Order: Return',
    label: 'Post-Order: Get Return Preferences [Compliance overlap]',
    method: 'GET',
    path: '/post-order/v2/return/preference',
    params: {},
  },
  {
    group: 'Post-Order: Return',
    label: 'Post-Order: Get Shipment Tracking Info [Compliance overlap]',
    method: 'GET',
    path: '/post-order/v2/return/<returnId>/tracking',
    params: {},
  },
  {
    group: 'Post-Order: Return',
    label: 'Post-Order: Issue Return Refund [Compliance overlap]',
    method: 'POST',
    path: '/post-order/v2/return/<returnId>/issue_refund',
    params: {},
  },
  {
    group: 'Post-Order: Return',
    label: 'Post-Order: Mark Return Received [Compliance overlap]',
    method: 'POST',
    path: '/post-order/v2/return/<returnId>/mark_as_received',
    params: {},
  },
  {
    group: 'Post-Order: Return',
    label: 'Post-Order: Process Return Request [Compliance overlap]',
    method: 'POST',
    path: '/post-order/v2/return/<returnId>/decide',
    params: {},
  },
  {
    group: 'Post-Order: Return',
    label: 'Post-Order: Return Search [Compliance overlap]',
    method: 'GET',
    path: '/post-order/v2/return/search',
    params: {
      limit: 25,
      offset: 0
    },
  },
  {
    group: 'Post-Order: Return',
    label: 'Post-Order: Send Return Message [Compliance overlap]',
    method: 'POST',
    path: '/post-order/v2/return/<returnId>/send_message',
    params: {},
  },
  {
    group: 'Post-Order: Return',
    label: 'Post-Order: Set Return Preferences [Compliance overlap]',
    method: 'POST',
    path: '/post-order/v2/return/preference',
    params: {},
  },
  {
    group: 'Post-Order: Return',
    label: 'Post-Order: Upload Return File [Compliance overlap]',
    method: 'POST',
    path: '/post-order/v2/return/<returnId>/file/upload',
    params: {},
  },

  // Orders / Dashboards
  { group: 'Orders & Dashboard', label: 'Stored Orders', method: 'GET', path: '/ebay/stored-orders', params: { page: 1, limit: 25 } },
  { group: 'Orders & Dashboard', label: 'All Orders USD', method: 'GET', path: '/ebay/all-orders-usd', params: { page: 1, limit: 25 } },
  { group: 'Orders & Dashboard', label: 'Order Dashboard Overview', method: 'GET', path: '/orders/dashboard/overview', params: {} },
  { group: 'Orders & Dashboard', label: 'Order Dashboard Monthly Delta', method: 'GET', path: '/orders/dashboard/monthly-delta', params: {} },

  // Compliance / Support
  { group: 'Compliance', label: 'Stored Returns', method: 'GET', path: '/ebay/stored-returns', params: { page: 1, limit: 25 } },
  { group: 'Compliance', label: 'Stored INR Cases', method: 'GET', path: '/ebay/stored-inr-cases', params: { page: 1, limit: 25 } },
  { group: 'Compliance', label: 'Stored Payment Disputes', method: 'GET', path: '/ebay/stored-payment-disputes', params: { page: 1, limit: 25 } },
  { group: 'Compliance', label: 'Issues by Order Index', method: 'GET', path: '/ebay/issues-by-order', params: {} },

  // Messages / Chat
  { group: 'Messages', label: 'Stored Messages', method: 'GET', path: '/ebay/stored-messages', params: { page: 1, limit: 25 } },
  { group: 'Messages', label: 'Chat Threads', method: 'GET', path: '/ebay/chat/threads', params: { page: 1, limit: 20 } },
  { group: 'Messages', label: 'Chat Messages', method: 'GET', path: '/ebay/chat/messages', params: { sellerId: '<sellerId>', orderId: '<orderId>' } },
  { group: 'Messages', label: 'Chat Search by Order', method: 'GET', path: '/ebay/chat/search-order', params: { orderId: '<orderId>' } },

  // Master data
  { group: 'Master Data', label: 'Categories', method: 'GET', path: '/categories', params: {} },
  { group: 'Master Data', label: 'Ranges', method: 'GET', path: '/ranges', params: {} },
  { group: 'Master Data', label: 'Products/Listings Table', method: 'GET', path: '/listing', params: { page: 1, limit: 20 } },
  { group: 'Trading: Orders & Transactions', label: 'Trading: GetBestOffers', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/GetOrders.html */
  { group: 'Trading: Orders & Transactions', label: 'Trading: GetOrders', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/GetItemTransactions.html */
  { group: 'Trading: Orders & Transactions', label: 'Trading: GetItemTransactions', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/GetSellerTransactions.html */
  { group: 'Trading: Orders & Transactions', label: 'Trading: GetSellerTransactions', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/CompleteSale.html — mutates order status; use real OrderID only in staging tests */
  { group: 'Trading: Orders & Transactions', label: 'Trading: CompleteSale', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/AddOrder.html — combines line items; requires valid unpaid transactions + fields per doc */
  { group: 'Trading: Orders & Transactions', label: 'Trading: AddOrder', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/SendInvoice.html — can email invoice to buyer; test carefully */
  { group: 'Trading: Orders & Transactions', label: 'Trading: SendInvoice', method: 'POST', path: '/ebay/dev/trading-call', params: {} },

  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/AddMemberMessageAAQToPartner.html — sends ASQ message to buyer; live buyer contact */
  { group: 'Trading: Messages', label: 'Trading: AddMemberMessageAAQToPartner', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/AddMemberMessageRTQ.html — reply to an existing member message thread */
  { group: 'Trading: Messages', label: 'Trading: AddMemberMessageRTQ', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/AddMemberMessagesAAQToBidder.html — send message to bidders/buyers */
  { group: 'Trading: Messages', label: 'Trading: AddMemberMessagesAAQToBidder', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/GetMyMessages.html — fetch seller messages */
  { group: 'Trading: Messages', label: 'Trading: GetMyMessages', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/GetMemberMessages.html */
  { group: 'Trading: Messages', label: 'Trading: GetMemberMessages', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/GetMessagePreferences.html */
  { group: 'Trading: Messages', label: 'Trading: GetMessagePreferences', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/SetMessagePreferences.html */
  { group: 'Trading: Messages', label: 'Trading: SetMessagePreferences', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/ReviseMyMessages.html */
  { group: 'Trading: Messages', label: 'Trading: ReviseMyMessages', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/ReviseMyMessagesFolders.html */
  { group: 'Trading: Messages', label: 'Trading: ReviseMyMessagesFolders', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/DeleteMyMessages.html */
  { group: 'Trading: Messages', label: 'Trading: DeleteMyMessages', method: 'POST', path: '/ebay/dev/trading-call', params: {} },

  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/GetFeedback.html */
  { group: 'Trading: Feedback', label: 'Trading: GetFeedback', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/GetItemsAwaitingFeedback.html */
  { group: 'Trading: Feedback', label: 'Trading: GetItemsAwaitingFeedback', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/LeaveFeedback.html */
  { group: 'Trading: Feedback', label: 'Trading: LeaveFeedback', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/RespondToFeedback.html */
  { group: 'Trading: Feedback', label: 'Trading: RespondToFeedback', method: 'POST', path: '/ebay/dev/trading-call', params: {} },

  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/GeteBayDetails.html */
  { group: 'Trading: Metadata & Categories', label: 'Trading: GeteBayDetails', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/GetCategories.html */
  { group: 'Trading: Metadata & Categories', label: 'Trading: GetCategories', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/GetCategoryFeatures.html */
  { group: 'Trading: Metadata & Categories', label: 'Trading: GetCategoryFeatures', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/GetDescriptionTemplates.html */
  { group: 'Trading: Metadata & Categories', label: 'Trading: GetDescriptionTemplates', method: 'POST', path: '/ebay/dev/trading-call', params: {} },

  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/GetStore.html */
  { group: 'Trading: Store', label: 'Trading: GetStore', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/GetStoreCategoryUpdateStatus.html */
  { group: 'Trading: Store', label: 'Trading: GetStoreCategoryUpdateStatus', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/SetStoreCategories.html — mutates store categories; test carefully */
  { group: 'Trading: Store', label: 'Trading: SetStoreCategories', method: 'POST', path: '/ebay/dev/trading-call', params: {} },

  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/GetUser.html */
  { group: 'Trading: User & Account', label: 'Trading: GetUser', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/GetAccount.html */
  { group: 'Trading: User & Account', label: 'Trading: GetAccount', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/GetMyeBaySelling.html */
  { group: 'Trading: User & Account', label: 'Trading: GetMyeBaySelling', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/GetMyeBayBuying.html */
  { group: 'Trading: User & Account', label: 'Trading: GetMyeBayBuying', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/GetUserPreferences.html */
  { group: 'Trading: User & Account', label: 'Trading: GetUserPreferences', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/SetUserPreferences.html */
  { group: 'Trading: User & Account', label: 'Trading: SetUserPreferences', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/GetUserContactDetails.html */
  { group: 'Trading: User & Account', label: 'Trading: GetUserContactDetails', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/SetUserNotes.html */
  { group: 'Trading: User & Account', label: 'Trading: SetUserNotes', method: 'POST', path: '/ebay/dev/trading-call', params: {} },

  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/GetShippingDiscountProfiles.html */
  { group: 'Trading: Shipping & Tax', label: 'Trading: GetShippingDiscountProfiles', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/SetShippingDiscountProfiles.html */
  { group: 'Trading: Shipping & Tax', label: 'Trading: SetShippingDiscountProfiles', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/GetTaxTable.html */
  { group: 'Trading: Shipping & Tax', label: 'Trading: GetTaxTable', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/SetTaxTable.html */
  { group: 'Trading: Shipping & Tax', label: 'Trading: SetTaxTable', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/GetItemShipping.html */
  { group: 'Trading: Shipping & Tax', label: 'Trading: GetItemShipping', method: 'POST', path: '/ebay/dev/trading-call', params: {} },

  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/GetNotificationPreferences.html */
  { group: 'Trading: Notifications', label: 'Trading: GetNotificationPreferences', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/SetNotificationPreferences.html */
  { group: 'Trading: Notifications', label: 'Trading: SetNotificationPreferences', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/GetNotificationsUsage.html */
  { group: 'Trading: Notifications', label: 'Trading: GetNotificationsUsage', method: 'POST', path: '/ebay/dev/trading-call', params: {} },

  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/AddToWatchList.html */
  { group: 'Trading: WatchList', label: 'Trading: AddToWatchList', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/RemoveFromWatchList.html */
  { group: 'Trading: WatchList', label: 'Trading: RemoveFromWatchList', method: 'POST', path: '/ebay/dev/trading-call', params: {} },

  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/GetAllBidders.html */
  { group: 'Trading: Bidding', label: 'Trading: GetAllBidders', method: 'POST', path: '/ebay/dev/trading-call', params: {} },

  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/ConfirmIdentity.html */
  { group: 'Trading: Auth', label: 'Trading: ConfirmIdentity', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/FetchToken.html */
  { group: 'Trading: Auth', label: 'Trading: FetchToken', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/GetSessionID.html */
  { group: 'Trading: Auth', label: 'Trading: GetSessionID', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/GetTokenStatus.html */
  { group: 'Trading: Auth', label: 'Trading: GetTokenStatus', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
  /** @see https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/RevokeToken.html */
  { group: 'Trading: Auth', label: 'Trading: RevokeToken', method: 'POST', path: '/ebay/dev/trading-call', params: {} },
];

function safeJsonParse(text, fallback = {}) {
  try {
    return text?.trim() ? JSON.parse(text) : fallback;
  } catch {
    return null;
  }
}

export default function EbayApiTesterPage() {
  const initialPreset = PRESETS[0];
  const [method, setMethod] = useState(initialPreset.method);
  const [path, setPath] = useState(initialPreset.path);
  const [paramsText, setParamsText] = useState(JSON.stringify(initialPreset.params || {}, null, 2));
  const [bodyText, setBodyText] = useState('{}');
  const [selectedPresetLabel, setSelectedPresetLabel] = useState(initialPreset.label);
  const [rawEbayMode, setRawEbayMode] = useState(false);
  const [sellerId, setSellerId] = useState('69f452ccccbff2f8810fcbdc');
  const [marketplaceId, setMarketplaceId] = useState('');
  const [tradingCallName, setTradingCallName] = useState('GetBestOffers');
  const [tradingSiteId, setTradingSiteId] = useState('0');
  const [tradingCompatibilityLevel, setTradingCompatibilityLevel] = useState('1423');
  const [tradingXml, setTradingXml] = useState(`<?xml version="1.0" encoding="utf-8"?>
<GetBestOffersRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <Pagination>
    <EntriesPerPage>20</EntriesPerPage>
    <PageNumber>1</PageNumber>
  </Pagination>
</GetBestOffersRequest>`);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState(null);
  const [responseText, setResponseText] = useState('');

  const prettyResponse = useMemo(() => responseText || 'Run a request to see response.', [responseText]);
  const pathText = String(path || '').trim();
  const isLikelyExternalEbayPath =
    /^\/(sell|commerce|buy|post-order|developer|identity)\//i.test(pathText) ||
    /^https?:\/\/(?:[^/]+\.)?ebay\.com\//i.test(pathText);

  const applyPreset = (presetLabel) => {
    const preset = PRESETS.find((p) => p.label === presetLabel);
    if (!preset) return;
    setSelectedPresetLabel(preset.label);
    setMethod(preset.method);
    setPath(preset.path);
    setParamsText(JSON.stringify(preset.params || {}, null, 2));
    if (preset.label === 'Negotiation: Send Offer to Interested Buyers') {
      setBodyText(JSON.stringify({
        requests: [
          {
            listingId: '<listingId>',
            discountPercentage: '10.0',
            message: 'Here is a special offer for you.',
            allowCounterOffer: true
          }
        ]
      }, null, 2));
    } else if (preset.label === 'Analytics: Traffic Report') {
      setBodyText('{}');
    } else if (preset.label === 'Trading: GetBestOffers') {
      setTradingCallName('GetBestOffers');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<GetBestOffersRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <Pagination>
    <EntriesPerPage>20</EntriesPerPage>
    <PageNumber>1</PageNumber>
  </Pagination>
</GetBestOffersRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: GetOrders') {
      setTradingCallName('GetOrders');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<GetOrdersRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <DetailLevel>ReturnAll</DetailLevel>
  <OrderRole>Seller</OrderRole>
  <OrderStatus>Completed</OrderStatus>
  <CreateTimeFrom>2026-04-01T00:00:00.000Z</CreateTimeFrom>
  <CreateTimeTo>2026-04-30T23:59:59.999Z</CreateTimeTo>
  <Pagination>
    <EntriesPerPage>25</EntriesPerPage>
    <PageNumber>1</PageNumber>
  </Pagination>
</GetOrdersRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: GetItemTransactions') {
      setTradingCallName('GetItemTransactions');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<GetItemTransactionsRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <DetailLevel>ReturnAll</DetailLevel>
  <ItemID>REPLACE_WITH_ITEM_ID</ItemID>
  <Pagination>
    <EntriesPerPage>25</EntriesPerPage>
    <PageNumber>1</PageNumber>
  </Pagination>
</GetItemTransactionsRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: GetSellerTransactions') {
      setTradingCallName('GetSellerTransactions');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<GetSellerTransactionsRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <DetailLevel>ReturnAll</DetailLevel>
  <IncludeContainingOrder>true</IncludeContainingOrder>
  <ModTimeFrom>2026-04-01T00:00:00.000Z</ModTimeFrom>
  <ModTimeTo>2026-04-30T23:59:59.999Z</ModTimeTo>
  <Pagination>
    <EntriesPerPage>25</EntriesPerPage>
    <PageNumber>1</PageNumber>
  </Pagination>
</GetSellerTransactionsRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: CompleteSale') {
      setTradingCallName('CompleteSale');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<CompleteSaleRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <OrderID>REPLACE_WITH_ORDER_ID</OrderID>
  <Paid>true</Paid>
  <Shipped>true</Shipped>
</CompleteSaleRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: AddOrder') {
      setTradingCallName('AddOrder');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<AddOrderRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <Order>
    <CreatingUserRole>Seller</CreatingUserRole>
    <PaymentMethods>PayPal</PaymentMethods>
    <Total currencyID="USD">1.00</Total>
    <TransactionArray>
      <Transaction>
        <Item>
          <ItemID>REPLACE_ITEM_ID_A</ItemID>
        </Item>
        <TransactionID>REPLACE_TRANSACTION_ID_A</TransactionID>
      </Transaction>
      <Transaction>
        <Item>
          <ItemID>REPLACE_ITEM_ID_B</ItemID>
        </Item>
        <TransactionID>REPLACE_TRANSACTION_ID_B</TransactionID>
      </Transaction>
    </TransactionArray>
  </Order>
</AddOrderRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: SendInvoice') {
      setTradingCallName('SendInvoice');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<SendInvoiceRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <ItemID>REPLACE_ITEM_ID</ItemID>
  <TransactionID>REPLACE_TRANSACTION_ID</TransactionID>
</SendInvoiceRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: AddMemberMessageAAQToPartner') {
      setTradingCallName('AddMemberMessageAAQToPartner');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<AddMemberMessageAAQToPartnerRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ItemID>REPLACE_ITEM_ID</ItemID>
  <MemberMessage>
    <Subject>Regarding your purchase</Subject>
    <Body>Test message — replace with your text (avoid XML special chars or escape them).</Body>
    <QuestionType>General</QuestionType>
    <RecipientID>REPLACE_BUYER_USERNAME</RecipientID>
  </MemberMessage>
</AddMemberMessageAAQToPartnerRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: AddMemberMessageRTQ') {
      setTradingCallName('AddMemberMessageRTQ');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<AddMemberMessageRTQRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ItemID>REPLACE_ITEM_ID</ItemID>
  <MemberMessage>
    <Body>Reply text — replace (escape &lt; &gt; &amp; if needed).</Body>
    <ParentMessageID>REPLACE_PARENT_MESSAGE_ID</ParentMessageID>
    <RecipientID>REPLACE_BUYER_USERNAME</RecipientID>
  </MemberMessage>
</AddMemberMessageRTQRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: AddMemberMessagesAAQToBidder') {
      setTradingCallName('AddMemberMessagesAAQToBidder');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<AddMemberMessagesAAQToBidderRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ItemID>REPLACE_ITEM_ID</ItemID>
  <MemberMessage>
    <Subject>Important update for your watched item</Subject>
    <Body>Message text — replace (escape XML special chars when needed).</Body>
    <QuestionType>General</QuestionType>
    <RecipientID>REPLACE_BIDDER_USERNAME</RecipientID>
  </MemberMessage>
</AddMemberMessagesAAQToBidderRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: GetMyMessages') {
      setTradingCallName('GetMyMessages');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<GetMyMessagesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <DetailLevel>ReturnMessages</DetailLevel>
  <StartTime>2026-04-01T00:00:00.000Z</StartTime>
  <EndTime>2026-04-30T23:59:59.999Z</EndTime>
  <Pagination>
    <EntriesPerPage>25</EntriesPerPage>
    <PageNumber>1</PageNumber>
  </Pagination>
</GetMyMessagesRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: GetMemberMessages') {
      setTradingCallName('GetMemberMessages');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<GetMemberMessagesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <DetailLevel>ReturnMessages</DetailLevel>
  <MailMessageType>All</MailMessageType>
  <StartCreationTime>2026-04-01T00:00:00.000Z</StartCreationTime>
  <EndCreationTime>2026-04-30T23:59:59.999Z</EndCreationTime>
</GetMemberMessagesRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: GetMessagePreferences') {
      setTradingCallName('GetMessagePreferences');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<GetMessagePreferencesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <DetailLevel>ReturnAll</DetailLevel>
</GetMessagePreferencesRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: GetUserContactDetails') {
      setTradingCallName('GetUserContactDetails');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<GetUserContactDetailsRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <ItemID>REPLACE_ITEM_ID</ItemID>
  <ContactID>REPLACE_CONTACT_USER_ID</ContactID>
</GetUserContactDetailsRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: SetMessagePreferences') {
      setTradingCallName('SetMessagePreferences');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<SetMessagePreferencesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <ASQEnabled>true</ASQEnabled>
  <EmailCopyToSender>true</EmailCopyToSender>
  <HideSendersEmailAddress>false</HideSendersEmailAddress>
</SetMessagePreferencesRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: ReviseMyMessages') {
      setTradingCallName('ReviseMyMessages');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<ReviseMyMessagesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <OperationType>MarkAsRead</OperationType>
  <MessageIDs>
    <MessageID>REPLACE_MESSAGE_ID</MessageID>
  </MessageIDs>
</ReviseMyMessagesRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: ReviseMyMessagesFolders') {
      setTradingCallName('ReviseMyMessagesFolders');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<ReviseMyMessagesFoldersRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <OperationType>Rename</OperationType>
  <FolderID>REPLACE_FOLDER_ID</FolderID>
  <CustomFolderName>Updated Folder Name</CustomFolderName>
</ReviseMyMessagesFoldersRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: DeleteMyMessages') {
      setTradingCallName('DeleteMyMessages');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<DeleteMyMessagesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <MessageIDs>
    <MessageID>REPLACE_MESSAGE_ID</MessageID>
  </MessageIDs>
</DeleteMyMessagesRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: GetFeedback') {
      setTradingCallName('GetFeedback');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<GetFeedbackRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <DetailLevel>ReturnAll</DetailLevel>
  <UserID>REPLACE_USER_ID</UserID>
  <FeedbackType>FeedbackReceivedAsSeller</FeedbackType>
  <Pagination>
    <EntriesPerPage>25</EntriesPerPage>
    <PageNumber>1</PageNumber>
  </Pagination>
</GetFeedbackRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: GetItemsAwaitingFeedback') {
      setTradingCallName('GetItemsAwaitingFeedback');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<GetItemsAwaitingFeedbackRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <Pagination>
    <EntriesPerPage>25</EntriesPerPage>
    <PageNumber>1</PageNumber>
  </Pagination>
</GetItemsAwaitingFeedbackRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: LeaveFeedback') {
      setTradingCallName('LeaveFeedback');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<LeaveFeedbackRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <CommentType>Positive</CommentType>
  <CommentText>Great buyer, quick payment. Thank you!</CommentText>
  <ItemID>REPLACE_ITEM_ID</ItemID>
  <TransactionID>REPLACE_TRANSACTION_ID</TransactionID>
  <TargetUser>REPLACE_TARGET_USER</TargetUser>
</LeaveFeedbackRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: RespondToFeedback') {
      setTradingCallName('RespondToFeedback');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<RespondToFeedbackRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <FeedbackID>REPLACE_FEEDBACK_ID</FeedbackID>
  <ResponseType>Reply</ResponseType>
  <ResponseText>Thank you for your feedback.</ResponseText>
</RespondToFeedbackRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: GeteBayDetails') {
      setTradingCallName('GeteBayDetails');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<GeteBayDetailsRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <DetailName>CountryDetails</DetailName>
  <DetailName>CurrencyDetails</DetailName>
  <DetailName>ShippingLocationDetails</DetailName>
</GeteBayDetailsRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: GetCategories') {
      setTradingCallName('GetCategories');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<GetCategoriesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <CategorySiteID>0</CategorySiteID>
  <DetailLevel>ReturnAll</DetailLevel>
  <LevelLimit>2</LevelLimit>
  <ViewAllNodes>false</ViewAllNodes>
</GetCategoriesRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: GetCategoryFeatures') {
      setTradingCallName('GetCategoryFeatures');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<GetCategoryFeaturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <CategorySiteID>0</CategorySiteID>
  <DetailLevel>ReturnAll</DetailLevel>
  <FeatureID>ConditionEnabled</FeatureID>
  <FeatureID>ListingDurations</FeatureID>
</GetCategoryFeaturesRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: GetAllBidders') {
      setTradingCallName('GetAllBidders');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<GetAllBiddersRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <ItemID>REPLACE_ITEM_ID</ItemID>
  <IncludeBiddingSummary>true</IncludeBiddingSummary>
  <CallMode>ViewAll</CallMode>
</GetAllBiddersRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: GetItemShipping') {
      setTradingCallName('GetItemShipping');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<GetItemShippingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <ItemID>REPLACE_ITEM_ID</ItemID>
  <QuantitySold>1</QuantitySold>
  <DestinationPostalCode>10001</DestinationPostalCode>
  <DestinationCountryCode>US</DestinationCountryCode>
</GetItemShippingRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: GetDescriptionTemplates') {
      setTradingCallName('GetDescriptionTemplates');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<GetDescriptionTemplatesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <CategoryID>0</CategoryID>
  <LastModifiedTime>2026-01-01T00:00:00.000Z</LastModifiedTime>
</GetDescriptionTemplatesRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: GetStore') {
      setTradingCallName('GetStore');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<GetStoreRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <CategoryStructureOnly>false</CategoryStructureOnly>
  <UserID>REPLACE_STORE_OWNER_USER_ID</UserID>
</GetStoreRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: GetStoreCategoryUpdateStatus') {
      setTradingCallName('GetStoreCategoryUpdateStatus');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<GetStoreCategoryUpdateStatusRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
</GetStoreCategoryUpdateStatusRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: SetStoreCategories') {
      setTradingCallName('SetStoreCategories');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<SetStoreCategoriesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <Action>ReplaceAll</Action>
  <StoreCategories>
    <CustomCategory>
      <Name>Example Category</Name>
      <Order>1</Order>
    </CustomCategory>
  </StoreCategories>
</SetStoreCategoriesRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: GetUser') {
      setTradingCallName('GetUser');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<GetUserRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <DetailLevel>ReturnAll</DetailLevel>
  <UserID>REPLACE_USER_ID</UserID>
</GetUserRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: GetAccount') {
      setTradingCallName('GetAccount');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<GetAccountRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <AccountHistorySelection>LastInvoice</AccountHistorySelection>
</GetAccountRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: GetMyeBaySelling') {
      setTradingCallName('GetMyeBaySelling');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <ActiveList>
    <Include>true</Include>
    <Pagination>
      <EntriesPerPage>25</EntriesPerPage>
      <PageNumber>1</PageNumber>
    </Pagination>
  </ActiveList>
</GetMyeBaySellingRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: GetMyeBayBuying') {
      setTradingCallName('GetMyeBayBuying');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<GetMyeBayBuyingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <WatchList>
    <Include>true</Include>
    <Pagination>
      <EntriesPerPage>25</EntriesPerPage>
      <PageNumber>1</PageNumber>
    </Pagination>
  </WatchList>
</GetMyeBayBuyingRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: GetUserPreferences') {
      setTradingCallName('GetUserPreferences');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<GetUserPreferencesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <ShowSellerProfilePreferences>true</ShowSellerProfilePreferences>
  <ShowGlobalShippingProgramPreference>true</ShowGlobalShippingProgramPreference>
</GetUserPreferencesRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: SetUserPreferences') {
      setTradingCallName('SetUserPreferences');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<SetUserPreferencesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <SellerProfileOptedIn>true</SellerProfileOptedIn>
</SetUserPreferencesRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: GetShippingDiscountProfiles') {
      setTradingCallName('GetShippingDiscountProfiles');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<GetShippingDiscountProfilesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
</GetShippingDiscountProfilesRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: SetShippingDiscountProfiles') {
      setTradingCallName('SetShippingDiscountProfiles');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<SetShippingDiscountProfilesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <CombinedDurationInterval>InDays</CombinedDurationInterval>
</SetShippingDiscountProfilesRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: GetTaxTable') {
      setTradingCallName('GetTaxTable');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<GetTaxTableRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <DetailLevel>ReturnAll</DetailLevel>
</GetTaxTableRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: SetTaxTable') {
      setTradingCallName('SetTaxTable');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<SetTaxTableRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <TaxTable>
    <TaxJurisdiction>
      <JurisdictionID>US</JurisdictionID>
      <SalesTaxPercent>0.0</SalesTaxPercent>
      <ShippingIncludedInTax>false</ShippingIncludedInTax>
    </TaxJurisdiction>
  </TaxTable>
</SetTaxTableRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: GetNotificationPreferences') {
      setTradingCallName('GetNotificationPreferences');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<GetNotificationPreferencesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <PreferenceLevel>User</PreferenceLevel>
</GetNotificationPreferencesRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: SetNotificationPreferences') {
      setTradingCallName('SetNotificationPreferences');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<SetNotificationPreferencesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <DeliveryURLName>REPLACE_DELIVERY_URL_NAME</DeliveryURLName>
  <UserDeliveryPreferenceArray>
    <NotificationEnable>
      <EventType>ItemSold</EventType>
      <EventEnable>Enable</EventEnable>
    </NotificationEnable>
  </UserDeliveryPreferenceArray>
</SetNotificationPreferencesRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: GetNotificationsUsage') {
      setTradingCallName('GetNotificationsUsage');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<GetNotificationsUsageRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
</GetNotificationsUsageRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: AddToWatchList') {
      setTradingCallName('AddToWatchList');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<AddToWatchListRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <ItemID>REPLACE_ITEM_ID</ItemID>
</AddToWatchListRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: RemoveFromWatchList') {
      setTradingCallName('RemoveFromWatchList');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<RemoveFromWatchListRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <ItemID>REPLACE_ITEM_ID</ItemID>
</RemoveFromWatchListRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: SetUserNotes') {
      setTradingCallName('SetUserNotes');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<SetUserNotesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <Action>AddOrUpdateAction</Action>
  <ItemID>REPLACE_ITEM_ID</ItemID>
  <NoteText>My note for this item.</NoteText>
</SetUserNotesRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: ConfirmIdentity') {
      setTradingCallName('ConfirmIdentity');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<ConfirmIdentityRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <SessionID>REPLACE_SESSION_ID</SessionID>
</ConfirmIdentityRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: FetchToken') {
      setTradingCallName('FetchToken');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<FetchTokenRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <SessionID>REPLACE_SESSION_ID</SessionID>
</FetchTokenRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: GetSessionID') {
      setTradingCallName('GetSessionID');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<GetSessionIDRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <RuName>REPLACE_RUNAME</RuName>
</GetSessionIDRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: GetTokenStatus') {
      setTradingCallName('GetTokenStatus');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<GetTokenStatusRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
</GetTokenStatusRequest>`);
      setBodyText('{}');
    } else if (preset.label === 'Trading: RevokeToken') {
      setTradingCallName('RevokeToken');
      setTradingXml(`<?xml version="1.0" encoding="utf-8"?>
<RevokeTokenRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
</RevokeTokenRequest>`);
      setBodyText('{}');
    } else {
      setBodyText('{}');
    }
    setError('');
    setStatus(null);
  };

  const runRequest = async () => {
    const parsedParams = safeJsonParse(paramsText, {});
    const parsedBody = safeJsonParse(bodyText, {});

    if (parsedParams === null) {
      setError('Invalid Params JSON');
      return;
    }
    if (['POST', 'PATCH', 'PUT'].includes(method) && parsedBody === null) {
      setError('Invalid Body JSON');
      return;
    }

    setLoading(true);
    setError('');
    setStatus(null);

    try {
      let statusCode;
      let payload;
      const shouldUseRawProxy = rawEbayMode || isLikelyExternalEbayPath;

      if (path === '/ebay/dev/trading-call') {
        const proxyRes = await api.post('/ebay/dev/trading-call', {
          sellerId,
          callName: tradingCallName,
          requestXml: tradingXml,
          siteId: tradingSiteId,
          compatibilityLevel: tradingCompatibilityLevel
        });
        statusCode = proxyRes.data?.statusCode ?? proxyRes.status;
        payload = proxyRes.data;
      } else if (shouldUseRawProxy) {
        const proxyRes = await api.post('/ebay/dev/raw-call', {
          sellerId,
          method,
          endpoint: pathText,
          params: parsedParams,
          body: parsedBody || {},
          marketplace: marketplaceId || undefined
        });
        statusCode = proxyRes.data?.statusCode ?? proxyRes.status;
        payload = proxyRes.data;
      } else {
        let res;
        if (method === 'GET' || method === 'DELETE') {
          res = await api.request({ method, url: path, params: parsedParams });
        } else {
          res = await api.request({ method, url: path, params: parsedParams, data: parsedBody || {} });
        }
        statusCode = res.status;
        payload = res.data;
      }
      setStatus(statusCode);
      setResponseText(JSON.stringify(payload, null, 2));
    } catch (e) {
      setStatus(e?.response?.status || 500);
      setResponseText(JSON.stringify(e?.response?.data || { error: e.message }, null, 2));
      setError(e?.response?.data?.error || e.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 1 }}>eBay API Tester</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Run internal API calls and inspect raw response for debugging (orders, seller funds, categories, ranges, etc.).
      </Typography>
      <Alert severity="info" sx={{ mb: 2 }}>
        For paths with placeholders (for example <code>&lt;sellerId&gt;</code>), replace placeholders in Path before clicking Run.
      </Alert>
      <FormControlLabel
        sx={{ mb: 1 }}
        control={<Switch checked={rawEbayMode} onChange={(e) => setRawEbayMode(e.target.checked)} />}
        label="Use Raw eBay API mode (calls eBay directly via seller token)"
      />

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack spacing={2}>
          <TextField
            select
            label="Preset"
            value={selectedPresetLabel}
            onChange={(e) => applyPreset(e.target.value)}
            size="small"
          >
            {(() => {
              let lastGroup = '';
              const rows = [];
              for (const preset of PRESETS) {
                if (preset.group !== lastGroup) {
                  rows.push(
                    <MenuItem key={`group-${preset.group}`} disabled sx={{ fontWeight: 700, opacity: 1 }}>
                      {preset.group}
                    </MenuItem>
                  );
                  lastGroup = preset.group;
                }
                rows.push(
                  <MenuItem key={preset.label} value={preset.label}>
                    {preset.label}
                  </MenuItem>
                );
              }
              return rows;
            })()}
          </TextField>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            {(rawEbayMode || path === '/ebay/dev/trading-call' || isLikelyExternalEbayPath) && (
              <>
                <TextField
                  label="Seller ID (required)"
                  value={sellerId}
                  onChange={(e) => setSellerId(e.target.value)}
                  size="small"
                  sx={{ minWidth: 260 }}
                />
                <TextField
                  label="Marketplace ID (optional)"
                  value={marketplaceId}
                  onChange={(e) => setMarketplaceId(e.target.value)}
                  size="small"
                  placeholder="EBAY_US"
                  sx={{ minWidth: 200 }}
                />
              </>
            )}
            <TextField
              select
              label="Method"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              size="small"
              sx={{ width: 160 }}
            >
              {['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].map((m) => (
                <MenuItem key={m} value={m}>{m}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="Path"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              size="small"
              fullWidth
              placeholder="/ebay/stored-orders"
            />
          </Stack>

          {path === '/ebay/dev/trading-call' && (
            <>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <TextField
                  label="Trading Call Name"
                  value={tradingCallName}
                  onChange={(e) => setTradingCallName(e.target.value)}
                  size="small"
                  sx={{ minWidth: 220 }}
                />
                <TextField
                  label="Site ID"
                  value={tradingSiteId}
                  onChange={(e) => setTradingSiteId(e.target.value)}
                  size="small"
                  sx={{ width: 120 }}
                />
                <TextField
                  label="Compatibility Level"
                  value={tradingCompatibilityLevel}
                  onChange={(e) => setTradingCompatibilityLevel(e.target.value)}
                  size="small"
                  sx={{ width: 180 }}
                />
              </Stack>
              <TextField
                label="Trading XML Request"
                value={tradingXml}
                onChange={(e) => setTradingXml(e.target.value)}
                multiline
                minRows={8}
                fullWidth
                sx={{ '& textarea': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' } }}
              />
            </>
          )}

          <TextField
            label="Params (JSON)"
            value={paramsText}
            onChange={(e) => setParamsText(e.target.value)}
            multiline
            minRows={5}
            fullWidth
            sx={{ '& textarea': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' } }}
          />

          {['POST', 'PATCH', 'PUT'].includes(method) && (
            <TextField
              label="Body (JSON)"
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              multiline
              minRows={5}
              fullWidth
              sx={{ '& textarea': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' } }}
            />
          )}

          <Stack direction="row" spacing={1} alignItems="center">
            <Button variant="contained" onClick={runRequest} disabled={loading}>
              {loading ? 'Running...' : 'Run'}
            </Button>
            {status != null && (
              <Typography variant="body2" color={status >= 200 && status < 300 ? 'success.main' : 'error.main'}>
                Status: {status}
              </Typography>
            )}
          </Stack>
        </Stack>
      </Paper>

      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>Response</Typography>
        <Box
          component="pre"
          sx={{
            m: 0,
            p: 2,
            borderRadius: 1,
            bgcolor: '#0b1020',
            color: '#d6e2ff',
            overflow: 'auto',
            maxHeight: '60vh',
            fontSize: 12,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {prettyResponse}
        </Box>
      </Paper>
    </Box>
  );
}
