import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const parseRatingValue = (value) => {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) return null;
  const intValue = Math.round(n);
  if (intValue < 1 || intValue > 5) return null;
  return intValue;
};

//---------------------createRating-----------------------
export const createRating = async (req, res) => {
  try {
    const user_id = req.user?.userId;
    const { content_id, rating, comment } = req.body;

    // console.log("createRating:", user_id, content_id, rating, comment);

    if (!user_id || !content_id || rating === undefined) {
      return res.status(400).json({ message: "user_id, content_id and rating are required" });
    }

    const normalizedRating = parseRatingValue(rating);
    if (normalizedRating === null) {
      return res.status(400).json({ message: "Rating must be an integer between 1 and 5" });
    }

    const normalizedComment =
      comment === undefined || comment === null ? undefined : String(comment).trim();

    const contentExists = await prisma.content.findFirst({
      where: {
        id: content_id,
        deleted_at: null,
        content_status: "published",
        review_status: "approved",
      },
      select: { id: true },
    });
    if (!contentExists) {
      return res.status(404).json({ message: "Content not found" });
    }

    try {
      const newRating = await prisma.rating.create({
        data: {
          user_id,
          content_id,
          rating: normalizedRating,
          comment: normalizedComment,
        },
      });

      return res.status(201).json({
        success: true,
        message: "Rating created successfully",
        data: newRating,
      });
    } catch (e) {
      // Handle concurrent creates / unique constraint on (user_id, content_id)
      if (e?.code === "P2002") {
        return res
          .status(409)
          .json({ message: "You have already rated this content" });
      }
      throw e;
    }
  } catch (error) {
    console.error("Error in createRating:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// Get all ratings
export const getAllRatings = async (req, res) => {
  try {
    const ratings = await prisma.rating.findMany();
    return res.status(200).json({ success: true, data: ratings });
  } catch (error) {
    console.error("Error in getAllRatings:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

//------------------getRatingById-------------------
export const getRatingById = async (req, res) => {
  try {
    const { id } = req.params;
    const rating = await prisma.rating.findUnique({ where: { id } });
    if (!rating) {
      return res.status(404).json({ message: "Rating not found" });
    }
    return res.status(200).json({ success: true, data: rating });
  } catch (error) {
    console.error("Error in getRatingById:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

//------------------updateRating-------------------
export const updateRating = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { content_id } = req.params;
    if (!content_id) {
      return res.status(400).json({ message: "content_id is required" });
    }

    // Update the current user's rating for the given content
    const existing = await prisma.rating.findFirst({
      where: { user_id: userId, content_id },
      select: { id: true, user_id: true, content_id: true },
    });

    if (!existing) {
      return res.status(404).json({ message: "Rating not found for this content" });
    }

    const { rating, comment } = req.body;

    const data = {};
    if (rating !== undefined) {
      const normalizedRating = parseRatingValue(rating);
      if (normalizedRating === null) {
        return res
          .status(400)
          .json({ message: "Rating must be an integer between 1 and 5" });
      }
      data.rating = normalizedRating;
    }
    if (comment !== undefined) {
      data.comment = comment === null ? null : String(comment).trim();
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    const updated = await prisma.rating.update({
      where: { id: existing.id },
      data,
    });

    return res
      .status(200)
      .json({ success: true, message: "Rating updated", data: updated });
  } catch (error) {
    console.error("Error in updateRating:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ message: "Rating not found" });
    }
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

//------------------deleteRating-------------------
export const deleteRating = async (req, res) => {
  try {
    const { id } = req.params;

    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const isAdminUser =
      String(req.user?.role || "").toLowerCase() === "admin" ||
      String(req.user?.type || "").toLowerCase() === "admin";

    const existing = await prisma.rating.findUnique({
      where: { id },
      select: { id: true, user_id: true },
    });

    if (!existing) {
      return res.status(404).json({ message: "Rating not found" });
    }

    if (!isAdminUser && existing.user_id !== userId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    await prisma.rating.delete({ where: { id } });
    return res.status(200).json({ success: true, message: "Rating deleted" });
  } catch (error) {
    console.error("Error in deleteRating:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ message: "Rating not found" });
    }
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

//------------------topRatedContentThisWeek-------------------
export const topRatedContentThisWeek = async (req, res) => {
  try {
    const topRatings = await prisma.rating.groupBy({
      by: ["content_id"],
      _avg: {
        rating: true,
      },
      orderBy: {
        _avg: {
          rating: "desc",
        },
      },
      take: 10,
      where: {
        created_at: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
    });

    return res.status(200).json({
      success: true,
      data: topRatings,
    });
  } catch (error) {
    console.error("Error in topRatedContentThisWeek:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
