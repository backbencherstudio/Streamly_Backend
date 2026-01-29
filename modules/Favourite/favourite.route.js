import express from "express";
import { 
  getFavourites,
  toggleFavourite,
} from "./favourite.controller.js";
import { verifyUser } from "../../middlewares/verifyUsers.js";

const router = express.Router();

// Get all favourites with pagination and filters
// GET /api/favourites?page=1&take=20&category=action&content_type=movie
router.get("/", verifyUser("normal", "premium"), getFavourites);

// Toggle favourite (add/remove)
// POST /api/favourites/toggle
// Body: { content_id: "string" }
router.post("/toggle", verifyUser("normal", "premium"), toggleFavourite);

export default router;
