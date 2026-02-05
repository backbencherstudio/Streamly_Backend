import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const verifyCreatorSubscribed = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthenticated" });
    }

    const sub = await prisma.creatorSubscription.findFirst({
      where: {
        user_id: userId,
        status: "active",
      },
      include: {
        service: {
          select: {
            id: true,
            plan: true,
            videos_per_month: true,
          },
        },
      },
    });

    if (!sub) {
      return res.status(403).json({
        message: "Creator subscription required",
        code: "CREATOR_SUBSCRIPTION_REQUIRED",
      });
    }

    req.creatorSubscription = sub;
    next();
  } catch (err) {
    console.error("verifyCreatorSubscribed error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
