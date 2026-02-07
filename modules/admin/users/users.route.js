import express from "express";
import {
  deleteUser,
  getAllUsers,
  suspendUser,
  totalUsers,
  unsuspendUser,
  getUserById,
} from "./users.controller.js";
import { verifyUser } from "../../../middlewares/verifyUsers.js";

const router = express.Router();

router.get("/allusers", verifyUser("admin"), getAllUsers);
router.get("/:id", verifyUser("admin"), getUserById);

router.delete("/user/:id", verifyUser("admin"), deleteUser);
router.patch("/:id/suspend", verifyUser("admin"), suspendUser);
router.patch("/:id/unsuspend", verifyUser("admin"), unsuspendUser);

// dashboard total users
router.get("/totalusers", verifyUser("admin"), totalUsers);

export default router;
