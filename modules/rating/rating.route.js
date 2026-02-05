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

router.post("/", verifyUser("normal", "premium", "creator", "admin"), createRating);

router.get("/", verifyUser("normal", "premium", "creator", "admin"), getAllRatings);

router.get("/:id", verifyUser("normal", "premium", "creator", "admin"), getRatingById);

router.put("/:id", verifyUser("normal", "premium", "creator", "admin"), updateRating);

router.delete("/:id", verifyUser("normal", "premium", "creator", "admin"), deleteRating);

router.get("/top/ratings", verifyUser("admin"), topRatedContentThisWeek);

export default router;
