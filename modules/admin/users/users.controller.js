import { PrismaClient } from "@prisma/client";
import {
  emailSuspendUser,
  emailUnsuspendUser,
} from "../../../constants/email_message.js";
import { sendEmail } from "../../../utils/mailService.js";

const prisma = new PrismaClient();

const PUBLIC_BASE_URL = process.env.APP_URL || "http://localhost:4005";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";

const buildS3Url = (bucket, key) => {
  if (!bucket || !key) return null;
  if (process.env.AWS_S3_ENDPOINT) {
    const trimmed = String(process.env.AWS_S3_ENDPOINT).replace(/\/$/, "");
    return `${trimmed}/${bucket}/${key}`;
  }
  return `https://${bucket}.s3.${AWS_REGION}.amazonaws.com/${key}`;
};

const buildLocalUrl = (file) => {
  return file ? `${PUBLIC_BASE_URL}/uploads/${file}` : null;
};

const parseCsv = (value) => {
  if (!value) return [];
  if (Array.isArray(value))
    return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
};

const isAnonymizedDeletedEmail = (email) => {
  if (!email) return false;
  return String(email).toLowerCase().endsWith("@example.invalid");
};

const parseDateOrNull = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

export const getAllUsers = async (req, res) => {
  try {
    const includeDeleted =
      String(req.query?.includeDeleted || "false").toLowerCase() === "true";

    const page = Math.max(parseInt(req.query?.page || "1", 10) || 1, 1);
    const limitRaw = parseInt(req.query?.limit || "20", 10) || 20;
    const limit = Math.min(Math.max(limitRaw, 1), 100);
    const skip = (page - 1) * limit;

    // Filters
    const roleFilter =
      req.query?.roles !== undefined
        ? parseCsv(req.query.roles)
        : req.query?.role !== undefined
          ? parseCsv(req.query.role)
          : [];
    const statusFilter =
      req.query?.status !== undefined ? parseCsv(req.query.status) : [];
    const q = req.query?.q ? String(req.query.q).trim() : "";

    const where = {
      ...(includeDeleted ? {} : { deleted_at: null }),
      ...(roleFilter.length ? { role: { in: roleFilter } } : {}),
      ...(statusFilter.length ? { status: { in: statusFilter } } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          status: true,
          role: true,
          created_at: true,
          updated_at: true,
          deleted_at: true,

          creatorChannel: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
              avatar: true,
              banner: true,
              created_at: true,
              updated_at: true,
              deleted_at: true,
            },
          },

          // Viewer subscription (active only)
          Subscription: {
            where: { status: "active" },
            orderBy: { created_at: "desc" },
            take: 1,
            select: {
              id: true,
              status: true,
              start_date: true,
              end_date: true,
              renewal_date: true,
              plan: true,
              payment_method: true,
              transaction_id: true,
              price: true,
              Services: {
                take: 1,
                select: { id: true, name: true, plan: true, price: true },
              },
            },
          },

          // Creator subscription (active only)
          CreatorSubscription: {
            where: { status: "active" },
            orderBy: { created_at: "desc" },
            take: 1,
            select: {
              id: true,
              status: true,
              plan: true,
              start_date: true,
              end_date: true,
              renewal_date: true,
              transaction_id: true,
              payment_method: true,
              service: {
                select: {
                  id: true,
                  name: true,
                  plan: true,
                  price: true,
                  currency: true,
                  videos_per_month: true,
                },
              },
            },
          },

          // Last payment transaction (viewer or creator)
          PaymentTransaction: {
            orderBy: { created_at: "desc" },
            take: 1,
            select: {
              id: true,
              status: true,
              provider: true,
              price: true,
              currency: true,
              paid_amount: true,
              paid_currency: true,
              subscription_id: true,
              creator_subscription_id: true,
              created_at: true,
            },
          },
        },
      }),
    ]);

    const users = rows.map((u) => {
      const viewerSub = Array.isArray(u.Subscription)
        ? u.Subscription[0]
        : null;
      const creatorSub = Array.isArray(u.CreatorSubscription)
        ? u.CreatorSubscription[0]
        : null;
      const lastPayment = Array.isArray(u.PaymentTransaction)
        ? u.PaymentTransaction[0]
        : null;

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        avatar: u.avatar,
        status: u.status,
        role: u.role,
        created_at: u.created_at,
        updated_at: u.updated_at,
        deleted_at: u.deleted_at,
        role_details:
          u.role === "creator"
            ? {
                creator_channel: u.creatorChannel
                  ? {
                      id: u.creatorChannel.id,
                      name: u.creatorChannel.name,
                      slug: u.creatorChannel.slug,
                      status: u.creatorChannel.status,
                      avatar: u.creatorChannel.avatar,
                      banner: u.creatorChannel.banner,
                    }
                  : null,
              }
            : u.role === "admin"
              ? { admin: true }
              : { viewer: true },
        subscriptions: {
          viewer: viewerSub
            ? {
                id: viewerSub.id,
                status: viewerSub.status,
                plan: viewerSub.plan,
                payment_method: viewerSub.payment_method,
                transaction_id: viewerSub.transaction_id,
                start_date: viewerSub.start_date,
                end_date: viewerSub.end_date,
                renewal_date: viewerSub.renewal_date,
                price: viewerSub.price ?? null,
                service: viewerSub.Services?.[0]
                  ? {
                      id: viewerSub.Services[0].id,
                      name: viewerSub.Services[0].name,
                      plan: viewerSub.Services[0].plan,
                      price: viewerSub.Services[0].price,
                    }
                  : null,
              }
            : null,
          creator: creatorSub
            ? {
                id: creatorSub.id,
                status: creatorSub.status,
                plan: creatorSub.plan,
                payment_method: creatorSub.payment_method,
                transaction_id: creatorSub.transaction_id,
                start_date: creatorSub.start_date,
                end_date: creatorSub.end_date,
                renewal_date: creatorSub.renewal_date,
                service: creatorSub.service
                  ? {
                      id: creatorSub.service.id,
                      name: creatorSub.service.name,
                      plan: creatorSub.service.plan,
                      price: creatorSub.service.price,
                      currency: creatorSub.service.currency || "usd",
                      videos_per_month: creatorSub.service.videos_per_month,
                    }
                  : null,
              }
            : null,
        },
        last_payment: lastPayment
          ? {
              id: lastPayment.id,
              status: lastPayment.status,
              provider: lastPayment.provider,
              price: lastPayment.price,
              currency: lastPayment.currency,
              paid_amount: lastPayment.paid_amount,
              paid_currency: lastPayment.paid_currency,
              kind: lastPayment.creator_subscription_id
                ? "creator"
                : lastPayment.subscription_id
                  ? "viewer"
                  : null,
              created_at: lastPayment.created_at,
            }
          : null,
        flags: {
          is_deleted: Boolean(u.deleted_at),
          has_creator_channel: Boolean(
            u.creatorChannel && !u.creatorChannel.deleted_at,
          ),
          has_active_viewer_subscription: Boolean(viewerSub),
          has_active_creator_subscription: Boolean(creatorSub),
        },
      };
    });

    res.json({
      success: true,
      filters: {
        includeDeleted,
        roles: roleFilter.length ? roleFilter : null,
        status: statusFilter.length ? statusFilter : null,
        q: q || null,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      users,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
    console.log("Error fetching users:", err);
  }
};

export const deleteUser = async (req, res) => {
  const { id } = req.params;
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
      // Soft-delete notifications (sent/received)
      await tx.notification.updateMany({
        where: {
          deleted_at: null,
          OR: [{ sender_id: id }, { receiver_id: id }],
        },
        data: { deleted_at: deletedAt },
      });

      // Soft-delete / cancel offline downloads
      await tx.download.updateMany({
        where: { user_id: id, deleted_at: null },
        data: { deleted_at: deletedAt, status: "cancelled" },
      });

      // Storage quota has no deleted_at; safe to hard-delete
      await tx.userStorageQuota.deleteMany({ where: { user_id: id } });

      // Favourites have no deleted_at; hard-delete
      await tx.favourite.deleteMany({ where: { user_id: id } });

      // Content views have no deleted_at; hard-delete
      await tx.contentView.deleteMany({ where: { user_id: id } });

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

      await tx.emailHistoryRecipient.updateMany({
        where: { recipient_id: id, deleted_at: null },
        data: { deleted_at: deletedAt },
      });

      await tx.paymentTransaction.updateMany({
        where: { user_id: id, deleted_at: null },
        data: { deleted_at: deletedAt },
      });

      // Deactivate creator subscriptions (they have deleted_at)
      await tx.creatorSubscription.updateMany({
        where: { user_id: id, deleted_at: null },
        data: {
          deleted_at: deletedAt,
          status: "deactivated",
          end_date: deletedAt,
          renewal_date: null,
        },
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

      // Soft-delete creator channel (if any)
      await tx.creatorChannel.updateMany({
        where: { user_id: id, deleted_at: null },
        data: { deleted_at: deletedAt },
      });

      // Soft-delete contents created by this user
      await tx.content.updateMany({
        where: { created_by_user_id: id, deleted_at: null },
        data: { deleted_at: deletedAt },
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
          address: null,
          bio: null,
          city: null,
          country: null,
          phone_number: null,
          state: null,
          postal_code: null,
          gender: null,
          date_of_birth: null,
          customer_id: null,
          suspend_endTime: null,
          deactivation_start_date: null,
          deactivation_end_date: null,
          is_subscribed: false,
          two_factor_secret: null,
          is_two_factor_enabled: 0,
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

  console.log("hit in suspend");

  try {
    if (!id) return res.status(400).json({ error: "User ID is required" });

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        status: true,
        deleted_at: true,
        suspend_endTime: true,
      },
    });

    if (!user || user.deleted_at) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.status === "deactivated") {
      return res
        .status(400)
        .json({ error: "Deactivated user cannot be suspended" });
    }

    const parsedEnd = parseDateOrNull(suspend_endTime);
    if (parsedEnd === undefined) {
      return res.status(400).json({
        error: "Invalid suspend_endTime (must be a valid date or null)",
      });
    }

    if (parsedEnd && parsedEnd.getTime() <= Date.now()) {
      return res
        .status(400)
        .json({ error: "suspend_endTime must be in the future" });
    }

    if (
      user.status === "suspended" &&
      ((user.suspend_endTime &&
        parsedEnd &&
        new Date(user.suspend_endTime).getTime() === parsedEnd.getTime()) ||
        (!user.suspend_endTime && !parsedEnd))
    ) {
      return res.json({
        success: true,
        message: "User already suspended",
        user: {
          id: user.id,
          status: user.status,
          suspend_endTime: user.suspend_endTime,
        },
      });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { status: "suspended", suspend_endTime: parsedEnd },
      select: {
        id: true,
        email: true,
        status: true,
        suspend_endTime: true,
      },
    });

    if (updated.email && !isAnonymizedDeletedEmail(updated.email)) {
      const emailContent = emailSuspendUser(
        updated.email,
        updated.suspend_endTime,
      );
      await sendEmail(updated.email, "Account Suspended", emailContent);
    }

    return res.json({
      success: true,
      message: "User suspended successfully",
      user: {
        id: updated.id,
        status: updated.status,
        suspend_endTime: updated.suspend_endTime,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to suspend user" });
    console.log("Error suspending user:", err);
  }
};

export const unsuspendUser = async (req, res) => {
  const { id } = req.params;

  try {
    if (!id) return res.status(400).json({ error: "User ID is required" });

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        status: true,
        deleted_at: true,
        suspend_endTime: true,
      },
    });

    if (!user || user.deleted_at) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.status === "deactivated") {
      return res
        .status(400)
        .json({ error: "Deactivated user cannot be unsuspended" });
    }

    if (user.status !== "suspended") {
      return res.json({
        success: true,
        message: "User is not suspended",
        user: {
          id: user.id,
          status: user.status,
          suspend_endTime: user.suspend_endTime,
        },
      });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { status: "active", suspend_endTime: null },
      select: {
        id: true,
        email: true,
        status: true,
        suspend_endTime: true,
      },
    });

    if (updated.email && !isAnonymizedDeletedEmail(updated.email)) {
      const emailContent = emailUnsuspendUser(updated.email);
      await sendEmail(updated.email, "Account Reactivated", emailContent);
    }

    return res.json({
      success: true,
      message: "User unsuspended successfully",
      user: {
        id: updated.id,
        status: updated.status,
        suspend_endTime: updated.suspend_endTime,
      },
    });
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
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "User ID is required" });

    const includeDeleted =
      String(req.query?.includeDeleted || "false").toLowerCase() === "true";

    const subscriptionsLimit = Math.min(
      Math.max(parseInt(req.query?.subscriptionsLimit || "10", 10) || 10, 1),
      100,
    );
    const creatorSubscriptionsLimit = Math.min(
      Math.max(
        parseInt(req.query?.creatorSubscriptionsLimit || "10", 10) || 10,
        1,
      ),
      100,
    );
    const paymentsLimit = Math.min(
      Math.max(parseInt(req.query?.paymentsLimit || "25", 10) || 25, 1),
      200,
    );
    const ordersLimit = Math.min(
      Math.max(parseInt(req.query?.ordersLimit || "25", 10) || 25, 1),
      200,
    );
    const contentsLimit = Math.min(
      Math.max(parseInt(req.query?.contentsLimit || "20", 10) || 20, 1),
      200,
    );

    const u = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        role: true,
        address: true,
        avatar: true,
        bio: true,
        city: true,
        country: true,
        date_of_birth: true,
        gender: true,
        is_subscribed: true,
        phone_number: true,
        created_at: true,
        updated_at: true,
        deleted_at: true,

        creatorChannel: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            avatar: true,
            banner: true,
            channel_category: true,
            created_at: true,
            updated_at: true,
            deleted_at: true,
          },
        },

        storageQuota: {
          select: {
            tier: true,
            total_storage_bytes: true,
            used_storage_bytes: true,
            auto_delete_enabled: true,
            auto_delete_days: true,
            notification_threshold: true,
            updated_at: true,
          },
        },

        // Viewer subscription history
        Subscription: {
          orderBy: { created_at: "desc" },
          take: subscriptionsLimit,
          select: {
            id: true,
            status: true,
            start_date: true,
            end_date: true,
            renewal_date: true,
            plan: true,
            payment_method: true,
            transaction_id: true,
            price: true,
            Services: {
              take: 1,
              select: { id: true, name: true, plan: true, price: true },
            },
            PaymentTransaction: {
              orderBy: { created_at: "desc" },
              take: 1,
              select: {
                id: true,
                status: true,
                provider: true,
                paid_amount: true,
                paid_currency: true,
                created_at: true,
              },
            },
          },
        },

        // Creator subscription history
        CreatorSubscription: {
          orderBy: { created_at: "desc" },
          take: creatorSubscriptionsLimit,
          select: {
            id: true,
            status: true,
            plan: true,
            start_date: true,
            end_date: true,
            renewal_date: true,
            transaction_id: true,
            payment_method: true,
            service: {
              select: {
                id: true,
                name: true,
                plan: true,
                price: true,
                currency: true,
                videos_per_month: true,
              },
            },
            PaymentTransaction: {
              orderBy: { created_at: "desc" },
              take: 1,
              select: {
                id: true,
                status: true,
                provider: true,
                paid_amount: true,
                paid_currency: true,
                created_at: true,
              },
            },
          },
        },

        // Payments (latest)
        PaymentTransaction: {
          orderBy: { created_at: "desc" },
          take: paymentsLimit,
          select: {
            id: true,
            status: true,
            provider: true,
            provider_payment_intent_id: true,
            provider_charge_id: true,
            price: true,
            currency: true,
            paid_amount: true,
            paid_currency: true,
            subscription_id: true,
            creator_subscription_id: true,
            created_at: true,
          },
        },

        orders: {
          orderBy: { created_at: "desc" },
          take: ordersLimit,
          select: {
            id: true,
            created_at: true,
            order_status: true,
            subscription_id: true,
            user_id: true,
            status: true,
            ammount: true,
            pakage_name: true,
            payment_status: true,
          },
        },

        createdContents: {
          where: { deleted_at: null },
          orderBy: { created_at: "desc" },
          take: contentsLimit,
          select: {
            id: true,
            title: true,
            content_type: true,
            content_status: true,
            review_status: true,
            genre: true,
            view_count: true,
            duration_seconds: true,
            created_at: true,
            updated_at: true,
            deleted_at: true,
            s3_bucket: true,
            s3_key: true,
            s3_thumb_key: true,
            original_name: true,
            thumbnail: true,
            video: true,
            Rating: { select: { rating: true } },
          },
        },

        deviceTokens: {
          select: {
            id: true,
            token: true,
            device_name: true,
            device_os: true,
            device_type: true,
          },
        },

        _count: {
          select: {
            Subscription: true,
            CreatorSubscription: true,
            PaymentTransaction: true,
            orders: true,
            createdContents: true,
            downloads: true,
            Favourite: true,
            Rating: true,
            HelpSupport: true,
            deviceTokens: true,
          },
        },
      },
    });

    if (!u || (!includeDeleted && u.deleted_at)) {
      return res.status(404).json({ error: "User not found" });
    }

    const lastPayment = Array.isArray(u.PaymentTransaction)
      ? u.PaymentTransaction[0]
      : null;

    const payload = {
      id: u.id,
      name: u.name,
      email: u.email,
      status: u.status,
      role: u.role,
      profile: {
        avatar: u.avatar,
        address: u.address,
        bio: u.bio,
        city: u.city,
        country: u.country,
        date_of_birth: u.date_of_birth,
        gender: u.gender,
        phone_number: u.phone_number,
        is_subscribed: u.is_subscribed,
      },
      timestamps: {
        created_at: u.created_at,
        updated_at: u.updated_at,
        deleted_at: u.deleted_at,
      },
      creator: {
        channel: u.creatorChannel
          ? {
              id: u.creatorChannel.id,
              name: u.creatorChannel.name,
              slug: u.creatorChannel.slug,
              status: u.creatorChannel.status,
              avatar: u.creatorChannel.avatar,
              banner: u.creatorChannel.banner,
              category: u.creatorChannel.channel_category,
              created_at: u.creatorChannel.created_at,
              updated_at: u.creatorChannel.updated_at,
              deleted_at: u.creatorChannel.deleted_at,
            }
          : null,
      },
      registerDevices: u.deviceTokens || [],
      subscriptions: {
        viewer_history: (u.Subscription || []).map((s) => ({
          id: s.id,
          status: s.status,
          plan: s.plan,
          payment_method: s.payment_method,
          transaction_id: s.transaction_id,
          price: s.price ?? null,
          start_date: s.start_date,
          end_date: s.end_date,
          renewal_date: s.renewal_date,
          service: s.Services?.[0]
            ? {
                id: s.Services[0].id,
                name: s.Services[0].name,
                plan: s.Services[0].plan,
                price: s.Services[0].price,
              }
            : null,
          // last_payment: s.PaymentTransaction?.[0]
          //   ? {
          //       id: s.PaymentTransaction[0].id,
          //       status: s.PaymentTransaction[0].status,
          //       provider: s.PaymentTransaction[0].provider,
          //       paid_amount: s.PaymentTransaction[0].paid_amount,
          //       paid_currency: s.PaymentTransaction[0].paid_currency,
          //       created_at: s.PaymentTransaction[0].created_at,
          //     }
          //   : null,
        })),
        creator_history: (u.CreatorSubscription || []).map((cs) => ({
          id: cs.id,
          status: cs.status,
          plan: cs.plan,
          payment_method: cs.payment_method,
          transaction_id: cs.transaction_id,
          start_date: cs.start_date,
          end_date: cs.end_date,
          renewal_date: cs.renewal_date,
          service: cs.service
            ? {
                id: cs.service.id,
                name: cs.service.name,
                plan: cs.service.plan,
                price: cs.service.price,
                currency: cs.service.currency || "usd",
                videos_per_month: cs.service.videos_per_month,
              }
            : null,
          // last_payment: cs.PaymentTransaction?.[0]
          //   ? {
          //       id: cs.PaymentTransaction[0].id,
          //       status: cs.PaymentTransaction[0].status,
          //       provider: cs.PaymentTransaction[0].provider,
          //       paid_amount: cs.PaymentTransaction[0].paid_amount,
          //       paid_currency: cs.PaymentTransaction[0].paid_currency,
          //       created_at: cs.PaymentTransaction[0].created_at,
          //     }
          //   : null,
        })),
      },
      payments: u.PaymentTransaction || [],
      orders: u.orders || [],
      contents_preview: (u.createdContents || []).map((c) => ({
        ...c,
        media: {
          video_url:
            buildS3Url(c.s3_bucket, c.s3_key) || buildLocalUrl(c.video),
          thumbnail_url:
            buildS3Url(c.s3_bucket, c.s3_thumb_key) ||
            buildLocalUrl(c.thumbnail),
        },
      })),
      storage_quota: u.storageQuota || null,
      last_payment: lastPayment
        ? {
            id: lastPayment.id,
            status: lastPayment.status,
            provider: lastPayment.provider,
            price: lastPayment.price,
            currency: lastPayment.currency,
            paid_amount: lastPayment.paid_amount,
            paid_currency: lastPayment.paid_currency,
            kind: lastPayment.creator_subscription_id
              ? "creator"
              : lastPayment.subscription_id
                ? "viewer"
                : null,
            created_at: lastPayment.created_at,
          }
        : null,
      counts: u._count,
      limits: {
        subscriptionsLimit,
        creatorSubscriptionsLimit,
        paymentsLimit,
        ordersLimit,
        contentsLimit,
      },
    };

    return res.json({ success: true, user: payload });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user" });
    console.log("Error fetching user:", err);
  }
};
