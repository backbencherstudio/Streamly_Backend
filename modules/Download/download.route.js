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
  upgradeQuota,
  updateQuotaSettings,
  initializeQuota,
} from "./storageQuota.controller.js";
import { verifyUser } from "../../middlewares/verifyUsers.js";

const router = express.Router();

/**
 * ============================================
 * DOWNLOAD ENDPOINTS (PREMIUM ONLY)
 * ============================================
 */

// POST /api/downloads/start
// Start a new download for content (PREMIUM ONLY)
// Body: { content_id: "string", quality?: "480p" | "720p" | "1080p" | "4k" }
router.post("/start", verifyUser("premium"), startDownload);

// GET /api/downloads
// Get user's downloads with pagination and filters (PREMIUM ONLY)
// Query: page=1&take=20&status=completed
router.get("/", verifyUser("premium"), getDownloads);

// GET /api/downloads/:id/progress
// Get progress of a specific download (PREMIUM ONLY)
router.get("/:id/progress", verifyUser("premium"), getDownloadProgress);

// GET /api/downloads/:id/play
// Play/stream downloaded video for offline viewing (PREMIUM ONLY)
router.get("/:id/play", verifyUser("premium"), playDownloadedVideo);

// PATCH /api/downloads/:id/pause
// Pause an ongoing download (PREMIUM ONLY)
router.patch("/:id/pause", verifyUser("premium"), pauseDownload);

// PATCH /api/downloads/:id/resume
// Resume a paused download (PREMIUM ONLY)
router.patch("/:id/resume", verifyUser("premium"), resumeDownload);

// DELETE /api/downloads/:id
// Cancel a download (PREMIUM ONLY)
router.delete("/:id", verifyUser("premium"), cancelDownload);

// DELETE /api/downloads/:id/delete
// Delete a completed download (free up storage) (PREMIUM ONLY)
router.delete("/:id/delete", verifyUser("premium"), deleteDownload);

// DELETE /api/downloads/cleanup/all
// Delete all user downloads and free up storage (PREMIUM ONLY)
router.delete("/cleanup/all", verifyUser("premium"), deleteAllDownloads);

/**
 * ============================================
 * STORAGE DASHBOARD ENDPOINT (PREMIUM ONLY)
 * ============================================
 */

// GET /api/downloads/storage
// Get storage dashboard with usage, alert, and downloads list (PREMIUM ONLY)
// Query: page=1&take=20
router.get("/storage", verifyUser("premium"), getStorageDashboard);

/**
 * ============================================
 * STORAGE QUOTA ENDPOINTS (PREMIUM ONLY)
 * ============================================
 */

// POST /api/storage/quota/initialize
// Initialize storage quota (PREMIUM ONLY, called on subscription upgrade)
// Body: { tier?: "premium" | "family" }
router.post("/quota/initialize", verifyUser("premium"), initializeQuota);

// POST /api/storage/quota/upgrade
// Upgrade user's storage tier (PREMIUM ONLY)
// Body: { tier: "premium" | "family" }
router.post("/quota/upgrade", verifyUser("premium"), upgradeQuota);

// PATCH /api/storage/quota/settings
// Update storage quota settings (PREMIUM ONLY)
// Body: { auto_delete_enabled: boolean }
// NOTE: auto_delete_days is automatically set to 30 when enabled
// NOTE: notification_threshold is fixed at 80% (no need to send from frontend)
router.patch("/quota/settings", verifyUser("premium"), updateQuotaSettings);

export default router;
