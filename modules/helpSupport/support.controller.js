import { PrismaClient } from "@prisma/client";
import { sendEmail } from "../../utils/mailService.js";
import { createAdminTicketNotificationEmail } from "../../constants/email_message.js";

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

    const updatedTicket = await prisma.helpSupport.update({
      where: { id: ticketId },
      data: { status: "Resolved" },
    });

    const user = await prisma.user.findUnique({
      where: { id: updatedTicket.user_id },
    });

    const subject = updatedTicket.subject;

    try {
      const userEmailSubject = "Your Support Ticket Has Been Resolved";
      const userEmailBody = `
        <p>Dear ${user?.name},</p>
        <p>We are pleased to inform you that your support ticket regarding "<strong>${subject}</strong>" has been successfully resolved.</p>
        <p>If you have any further questions or need additional assistance, feel free to contact our support team.</p>
        <p>Best regards,<br>Streamly Support Team</p>
      `;

      await sendEmail(user?.email, userEmailSubject, userEmailBody);
    } catch (error) {
      console.error("Error sending user email:", error);
    }

    return res.status(200).json({
      success: true,
      message: "Ticket resolved successfully, and email sent to the user",
      ticket: updatedTicket,
    });
  } catch (error) {
    console.error("Error in solveTicket:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
