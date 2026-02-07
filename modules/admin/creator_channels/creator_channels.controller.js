import { PrismaClient } from "@prisma/client";
import { sendNotification } from "../../../utils/notificationService.js";

const prisma = new PrismaClient();

const parsePageTake = (req) => {
  const page = Math.max(parseInt(req.query.page || "1", 10) || 1, 1);
  const takeRaw = parseInt(req.query.take || req.query.limit || "20", 10) || 20;
  const take = Math.min(Math.max(takeRaw, 1), 100);
  const skip = (page - 1) * take;
  return { page, take, skip };
};

const normalizeNote = (note) => {
  if (note === undefined || note === null) return null;
  const v = String(note).trim();
  return v ? v : null;
};

const normalizeStatusFilter = (value) => {
  if (value === undefined || value === null) return null;
  const v = String(value).trim();
  if (!v) return null;
  const allowed = ["pending", "approved", "rejected"];
  if (!allowed.includes(v)) return { error: true, allowed };
  return v;
};

const channelSelect = {
  id: true,
  user_id: true,
  name: true,
  slug: true,
  bio: true,
  sample_video_link: true,
  channel_category: true,
  status: true,
  reviewed_by_user_id: true,
  reviewed_at: true,
  review_note: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
  user: {
    select: {
      id: true,
      name: true,
      avatar: true,
      email: true,
      role: true,
    },
  },

  reviewed_by: {
    select: { id: true, name: true, email: true, avatar: true, role: true },
  },
  _count: { select: { contents: true } },
};

export const listCreatorChannels = async (req, res) => {
  try {
    const { page, take, skip } = parsePageTake(req);
    const statusFilter = normalizeStatusFilter(req.query.status);

    if (statusFilter?.error) {
      return res.status(400).json({
        message: "Invalid status filter",
        code: "CREATOR_CHANNEL_STATUS_INVALID",
        allowed: statusFilter.allowed,
      });
    }

    const q = req.query.q ? String(req.query.q).trim() : "";

    const where = {
      deleted_at: null,
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { slug: { contains: q, mode: "insensitive" } },
              { user: { is: { email: { contains: q, mode: "insensitive" } } } },
              { user: { is: { name: { contains: q, mode: "insensitive" } } } },
            ],
          }
        : {}),
    };

    const countsWhere = { deleted_at: null };

    const [filteredTotal, all, pending, approved, rejected, channels] =
      await Promise.all([
        prisma.creatorChannel.count({ where }),
        prisma.creatorChannel.count({ where: countsWhere }),
        prisma.creatorChannel.count({
          where: { ...countsWhere, status: "pending" },
        }),
        prisma.creatorChannel.count({
          where: { ...countsWhere, status: "approved" },
        }),
        prisma.creatorChannel.count({
          where: { ...countsWhere, status: "rejected" },
        }),
        prisma.creatorChannel.findMany({
          where,
          orderBy: { created_at: "desc" },
          skip,
          take,
          select: channelSelect,
        }),
      ]);

    const creatorSubscriptions = await prisma.creatorSubscription.findMany({
      where: {
        user_id: { in: channels.map((c) => c.user_id) },
        status: "active",
      },
    });

    return res.json({
      success: true,
      counts: { all, pending, approved, rejected },
      pagination: {
        page,
        take,
        total: filteredTotal,
        totalPages: Math.ceil(filteredTotal / take),
      },
      channels,
      creatorSubscriptions,
    });
  } catch (err) {
    console.error("listCreatorChannels error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getCreatorChannelDetails = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        message: "id is required",
        code: "CREATOR_CHANNEL_ID_REQUIRED",
      });
    }

    const channel = await prisma.creatorChannel.findUnique({
      where: { id },
      select: channelSelect,
    });

    if (!channel || channel.deleted_at) {
      return res.status(404).json({ message: "Channel not found" });
    }

    const creatorSub = await prisma.creatorSubscription.findFirst({
      where: {
        user_id: channel.user_id,
        status: "active",
      },
      select: {
        id: true,
        status: true,
        plan: true,
        transaction_id: true,
        start_date: true,
        end_date: true,
        renewal_date: true,
        creator_service_id: true,
        service: {
          select: {
            id: true,
            name: true,
            plan: true,
            price: true,
            currency: true,
            videos_per_month: true,
            features: true,
            description: true,
          },
        },
      },
    });

    return res.json({
      success: true,
      channel,
      creatorSubscription: creatorSub,
    });
  } catch (err) {
    console.error("getCreatorChannelDetails error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const approveCreatorChannel = async (req, res) => {
  try {
    const { id } = req.params;
    const adminUserId = req.user?.userId;
    const noteValue = normalizeNote(req.body?.note);

    if (!id) {
      return res.status(400).json({
        message: "id is required",
        code: "CREATOR_CHANNEL_ID_REQUIRED",
      });
    }
    if (!adminUserId) {
      return res.status(401).json({ message: "Unauthenticated" });
    }

    const channel = await prisma.creatorChannel.findUnique({
      where: { id },
      include: { user: { select: { id: true } } },
    });

    if (!channel || channel.deleted_at) {
      return res.status(404).json({ message: "Channel not found" });
    }

    if (channel.status === "approved") {
      return res.json({
        success: true,
        message: "Channel already approved",
        channel,
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const c = await tx.creatorChannel.update({
        where: { id },
        data: {
          status: "approved",
          reviewed_by_user_id: adminUserId,
          reviewed_at: new Date(),
          review_note: noteValue,
        },
      });

      // Safety: ensure user has creator role when channel is approved
      await tx.user.updateMany({
        where: { id: channel.user_id },
        data: { role: "creator" },
      });

      return c;
    });

    await sendNotification({
      receiverId: channel.user_id,
      type: "creator_channel.approved",
      entityId: updated.id,
      text: noteValue
        ? `Your creator channel was approved. Note: ${noteValue}`
        : "Your creator channel was approved.",
    });

    return res.json({
      success: true,
      message: "Channel approved",
      channel: updated,
    });
  } catch (err) {
    console.error("approveCreatorChannel error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const rejectCreatorChannel = async (req, res) => {
  try {
    const { id } = req.params;
    const adminUserId = req.user?.userId;
    const noteValue = normalizeNote(req.body?.note);

    if (!id) {
      return res.status(400).json({
        message: "id is required",
        code: "CREATOR_CHANNEL_ID_REQUIRED",
      });
    }
    if (!adminUserId) {
      return res.status(401).json({ message: "Unauthenticated" });
    }

    const channel = await prisma.creatorChannel.findUnique({ where: { id } });
    if (!channel || channel.deleted_at) {
      return res.status(404).json({ message: "Channel not found" });
    }

    if (channel.status === "rejected") {
      return res.json({
        success: true,
        message: "Channel already rejected",
        channel,
      });
    }

    const updated = await prisma.creatorChannel.update({
      where: { id },
      data: {
        status: "rejected",
        reviewed_by_user_id: adminUserId,
        reviewed_at: new Date(),
        review_note: noteValue,
      },
    });

    await sendNotification({
      receiverId: channel.user_id,
      type: "creator_channel.rejected",
      entityId: updated.id,
      text: noteValue
        ? `Your creator channel was rejected. Note: ${noteValue}`
        : "Your creator channel was rejected.",
    });

    return res.json({
      success: true,
      message: "Channel rejected",
      channel: updated,
    });
  } catch (err) {
    console.error("rejectCreatorChannel error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
