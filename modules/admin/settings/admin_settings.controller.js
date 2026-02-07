import { PrismaClient } from "@prisma/client";
import { emailReactivateUser } from "../../../constants/email_message.js";
import { sendEmail } from "../../../utils/mailService.js";
import { sendNotification } from "../../../utils/notificationService.js";
import bcrypt from "bcryptjs";
const prisma = new PrismaClient();

export const myProfile = async (req, res) => {
  const userId = req.user?.userId;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },

      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        role: true,
        status: true,
        deactivation_start_date: true,
        deactivation_end_date: true,
        address: true,
        bio: true,
        city: true,
        country: true,
        date_of_birth: true,
        gender: true,
        phone_number: true,
        updated_at: true,
        created_at: true,
      },
    });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
};

export const emailChange = async (req, res) => {
  const userId = req.user?.userId || req.user?.id;
  const { newEmail, currentPassword } = req.body;
  try {
    if (!userId) {
      return res.status(401).json({ error: "Unauthenticated" });
    }

    if (!newEmail || !currentPassword) {
      return res
        .status(400)
        .json({ error: "New email and current password are required" });
    }

    const normalizedEmail = String(newEmail).trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true, email: true },
    });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!user.password) {
      return res.status(400).json({
        error:
          "Password is not set for this account. Email change is not available.",
      });
    }

    const isPasswordValid = await bcrypt.compare(
      String(currentPassword),
      user.password,
    );
    if (!isPasswordValid) {
      return res.status(400).json({ error: "Invalid current password" });
    }

    const emailTaken = await prisma.user.findFirst({
      where: {
        email: normalizedEmail,
        deleted_at: null,
        NOT: { id: userId },
      },
      select: { id: true },
    });
    if (emailTaken) {
      return res.status(409).json({ error: "Email is already in use" });
    }

    if (String(user.email).toLowerCase() === normalizedEmail) {
      return res.status(400).json({ error: "New email must be different" });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { email: normalizedEmail },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        role: true,
        status: true,
      },
    });

    await sendNotification({
      receiverId: userId,
      type: "security.email_changed",
      entityId: userId,
      text: "Your account email was changed successfully.",
    });

    res.json({
      success: true,
      data: updatedUser,
    });
  } catch (error) {
    console.error("Error changing email:", error);
    res.status(500).json({ error: "Failed to change email" });
  }
};

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
      deactivationEndDate.getDate() + deactivationPeriod,
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

    await sendNotification({
      receiverId: id,
      type: "account.deactivated",
      entityId: id,
      text: `Your account was deactivated for ${deactivationPeriod} days.`,
    });

    const emailContent = emailReactivateUser(user.email, deactivationPeriod);
    await sendEmail(
      user.email,
      "Account Deactivation Notification",
      emailContent,
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

    await sendNotification({
      receiverId: user.id,
      type: "account.activated",
      entityId: user.id,
      text: "Your account was activated successfully.",
    });

    const emailContent = emailReactivateUser(user.email);
    await sendEmail(
      user.email,
      "Account Activation Notification",
      emailContent,
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
