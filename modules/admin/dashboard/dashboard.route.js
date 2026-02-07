import express from "express";
import { PrismaClient } from "@prisma/client";
import { verifyUser } from "../../../middlewares/verifyUsers.js";
import {
  getAdminDashboardOverview,
  getSubscriptionGrowthAndTotalRevenue,
} from "./dashboard.controller.js";
import { getAllUsers } from "../users/users.controller.js";

const prisma = new PrismaClient();
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
  getSubscriptionGrowthAndTotalRevenue,
);
router.get("/dashboard/recent-users", verifyUser("admin"), getAllUsers);

export default router;
