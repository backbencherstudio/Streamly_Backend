import { PrismaClient } from "@prisma/client";
import { getStorageLimitByPlan } from "../modules/Download/storageHelper.js";

const prisma = new PrismaClient();

/**
 * Ensures the user has an active paid subscription (plan-based), and ensures
 * a matching UserStorageQuota row exists.
 *
 * Requires `verifyUser()` to run first (so `req.user.userId` exists).
 */
export const verifySubscribed = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const normalizePlan = (plan) => {
      if (!plan) return null;
      const p = String(plan);
      if (p === "No_plan") return null;
      return p;
    };

    // We treat Subscription.status === 'active' as subscribed.
    const subscription = await prisma.subscription.findFirst({
      where: {
        user_id: userId,
        status: "active",
      },
      orderBy: { updated_at: "desc" },
      select: {
        id: true,
        plan: true,
        status: true,
        transaction_id: true,
        renewal_date: true,
      },
    });

    let effectiveSubscription = null;
    let effectivePlan = normalizePlan(subscription?.plan);

    if (subscription && effectivePlan) {
      effectiveSubscription = subscription;
    } else {
      // Fallback: creator subscription also grants viewer entitlements (plan-based)
      const creatorSub = await prisma.creatorSubscription.findFirst({
        where: {
          user_id: userId,
          status: "active",
        },
        orderBy: { updated_at: "desc" },
        include: {
          service: {
            select: {
              plan: true,
            },
          },
        },
      });

      effectivePlan = normalizePlan(creatorSub?.service?.plan);
      if (creatorSub && effectivePlan) {
        effectiveSubscription = {
          id: creatorSub.id,
          plan: effectivePlan,
          status: "active",
          transaction_id: creatorSub.transaction_id ?? null,
          renewal_date: creatorSub.current_period_end ?? null,
          source: "creator",
        };
      }
    }

    if (!effectiveSubscription || !effectivePlan) {
      return res.status(403).json({
        success: false,
        message: "Subscription required",
        upgrade_required: true,
      });
    }

    // Ensure quota exists (webhook usually creates it; this is a safety net).
    await prisma.userStorageQuota.upsert({
      where: { user_id: userId },
      update: {
        tier: effectivePlan,
        total_storage_bytes: getStorageLimitByPlan(effectivePlan),
      },
      create: {
        user_id: userId,
        tier: effectivePlan,
        total_storage_bytes: getStorageLimitByPlan(effectivePlan),
        used_storage_bytes: BigInt(0),
      },
    });

    req.subscription = effectiveSubscription;
    next();
  } catch (error) {
    console.error("[verifySubscribed] error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to validate subscription",
    });
  }
};
