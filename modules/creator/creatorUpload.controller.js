import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import { mediaQueue } from "../libs/queue.js";
import { sendNotifications } from "../../utils/notificationService.js";

const prisma = new PrismaClient();

const PUBLIC_BASE_URL = process.env.APP_URL || "http://localhost:4005";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";

const buildS3Url = (bucket, key) => {
  if (!bucket || !key) return null;
  if (process.env.AWS_S3_ENDPOINT) {
    return `${process.env.AWS_S3_ENDPOINT}/${bucket}/${key}`;
  }
  return `https://${bucket}.s3.${AWS_REGION}.amazonaws.com/${key}`;
};

const buildLocalUrl = (file) => {
  return file ? `${PUBLIC_BASE_URL}/uploads/${file}` : null;
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

const slugToArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim());
  if (typeof value === "string") {
    return value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
};

const mapRelatedContentCard = (c) => {
  if (!c) return null;
  return {
    id: c.id,
    title: c.title,
    content_type: c.content_type,
    thumbnail:
      buildS3Url(c.s3_bucket, c.s3_thumb_key) || buildLocalUrl(c.thumbnail),
  };
};

const formatDuration = (seconds) => {
  if (seconds === undefined || seconds === null) return null;
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return null;
  const total = Math.round(n);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
};

const buildTypeDetails = ({
  content_type,
  series_id,
  season_number,
  episode_number,
  trailer_for_id,
  parent_series,
  trailer_for,
  countEpisodes,
  countTrailers,
  episodes,
}) => {
  if (content_type === "series") {
    return {
      series: {
        episodes_count: countEpisodes ?? 0,
        trailers_count: countTrailers ?? 0,
        episodes: Array.isArray(episodes)
          ? episodes.map((e) => ({
              id: e.id,
              title: e.title,
              content_type: e.content_type,
              season_number: e.season_number,
              episode_number: e.episode_number,
              thumbnail:
                buildS3Url(e.s3_bucket, e.s3_thumb_key) ||
                buildLocalUrl(e.thumbnail),
              duration_seconds: e.duration_seconds,
              duration_formatted: formatDuration(e.duration_seconds),
              release_date: e.release_date,
              status: {
                content_status: e.content_status,
                review_status: e.review_status,
              },
            }))
          : [],
      },
    };
  }
  if (content_type === "episode") {
    return {
      episode: {
        season_number,
        episode_number,
        series: parent_series || (series_id ? { id: series_id } : null),
      },
    };
  }
  if (content_type === "trailer") {
    return {
      trailer: {
        for: trailer_for || (trailer_for_id ? { id: trailer_for_id } : null),
      },
    };
  }
  return {};
};

