import express from "express";
import { verifyUser } from "../../../middlewares/verifyUsers.js";
import {
  listPendingCreatorContent,
  getCreatorContentDetails,
  approveCreatorContent,
  rejectCreatorContent,
} from "./creator_content.controller.js";

const router = express.Router();

router.get("/creator-content", verifyUser("admin"), listPendingCreatorContent);
router.get("/creator-content/:id", verifyUser("admin"), getCreatorContentDetails);
router.patch(
  "/creator-content/:id/approve",
  verifyUser("admin"),
  approveCreatorContent,
);
router.patch(
  "/creator-content/:id/reject",
  verifyUser("admin"),
  rejectCreatorContent,
);

export default router;
