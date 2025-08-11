import express from "express";
import path from "path";
import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import {
  deleteUser,
  getAllUsers,
  suspendUser,
  unsuspendUser,
} from "./users.controller.js";
import { get } from "http";
import { verifyUser } from "../../../middlewares/verifyUsers.js";
import r from "../video_routes/contenets.route.js";

const prisma = new PrismaClient();
const router = express.Router();

router.get("/allusers", verifyUser("admin"), getAllUsers);
router.delete("/user/:id", verifyUser("admin"), deleteUser); 
router.post("/suspenduser/:id", verifyUser("admin"), suspendUser);
router.post("/unsuspenduser/:id", verifyUser("admin"), unsuspendUser);

export default router;
