import express from "express";
import {
  getAllSubscriptions,
  getTotalSubscribers,
  getTotalActiveSubscriptions,
  getTotalMonthlyRevenue,
  getAvgSubsctiptionValue,
  getSavedPaymentMethods,
  createStripeSubscription,
  handleStripeWebhook,
  cancelStripeSubscription,
  getSubscriptionStatus,
  getPlans,
} from "./stripe.controller.js";
import { verifyUser } from "../../middlewares/verifyUsers.js";

const router = express.Router();

router.post("/webhook", handleStripeWebhook);
router.get("/getAllSubscriptions", verifyUser("admin"), getAllSubscriptions);
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

// Subscription

router.get("/totalSubscribers", verifyUser("admin"), getTotalSubscribers);
router.get(
  "/totalActiveSubscribers",
  verifyUser("admin"),
  getTotalActiveSubscriptions,
);
router.get("/totalMonthlyRevenue", verifyUser("admin"), getTotalMonthlyRevenue);
router.get("/totalAvgSubValue", verifyUser("admin"), getAvgSubsctiptionValue);

export default router;
