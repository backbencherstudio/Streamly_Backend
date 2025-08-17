import express from "express";
import {
  createSupportTicket,
  getAllTickets,
  solveTicket,
} from "./support.controller.js";
import { authenticateUser } from "../user/user.controller.js";
import { verifyUser } from "../../middlewares/verifyUsers.js";

const router = express.Router();

router.post("/create/tickets", authenticateUser, createSupportTicket);
router.get("/tickets", verifyUser("admin"), getAllTickets);
router.patch("/tickets/:ticketId", verifyUser("admin"), solveTicket);

export default router;
