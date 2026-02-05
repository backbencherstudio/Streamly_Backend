import { PrismaClient } from "@prisma/client";

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

const parsePageTake = (req) => {
  const page = Math.max(parseInt(req.query.page || "1", 10) || 1, 1);
  const takeRaw = parseInt(req.query.take || req.query.limit || "20", 10) || 20;
  const take = Math.min(Math.max(takeRaw, 1), 100);
  const skip = (page - 1) * take;
  return { page, take, skip };
};

const normalizeReviewStatus = (value) => {
  if (value === undefined || value === null) return null;
  const v = String(value).trim();
  if (!v) return null;
  const allowed = ["pending", "approved", "rejected"];
  if (!allowed.includes(v)) return { error: true, allowed };
  return v;
};

const normalizeNote = (note) => {
  if (note === undefined || note === null) return null;
  const v = String(note).trim();
  return v ? v : null;
};

const serialize = (data) =>
  JSON.parse(
    JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
  );

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
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
};

export const listPendingCreatorContent = async (req, res) => {
  try {
    const { page, take, skip } = parsePageTake(req);
    const status = normalizeReviewStatus(
      req.query.status || req.query.review_status || "pending",
    );
    if (status?.error) {
      return res.status(400).json({
        message: "Invalid status filter",
        code: "CREATOR_CONTENT_STATUS_INVALID",
        allowed: status.allowed,
      });
    }

    const q = req.query.q ? String(req.query.q).trim() : "";
    const creator_channel_id = req.query.creator_channel_id
      ? String(req.query.creator_channel_id).trim()
      : null;
    const category_id = req.query.category_id
      ? String(req.query.category_id).trim()
      : null;
    const created_by_user_id = req.query.user_id
      ? String(req.query.user_id).trim()
      : null;

    const baseWhere = {
      deleted_at: null,
      creator_channel_id: { not: null },
    };

    const where = {
      ...baseWhere,
      review_status: status || "pending",
      ...(creator_channel_id ? { creator_channel_id } : {}),
      ...(category_id ? { category_id } : {}),
      ...(created_by_user_id ? { created_by_user_id } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
              {
                creator_channel: {
                  is: { name: { contains: q, mode: "insensitive" } },
                },
              },
              {
                created_by: {
                  is: { email: { contains: q, mode: "insensitive" } },
                },
              },
            ],
          }
        : {}),
    };

    const countsWhere = { ...baseWhere };

    const [filteredTotal, all, pending, approved, rejected, rows] =
      await Promise.all([
        prisma.content.count({ where }),
        prisma.content.count({ where: countsWhere }),
        prisma.content.count({
          where: { ...countsWhere, review_status: "pending" },
        }),
        prisma.content.count({
          where: { ...countsWhere, review_status: "approved" },
        }),
        prisma.content.count({
          where: { ...countsWhere, review_status: "rejected" },
        }),
        prisma.content.findMany({
          where,
          orderBy: { created_at: "desc" },
          skip,
          take,
          select: {
            id: true,
            title: true,
            description: true,
            content_type: true,
            content_status: true,
            review_status: true,
            created_at: true,
            updated_at: true,
            view_count: true,
            is_premium: true,
            series_id: true,
            season_number: true,
            episode_number: true,
            trailer_for_id: true,
            category: { select: { id: true, name: true, slug: true } },
            creator_channel: {
              select: {
                id: true,
                name: true,
                slug: true,
                status: true,
                user: { select: { id: true, name: true, email: true } },
              },
            },
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
            _count: {
              select: {
                episodes: true,
                trailers: true,
              },
            },
            created_by: { select: { id: true, name: true, email: true } },
            reviewed_by: { select: { id: true, name: true, email: true } },
            reviewed_at: true,
            review_note: true,
            s3_bucket: true,
            s3_key: true,
            s3_thumb_key: true,
            video: true,
            thumbnail: true,
          },
        }),
      ]);

    const contents = rows.map((r) => {
      const videoUrl =
        buildS3Url(r.s3_bucket, r.s3_key) || buildLocalUrl(r.video);
      const thumbUrl =
        buildS3Url(r.s3_bucket, r.s3_thumb_key) || buildLocalUrl(r.thumbnail);

      const parentSeries = mapRelatedContentCard(r.parent_series);
      const trailerFor = mapRelatedContentCard(r.trailer_for);

      const contentMeta = {
        series:
          r.content_type === "series"
            ? {
                episodes_count: r._count?.episodes ?? 0,
                trailers_count: r._count?.trailers ?? 0,
              }
            : null,
        episode:
          r.content_type === "episode"
            ? {
                series_id: r.series_id,
                season_number: r.season_number,
                episode_number: r.episode_number,
                parent_series: parentSeries,
              }
            : null,
        trailer:
          r.content_type === "trailer"
            ? {
                trailer_for_id: r.trailer_for_id,
                trailer_for: trailerFor,
              }
            : null,
        trailers_count: r._count?.trailers ?? 0,
      };

      return {
        ...serialize(r),
        video: videoUrl,
        thumbnail: thumbUrl,
        content_meta: contentMeta,
        s3_bucket: undefined,
        s3_key: undefined,
        s3_thumb_key: undefined,
      };
    });

    return res.json({
      success: true,
      status: status || "pending",
      counts: { all, pending, approved, rejected },
      pagination: {
        page,
        take,
        total: filteredTotal,
        totalPages: Math.ceil(filteredTotal / take),
      },
      contents,
    });
  } catch (err) {
    console.error("listPendingCreatorContent error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getCreatorContentDetails = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        message: "id is required",
        code: "CREATOR_CONTENT_ID_REQUIRED",
      });
    }

    const row = await prisma.content.findUnique({
      where: { id },
      select: {
        id: true,
        deleted_at: true,
        title: true,
        description: true,
        content_type: true,
        content_status: true,
        review_status: true,
        created_at: true,
        updated_at: true,
        view_count: true,
        is_premium: true,
        quality: true,
        duration_seconds: true,
        release_date: true,
        series_id: true,
        season_number: true,
        episode_number: true,
        trailer_for_id: true,
        category: { select: { id: true, name: true, slug: true } },
        creator_channel: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
        created_by: { select: { id: true, name: true, email: true } },
        reviewed_by: { select: { id: true, name: true, email: true } },
        reviewed_at: true,
        review_note: true,
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
        _count: {
          select: {
            episodes: true,
            trailers: true,
          },
        },
        s3_bucket: true,
        s3_key: true,
        s3_thumb_key: true,
        video: true,
        thumbnail: true,
        creator_channel_id: true,
      },
    });

    if (!row || row.deleted_at) {
      return res.status(404).json({ message: "Content not found" });
    }
    if (!row.creator_channel_id) {
      return res.status(400).json({ message: "Not a creator content" });
    }

    const videoUrl =
      buildS3Url(row.s3_bucket, row.s3_key) || buildLocalUrl(row.video);
    const thumbUrl =
      buildS3Url(row.s3_bucket, row.s3_thumb_key) ||
      buildLocalUrl(row.thumbnail);

    const parentSeries = mapRelatedContentCard(row.parent_series);
    const trailerFor = mapRelatedContentCard(row.trailer_for);

    const videoStorage =
      row.s3_bucket && row.s3_key ? "s3" : row.video ? "local" : null;
    const thumbStorage =
      row.s3_bucket && row.s3_thumb_key ? "s3" : row.thumbnail ? "local" : null;

    const typeDetails =
      row.content_type === "series"
        ? {
            series: {
              episodes_count: row._count?.episodes ?? 0,
              trailers_count: row._count?.trailers ?? 0,
            },
          }
        : row.content_type === "episode"
          ? {
              episode: {
                season_number: row.season_number,
                episode_number: row.episode_number,
                series: parentSeries || (row.series_id ? { id: row.series_id } : null),
              },
            }
          : row.content_type === "trailer"
            ? {
                trailer: {
                  for: trailerFor ||
                    (row.trailer_for_id ? { id: row.trailer_for_id } : null),
                },
              }
            : {};

    const content = {
      id: row.id,
      basic: {
        title: row.title,
        description: row.description,
        category: row.category,
        content_type: row.content_type,
        quality: row.quality,
        release_date: row.release_date,
        is_premium: row.is_premium,
      },
      status: {
        content_status: row.content_status,
        review_status: row.review_status,
      },
      media: {
        video_url: videoUrl,
        thumbnail_url: thumbUrl,
        storage: {
          video: videoStorage,
          thumbnail: thumbStorage,
        },
        duration_seconds: row.duration_seconds,
        duration_formatted: formatDuration(row.duration_seconds),
      },
      creator: {
        channel: row.creator_channel,
        created_by: row.created_by,
      },
      review: {
        reviewed_by: row.reviewed_by,
        reviewed_at: row.reviewed_at,
        note: row.review_note,
      },
      ...typeDetails,
      stats: {
        view_count: row.view_count,
      },
      timestamps: {
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
    };

    return res.json({ success: true, content });
  } catch (err) {
    console.error("getCreatorContentDetails error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const approveCreatorContent = async (req, res) => {
  try {
    const { id } = req.params;
    const adminUserId = req.user?.userId;
    const noteValue = normalizeNote(req.body?.note);

    if (!id) {
      return res.status(400).json({
        message: "id is required",
        code: "CREATOR_CONTENT_ID_REQUIRED",
      });
    }
    if (!adminUserId) {
      return res.status(401).json({ message: "Unauthenticated" });
    }

    const row = await prisma.content.findUnique({
      where: { id },
      select: {
        id: true,
        deleted_at: true,
        creator_channel_id: true,
        review_status: true,
      },
    });

    if (!row || row.deleted_at) {
      return res.status(404).json({ message: "Content not found" });
    }

    if (!row.creator_channel_id) {
      return res.status(400).json({ message: "Not a creator content" });
    }

    if (row.review_status === "approved") {
      const content = await prisma.content.findUnique({ where: { id } });
      return res.json({
        success: true,
        message: "Content already approved",
        content: serialize(content),
      });
    }

    const updated = await prisma.content.update({
      where: { id },
      data: {
        review_status: "approved",
        reviewed_by_user_id: adminUserId,
        reviewed_at: new Date(),
        review_note: noteValue,
      },
    });

    return res.json({
      success: true,
      message: "Content approved",
      content: serialize(updated),
    });
  } catch (err) {
    console.error("approveCreatorContent error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const rejectCreatorContent = async (req, res) => {
  try {
    const { id } = req.params;
    const adminUserId = req.user?.userId;
    const noteValue = normalizeNote(req.body?.note);

    if (!id) {
      return res.status(400).json({
        message: "id is required",
        code: "CREATOR_CONTENT_ID_REQUIRED",
      });
    }
    if (!adminUserId) {
      return res.status(401).json({ message: "Unauthenticated" });
    }

    const row = await prisma.content.findUnique({
      where: { id },
      select: {
        id: true,
        deleted_at: true,
        creator_channel_id: true,
        review_status: true,
      },
    });
    if (!row || row.deleted_at) {
      return res.status(404).json({ message: "Content not found" });
    }
    if (!row.creator_channel_id) {
      return res.status(400).json({ message: "Not a creator content" });
    }

    if (row.review_status === "rejected") {
      const content = await prisma.content.findUnique({ where: { id } });
      return res.json({
        success: true,
        message: "Content already rejected",
        content: serialize(content),
      });
    }

    const updated = await prisma.content.update({
      where: { id },
      data: {
        review_status: "rejected",
        reviewed_by_user_id: adminUserId,
        reviewed_at: new Date(),
        review_note: noteValue,
      },
    });

    return res.json({
      success: true,
      message: "Content rejected",
      content: serialize(updated),
    });
  } catch (err) {
    console.error("rejectCreatorContent error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
