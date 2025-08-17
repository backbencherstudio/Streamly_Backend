import express from "express";
import { verifyAdmin } from "../../../middlewares/verifyAdmin.js";
import {
  activateUser,
  deactivateAccount,
  deleteAccount,
} from "./admin_settings.controller.js";
import { verifyUser } from "../../../middlewares/verifyUsers.js";

const router = express.Router();

router.post("/deactivate/:userId", verifyAdmin, verifyUser, deactivateAccount);
router.post("/activate/:userId", verifyAdmin, verifyUser, activateUser);
router.delete("/delete/:userId", verifyAdmin, verifyUser, deleteAccount);

export default router;
