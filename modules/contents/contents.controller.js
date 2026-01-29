import { PrismaClient } from "@prisma/client";
import { s3 } from "../libs/s3Clinent.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";
// NOTE: install @aws-sdk/s3-request-presigner if missing
// npm i @aws-sdk/s3-request-presigner
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const prisma = new PrismaClient();

const PUBLIC_BASE_URL = process.env.APP_URL || "http://localhost:4005";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const S3_BUCKET = process.env.AWS_S3_BUCKET;

const serialize = (data) =>
  JSON.parse(
    JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v))
  );

const buildS3Url = (bucket, key) => {
  if (!bucket || !key) return null;
  if (process.env.AWS_S3_ENDPOINT) {
    return `${process.env.AWS_S3_ENDPOINT}/${bucket}/${key}`;
  }
  return `https://${bucket}.s3.${AWS_REGION}.amazonaws.com/${key}`;
};

const buildLocalUrl = (file) => {
  return file ? `${PUBLIC_BASE_URL}/uploads/${file}` : null;
};

// Card for lists (no video URL to reduce payload; player fetches via watch/:id)
const toListCard = (content) => {
  const base = {
    id: content.id,
    title: content.title,
    description: content.description,
    genre: content.genre,
    content_type: content.content_type,
    quality: content.quality,
    is_premium: content.is_premium,
    view_count: content.view_count,
    duration_seconds: content.duration_seconds,
    created_at: content.created_at,
    content_status: content.content_status,
    category: content.category ? { id: content.category.id, name: content.category.name, slug: content.category.slug } : null,
  };
  return {
    ...serialize(base),
    thumbnail: buildS3Url(content.s3_bucket, content.s3_thumb_key) || buildLocalUrl(content.thumbnail),
    s3_bucket: content.s3_bucket,
    s3_key: content.s3_key,
    s3_thumb_key: content.s3_thumb_key,
    video: content.video,
  };
};

// Full card for watch (includes playable video URL)
const toWatchCard = (content) => {
  return {
    ...toListCard(content),
    video: buildS3Url(content.s3_bucket, content.s3_key) || buildLocalUrl(content.video),
  };
};

// Helpers to fetch related content
const fetchRelatedByCategory = async (categoryId, excludeId, take = 12) => {
  const rows = await prisma.content.findMany({
    where: { 
      category_id: categoryId, 
      content_status: "published", 
      deleted_at: null,
      id: { not: excludeId },
      content_type: { in: ["movie", "series", "episode"] },
    },
    orderBy: { view_count: "desc" },
    take,
    include: { category: true },
  });
  return rows.map(toListCard);
};

const fetchRelatedByGenre = async (genres, excludeId, take = 12) => {
  const rows = await prisma.content.findMany({
    where: { 
      content_status: "published", 
      deleted_at: null,
      id: { not: excludeId },
      content_type: { in: ["movie", "series", "episode"] },
      genre: {
        hasSome: Array.isArray(genres) ? genres : [genres],
      },
    },
    orderBy: { view_count: "desc" },
    take,
    include: { category: true },
  });
  return rows.map(toListCard);
};

const fetchTrailersInCategory = async (categoryId, take = 6) => {
  const rows = await prisma.content.findMany({
    where: {
      category_id: categoryId,
      content_status: "published",
      deleted_at: null,
      content_type: "trailer",
    },
    orderBy: { created_at: "desc" },
    take,
    include: { category: true },
  });
  return rows.map(toListCard);
};

