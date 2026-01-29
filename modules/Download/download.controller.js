import { PrismaClient } from "@prisma/client";
import {
  calculateStorageUsed,
  checkQuotaAvailable,
  calculateDownloadSize,
  formatBytes,
  getUserStorageInfo,
  getStorageAlertStatus,
} from "./storageHelper.js";
import { Queue } from "bullmq";
import { connection } from "../libs/queue.js";
import fs from "fs";

const prisma = new PrismaClient();
const downloadQueue = new Queue("downloads", { connection });

// URL helpers
const PUBLIC_BASE_URL = process.env.APP_URL || "http://localhost:4005";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";

const buildS3Url = (bucket, key) => {
  if (!bucket || !key) return null;
  if (process.env.AWS_S3_ENDPOINT) {
    return `${process.env.AWS_S3_ENDPOINT}/${bucket}/${key}`;
  }
  return `https://${bucket}.s3.${AWS_REGION}.amazonaws.com/${key}`;
};

const buildLocalUrl = (file) => {
  return file ? `${PUBLIC_BASE_URL}/uploads/${file}` : null;
};

// Helper: Serialize BigInt to String
const serialize = (data) =>
  JSON.parse(
    JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v))
  );

/**
 * POST /api/downloads/start
 * Start a new download for a content
 */
