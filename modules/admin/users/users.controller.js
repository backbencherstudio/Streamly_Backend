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
    const existingUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, deleted_at: true },
    });

    if (!existingUser) {
      return res.status(404).json({ error: "User not found" });
    }

    if (existingUser.deleted_at) {
      return res.json({ success: true, message: "User already deleted" });
    }

    const deletedAt = new Date();
    const anonymizedEmail = `deleted+${id}@example.invalid`;

    await prisma.$transaction(async (tx) => {
      await tx.notification.updateMany({
        where: {
          deleted_at: null,
          OR: [{ sender_id: id }, { receiver_id: id }],
        },
        data: { deleted_at: deletedAt },
      });

      await tx.download.updateMany({
        where: { user_id: id, deleted_at: null },
        data: { deleted_at: deletedAt, status: "cancelled" },
      });

      await tx.userStorageQuota.deleteMany({ where: { user_id: id } });
      await tx.favourite.deleteMany({ where: { user_id: id } });
      await tx.rating.updateMany({
        where: { user_id: id, deleted_at: null },
        data: { deleted_at: deletedAt },
      });
      await tx.helpSupport.updateMany({
        where: { user_id: id, deleted_at: null },
        data: { deleted_at: deletedAt },
      });
      await tx.userSetting.updateMany({
        where: { user_id: id, deleted_at: null },
        data: { deleted_at: deletedAt },
      });
      await tx.userPaymentMethod.updateMany({
        where: { user_id: id, deleted_at: null },
        data: { deleted_at: deletedAt },
      });
      await tx.paymentTransaction.updateMany({
        where: { user_id: id, deleted_at: null },
        data: { deleted_at: deletedAt },
      });
      await tx.order.updateMany({
        where: { user_id: id },
        data: { status: "inactive", order_status: "canceled" },
      });
      await tx.subscription.updateMany({
        where: { user_id: id },
        data: {
          status: "deactivated",
          plan: "No_plan",
          end_date: deletedAt,
          renewal_date: null,
        },
      });

      await tx.user.update({
        where: { id },
        data: {
          deleted_at: deletedAt,
          status: "deactivated",
          email: anonymizedEmail,
          password: null,
          name: null,
          avatar: null,
        },
      });
    });

    return res.json({ success: true, message: "User deleted successfully" });
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
// get one user by id
export const getUserById = async (req, res) => {
  const { id } = req.params;

  try {
    const user = await prisma.user.findUnique({
      where: { id: id },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        role: true,
        created_at: true,
        address: true,
        country: true,
        avatar: true,
        gender: true,
        date_of_birth: true,
        phone_number: true,
        city: true,
        state: true,
        postal_code: true,
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

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user" });
    console.log("Error fetching user:", err);
  }
}
