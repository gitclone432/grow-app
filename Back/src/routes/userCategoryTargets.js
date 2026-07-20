import express from 'express';
import mongoose from 'mongoose';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import UserCategoryTarget from '../models/UserCategoryTarget.js';
import User from '../models/User.js';
import Seller from '../models/Seller.js';
import AsinListCategory from '../models/AsinListCategory.js';
import AsinListRange from '../models/AsinListRange.js';
import FeedUpload from '../models/FeedUpload.js';
import TemplateListing from '../models/TemplateListing.js';
import AiListingRun from '../models/AiListingRun.js';
import { validate } from '../utils/validate.js';
import {
  userCategoryTargetsPerformanceQuerySchema,
  createUserCategoryTargetSchema,
  idParamsSchema
} from '../schemas/index.js';

const router = express.Router();
const PT_TIMEZONE = 'America/Los_Angeles';
const IST_TIMEZONE = 'Asia/Kolkata';

const pageAccess = requirePageAccess('UserCategoryTargets');
const performancePageAccess = requirePageAccess(['UserCategoryTargets', 'UserListingPerformance']);

function getPTDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: PT_TIMEZONE }).format(date);
}

function getPTDayBoundsUTC(dateStr) {
  function findMidnightUTC(ds) {
    const pdt = new Date(`${ds}T07:00:00.000Z`);
    const ptStr = new Intl.DateTimeFormat('en-CA', { timeZone: PT_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(pdt);
    const ptHour = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: PT_TIMEZONE, hour: 'numeric', hour12: false, hourCycle: 'h23' }).format(pdt), 10);
    if (ptStr === ds && ptHour === 0) return pdt;
    return new Date(`${ds}T08:00:00.000Z`);
  }

  const start = findMidnightUTC(dateStr);
  const tmp = new Date(`${dateStr}T12:00:00.000Z`);
  tmp.setUTCDate(tmp.getUTCDate() + 1);
  const nextDateStr = tmp.toISOString().split('T')[0];
  const end = new Date(findMidnightUTC(nextDateStr).getTime() - 1);
  return { start, end };
}

function countInclusiveDays(startDate, endDate) {
  const start = new Date(`${startDate}T12:00:00.000Z`);
  const end = new Date(`${endDate}T12:00:00.000Z`);
  return Math.max(1, Math.floor((end - start) / 86400000) + 1);
}

function getStatus(percent) {
  if (percent >= 95) return 'onTrack';
  if (percent >= 60) return 'behind';
  return 'critical';
}

function buildUploadMatch(target, start, end) {
  const sellerObjectId = target.seller?._id || target.seller;
  const rangeObjectId = target.range?._id || target.range;
  const match = {
    seller: sellerObjectId,
    country: target.marketplace,
    categoryId: target.category?._id || target.category,
    status: { $in: ['COMPLETED', 'COMPLETED_WITH_ERROR'] },
    creationDate: { $gte: start, $lte: end },
  };
  if (rangeObjectId) match.rangeId = rangeObjectId;
  return match;
}

function buildIstHourlyRows(hourMap = new Map()) {
  return Array.from({ length: 24 }, (_, hour) => {
    const row = hourMap.get(hour) || { uploadCount: 0, successfulListings: 0, failedListings: 0 };
    return {
      hour,
      label: new Intl.DateTimeFormat('en-US', {
        timeZone: IST_TIMEZONE,
        hour: 'numeric',
        hour12: true,
      }).format(new Date(Date.UTC(2026, 0, 1, hour - 5, 30))),
      uploadCount: row.uploadCount || 0,
      successfulListings: row.successfulListings || 0,
      failedListings: row.failedListings || 0,
    };
  });
}

