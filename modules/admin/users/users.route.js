import express from "express";
import { PrismaClient } from "@prisma/client";
import {
  deleteUser,
  getAllUsers,
  suspendUser,
  totalUsers,
  unsuspendUser,
} from "./users.controller.js";
import { verifyUser } from "../../../middlewares/verifyUsers.js";

const prisma = new PrismaClient();
const router = express.Router();

router.get("/allusers", verifyUser("admin"), getAllUsers);
router.delete("/user/:id", verifyUser("admin"), deleteUser);
router.post("/suspenduser/:id", verifyUser("admin"), suspendUser);
router.post("/unsuspenduser/:id", verifyUser("admin"), unsuspendUser);
router.get("/totalusers", verifyUser("admin"), totalUsers);

export default router;
