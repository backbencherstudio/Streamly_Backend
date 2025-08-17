import express from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const route = express.Router();
const buildS3Url = (bucket, key) => {
  if (!bucket || !key) return null;
  if (process.env.AWS_S3_ENDPOINT) {
    return `${process.env.AWS_S3_ENDPOINT}/${bucket}/${key}`;
  }
  const region = process.env.AWS_REGION || "us-east-1";
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
};
const buildLocalUrl = (filePath) => {
  if (!filePath) return null;
  return `http://localhost:9000/${filePath}`;
};

export const createService = async (req, res) => {
  try {
    const { name, description, price, features, plan } = req.body;

    if (!name || !description || !price || !features || !plan) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const newService = await prisma.services.create({
      data: {
        name,
        description,
        price: parseFloat(price),
        features: JSON.parse(features),
        plan,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Service created successfully",
      data: newService,
    });
  } catch (error) {
    console.error("Error creating service:", error);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const getAllServices = async (req, res) => {
  try {
    const services = await prisma.services.findMany({
      orderBy: { created_at: "desc" },
    });

    return res.status(200).json({
      success: true,
      data: services,
    });
  } catch (error) {
    console.error("Error fetching services:", error);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};


export const createCategory = async (req, res) => {
  
  try {
    const { name, slug, status } = req.body;
    if (!name || !slug) {
      return res.status(400).json({ message: "Name and slug are required" });
    }
    const category = await prisma.category.create({
      data: {
        name,
        slug,
        status: status ?? 1,
      },
    });
    return res.status(201).json({ success: true, data: category });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const getCategories = async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { created_at: "desc" },
    });
    return res.status(200).json({ success: true, data: categories });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const getCategoryById = async (req, res) => {
  const { id } = req.params;
  try {
    const category = await prisma.category.findUnique({
      where: { id },
    });
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    return res.status(200).json({ success: true, data: category });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const updateCategory = async (req, res) => {
  console.log("this is the update category");
  try {
    const { id } = req.params;
    const { name, slug, status } = req.body;
    const category = await prisma.category.update({
      where: { id },
      data: { name, slug, status },
    });
    return res.status(200).json({ success: true, data: category });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.category.delete({ where: { id } });
    return res.status(200).json({ success: true, message: "Category deleted" });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

//----------------------get all genres----------------------
export const getAllGenres = async (req, res) => {
  try {
    const genres = [
      "action",
      "adventure",
      "animation",
      "biography",
      "comedy",
      "crime",
      "documentary",
      "drama",
      "family",
      "fantasy",
      "history",
      "horror",
      "music",
      "musical",
      "mystery",
      "romance",
      "sci_fi",
      "sport",
      "thriller",
      "war",
      "western",
    ];

    res.json({ genres });
  } catch (error) {
    console.error("Error fetching genres:", error);
    res.status(500).json({ error: "Failed to fetch genres" });
  }
};
export const getContentsByGenre = async (req, res) => {
  const { genre } = req.params;

  try {
    const contents = await prisma.content.findMany({
      where: {
        genre: genre,
      },
      orderBy: {
        created_at: "desc",
      },
      include: {
        category: {
          select: {
            name: true,
          },
        },
      },
    });

    if (contents.length === 0) {
      return res
        .status(404)
        .json({ message: `No content found for genre ${genre}` });
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
    console.error("Error fetching content by genre:", error);
    res.status(500).json({ error: "Failed to fetch content by genre" });
  }
};


