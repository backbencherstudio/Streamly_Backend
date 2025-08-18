import express from "express";
import {
  deleteUser,
  getAllUsers,
  suspendUser,
  totalUsers,
  unsuspendUser,
  getUserById
} from "./users.controller.js";
import { verifyUser } from "../../../middlewares/verifyUsers.js";

const router = express.Router();

router.get("/allusers", verifyUser("admin"), getAllUsers);
router.get("/users/:id", verifyUser('admin'), getUserById);
router.delete("/user/:id", verifyUser("admin"), deleteUser);
router.post("/suspenduser/:id", verifyUser("admin"), suspendUser);
router.post("/unsuspenduser/:id", verifyUser("admin"), unsuspendUser);
router.get("/totalusers", verifyUser("admin"), totalUsers);

export default router;
