import { PrismaClient } from "@prisma/client";
import {
  formatBytes,
  getUserStorageInfo,
  upgradeStorageQuota,
  createUserStorageQuota,
} from "./storageHelper.js";

const prisma = new PrismaClient();

// Helper: Serialize BigInt to String
const serialize = (data) =>
  JSON.parse(
    JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v))
  );

/**
 * GET /api/storage/quota
 * Get user's storage quota and usage
 */
export const getUserQuota = async (req, res) => {
  try {
    const { userId } = req.user;

    // Only subscribed users have storage quota
    const storageInfo = await getUserStorageInfo(userId);
    if (!storageInfo) {
      return res.status(403).json({
        success: false,
        message: "Storage quota is only available for subscribed users",
        upgrade_required: true,
      });
    }

    res.status(200).json({
      success: true,
      quota: storageInfo,
    });
  } catch (error) {
    console.error("Error fetching user quota:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch storage quota",
      error: error.message,
    });
  }
};

/**
 * POST /api/storage/quota/upgrade
 * Upgrade user's storage tier (usually called after subscription upgrade)
 */
export const upgradeQuota = async (req, res) => {
  try {
    const { userId } = req.user;
    const { plan } = req.body;

    const activeSub = await prisma.subscription.findFirst({
      where: { user_id: userId, status: "active" },
      select: { plan: true },
    });
    if (!activeSub) {
      return res.status(403).json({
        success: false,
        message: "Active subscription required to manage storage quota",
        upgrade_required: true,
      });
    }

    if (plan && plan !== activeSub.plan) {
      return res.status(400).json({
        success: false,
        message: "Requested plan does not match active subscription plan",
      });
    }

    const effectivePlan = plan || activeSub.plan;

    // Only subscribed users can manage quota
    if (!["most_popular", "basic", "family"].includes(effectivePlan)) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan. Must be 'most_popular', 'basic', or 'family'",
      });
    }

    const currentQuota = await prisma.userStorageQuota.findUnique({
      where: { user_id: userId },
    });

    if (!currentQuota) {
      // Create new quota
      const newQuota = await createUserStorageQuota(userId, effectivePlan);
      return res.status(201).json({
        success: true,
        message: "Storage quota created",
        quota: serialize(newQuota),
      });
    }

    // Prevent downgrade (optional, can be removed if not needed)
    const planLevels = { No_plan: 0, basic: 1, most_popular: 2, family: 3 };
    if (planLevels[effectivePlan] < planLevels[currentQuota.tier]) {
      return res.status(400).json({
        success: false,
        message: "Cannot downgrade storage plan",
      });
    }

    // Upgrade quota
    const upgradedQuota = await upgradeStorageQuota(userId, effectivePlan);

    res.status(200).json({
      success: true,
      message: `Storage upgraded to ${effectivePlan}`,
      quota: serialize(upgradedQuota),
    });
  } catch (error) {
    console.error("Error upgrading quota:", error);
    res.status(500).json({
      success: false,
      message: "Failed to upgrade storage quota",
      error: error.message,
    });
  }
};

/**
 * PATCH /api/storage/quota/settings
 * Update storage quota settings (auto-delete, notification threshold)
 */