export const createCreatorUpload = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthenticated" });

    const role = req.user?.role;
    if (role !== "creator") {
      return res.status(403).json({
        message: "Only users with creator role can upload videos",
        code: "CREATOR_ROLE_REQUIRED",
      });
    }

    // verifyCreatorSubscribed sets this
    const creatorSub = req.creatorSubscription;
    if (!creatorSub) {
      return res.status(403).json({
        message: "Creator subscription required",
        code: "CREATOR_SUBSCRIPTION_REQUIRED",
      });
    }

    // Must have approved channel
    const channel = await prisma.creatorChannel.findFirst({
      where: { user_id: userId, deleted_at: null },
      select: { id: true, status: true },
    });
    if (!channel) {
      return res.status(403).json({
        message: "Creator channel required",
        code: "CREATOR_CHANNEL_REQUIRED",
      });
    }
    if (channel.status !== "approved") {
      return res.status(403).json({
        message: "Creator channel is not approved",
        code: "CREATOR_CHANNEL_NOT_APPROVED",
        status: channel.status,
      });
    }

    // File(s)
    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: "Video file is required" });
    }

    const videoFile = req.files.file[0];
    const thumbnailFile = req.files.thumbnail ? req.files.thumbnail[0] : null;

    const {
      title,
      description,
      genre,
      category_id,
      content_type,
      quality,
      is_premium,
      series_id,
      season_number,
      episode_number,
      trailer_for_id,
      release_date,
    } = req.body;

    if (!title) return res.status(400).json({ error: "Title is required" });
    if (!category_id) {
      return res.status(400).json({ error: "Category is required" });
    }

    const contentTypeValue = content_type || "movie";

    if (contentTypeValue === "episode") {
      if (!series_id) {
        return res
          .status(400)
          .json({ error: "series_id is required for episodes" });
      }
      if (!season_number || !episode_number) {
        return res.status(400).json({
          error: "season_number and episode_number are required for episodes",
        });
      }

      const series = await prisma.content.findFirst({
        where: {
          id: String(series_id),
          deleted_at: null,
          content_type: "series",
          created_by_user_id: userId,
          creator_channel_id: channel.id,
        },
        select: { id: true },
      });
      if (!series) {
        return res.status(400).json({
          error: "series_id does not reference a valid series",
          code: "CREATOR_SERIES_NOT_FOUND",
        });
      }
    }

    if (contentTypeValue === "trailer") {
      if (trailer_for_id) {
        const referencedContent = await prisma.content.findFirst({
          where: {
            id: trailer_for_id,
            deleted_at: null,
          },
        });
        if (!referencedContent) {
          return res.status(400).json({
            error: "trailer_for_id does not reference a valid content",
          });
        }
      }
    }

    // Enforce videos/month if set
    const perMonth = creatorSub.service?.videos_per_month;
    if (typeof perMonth === "number" && perMonth > 0) {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfNextMonth = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        1,
      );

      const uploadedCount = await prisma.content.count({
        where: {
          deleted_at: null,
          created_by_user_id: userId,
          creator_channel_id: channel.id,
          created_at: {
            gte: startOfMonth,
            lt: startOfNextMonth,
          },
        },
      });

      if (uploadedCount >= perMonth) {
        return res.status(429).json({
          message: "Monthly upload limit reached",
          code: "CREATOR_UPLOAD_LIMIT_REACHED",
          limit: perMonth,
          used: uploadedCount,
        });
      }
    }

    const genreArray = slugToArray(genre);

    const content = await prisma.content.create({
      data: {
        title,
        description: description ?? null,
        genre: genreArray.length ? genreArray : [],
        category_id,
        content_type: contentTypeValue,
        mime_type: videoFile.mimetype,
        quality: quality ?? null,
        is_premium: is_premium === "true" || is_premium === true,
        original_name: videoFile.originalname,
        file_size_bytes: BigInt(videoFile.size),
        storage_provider: "local",
        content_status: "uploading_local",
        thumbnail: thumbnailFile ? thumbnailFile.filename : null,
        series_id: series_id ?? null,
        season_number: season_number ? parseInt(season_number) : null,
        episode_number: episode_number ? parseInt(episode_number) : null,
        trailer_for_id: trailer_for_id ?? null,
        release_date: release_date ? new Date(release_date) : null,

        created_by_user_id: userId,
        creator_channel_id: channel.id,
        review_status: "pending",
      },
    });

    const created = {
      id: content.id,
      basic: {
        title: content.title,
        description: content.description,
        content_type: content.content_type,
        quality: content.quality,
        release_date: content.release_date,
        is_premium: content.is_premium,
        category_id: content.category_id,
      },
      status: {
        content_status: content.content_status,
        review_status: content.review_status,
      },
      ...buildTypeDetails({
        content_type: content.content_type,
        series_id: content.series_id,
        season_number: content.season_number,
        episode_number: content.episode_number,
        trailer_for_id: content.trailer_for_id,
      }),
      timestamps: {
        created_at: content.created_at,
        updated_at: content.updated_at,
      },
    };

    res.status(201).json({
      success: true,
      message: "Upload initiated. Awaiting admin approval.",
      content: created,
    });

    try {
      const admins = await prisma.user.findMany({
        where: { role: "admin", deleted_at: null },
        select: { id: true },
      });
      await sendNotifications({
        receiverIds: admins.map((a) => a.id),
        type: "creator_content.submitted",
        entityId: content.id,
        text: `New creator content awaiting approval: ${content.title || "(untitled)"}`,
      });
    } catch (e) {
      console.error("Error notifying admins for creator upload:", e);
    }

    await mediaQueue.add(
      "push-to-s3",
      {
        contentId: content.id,
        localPath: videoFile.path,
        thumbnailPath: thumbnailFile ? thumbnailFile.path : null,
      },
      {
        attempts: 5,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  } catch (err) {
    next(err);
  } finally {
    // do not cleanup here: worker needs localPath; only cleanup if content create fails before queue
  }
};

