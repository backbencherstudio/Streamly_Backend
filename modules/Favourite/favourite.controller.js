import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PUBLIC_BASE_URL = process.env.APP_URL || "http://localhost:4005";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";

// Helper: Serialize BigInt to String
const serialize = (data) =>
  JSON.parse(
    JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v))
  );

// Helper: Build S3 URL
const buildS3Url = (bucket, key) => {
  if (!bucket || !key) return null;
  if (process.env.AWS_S3_ENDPOINT) {
    return `${process.env.AWS_S3_ENDPOINT}/${bucket}/${key}`;
  }
  return `https://${bucket}.s3.${AWS_REGION}.amazonaws.com/${key}`;
};

// Helper: Build Local URL
const buildLocalUrl = (file) => {
  return file ? `${PUBLIC_BASE_URL}/uploads/${file}` : null;
};

// Helper: Format favourite item for response
const toFavouriteCard = (favourite) => {
  const content = favourite.content;
  
  return serialize({
    id: favourite.id,
    created_at: favourite.created_at,
    content_id: content.id,
    title: content.title,
    description: content.description,
    content_type: content.content_type,
    genre: content.genre,
    quality: content.quality,
    is_premium: content.is_premium,
    view_count: content.view_count,
    duration_seconds: content.duration_seconds,
    release_date: content.release_date,
    thumbnail: buildS3Url(content.s3_bucket, content.s3_thumb_key) || buildLocalUrl(content.thumbnail),
    category: favourite.category ? {
      id: favourite.category.id,
      name: favourite.category.name,
      slug: favourite.category.slug,
    } : null,
    avg_rating: content.Rating && content.Rating.length > 0
      ? parseFloat((content.Rating.reduce((sum, r) => sum + r.rating, 0) / content.Rating.length).toFixed(2))
      : null,
  });
};

// GET /api/favourites
// Get all favourites with pagination and filters
export const getFavourites = async (req, res) => {
  try {
    const { userId } = req.user;
    const { 
      page = 1, 
      take = 20, 
      category, 
      content_type 
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const takeNum = Math.min(100, Math.max(1, parseInt(take)));
    const skip = (pageNum - 1) * takeNum;

    // Build where clause
    const where = { user_id: userId };

    // Filter by category (slug or ID)
    if (category) {
      const categoryRecord = await prisma.category.findFirst({
        where: {
          OR: [
            { slug: category },
            { id: category },
          ],
        },
      });
      
      if (categoryRecord) {
        where.category_id = categoryRecord.id;
      }
    }

    // Filter by content type
    if (content_type) {
      where.content = {
        content_type,
        content_status: "published",
        deleted_at: null,
      };
    } else {
      where.content = {
        content_status: "published",
        deleted_at: null,
      };
    }

    // Get total count
    const total = await prisma.favourite.count({ where });

    // Get favourites
    const favourites = await prisma.favourite.findMany({
      where,
      skip,
      take: takeNum,
      orderBy: { created_at: "desc" },
      include: {
        content: {
          include: {
            category: true,
            Rating: true,
          },
        },
        category: true,
      },
    });

    const formattedFavourites = favourites.map(toFavouriteCard);

    res.status(200).json({
      success: true,
      favourites: formattedFavourites,
      pagination: {
        page: pageNum,
        take: takeNum,
        total,
        totalPages: Math.ceil(total / takeNum),
      },
    });
  } catch (error) {
    console.error("Error fetching favourites:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch favourites",
      error: error.message,
    });
  }
};

// POST /api/favourites/toggle
// Toggle favourite (add if not exists, remove if exists)
export const toggleFavourite = async (req, res) => {
  try {
    const { userId } = req.user;
    const { content_id } = req.body;

    if (!content_id) {
      return res.status(400).json({
        success: false,
        message: "content_id is required",
      });
    }

    // Check if already in favourites
    const existingFavourite = await prisma.favourite.findUnique({
      where: {
        user_id_content_id: {
          user_id: userId,
          content_id: content_id,
        },
      },
    });

    if (existingFavourite) {
      // Remove from favourites
      await prisma.favourite.delete({
        where: {
          user_id_content_id: {
            user_id: userId,
            content_id: content_id,
          },
        },
      });

      return res.status(200).json({
        success: true,
        action: "removed",
        message: "Removed from favourites",
        is_favourite: false,
      });
    }

    // Add to favourites
    // First, check if content exists and is published
    const content = await prisma.content.findFirst({
      where: {
        id: content_id,
        content_status: "published",
        deleted_at: null,
      },
      include: {
        category: true,
        Rating: true,
      },
    });

    if (!content) {
      return res.status(404).json({
        success: false,
        message: "Content not found or not available",
      });
    }

    // Create favourite
    const favourite = await prisma.favourite.create({
      data: {
        user_id: userId,
        content_id: content_id,
        category_id: content.category_id,
        title: content.title,
        thumbnail: content.thumbnail,
        description: content.description,
      },
      include: {
        content: {
          include: {
            category: true,
            Rating: true,
          },
        },
        category: true,
      },
    });

    res.status(201).json({
      success: true,
      action: "added",
      message: "Added to favourites",
      is_favourite: true,
      favourite: toFavouriteCard(favourite),
    });
  } catch (error) {
    console.error("Error toggling favourite:", error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle favourite",
      error: error.message,
    });
  }
};
