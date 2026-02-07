import express from "express";
import { PrismaClient } from "@prisma/client";
import { verifyUser } from "../../../middlewares/verifyUsers.js";

const prisma = new PrismaClient();
const r = express.Router();

const serialize = (data) =>
  JSON.parse(
    JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
  );

// Helper function to build the S3 URL
const buildS3Url = (bucket, key) => {
  if (!bucket || !key) return null;
  if (process.env.AWS_S3_ENDPOINT) {
    return `${process.env.AWS_S3_ENDPOINT}/${bucket}/${key}`;
  }
  const region = process.env.AWS_REGION || "us-east-1";
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
};

// Helper function to build local file URL
const buildLocalUrl = (file) => {
  const PUBLIC_BASE_URL = process.env.APP_URL || "http://localhost:4005";
  return file ? `${PUBLIC_BASE_URL}/uploads/${file}` : null;
};
// Route to get all contents (excluding soft-deleted)
r.get("/allContents", verifyUser("admin"), async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const takeRaw = parseInt(req.query.take || req.query.limit || "20", 10);
    const take = Math.min(Math.max(takeRaw || 20, 1), 100);
    const skip = (page - 1) * take;

    const [rows, total] = await Promise.all([
      prisma.content.findMany({
        where: { deleted_at: null },
        orderBy: { created_at: "desc" },
        skip,
        take,
        select: {
          id: true,
          title: true,
          description: true,
          genre: true,
          category: {
            select: { id: true, name: true },
          },
          content_type: true,
          content_status: true,
          quality: true,
          is_premium: true,
          file_size_bytes: true,
          duration_seconds: true,
          view_count: true,
          created_at: true,
          s3_bucket: true,
          s3_key: true,
          s3_thumb_key: true,
          video: true,
          thumbnail: true,
          series_id: true,
          season_number: true,
          episode_number: true,
          parent_series: {
            select: { id: true, title: true },
          },
        },
      }),

      prisma.content.count({
        where: { deleted_at: null },
      }),
    ]);

    const serializedRows = rows.map((row) => {
      const video =
        buildS3Url(row.s3_bucket, row.s3_key) || buildLocalUrl(row.video);
      const thumbnail =
        buildS3Url(row.s3_bucket, row.s3_thumb_key) ||
        buildLocalUrl(row.thumbnail);

      delete row.s3_bucket;
      delete row.s3_key;
      delete row.s3_thumb_key;
      delete row.video;

      return {
        ...serialize(row),
        video,
        thumbnail,
      };
    });

    // ✅ Set headers BEFORE response
    res.set("X-Total-Count", total);

    res.json({
      pagination: {
        page,
        take,
        total,
        totalPages: Math.ceil(total / take),
        hasNext: page * take < total,
        hasPrev: page > 1,
      },
      contents: serializedRows,
    });
  } catch (error) {
    console.error("Error fetching contents:", error);
    res.status(500).json({ error: "Failed to fetch contents" });
  }
});


