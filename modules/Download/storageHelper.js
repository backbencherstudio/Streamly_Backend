import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Storage tier limits (in bytes)
export const STORAGE_TIERS = {
  free: 5 * 1024 * 1024 * 1024, // 5 GB
  premium: 50 * 1024 * 1024 * 1024, // 50 GB
  family: 100 * 1024 * 1024 * 1024, // 100 GB
};

// Quality file size estimates (multiplier for content file size)
export const QUALITY_MULTIPLIERS = {
  "480p": 0.3, // 30% of original
  "720p": 0.6, // 60% of original
  "1080p": 1.0, // 100% of original
  "4k": 2.0, // 200% of original
};

// Convert bytes to human-readable format
export const formatBytes = (bytes) => {
  // Convert BigInt to number if needed
  const numBytes = typeof bytes === "bigint" ? Number(bytes) : bytes;
  
  if (numBytes === 0) return "0 B";
  
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(numBytes) / Math.log(k));
  
  return parseFloat((numBytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

// Get storage tier limits
// NOTE: Free tier is only for reference. Users must be premium to have any storage access
export const getStorageTierLimit = (tier = "premium") => {
  return STORAGE_TIERS[tier] || STORAGE_TIERS.premium;
};

// Calculate file size based on quality
export const calculateDownloadSize = (originalFileSize, quality = "720p") => {
  const multiplier = QUALITY_MULTIPLIERS[quality] || QUALITY_MULTIPLIERS["720p"];
  // Convert BigInt to number, apply multiplier with rounding, convert back to BigInt
  return BigInt(Math.ceil(Number(originalFileSize) * multiplier));
};

// Get user's total used storage
export const calculateStorageUsed = async (userId) => {
  try {
    const result = await prisma.download.aggregate({
      where: {
        user_id: userId,
        status: "completed",
        deleted_at: null,
      },
      _sum: {
        file_size_bytes: true,
      },
    });

    return result._sum.file_size_bytes || BigInt(0);
  } catch (error) {
    console.error("Error calculating storage used:", error);
    return BigInt(0);
  }
};

// Check if user has available storage for download
export const checkQuotaAvailable = async (userId, requiredBytes) => {
  try {
    const quota = await prisma.userStorageQuota.findUnique({
      where: { user_id: userId },
    });

    if (!quota) {
      return { available: false, reason: "Storage quota not initialized" };
    }

    const usedStorage = await calculateStorageUsed(userId);
    const availableStorage = quota.total_storage_bytes - usedStorage;

    if (availableStorage < requiredBytes) {
      return {
        available: false,
        reason: "Insufficient storage space",
        required: formatBytes(requiredBytes),
        available: formatBytes(availableStorage),
      };
    }

    return { available: true };
  } catch (error) {
    console.error("Error checking quota:", error);
    return { available: false, reason: "Error checking storage quota" };
  }
};

// Get user storage info
export const getUserStorageInfo = async (userId) => {
  try {
    const quota = await prisma.userStorageQuota.findUnique({
      where: { user_id: userId },
    });

    if (!quota) {
      // No storage access for non-premium users
      return null;
    }

    return formatStorageInfo(quota);
  } catch (error) {
    console.error("Error getting storage info:", error);
    throw error;
  }
};

// Format storage info for response
const formatStorageInfo = async (quota) => {
  const usedStorage = await calculateStorageUsed(quota.user_id);
  const usedPercent = Number(
    (usedStorage * BigInt(100)) / quota.total_storage_bytes
  );

  return {
    tier: quota.tier,
    total_storage: formatBytes(quota.total_storage_bytes),
    total_storage_bytes: quota.total_storage_bytes.toString(),
    used_storage: formatBytes(usedStorage),
    used_storage_bytes: usedStorage.toString(),
    remaining_storage: formatBytes(
      quota.total_storage_bytes - usedStorage
    ),
    remaining_storage_bytes: (
      quota.total_storage_bytes - usedStorage
    ).toString(),
    used_percent: usedPercent,
    auto_delete_enabled: quota.auto_delete_enabled,
    auto_delete_days: quota.auto_delete_days,
    notification_threshold: quota.notification_threshold,
  };
};

// Create user storage quota (called when user subscribes to premium)
// IMPORTANT: Only premium users should have storage quota
export const createUserStorageQuota = async (userId, tier = "premium") => {
  // Enforce premium tier - never create free tier for users
  const validTier = tier === "premium" || tier === "family" ? tier : "premium";
  
  try {
    return await prisma.userStorageQuota.upsert({
      where: { user_id: userId },
      update: { tier: validTier },
      create: {
        user_id: userId,
        tier: validTier,
        total_storage_bytes: getStorageTierLimit(validTier),
        used_storage_bytes: BigInt(0),
      },
    });
  } catch (error) {
    console.error("Error creating storage quota:", error);
    throw error;
  }
};

// Update user storage quota tier (e.g., on subscription upgrade)
export const upgradeStorageQuota = async (userId, newTier) => {
  try {
    return await prisma.userStorageQuota.update({
      where: { user_id: userId },
      data: {
        tier: newTier,
        total_storage_bytes: getStorageTierLimit(newTier),
      },
    });
  } catch (error) {
    console.error("Error upgrading storage quota:", error);
    throw error;
  }
};

// Get storage usage percentage and alert status
export const getStorageAlertStatus = async (userId) => {
  try {
    const quota = await prisma.userStorageQuota.findUnique({
      where: { user_id: userId },
    });

    if (!quota) return null;

    const usedStorage = await calculateStorageUsed(userId);
    const usedPercent = Number(
      (usedStorage * BigInt(100)) / quota.total_storage_bytes
    );

    return {
      used_percent: usedPercent,
      threshold: quota.notification_threshold,
      should_alert: usedPercent >= quota.notification_threshold,
      tier: quota.tier,
    };
  } catch (error) {
    console.error("Error getting storage alert status:", error);
    return null;
  }
};
