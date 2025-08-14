import { PrismaClient } from "@prisma/client";
import { emailDeactivateUser } from "../../../constants/email_message.js";
import { sendEmail } from "../../../utils/mailService.js";

const prisma = new PrismaClient();

export const deactivateAccount = async (req, res) => {
  const { userId } = req.params;
  const { deactivationPeriod } = req.body; // Period in days: 3, 7, 30, 365

  // Valid periods in days
  const validPeriods = [3, 7, 30, 365];

  if (!validPeriods.includes(deactivationPeriod)) {
    return res.status(400).json({
      error: "Invalid deactivation period. Choose 3, 7, 30, or 365 days.",
    });
  }

  try {
    // Get current date
    const deactivationStartDate = new Date();

    // Calculate deactivation end date
    const deactivationEndDate = new Date(deactivationStartDate);
    deactivationEndDate.setDate(
      deactivationEndDate.getDate() + deactivationPeriod
    );

    // Update the user with deactivation status, deactivation start, and end dates
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        status: "deactivated", // Set status to 'deactivated'
        deactivation_start_date: deactivationStartDate, // Store the current date as deactivation start date
        deactivation_end_date: deactivationEndDate, // Store the calculated deactivation end date
      },
    });

    // Send deactivation email to the user
    const emailContent = emailDeactivateUser(user.email, deactivationPeriod);
    await sendEmail(
      user.email,
      "Account Deactivation Notification",
      emailContent
    );

    res.json({
      message: `Account deactivated successfully for ${deactivationPeriod} days.`,
    });
  } catch (error) {
    console.error("Error deactivating account:", error);
    res.status(500).json({ error: "Failed to deactivate account" });
  }
};

export const deleteAccount = async (req, res) => {
  const { userId } = req.params;

  try {
    // Delete the user account permanently
    await prisma.user.delete({
      where: { id: userId },
    });

    res.json({ message: "Permanently deleted account successfully" });
  } catch (error) {
    console.error("Error deleting account:", error);
    res.status(500).json({ error: "Failed to delete account" });
  }
};
