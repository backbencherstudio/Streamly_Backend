import express from "express";
import {
  getAllNotifications,
  deleteNotification,
  deleteAllNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "./notification.controller.js";
import { verifyUser } from "../../middlewares/verifyUsers.js";

const router = express.Router();

// Proper REST endpoints
router.get("/notifications", verifyUser("ANY"), getAllNotifications);
router.patch("/notifications/read-all", verifyUser("ANY"), markAllNotificationsRead);
router.patch("/notifications/:id/read", verifyUser("ANY"), markNotificationRead);
router.delete("/notifications/:id", verifyUser("ANY"), deleteNotification);
router.delete("/notifications", verifyUser("ANY"), deleteAllNotifications);

export default router;
