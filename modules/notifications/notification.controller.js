import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const buildPublicS3Url = ({ bucket, key }) => {
  if (!bucket || !key) return null;

  const endpoint = process.env.AWS_S3_ENDPOINT;
  const region = process.env.AWS_REGION || "us-east-1";
  if (endpoint) {
    const trimmed = String(endpoint).replace(/\/$/, "");
    return `${trimmed}/${bucket}/${key}`;
  }
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
};

const resolveAvatarUrl = (avatarValue) => {
  if (!avatarValue) return null;

  if (typeof avatarValue === "string" && /^https?:\/\//i.test(avatarValue)) {
    return avatarValue;
  }

  if (typeof avatarValue === "string" && avatarValue.includes("/")) {
    const bucket = process.env.AWS_S3_BUCKET;
    return buildPublicS3Url({ bucket, key: avatarValue });
  }

  return `http://localhost:4005/uploads/${avatarValue}`;
};

const formatNotification = (n) => ({
  id: n.id,
  status: n.status,
  created_at: n.created_at,
  updated_at: n.updated_at,
  read_at: n.read_at,
  entity_id: n.entity_id,
  sender: n.sender
    ? {
        id: n.sender.id,
        name: n.sender.name,
        avatar: n.sender.avatar,
        avatar_url: resolveAvatarUrl(n.sender.avatar),
      }
    : null,
  event: n.notification_event
    ? {
        id: n.notification_event.id,
        type: n.notification_event.type,
        text: n.notification_event.text,
        status: n.notification_event.status,
      }
    : null,
});

// GET /api/users/notifications
export const getAllNotifications = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "User not authenticated" });
    }

    const pageNum = Math.max(1, parseInt(req.query.page ?? "1", 10));
    const takeNum = Math.min(100, Math.max(1, parseInt(req.query.take ?? "20", 10)));
    const skip = (pageNum - 1) * takeNum;
    const unreadOnly =
      String(req.query.unreadOnly ?? "false").toLowerCase() === "true";

    const where = {
      receiver_id: userId,
      deleted_at: null,
      ...(unreadOnly ? { read_at: null } : {}),
    };

    const [total, unreadCount, notifications] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: { receiver_id: userId, deleted_at: null, read_at: null },
      }),
      prisma.notification.findMany({
        where,
        include: {
          sender: { select: { id: true, name: true, avatar: true } },
          notification_event: {
            select: { id: true, type: true, text: true, status: true },
          },
        },
        orderBy: { created_at: "desc" },
        skip,
        take: takeNum,
      }),
    ]);

    return res.status(200).json({
      success: true,
      message: "Notifications retrieved successfully",
      data: notifications.map(formatNotification),
      pagination: {
        page: pageNum,
        take: takeNum,
        total,
        totalPages: Math.ceil(total / takeNum),
      },
      unread_count: unreadCount,
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

// DELETE /api/users/notifications/:id
export const deleteNotification = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "User not authenticated" });
    }

    if (!id) {
      return res
        .status(400)
        .json({ success: false, message: "Notification id is required" });
    }

    const notification = await prisma.notification.findFirst({
      where: {
        id,
        receiver_id: userId,
        deleted_at: null,
      },
      select: { id: true },
    });

    if (!notification) {
      return res
        .status(404)
        .json({ success: false, message: "Notification not found" });
    }

    await prisma.notification.update({
      where: { id },
      data: { deleted_at: new Date() },
    });

    return res.status(200).json({
      success: true,
      message: "Notification deleted successfully",
      deleted_id: id,
    });
  } catch (error) {
    console.error("Error deleting notification:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

// DELETE /api/users/notifications
export const deleteAllNotifications = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "User not authenticated" });
    }

    const result = await prisma.notification.updateMany({
      where: { receiver_id: userId, deleted_at: null },
      data: { deleted_at: new Date() },
    });

    return res.status(200).json({
      success: true,
      message: "All notifications deleted successfully",
      deleted_count: result.count,
    });
  } catch (error) {
    console.error("Error deleting all notifications:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

// PATCH /api/users/notifications/:id/read
export const markNotificationRead = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "User not authenticated" });
    }

    if (!id) {
      return res
        .status(400)
        .json({ success: false, message: "Notification id is required" });
    }

    const result = await prisma.notification.updateMany({
      where: {
        id,
        receiver_id: userId,
        deleted_at: null,
      },
      data: {
        read_at: new Date(),
      },
    });

    if (result.count === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Notification not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Notification marked as read",
      id,
    });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

// PATCH /api/users/notifications/read-all
export const markAllNotificationsRead = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "User not authenticated" });
    }

    const result = await prisma.notification.updateMany({
      where: {
        receiver_id: userId,
        deleted_at: null,
        read_at: null,
      },
      data: {
        read_at: new Date(),
      },
    });

    return res.status(200).json({
      success: true,
      message: "All notifications marked as read",
      updated_count: result.count,
    });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
