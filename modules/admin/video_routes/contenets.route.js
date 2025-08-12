import express from 'express';
import { PrismaClient } from '@prisma/client';
import { verifyUser } from '../../../middlewares/verifyUsers.js';  // Assuming you are using it elsewhere
const prisma = new PrismaClient();
const r = express.Router();

const serialize = (data) =>
  JSON.parse(
    JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v))
  );

// Helper function to build the S3 URL
const buildS3Url = (bucket, key) => {
  if (!bucket || !key) return null;
  if (process.env.AWS_S3_ENDPOINT) {
    return `${process.env.AWS_S3_ENDPOINT}/${bucket}/${key}`;
  }
  const region = process.env.AWS_REGION || 'us-east-1';
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
};

// Helper function to build local file URL
const buildLocalUrl = (file) => {
  const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:4005';
  return file ? `${PUBLIC_BASE_URL}/uploads/${file}` : null;
};

// Route to get all contents
r.get('/allContents', async (req, res) => {
  try {
    const rows = await prisma.content.findMany({
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        title: true,
        genre: true,
        content_type: true,
        original_name: true,
        type: true,
        file_size_bytes: true,
        status: true,
        created_at: true,
        content_status: true,
        view_count: true,
        s3_bucket: true,
        s3_key: true,
        s3_thumb_key: true,
        video: true,
        thumbnail: true,
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const serializedRows = rows.map((row) => {
      // Construct full URLs for video and thumbnails depending on storage
      const videoUrl = buildS3Url(row.s3_bucket, row.s3_key) || buildLocalUrl(row.video);
      const thumbnailUrl = buildS3Url(row.s3_bucket, row.s3_thumb_key) || buildLocalUrl(row.thumbnail);

      return {
        ...serialize(row),
        videoUrl,
        thumbnailUrl,
      };
    });

    res.json(serializedRows);
  } catch (error) {
    console.log("Error fetching contents:", error);
    res.status(500).json({ error: "Failed to fetch contents" });
  }
});

r.get("/:id", async (req, res) => {
  const row = await prisma.content.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ error: "not found" });
  res.json(serialize(row));
});


// Route to get contents by category
r.get("/category/:id", async (req, res) => {
  const { id } = req.params;
  console.log("fetching contents for category:", id);
  try {
    const rows = await prisma.content.findMany({
      where: { category: { id: id } },
    });
    const serializedRows = rows.map((row) => {
      const videoUrl = buildS3Url(row.s3_bucket, row.s3_key) || buildLocalUrl(row.video);
      const thumbnailUrl = buildS3Url(row.s3_bucket, row.s3_thumb_key) || buildLocalUrl(row.thumbnail);
      return {
        ...serialize(row),
        videoUrl,
        thumbnailUrl,
      };
    });
    res.json(serializedRows);
  } catch (error) {
    console.log("Error fetching contents for category:", error);
    res.status(500).json({ error: "Failed to fetch contents for category" });
  }
});

r.get("/recommended", verifyUser("normal", "premium", "admin"), async (req, res) => {
  try {
    const userId = req.user.userId;
    // Get user's top genres from their ratings
    const topGenres = await prisma.rating.findMany({
      where: { user_id: userId },
      select: { content: { select: { genre: true } } },
    });
    const genreCounts = {};
    topGenres.forEach((r) => {
      if (r.content?.genre) {
        genreCounts[r.content.genre] = (genreCounts[r.content.genre] || 0) + 1;
      }
    });
    // Sort genres by frequency
    const sortedGenres = Object.keys(genreCounts).sort(
      (a, b) => genreCounts[b] - genreCounts[a]
    );
    // Recommend contents matching top genres, excluding already rated
    let recommended = [];
    if (sortedGenres.length > 0) {
      recommended = await prisma.content.findMany({
        where: {
          genre: { in: sortedGenres },
          Rating: { none: { user_id: userId } },
        },
        take: 10,
      });
    } else {
      // Fallback: recommend most viewed contents
      recommended = await prisma.content.findMany({
        orderBy: { view_count: "desc" },
        take: 10,
      });
    }
    res.json({ success: true, recommended });
  } catch (error) {
    console.error("Error in recommended:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

r.get('/popular', async (req, res) => {
  try {
    const popularContents = await prisma.content.findMany({
      orderBy: { view_count: 'desc' },
      take: 10,
      select: {
        id: true,
        title: true,
        genre: true,
        content_type: true,
        view_count: true,
        s3_bucket: true,
        s3_key: true,
        s3_thumb_key: true,
        video: true,
        thumbnail: true,
      },
    });

    const serializedContents = popularContents.map((content) => {
      const videoUrl = buildS3Url(content.s3_bucket, content.s3_key) || buildLocalUrl(content.video);
      const thumbnailUrl = buildS3Url(content.s3_bucket, content.s3_thumb_key) || buildLocalUrl(content.thumbnail);
      return {
        ...serialize(content),
        videoUrl,
        thumbnailUrl,
      };
    });

    res.json({ success: true, contents: serializedContents });
  } catch (error) {
    console.error("Error fetching popular contents:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

export default r;
