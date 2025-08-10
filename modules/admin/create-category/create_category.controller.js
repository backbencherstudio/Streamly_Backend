import express from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const route = express.Router();

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

// Category CRUD operations
export const createCategory = async (req, res) => {
  console.log("this is the create category");
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
