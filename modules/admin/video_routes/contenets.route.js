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
r.get('/allContents',verifyUser("admin"), async (req, res) => {
  try {
    const rows = await prisma.content.findMany({
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        title: true,
        genre: true,
        category: {
          select: {
            name: true,
          },
        },
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

    const serializedRows = rows.map((row) => {
      // Construct full URLs for video and thumbnails depending on storage
      const video = buildS3Url(row.s3_bucket, row.s3_key) || buildLocalUrl(row.video);
      const thumbnailUrl = buildS3Url(row.s3_bucket, row.s3_thumb_key) || buildLocalUrl(row.thumbnail);
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
r.get('/:id', verifyUser("admin"), async (req, res) => {
  const { id } = req.params;  // Getting the ID from the URL parameter
  try {
    const row = await prisma.content.findUnique({
      where: { id: id },  // Directly use the string `id` here
      select: {
        id: true,
        title: true,
        genre: true,
        category: {
          select: {
            name: true,
          },
        },
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
      return res.status(404).json({ error: 'Content not exist or maybe deleted' });
    }

    // Construct full URLs for video and thumbnails depending on storage
    const video = buildS3Url(row.s3_bucket, row.s3_key) || buildLocalUrl(row.video);
    const thumbnailUrl = buildS3Url(row.s3_bucket, row.s3_thumb_key) || buildLocalUrl(row.thumbnail);
    const thumbnail = thumbnailUrl ? thumbnailUrl : null;

    // Deleting unwanted fields from the response
    delete row.s3_bucket;
    delete row.s3_key;
    delete row.s3_thumb_key;
    delete row.video;

    // Respond with the serialized content
    res.json({
      ...serialize(row),
      video,
      thumbnail,
    });
  } catch (error) {
    console.log('Error fetching content:', error);
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

export default r;
