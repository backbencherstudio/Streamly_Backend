import express from "express";
import { verifyUser } from "../../middlewares/verifyUsers.js";
import { verifyCreatorSubscribed } from "../../middlewares/verifyCreatorSubscribed.js";
import { upload } from "../../config/Multer.config.js";
import {
  deleteMyCreatorChannel,
  getMyCreatorChannelDashboard,
  getMyCreatorChannelStatus,
  getMyCreatorEarningsSummary,
  requestCreatorEarningsWithdrawal,
  requestCreatorChannel,
  updateMyCreatorChannelPhoto,
  updateCreatorChannel,
} from "./creatorChannel.controller.js";

const router = express.Router();

// My Channel (dashboard)
router.get(
  "/channel/dashboard",
  verifyUser("ANY"),
  verifyCreatorSubscribed,
  getMyCreatorChannelDashboard,
);

// Earnings summary
router.get(
  "/channel/earnings/summary",
  verifyUser("ANY"),
  verifyCreatorSubscribed,
  getMyCreatorEarningsSummary,
);

// Withdraw earnings (placeholder)
router.post(
  "/channel/earnings/withdraw",
  verifyUser("ANY"),
  verifyCreatorSubscribed,
  requestCreatorEarningsWithdrawal,
);

router.post(
  "/channel/request",
  verifyUser("ANY"),
  verifyCreatorSubscribed,
  requestCreatorChannel,
);

router.get("/channel/status", verifyUser("ANY"), getMyCreatorChannelStatus);

router.patch(
  "/channel/update",
  verifyUser("ANY"),
  verifyCreatorSubscribed,
  updateCreatorChannel,
);

// Channel photo (uses user's avatar)
router.put(
  "/channel/photo",
  verifyUser("ANY"),
  verifyCreatorSubscribed,
  upload.fields([
    { name: "avatar", maxCount: 1 },
    { name: "banner", maxCount: 1 },
    { name: "photo", maxCount: 1 },
  ]),
  updateMyCreatorChannelPhoto,
);

router.delete(
  "/channel/delete",
  verifyUser("ANY"),
  verifyCreatorSubscribed,
  deleteMyCreatorChannel,
);

export default router;
