import express from "express";
import { verifyAdmin } from "../../../middlewares/verifyAdmin.js";
import {
  deactivateAccount,
  deleteAccount,
} from "./admin_settings.controller.js";

const router = express.Router();

router.post("/deactivate/:userId", verifyAdmin, deactivateAccount);
router.delete("/delete/:userId", verifyAdmin, deleteAccount);

export default router;
