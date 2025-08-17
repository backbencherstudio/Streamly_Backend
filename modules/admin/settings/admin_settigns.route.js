import express from "express";
import { verifyAdmin } from "../../../middlewares/verifyAdmin.js";
import {
  activateUser,
  deactivateAccount,
  deleteAccount,
} from "./admin_settings.controller.js";
import { verifyUser } from "../../../middlewares/verifyUsers.js";
import { authenticateUser } from "../../user/user.controller.js";

const router = express.Router();

router.post("/deactivate", authenticateUser, deactivateAccount);
router.post("/activate", activateUser);
router.delete("/delete/:userId", verifyAdmin, verifyUser, deleteAccount);

export default router;
