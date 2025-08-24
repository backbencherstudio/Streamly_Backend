import { PrismaClient } from "@prisma/client";
import { emailReactivateUser } from "../../../constants/email_message.js";
import { sendEmail } from "../../../utils/mailService.js";
import bcrypt from "bcryptjs";
const prisma = new PrismaClient();

//---------------------deactivate user account-------------------
export const deactivateAccount = async (req, res) => {
  const id = req.user?.userId;
  console.log("userId:", id);

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
      where: { id: id },
      data: {
        status: "deactivated",
        deactivation_start_date: deactivationStartDate,
        deactivation_end_date: deactivationEndDate,
      },
    });

    res.json({
      message: `Account deactivated successfully for ${deactivationPeriod} days.`,
    });

    const emailContent = emailReactivateUser(user.email, deactivationPeriod);
    await sendEmail(
      user.email,
      "Account Deactivation Notification",
      emailContent
    );
  } catch (error) {
    console.error("Error deactivating account:", error);
    res.status(500).json({ error: "Failed to deactivate account" });
  }
};
//---------------------activate user account-------------------
export const activateUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await prisma.user.findUnique({
      where: { email: email },
    });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid password" });
    }

    await prisma.user.update({
      where: { email: email },
      data: {
        status: "active",
        deactivation_start_date: null,
        deactivation_end_date: null,
      },
    });

    res.json({ message: "User account activated successfully" });

    const emailContent = emailReactivateUser(user.email);
    await sendEmail(
      user.email,
      "Account Deactivation Notification",
      emailContent
    );
  } catch (error) {
    console.error("Error activating account:", error);
    res.status(500).json({ error: "Failed to activate account" });
  }
};
//--------------------delete account permanently-------------------
export const deleteAccount = async (req, res) => {
  const { userId } = req.params;

  try {
    await prisma.user.delete({
      where: { id: userId },
    });

    res.json({ message: "Permanently deleted account successfully" });
  } catch (error) {
    console.error("Error deleting account:", error);
    res.status(500).json({ error: "Failed to delete account" });
  }
};