router.get('/performance', requireAuth, performancePageAccess, validate(userCategoryTargetsPerformanceQuerySchema, 'query'), async (req, res) => {
  const {
    startDate = getPTDate(),
    endDate = startDate,
    userId,
    sellerId,
    marketplace,
    categoryId,
    rangeId,
  } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate are required' });
  }

  try {
    const targetQuery = {};
    if (userId) targetQuery.user = userId;
    if (sellerId) targetQuery.seller = sellerId;
    if (marketplace) targetQuery.marketplace = marketplace;
    if (categoryId) targetQuery.category = categoryId;
    if (rangeId) targetQuery.range = rangeId;

    const targets = await UserCategoryTarget.find(targetQuery)
      .populate('user', 'username email role department')
      .populate({
        path: 'seller',
        select: 'storeName ebayMarketplaces user',
        populate: { path: 'user', select: 'username email' },
      })
      .populate('category', 'name')
      .populate('range', 'name categoryId')
      .sort({ updatedAt: -1 });

    const { start } = getPTDayBoundsUTC(startDate);
    const { end } = getPTDayBoundsUTC(endDate);
    const days = countInclusiveDays(startDate, endDate);
    const targetUserIds = [...new Set(targets.map((target) => String(target.user?._id || target.user)).filter(Boolean))];
    const targetSellerIds = [...new Set(targets.map((target) => String(target.seller?._id || target.seller)).filter(Boolean))];
    const aiRunMatch = {
      lastSavedFromReviewAt: { $gte: start, $lte: end },
    };
    if (targetUserIds.length > 0) {
      aiRunMatch.userId = { $in: targetUserIds.map((id) => new mongoose.Types.ObjectId(id)) };
    }
    if (targetSellerIds.length > 0) {
      aiRunMatch.sellerId = { $in: targetSellerIds.map((id) => new mongoose.Types.ObjectId(id)) };
    }

    const aiSavedRows = targetUserIds.length > 0
      ? await AiListingRun.aggregate([
        { $match: aiRunMatch },
        {
          $lookup: {
            from: TemplateListing.collection.name,
            localField: 'aiRunId',
            foreignField: 'aiRunId',
            as: 'savedListings',
          },
        },
        {
          $project: {
            userId: 1,
            savedCount: {
              $max: [
                { $size: '$savedListings' },
                { $ifNull: ['$savedFromReviewCount', 0] },
              ],
            },
          },
        },
        {
          $group: {
            _id: '$userId',
            aiSavedCount: { $sum: '$savedCount' },
          },
        },
      ])
      : [];
    const aiSavedByUserId = new Map(aiSavedRows.map((row) => [String(row._id), row.aiSavedCount || 0]));

    const cards = await Promise.all(targets.map(async (target) => {
      const uploadMatch = buildUploadMatch(target, start, end);

      const uploadCounts = await FeedUpload.aggregate([
        {
          $match: uploadMatch,
        },
        {
          $group: {
            _id: null,
            totalSuccess: { $sum: { $ifNull: ['$uploadSummary.successCount', 0] } },
            totalFailed: { $sum: { $ifNull: ['$uploadSummary.failureCount', 0] } },
          },
        },
      ]);
      const successfulListings = uploadCounts[0]?.totalSuccess || 0;
      const failedListings = uploadCounts[0]?.totalFailed || 0;
      const uploadTimeDistribution = await FeedUpload.aggregate([
        {
          $match: uploadMatch,
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%H',
                date: '$creationDate',
                timezone: IST_TIMEZONE,
              },
            },
            uploadCount: { $sum: 1 },
            successfulListings: { $sum: { $ifNull: ['$uploadSummary.successCount', 0] } },
            failedListings: { $sum: { $ifNull: ['$uploadSummary.failureCount', 0] } },
          },
        },
      ]);
      const uploadTimeByHour = new Map(
        uploadTimeDistribution.map((item) => [
          Number(item._id),
          {
            uploadCount: item.uploadCount || 0,
            successfulListings: item.successfulListings || 0,
            failedListings: item.failedListings || 0,
          },
        ])
      );
      const submissionTimeDistribution = buildIstHourlyRows(uploadTimeByHour);

      const targetQuantity = (target.dailyDesiredQuantity || 0) * days;
      const completionPercent = targetQuantity > 0
        ? Math.round((successfulListings / targetQuantity) * 100)
        : (successfulListings > 0 ? 100 : 0);
      const status = getStatus(completionPercent);

      return {
        targetId: target._id,
        user: target.user,
        seller: target.seller,
        marketplace: target.marketplace,
        category: target.category,
        range: target.range,
        dailyDesiredQuantity: target.dailyDesiredQuantity || 0,
        targetQuantity,
        successfulListings,
        failedListings,
        aiSavedCount: aiSavedByUserId.get(String(target.user?._id || target.user)) || 0,
        missedListings: Math.max(targetQuantity - successfulListings, 0),
        completionPercent,
        status,
        countSource: 'feedUploads',
        submissionTimeDistribution,
      };
    }));

    const seenUploadMatches = new Set();
    const uploadMatchOr = targets.reduce((acc, target) => {
      const match = buildUploadMatch(target, start, end);
      const key = [
        String(match.seller),
        match.country,
        String(match.categoryId),
        match.rangeId ? String(match.rangeId) : 'all',
      ].join('|');
      if (seenUploadMatches.has(key)) return acc;
      seenUploadMatches.add(key);
      acc.push(match);
      return acc;
    }, []);

    const submissionTimeDistribution = uploadMatchOr.length > 0
      ? await FeedUpload.aggregate([
        { $match: { $or: uploadMatchOr } },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%H',
                date: '$creationDate',
                timezone: IST_TIMEZONE,
              },
            },
            uploadCount: { $sum: 1 },
            successfulListings: { $sum: { $ifNull: ['$uploadSummary.successCount', 0] } },
            failedListings: { $sum: { $ifNull: ['$uploadSummary.failureCount', 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ])
      : [];

    const submissionTimeByHour = new Map(
      submissionTimeDistribution.map((item) => [
        Number(item._id),
        {
          hour: Number(item._id),
          uploadCount: item.uploadCount || 0,
          successfulListings: item.successfulListings || 0,
          failedListings: item.failedListings || 0,
        },
      ])
    );

    const submissionTimeRows = buildIstHourlyRows(submissionTimeByHour);

    const summary = cards.reduce((acc, card) => {
      acc.totalTargets += 1;
      acc.totalTargetQuantity += card.targetQuantity;
      acc.totalSuccessfulListings += card.successfulListings;
      acc.totalFailedListings += card.failedListings;
      acc.totalMissedListings += card.missedListings;
      acc[card.status] += 1;
      return acc;
    }, {
      totalTargets: 0,
      totalTargetQuantity: 0,
      totalSuccessfulListings: 0,
      totalFailedListings: 0,
      totalMissedListings: 0,
      totalAiSavedCount: aiSavedRows.reduce((sum, row) => sum + Number(row.aiSavedCount || 0), 0),
      onTrack: 0,
      behind: 0,
      critical: 0,
    });

    summary.averageCompletionPercent = summary.totalTargetQuantity > 0
      ? Math.round((summary.totalSuccessfulListings / summary.totalTargetQuantity) * 100)
      : 0;

    res.json({
      filters: { startDate, endDate, days, userId: userId || null, sellerId: sellerId || null, marketplace: marketplace || null, categoryId: categoryId || null, rangeId: rangeId || null },
      summary,
      cards,
      submissionTimeDistribution: submissionTimeRows,
    });
  } catch (err) {
    console.error('[UserCategoryTargets] GET /performance error:', err);
    res.status(500).json({ error: 'Failed to fetch listing performance' });
  }
});