r.get("/latestContents", async (req, res) => {
  try {
    const contents = await prisma.content.findMany({
      where: {
        deleted_at: null,
        content_type: { in: ["movie", "series", "episode"] },
        content_type: { in: ["movie", "series", "episode"] }, // Exclude trailers
      },
      orderBy: {
        created_at: "desc",
      },
      take: 6,
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const formattedContents = contents.map((content) => {
      const videoUrl =
        buildS3Url(content.s3_bucket, content.s3_key) ||
        buildLocalUrl(content.video);
      const thumbnailUrl =
        buildS3Url(content.s3_bucket, content.s3_thumb_key) ||
        buildLocalUrl(content.thumbnail);

      return {
        id: content.id,
        title: content.title,
        description: content.description,
        genre: content.genre,
        category: content.category,
        content_type: content.content_type,
        quality: content.quality,
        is_premium: content.is_premium,
        file_size_bytes: serialize(content.file_size_bytes),
        duration_seconds: content.duration_seconds,
        content_status: content.content_status,
        created_at: content.created_at,
        view_count: content.view_count,
        video: videoUrl,
        thumbnail: thumbnailUrl,
      };
    });

    res.json({ contents: formattedContents });
  } catch (error) {
    console.error("Error fetching latest contents:", error);
    res.status(500).json({ error: "Failed to fetch latest contents" });
  }
});

// Get content by ID
r.get("/:id", verifyUser("admin"), async (req, res) => {
  const { id } = req.params;
  try {
    const row = await prisma.content.findUnique({
      where: { id },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        parent_series: {
          select: {
            id: true,
            title: true,
          },
        },
        episodes: {
          where: { deleted_at: null },
          select: {
            id: true,
            title: true,
            season_number: true,
            episode_number: true,
            view_count: true,
            content_status: true,
            thumbnail: true,
            s3_bucket: true,
            s3_thumb_key: true,
          },
        },
        trailers: {
          where: { deleted_at: null },
          select: {
            id: true,
            title: true,
            content_status: true,
          },
        },
        Cast: {
          select: {
            id: true,
            name: true,
            role: true,
            photo: true,
          },
        },
      },
    });

    if (!row || row.deleted_at) {
      return res.status(404).json({ error: "Content not found or deleted" });
    }

    const video =
      buildS3Url(row.s3_bucket, row.s3_key) || buildLocalUrl(row.video);
    const thumbnail =
      buildS3Url(row.s3_bucket, row.s3_thumb_key) ||
      buildLocalUrl(row.thumbnail);

    const episodes = (row.episodes || []).map((episode) => {
      const episodeThumb =
        buildS3Url(episode.s3_bucket, episode.s3_thumb_key) ||
        buildLocalUrl(episode.thumbnail);
      return {
        id: episode.id,
        title: episode.title,
        season_number: episode.season_number,
        episode_number: episode.episode_number,
        view_count: episode.view_count,
        content_status: episode.content_status,
        thumbnail: episodeThumb,
      };
    });

    delete row.s3_bucket;
    delete row.s3_key;
    delete row.s3_thumb_key;
    delete row.video;
    delete row.thumbnail;
    delete row.episodes;

    res.json({
      ...serialize({ ...row, episodes }),
      video,
      thumbnail,
    });
  } catch (error) {
    console.log("Error fetching content:", error);
    res.status(500).json({ error: "Failed to fetch content" });
  }
});

// Updated content
r.patch("/:id/update", async (req, res) => {
  const { id } = req.params;
  const {
    title,
    description,
    genre,
    category_id,
    content_type,
    content_status,
    quality,
    is_premium,
    duration_seconds,
    series_id,
    season_number,
    episode_number,
    trailer_for_id,
    release_date,
  } = req.body;

  try {
    const existingContent = await prisma.content.findUnique({
      where: { id },
    });
    if (!existingContent) {
      return res.status(404).json({ error: "Content not found" });
    }

    const updatedContent = await prisma.content.update({
      where: { id },
      data: {
        title: title ?? existingContent.title,
        description: description ?? existingContent.description,
        genre: genre ?? existingContent.genre,
        category_id: category_id ?? existingContent.category_id,
        content_type: content_type ?? existingContent.content_type,
        content_status: content_status ?? existingContent.content_status,
        quality: quality ?? existingContent.quality,
        is_premium: is_premium ?? existingContent.is_premium,
        duration_seconds: duration_seconds ?? existingContent.duration_seconds,
        series_id: series_id ?? existingContent.series_id,
        season_number: season_number ?? existingContent.season_number,
        episode_number: episode_number ?? existingContent.episode_number,
        trailer_for_id: trailer_for_id ?? existingContent.trailer_for_id,
        release_date: release_date ?? existingContent.release_date,
      },
    });

    return res.json({
      message: "Content updated successfully",
      updatedContent,
    });
  } catch (error) {
    console.log("Error updating content:", error);
    res.status(500).json({ error: "Failed to update content" });
  }
});

// Get content by category
r.get("/getoneWithcat/:category", async (req, res) => {
  const { category } = req.params;

  try {
    const categoryData = await prisma.category.findFirst({
      where: {
        OR: [
          { slug: { equals: category.toLowerCase() } },
          { name: { equals: category, mode: "insensitive" } },
        ],
      },
    });

    if (!categoryData) {
      return res
        .status(404)
        .json({ message: `Category "${category}" not found` });
    }

    const contents = await prisma.content.findMany({
      where: {
        category_id: categoryData.id,
        deleted_at: null,
        content_type: { in: ["movie", "series", "episode"] },
      },
    });

    if (contents.length === 0) {
      return res
        .status(404)
        .json({ message: `No content found for category "${category}"` });
    }

    const formattedContents = contents.map((content) => {
      const videoUrl =
        buildS3Url(content.s3_bucket, content.s3_key) ||
        buildLocalUrl(content.video);
      const thumbnailUrl =
        buildS3Url(content.s3_bucket, content.s3_thumb_key) ||
        buildLocalUrl(content.thumbnail);

      return {
        id: content.id,
        title: content.title,
        description: content.description,
        genre: content.genre,
        category_id: content.category_id,
        content_type: content.content_type,
        quality: content.quality,
        is_premium: content.is_premium,
        file_size_bytes: serialize(content.file_size_bytes),
        duration_seconds: content.duration_seconds,
        content_status: content.content_status,
        view_count: content.view_count,
        created_at: content.created_at,
        video: videoUrl,
        thumbnail: thumbnailUrl,
      };
    });

    res.json({ contents: formattedContents });
  } catch (error) {
    console.error("Error fetching content by category:", error);
    res.status(500).json({ error: "Failed to fetch content by category" });
  }
});

// Get popular contents by category
r.get("/getPopularContents/:category", async (req, res) => {
  const { category } = req.params;

  try {
    const categoryData = await prisma.category.findFirst({
      where: {
        OR: [
          { slug: { equals: category.toLowerCase() } },
          { name: { equals: category, mode: "insensitive" } },
        ],
      },
    });

    if (!categoryData) {
      return res
        .status(404)
        .json({ message: `Category "${category}" not found` });
    }

    const ratings = await prisma.rating.findMany({
      where: {
        content: {
          category_id: categoryData.id,
          deleted_at: null,
          content_type: { in: ["movie", "series", "episode"] },
        },
      },
      select: {
        content_id: true,
        rating: true,
      },
      orderBy: {
        rating: "desc",
      },
    });

    if (ratings.length === 0) {
      return res
        .status(404)
        .json({ message: `No content found for category "${category}"` });
    }

    const contentIds = ratings.map((rating) => rating.content_id);

    const contents = await prisma.content.findMany({
      where: {
        id: { in: contentIds },
        deleted_at: null,
      },
    });

    const formattedContents = contents.map((content) => {
      const contentRating = ratings.find(
        (rating) => rating.content_id === content.id,
      ).rating;

      const videoUrl =
        buildS3Url(content.s3_bucket, content.s3_key) ||
        buildLocalUrl(content.video);
      const thumbnailUrl =
        buildS3Url(content.s3_bucket, content.s3_thumb_key) ||
        buildLocalUrl(content.thumbnail);

      return {
        id: content.id,
        title: content.title,
        description: content.description,
        genre: content.genre,
        category_id: content.category_id,
        content_type: content.content_type,
        quality: content.quality,
        is_premium: content.is_premium,
        file_size_bytes: serialize(content.file_size_bytes),
        duration_seconds: content.duration_seconds,
        content_status: content.content_status,
        view_count: content.view_count,
        created_at: content.created_at,
        rating: contentRating,
        video: videoUrl,
        thumbnail: thumbnailUrl,
      };
    });

    const sortedContents = formattedContents.sort(
      (a, b) => b.rating - a.rating,
    );

    res.json({ contents: sortedContents });
  } catch (error) {
    console.error("Error fetching content by category and rating:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch content by category and rating" });
  }
});

// Delete content (soft delete)
r.delete("/:id", verifyUser("admin"), async (req, res) => {
  const { id } = req.params;
  try {
    const content = await prisma.content.findUnique({
      where: { id },
    });

    if (!content) {
      return res
        .status(404)
        .json({ error: "Content not found or already deleted" });
    }

    // Soft delete: update deleted_at timestamp
    await prisma.content.update({
      where: { id },
      data: { deleted_at: new Date() },
    });

    res.json({ message: "Content deleted successfully" });
  } catch (error) {
    console.log("Error deleting content:", error);
    res.status(500).json({ error: "Failed to delete content" });
  }
});

export default r;
