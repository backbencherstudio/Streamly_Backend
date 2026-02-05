import express from "express";
import path from "path";
import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import {
  createService,
  getAllServices,
  createCategory,
  getCategories,
  updateCategory,
  deleteCategory,
  getAllGenres,
  getContentsByGenre,
  getCategoryById,
  getPopularCategories,
  getTrendingCategories,
} from "./create_category.controller.js";
import { get } from "http";
import { verifyAdmin } from "../../../middlewares/verifyAdmin.js";

const prisma = new PrismaClient();
const router = express.Router();

// Category CRUD
router.post("/create_category", verifyAdmin, createCategory);
router.get("/categories", getCategories);
router.get("/categories/:id", verifyAdmin, getCategoryById);
router.put("/categories/:id", verifyAdmin, updateCategory);
router.delete("/categories/:id", verifyAdmin, deleteCategory);

// Category Analytics
router.get("/popular", getPopularCategories);
router.get("/trending", getTrendingCategories);

// Existing service routes
router.post("/create_service", verifyAdmin, createService);
router.get("/services", getAllServices);

router.get("/getAllGenres", getAllGenres);
router.get("/getContentsByGenre/:genre", getContentsByGenre);




export default router;
