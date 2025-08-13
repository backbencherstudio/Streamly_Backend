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
      return res.status(404).json({ error: 'Content not exist or maybe deleted' });
    }

    const video = buildS3Url(row.s3_bucket, row.s3_key) || buildLocalUrl(row.video);
    const thumbnailUrl = buildS3Url(row.s3_bucket, row.s3_thumb_key) || buildLocalUrl(row.thumbnail);
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
    console.log('Error fetching content:', error);
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

r.get("/getoneWithcat/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Use findMany instead of findUnique to retrieve multiple contents
    const contents = await prisma.content.findMany({
      where: {
        category_id: id,  // category_id is not unique, so use findMany
      },
    });

    if (contents.length === 0) {
      return res.status(404).json({ message: `No content found for category ID ${id}` });
    }

    // Map through the contents and format them
    const formattedContents = contents.map((content) => {
      const videoUrl = buildS3Url(content.s3_bucket, content.s3_key) || buildLocalUrl(content.video);
      const thumbnailUrl = buildS3Url(content.s3_bucket, content.s3_thumb_key) || buildLocalUrl(content.thumbnail);
 
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
    console.error('Error fetching content by category ID:', error);
    res.status(500).json({ error: 'Failed to fetch content by category ID' });
  }
});



export default r;
