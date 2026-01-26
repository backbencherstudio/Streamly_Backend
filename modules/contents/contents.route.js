import express from "express";
import { verifyUser } from "../../middlewares/verifyUsers.js";
import {
  getHomeSections,
  getRecommendedForUser,
  getByGenre,
  getContentDetails,
  getContentToWatch,
  getDownloadLink,
} from "./contents.controller.js";

const router = express.Router();

// Home sections for user app - PUBLIC (no login required)
router.get("/home", getHomeSections);

// Public content details
router.get("/details/:id", getContentDetails);

// Recommendations based on favourites & ratings
router.get("/recommended", verifyUser("normal", "premium"), getRecommendedForUser);

// Browse by genre with pagination
router.get("/genre/:genre", verifyUser("normal", "premium"), getByGenre);

// Watch details for a given content id
router.get("/watch/:id", verifyUser("normal", "premium"), getContentToWatch);

// Offline download link (premium only)
router.get("/download/:id", verifyUser("premium"), getDownloadLink);

export default router;
