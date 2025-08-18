import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();


//---------------------createRating-----------------------
export const createRating = async (req, res) => {
  try {
    const user_id = req.user?.userId; 
    const { content_id, rating, comment } = req.body;

    console.log("createRating:", user_id, content_id, rating, comment);

    if (!user_id || !content_id || rating === undefined) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (typeof rating !== "number" || rating < 0 || rating > 5) {
      return res
        .status(400)
        .json({ message: "Rating must be a number between 0 and 5" });
    }

    const newRating = await prisma.rating.create({
      data: {
        user_id,
        content_id,
        rating,
        comment,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Rating created successfully",
      data: newRating,
    });
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
    const { id } = req.params;
    const { rating } = req.body;
    const updated = await prisma.rating.update({
      where: { id },
      data: { rating },
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
      by: ['content_id'],
      _avg: {
        rating: true,
      },
      orderBy: {
        _avg: {
          rating: 'desc', 
        },
      },
      take: 3, 
      where: {
        created_at: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        },
      },
    });

    return res.status(200).json({
      success: true,
      data: topRatings,
    });
  } catch (error) {
    console.error('Error in topRatedContentThisWeek:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};
