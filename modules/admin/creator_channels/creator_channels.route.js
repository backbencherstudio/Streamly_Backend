import express from "express";
import { verifyUser } from "../../../middlewares/verifyUsers.js";
import {
  listCreatorChannels,
  getCreatorChannelDetails,
  approveCreatorChannel,
  rejectCreatorChannel,
} from "./creator_channels.controller.js";

const router = express.Router();

router.get("/channels", verifyUser("admin"), listCreatorChannels);
router.get("/channels/:id", verifyUser("admin"), getCreatorChannelDetails);
router.patch("/channels/:id/approve", verifyUser("admin"), approveCreatorChannel);
router.patch("/channels/:id/reject", verifyUser("admin"), rejectCreatorChannel);

export default router;