export const updateQuotaSettings = async (req, res) => {
  try {
    const { userId } = req.user;

    // Only users with initialized quota can customize settings
    const quota = await prisma.userStorageQuota.findUnique({
      where: { user_id: userId },
      select: { id: true },
    });
    if (!quota) {
      return res.status(403).json({
        success: false,
        message: "Storage settings are only available for subscribed users",
        upgrade_required: true,
      });
    }

    // Only accept auto_delete_enabled - notification_threshold is fixed at 80%
    const { auto_delete_enabled } = req.body;

    if (auto_delete_enabled === undefined) {
      return res.status(400).json({
        success: false,
        message: "auto_delete_enabled is required",
      });
    }

    const updateData = {
      auto_delete_enabled: auto_delete_enabled,
    };

    // When enabling auto-delete, automatically set to 30 days
    if (auto_delete_enabled) {
      updateData.auto_delete_days = 30;
    }

    const updatedQuota = await prisma.userStorageQuota.update({
      where: { user_id: userId },
      data: updateData,
    });

    res.status(200).json({
      success: true,
      message: "Storage settings updated",
      quota: serialize(updatedQuota),
    });
  } catch (error) {
    console.error("Error updating quota settings:", error);
    if (error.code === "P2025") {
      return res.status(404).json({
        success: false,
        message: "Storage quota not found",
      });
    }
    res.status(500).json({
      success: false,
      message: "Failed to update storage settings",
      error: error.message,
    });
  }
};

/**
 * GET /api/storage/quota/remaining
 * Quick check: remaining storage available
 */
export const getRemainingStorage = async (req, res) => {
  try {
    const { userId, role } = req.user;

    // Only subscribed users have storage
    const quota = await prisma.userStorageQuota.findUnique({
      where: { user_id: userId },
    });
    if (!quota) {
      return res.status(404).json({
        success: false,
        message: "Storage quota not initialized",
      });
    }

    // Calculate used storage
    const result = await prisma.download.aggregate({
      where: {
        user_id: userId,
        status: "completed",
        deleted_at: null,
      },
      _sum: { file_size_bytes: true },
    });
    const usedStorage = result._sum.file_size_bytes || BigInt(0);
    const remainingStorage = quota.total_storage_bytes - usedStorage;

    res.status(200).json({
      success: true,
      tier: quota.tier,
      total_storage: formatBytes(quota.total_storage_bytes),
      total_storage_bytes: quota.total_storage_bytes.toString(),
      used_storage: formatBytes(usedStorage),
      used_storage_bytes: usedStorage.toString(),
      remaining_storage: formatBytes(remainingStorage),
      remaining_storage_bytes: remainingStorage.toString(),
      remaining_percent: Number((remainingStorage * BigInt(100)) / quota.total_storage_bytes),
    });
  } catch (error) {
    console.error("Error getting remaining storage:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch remaining storage",
      error: error.message,
    });
  }
};

/**
 * POST /api/storage/quota/initialize
 * Initialize storage quota for user (normally created automatically after subscription succeeds)
 * CRITICAL: This endpoint should ONLY be called from payment success handler
 * when user becomes subscribed, NOT on signup
 */
export const initializeQuota = async (req, res) => {
  try {
    const { userId } = req.user;
    const { plan } = req.body;

    const activeSub = await prisma.subscription.findFirst({
      where: { user_id: userId, status: "active" },
      select: { plan: true },
    });
    if (!activeSub) {
      return res.status(403).json({
        success: false,
        message: "Active subscription required to initialize storage quota",
        upgrade_required: true,
      });
    }

    if (plan && plan !== activeSub.plan) {
      return res.status(400).json({
        success: false,
        message: "Requested plan does not match active subscription plan",
      });
    }

    const effectivePlan = plan || activeSub.plan;

    if (!["most_popular", "basic", "family"].includes(effectivePlan)) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan. Only 'most_popular', 'basic', or 'family' allowed for initialization",
      });
    }

    // Check if quota already exists
    const existingQuota = await prisma.userStorageQuota.findUnique({
      where: { user_id: userId },
    });
    if (existingQuota) {
      return res.status(400).json({
        success: false,
        message: "Storage quota already initialized",
      });
    }

    // Create new quota
    const newQuota = await createUserStorageQuota(userId, effectivePlan);

    res.status(201).json({
      success: true,
      message: "Storage quota initialized",
      quota: serialize(newQuota),
    });
  } catch (error) {
    console.error("Error initializing quota:", error);
    res.status(500).json({
      success: false,
      message: "Failed to initialize storage quota",
      error: error.message,
    });
  }
};