export const getCreatorUploadedVideoDetails = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;

    if (!userId) return res.status(401).json({ message: "Unauthenticated" });

    const role = req.user?.role;
    if (role !== "creator") {
      return res.status(403).json({
        message: "Only users with creator role can view uploaded video details",
        code: "CREATOR_ROLE_REQUIRED",
      });
    }

    const row = await prisma.content.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        genre: true,
        category: { select: { id: true, name: true, slug: true } },
        content_type: true,
        content_status: true,
        review_status: true,
        reviewed_at: true,
        review_note: true,
        reviewed_by: { select: { id: true, name: true, email: true } },
        is_premium: true,
        quality: true,
        duration_seconds: true,
        release_date: true,
        series_id: true,
        season_number: true,
        episode_number: true,
        trailer_for_id: true,
        parent_series: {
          select: {
            id: true,
            title: true,
            content_type: true,
            thumbnail: true,
            s3_bucket: true,
            s3_thumb_key: true,
          },
        },
        trailer_for: {
          select: {
            id: true,
            title: true,
            content_type: true,
            thumbnail: true,
            s3_bucket: true,
            s3_thumb_key: true,
          },
        },
        episodes: {
          where: { deleted_at: null },
          orderBy: [
            { season_number: "asc" },
            { episode_number: "asc" },
            { created_at: "asc" },
          ],
          select: {
            id: true,
            title: true,
            content_type: true,
            season_number: true,
            episode_number: true,
            duration_seconds: true,
            release_date: true,
            content_status: true,
            review_status: true,
            thumbnail: true,
            s3_bucket: true,
            s3_thumb_key: true,
          },
        },
        _count: { select: { episodes: true, trailers: true } },
        storage_provider: true,
        s3_bucket: true,
        s3_key: true,
        s3_thumb_key: true,
        video: true,
        thumbnail: true,
        view_count: true,
        created_at: true,
        updated_at: true,
        created_by_user_id: true,
        creator_channel_id: true,
        creator_channel: {
          select: { id: true, name: true, slug: true, status: true },
        },
        deleted_at: true,
      },
    });

    if (!row || row.deleted_at) {
      return res.status(404).json({ message: "Content not found" });
    }

    if (row.created_by_user_id !== userId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (!row.creator_channel_id) {
      return res.status(400).json({
        message: "Not a creator upload",
        code: "CREATOR_CONTENT_REQUIRED",
      });
    }

    const videoUrl =
      buildS3Url(row.s3_bucket, row.s3_key) || buildLocalUrl(row.video);
    const thumbnailUrl =
      buildS3Url(row.s3_bucket, row.s3_thumb_key) ||
      buildLocalUrl(row.thumbnail);

    const parentSeries = mapRelatedContentCard(row.parent_series);
    const trailerFor = mapRelatedContentCard(row.trailer_for);

    let statusLabel = "Pending";
    if (row.review_status === "rejected") statusLabel = "Rejected";
    else if (
      row.review_status === "approved" &&
      row.content_status === "published"
    )
      statusLabel = "Published";

    const content = {
      id: row.id,
      basic: {
        title: row.title,
        description: row.description,
        genre: row.genre,
        category: row.category,
        content_type: row.content_type,
        quality: row.quality,
        release_date: row.release_date,
        is_premium: row.is_premium,
      },
      status: {
        label: statusLabel,
        content_status: row.content_status,
        review_status: row.review_status,
      },
      media: {
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
        duration_seconds: row.duration_seconds,
        duration_formatted: formatDuration(row.duration_seconds),
        storage_provider: row.storage_provider,
      },
      review: {
        reviewed_at: row.reviewed_at,
        note: row.review_note,
        reviewed_by: row.reviewed_by,
      },
      relationships: {
        ...buildTypeDetails({
          content_type: row.content_type,
          series_id: row.series_id,
          season_number: row.season_number,
          episode_number: row.episode_number,
          trailer_for_id: row.trailer_for_id,
          parent_series: parentSeries,
          trailer_for: trailerFor,
          countEpisodes: row._count?.episodes,
          countTrailers: row._count?.trailers,
          episodes: row.content_type === "series" ? row.episodes : undefined,
        }),
      },
      monetization: {
        earnings: null,
        currency: "usd",
      },
      stats: {
        views: row.view_count || 0,
      },
      creator: {
        channel: row.creator_channel,
      },
      timestamps: {
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
    };

    return res.json({ success: true, content });
  } catch (err) {
    console.error("getCreatorUploadedVideoDetails error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const listCreatorUploads = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthenticated" });

    const role = req.user?.role;
    if (role !== "creator") {
      return res.status(403).json({
        message: "Only users with creator role can view uploaded videos",
        code: "CREATOR_ROLE_REQUIRED",
      });
    }

    const page = Math.max(parseInt(req.query.page || "1", 10) || 1, 1);
    const limitRaw = parseInt(req.query.limit || "20", 10) || 20;
    const limit = Math.min(Math.max(limitRaw, 1), 100);
    const skip = (page - 1) * limit;

    // UI Tabs: All | Published | Pending | Rejected
    const tab = req.query.tab ? String(req.query.tab).toLowerCase() : "all";
    const review_status = req.query.review_status
      ? String(req.query.review_status)
      : null;
    const content_status = req.query.content_status
      ? String(req.query.content_status)
      : null;

    const baseWhere = {
      deleted_at: null,
      created_by_user_id: userId,
      creator_channel_id: { not: null },
    };

    // If legacy filters passed, keep supporting them. Otherwise, use tab behavior.
    let where = {
      ...baseWhere,
      ...(review_status ? { review_status } : {}),
      ...(content_status ? { content_status } : {}),
    };

    if (!review_status && !content_status) {
      if (tab === "published") {
        where = {
          ...baseWhere,
          review_status: "approved",
          content_status: "published",
        };
      } else if (tab === "pending") {
        where = {
          ...baseWhere,
          review_status: "pending",
        };
      } else if (tab === "rejected") {
        where = {
          ...baseWhere,
          review_status: "rejected",
        };
      }
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const creatorSub = req.creatorSubscription;
    const perMonth = creatorSub?.service?.videos_per_month;
    const planLabel = creatorPlanLabel(creatorSub?.service?.plan);

    const usedThisMonthPromise = prisma.content.count({
      where: {
        ...baseWhere,
        created_at: {
          gte: startOfMonth,
          lt: startOfNextMonth,
        },
      },
    });

    const countsPromise = Promise.all([
      prisma.content.count({ where: baseWhere }),
      prisma.content.count({
        where: {
          ...baseWhere,
          review_status: "approved",
          content_status: "published",
        },
      }),
      prisma.content.count({
        where: { ...baseWhere, review_status: "pending" },
      }),
      prisma.content.count({
        where: { ...baseWhere, review_status: "rejected" },
      }),
    ]).then(([all, published, pending, rejected]) => ({
      all,
      published,
      pending,
      rejected,
    }));

    const listPromise = Promise.all([
      prisma.content.count({ where }),
      prisma.content.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          description: true,
          content_type: true,
          category_id: true,
          genre: true,
          quality: true,
          is_premium: true,
          thumbnail: true,
          s3_bucket: true,
          s3_thumb_key: true,
          content_status: true,
          review_status: true,
          view_count: true,
          series_id: true,
          season_number: true,
          episode_number: true,
          trailer_for_id: true,
          parent_series: {
            select: {
              id: true,
              title: true,
              content_type: true,
              thumbnail: true,
              s3_bucket: true,
              s3_thumb_key: true,
            },
          },
          trailer_for: {
            select: {
              id: true,
              title: true,
              content_type: true,
              thumbnail: true,
              s3_bucket: true,
              s3_thumb_key: true,
            },
          },
          _count: { select: { episodes: true, trailers: true } },
          created_at: true,
          updated_at: true,
        },
      }),
    ]);

    const [usedThisMonth, counts, [total, rows]] = await Promise.all([
      usedThisMonthPromise,
      countsPromise,
      listPromise,
    ]);

    const items = rows.map((r) => {
      let statusLabel = "Pending";
      if (r.review_status === "rejected") statusLabel = "Rejected";
      else if (
        r.review_status === "approved" &&
        r.content_status === "published"
      )
        statusLabel = "Published";

      const parentSeries = mapRelatedContentCard(r.parent_series);
      const trailerFor = mapRelatedContentCard(r.trailer_for);

      return {
        id: r.id,
        basic: {
          title: r.title,
          content_type: r.content_type,
          is_premium: r.is_premium,
        },
        status: {
          label: statusLabel,
          review_status: r.review_status,
          content_status: r.content_status,
        },
        media: {
          thumbnail_url:
            buildS3Url(r.s3_bucket, r.s3_thumb_key) ||
            buildLocalUrl(r.thumbnail),
        },
        relationships: {
          ...buildTypeDetails({
            content_type: r.content_type,
            series_id: r.series_id,
            season_number: r.season_number,
            episode_number: r.episode_number,
            trailer_for_id: r.trailer_for_id,
            parent_series: parentSeries,
            trailer_for: trailerFor,
            countEpisodes: r._count?.episodes,
            countTrailers: r._count?.trailers,
          }),
        },
        monetization: {
          earnings: null,
          currency: "usd",
        },
        stats: {
          views: r.view_count || 0,
        },
        timestamps: {
          uploaded_at: r.created_at,
        },
      };
    });

    return res.json({
      success: true,
      tab,
      uploadLimit: {
        plan: planLabel,
        used: usedThisMonth,
        limit: typeof perMonth === "number" ? perMonth : null,
        period_start: startOfMonth,
        period_end: startOfNextMonth,
      },
      counts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      items,
    });
  } catch (err) {
    console.error("listCreatorUploads error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
