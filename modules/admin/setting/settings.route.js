import express from "express";
import {
  getPersonalInfo,
  updatePersonalInfo,
  uploadImage,
  deleteImage,
} from "./settings.controller.js";
import verifyUsers from "../../middlewares/verifyUsers.js";

const router = express.Router();

// Get personal info
router.get("/personal-info", verifyUsers, getPersonalInfo);

// Update personal info
router.put("/personal-info", verifyUsers, updatePersonalInfo);

// Upload profile image
router.post("/personal-info/image", verifyUsers, ...uploadImage);

// Delete profile image
router.delete("/personal-info/image", verifyUsers, deleteImage);

export default router;
