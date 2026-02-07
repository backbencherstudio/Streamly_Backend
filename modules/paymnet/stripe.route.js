import express from "express";
import {
  getAllSubscriptions,
  getSubscriptionDashboardStats,
  getSavedPaymentMethods,
  createStripeSubscription,
  handleStripeWebhook,
  cancelStripeSubscription,
  getSubscriptionStatus,
  getPlans,
  getSubscriptionById,
} from "./stripe.controller.js";
import { verifyUser } from "../../middlewares/verifyUsers.js";

const router = express.Router();

router.post("/webhook", handleStripeWebhook);

router.get("/plans", verifyUser("normal", "premium", "creator"), getPlans);

router.get(
  "/payment-methods",
  verifyUser("normal", "premium", "creator"),
  getSavedPaymentMethods,
);

router.post(
  "/subscribe",
  verifyUser("normal", "premium", "creator"),
  createStripeSubscription,
);

router.post(
  "/cancel-subscription",
  verifyUser("normal", "premium", "creator"),
  cancelStripeSubscription,
);

router.get(
  "/subscriptions/status",
  verifyUser("normal", "premium", "creator"),
  getSubscriptionStatus,
);

// admin analytics routes
router.get("/getAllSubscriptions", verifyUser("admin"), getAllSubscriptions);

router.get(
  "/subscriptions/stats",
  verifyUser("admin"),
  getSubscriptionDashboardStats,
);

router.get("/subscriptions/:id", verifyUser("admin"), getSubscriptionById);

export default router;
