import express from "express";
import {
  createRating,
  getAllRatings,
  getRatingById,
  updateRating,
  deleteRating,
  topRatedContentThisWeek,
} from "./rating.controller.js";
import { verifyUser } from "../../middlewares/verifyUsers.js";

const router = express.Router();

// Create a rating
router.post("/", verifyUser("normal", "premium", "admin"), createRating);

// Get all ratings
router.get("/", verifyUser("normal", "premium", "admin"), getAllRatings);

// Get a rating by ID
router.get("/:id", verifyUser("normal", "premium", "admin"), getRatingById);

// Update a rating by ID
router.put("/:id", verifyUser("normal", "premium", "admin"), updateRating);

// Delete a rating by ID
router.delete("/:id", verifyUser("normal", "premium", "admin"), deleteRating);

// Get top-rated content this week
router.get("/top/ratings", verifyUser("admin"), topRatedContentThisWeek);

export default router;
