import { PrismaClient } from "@prisma/client";
import { emailDeactivateUser } from "../../../constants/email_message.js";
import { sendEmail } from "../../../utils/mailService.js";

const prisma = new PrismaClient();

export const deactivateAccount = async (req, res) => {
  const { userId } = req.params;
  const { deactivationPeriod } = req.body;

  const validPeriods = [3, 7, 30, 365];

  if (!validPeriods.includes(deactivationPeriod)) {
    return res.status(400).json({
      error: "Invalid deactivation period. Choose 3, 7, 30, or 365 days.",
    });
  }

  try {
    const deactivationStartDate = new Date();

    const deactivationEndDate = new Date(deactivationStartDate);
    deactivationEndDate.setDate(
      deactivationEndDate.getDate() + deactivationPeriod
    );

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        status: "deactivated", 
        deactivation_start_date: deactivationStartDate,
        deactivation_end_date: deactivationEndDate,
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

export const activateUser = async (req, res) => {
  const { userId } = req.params;

  try {
    // Update the user status to 'active'
    await prisma.user.update({
      where: { id: userId },
      data: { status: "active" },
    });

    res.json({ message: "User account activated successfully" });
  } catch (error) {
    console.error("Error activating account:", error);
    res.status(500).json({ error: "Failed to activate account" });
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