router.get('/', requireAuth, pageAccess, async (req, res) => {
  try {
    const targets = await UserCategoryTarget.find()
      .populate('user', 'username email role department')
      .populate({
        path: 'seller',
        select: 'storeName ebayMarketplaces user',
        populate: { path: 'user', select: 'username email' },
      })
      .populate('category', 'name')
      .populate('range', 'name categoryId')
      .sort({ updatedAt: -1 })
      .lean();

    res.json(targets);
  } catch (err) {
    console.error('[UserCategoryTargets] GET / error:', err);
    res.status(500).json({ error: 'Failed to fetch desired quantity targets' });
  }
});

router.post('/', requireAuth, pageAccess, validate(createUserCategoryTargetSchema), async (req, res) => {
  const { userId, sellerId, marketplace, categoryId, rangeId, dailyDesiredQuantity } = req.body || {};

  try {
    const [userExists, sellerExists, categoryExists, rangeDoc] = await Promise.all([
      User.exists({ _id: userId }),
      Seller.exists({ _id: sellerId }),
      AsinListCategory.exists({ _id: categoryId }),
      rangeId ? AsinListRange.findById(rangeId).select('categoryId').lean() : Promise.resolve(null),
    ]);

    if (!userExists) return res.status(404).json({ error: 'User not found' });
    if (!sellerExists) return res.status(404).json({ error: 'Seller not found' });
    if (!categoryExists) return res.status(404).json({ error: 'Category not found' });
    if (rangeId && !rangeDoc) return res.status(404).json({ error: 'Range not found' });
    if (rangeDoc && rangeDoc.categoryId?.toString() !== categoryId) {
      return res.status(400).json({ error: 'Range must belong to the selected category' });
    }

    const target = await UserCategoryTarget.findOneAndUpdate(
      { user: userId, seller: sellerId, marketplace, category: categoryId, range: rangeId || null },
      { user: userId, seller: sellerId, marketplace, category: categoryId, range: rangeId || null, dailyDesiredQuantity },
      { upsert: true, new: true, runValidators: true }
    )
      .populate('user', 'username email role department')
      .populate({
        path: 'seller',
        select: 'storeName ebayMarketplaces user',
        populate: { path: 'user', select: 'username email' },
      })
      .populate('category', 'name')
      .populate('range', 'name categoryId');

    res.json(target);
  } catch (err) {
    console.error('[UserCategoryTargets] POST / error:', err);
    res.status(500).json({ error: 'Failed to save desired quantity target' });
  }
});

router.delete('/:id', requireAuth, pageAccess, validate(idParamsSchema, 'params'), async (req, res) => {
  const { id } = req.params;

  try {
    const deleted = await UserCategoryTarget.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ error: 'Desired quantity target not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('[UserCategoryTargets] DELETE /:id error:', err);
    res.status(500).json({ error: 'Failed to delete desired quantity target' });
  }
});

export default router;
