import express from "express";
import {
  startDownload,
  getDownloads,
  getDownloadProgress,
  pauseDownload,
  resumeDownload,
  cancelDownload,
  deleteDownload,
  deleteAllDownloads,
  getStorageDashboard,
  playDownloadedVideo,
} from "./download.controller.js";
import {
  updateQuotaSettings,
} from "./storageQuota.controller.js";
import { verifyUser } from "../../middlewares/verifyUsers.js";
import { verifySubscribed } from "../../middlewares/verifySubscribed.js";

const router = express.Router();

/**
 * ============================================
 * DOWNLOAD ENDPOINTS (SUBSCRIBED USERS)
 * ============================================
 */

// POST /api/downloads/start
// Start a new download for content (SUBSCRIBED USERS)
// Body: { content_id: "string", quality?: "480p" | "720p" | "1080p" | "4k" }
router.post("/start", verifyUser("ANY"), verifySubscribed, startDownload);

// GET /api/downloads
// Get user's downloads with pagination and filters (SUBSCRIBED USERS)
// Query: page=1&take=20&status=completed
router.get("/", verifyUser("ANY"), verifySubscribed, getDownloads);

// GET /api/downloads/:id/progress
// Get progress of a specific download (SUBSCRIBED USERS)
router.get("/:id/progress", verifyUser("ANY"), verifySubscribed, getDownloadProgress);

// GET /api/downloads/:id/play
// Play/stream downloaded video for offline viewing (SUBSCRIBED USERS)
router.get("/:id/play", verifyUser("ANY"), verifySubscribed, playDownloadedVideo);

// PATCH /api/downloads/:id/pause
// Pause an ongoing download (SUBSCRIBED USERS)
router.patch("/:id/pause", verifyUser("ANY"), verifySubscribed, pauseDownload);
// PATCH /api/downloads/:id/resume
// Resume a paused download (SUBSCRIBED USERS)
router.patch("/:id/resume", verifyUser("ANY"), verifySubscribed, resumeDownload);

// DELETE /api/downloads/:id
// Cancel a download (SUBSCRIBED USERS)
router.delete("/:id", verifyUser("ANY"), verifySubscribed, cancelDownload);

// DELETE /api/downloads/:id/delete
// Delete a completed download (free up storage) (SUBSCRIBED USERS)
router.delete("/:id/delete", verifyUser("ANY"), verifySubscribed, deleteDownload);

// DELETE /api/downloads/cleanup/all
// Delete all user downloads and free up storage (SUBSCRIBED USERS)
router.delete("/cleanup/all", verifyUser("ANY"), verifySubscribed, deleteAllDownloads);

/**
 * ============================================
 * STORAGE DASHBOARD ENDPOINT (SUBSCRIBED USERS)
 * ============================================
 */

// GET /api/downloads/storage
// Get storage dashboard with usage, alert, and downloads list (SUBSCRIBED USERS)
// Query: page=1&take=20
router.get("/storage", verifyUser("ANY"), verifySubscribed, getStorageDashboard);

/**
 * ============================================
 * STORAGE QUOTA ENDPOINTS (SUBSCRIBED USERS)
 * ============================================
 */

// POST /api/storage/quota/initialize
// Quota initialization is handled automatically by Stripe webhook.

// POST /api/storage/quota/upgrade
// Quota upgrades are handled automatically by Stripe webhook.

// PATCH /api/storage/quota/settings
// Update storage quota settings (SUBSCRIBED USERS)
// Body: { auto_delete_enabled: boolean }
// NOTE: auto_delete_days is automatically set to 30 when enabled
// NOTE: notification_threshold is fixed at 80% (no need to send from frontend)
router.patch(
  "/quota/settings",
  verifyUser("ANY"),
  verifySubscribed,
  updateQuotaSettings
);

export default router;
