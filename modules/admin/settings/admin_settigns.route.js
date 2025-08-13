import express from "express";
import { verifyAdmin } from "../../../middlewares/verifyAdmin.js";
import { deactivateAccount } from "./admin_settings.controller.js";

const router = express.Router();

router.post("/deactivate/:userId", verifyAdmin, deactivateAccount);

export default router;
