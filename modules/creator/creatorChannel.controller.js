import { PrismaClient, ChannelCategory } from "@prisma/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { s3 } from "../libs/s3Clinent.js";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { sendNotifications } from "../../utils/notificationService.js";

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_BASE_URL = process.env.APP_URL || "http://localhost:4005";

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

  return `${PUBLIC_BASE_URL}/uploads/${avatarValue}`;
};

const resolveChannelMediaUrl = (value) => {
  if (!value) return null;
  if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  if (typeof value === "string" && value.includes("/")) {
    const bucket = process.env.AWS_S3_BUCKET;
    return buildPublicS3Url({ bucket, key: value });
  }
  return `${PUBLIC_BASE_URL}/uploads/${value}`;
};

const creatorPlanLabel = (plan) => {
  if (!plan) return null;
  switch (String(plan)) {
    case "most_popular":
      return "Pro Plan";
    case "basic":
      return "Basic Plan";
    case "family":
      return "Family Plan";
    default:
      return String(plan);
  }
};

const toMoney = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
};

const slugify = (value) => {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const buildUniqueSlug = async (base) => {
  const clean = slugify(base);
  if (!clean) return null;

  let candidate = clean;
  for (let i = 0; i < 8; i++) {
    const exists = await prisma.creatorChannel.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
    candidate = `${clean}-${i + 2}`;
  }
  return `${clean}-${Date.now()}`;
};


// My Channel (dashboard payload)
export const getMyCreatorChannelDashboard = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthenticated" });

    const role = req.user?.role;
    if (role !== "creator") {
      return res.status(403).json({
        message: "Only users with creator role can access this dashboard",
        code: "CREATOR_ROLE_REQUIRED",
      });
    }

    const channel = await prisma.creatorChannel.findFirst({
      where: { user_id: userId, deleted_at: null },
      select: {
        id: true,
        user_id: true,
        name: true,
        slug: true,
        bio: true,
        avatar: true,
        banner: true,
        sample_video_link: true,
        channel_category: true,
        status: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!channel) {
      return res.status(404).json({ message: "Creator channel not found" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, avatar: true, role: true },
    });

    const baseContentWhere = {
      deleted_at: null,
      created_by_user_id: userId,
      creator_channel_id: channel.id,
    };

    const [videosCount, viewsAgg, byType] = await Promise.all([
      prisma.content.count({
        where: {
          ...baseContentWhere,
          // Exclude series from the "Videos" box by default (episodes/movies/trailers/etc still count)
          content_type: { not: "series" },
        },
      }),
      prisma.content.aggregate({
        where: baseContentWhere,
        _sum: { view_count: true },
      }),
      prisma.content.groupBy({
        by: ["content_type"],
        where: baseContentWhere,
        _count: { _all: true },
        _sum: { view_count: true },
      }),
    ]);

    const totalViews = Number(viewsAgg?._sum?.view_count ?? 0);
    const breakdown = (byType || []).reduce((acc, row) => {
      acc[String(row.content_type)] = {
        count: Number(row._count?._all ?? 0),
        views: Number(row._sum?.view_count ?? 0),
      };
      return acc;
    }, {});

    const creatorSub = req.creatorSubscription || null;
    const planLabel = creatorPlanLabel(creatorSub?.service?.plan);
    const perMonth = creatorSub?.service?.videos_per_month;

    // Earnings are not yet tracked in DB. Provide a consistent shape with null/0.
    const earningsMode = String(
      process.env.CREATOR_EARNINGS_MODE || "unavailable",
    ).toLowerCase();

    let earnings = {
      mode: earningsMode, // "unavailable" | "estimated" | "tracked"
      currency: "usd",
      total: 0,
      available: 0,
    };

    if (earningsMode === "estimated") {
      const rate = Number(process.env.CREATOR_EARNINGS_RATE_PER_VIEW || 0);
      earnings = {
        ...earnings,
        rate_per_view: Number.isFinite(rate) ? rate : 0,
        total: toMoney(totalViews * (Number.isFinite(rate) ? rate : 0)),
        available: 0,
      };
    }

    return res.json({
      success: true,
      channel,
      channel_media: {
        avatar_url: resolveChannelMediaUrl(channel.avatar),
        banner_url: resolveChannelMediaUrl(channel.banner),
      },
      creator: {
        id: user?.id || userId,
        name: user?.name || null,
        avatar_url: resolveAvatarUrl(user?.avatar),
      },
      stats: {
        total_earnings: earnings.total,
        total_views: totalViews,
        videos: videosCount,
        available: earnings.available,
        breakdown_by_type: breakdown,
      },
      currentPlan: {
        plan: planLabel,
        raw_plan: creatorSub?.service?.plan || null,
        videos_per_month: typeof perMonth === "number" ? perMonth : null,
      },

      notes:
        earningsMode === "unavailable"
          ? [
              "Creator earnings are not yet implemented. This API returns 0 for earnings until tracking is added.",
            ]
          : [],
    });
  } catch (err) {
    console.error("getMyCreatorChannelDashboard error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// Earnings Summary (chart + top videos)
export const getMyCreatorEarningsSummary = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthenticated" });

    const role = req.user?.role;
    if (role !== "creator") {
      return res.status(403).json({
        message: "Only users with creator role can access earnings",
        code: "CREATOR_ROLE_REQUIRED",
      });
    }

    const channel = await prisma.creatorChannel.findFirst({
      where: { user_id: userId, deleted_at: null },
      select: { id: true, name: true, slug: true },
    });

    if (!channel) {
      return res.status(404).json({ message: "Creator channel not found" });
    }

    const baseContentWhere = {
      deleted_at: null,
      created_by_user_id: userId,
      creator_channel_id: channel.id,
    };

    const earningsMode = String(
      process.env.CREATOR_EARNINGS_MODE || "unavailable",
    ).toLowerCase();
    const currency = (
      process.env.CREATOR_EARNINGS_CURRENCY || "usd"
    ).toLowerCase();

    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // We can estimate month-by-month using ContentView (real view events).
    const monthlyBuckets = Array.from({ length: 12 }).map((_, idx) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - idx), 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const label = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
      return { label, start, end };
    });

    let rate = 0;
    if (earningsMode === "estimated") {
      const r = Number(process.env.CREATOR_EARNINGS_RATE_PER_VIEW || 0);
      rate = Number.isFinite(r) ? r : 0;
    }

    const [totalViewsAgg, viewsThisMonth, topVideos, monthlyViews] =
      await Promise.all([
        prisma.content.aggregate({
          where: baseContentWhere,
          _sum: { view_count: true },
        }),
        prisma.contentView.count({
          where: {
            viewed_at: { gte: startOfThisMonth, lt: startOfNextMonth },
            content: baseContentWhere,
          },
        }),
        prisma.content.findMany({
          where: { ...baseContentWhere, content_type: { not: "series" } },
          orderBy: { view_count: "desc" },
          take: 20,
          select: {
            id: true,
            title: true,
            thumbnail: true,
            s3_bucket: true,
            s3_thumb_key: true,
            view_count: true,
            created_at: true,
          },
        }),
        Promise.all(
          monthlyBuckets.map(async (b) => {
            const views = await prisma.contentView.count({
              where: {
                viewed_at: { gte: b.start, lt: b.end },
                content: baseContentWhere,
              },
            });
            return { month: b.label, views };
          }),
        ),
      ]);

    const totalViews = Number(totalViewsAgg?._sum?.view_count ?? 0);

    const points = monthlyViews.map((m) => ({
      month: m.month,
      amount: earningsMode === "estimated" ? toMoney(m.views * rate) : 0,
      views: m.views,
    }));

    const videoWise = topVideos.map((v) => ({
      content: {
        id: v.id,
        title: v.title,
        thumbnail_url:
          (v.s3_bucket && v.s3_thumb_key
            ? buildPublicS3Url({ bucket: v.s3_bucket, key: v.s3_thumb_key })
            : null) ||
          (v.thumbnail ? `${PUBLIC_BASE_URL}/uploads/${v.thumbnail}` : null),
      },
      views: v.view_count || 0,
      amount:
        earningsMode === "estimated" ? toMoney((v.view_count || 0) * rate) : 0,
      published_at: v.created_at,
    }));

    return res.json({
      success: true,
      mode: earningsMode,
      currency,
      totals: {
        total_earnings:
          earningsMode === "estimated" ? toMoney(totalViews * rate) : 0,
        this_month:
          earningsMode === "estimated" ? toMoney(viewsThisMonth * rate) : 0,
        available: 0,
        total_views: totalViews,
        this_month_views: viewsThisMonth,
        rate_per_view: earningsMode === "estimated" ? rate : null,
      },
      chart: {
        group_by: "month",
        points,
      },
      video_wise: videoWise,
      withdraw: {
        enabled: false,
        reason:
          earningsMode === "tracked"
            ? "No available balance"
            : "Withdrawals require tracked earnings (not yet implemented).",
      },
      notes:
        earningsMode === "unavailable"
          ? [
              "No earnings tracking exists yet. Implement CreatorEarningEvent + payout flow to enable this.",
            ]
          : earningsMode === "estimated"
            ? [
                "These values are estimates based on views and CREATOR_EARNINGS_RATE_PER_VIEW.",
              ]
            : [],
    });
  } catch (err) {
    console.error("getMyCreatorEarningsSummary error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// Upload/Update creator channel avatar/banner
export const updateMyCreatorChannelPhoto = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthenticated" });

    const role = req.user?.role;
    if (role !== "creator") {
      if (req.file?.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {
          // ignore
        }
      }
      return res.status(403).json({
        message: "Only users with creator role can update channel photo",
        code: "CREATOR_ROLE_REQUIRED",
      });
    }

    const avatarFile =
      (req.files && (req.files.avatar?.[0] || req.files.photo?.[0])) ||
      req.file ||
      null;
    const bannerFile = (req.files && req.files.banner?.[0]) || null;

    if (!avatarFile && !bannerFile) {
      return res.status(400).json({
        message: "No image uploaded",
        hint: "Upload multipart fields: avatar and/or banner (photo is also accepted as avatar).",
      });
    }

    const channel = await prisma.creatorChannel.findFirst({
      where: { user_id: userId, deleted_at: null },
      select: { id: true, avatar: true, banner: true },
    });

    if (!channel) {
      for (const f of [avatarFile, bannerFile]) {
        if (f?.path) {
          try {
            fs.unlinkSync(f.path);
          } catch {
            // ignore
          }
        }
      }
      return res.status(404).json({ message: "Creator channel not found" });
    }

    const bucket = process.env.AWS_S3_BUCKET;
    if (!bucket) {
      // Keep behavior consistent with user/update-image
      for (const f of [avatarFile, bannerFile]) {
        if (f?.path) {
          try {
            fs.unlinkSync(f.path);
          } catch {
            // ignore
          }
        }
      }

      return res.status(500).json({
        success: false,
        message: "Server misconfiguration: AWS_S3_BUCKET is not set",
      });
    }

    const updateData = {};
    let nextAvatarKey = null;
    let nextBannerKey = null;

    if (avatarFile) {
      const ext = path.extname(avatarFile.originalname || "");
      nextAvatarKey = `channels/${channel.id}/avatar/${randomUUID()}${ext}`;
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: nextAvatarKey,
          Body: fs.createReadStream(avatarFile.path),
          ContentType: avatarFile.mimetype,
        }),
      );
      updateData.avatar = nextAvatarKey;
    }

    if (bannerFile) {
      const ext = path.extname(bannerFile.originalname || "");
      nextBannerKey = `channels/${channel.id}/banner/${randomUUID()}${ext}`;
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: nextBannerKey,
          Body: fs.createReadStream(bannerFile.path),
          ContentType: bannerFile.mimetype,
        }),
      );
      updateData.banner = nextBannerKey;
    }

    // Cleanup local temp files after successful upload(s)
    for (const f of [avatarFile, bannerFile]) {
      if (f?.path) {
        try {
          fs.unlinkSync(f.path);
        } catch {
          // ignore
        }
      }
    }

    // Best-effort delete previous S3 objects
    const toDelete = [];
    if (nextAvatarKey && channel.avatar && String(channel.avatar).includes("/")) {
      toDelete.push(String(channel.avatar));
    }
    if (nextBannerKey && channel.banner && String(channel.banner).includes("/")) {
      toDelete.push(String(channel.banner));
    }
    for (const key of toDelete) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      } catch {
        // ignore
      }
    }

    const updatedChannel = await prisma.creatorChannel.update({
      where: { id: channel.id },
      data: updateData,
      select: {
        id: true,
        user_id: true,
        name: true,
        slug: true,
        avatar: true,
        banner: true,
        status: true,
        updated_at: true,
      },
    });

    return res.json({
      success: true,
      message: "Channel media updated successfully",
      channel: updatedChannel,
      channel_media: {
        avatar_url: resolveChannelMediaUrl(updatedChannel.avatar),
        banner_url: resolveChannelMediaUrl(updatedChannel.banner),
      },
    });
  } catch (err) {
    console.error("updateMyCreatorChannelPhoto error:", err);

    const files = [];
    if (req.file) files.push(req.file);
    if (req.files?.avatar?.[0]) files.push(req.files.avatar[0]);
    if (req.files?.banner?.[0]) files.push(req.files.banner[0]);
    if (req.files?.photo?.[0]) files.push(req.files.photo[0]);
    for (const f of files) {
      if (f?.path) {
        try {
          fs.unlinkSync(f.path);
        } catch {
          // ignore
        }
      }
    }

    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// Withdraw earnings (placeholder until tracked earnings exist)
export const requestCreatorEarningsWithdrawal = async (req, res) => {
  const mode = String(
    process.env.CREATOR_EARNINGS_MODE || "unavailable",
  ).toLowerCase();
  return res.status(501).json({
    success: false,
    code: "CREATOR_EARNINGS_NOT_IMPLEMENTED",
    message:
      mode === "tracked"
        ? "Withdrawals are not yet implemented."
        : "Creator earnings are not tracked yet; withdrawals are unavailable.",
  });
};

export const requestCreatorChannel = async (req, res) => {
  try {
    const { userId, role } = req.user;
    if (!userId) return res.status(401).json({ message: "Unauthenticated" });

    if (role !== "creator") {
      return res.status(403).json({
        message: "Only users with creator role can request a creator channel",
        code: "CREATOR_CHANNEL_ROLE_INVALID",
      });
    }

    const { name, bio, category_name, sample_video_link } = req.body;

    if (!name || String(name).trim().length < 3) {
      return res.status(400).json({ message: "Channel name is required" });
    }

    const bioText = bio === undefined || bio === null ? "" : String(bio).trim();
    const bioWords = bioText
      ? bioText
          .split(/\s+/)
          .map((w) => w.trim())
          .filter(Boolean)
      : [];
    if (bioWords.length < 50 || bioWords.length > 500) {
      return res.status(400).json({
        message: "Short Bio must be 50-500 words",
        code: "CREATOR_CHANNEL_BIO_WORDS_INVALID",
        words: bioWords.length,
        min: 50,
        max: 500,
      });
    }

    if (!category_name) {
      return res.status(400).json({
        message: "Content category is required",
        code: "CREATOR_CHANNEL_CATEGORY_REQUIRED",
      });
    }

    const categoryValue = String(category_name);
    const allowed = Object.values(ChannelCategory);
    if (!allowed.includes(categoryValue)) {
      return res.status(400).json({
        message: "Content category is invalid",
        code: "CREATOR_CHANNEL_CATEGORY_INVALID",
        allowed,
      });
    }

    let sampleVideoLink =
      sample_video_link === undefined || sample_video_link === null
        ? null
        : String(sample_video_link).trim();
    if (sampleVideoLink) {
      try {
        const u = new URL(sampleVideoLink);
        if (u.protocol !== "http:" && u.protocol !== "https:") {
          return res.status(400).json({
            message: "Sample video link must be a valid URL",
            code: "CREATOR_CHANNEL_SAMPLE_LINK_INVALID",
          });
        }
      } catch {
        return res.status(400).json({
          message: "Sample video link must be a valid URL",
          code: "CREATOR_CHANNEL_SAMPLE_LINK_INVALID",
        });
      }
    }

    const slug = await buildUniqueSlug(name);
    if (!slug) {
      return res.status(400).json({ message: "Invalid channel name" });
    }

    const existing = await prisma.creatorChannel.findUnique({
      where: { user_id: userId },
    });

    // If pending/approved, do not allow creating again
    if (
      existing &&
      existing.deleted_at === null &&
      existing.status !== "rejected"
    ) {
      return res.status(400).json({
        message: "Channel request already exists",
        channel: existing,
      });
    }

    const data = {
      name: name,
      slug,
      bio: bioText,
      channel_category: categoryValue,
      sample_video_link: sampleVideoLink,
      status: "pending",
      reviewed_by_user_id: null,
      reviewed_at: null,
      review_note: null,
      deleted_at: null,
    };

    const channel = existing
      ? await prisma.creatorChannel.update({
          where: { id: existing.id },
          data,
        })
      : await prisma.creatorChannel.create({
          data: {
            user_id: userId,
            ...data,
          },
        });

    try {
      const admins = await prisma.user.findMany({
        where: { role: "admin", deleted_at: null },
        select: { id: true },
      });
      await sendNotifications({
        receiverIds: admins.map((a) => a.id),
        type: "creator_channel.submitted",
        entityId: channel.id,
        text: `New creator channel request: ${channel.name}`,
      });
    } catch (e) {
      console.error("Error notifying admins for channel request:", e);
    }

    const creatorSub = await prisma.creatorSubscription.findFirst({
      where: { user_id: userId, status: "active" },
      select: {
        id: true,
        plan: true,
        status: true,
        transaction_id: true,
        start_date: true,
        end_date: true,
        renewal_date: true,
        creator_service_id: true,
      },
    });

    const creatorService = creatorSub?.creator_service_id
      ? await prisma.creatorService.findUnique({
          where: { id: creatorSub.creator_service_id },
          select: {
            id: true,
            name: true,
            plan: true,
            price: true,
            currency: true,
            videos_per_month: true,
          },
        })
      : null;

    const requestDetails = {
      submitted_at: channel.created_at,
      reviewed_at: channel.reviewed_at,
      channel_name: channel.name,
      category: channel.channel_category,
      creator_plan: creatorService
        ? {
            name: creatorService.plan,
            price: creatorService.price,
            currency: creatorService.currency || "usd",
            interval: "month",
          }
        : null,
    };

    return res.status(201).json({
      success: true,
      message: "Channel request submitted successfully",
      channel,
      requestDetails,
      creatorSubscription: creatorSub
        ? { ...creatorSub, service: creatorService }
        : null,
    });
  } catch (err) {
    console.error("requestCreatorChannel error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const updateCreatorChannel = async (req, res) => {
  try {
    const { userId, role } = req.user;

    if (!userId) return res.status(401).json({ message: "Unauthenticated" });
    
    if (role !== "creator") {
      return res.status(403).json({
        message: "Only users with creator role can update a creator channel",
        code: "CREATOR_CHANNEL_ROLE_INVALID",
      });
    }

    const channel = await prisma.creatorChannel.findFirst({
      where: { user_id: userId, deleted_at: null },
      select: { id: true, status: true, name: true, slug: true },
    });

    if (!channel) {
      return res.status(404).json({ message: "Creator channel not found" });
    }

    const { name, bio, category_name, sample_video_link } = req.body;

    const updateData = {};

    if (name !== undefined) {
      const nextName = String(name || "").trim();
      if (nextName.length < 3) {
        return res.status(400).json({
          message: "Channel name must be at least 3 characters",
          code: "CREATOR_CHANNEL_NAME_INVALID",
        });
      }
      updateData.name = nextName;

      // Keep slug stable once approved to avoid breaking links.
      if (channel.status !== "approved" && nextName !== channel.name) {
        const nextSlug = await buildUniqueSlug(nextName);
        if (!nextSlug) {
          return res.status(400).json({
            message: "Invalid channel name",
            code: "CREATOR_CHANNEL_NAME_INVALID",
          });
        }
        updateData.slug = nextSlug;
      }
    }

    if (bio !== undefined) {
      const bioText = bio === null ? "" : String(bio).trim();
      if (!bioText) {
        return res.status(400).json({
          message: "Short Bio is required",
          code: "CREATOR_CHANNEL_BIO_REQUIRED",
        });
      }
      const bioWords = bioText
        .split(/\s+/)
        .map((w) => w.trim())
        .filter(Boolean);
      if (bioWords.length < 50 || bioWords.length > 500) {
        return res.status(400).json({
          message: "Short Bio must be 50-500 words",
          code: "CREATOR_CHANNEL_BIO_WORDS_INVALID",
          words: bioWords.length,
          min: 50,
          max: 500,
        });
      }
      updateData.bio = bioText;
    }

    if (category_name !== undefined) {
      if (category_name === null || String(category_name).trim() === "") {
        return res.status(400).json({
          message: "Content category is required",
          code: "CREATOR_CHANNEL_CATEGORY_REQUIRED",
        });
      }
      const categoryValue = String(category_name);
      const allowed = Object.values(ChannelCategory);
      if (!allowed.includes(categoryValue)) {
        return res.status(400).json({
          message: "Content category is invalid",
          code: "CREATOR_CHANNEL_CATEGORY_INVALID",
          allowed,
        });
      }

      updateData.channel_category = categoryValue;
    }

    if (sample_video_link !== undefined) {
      let sampleVideoLink =
        sample_video_link === null ? "" : String(sample_video_link).trim();
      if (sampleVideoLink) {
        try {
          const u = new URL(sampleVideoLink);
          if (u.protocol !== "http:" && u.protocol !== "https:") {
            return res.status(400).json({
              message: "Sample video link must be a valid URL",
              code: "CREATOR_CHANNEL_SAMPLE_LINK_INVALID",
            });
          }
        } catch {
          return res.status(400).json({
            message: "Sample video link must be a valid URL",
            code: "CREATOR_CHANNEL_SAMPLE_LINK_INVALID",
          });
        }
      } else {
        sampleVideoLink = null;
      }
      updateData.sample_video_link = sampleVideoLink;
    }

    if (!Object.keys(updateData).length) {
      return res.status(400).json({
        message: "No fields provided to update",
        code: "CREATOR_CHANNEL_NOTHING_TO_UPDATE",
      });
    }

    const updatedChannel = await prisma.creatorChannel.update({
      where: { id: channel.id },
      data: updateData,
    });
    return res.json({
      success: true,
      message: "Creator channel updated successfully",
      channel: updatedChannel,
    });
  } catch (err) {
    console.error("updateCreatorChannel error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getMyCreatorChannelStatus = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthenticated" });

    const channel = await prisma.creatorChannel.findFirst({
      where: { user_id: userId, deleted_at: null },
      select: {
        id: true,
        name: true,
        status: true,
        review_note: true,
        created_at: true,
        reviewed_at: true,
        channel_category: true,
      },
    });
    if (!channel) {
      return res.status(404).json({ message: "Creator channel not found" });
    }

    // Active creator subscription + service for the "Most Popular: $9.99/month" style UI
    const creatorSub = await prisma.creatorSubscription.findFirst({
      where: { user_id: userId, status: "active" },
      select: {
        id: true,
        plan: true,
        status: true,
        transaction_id: true,
        start_date: true,
        end_date: true,
        renewal_date: true,
        creator_service_id: true,
      },
    });

    const creatorService = creatorSub?.creator_service_id
      ? await prisma.creatorService.findUnique({
          where: { id: creatorSub.creator_service_id },
          select: {
            id: true,
            name: true,
            plan: true,
            price: true,
            currency: true,
            videos_per_month: true,
          },
        })
      : null;

    const requestDetails = {
      submitted_at: channel.created_at,
      reviewed_at: channel.reviewed_at,
      channel_name: channel.name,
      category: channel.channel_category,
      creator_plan: creatorService
        ? {
            name: creatorService.plan,
            price: creatorService.price,
            currency: creatorService.currency || "usd",
            interval: "month",
          }
        : null,
    };

    return res.json({
      success: true,
      status: channel.status,
      review_note: channel.review_note,
      requestDetails,
      creatorSubscription: creatorSub
        ? { ...creatorSub, service: creatorService }
        : null,
    });
  } catch (err) {
    console.error("getMyCreatorChannelStatus error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const deleteMyCreatorChannel = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthenticated" });

    const role = req.user?.role;
    if (role !== "creator") {
      return res.status(403).json({
        message: "Only users with creator role can delete a creator channel",
        code: "CREATOR_CHANNEL_ROLE_INVALID",
      });
    }

    const existing = await prisma.creatorChannel.findUnique({
      where: { user_id: userId },
      select: { id: true, deleted_at: true },
    });

    if (!existing) {
      return res.status(404).json({ message: "Creator channel not found" });
    }

    if (existing.deleted_at) {
      return res.json({
        success: true,
        message: "Creator channel already deleted",
      });
    }

    await prisma.creatorChannel.update({
      where: { id: existing.id },
      data: { deleted_at: new Date() },
    });

    return res.json({
      success: true,
      message: "Creator channel deleted successfully",
    });
  } catch (err) {
    console.error("deleteMyCreatorChannel error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
