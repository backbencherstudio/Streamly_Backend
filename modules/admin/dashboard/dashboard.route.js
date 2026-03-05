import express from "express";
import { verifyUser } from "../../../middlewares/verifyUsers.js";
import {
  getAdminDashboardOverview,
  getRevenueAnalytics,
  getSubscriptionGrowthAnalytics,
} from "./dashboard.controller.js";
import { getAllUsers } from "../users/users.controller.js";
const router = express.Router();

// Admin dashboard overview
router.get(
  "/dashboard/overview",
  verifyUser("admin"),
  getAdminDashboardOverview,
);

router.get(
  "/dashboard/subscription-growth",
  verifyUser("admin"),
  getSubscriptionGrowthAnalytics,
);

router.get("/dashboard/revenue", verifyUser("admin"), getRevenueAnalytics);
router.get("/dashboard/recent-users", verifyUser("admin"), getAllUsers);

export default router;