export const startDownload = async (req, res) => {
  try {
    const { userId, role } = req.user;

    // Only premium users can download
    if (role !== "premium") {
      return res.status(403).json({
        success: false,
        message: "Download feature is only available for premium users",
        upgrade_required: true,
      });
    }

    const { content_id, quality = "720p" } = req.body;

    if (!content_id) {
      return res.status(400).json({
        success: false,
        message: "content_id is required",
      });
    }

    // Check if content exists and is published
    const content = await prisma.content.findFirst({
      where: {
        id: content_id,
        content_status: "published",
        deleted_at: null,
      },
      select: {
        id: true,
        title: true,
        file_size_bytes: true,
        content_type: true,
        is_premium: true,
      },
    });

    if (!content) {
      return res.status(404).json({
        success: false,
        message: "Content not found or not available",
      });
    }

    // Check if already downloading/completed this content
    const existingDownload = await prisma.download.findUnique({
      where: {
        user_id_content_id: {
          user_id: userId,
          content_id: content_id,
        },
      },
    });

    // Allow re-download if:
    // 1. No existing download
    // 2. Previous download was deleted (soft-deleted)
    // 3. Previous download failed
    // 4. Previous download was cancelled
    if (existingDownload) {
      const isDeleted = existingDownload.deleted_at !== null;
      const canRetry = ["failed", "cancelled"].includes(existingDownload.status);
      
      if (!isDeleted && !canRetry) {
        return res.status(409).json({
          success: false,
          message: "This content is already downloaded or in progress",
          download: serialize(existingDownload),
        });
      }
    }

    // Calculate download file size
    const downloadSize = calculateDownloadSize(content.file_size_bytes, quality);

    // Check storage quota
    const quotaCheck = await checkQuotaAvailable(userId, downloadSize);
    if (!quotaCheck.available) {
      return res.status(413).json({
        success: false,
        message: quotaCheck.reason,
        details: quotaCheck,
      });
    }

    // Create or update download record
    const download = await prisma.download.upsert({
      where: {
        user_id_content_id: {
          user_id: userId,
          content_id: content_id,
        },
      },
      update: {
        status: "pending",
        quality,
        progress: 0,
        file_size_bytes: downloadSize,
        downloaded_bytes: BigInt(0),
        error_message: null,
        failed_count: 0,
        deleted_at: null,
        // Set expiration to 30 days from now (can be customized)
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      create: {
        user_id: userId,
        content_id: content_id,
        status: "pending",
        quality,
        file_size_bytes: downloadSize,
        downloaded_bytes: BigInt(0),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    // Queue the download job to be processed by the worker
    try {
      await downloadQueue.add(
        "start",
        {
          downloadId: download.id,
          userId,
          contentId: content_id,
          quality,
        },
        {
          attempts: 5, // Retry 5 times if it fails (1 initial + 4 retries)
          backoff: {
            type: "exponential",
            delay: 2000, // Start with 2 second delay, then 4s, 8s, 16s, 32s
          },
          removeOnComplete: false, // Keep completed jobs for history
          removeOnFail: false, // Keep failed jobs for debugging
        }
      );
      console.log(`[startDownload] Queued download job for ${download.id}`);
    } catch (queueError) {
      console.error("[startDownload] Failed to queue download:", queueError);
      // Don't fail the request, the download record is created
      // The worker can pick it up later
    }

    res.status(201).json({
      success: true,
      message: "Download started",
      download: serialize(download),
    });
  } catch (error) {
    console.error("Error starting download:", error);
    res.status(500).json({
      success: false,
      message: "Failed to start download",
      error: error.message,
    });
  }
};

/**
 * GET /api/downloads
 * Get user's downloads with pagination and filters
 */
export const getDownloads = async (req, res) => {
  try {
    const { userId } = req.user;
    const { page = 1, take = 20, status = null } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const takeNum = Math.min(100, Math.max(1, parseInt(take)));
    const skip = (pageNum - 1) * takeNum;

    // Build where clause
    const where = {
      user_id: userId,
      deleted_at: null,
    };

    if (status && ["pending", "downloading", "completed", "paused", "failed"].includes(status)) {
      where.status = status;
    }

    // Get total count
    const total = await prisma.download.count({ where });

    // Get downloads
    const downloads = await prisma.download.findMany({
      where,
      skip,
      take: takeNum,
      orderBy: { updated_at: "desc" },
      include: {
        content: {
          select: {
            id: true,
            title: true,
            content_type: true,
            thumbnail: true,
            description: true,
            is_premium: true,
            s3_bucket: true,
            s3_thumb_key: true,
          },
        },
      },
    });

    const formattedDownloads = downloads.map((dl) => ({
      ...serialize(dl),
      file_size_bytes: dl.file_size_bytes?.toString(),
      downloaded_bytes: dl.downloaded_bytes?.toString(),
      content: {
        ...dl.content,
        thumbnail: buildS3Url(dl.content.s3_bucket, dl.content.s3_thumb_key) || buildLocalUrl(dl.content.thumbnail),
        s3_bucket: undefined,
        s3_thumb_key: undefined,
      },
    }));

    res.status(200).json({
      success: true,
      downloads: formattedDownloads,
      pagination: {
        page: pageNum,
        take: takeNum,
        total,
        totalPages: Math.ceil(total / takeNum),
      },
    });
  } catch (error) {
    console.error("Error fetching downloads:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch downloads",
      error: error.message,
    });
  }
};

/**
 * GET /api/downloads/:id/progress
 * Get download progress
 */
export const getDownloadProgress = async (req, res) => {
  try {
    const { userId } = req.user;
    const { id } = req.params;

    const download = await prisma.download.findFirst({
      where: {
        id,
        user_id: userId,
        deleted_at: null,
      },
      include: {
        content: {
          select: {
            id: true,
            title: true,
            content_type: true,
            thumbnail: true,
            description: true,
            is_premium: true,
            s3_bucket: true,
            s3_thumb_key: true,
          },
        },
      },
    });

    if (!download) {
      return res.status(404).json({
        success: false,
        message: "Download not found",
      });
    }

    res.status(200).json({
      success: true,
      download: {
        ...serialize(download),
        file_size_bytes: download.file_size_bytes?.toString(),
        downloaded_bytes: download.downloaded_bytes?.toString(),
        content: {
          ...download.content,
          thumbnail: buildS3Url(download.content.s3_bucket, download.content.s3_thumb_key) || buildLocalUrl(download.content.thumbnail),
          s3_bucket: undefined,
          s3_thumb_key: undefined,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching download progress:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch download progress",
      error: error.message,
    });
  }
};

/**
 * PATCH /api/downloads/:id/pause
 * Pause a download
 */
export const pauseDownload = async (req, res) => {
  try {
    const { userId } = req.user;
    const { id } = req.params;

    const download = await prisma.download.findFirst({
      where: {
        id,
        user_id: userId,
        deleted_at: null,
      },
    });

    if (!download) {
      return res.status(404).json({
        success: false,
        message: "Download not found",
      });
    }

    if (!["downloading", "pending"].includes(download.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot pause download with status: ${download.status}`,
      });
    }

    const updatedDownload = await prisma.download.update({
      where: { id },
      data: { status: "paused" },
    });

    res.status(200).json({
      success: true,
      message: "Download paused",
      download: serialize(updatedDownload),
    });
  } catch (error) {
    console.error("Error pausing download:", error);
    res.status(500).json({
      success: false,
      message: "Failed to pause download",
      error: error.message,
    });
  }
};

/**
 * PATCH /api/downloads/:id/resume
 * Resume a paused download
 */
export const resumeDownload = async (req, res) => {
  try {
    const { userId } = req.user;
    const { id } = req.params;

    const download = await prisma.download.findFirst({
      where: {
        id,
        user_id: userId,
        deleted_at: null,
      },
    });

    if (!download) {
      return res.status(404).json({
        success: false,
        message: "Download not found",
      });
    }

    if (download.status !== "paused") {
      return res.status(400).json({
        success: false,
        message: `Cannot resume download with status: ${download.status}`,
      });
    }

    const updatedDownload = await prisma.download.update({
      where: { id },
      data: { status: "downloading" },
    });

    res.status(200).json({
      success: true,
      message: "Download resumed",
      download: serialize(updatedDownload),
    });
  } catch (error) {
    console.error("Error resuming download:", error);
    res.status(500).json({
      success: false,
      message: "Failed to resume download",
      error: error.message,
    });
  }
};

/**
 * DELETE /api/downloads/:id
 * Cancel a download (soft delete)
 */
export const cancelDownload = async (req, res) => {
  try {
    const { userId } = req.user;
    const { id } = req.params;

    const download = await prisma.download.findFirst({
      where: {
        id,
        user_id: userId,
        deleted_at: null,
      },
    });

    if (!download) {
      return res.status(404).json({
        success: false,
        message: "Download not found",
      });
    }

    // Delete physical file if exists
    if (download.file_path) {
      try {
        await fs.unlinkSync(download.file_path);
        console.log(`[cancelDownload] Deleted file: ${download.file_path}`);
      } catch (fileError) {
        console.error(`[cancelDownload] Error deleting file:`, fileError);
      }
    }

    const cancelledDownload = await prisma.download.update({
      where: { id },
      data: {
        status: "cancelled",
        deleted_at: new Date(),
      },
    });

    // Recalculate storage usage
    const usedStorage = await calculateStorageUsed(userId);
    await prisma.userStorageQuota.update({
      where: { user_id: userId },
      data: { used_storage_bytes: usedStorage },
    });

    res.status(200).json({
      success: true,
      message: "Download cancelled",
      download: serialize(cancelledDownload),
    });
  } catch (error) {
    console.error("Error cancelling download:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cancel download",
      error: error.message,
    });
  }
};

/**
 * DELETE /api/downloads/:id/delete
 * Delete a completed download
 */
export const deleteDownload = async (req, res) => {
  try {
    const { userId } = req.user;
    const { id } = req.params;

    const download = await prisma.download.findFirst({
      where: {
        id,
        user_id: userId,
        deleted_at: null,
      },
    });

    if (!download) {
      return res.status(404).json({
        success: false,
        message: "Download not found",
      });
    }

    // Delete physical file if exists
    if (download.file_path) {
      try {
        await fs.unlinkSync(download.file_path);
        console.log(`[deleteDownload] Deleted file: ${download.file_path}`);
      } catch (fileError) {
        console.error(`[deleteDownload] Error deleting file:`, fileError);
      }
    }

    const deletedDownload = await prisma.download.update({
      where: { id },
      data: { deleted_at: new Date() },
    });

    // Recalculate storage usage
    const usedStorage = await calculateStorageUsed(userId);
    await prisma.userStorageQuota.update({
      where: { user_id: userId },
      data: { used_storage_bytes: usedStorage },
    });

    res.status(200).json({
      success: true,
      message: "Download deleted",
      download: serialize(deletedDownload),
    });
  } catch (error) {
    console.error("Error deleting download:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete download",
      error: error.message,
    });
  }
};

/**
 * GET /api/downloads/storage
 * Get complete storage dashboard with usage, alerts, and downloads list
 */
export const getStorageDashboard = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { page = 1, take = 20 } = req.query;

    // Only premium users have storage
    if (role !== "premium") {
      return res.status(403).json({
        success: false,
        message: "Storage feature is only available for premium users",
        upgrade_required: true,
      });
    }

    const storageInfo = await getUserStorageInfo(userId);
    const alertStatus = await getStorageAlertStatus(userId);

    // Double-check: no storage info means no access
    if (!storageInfo) {
      return res.status(403).json({
        success: false,
        message: "Storage not available for this user",
        upgrade_required: true,
      });
    }

    const pageNum = Math.max(1, parseInt(page));
    const takeNum = Math.min(100, Math.max(1, parseInt(take)));
    const skip = (pageNum - 1) * takeNum;

    // Get total count of downloads
    const total = await prisma.download.count({
      where: {
        user_id: userId,
        deleted_at: null,
      },
    });

    // Get downloads for the dashboard list
    const downloads = await prisma.download.findMany({
      where: {
        user_id: userId,
        deleted_at: null,
      },
      skip,
      take: takeNum,
      orderBy: { created_at: "desc" },
      include: {
        content: {
          select: {
            id: true,
            title: true,
            thumbnail: true,
            s3_bucket: true,
            s3_thumb_key: true,
          },
        },
      },
    });

    // Group all downloads by status for summary
    const allDownloads = await prisma.download.findMany({
      where: {
        user_id: userId,
        deleted_at: null,
      },
      select: { status: true },
    });

    const downloadsByStatus = {
      pending: 0,
      downloading: 0,
      completed: 0,
      paused: 0,
      failed: 0,
      cancelled: 0,
    };

    allDownloads.forEach((dl) => {
      downloadsByStatus[dl.status] = (downloadsByStatus[dl.status] || 0) + 1;
    });

    const formattedDownloads = downloads.map((dl) => ({
      ...serialize(dl),
      file_size_bytes: dl.file_size_bytes?.toString(),
      downloaded_bytes: dl.downloaded_bytes?.toString(),
      content: {
        ...dl.content,
        thumbnail: buildS3Url(dl.content.s3_bucket, dl.content.s3_thumb_key) || buildLocalUrl(dl.content.thumbnail),
        s3_bucket: undefined,
        s3_thumb_key: undefined,
      },
    }));

    res.status(200).json({
      success: true,
      storage: storageInfo,
      alert: alertStatus,
      downloads_summary: downloadsByStatus,
      downloads: formattedDownloads,
      pagination: {
        page: pageNum,
        take: takeNum,
        total,
        totalPages: Math.ceil(total / takeNum),
      },
    });
  } catch (error) {
    console.error("Error fetching storage dashboard:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch storage dashboard",
      error: error.message,
    });
  }
};

/**
 * DELETE /api/downloads/cleanup
 * Delete all downloads for the user
 */
export const deleteAllDownloads = async (req, res) => {
  try {
    const { userId, role } = req.user;

    console.log("hit this for all download");

    // Only premium users can cleanup
    if (role !== "premium") {
      return res.status(403).json({
        success: false,
        message: "Storage cleanup is only available for premium users",
        upgrade_required: true,
      });
    }

    // Get all non-deleted downloads for this user
    const allDownloads = await prisma.download.findMany({
      where: {
        user_id: userId,
        deleted_at: null,
      },
      select: {
        id: true,
        file_size_bytes: true,
        file_path: true,
      },
    });

    if (allDownloads.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No downloads to delete",
        deleted_count: 0,
        freed_storage: "0 B",
        freed_storage_bytes: "0",
      });
    }

    // Delete all physical files
    let filesDeleted = 0;
    for (const download of allDownloads) {
      if (download.file_path) {
        try {
          await fs.unlinkSync(download.file_path);
          filesDeleted++;
        } catch (fileError) {
          console.error(`[deleteAllDownloads] Error deleting file ${download.file_path}:`, fileError);
        }
      }
    }
    console.log(`[deleteAllDownloads] Deleted ${filesDeleted} physical files`);

    // Calculate total storage to be freed
    const totalFreedStorage = allDownloads.reduce(
      (sum, dl) => sum + (dl.file_size_bytes || BigInt(0)),
      BigInt(0)
    );

    // Permanently delete all downloads
    await prisma.download.deleteMany({
      where: {
        user_id: userId,
        deleted_at: null,
      },
    });

    // Recalculate storage usage
    const usedStorage = await calculateStorageUsed(userId);
    await prisma.userStorageQuota.update({
      where: { user_id: userId },
      data: { used_storage_bytes: usedStorage },
    });

    res.status(200).json({
      success: true,
      message: `All downloads deleted - freed ${formatBytes(totalFreedStorage)}`,
      deleted_count: allDownloads.length,
      files_deleted: filesDeleted,
      freed_storage: formatBytes(totalFreedStorage),
      freed_storage_bytes: totalFreedStorage.toString(),
    });
  } catch (error) {
    console.error("Error cleaning up storage:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cleanup storage",
      error: error.message,
    });
  }
};

/**
 * GET /api/downloads/:id/play
 * Stream downloaded video for offline playback
 */
export const playDownloadedVideo = async (req, res) => {
  try {
    const { userId } = req.user;
    const { id } = req.params;

    // Get download record
    const download = await prisma.download.findFirst({
      where: {
        id,
        user_id: userId,
        status: "completed",
        deleted_at: null,
      },
    });

    if (!download) {
      return res.status(404).json({
        success: false,
        message: "Download not found or not completed",
      });
    }

    // Check if file exists
    const filePath = download.file_path;
    
    if (!filePath) {
      return res.status(404).json({
        success: false,
        message: "Downloaded file not found",
      });
    }

    // Stream video file
    const stat = await fs.promises.stat(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      // Handle range requests for video seeking
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const file = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": "video/mp4",
      });

      file.pipe(res);
    } else {
      // Stream entire file
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": "video/mp4",
      });

      fs.createReadStream(filePath).pipe(res);
    }
  } catch (error) {
    console.error("Error streaming video:", error);
    res.status(500).json({
      success: false,
      message: "Failed to stream video",
      error: error.message,
    });
  }
};
