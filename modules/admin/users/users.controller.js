import { PrismaClient } from "@prisma/client";
import {
  emailSuspendUser,
  emailUnsuspendUser,
} from "../../../constants/email_message.js";
import { sendEmail } from "../../../utils/mailService.js";

const prisma = new PrismaClient();

export const getAllUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        role: true,
        created_at: true,
        updated_at: true,
        Subscription: {
          select: {
            status: true,
            start_date: true,
            end_date: true,
            plan: true,
          },
        },
        PaymentTransaction: {
          select: {
            id: true,
            price: true,
            status: true,
            created_at: true,
          },
        },
      },
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
    console.log("Error fetching users:", err);
  }
};

export const deleteUser = async (req, res) => {
  const { id } = req.params;
  console.log("id:", id);
  try {
    const user = await prisma.user.delete({
      where: { id: id },
    });
    res.json(user, { message: "User deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete user" });
    console.log("Error deleting user:", err);
  }
};

export const suspendUser = async (req, res) => {
  const { id } = req.params;
  const { suspend_endTime } = req.body;

  try {
    const user = await prisma.user.update({
      where: { id: id },
      data: { status: "suspended", suspend_endTime: suspend_endTime },
    });

    const emailContent = emailSuspendUser(user.email, suspend_endTime);
    await sendEmail(user.email, "Account Suspended", emailContent);

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Failed to suspend user" });
    console.log("Error suspending user:", err);
  }
};

export const unsuspendUser = async (req, res) => {
  const { id } = req.params;

  try {
    const user = await prisma.user.update({
      where: { id: id },
      data: { status: "active", suspend_endTime: null },
    });

    const emailContent = emailUnsuspendUser(user.email);
    await sendEmail(user.email, "Account Reactivated", emailContent);

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Failed to unsuspend user" });
    console.log("Error unsuspending user:", err);
  }
};

export const totalUsers = async (req, res) => {
  try {
    const count = await prisma.user.count();
    res.json({ totalUsers: count });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch total users" });
    console.log("Error fetching total users:", err);
  }
};
