import { PrismaClient } from "@prisma/client";
import { sendSuccessfullyPostedTokenEmail } from "../../utils/mailService.js";

const prisma = new PrismaClient();

//---------------------create support ticket-------------------
export const createSupportTicket = async (req, res) => {
  try {
    const user = req.user;
    const { subject, description } = req.body;

    if (!subject || !description) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const newTicket = await prisma.helpSupport.create({
      data: {
        user_id: user?.userId,
        subject,
        description,
      },
    });

    const token = newTicket.id;  
    await sendSuccessfullyPostedTokenEmail(user?.email, token);

    return res.status(201).json({
      success: true,
      message: "Support ticket created successfully",
      ticket: newTicket,
    });
    
  } catch (error) {
    console.error("Error in createSupportTicket:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

//-------------------get all tickets-------------------
export const getAllTickets = async (req, res) => {
  try {
    const tickets = await prisma.helpSupport.findMany();
    return res.status(200).json({
      success: true,
      tickets,
    });
  } catch (error) {
    console.error("Error in getAllTickets:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

//-------------------solve ticket-------------------
export const solveTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;

    const ticket = await prisma.helpSupport.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    if (ticket.status === "Resolved") {

      const result = await prisma.helpSupport.update({
        where: { id: ticketId },
        data: { status: "Open" },
      });
      return res.status(200).json({
        success: true,
        message: "Ticket opened successfully",
        ticket: result.status,
      });

    } else {
      const result = await prisma.helpSupport.update({
        where: { id: ticketId },
        data: { status: "Resolved" },
      });

      return res.status(200).json({
        success: true,
        message: "Ticket resolved successfully",
        ticket: result.status,
      });
    }



  } catch (error) {
    console.error("Error in solveTicket:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
