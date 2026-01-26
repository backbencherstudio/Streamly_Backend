import express from "express";
import { PrismaClient } from "@prisma/client";
import { verifyUser } from "../../../middlewares/verifyUsers.js"; // Assuming you are using it elsewhere
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
  const region = process.env.AWS_REGION || "us-east-1";
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
};
// Helper function to build local file URL
const buildLocalUrl = (file) => {
  const PUBLIC_BASE_URL =
    process.env.APP_URL || "http://localhost:4005";
  return file ? `${PUBLIC_BASE_URL}/uploads/${file}` : null;
};
// Route to get all contents
r.get("/allContents", verifyUser("admin"), async (req, res) => {
  try {
    const rows = await prisma.content.findMany({
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        title: true,
        genre: true,
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        type: true,
        file_size_bytes: true,
        status: true,
        category_id: true,
        content_status: true,
        created_at: true,
        view_count: true,
        s3_bucket: true,
        s3_key: true,
        s3_thumb_key: true,
        video: true,
      },
    });

    const serializedRows = rows.map((row) => {
      const video =
        buildS3Url(row.s3_bucket, row.s3_key) || buildLocalUrl(row.video);
      const thumbnailUrl =
        buildS3Url(row.s3_bucket, row.s3_thumb_key) ||
        buildLocalUrl(row.thumbnail);
      const thumbnail = thumbnailUrl ? thumbnailUrl : null;

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

    res.json(serializedRows);
  } catch (error) {
    console.log("Error fetching contents:", error);
    res.status(500).json({ error: "Failed to fetch contents" });
  }
});

//--------------------latest contents-------------------
r.get("/latestContents", async (req, res) => {
  try {
    const contents = await prisma.content.findMany({
      orderBy: {
        created_at: "desc",
      },
      take: 4, 
      include: {
        category: {
          select: {
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
        genre: content.genre,
        category: {
          name: content.category.name,
        },
        type: content.type,
        file_size_bytes: content.file_size_bytes,
        status: content.status,
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

r.get("/:id", verifyUser("admin"), async (req, res) => {
  const { id } = req.params;
  try {
    const row = await prisma.content.findUnique({
      where: { id: id },
      select: {
        id: true,
        title: true,
        genre: true,
        category_id: true,
        type: true,
        file_size_bytes: true,
        status: true,
        content_status: true,
        created_at: true,
        view_count: true,
        s3_bucket: true,
        s3_key: true,
        s3_thumb_key: true,
        video: true,
      },
    });

    if (!row) {
      return res
        .status(404)
        .json({ error: "Content not exist or maybe deleted" });
    }

    const video =
      buildS3Url(row.s3_bucket, row.s3_key) || buildLocalUrl(row.video);
    const thumbnailUrl =
      buildS3Url(row.s3_bucket, row.s3_thumb_key) ||
      buildLocalUrl(row.thumbnail);
    const thumbnail = thumbnailUrl ? thumbnailUrl : null;

    delete row.s3_bucket;
    delete row.s3_key;
    delete row.s3_thumb_key;
    delete row.video;

    res.json({
      ...serialize(row),
      video,
      thumbnail,
    });
  } catch (error) {
    console.log("Error fetching content:", error);
    res.status(500).json({ error: "Failed to fetch content" });
  }
});

r.get("/getoneWithcat/:category", async (req, res) => {
  const { category } = req.params;

  try {
    // Find category by slug or name (case-insensitive)
    const categoryData = await prisma.category.findFirst({
      where: {
        OR: [
          { slug: { equals: category.toLowerCase() } },
          { name: { equals: category, mode: 'insensitive' } },
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

      delete content.s3_bucket;
      delete content.s3_key;
      delete content.s3_thumb_key;
      delete content.video;
      delete content.duration;
      delete content.storage_provider;
      delete content.original_name;
      delete content.checksum_sha256;
      delete content.content_type;

      return {
        ...serialize(content),
        video: videoUrl,
        thumbnail: thumbnailUrl ? thumbnailUrl : null,
      };
    });

    res.json({ contents: formattedContents });
  } catch (error) {
    console.error("Error fetching content by category:", error);
    res.status(500).json({ error: "Failed to fetch content by category" });
  }
});


//--------------------getting popular contents by category-------------------
r.get("/getPopularContents/:category", async (req, res) => {
  const { category } = req.params;

  try {
    // Find category by slug or name (case-insensitive)
    const categoryData = await prisma.category.findFirst({
      where: {
        OR: [
          { slug: { equals: category.toLowerCase() } },
          { name: { equals: category, mode: 'insensitive' } },
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
      },
    });

    const formattedContents = contents.map((content) => {
      const rating = ratings.find(
        (rating) => rating.content_id === content.id
      ).rating; 

      const videoUrl =
        buildS3Url(content.s3_bucket, content.s3_key) ||
        buildLocalUrl(content.video);
      const thumbnailUrl =
        buildS3Url(content.s3_bucket, content.s3_thumb_key) ||
        buildLocalUrl(content.thumbnail);

      delete content.s3_bucket;
      delete content.s3_key;
      delete content.s3_thumb_key;
      delete content.video;
      delete content.duration;
      delete content.storage_provider;
      delete content.original_name;
      delete content.checksum_sha256;
      delete content.content_type;

      return {
        ...serialize(content), 
        video: videoUrl,
        thumbnail: thumbnailUrl || null,
        rating, 
      };
    });

    const sortedContents = formattedContents.sort(
      (a, b) => b.rating - a.rating
    );

    res.json({ contents: sortedContents });
  } catch (error) {
    console.error("Error fetching content by category and rating:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch content by category and rating" });
  }
});


r.delete("/:id", verifyUser("admin"), async (req, res) => {
  const { id } = req.params;
  try {
    const content = await prisma.content.findUnique({
      where: { id: id },
    });

    if (!content) {
      return res
        .status(404)
        .json({ error: "Content not exist or maybe deleted" });
    }

    await prisma.content.delete({
      where: { id: id },
    });

    res.json({ message: "Content deleted successfully" });
  } catch (error) {
    console.log("Error deleting content:", error);
    res.status(500).json({ error: "Failed to delete content" });
  }
});



export default r;
