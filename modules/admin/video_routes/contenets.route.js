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
    process.env.PUBLIC_BASE_URL || "http://localhost:4005";
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

// Route to get content by ID
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

r.get("/getoneWithcat/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Use findMany instead of findUnique to retrieve multiple contents
    const contents = await prisma.content.findMany({
      where: {
        category_id: id, // category_id is not unique, so use findMany
      },
    });

    if (contents.length === 0) {
      return res
        .status(404)
        .json({ message: `No content found for category ID ${id}` });
    }

    // Map through the contents and format them
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
    console.error("Error fetching content by category ID:", error);
    res.status(500).json({ error: "Failed to fetch content by category ID" });
  }
});

// Get popular category contents with exact ratings, sorted by highest to lowest rating
r.get("/getPopularContents/:categoryId", async (req, res) => {
  const { categoryId } = req.params;

  try {
    // Step 1: Get all ratings for the content in the specified category
    const ratings = await prisma.rating.findMany({
      where: {
        content: {
          category_id: categoryId, // Filter ratings by category_id
        },
      },
      select: {
        content_id: true, // Only fetch content_id and rating
        rating: true,
      },
      orderBy: {
        rating: "desc", // Sort by rating in descending order (highest first)
      },
    });

    // If no ratings are found for the given category, return a 404 response
    if (ratings.length === 0) {
      return res
        .status(404)
        .json({ message: `No content found for category ID ${categoryId}` });
    }

    // Step 2: Fetch content details based on the ratings we obtained
    const contentIds = ratings.map((rating) => rating.content_id); // Extract content_ids from ratings

    // Fetch the content details for the given content_ids
    const contents = await prisma.content.findMany({
      where: {
        id: { in: contentIds }, // Get content details for the content_ids
      },
    });

    // Step 3: Map through the content and attach the exact rating to each content
    const formattedContents = contents.map((content) => {
      const rating = ratings.find(
        (rating) => rating.content_id === content.id
      ).rating; // Get the exact rating for the content

      const videoUrl =
        buildS3Url(content.s3_bucket, content.s3_key) ||
        buildLocalUrl(content.video);
      const thumbnailUrl =
        buildS3Url(content.s3_bucket, content.s3_thumb_key) ||
        buildLocalUrl(content.thumbnail);

      // Clean up the content object by removing unnecessary fields
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
        ...serialize(content), // Serialize the content object
        video: videoUrl,
        thumbnail: thumbnailUrl || null, // Ensure thumbnail is null if not available
        rating, // Attach the exact rating to the content
      };
    });

    // Step 4: Sort the formatted contents based on rating in descending order
    const sortedContents = formattedContents.sort(
      (a, b) => b.rating - a.rating
    );

    // Return the formatted contents sorted by exact rating (highest first)
    res.json({ contents: sortedContents });
  } catch (error) {
    console.error("Error fetching content by category and rating:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch content by category and rating" });
  }
});

export default r;
