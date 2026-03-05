import prisma from "../../prisma/prisma.js";


const toNumberOrNull = (v) => {
  if (v === undefined || v === null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "bigint") return Number(v);
  // Prisma Decimal
  if (typeof v === "object" && typeof v.toString === "function") {
    const n = Number(v.toString());
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const startOfUtcDay = (date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const startOfUtcMonth = (date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

const addUtcDays = (date, days) => {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
};

const addUtcMonths = (date, months) => {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
};

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const resolveDashboardPeriod = (period, year) => {
  const now = new Date();
  const periodInput = String(period || "yearly").toLowerCase();
  const requestedYear = Number(year);
  const selectedYear = Number.isInteger(requestedYear)
    ? requestedYear
    : now.getUTCFullYear();

  const isYearly = !["7d", "30d", "90d"].includes(periodInput);

  let start;
  let end;
  let days;

  if (isYearly) {
    start = new Date(Date.UTC(selectedYear, 0, 1));
    end = new Date(Date.UTC(selectedYear + 1, 0, 1));
    days = Math.round((end.getTime() - start.getTime()) / 86400000);
  } else {
    end = startOfUtcDay(now);
    days = periodInput === "30d" ? 30 : periodInput === "90d" ? 90 : 7;
    start = addUtcDays(end, -days);
  }

  return {
    isYearly,
    selectedYear,
    start,
    end,
    days,
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
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const sumMoney = (agg) => {
  const paid = toNumberOrNull(agg?._sum?.paid_amount);
  const price = toNumberOrNull(agg?._sum?.price);
  return paid ?? price ?? 0;
};


export const getAdminDashboardOverview = async (req, res) => {
  try {
    const now = new Date();
    const thisMonthStart = startOfUtcMonth(now);
    const nextMonthStart = addUtcMonths(thisMonthStart, 1);

    const [
      totalUsers,
      activeViewerSubscriptions,
      activeCreatorSubscriptions,
      revenueThisMonthAgg,
      topViewedMovie,
      latestUploads,
    ] = await Promise.all([
      prisma.user.count({ where: { deleted_at: null } }),

      prisma.subscription.count({ where: { status: "active" } }),

      prisma.creatorSubscription.count({ where: { status: "active" } }),

      prisma.paymentTransaction.aggregate({
        _sum: { paid_amount: true, price: true },
        where: {
          deleted_at: null,
          status: "succeeded",
          created_at: { gte: thisMonthStart, lt: nextMonthStart },
        },
      }),

      prisma.content.findFirst({
        where: {
          deleted_at: null,
          content_type: "movie",
        },
        orderBy: { view_count: "desc" },
        select: {
          id: true,
          title: true,
          view_count: true,
          thumbnail: true,
          s3_bucket: true,
          s3_thumb_key: true,
        },
      }),

      prisma.content.findMany({
        where: {
          deleted_at: null,
        },
        orderBy: { created_at: "desc" },
        take: 6,
        select: {
          id: true,
          title: true,
          content_type: true,
          created_at: true,
          duration_seconds: true,
          view_count: true,
        },
      }),
    ]);

    const revenueThisMonth = sumMoney(revenueThisMonthAgg);

    res.json({
      success: true,
      cards: {
        total_users: totalUsers,
        active_subscriptions: activeViewerSubscriptions,
        active_creator_subscriptions: activeCreatorSubscriptions,
        revenue_this_month: revenueThisMonth,
        top_viewed_movie: topViewedMovie
          ? {
              id: topViewedMovie.id,
              title: topViewedMovie.title,
              views: topViewedMovie.view_count || 0,
              thumbnail: null,
            }
          : null,
      },
      latest_uploads: latestUploads.map((u) => ({
        id: u.id,
        type: u.content_type,
        title: u.title,
        upload_date: u.created_at,
        duration_seconds: u.duration_seconds,
        duration_formatted: formatDuration(u.duration_seconds),
        views: u.view_count || 0,
      })),
    });
  } catch (error) {
    console.error("Error fetching dashboard overview:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};


// export const getLetestUploads = async (req, res) => {
//   try {
//     const { page = 1, take = 10 } = req.query;
//     const takeN = Math.min(Math.max(parseInt(take, 10) || 10, 1), 100);
//     const pageN = Math.max(parseInt(page, 10) || 1, 1);
//     const skip = (pageN - 1) * takeN;

//     const where = { deleted_at: null };

//     const [uploads, totalUploads] = await Promise.all([
//       prisma.content.findMany({
//         where,
//         orderBy: { created_at: "desc" },
//         skip,
//         take: takeN,
//         select: {
//           id: true,
//           title: true,
//           content_type: true,
//           content_status: true,
//           created_at: true,
//           duration_seconds: true,
//           view_count: true,
//         },
//       }),
//       prisma.content.count({ where }),
//     ]);

//     res.json({
//       uploads: uploads.map((u) => ({
//         id: u.id,
//         type: u.content_type,
//         title: u.title,
//         upload_date: u.created_at,
//         duration_seconds: u.duration_seconds,
//         duration_formatted: formatDuration(u.duration_seconds),
//         views: u.view_count || 0,
//         status: u.content_status,
//       })),
//       totalUploads,
//       page: pageN,
//       take: takeN,
//     });
//   } catch (err) {
//     console.error("Error fetching latest uploads:", err);
//     res.status(500).json({ message: "Internal Server Error" });
//   }
// };

export const getRevenueAnalytics = async (req, res) => {
  try {
    const { period, year } = req.query;
    const { isYearly, selectedYear, start, end, days } = resolveDashboardPeriod(
      period,
      year,
    );

    const revenueAgg = await prisma.paymentTransaction.aggregate({
      _sum: { paid_amount: true, price: true },
      where: {
        deleted_at: null,
        status: "succeeded",
        created_at: { gte: start, lt: end },
      },
    });

    const points = isYearly
      ? await Promise.all(
          MONTH_LABELS.map(async (monthLabel, idx) => {
            const d0 = new Date(Date.UTC(selectedYear, idx, 1));
            const d1 = new Date(Date.UTC(selectedYear, idx + 1, 1));
            const revenueMonthAgg = await prisma.paymentTransaction.aggregate({
              _sum: { paid_amount: true, price: true },
              where: {
                deleted_at: null,
                status: "succeeded",
                created_at: { gte: d0, lt: d1 },
              },
            });

            return {
              label: monthLabel,
              month: idx + 1,
              period_start: d0,
              period_end: d1,
              revenue: sumMoney(revenueMonthAgg),
            };
          }),
        )
      : await Promise.all(
          Array.from({ length: days }).map(async (_, idx) => {
            const d0 = addUtcDays(start, idx);
            const d1 = addUtcDays(start, idx + 1);
            const revenueDayAgg = await prisma.paymentTransaction.aggregate({
              _sum: { paid_amount: true, price: true },
              where: {
                deleted_at: null,
                status: "succeeded",
                created_at: { gte: d0, lt: d1 },
              },
            });

            return {
              date: d0,
              revenue: sumMoney(revenueDayAgg),
            };
          }),
        );

    res.json({
      success: true,
      period: {
        type: isYearly ? "yearly" : "rolling_days",
        year: isYearly ? selectedYear : null,
        start,
        end,
        days,
      },
      totals: {
        revenue: sumMoney(revenueAgg),
      },
      graph_data: {
        granularity: isYearly ? "month" : "day",
        points,
      },
    });
  } catch (error) {
    console.error("Error fetching revenue analytics:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getSubscriptionGrowthAnalytics = async (req, res) => {
  try {
    const { period, year } = req.query;
    const { isYearly, selectedYear, start, end, days } = resolveDashboardPeriod(
      period || "7d",
      year,
    );

    const [viewerNewSubscriptions, creatorNewSubscriptions] = await Promise.all([
      prisma.subscription.count({
        where: { created_at: { gte: start, lt: end } },
      }),
      prisma.creatorSubscription.count({
        where: { deleted_at: null, created_at: { gte: start, lt: end } },
      }),
    ]);

    const points = isYearly
      ? await Promise.all(
          MONTH_LABELS.map(async (monthLabel, idx) => {
            const d0 = new Date(Date.UTC(selectedYear, idx, 1));
            const d1 = new Date(Date.UTC(selectedYear, idx + 1, 1));

            const [
              viewerCreated,
              creatorCreated,
              viewerCanceled,
              creatorCanceled,
            ] = await Promise.all([
              prisma.subscription.count({
                where: { created_at: { gte: d0, lt: d1 } },
              }),
              prisma.creatorSubscription.count({
                where: { deleted_at: null, created_at: { gte: d0, lt: d1 } },
              }),
              prisma.subscription.count({
                where: {
                  OR: [
                    { end_date: { gte: d0, lt: d1 } },
                    { status: "expired", updated_at: { gte: d0, lt: d1 } },
                  ],
                },
              }),
              prisma.creatorSubscription.count({
                where: {
                  deleted_at: null,
                  OR: [
                    { end_date: { gte: d0, lt: d1 } },
                    { status: "expired", updated_at: { gte: d0, lt: d1 } },
                  ],
                },
              }),
            ]);

            return {
              label: monthLabel,
              month: idx + 1,
              period_start: d0,
              period_end: d1,
              new_subscribers: viewerCreated + creatorCreated,
              cancellations: viewerCanceled + creatorCanceled,
              breakdown: {
                viewer: {
                  new_subscribers: viewerCreated,
                  cancellations: viewerCanceled,
                },
                creator: {
                  new_subscribers: creatorCreated,
                  cancellations: creatorCanceled,
                },
              },
            };
          }),
        )
      : await Promise.all(
          Array.from({ length: days }).map(async (_, idx) => {
            const d0 = addUtcDays(start, idx);
            const d1 = addUtcDays(start, idx + 1);

            const [
              viewerCreated,
              creatorCreated,
              viewerCanceled,
              creatorCanceled,
            ] = await Promise.all([
              prisma.subscription.count({
                where: { created_at: { gte: d0, lt: d1 } },
              }),
              prisma.creatorSubscription.count({
                where: { deleted_at: null, created_at: { gte: d0, lt: d1 } },
              }),
              prisma.subscription.count({
                where: {
                  OR: [
                    { end_date: { gte: d0, lt: d1 } },
                    { status: "expired", updated_at: { gte: d0, lt: d1 } },
                  ],
                },
              }),
              prisma.creatorSubscription.count({
                where: {
                  deleted_at: null,
                  OR: [
                    { end_date: { gte: d0, lt: d1 } },
                    { status: "expired", updated_at: { gte: d0, lt: d1 } },
                  ],
                },
              }),
            ]);

            return {
              date: d0,
              new_subscribers: viewerCreated + creatorCreated,
              cancellations: viewerCanceled + creatorCanceled,
              breakdown: {
                viewer: {
                  new_subscribers: viewerCreated,
                  cancellations: viewerCanceled,
                },
                creator: {
                  new_subscribers: creatorCreated,
                  cancellations: creatorCanceled,
                },
              },
            };
          }),
        );

    res.json({
      success: true,
      period: {
        type: isYearly ? "yearly" : "rolling_days",
        year: isYearly ? selectedYear : null,
        start,
        end,
        days,
      },
      totals: {
        new_subscriptions: viewerNewSubscriptions + creatorNewSubscriptions,
        breakdown: {
          viewer: { new_subscriptions: viewerNewSubscriptions },
          creator: { new_subscriptions: creatorNewSubscriptions },
        },
      },
      graph_data: {
        granularity: isYearly ? "month" : "day",
        points,
      },
      subscription_growth_last_week: !isYearly && days === 7 ? points : [],
    });
  } catch (error) {
    console.error("Error fetching subscription growth analytics:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
