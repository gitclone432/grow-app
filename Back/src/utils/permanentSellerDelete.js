import Order from '../models/Order.js';
import Listing from '../models/Listing.js';
import ActiveListing from '../models/ActiveListing.js';
import Message from '../models/Message.js';
import Return from '../models/Return.js';
import PaymentDispute from '../models/PaymentDispute.js';
import Case from '../models/Case.js';
import CashflowEntry from '../models/CashflowEntry.js';
import TemplateListing from '../models/TemplateListing.js';
import UserSellerAssignment from '../models/UserSellerAssignment.js';
import SellerPricingConfig from '../models/SellerPricingConfig.js';
import EbayStoreListerSettings from '../models/EbayStoreListerSettings.js';
import TemplateOverride from '../models/TemplateOverride.js';
import AmazonProduct from '../models/AmazonProduct.js';
import FeedUpload from '../models/FeedUpload.js';
import CsvStorage from '../models/CsvStorage.js';
import DirectListJob from '../models/DirectListJob.js';
import UserDailyQuantity from '../models/UserDailyQuantity.js';
import SellerStandardsProfileSnapshot from '../models/SellerStandardsProfileSnapshot.js';
import CustomerServiceMetricSnapshot from '../models/CustomerServiceMetricSnapshot.js';
import CompatibilityBatchLog from '../models/CompatibilityBatchLog.js';
import AutoCompatibilityBatch from '../models/AutoCompatibilityBatch.js';
import MarketMetric from '../models/MarketMetric.js';
import PriceChangeLog from '../models/PriceChangeLog.js';
import ConversationMeta from '../models/ConversationMeta.js';
import PayoneerRecord from '../models/PayoneerRecord.js';
import EmployeeProfile from '../models/EmployeeProfile.js';
import Seller from '../models/Seller.js';
import User from '../models/User.js';

const BLOCKING_CHECKS = [
  { label: 'orders', model: Order, field: 'seller' },
  { label: 'listings', model: Listing, field: 'seller' },
  { label: 'active listings', model: ActiveListing, field: 'seller' },
  { label: 'messages', model: Message, field: 'seller' },
  { label: 'returns', model: Return, field: 'seller' },
  { label: 'payment disputes', model: PaymentDispute, field: 'seller' },
  { label: 'cases', model: Case, field: 'seller' },
  { label: 'cashflow entries', model: CashflowEntry, field: 'seller' },
  { label: 'template listings', model: TemplateListing, field: 'sellerId' },
];

export async function getSellerPermanentDeleteBlockers(sellerId) {
  const blockers = [];
  for (const check of BLOCKING_CHECKS) {
    const count = await check.model.countDocuments({ [check.field]: sellerId });
    if (count > 0) blockers.push({ type: check.label, count });
  }
  return blockers;
}

export function isSellerArchived(seller, user) {
  const storeInactive = seller.isStoreActive === false;
  const userInactive = user?.active === false;
  return storeInactive || userInactive;
}

async function deleteSellerScopedData(sellerId) {
  await Promise.all([
    UserSellerAssignment.deleteMany({ seller: sellerId }),
    SellerPricingConfig.deleteMany({ sellerId }),
    EbayStoreListerSettings.deleteMany({ sellerId }),
    TemplateOverride.deleteMany({ sellerId }),
    AmazonProduct.deleteMany({ sellerId }),
    FeedUpload.deleteMany({ seller: sellerId }),
    CsvStorage.deleteMany({ seller: sellerId }),
    DirectListJob.deleteMany({ sellerId }),
    UserDailyQuantity.deleteMany({ seller: sellerId }),
    SellerStandardsProfileSnapshot.deleteMany({ seller: sellerId }),
    CustomerServiceMetricSnapshot.deleteMany({ seller: sellerId }),
    CompatibilityBatchLog.deleteMany({ seller: sellerId }),
    AutoCompatibilityBatch.deleteMany({ seller: sellerId }),
    MarketMetric.deleteMany({ seller: sellerId }),
    PriceChangeLog.deleteMany({ seller: sellerId }),
    ConversationMeta.deleteMany({ seller: sellerId }),
    PayoneerRecord.deleteMany({ store: sellerId }),
  ]);
}

export async function permanentlyDeleteSeller(sellerId) {
  const seller = await Seller.findById(sellerId).populate('user');
  if (!seller) {
    const err = new Error('Seller not found');
    err.status = 404;
    throw err;
  }

  if (!isSellerArchived(seller, seller.user)) {
    const err = new Error('Archive the seller before permanent deletion');
    err.status = 400;
    throw err;
  }

  const blockers = await getSellerPermanentDeleteBlockers(sellerId);
  if (blockers.length > 0) {
    const err = new Error('Cannot permanently delete: seller has historical records');
    err.status = 409;
    err.blockers = blockers;
    throw err;
  }

  const userId = seller.user?._id;
  await deleteSellerScopedData(sellerId);
  await Seller.findByIdAndDelete(sellerId);

  if (userId) {
    await EmployeeProfile.deleteMany({ user: userId });
    await User.findByIdAndDelete(userId);
  }

  return {
    sellerId,
    userId,
    username: seller.user?.username || null,
  };
}
