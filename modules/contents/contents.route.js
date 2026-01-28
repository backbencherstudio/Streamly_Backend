import express from "express";
import { verifyUser } from "../../middlewares/verifyUsers.js";
import {
  getHomeSections,
  getRecommendedForUser,
  getByGenre,
  getContentDetails,
  getContentToWatch,
  getDownloadLink,
  getPopularCategories,
  getNewAndPopular,
  getUpcomingByCategory,
  getTrendingContent,
} from "./contents.controller.js";

const router = express.Router();

// Home sections for user app - PUBLIC (no login required)
router.get("/home", getHomeSections);

// Public content details
router.get("/details/:id", getContentDetails);

// Popular categories with metrics
router.get("/popular-categories", getPopularCategories);

// New and Popular content
router.get("/new-and-popular", getNewAndPopular);

// Upcoming content by category (movies, series, episodes, music_video)
// Optional: ?content_type=movie|series|episode|music_video
router.get("/upcoming-by-category", getUpcomingByCategory);

// Trending content
router.get("/trending", getTrendingContent);

// Recommendations based on favourites & ratings
router.get("/recommended", verifyUser("normal", "premium"), getRecommendedForUser);

// Browse by genre with pagination
router.get("/genre/:genre", verifyUser("normal", "premium"), getByGenre);

// Watch details for a given content id
router.get("/watch/:id", verifyUser("normal", "premium"), getContentToWatch);

// Offline download link (premium only)
router.get("/download/:id", verifyUser("premium"), getDownloadLink);

export default router;