// GET /api/contents/user/home
// Dynamically fetch popular content from top categories (by content count) with pagination
export const getHomeSections = async (req, res) => {
  try {
    const take = Number(req.query.take ?? 8);
    const page = Number(req.query.page ?? 1);
    const limit = 5; // number of categories to show as sections
    
    if (Number.isNaN(take) || take < 1 || take > 50) {
      return res.status(400).json({ message: "take must be 1-50" });
    }
    if (Number.isNaN(page) || page < 1) {
      return res.status(400).json({ message: "page must be >= 1" });
    }

    // Get top categories by content count (with published status and not deleted)
    const topCategories = await prisma.category.findMany({
      where: {
        contents: {
          some: {
            content_status: "published",
            deleted_at: null,
          }
        }
      },
      include: {
        _count: {
          select: { contents: true }
        }
      },
      orderBy: {
        contents: {
          _count: "desc"
        }
      },
      take: limit
    });

    if (topCategories.length === 0) {
      return res.json({ sections: {}, page, take, total: 0 });
    }

    const sections = {};

    // For each category, fetch popular content with pagination
    for (const category of topCategories) {
      try {
        const [ratings, totalCount] = await Promise.all([
          prisma.rating.findMany({
            where: {
              content: {
                category_id: category.id,
                content_status: "published",
                deleted_at: null,
              }
            },
            select: {
              content_id: true,
              rating: true
            },
            orderBy: {
              rating: "desc"
            },
            skip: (page - 1) * take,
            take
          }),
          prisma.rating.count({
            where: {
              content: {
                category_id: category.id,
                content_status: "published",
                deleted_at: null,
              }
            }
          })
        ]);

        if (ratings.length === 0) continue;

        const contentIds = ratings.map(r => r.content_id);
        const contents = await prisma.content.findMany({
          where: {
            id: { in: contentIds },
            content_status: "published",
            deleted_at: null,
          },
          include: { category: true }
        });

        const sectionKey = category.slug || category.name || `category-${category.id}`;
        sections[sectionKey] = {
          items: contents.map(toListCard),
          page,
          take,
          total: totalCount,
          totalPages: Math.ceil(totalCount / take)
        };
      } catch (categoryError) {
        console.error(`Error fetching popular content for category ${category.id}:`, categoryError);
        // Skip this category on error, continue with next
      }
    }

    return res.json({ sections, page, take });
  } catch (e) {
    console.error("getHomeSections error", e);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// GET /api/contents/user/recommended
export const getRecommendedForUser = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const take = Number(req.query.take ?? 20);
    const page = Number(req.query.page ?? 1);
    if (Number.isNaN(take) || take < 1 || take > 50) {
      return res.status(400).json({ message: "take must be 1-50" });
    }
    if (Number.isNaN(page) || page < 1) {
      return res.status(400).json({ message: "page must be >= 1" });
    }

    // Derive top genres from user's favourites and ratings
    const [favs, ratings] = await Promise.all([
      prisma.favourite.findMany({ where: { user_id: userId }, include: { content: true } }),
      prisma.rating.findMany({ where: { user_id: userId }, include: { content: true } }),
    ]);

    const genreCount = new Map();
    for (const f of favs) {
      const genres = f.content?.genre || [];
      for (const g of genres) {
        genreCount.set(g, (genreCount.get(g) || 0) + 2); // weight favourites
      }
    }
    for (const r of ratings) {
      const genres = r.content?.genre || [];
      for (const g of genres) {
        genreCount.set(g, (genreCount.get(g) || 0) + (r.rating || 0));
      }
    }

    const sorted = Array.from(genreCount.entries()).sort((a, b) => b[1] - a[1]);
    const topGenres = sorted.slice(0, 3).map(([g]) => g);

    const [contents, total] = await Promise.all([
      topGenres.length
        ? prisma.content.findMany({
            where: { 
              genre: { hasSome: topGenres },
              content_status: "published",
              deleted_at: null,
            },
            orderBy: { created_at: "desc" },
            skip: (page - 1) * take,
            take,
            include: { category: true },
          })
        : prisma.content.findMany({ 
            where: { 
              content_status: "published",
              deleted_at: null,
            },
            orderBy: { created_at: "desc" }, 
            skip: (page - 1) * take,
            take,
            include: { category: true } 
          }),
      topGenres.length
        ? prisma.content.count({
            where: { 
              genre: { hasSome: topGenres },
              content_status: "published",
              deleted_at: null,
            }
          })
        : prisma.content.count({
            where: { 
              content_status: "published",
              deleted_at: null,
            }
          })
    ]);

    return res.json({ 
      recommended: contents.map(toListCard), 
      basis: topGenres,
      page,
      take,
      total,
      totalPages: Math.ceil(total / take)
    });
  } catch (e) {
    console.error("getRecommendedForUser error", e);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// GET /api/contents/user/genre/:genre
// Fetch content by genre with pagination
export const getByGenre = async (req, res) => {
  try {
    const { genre } = req.params;
    if (!genre) return res.status(400).json({ message: "genre is required" });

    const take = Number(req.query.take ?? 20);
    const page = Number(req.query.page ?? 1);
    if (Number.isNaN(take) || take < 1 || take > 50) {
      return res.status(400).json({ message: "take must be 1-50" });
    }
    if (Number.isNaN(page) || page < 1) {
      return res.status(400).json({ message: "page must be >= 1" });
    }

    const [contents, total] = await Promise.all([
      prisma.content.findMany({
        where: { 
          genre: { has: genre.toLowerCase() },
          content_status: "published",
          deleted_at: null,
        },
        orderBy: { created_at: "desc" },
        skip: (page - 1) * take,
        take,
        include: { category: true },
      }),
      prisma.content.count({ 
        where: { 
          genre: { has: genre.toLowerCase() },
          content_status: "published",
          deleted_at: null,
        } 
      }),
    ]);

    return res.json({ 
      items: contents.map(toListCard), 
      page, 
      take,
      total,
      totalPages: Math.ceil(total / take)
    });
  } catch (e) {
    console.error("getByGenre error", e);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// GET /api/contents/user/details/:id
// Public content details with rating summary
export const getContentDetails = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: "id is required" });

    const row = await prisma.content.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        Rating: { select: { rating: true } },
      },
    });

    if (!row || row.content_status !== "published" || row.deleted_at) {
      return res.status(404).json({ message: "Content not found" });
    }

    const ratingCount = row.Rating?.length || 0;
    const avgRating =
      ratingCount > 0
        ? row.Rating.reduce((sum, r) => sum + (r.rating || 0), 0) / ratingCount
        : 0;

    const {
      s3_bucket,
      s3_key,
      s3_thumb_key,
      video,
      thumbnail,
      ...rest
    } = row;

    const [relatedByCategory, relatedByGenre, trailers] = await Promise.all([
      fetchRelatedByCategory(rest.category?.id, id, 12),
      rest.genre && rest.genre.length > 0 ? fetchRelatedByGenre(rest.genre, id, 12) : Promise.resolve([]),
      rest.category?.id ? fetchTrailersInCategory(rest.category.id, 6) : Promise.resolve([]),
    ]);

    return res.json({
      ...serialize(rest),
      rating: {
        average: parseFloat(avgRating.toFixed(2)),
        count: ratingCount,
      },
      video: buildS3Url(s3_bucket, s3_key) || buildLocalUrl(video),
      thumbnail: buildS3Url(s3_bucket, s3_thumb_key) || buildLocalUrl(thumbnail),
      related: {
        byCategory: relatedByCategory,
        byGenre: relatedByGenre,
        trailers,
      },
      cast: [],
    });
  } catch (e) {
    console.error("getContentDetails error", e);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// GET /api/contents/user/watch/:id
export const getContentToWatch = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: "id is required" });
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const row = await prisma.content.findUnique({
      where: { id },
      include: { category: true },
    });
    
    if (!row || row.content_status !== "published" || row.deleted_at) {
      return res.status(404).json({ message: "Content not found" });
    }

    // 24h unique view per user
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentView = await prisma.contentView.findFirst({
      where: {
        user_id: userId,
        content_id: id,
        viewed_at: { gte: since },
      },
    });

    if (!recentView) {
      await prisma.$transaction([
        prisma.contentView.create({ data: { user_id: userId, content_id: id } }),
        prisma.content.update({ where: { id }, data: { view_count: { increment: 1 } } }),
      ]);
    }

    // Build related for player UI:
    // If multiple items exist in same category, treat as episodes; else show similar by genre/category
    const [sameCategory] = await Promise.all([
      prisma.content.findMany({
        where: { 
          category_id: row.category_id, 
          content_status: "published",
          deleted_at: null,
        },
        orderBy: { created_at: "asc" },
        include: { category: true },
      }),
    ]);

    const episodes = sameCategory
      .filter(c => c.id !== id)
      .map(toListCard);

    let similar = [];
    if (episodes.length === 0) {
      // fall back to similar content by genre/category
      const [byCat, byGenre] = await Promise.all([
        fetchRelatedByCategory(row.category_id, id, 12),
        row.genre && row.genre.length > 0 ? fetchRelatedByGenre(row.genre, id, 12) : Promise.resolve([]),
      ]);
      // merge unique items
      const seen = new Set();
      similar = [...byCat, ...byGenre].filter(card => {
        if (seen.has(card.id)) return false;
        seen.add(card.id);
        return true;
      });
    }

    return res.json({
      ...toWatchCard(row),
      episodes,
      similar,
    });
  } catch (e) {
    console.error("getContentToWatch error", e);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// GET /api/contents/user/download/:id
// Requires premium users; returns short-lived signed URL for S3
export const getDownloadLink = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: "id is required" });

    const { role } = req.user || {};
    if (role !== "premium") {
      return res.status(403).json({ message: "Premium subscription required to download" });
    }

    const row = await prisma.content.findUnique({ 
      where: { id }, 
      select: { 
        s3_bucket: true, 
        s3_key: true, 
        video: true,
        is_premium: true,
      } 
    });
    
    if (!row) return res.status(404).json({ message: "Content not found" });
    
    // Check if content requires premium
    if (row.is_premium && role !== "premium") {
      return res.status(403).json({ message: "This content requires premium subscription" });
    }

    // Prefer S3 signed link; fallback to local static URL
    if (row.s3_bucket && row.s3_key && S3_BUCKET) {
      try {
        const cmd = new GetObjectCommand({ Bucket: row.s3_bucket, Key: row.s3_key });
        const url = await getSignedUrl(s3, cmd, { expiresIn: 60 * 10 }); // 10 minutes
        return res.json({ url, expiresIn: 600 });
      } catch (err) {
        console.error("signed URL error", err);
        // fallback public URL
        const publicUrl = buildS3Url(row.s3_bucket, row.s3_key);
        return res.json({ url: publicUrl, expiresIn: 0 });
      }
    }

    const localUrl = buildLocalUrl(row.video);
    if (!localUrl) return res.status(404).json({ message: "Download unavailable" });
    return res.json({ url: localUrl, expiresIn: 0 });
  } catch (e) {
    console.error("getDownloadLink error", e);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// GET /api/contents/user/popular-categories
// Returns top categories with metrics (content count, avg rating, etc) with pagination
export const getPopularCategories = async (req, res) => {
  try {
    const take = Number(req.query.take ?? 10);
    const page = Number(req.query.page ?? 1);
    if (Number.isNaN(take) || take < 1 || take > 50) {
      return res.status(400).json({ message: "take must be 1-50" });
    }
    if (Number.isNaN(page) || page < 1) {
      return res.status(400).json({ message: "page must be >= 1" });
    }

    const [categoriesWithMetrics, totalCount] = await Promise.all([
      prisma.category.findMany({
        where: {
          contents: {
            some: {
              content_status: "published",
              deleted_at: null,
            },
          },
        },
        include: {
          _count: {
            select: { contents: true },
          },
        },
        orderBy: {
          contents: {
            _count: "desc",
          },
        },
        skip: (page - 1) * take,
        take,
      }),
      prisma.category.count({
        where: {
          contents: {
            some: {
              content_status: "published",
              deleted_at: null,
            },
          },
        },
      })
    ]);

    const popularCategories = await Promise.all(
      categoriesWithMetrics.map(async (category) => {
        const contentInCategory = await prisma.content.findMany({
          where: {
            category_id: category.id,
            content_status: "published",
            deleted_at: null,
          },
          include: {
            Rating: {
              select: { rating: true },
            },
          },
        });

        const totalViews = contentInCategory.reduce(
          (sum, c) => sum + (c.view_count || 0),
          0
        );

        const avgRating =
          contentInCategory.length > 0
            ? contentInCategory.reduce((sum, c) => {
                const contentRatings = c.Rating || [];
                const contentAvgRating =
                  contentRatings.length > 0
                    ? contentRatings.reduce((rSum, r) => rSum + (r.rating || 0), 0) /
                      contentRatings.length
                    : 0;
                return sum + contentAvgRating;
              }, 0) / contentInCategory.length
            : 0;

        const totalContent = contentInCategory.length;
        const recentContent = contentInCategory.filter(
          (c) =>
            new Date(c.created_at) >
            new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        ).length;

        const popularityScore =
          totalContent * 10 +
          totalViews * 0.1 +
          avgRating * 100 +
          recentContent * 15;

        return {
          id: category.id,
          name: category.name,
          slug: category.slug,
          status: category.status,
          metrics: {
            total_content: totalContent,
            total_views: totalViews,
            avg_rating: parseFloat(avgRating.toFixed(2)),
            recent_content_30days: recentContent,
            popularity_score: parseFloat(popularityScore.toFixed(2)),
          },
          created_at: category.created_at,
          updated_at: category.updated_at,
        };
      })
    );

    popularCategories.sort(
      (a, b) => b.metrics.popularity_score - a.metrics.popularity_score
    );

    return res.status(200).json({
      success: true,
      data: popularCategories,
      page,
      take,
      total: totalCount,
      totalPages: Math.ceil(totalCount / take),
      count: popularCategories.length,
    });
  } catch (error) {
    console.error("Error fetching popular categories:", error);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};


// GET /api/contents/user/new-and-popular
// Returns newest content + most popular/highly-rated content with pagination
export const getNewAndPopular = async (req, res) => {
  try {
    const take = Number(req.query.take ?? 12);
    const page = Number(req.query.page ?? 1);
    if (Number.isNaN(take) || take < 1 || take > 50) {
      return res.status(400).json({ message: "take must be 1-50" });
    }
    if (Number.isNaN(page) || page < 1) {
      return res.status(400).json({ message: "page must be >= 1" });
    }

    // Get newest content with pagination
    const [newest, newestTotal] = await Promise.all([
      prisma.content.findMany({
        where: {
          content_status: "published",
          deleted_at: null,
          content_type: { in: ["movie", "series", "episode"] },
        },
        orderBy: { created_at: "desc" },
        skip: (page - 1) * take,
        take,
        include: { category: true },
      }),
      prisma.content.count({
        where: {
          content_status: "published",
          deleted_at: null,
          content_type: { in: ["movie", "series", "episode"] },
        }
      })
    ]);

    // Get most popular by rating with pagination
    const [ratings, ratingsTotal] = await Promise.all([
      prisma.rating.findMany({
        where: {
          content: {
            content_status: "published",
            deleted_at: null,
          },
        },
        select: {
          content_id: true,
          rating: true,
        },
        orderBy: { rating: "desc" },
        skip: (page - 1) * take,
        take,
      }),
      prisma.rating.groupBy({
        by: ["content_id"],
        where: {
          content: {
            content_status: "published",
            deleted_at: null,
          },
        },
      })
    ]);

    const popularIds = ratings.map((r) => r.content_id);
    const popular = await prisma.content.findMany({
      where: {
        id: { in: popularIds },
        content_status: "published",
        deleted_at: null,
      },
      include: { category: true },
    });

    return res.json({
      newest: {
        items: newest.map(toListCard),
        page,
        take,
        total: newestTotal,
        totalPages: Math.ceil(newestTotal / take)
      },
      popular: {
        items: popular.map(toListCard),
        page,
        take,
        total: ratingsTotal.length,
        totalPages: Math.ceil(ratingsTotal.length / take)
      }
    });
  } catch (e) {
    console.error("getNewAndPopular error", e);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// GET /api/contents/user/upcoming/by-category
// Returns upcoming content (movies, series, episodes, music_video) by category with pagination
// Optional query params: content_type (movie|series|episode|music_video), take, page, limit
export const getUpcomingByCategory = async (req, res) => {
  try {
    const take = Number(req.query.take ?? 12);
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 5); // number of categories to show
    const contentType = req.query.content_type; // optional filter: movie|series|episode|music_video

    if (Number.isNaN(take) || take < 1 || take > 50) {
      return res.status(400).json({ message: "take must be 1-50" });
    }
    if (Number.isNaN(page) || page < 1) {
      return res.status(400).json({ message: "page must be >= 1" });
    }

    const now = new Date();
    const validContentTypes = ["movie", "series", "episode", "music_video"]; // exclude trailer from upcoming

    // Validate content_type filter if provided
    if (contentType && !validContentTypes.includes(contentType)) {
      return res.status(400).json({ 
        message: `Invalid content_type. Valid options: ${validContentTypes.join(", ")}` 
      });
    }

    // Build content type filter
    const contentTypeFilter = contentType 
      ? contentType 
      : { in: validContentTypes };

    // Get categories with upcoming content
    const categoriesWithUpcoming = await prisma.category.findMany({
      where: {
        contents: {
          some: {
            content_status: "published",
            deleted_at: null,
            content_type: contentTypeFilter,
            release_date: {
              gte: now,
            },
          },
        },
      },
      include: {
        _count: {
          select: { contents: true },
        },
      },
      orderBy: {
        contents: {
          _count: "desc",
        },
      },
      take: limit,
    });

    if (categoriesWithUpcoming.length === 0) {
      return res.json({ 
        upcoming: {}, 
        page, 
        take, 
        message: "No upcoming content found",
        filter: contentType || "all types (movie, series, episode, music_video)"
      });
    }

    const upcoming = {};

    // For each category, fetch upcoming content with pagination
    for (const category of categoriesWithUpcoming) {
      try {
        const [upcomingInCategory, totalCount] = await Promise.all([
          prisma.content.findMany({
            where: {
              category_id: category.id,
              content_status: "published",
              deleted_at: null,
              content_type: contentTypeFilter,
              release_date: {
                gte: now,
              },
            },
            orderBy: { release_date: "asc" },
            skip: (page - 1) * take,
            take,
            include: { category: true },
          }),
          prisma.content.count({
            where: {
              category_id: category.id,
              content_status: "published",
              deleted_at: null,
              content_type: contentTypeFilter,
              release_date: {
                gte: now,
              },
            }
          })
        ]);

        if (upcomingInCategory.length > 0) {
          const sectionKey = category.slug || category.name || `category-${category.id}`;
          upcoming[sectionKey] = {
            items: upcomingInCategory.map((content) => ({
              ...toListCard(content),
              release_date: content.release_date,
              content_type: content.content_type,
            })),
            page,
            take,
            total: totalCount,
            totalPages: Math.ceil(totalCount / take),
            category_name: category.name,
          };
        }
      } catch (categoryError) {
        console.error(`Error fetching upcoming content for category ${category.id}:`, categoryError);
        // Skip this category on error, continue with next
      }
    }

    return res.json({ 
      upcoming, 
      page, 
      take,
      filter: contentType ? `Filtered by: ${contentType}` : "All types (movie, series, episode, music_video)"
    });
  } catch (e) {
    console.error("getUpcomingByCategory error", e);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// GET /api/contents/user/trending
// Returns trending content (high views + recent + ratings in last 7 days) with pagination
export const getTrendingContent = async (req, res) => {
  try {
    const take = Number(req.query.take ?? 20);
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 5); // number of categories to show
    if (Number.isNaN(take) || take < 1 || take > 50) {
      return res.status(400).json({ message: "take must be 1-50" });
    }
    if (Number.isNaN(page) || page < 1) {
      return res.status(400).json({ message: "page must be >= 1" });
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Get categories with recent content activity
    const trendingCategories = await prisma.category.findMany({
      where: {
        contents: {
          some: {
            created_at: { gte: sevenDaysAgo },
            content_status: "published",
            deleted_at: null,
          },
        },
      },
      take: limit,
    });

    const trends = {};

    for (const category of trendingCategories) {
      try {
        const [contentInCategory, totalCount] = await Promise.all([
          prisma.content.findMany({
            where: {
              category_id: category.id,
              content_status: "published",
              deleted_at: null,
            },
            include: {
              Rating: {
                where: {
                  created_at: { gte: sevenDaysAgo },
                },
                select: { rating: true },
              },
            },
            orderBy: { view_count: "desc" },
            skip: (page - 1) * take,
            take,
          }),
          prisma.content.count({
            where: {
              category_id: category.id,
              content_status: "published",
              deleted_at: null,
            }
          })
        ]);

        const withTrendScore = contentInCategory.map((c) => {
          const recentRatingAvg =
            c.Rating.length > 0
              ? c.Rating.reduce((sum, r) => sum + (r.rating || 0), 0) /
                c.Rating.length
              : 0;
          const trendScore = c.view_count * 0.5 + recentRatingAvg * 100;
          return {
            ...c,
            trend_score: parseFloat(trendScore.toFixed(2)),
          };
        });

        const sectionKey = category.slug || category.name || `category-${category.id}`;
        trends[sectionKey] = {
          items: withTrendScore.map((c) => {
            const { Rating, ...rest } = c;
            return {
              ...toListCard(rest),
              trend_score: c.trend_score,
            };
          }),
          page,
          take,
          total: totalCount,
          totalPages: Math.ceil(totalCount / take)
        };
      } catch (err) {
        console.error(`Error fetching trending for category ${category.id}:`, err);
      }
    }

    return res.json({ trending: trends, page, take });
  } catch (e) {
    console.error("getTrendingContent error", e);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// GET /api/contents/user/search
// Full-text search with advanced filters (category, genres, year, keywords, top_rated)
// Query params: q (search query), category, genres, year, top_rated, take, page
export const searchContent = async (req, res) => {
  try {
    const q = req.query.q || ""; // search keywords
    const category = req.query.category; // category slug or id
    const genres = req.query.genres ? String(req.query.genres).split(",") : []; // comma-separated genres
    const year = req.query.year ? Number(req.query.year) : null; // release year
    const topRated = req.query.top_rated === "true"; // sort by rating
    const take = Number(req.query.take ?? 20);
    const page = Number(req.query.page ?? 1);

    // Validation
    if (Number.isNaN(take) || take < 1 || take > 100) {
      return res.status(400).json({ message: "take must be 1-100" });
    }
    if (Number.isNaN(page) || page < 1) {
      return res.status(400).json({ message: "page must be >= 1" });
    }

    // Build where clause
    const where = {
      content_status: "published",
      deleted_at: null,
      content_type: { in: ["movie", "series", "episode", "music_video"] }, // exclude trailers
    };

    // Search query (title or description)
    if (q.trim()) {
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }

    // Category filter
    if (category) {
      const categoryRecord = await prisma.category.findFirst({
        where: {
          OR: [
            { slug: { equals: category, mode: "insensitive" } },
            { id: category },
            { name: { equals: category, mode: "insensitive" } },
          ],
        },
      });
      if (categoryRecord) {
        where.category_id = categoryRecord.id;
      }
    }

    // Genre filter (intersection of all specified genres)
    if (genres.length > 0) {
      where.genre = {
        hasSome: genres.map((g) => g.trim()),
      };
    }

    // Year filter (based on release_date)
    if (year) {
      const startOfYear = new Date(year, 0, 1);
      const endOfYear = new Date(year + 1, 0, 1);
      where.release_date = {
        gte: startOfYear,
        lt: endOfYear,
      };
    }

    // Fetch results with optional sorting
    const orderBy = topRated 
      ? { Rating: { _avg: "rating" } } 
      : { created_at: "desc" };

    const [results, total] = await Promise.all([
      prisma.content.findMany({
        where,
        orderBy,
        skip: (page - 1) * take,
        take,
        include: {
          category: true,
          Rating: topRated ? { select: { rating: true } } : false,
        },
      }),
      prisma.content.count({ where }),
    ]);

    // Calculate average rating for each result if needed
    const resultsWithRating = results.map((content) => {
      const card = toListCard(content);
      if (topRated && content.Rating && content.Rating.length > 0) {
        const avgRating = 
          content.Rating.reduce((sum, r) => sum + r.rating, 0) / content.Rating.length;
        return { ...card, avg_rating: parseFloat(avgRating.toFixed(2)) };
      }
      return card;
    });

    return res.json({
      results: resultsWithRating,
      query: q,
      filters: {
        category: category || null,
        genres: genres.length > 0 ? genres : null,
        year: year || null,
        top_rated: topRated,
      },
      page,
      take,
      total,
      totalPages: Math.ceil(total / take),
    });
  } catch (e) {
    console.error("searchContent error", e);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// GET /api/contents/user/search/filters
// Returns available filter options (categories, genres, years) for advanced search UI
export const getSearchFilters = async (req, res) => {
  try {
    // Get all published categories with content count
    const categories = await prisma.category.findMany({
      where: {
        contents: {
          some: {
            content_status: "published",
            deleted_at: null,
            content_type: { in: ["movie", "series", "episode", "music_video"] },
          },
        },
      },
      include: {
        _count: {
          select: { contents: true },
        },
      },
      orderBy: { name: "asc" },
    });

    // Get all available genres from schema (dynamically)
    const genrePattern = /enum Genra\s*\{([^}]+)\}/;
    const fs = await import("fs");
    const schemaPath = new URL("../../../prisma/schema.prisma", import.meta.url);
    const schemaContent = fs.readFileSync(schemaPath, "utf-8");
    const match = schemaContent.match(genrePattern);
    const availableGenres = match
      ? match[1]
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith("//"))
      : [];

    // Get available years from content release_dates
    const yearsResult = await prisma.content.findMany({
      where: {
        content_status: "published",
        deleted_at: null,
        release_date: { not: null },
      },
      select: { release_date: true },
      distinct: ["release_date"],
    });

    const years = [...new Set(yearsResult.map((c) => c.release_date?.getFullYear()).filter(Boolean))]
      .sort((a, b) => b - a);

    return res.json({
      categories: categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        content_count: cat._count.contents,
      })),
      genres: availableGenres,
      years,
    });
  } catch (e) {
    console.error("getSearchFilters error", e);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// GET /api/contents/user/browse/category/:slug
// Browse all content in a specific category with sub-filtering
export const browseCategory = async (req, res) => {
  try {
    const { slug } = req.params;
    const take = Number(req.query.take ?? 16);
    const page = Number(req.query.page ?? 1);
    const contentType = req.query.content_type; // optional: movie|series|episode|music_video

    if (Number.isNaN(take) || take < 1 || take > 100) {
      return res.status(400).json({ message: "take must be 1-100" });
    }
    if (Number.isNaN(page) || page < 1) {
      return res.status(400).json({ message: "page must be >= 1" });
    }

    // Find category
    const category = await prisma.category.findFirst({
      where: { slug: { equals: slug, mode: "insensitive" } },
    });

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Build where clause
    const where = {
      category_id: category.id,
      content_status: "published",
      deleted_at: null,
      content_type: contentType
        ? contentType
        : { in: ["movie", "series", "episode", "music_video"] },
    };

    const [contents, total] = await Promise.all([
      prisma.content.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: (page - 1) * take,
        take,
        include: { category: true },
      }),
      prisma.content.count({ where }),
    ]);

    // Group by content type for better organization
    const grouped = {
      movies: contents.filter((c) => c.content_type === "movie"),
      series: contents.filter((c) => c.content_type === "series"),
      episodes: contents.filter((c) => c.content_type === "episode"),
      music_videos: contents.filter((c) => c.content_type === "music_video"),
    };

    return res.json({
      category: {
        id: category.id,
        name: category.name,
        slug: category.slug,
      },
      grouped: {
        movies: grouped.movies.map(toListCard),
        series: grouped.series.map(toListCard),
        episodes: grouped.episodes.map(toListCard),
        music_videos: grouped.music_videos.map(toListCard),
      },
      all_items: contents.map(toListCard),
      page,
      take,
      total,
      totalPages: Math.ceil(total / take),
      content_type_filter: contentType || "all",
    });
  } catch (e) {
    console.error("browseCategory error", e);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// GET /api/contents/user/search/suggestions
// Returns search suggestions based on partial query
export const getSearchSuggestions = async (req, res) => {
  try {
    const q = req.query.q || "";

    if (!q.trim() || q.length < 2) {
      return res.json({ suggestions: [] });
    }

    const results = await prisma.content.findMany({
      where: {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
        content_status: "published",
        deleted_at: null,
        content_type: { in: ["movie", "series", "episode", "music_video"] },
      },
      select: {
        id: true,
        title: true,
        content_type: true,
      },
      take: 10,
      orderBy: { view_count: "desc" },
    });

    return res.json({
      suggestions: results.map((r) => ({
        id: r.id,
        title: r.title,
        type: r.content_type,
      })),
    });
  } catch (e) {
    console.error("getSearchSuggestions error", e);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};