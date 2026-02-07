import { PrismaClient } from "@prisma/client";
import { sendEmail } from "../../utils/mailService.js";
import { createAdminTicketNotificationEmail } from "../../constants/email_message.js";
import { sendNotification, sendNotifications } from "../../utils/notificationService.js";

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
        username: user?.name,
        email: user?.email,
        description,
      },
    });

    try {
      const admins = await prisma.user.findMany({
        where: { role: "admin", deleted_at: null },
        select: { id: true },
      });
      await sendNotifications({
        receiverIds: admins.map((a) => a.id),
        type: "support.new_ticket",
        entityId: newTicket.id,
        text: `New support ticket: ${subject}`,
      });
    } catch (error) {
      console.error("Error sending admin notification:", error);
    }

    try {
      const adminEmail = process.env.ADMIN_EMAIL;
      const emailSubject = "New Support Ticket Created";
      const emailBody = createAdminTicketNotificationEmail(
        user?.email,
        subject,
        description
      );

      await sendEmail(adminEmail, emailSubject, emailBody);
    } catch (error) {
      console.error("Error sending email:", error);
    }

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
    const tickets = await prisma.helpSupport.findMany(
      {
        orderBy: { created_at: "desc" },
      }
    );
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

      if (ticket.user_id) {
        await sendNotification({
          receiverId: ticket.user_id,
          type: "support.ticket_reopened",
          entityId: ticketId,
          text: "Your support ticket has been reopened.",
        });
      }
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

      if (ticket.user_id) {
        await sendNotification({
          receiverId: ticket.user_id,
          type: "support.ticket_resolved",
          entityId: ticketId,
          text: "Your support ticket has been resolved.",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Ticket resolved successfully, and email sent to the user",
        ticket: result.status,
      });
    }
  } catch (error) {
    console.error("Error in solveTicket:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};