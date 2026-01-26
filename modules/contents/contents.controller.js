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
    genre: content.genre,
    type: content.type,
    view_count: content.view_count,
    created_at: content.created_at,
    status: content.status,
    content_status: content.content_status,
    category: content.category ? { id: content.category.id, name: content.category.name } : null,
  };
  return {
    ...serialize(base),
    // keep thumbnail URL for UI convenience
    thumbnail: buildS3Url(content.s3_bucket, content.s3_thumb_key) || buildLocalUrl(content.thumbnail),
    // expose raw storage fields so frontend can build video URL client-side
    s3_bucket: content.s3_bucket,
    s3_key: content.s3_key,
    s3_thumb_key: content.s3_thumb_key,
    video: content.video, // local filename/path if stored locally
  };
};

// Full card for watch (includes playable video URL)
const toWatchCard = (content) => {
  return {
    ...toListCard(content),
    video: buildS3Url(content.s3_bucket, content.s3_key) || buildLocalUrl(content.video),
  };
};

// GET /api/contents/user/home
// Dynamically fetch popular content from top categories (by content count)
export const getHomeSections = async (req, res) => {
  try {
    const take = Number(req.query.take ?? 8);
    const limit = 5; // number of categories to show as sections
    
    if (Number.isNaN(take) || take < 1 || take > 50) {
      return res.status(400).json({ message: "take must be 1-50" });
    }

    // Get top categories by content count (with published status)
    const topCategories = await prisma.category.findMany({
      where: {
        contents: {
          some: {
            status: "published"
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
      return res.json({ sections: {} });
    }

    const sections = {};

    // For each category, fetch popular content (sorted by highest rating)
    for (const category of topCategories) {
      try {
        const ratings = await prisma.rating.findMany({
          where: {
            content: {
              category_id: category.id,
              status: "published"
            }
          },
          select: {
            content_id: true,
            rating: true
          },
          orderBy: {
            rating: "desc"
          },
          take: take
        });

        if (ratings.length === 0) continue;

        const contentIds = ratings.map(r => r.content_id);
        const contents = await prisma.content.findMany({
          where: {
            id: { in: contentIds },
            status: "published"
          },
          include: { category: true }
        });

        const sectionKey = category.slug || category.name || `category-${category.id}`;
        sections[sectionKey] = contents.map(toListCard);
      } catch (categoryError) {
        console.error(`Error fetching popular content for category ${category.id}:`, categoryError);
        // Skip this category on error, continue with next
      }
    }

    return res.json({ sections });
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

    // Derive top genres from user's favourites and ratings
    const [favs, ratings] = await Promise.all([
      prisma.favourite.findMany({ where: { user_id: userId }, include: { content: true } }),
      prisma.rating.findMany({ where: { user_id: userId }, include: { content: true } }),
    ]);

    const genreCount = new Map();
    for (const f of favs) {
      const g = f.content?.genre;
      if (g) genreCount.set(g, (genreCount.get(g) || 0) + 2); // weight favourites
    }
    for (const r of ratings) {
      const g = r.content?.genre;
      if (g) genreCount.set(g, (genreCount.get(g) || 0) + (r.rating || 0));
    }

    const sorted = Array.from(genreCount.entries()).sort((a, b) => b[1] - a[1]);
    const topGenres = sorted.slice(0, 3).map(([g]) => g);

    let contents = [];
    if (topGenres.length) {
      contents = await prisma.content.findMany({
        where: { genre: { in: topGenres } },
        orderBy: { created_at: "desc" },
        take: 24,
        include: { category: true },
      });
    } else {
      contents = await prisma.content.findMany({ orderBy: { created_at: "desc" }, take: 24, include: { category: true } });
    }

    return res.json({ recommended: contents.map(toListCard), basis: topGenres });
  } catch (e) {
    console.error("getRecommendedForUser error", e);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// GET /api/contents/user/genre/:genre
// NOTE: Reuses /api/admin/categories/getContentsByGenre/:genre logic with pagination
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
        where: { genre, status: "published" },
        orderBy: { created_at: "desc" },
        skip: (page - 1) * take,
        take,
        include: { category: true },
      }),
      prisma.content.count({ where: { genre, status: "published" } }),
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

    if (!row || row.status !== "published") {
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

    return res.json({
      ...serialize(rest),
      rating: {
        average: parseFloat(avgRating.toFixed(2)),
        count: ratingCount,
      },
      video: buildS3Url(s3_bucket, s3_key) || buildLocalUrl(video),
      thumbnail: buildS3Url(s3_bucket, s3_thumb_key) || buildLocalUrl(thumbnail),
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
    if (!row) return res.status(404).json({ message: "Content not found" });

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

    return res.json(toWatchCard(row));
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

    const row = await prisma.content.findUnique({ where: { id }, select: { s3_bucket: true, s3_key: true, video: true } });
    if (!row) return res.status(404).json({ message: "Content not found" });

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
