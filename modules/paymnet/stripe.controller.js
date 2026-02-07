import { sendNotification } from "../../utils/notificationService.js";
import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});
const prisma = new PrismaClient();

const QUOTA_GB = 1024n * 1024n * 1024n;
const PLAN_QUOTA_BYTES = {
  basic: 5n * QUOTA_GB,
  most_popular: 50n * QUOTA_GB,
  family: 100n * QUOTA_GB,
};

const SUBSCRIPTION_STATUS_VALUES = [
  "active",
  "inactive",
  "suspended",
  "expired",
  "deactivated",
];
const VIEWER_PLAN_VALUES = ["most_popular", "basic", "family", "No_plan"];
const CREATOR_PLAN_VALUES = ["basic", "family", "most_popular"];
const PAYMENT_METHOD_VALUES = ["No_pay", "credit_card", "stripe", "paypal"];

function parseCsv(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  return String(value)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function filterAllowed(values, allowed) {
  const allowedSet = new Set(allowed);
  return (values || []).filter((v) => allowedSet.has(v));
}

function toBool(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  return String(value).toLowerCase() === "true";
}

function normalizePlan(value) {
  if (!value) return null;
  const plan = String(value);
  if (plan === "basic" || plan === "most_popular" || plan === "family") {
    return plan;
  }
  return null;
}

function normalizeCreatorPlan(value) {
  return normalizePlan(value);
}

function normalizeKind(value) {
  if (!value) return null;
  const k = String(value).toLowerCase();
  if (k === "viewer" || k === "creator") return k;
  return null;
}

function startOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function startOfPreviousMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
}

function safePercentChange(current, previous) {
  const c = Number(current || 0);
  const p = Number(previous || 0);
  if (p <= 0) return null;
  return ((c - p) / p) * 100;
}

function toNumberOrNull(v) {
  if (v === undefined || v === null) return null;
  const n = typeof v === "bigint" ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function pickMoneySum(agg) {
  const paid = toNumberOrNull(agg?._sum?.paid_amount);
  const price = toNumberOrNull(agg?._sum?.price);
  return paid ?? price ?? 0;
}

export const getSubscriptionDashboardStats = async (req, res) => {
  try {
    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const prevMonthStart = startOfPreviousMonth(now);

    /* ---------------- ALL TIME SUBSCRIBERS ---------------- */

    const [
      viewerUsers,
      creatorUsers,
      activeViewerCount,
      activeCreatorCount,
      viewerPopularPlan,
      creatorPopularPlan,
    ] = await Promise.all([
      prisma.subscription.findMany({
        distinct: ["user_id"],
        where: { user_id: { not: null } },
        select: { user_id: true },
      }),

      prisma.creatorSubscription.findMany({
        distinct: ["user_id"],
        select: { user_id: true },
      }),

      prisma.subscription.count({
        where: { status: "active" },
      }),

      prisma.creatorSubscription.count({
        where: { status: "active" },
      }),

      prisma.subscription.groupBy({
        by: ["plan"],
        where: { status: "active" },
        _count: { plan: true },
        orderBy: { _count: { plan: "desc" } },
        take: 1,
      }),

      prisma.creatorSubscription.groupBy({
        by: ["plan"],
        where: { status: "active" },
        _count: { plan: true },
        orderBy: { _count: { plan: "desc" } },
        take: 1,
      }),
    ]);

    const totalViewer = viewerUsers.length;
    const totalCreator = creatorUsers.length;
    const totalSubscribers = totalViewer + totalCreator;

    const activeSubscriptions = activeViewerCount + activeCreatorCount;

    const retentionPercent =
      totalSubscribers > 0
        ? (activeSubscriptions / totalSubscribers) * 100
        : null;

    /* ---------------- MONTHLY REVENUE ONLY ---------------- */

    const [revThisAgg, revPrevAgg, txThisCount, currencyRow] =
      await Promise.all([
        prisma.paymentTransaction.aggregate({
          where: {
            status: "succeeded",
            created_at: { gte: thisMonthStart },
          },
          _sum: { paid_amount: true, price: true },
        }),

        prisma.paymentTransaction.aggregate({
          where: {
            status: "succeeded",
            created_at: { gte: prevMonthStart, lt: thisMonthStart },
          },
          _sum: { paid_amount: true, price: true },
        }),

        prisma.paymentTransaction.count({
          where: {
            status: "succeeded",
            created_at: { gte: thisMonthStart },
          },
        }),

        prisma.paymentTransaction.findFirst({
          where: {
            status: "succeeded",
            created_at: { gte: thisMonthStart },
          },
          orderBy: { created_at: "desc" },
          select: { paid_currency: true, currency: true },
        }),
      ]);

    const revenueThisMonth = pickMoneySum(revThisAgg);
    const revenuePrevMonth = pickMoneySum(revPrevAgg);

    const revenueGrowthPercent = safePercentChange(
      revenueThisMonth,
      revenuePrevMonth,
    );

    const currency = (
      currencyRow?.paid_currency ||
      currencyRow?.currency ||
      "usd"
    ).toLowerCase();

    const avgSubscriptionValue =
      activeSubscriptions > 0 ? revenueThisMonth / activeSubscriptions : 0;

    /* ---------------- RESPONSE ---------------- */

    return res.json({
      success: true,
      timeframe: {
        monthStart: thisMonthStart,
        previousMonthStart: prevMonthStart,
      },
      cards: {
        total_subscribers: {
          value: totalSubscribers,
          breakdown: {
            viewer: totalViewer,
            creator: totalCreator,
          },
        },

        active_subscriptions: {
          value: activeSubscriptions,
          retention_percent: retentionPercent,
        },

        monthly_revenue: {
          value: revenueThisMonth,
          growth_percent: revenueGrowthPercent,
          currency,
        },

        avg_subscription_value: {
          value: avgSubscriptionValue,
          currency,
          based_on_transactions: txThisCount,
          most_popular_plan: {
            viewer: viewerPopularPlan?.[0]
              ? {
                  plan: viewerPopularPlan[0].plan,
                  count: viewerPopularPlan[0]._count.plan,
                }
              : null,
            creator: creatorPopularPlan?.[0]
              ? {
                  plan: creatorPopularPlan[0].plan,
                  count: creatorPopularPlan[0]._count.plan,
                }
              : null,
          },
        },
      },
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    return res.status(500).json({ error: "Failed to fetch dashboard stats" });
  }
};

async function upsertQuotaForPlanTx(tx, userId, planValue) {
  const plan = normalizePlan(planValue);
  if (!plan) return;
  const totalBytes = PLAN_QUOTA_BYTES[plan];
  if (totalBytes === undefined) return;

  await tx.userStorageQuota.upsert({
    where: { user_id: userId },
    update: {
      tier: plan,
      total_storage_bytes: totalBytes,
    },
    create: {
      user_id: userId,
      tier: plan,
      total_storage_bytes: totalBytes,
      used_storage_bytes: 0n,
    },
  });
}

async function deleteQuotaTx(tx, userId) {
  await tx.userStorageQuota.deleteMany({ where: { user_id: userId } });
}

export const getAllSubscriptions = async (req, res) => {
  try {
    const kindParam = req.query?.kind
      ? String(req.query.kind).toLowerCase()
      : "all";
    const kindNormalized = normalizeKind(kindParam);
    const kind = kindParam === "all" ? "all" : kindNormalized || "all";

    const includePayments = toBool(req.query?.includePayments, false);
    const includeDeleted = toBool(req.query?.includeDeleted, false);

    const page = Math.max(parseInt(req.query?.page || "1", 10) || 1, 1);
    const limitRaw = parseInt(req.query?.limit || "20", 10) || 20;
    const limit = Math.min(Math.max(limitRaw, 1), 100);
    const skip = (page - 1) * limit;

    const q = req.query?.q ? String(req.query.q).trim() : "";
    const userId = req.query?.user_id ? String(req.query.user_id).trim() : "";

    const statusFilter = filterAllowed(
      parseCsv(req.query?.status),
      SUBSCRIPTION_STATUS_VALUES,
    );
    const paymentMethodFilter = filterAllowed(
      parseCsv(req.query?.payment_method),
      PAYMENT_METHOD_VALUES,
    );

    const planRaw = parseCsv(req.query?.plan);
    const viewerPlanFilter = filterAllowed(planRaw, VIEWER_PLAN_VALUES);
    const creatorPlanFilter = filterAllowed(planRaw, CREATOR_PLAN_VALUES);

    const includeViewer = kind === "all" || kind === "viewer";
    const includeCreator = kind === "all" || kind === "creator";

    const takeEach = skip + limit;

    const viewerWhere = {
      ...(statusFilter.length ? { status: { in: statusFilter } } : {}),
      ...(viewerPlanFilter.length ? { plan: { in: viewerPlanFilter } } : {}),
      ...(paymentMethodFilter.length
        ? { payment_method: { in: paymentMethodFilter } }
        : {}),
      ...(userId ? { user_id: userId } : {}),
      ...(q
        ? {
            user: {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
              ],
            },
          }
        : {}),
    };

    const creatorWhere = {
      ...(includeDeleted ? {} : { deleted_at: null }),
      ...(statusFilter.length ? { status: { in: statusFilter } } : {}),
      ...(creatorPlanFilter.length ? { plan: { in: creatorPlanFilter } } : {}),
      ...(paymentMethodFilter.length
        ? { payment_method: { in: paymentMethodFilter } }
        : {}),
      ...(userId ? { user_id: userId } : {}),
      ...(q
        ? {
            user: {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
              ],
            },
          }
        : {}),
    };

    const [viewerTotal, creatorTotal, viewerRows, creatorRows] =
      await Promise.all([
        includeViewer ? prisma.subscription.count({ where: viewerWhere }) : 0,
        includeCreator
          ? prisma.creatorSubscription.count({ where: creatorWhere })
          : 0,
        includeViewer
          ? prisma.subscription.findMany({
              where: viewerWhere,
              orderBy: { created_at: "desc" },
              take: takeEach,
              select: {
                id: true,
                created_at: true,
                start_date: true,
                end_date: true,
                renewal_date: true,
                plan: true,
                payment_method: true,
                status: true,
                transaction_id: true,
                price: true,
                user_id: true,
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    status: true,
                    role: true,
                    deleted_at: true,
                  },
                },
                Services: {
                  take: 1,
                  select: {
                    id: true,
                    plan: true,
                    name: true,
                    price: true,
                  },
                },
                PaymentTransaction: includePayments
                  ? {
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
                        created_at: true,
                      },
                    }
                  : false,
              },
            })
          : [],
        includeCreator
          ? prisma.creatorSubscription.findMany({
              where: creatorWhere,
              orderBy: { created_at: "desc" },
              take: takeEach,
              select: {
                id: true,
                created_at: true,
                deleted_at: true,
                start_date: true,
                end_date: true,
                renewal_date: true,
                plan: true,
                payment_method: true,
                status: true,
                transaction_id: true,
                user_id: true,
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    status: true,
                    role: true,
                    deleted_at: true,
                  },
                },
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
                PaymentTransaction: includePayments
                  ? {
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
                        created_at: true,
                      },
                    }
                  : false,
              },
            })
          : [],
      ]);

    const viewerSubs = (viewerRows || []).map((s) => ({
      kind: "viewer",
      id: s.id,
      status: s.status,
      plan: s.plan,
      payment_method: s.payment_method,
      transaction_id: s.transaction_id,
      price: s.price ?? null,
      created_at: s.created_at,
      start_date: s.start_date,
      end_date: s.end_date,
      renewal_date: s.renewal_date,
      deleted_at: null,
      user: s.user
        ? {
            id: s.user.id,
            name: s.user.name,
            email: s.user.email,
            status: s.user.status,
            role: s.user.role,
            deleted_at: s.user.deleted_at,
          }
        : s.user_id
          ? { id: s.user_id }
          : null,
      service: s.Services?.[0]
        ? {
            id: s.Services[0].id,
            name: s.Services[0].name,
            plan: s.Services[0].plan,
            price: s.Services[0].price,
          }
        : null,
      last_payment: includePayments
        ? s.PaymentTransaction?.[0] || null
        : undefined,
    }));

    const creatorSubs = (creatorRows || []).map((s) => ({
      kind: "creator",
      id: s.id,
      status: s.status,
      plan: s.plan,
      payment_method: s.payment_method,
      transaction_id: s.transaction_id,
      price: null,
      created_at: s.created_at,
      start_date: s.start_date,
      end_date: s.end_date,
      renewal_date: s.renewal_date,
      deleted_at: s.deleted_at,
      user: s.user
        ? {
            id: s.user.id,
            name: s.user.name,
            email: s.user.email,
            status: s.user.status,
            role: s.user.role,
            deleted_at: s.user.deleted_at,
          }
        : s.user_id
          ? { id: s.user_id }
          : null,
      service: s.service
        ? {
            id: s.service.id,
            name: s.service.name,
            plan: s.service.plan,
            price: s.service.price,
            currency: s.service.currency || "usd",
            videos_per_month: s.service.videos_per_month,
          }
        : null,
      last_payment: includePayments
        ? s.PaymentTransaction?.[0] || null
        : undefined,
    }));

    const merged = [...viewerSubs, ...creatorSubs].sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });

    const subscriptions = merged.slice(skip, skip + limit);
    const total = viewerTotal + creatorTotal;

    return res.json({
      success: true,
      kind,
      filters: {
        q: q || null,
        user_id: userId || null,
        status: statusFilter.length ? statusFilter : null,
        plan: planRaw.length ? planRaw : null,
        payment_method: paymentMethodFilter.length ? paymentMethodFilter : null,
        includeDeleted,
        includePayments,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      totals: {
        viewer: viewerTotal,
        creator: creatorTotal,
        all: total,
      },
      subscriptions,
    });
  } catch (error) {
    console.error("Error fetching subscriptions:", error);
    res.status(500).json({ error: "Failed to fetch subscriptions" });
  }
};

export const getSubscriptionById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "Subscription ID is required" });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
            role: true,
            status: true,
            deleted_at: true,
          },
        },
        Services: true,
        PaymentTransaction: {
          orderBy: { created_at: "desc" },
          take: 1,
        },
      },
    });

    const creatorSubscription = await prisma.creatorSubscription.findFirst({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
            role: true,
            status: true,
            deleted_at: true,
          },
        },
        service: true,
        PaymentTransaction: {
          orderBy: { created_at: "desc" },
          take: 1,
        },
      },
    });

    res.json({
      success: true,
      data: subscription ? subscription : creatorSubscription,
    });
  } catch (error) {
    console.error("Error fetching subscription:", error);
    res.status(500).json({ error: "Failed to fetch subscription" });
  }
};

// List saved payment methods for the logged-in user
export const getSavedPaymentMethods = async (req, res) => {
  try {
    const { userId } = req.user;
    if (!userId) return res.status(401).json({ error: "Unauthenticated user" });

    console.log("user id", userId);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.customer_id) {
      return res
        .status(404)
        .json({ error: "No Stripe customer found for user" });
    }

    // Fetch all card payment methods for this customer
    const paymentMethods = await stripe.paymentMethods.list({
      customer: user.customer_id,
      type: "card",
    });

    res.json({
      success: true,
      paymentMethods: paymentMethods.data.map((pm) => ({
        id: pm.id,
        brand: pm.card.brand,
        last4: pm.card.last4,
        exp_month: pm.card.exp_month,
        exp_year: pm.card.exp_year,
        name: pm.billing_details.name,
      })),
    });
  } catch (error) {
    console.error("Error fetching saved payment methods:", error);
    res.status(500).json({ error: "Failed to fetch payment methods" });
  }
};

/* ======================================================
   CREATE SUBSCRIPTION (first payment happens instantly)
====================================================== */

async function createStripeSubscriptionViewerImpl(req, res) {
  try {
    const { paymentMethodId, service_id } = req.body;
    const { userId, email } = req.user;

    if (!paymentMethodId || !service_id) {
      return res.status(400).json({ error: "Missing data" });
    }

    const service = await prisma.services.findUnique({
      where: { id: service_id },
    });

    if (!service) return res.status(404).json({ error: "Service not found" });

    // Downgrade guard: if the user is currently a creator, require canceling creator subscription first.
    const activeCreator = await prisma.creatorSubscription.findFirst({
      where: { user_id: userId, status: "active" },
      select: {
        transaction_id: true,
        plan: true,
        status: true,
        creator_service_id: true,
      },
    });
    if (activeCreator) {
      return res.status(409).json({
        error: "Active creator subscription found",
        code: "CREATOR_SUB_ACTIVE",
        message:
          "You currently have an active creator subscription. Cancel it first to downgrade to a viewer plan.",
        creator: {
          subscriptionId: activeCreator.transaction_id,
          plan: activeCreator.plan,
          status: activeCreator.status,
          creator_service_id: activeCreator.creator_service_id,
        },
        next: {
          method: "POST",
          endpoint: "/api/payments/cancel-subscription",
          body: {
            kind: "creator",
            subscriptionId: activeCreator.transaction_id,
          },
        },
      });
    }

    let user = await prisma.user.findUnique({ where: { id: userId } });

    /* ===== Check for active subscription of same plan ===== */
    const activeSub = await prisma.subscription.findFirst({
      where: { user_id: userId, plan: service.plan, status: "active" },
    });

    if (activeSub) {
      return res.status(400).json({
        error: "You already have an active subscription for this service",
        subscriptionId: activeSub.transaction_id,
        status: activeSub.status,
      });
    }

    /* ===== Ensure Stripe Customer ===== */
    if (!user.customer_id) {
      const customer = await stripe.customers.create({
        email,
        name: user.name || "",
      });

      user = await prisma.user.update({
        where: { id: userId },
        data: { customer_id: customer.id },
      });
    }

    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: user.customer_id,
    });

    await stripe.customers.update(user.customer_id, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    /* ===== Create Product & Price (once) ===== */
    let priceId = service.stripe_price_id;

    if (!priceId) {
      const product = await stripe.products.create({ name: service.name });
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: Math.round(service.price * 100),
        currency: "usd",
        recurring: { interval: "month" },
      });

      await prisma.services.update({
        where: { id: service_id },
        data: { stripe_product_id: product.id, stripe_price_id: price.id },
      });

      priceId = price.id;
    }

    /* ===== Check if user has any other subscription (upgrade/downgrade) ===== */
    const existingSub = await prisma.subscription.findFirst({
      where: { user_id: userId, status: "active" },
    });

    let subscription;

    if (existingSub) {
      // Upgrade/Downgrade: update existing Stripe subscription item (do not rely on DB-stored item id)
      const stripeExistingSub = await stripe.subscriptions.retrieve(
        existingSub.transaction_id,
      );
      const stripeItemId = stripeExistingSub.items?.data?.[0]?.id;
      if (!stripeItemId) {
        return res
          .status(400)
          .json({ error: "Could not find Stripe subscription item to update" });
      }

      subscription = await stripe.subscriptions.update(
        existingSub.transaction_id,
        {
          cancel_at_period_end: false,
          items: [{ id: stripeItemId, price: priceId }],
          // Ensure an immediate invoice/payment is generated for the plan change.
          // (create_prorations defers the proration charges to the next invoice, which can look like "no payment happened".)
          proration_behavior: "always_invoice",
          expand: ["latest_invoice.payment_intent"],
          metadata: {
            kind: "viewer",
            user_id: userId,
            service_id,
            plan: service.plan,
          },
        },
      );

      // Keep local DB aligned immediately (webhook will finalize dates/status)
      await prisma.subscription.update({
        where: { id: existingSub.id },
        data: {
          plan: service.plan,
          Services: { set: [{ id: service_id }] },
        },
      });

      // Return clientSecret for frontend to confirm payment if needed
      res.json({
        subscriptionId: subscription.id,
        clientSecret:
          subscription.latest_invoice.payment_intent?.client_secret || null,
        status: subscription.status,
        message: "Subscription updated (upgrade/downgrade)",
      });
      return;
    }

    /* ===== Create new subscription ===== */
    subscription = await stripe.subscriptions.create({
      customer: user.customer_id,
      items: [{ price: priceId }],
      expand: ["latest_invoice.payment_intent"],
      metadata: {
        kind: "viewer",
        user_id: userId,
        service_id,
        plan: service.plan,
      },
    });

    const invoice = subscription.latest_invoice;
    const paymentIntentId = invoice.payment_intent?.id;

    if (subscription.status === "active" && paymentIntentId) {
      // directly call the same logic as onRecurringSuccess
      await onRecurringSuccess(invoice);
    }

    res.json({
      subscriptionId: subscription.id,
      clientSecret:
        subscription.latest_invoice.payment_intent?.client_secret || null,
      status: subscription.status,
      message: "Subscription created successfully",
    });
  } catch (err) {
    console.error("Stripe subscription error:", err);
    res.status(400).json({ error: err.message });
  }
}

/* ======================================================
   STRIPE WEBHOOK HANDLER
====================================================== */

export const handleStripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];

  if (!sig) {
    return res.status(400).json({ error: "Missing stripe-signature header" });
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error("Webhook signature error:", err.message);
    return res.status(400).send(err.message);
  }

  try {
    switch (event.type) {
      case "invoice.payment_succeeded":
      case "invoice.paid":
        await onRecurringSuccess(event.data.object);
        break;

      case "invoice.payment_failed":
        await onRecurringFailed(event.data.object);
        break;

      case "customer.subscription.deleted":
        await onSubscriptionCanceled(event.data.object);
        break;

      case "customer.subscription.updated":
        await onSubscriptionUpdated(event.data.object);
        break;

      default:
        break;
    }
  } catch (err) {
    console.error("Webhook processing error:", err);
  }

  res.json({ received: true });
};

/* ======================================================
   WEBHOOK BUSINESS LOGIC
====================================================== */

async function onRecurringSuccess(invoice) {
  if (!invoice.subscription) return;

  const subscriptionId = invoice.subscription;
  const paymentIntentId = invoice.payment_intent?.id || invoice.payment_intent;

  const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);

  const metadata = stripeSub.metadata || {};
  const kind = String(metadata.kind || "viewer");
  if (kind === "creator") {
    await onCreatorRecurringSuccess(invoice, stripeSub);
    return;
  }

  let user_id = metadata.user_id;
  const service_id = metadata.service_id;
  const plan =
    metadata.plan === "most_popular" ||
    metadata.plan === "basic" ||
    metadata.plan === "family" ||
    metadata.plan === "No_plan"
      ? metadata.plan
      : "No_plan";

  if (!user_id && invoice.customer) {
    const dbUser = await prisma.user.findFirst({
      where: { customer_id: String(invoice.customer) },
      select: { id: true },
    });
    user_id = dbUser?.id;
  }
  if (!user_id) return;

  const line = invoice.lines?.data?.[0];
  const period = line?.period;
  if (!period?.start || !period?.end) return;

  const amount = invoice.amount_paid / 100;
  const currency = invoice.currency;

  await prisma.$transaction(async (tx) => {
    /* ===== Subscription ===== */

    const existingSub = await tx.subscription.findFirst({
      where: { transaction_id: subscriptionId },
    });

    let subscriptionDbId;

    if (existingSub) {
      await tx.subscription.update({
        where: { id: existingSub.id },
        data: {
          end_date: new Date(period.end * 1000),
          renewal_date: new Date(period.end * 1000),
          status: "active",
          payment_method: "stripe",
          plan,
          ...(service_id
            ? { Services: { set: [{ id: service_id }] } }
            : undefined),
        },
      });
      subscriptionDbId = existingSub.id;
    } else {
      const createdSub = await tx.subscription.create({
        data: {
          user_id,
          email: invoice.customer_email || "",
          plan,
          transaction_id: subscriptionId,
          start_date: new Date(period.start * 1000),
          end_date: new Date(period.end * 1000),
          renewal_date: new Date(period.end * 1000),
          price: amount,
          payment_method: "stripe",
          status: "active",
          ...(service_id
            ? { Services: { connect: [{ id: service_id }] } }
            : undefined),
        },
      });
      subscriptionDbId = createdSub.id;
    }

    /* ===== Payment Transaction ===== */

    await tx.paymentTransaction.upsert({
      where: { provider_payment_intent_id: paymentIntentId },
      update: {
        status: "succeeded",
        paid_amount: amount,
        paid_currency: currency,
        subscription_id: subscriptionDbId,
      },
      create: {
        provider: "stripe",
        provider_payment_intent_id: paymentIntentId,
        provider_customer_id: invoice.customer,
        price: amount,
        currency,
        paid_amount: amount,
        paid_currency: currency,
        status: "succeeded",
        user_id,
        subscription_id: subscriptionDbId,
      },
    });

    // Do not overwrite creator role if the user is a creator.
    const existingUser = await tx.user.findUnique({
      where: { id: user_id },
      select: { role: true },
    });

    await tx.user.update({
      where: { id: user_id },
      data: {
        is_subscribed: true,
        role: existingUser?.role === "creator" ? "creator" : "premium",
      },
    });

    // Initialize/upgrade storage quota after successful subscription payment
    await upsertQuotaForPlanTx(tx, user_id, plan);
  });
  await sendNotification({
    receiverId: user_id,
    type: "subscription.payment_succeeded",
    text: "Your subscription payment succeeded. Your plan is active.",
  });
}

async function cancelViewerSubscriptionForUpgrade(userId) {
  try {
    const viewer = await prisma.subscription.findFirst({
      where: { user_id: userId, status: "active", payment_method: "stripe" },
      select: { transaction_id: true },
    });

    if (!viewer?.transaction_id) return;

    // Immediate cancel (upgrade): creator plan already provides viewer access.
    const canceled = await stripe.subscriptions.cancel(viewer.transaction_id);

    const endDate = canceled?.ended_at
      ? new Date(canceled.ended_at * 1000)
      : new Date();

    await prisma.subscription.updateMany({
      where: { transaction_id: viewer.transaction_id },
      data: {
        status: "deactivated",
        end_date: endDate,
        renewal_date: endDate,
      },
    });
  } catch (err) {
    console.error("cancelViewerSubscriptionForUpgrade error:", err);
  }
}

async function onCreatorRecurringSuccess(invoice, stripeSub) {
  if (!invoice.subscription) return;

  const subscriptionId = invoice.subscription;
  const paymentIntentId = invoice.payment_intent?.id || invoice.payment_intent;

  const metadata = stripeSub?.metadata || {};
  let user_id = metadata.user_id;

  if (!user_id && invoice.customer) {
    const dbUser = await prisma.user.findFirst({
      where: { customer_id: String(invoice.customer) },
      select: { id: true },
    });
    user_id = dbUser?.id;
  }
  if (!user_id) return;

  // Upgrade behavior: immediately cancel viewer plan to avoid double billing.
  await cancelViewerSubscriptionForUpgrade(user_id);

  const creator_service_id = metadata.creator_service_id || null;
  const creatorPlan =
    normalizeCreatorPlan(metadata.creator_plan) ||
    normalizeCreatorPlan(metadata.plan) ||
    "basic";

  const line = invoice.lines?.data?.[0];
  const period = line?.period;
  if (!period?.start || !period?.end) return;

  const amount = invoice.amount_paid / 100;
  const currency = invoice.currency;

  let creatorSubscriptionDbId = null;

  await prisma.$transaction(async (tx) => {
    const existingSub = await tx.creatorSubscription.findFirst({
      where: { transaction_id: subscriptionId },
    });

    if (existingSub) {
      await tx.creatorSubscription.update({
        where: { id: existingSub.id },
        data: {
          end_date: new Date(period.end * 1000),
          renewal_date: new Date(period.end * 1000),
          status: "active",
          payment_method: "stripe",
          plan: creatorPlan,
          ...(creator_service_id ? { creator_service_id } : undefined),
        },
      });
      creatorSubscriptionDbId = existingSub.id;
    } else {
      const createdSub = await tx.creatorSubscription.create({
        data: {
          user_id,
          plan: creatorPlan,
          transaction_id: subscriptionId,
          start_date: new Date(period.start * 1000),
          end_date: new Date(period.end * 1000),
          renewal_date: new Date(period.end * 1000),
          payment_method: "stripe",
          status: "active",
          ...(creator_service_id ? { creator_service_id } : undefined),
        },
      });
      creatorSubscriptionDbId = createdSub.id;
    }

    if (paymentIntentId) {
      await tx.paymentTransaction.upsert({
        where: { provider_payment_intent_id: paymentIntentId },
        update: {
          status: "succeeded",
          paid_amount: amount,
          paid_currency: currency,
          creator_subscription_id: creatorSubscriptionDbId,
        },
        create: {
          provider: "stripe",
          provider_payment_intent_id: paymentIntentId,
          provider_customer_id: invoice.customer,
          price: amount,
          currency,
          paid_amount: amount,
          paid_currency: currency,
          status: "succeeded",
          user_id,
          creator_subscription_id: creatorSubscriptionDbId,
        },
      });
    }

    await tx.user.update({
      where: { id: user_id },
      data: { role: "creator", is_subscribed: true },
    });

    // Creator subscription also grants viewer entitlements (quota) based on plan
    await upsertQuotaForPlanTx(tx, user_id, creatorPlan);
  });

  await sendNotification({
    receiverId: user_id,
    type: "creator_subscription.payment_succeeded",
    entityId: creatorSubscriptionDbId || null,
    text: "Your creator subscription payment succeeded. Your creator plan is active.",
  });
}

async function onSubscriptionUpdated(subscription) {
  if (!subscription?.id) return;

  const kind = String(subscription.metadata?.kind || "viewer");
  if (kind === "creator") {
    await onCreatorSubscriptionUpdated(subscription);
    return;
  }

  const stripeStatus = subscription.status;
  const nextEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null;

  const normalizedStatus =
    stripeStatus === "active" || stripeStatus === "trialing"
      ? "active"
      : stripeStatus === "past_due" || stripeStatus === "unpaid"
        ? "suspended"
        : stripeStatus === "canceled" || stripeStatus === "incomplete_expired"
          ? "deactivated"
          : "inactive";

  await prisma.subscription.updateMany({
    where: { transaction_id: subscription.id },
    data: {
      status: normalizedStatus,
      ...(nextEnd ? { end_date: nextEnd, renewal_date: nextEnd } : undefined),
      ...(subscription.metadata?.plan
        ? { plan: normalizePlan(subscription.metadata.plan) ?? undefined }
        : undefined),
    },
  });

  // Try to update user based on metadata first, else fallback to customer_id
  const metaUserId = subscription.metadata?.user_id;
  if (metaUserId) {
    const creatorActive = await prisma.creatorSubscription.findFirst({
      where: { user_id: metaUserId, status: "active" },
      select: {
        plan: true,
        service: { select: { plan: true } },
      },
    });

    await prisma.$transaction(async (tx) => {
      if (creatorActive) {
        await tx.user.update({
          where: { id: metaUserId },
          data: { is_subscribed: true, role: "creator" },
        });
        await upsertQuotaForPlanTx(
          tx,
          metaUserId,
          creatorActive.plan || creatorActive.service?.plan,
        );
        return;
      }

      if (normalizedStatus === "active") {
        await tx.user.update({
          where: { id: metaUserId },
          data: { is_subscribed: true, role: "premium" },
        });
        await upsertQuotaForPlanTx(tx, metaUserId, subscription.metadata?.plan);
      } else {
        await tx.user.update({
          where: { id: metaUserId },
          data: { is_subscribed: false, role: "normal" },
        });
        await deleteQuotaTx(tx, metaUserId);
      }
    });
    return;
  }

  if (subscription.customer) {
    const dbUser = await prisma.user.findFirst({
      where: { customer_id: String(subscription.customer) },
      select: { id: true },
    });
    if (dbUser?.id) {
      const creatorActive = await prisma.creatorSubscription.findFirst({
        where: { user_id: dbUser.id, status: "active" },
        select: {
          plan: true,
          service: { select: { plan: true } },
        },
      });

      await prisma.$transaction(async (tx) => {
        if (creatorActive) {
          await tx.user.update({
            where: { id: dbUser.id },
            data: { is_subscribed: true, role: "creator" },
          });
          await upsertQuotaForPlanTx(
            tx,
            dbUser.id,
            creatorActive.plan || creatorActive.service?.plan,
          );
          return;
        }

        if (normalizedStatus === "active") {
          await tx.user.update({
            where: { id: dbUser.id },
            data: { is_subscribed: true, role: "premium" },
          });
          await upsertQuotaForPlanTx(
            tx,
            dbUser.id,
            subscription.metadata?.plan,
          );
        } else {
          await tx.user.update({
            where: { id: dbUser.id },
            data: { is_subscribed: false, role: "normal" },
          });
          await deleteQuotaTx(tx, dbUser.id);
        }
      });
    }
  }
}

async function onCreatorSubscriptionUpdated(subscription) {
  if (!subscription?.id) return;

  const stripeStatus = subscription.status;
  const nextEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null;

  const normalizedStatus =
    stripeStatus === "active" || stripeStatus === "trialing"
      ? "active"
      : stripeStatus === "past_due" || stripeStatus === "unpaid"
        ? "suspended"
        : stripeStatus === "canceled" || stripeStatus === "incomplete_expired"
          ? "deactivated"
          : "inactive";

  await prisma.creatorSubscription.updateMany({
    where: { transaction_id: subscription.id },
    data: {
      status: normalizedStatus,
      ...(nextEnd ? { end_date: nextEnd, renewal_date: nextEnd } : undefined),
      ...(subscription.metadata?.creator_plan
        ? {
            plan:
              normalizeCreatorPlan(subscription.metadata.creator_plan) ??
              undefined,
          }
        : undefined),
    },
  });

  const metaUserId = subscription.metadata?.user_id;
  if (metaUserId) {
    const viewer = await prisma.subscription.findFirst({
      where: { user_id: metaUserId, status: "active" },
      select: { plan: true },
    });

    const creatorPlanMeta =
      subscription.metadata?.creator_plan || subscription.metadata?.plan;

    await prisma.$transaction(async (tx) => {
      if (normalizedStatus === "active") {
        await tx.user.update({
          where: { id: metaUserId },
          data: { role: "creator", is_subscribed: true },
        });
        await upsertQuotaForPlanTx(
          tx,
          metaUserId,
          viewer?.plan || creatorPlanMeta,
        );
      } else if (viewer?.plan) {
        await tx.user.update({
          where: { id: metaUserId },
          data: { role: "premium", is_subscribed: true },
        });
        await upsertQuotaForPlanTx(tx, metaUserId, viewer.plan);
      } else {
        await tx.user.update({
          where: { id: metaUserId },
          data: { role: "normal", is_subscribed: false },
        });
        await deleteQuotaTx(tx, metaUserId);
      }
    });
    return;
  }

  if (subscription.customer) {
    const dbUser = await prisma.user.findFirst({
      where: { customer_id: String(subscription.customer) },
      select: { id: true },
    });
    if (dbUser?.id) {
      const viewer = await prisma.subscription.findFirst({
        where: { user_id: dbUser.id, status: "active" },
        select: { plan: true },
      });

      const creatorPlanMeta =
        subscription.metadata?.creator_plan || subscription.metadata?.plan;

      await prisma.$transaction(async (tx) => {
        if (normalizedStatus === "active") {
          await tx.user.update({
            where: { id: dbUser.id },
            data: { role: "creator", is_subscribed: true },
          });
          await upsertQuotaForPlanTx(
            tx,
            dbUser.id,
            viewer?.plan || creatorPlanMeta,
          );
        } else if (viewer?.plan) {
          await tx.user.update({
            where: { id: dbUser.id },
            data: { role: "premium", is_subscribed: true },
          });
          await upsertQuotaForPlanTx(tx, dbUser.id, viewer.plan);
        } else {
          await tx.user.update({
            where: { id: dbUser.id },
            data: { role: "normal", is_subscribed: false },
          });
          await deleteQuotaTx(tx, dbUser.id);
        }
      });
    }
  }
}

async function onRecurringFailed(invoice) {
  if (!invoice.subscription) return;

  // Determine subscription kind via Stripe subscription metadata
  let kind = "viewer";
  try {
    const stripeSub = await stripe.subscriptions.retrieve(invoice.subscription);
    kind = String(stripeSub?.metadata?.kind || "viewer");
  } catch {
    // ignore
  }
  if (kind === "creator") {
    await prisma.creatorSubscription.updateMany({
      where: { transaction_id: invoice.subscription },
      data: { status: "suspended" },
    });

    const dbUser = invoice.customer
      ? await prisma.user.findFirst({
          where: { customer_id: String(invoice.customer) },
          select: { id: true },
        })
      : null;

    if (dbUser?.id) {
      await sendNotification({
        receiverId: dbUser.id,
        type: "creator_subscription.payment_failed",
        text: "Your creator subscription payment failed. Please update your payment method.",
      });
      const viewer = await prisma.subscription.findFirst({
        where: { user_id: dbUser.id, status: "active" },
        select: { plan: true },
      });

      await prisma.$transaction(async (tx) => {
        if (viewer?.plan) {
          await tx.user.update({
            where: { id: dbUser.id },
            data: { role: "premium", is_subscribed: true },
          });
          await upsertQuotaForPlanTx(tx, dbUser.id, viewer.plan);
        } else {
          await tx.user.update({
            where: { id: dbUser.id },
            data: { role: "normal", is_subscribed: false },
          });
          await deleteQuotaTx(tx, dbUser.id);
        }
      });
    } else {
      // Best-effort fallback when customer_id is not available
      await prisma.user.updateMany({
        where: {
          CreatorSubscription: {
            some: { transaction_id: invoice.subscription },
          },
        },
        data: { role: "normal", is_subscribed: false },
      });
    }
    return;
  }

  await prisma.subscription.updateMany({
    where: { transaction_id: invoice.subscription },
    data: { status: "suspended" },
  });

  await prisma.user.updateMany({
    where: {
      Subscription: { some: { transaction_id: invoice.subscription } },
      CreatorSubscription: { none: { status: "active" } },
    },
    data: { is_subscribed: false, role: "normal" },
  });

  // Remove quota access on payment failure
  const dbUser = invoice.customer
    ? await prisma.user.findFirst({
        where: { customer_id: String(invoice.customer) },
        select: { id: true },
      })
    : null;
  if (dbUser?.id) {
    await sendNotification({
      receiverId: dbUser.id,
      type: "subscription.payment_failed",
      text: "Your subscription payment failed. Please update your payment method.",
    });
    const activeCreator = await prisma.creatorSubscription.findFirst({
      where: { user_id: dbUser.id, status: "active" },
      select: { id: true },
    });
    if (!activeCreator) {
      await prisma.userStorageQuota.deleteMany({
        where: { user_id: dbUser.id },
      });
    }
  }
}

async function onSubscriptionCanceled(subscription) {
  const kind = String(subscription?.metadata?.kind || "viewer");
  if (kind === "creator") {
    await prisma.creatorSubscription.updateMany({
      where: { transaction_id: subscription.id },
      data: { status: "deactivated" },
    });

    const userIdFromMeta = subscription?.metadata?.user_id
      ? String(subscription.metadata.user_id)
      : null;
    const dbUser = userIdFromMeta
      ? { id: userIdFromMeta }
      : subscription?.customer
        ? await prisma.user.findFirst({
            where: { customer_id: String(subscription.customer) },
            select: { id: true },
          })
        : null;

    if (dbUser?.id) {
      await sendNotification({
        receiverId: dbUser.id,
        type: "creator_subscription.canceled",
        text: "Your creator subscription was canceled.",
      });
      const viewer = await prisma.subscription.findFirst({
        where: { user_id: dbUser.id, status: "active" },
        select: { plan: true },
      });

      await prisma.$transaction(async (tx) => {
        if (viewer?.plan) {
          await tx.user.update({
            where: { id: dbUser.id },
            data: { role: "premium", is_subscribed: true },
          });
          await upsertQuotaForPlanTx(tx, dbUser.id, viewer.plan);
        } else {
          await tx.user.update({
            where: { id: dbUser.id },
            data: { role: "normal", is_subscribed: false },
          });
          await deleteQuotaTx(tx, dbUser.id);
        }
      });
    } else {
      await prisma.user.updateMany({
        where: {
          CreatorSubscription: { some: { transaction_id: subscription.id } },
        },
        data: { role: "normal", is_subscribed: false },
      });
    }
    return;
  }

  await prisma.subscription.updateMany({
    where: { transaction_id: subscription.id },
    data: { status: "deactivated" },
  });

  await prisma.user.updateMany({
    where: {
      Subscription: { some: { transaction_id: subscription.id } },
      CreatorSubscription: { none: { status: "active" } },
    },
    data: { is_subscribed: false, role: "normal" },
  });

  // Remove quota access on cancellation
  const userIdFromMeta = subscription?.metadata?.user_id
    ? String(subscription.metadata.user_id)
    : null;
  const dbUser = userIdFromMeta
    ? { id: userIdFromMeta }
    : subscription?.customer
      ? await prisma.user.findFirst({
          where: { customer_id: String(subscription.customer) },
          select: { id: true },
        })
      : null;

  if (dbUser?.id) {
    await sendNotification({
      receiverId: dbUser.id,
      type: "subscription.canceled",
      text: "Your subscription was canceled.",
    });
    const activeCreator = await prisma.creatorSubscription.findFirst({
      where: { user_id: dbUser.id, status: "active" },
      select: { id: true },
    });
    if (!activeCreator) {
      await prisma.userStorageQuota.deleteMany({
        where: { user_id: dbUser.id },
      });
    }
  }
}

/* ======================================================
   CREATOR SUBSCRIPTION (internal; used by unified handlers)
====================================================== */

async function createCreatorStripeSubscriptionInternal(req, res) {
  try {
    const { paymentMethodId, creator_service_id, service_id } = req.body;
    const creatorServiceId = creator_service_id || service_id;
    const { userId, email, role } = req.user;

    if (!paymentMethodId || !creatorServiceId) {
      return res.status(400).json({
        error: "Missing data",
        hint: "For kind=creator send { paymentMethodId, creator_service_id } (service_id is also accepted as an alias).",
      });
    }
    if (role === "admin") {
      return res
        .status(403)
        .json({ error: "Admins cannot subscribe as creator" });
    }

    const service = await prisma.creatorService.findUnique({
      where: { id: creatorServiceId },
    });
    if (!service)
      return res.status(404).json({ error: "Creator plan not found" });

    let user = await prisma.user.findUnique({ where: { id: userId } });

    const activeSub = await prisma.creatorSubscription.findFirst({
      where: { user_id: userId, plan: service.plan, status: "active" },
    });
    if (activeSub) {
      return res.status(400).json({
        error: "You already have an active creator subscription for this plan",
        subscriptionId: activeSub.transaction_id,
        status: activeSub.status,
      });
    }

    if (!user.customer_id) {
      const customer = await stripe.customers.create({
        email,
        name: user.name || "",
      });
      user = await prisma.user.update({
        where: { id: userId },
        data: { customer_id: customer.id },
      });
    }

    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: user.customer_id,
    });
    await stripe.customers.update(user.customer_id, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    let priceId = service.stripe_price_id;
    if (!priceId) {
      const product = await stripe.products.create({ name: service.name });
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: Math.round(Number(service.price) * 100),
        currency: (service.currency || "usd").toLowerCase(),
        recurring: { interval: "month" },
      });

      await prisma.creatorService.update({
        where: { id: creatorServiceId },
        data: { stripe_product_id: product.id, stripe_price_id: price.id },
      });
      priceId = price.id;
    }

    const existingSub = await prisma.creatorSubscription.findFirst({
      where: { user_id: userId, status: "active" },
    });

    let subscription;
    if (existingSub) {
      const stripeExistingSub = await stripe.subscriptions.retrieve(
        existingSub.transaction_id,
      );
      const stripeItemId = stripeExistingSub.items?.data?.[0]?.id;
      if (!stripeItemId) {
        return res
          .status(400)
          .json({ error: "Could not find Stripe subscription item to update" });
      }

      subscription = await stripe.subscriptions.update(
        existingSub.transaction_id,
        {
          cancel_at_period_end: false,
          items: [{ id: stripeItemId, price: priceId }],
          // Ensure an immediate invoice/payment is generated for the plan change.
          proration_behavior: "always_invoice",
          expand: ["latest_invoice.payment_intent"],
          metadata: {
            kind: "creator",
            user_id: userId,
            creator_service_id: creatorServiceId,
            creator_plan: service.plan,
          },
        },
      );

      await prisma.creatorSubscription.update({
        where: { id: existingSub.id },
        data: {
          plan: service.plan,
          creator_service_id: creatorServiceId,
        },
      });

      if (
        subscription.status === "active" ||
        subscription.status === "trialing"
      ) {
        await cancelViewerSubscriptionForUpgrade(userId);
      }

      return res.json({
        subscriptionId: subscription.id,
        clientSecret:
          subscription.latest_invoice.payment_intent?.client_secret || null,
        status: subscription.status,
        message: "Creator subscription updated (upgrade/downgrade)",
      });
    }

    subscription = await stripe.subscriptions.create({
      customer: user.customer_id,
      items: [{ price: priceId }],
      expand: ["latest_invoice.payment_intent"],
      metadata: {
        kind: "creator",
        user_id: userId,
        creator_service_id: creatorServiceId,
        creator_plan: service.plan,
      },
    });

    const invoice = subscription.latest_invoice;
    const paymentIntentId = invoice.payment_intent?.id;
    if (subscription.status === "active" && paymentIntentId) {
      await onRecurringSuccess(invoice);
    }

    return res.json({
      subscriptionId: subscription.id,
      clientSecret:
        subscription.latest_invoice.payment_intent?.client_secret || null,
      status: subscription.status,
      message: "Creator subscription created successfully",
    });
  } catch (err) {
    console.error("createCreatorStripeSubscription error:", err);
    return res.status(400).json({ error: err.message });
  }
}

async function cancelCreatorStripeSubscriptionInternal(req, res) {
  try {
    const { subscriptionId } = req.body;
    const { userId } = req.user;

    if (!subscriptionId) {
      return res.status(400).json({ error: "Missing subscriptionId" });
    }

    const sub = await prisma.creatorSubscription.findFirst({
      where: {
        transaction_id: subscriptionId,
        user_id: userId,
        status: "active",
      },
    });
    if (!sub) {
      return res.status(404).json({ error: "Creator subscription not found" });
    }

    const canceled = await stripe.subscriptions.cancel(subscriptionId);
    const endDate = canceled?.current_period_end
      ? new Date(canceled.current_period_end * 1000)
      : new Date();

    const viewer = await prisma.subscription.findFirst({
      where: { user_id: userId, status: "active" },
      select: { plan: true },
    });

    await prisma.$transaction(async (tx) => {
      await tx.creatorSubscription.updateMany({
        where: { transaction_id: subscriptionId, user_id: userId },
        data: {
          status: "deactivated",
          end_date: endDate,
          renewal_date: endDate,
        },
      });

      if (viewer?.plan) {
        await tx.user.update({
          where: { id: userId },
          data: { role: "premium", is_subscribed: true },
        });
        await upsertQuotaForPlanTx(tx, userId, viewer.plan);
      } else {
        await tx.user.update({
          where: { id: userId },
          data: { role: "normal", is_subscribed: false },
        });
        await deleteQuotaTx(tx, userId);
      }
    });

    return res.json({
      success: true,
      status: canceled.status,
      message: "Creator subscription canceled successfully",
    });
  } catch (err) {
    console.error("cancelCreatorStripeSubscription error:", err);
    return res.status(400).json({ error: err.message });
  }
}

async function getCreatorSubscriptionStatusInternal(req, res) {
  try {
    const { userId } = req.user;
    const sub = await prisma.creatorSubscription.findFirst({
      where: { user_id: userId, status: "active" },
    });
    if (!sub) {
      return res.status(200).json({ isCreatorSubscribed: false });
    }

    const service = sub.creator_service_id
      ? await prisma.creatorService.findUnique({
          where: { id: sub.creator_service_id },
        })
      : null;

    return res
      .status(200)
      .json({ isCreatorSubscribed: true, subscription: { ...sub, service } });
  } catch (err) {
    console.error("getCreatorSubscriptionStatus error:", err);
    return res.status(400).json({ error: err.message });
  }
}

/* ======================================================
   CANCEL STRIPE SUBSCRIPTION
====================================================== */

async function cancelViewerStripeSubscription(req, res) {
  try {
    const { subscriptionId } = req.body;
    const { userId } = req.user;

    if (!subscriptionId) {
      return res.status(400).json({ error: "Missing subscriptionId" });
    }

    // Make sure this subscription belongs to the user
    const sub = await prisma.subscription.findFirst({
      where: {
        transaction_id: subscriptionId,
        user_id: userId,
        status: "active",
      },
    });

    if (!sub) {
      return res.status(404).json({ error: "Subscription not found" });
    }

    // Cancel at Stripe
    const canceled = await stripe.subscriptions.cancel(subscriptionId);

    // Best-effort immediate DB sync (webhook will also run and should be idempotent)
    const endDate = canceled?.current_period_end
      ? new Date(canceled.current_period_end * 1000)
      : new Date();

    const activeCreator = await prisma.creatorSubscription.findFirst({
      where: { user_id: userId, status: "active" },
      select: { id: true },
    });

    const ops = [
      prisma.subscription.updateMany({
        where: { transaction_id: subscriptionId, user_id: userId },
        data: {
          status: "deactivated",
          end_date: endDate,
          renewal_date: endDate,
        },
      }),
    ];

    if (activeCreator) {
      ops.push(
        prisma.user.update({
          where: { id: userId },
          data: { is_subscribed: true, role: "creator" },
        }),
      );
    } else {
      ops.push(
        prisma.user.update({
          where: { id: userId },
          data: { is_subscribed: false, role: "normal" },
        }),
        prisma.userStorageQuota.deleteMany({
          where: { user_id: userId },
        }),
      );
    }

    await prisma.$transaction(ops);

    res.json({
      success: true,
      status: canceled.status,
      message: "Subscription canceled successfully",
    });
  } catch (err) {
    console.error("Cancel subscription error:", err);
    res.status(400).json({ error: err.message });
  }
}

// get subscription status
async function getViewerSubscriptionStatus(req, res) {
  try {
    const { userId } = req.user;
    const sub = await prisma.subscription.findFirst({
      where: {
        user_id: userId,
        status: "active",
      },
    });

    // If viewer is not active but creator is active, viewer may have been auto-canceled by upgrade.
    const creator = await prisma.creatorSubscription.findFirst({
      where: { user_id: userId, status: "active" },
      select: { id: true, created_at: true },
    });
    const lastViewerDeactivated = await prisma.subscription.findFirst({
      where: { user_id: userId, status: "deactivated" },
      orderBy: { created_at: "desc" },
      select: { end_date: true },
    });

    const viewerCanceledByUpgrade =
      !sub &&
      !!creator &&
      !!lastViewerDeactivated?.end_date &&
      Math.abs(
        new Date(lastViewerDeactivated.end_date).getTime() -
          new Date(creator.created_at).getTime(),
      ) <=
        2 * 60 * 60 * 1000;

    if (!sub) {
      return res.status(200).json({
        isSubscribed: false,
        viewerCanceledByUpgrade,
      });
    }
    res.status(200).json({
      isSubscribed: true,
      subscription: sub,
      viewerCanceledByUpgrade: false,
    });
  } catch (err) {
    console.error("Get subscription status error:", err);
    res.status(400).json({ error: err.message });
  }
}

// =============================
// Unified subscription exports
// =============================

export const createStripeSubscription = async (req, res) => {
  const requestedKind =
    normalizeKind(req.body?.kind) || normalizeKind(req.query?.kind) || "viewer";

  if (requestedKind === "creator") {
    return createCreatorStripeSubscriptionInternal(req, res);
  }
  // Default: viewer
  return createStripeSubscriptionViewerImpl(req, res);
};

export const cancelStripeSubscription = async (req, res) => {
  const requestedKind =
    normalizeKind(req.body?.kind) || normalizeKind(req.query?.kind) || null;

  if (requestedKind === "creator") {
    return cancelCreatorStripeSubscriptionInternal(req, res);
  }
  if (requestedKind === "viewer") {
    return cancelViewerStripeSubscription(req, res);
  }

  // Infer kind by checking local DB ownership
  try {
    const { subscriptionId } = req.body || {};
    const { userId } = req.user || {};
    if (!subscriptionId || !userId) {
      return res.status(400).json({ error: "Missing subscriptionId" });
    }

    const viewer = await prisma.subscription.findFirst({
      where: {
        transaction_id: subscriptionId,
        user_id: userId,
        status: "active",
      },
      select: { id: true },
    });
    if (viewer) return cancelViewerStripeSubscription(req, res);

    const creator = await prisma.creatorSubscription.findFirst({
      where: {
        transaction_id: subscriptionId,
        user_id: userId,
        status: "active",
      },
      select: { id: true },
    });
    if (creator) return cancelCreatorStripeSubscriptionInternal(req, res);

    return res.status(404).json({ error: "Subscription not found" });
  } catch (err) {
    console.error("cancelStripeSubscription infer error:", err);
    return res.status(400).json({ error: err.message });
  }
};

export const getSubscriptionStatus = async (req, res) => {
  const requestedKind =
    normalizeKind(req.query?.kind) || normalizeKind(req.body?.kind) || null;

  if (requestedKind === "viewer") {
    return getViewerSubscriptionStatus(req, res);
  }
  if (requestedKind === "creator") {
    return getCreatorSubscriptionStatusInternal(req, res);
  }

  // Default: return both
  try {
    const { userId } = req.user;
    const [viewer, creatorSub, lastViewerDeactivated] = await Promise.all([
      prisma.subscription.findFirst({
        where: { user_id: userId, status: "active" },
      }),
      prisma.creatorSubscription.findFirst({
        where: { user_id: userId, status: "active" },
      }),
      prisma.subscription.findFirst({
        where: { user_id: userId, status: "deactivated" },
        orderBy: { created_at: "desc" },
        select: { end_date: true },
      }),
    ]);

    const creatorService = creatorSub?.creator_service_id
      ? await prisma.creatorService.findUnique({
          where: { id: creatorSub.creator_service_id },
        })
      : null;

    const creator = creatorSub
      ? { ...creatorSub, service: creatorService }
      : null;

    const viewerCanceledByUpgrade =
      !viewer &&
      !!creatorSub &&
      !!lastViewerDeactivated?.end_date &&
      Math.abs(
        new Date(lastViewerDeactivated.end_date).getTime() -
          new Date(creatorSub.created_at).getTime(),
      ) <=
        2 * 60 * 60 * 1000;

    return res.status(200).json({
      viewer: viewer
        ? {
            isSubscribed: true,
            subscription: viewer,
            viewerCanceledByUpgrade: false,
          }
        : { isSubscribed: false, viewerCanceledByUpgrade },
      creator: creator
        ? { isCreatorSubscribed: true, subscription: creator }
        : { isCreatorSubscribed: false },
    });
  } catch (err) {
    console.error("getSubscriptionStatus unified error:", err);
    return res.status(400).json({ error: err.message });
  }
};

// Unified plans endpoint (viewer + creator)
export const getPlans = async (req, res) => {
  try {
    const requestedKind = normalizeKind(req.query?.kind) || "viewer";

    if (requestedKind === "viewer") {
      const plans = await prisma.services.findMany({
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          plan: true,
          features: true,
          stripe_product_id: true,
          stripe_price_id: true,
        },
      });
      return res.json({ success: true, kind: "viewer", plans });
    }

    if (requestedKind === "creator") {
      const plans = await prisma.creatorService.findMany({
        where: { deleted_at: null },
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          name: true,
          description: true,
          features: true,
          price: true,
          currency: true,
          plan: true,
          videos_per_month: true,
          stripe_product_id: true,
          stripe_price_id: true,
        },
      });
      return res.json({ success: true, kind: "creator", plans });
    }

    return res.status(400).json({ error: "Invalid kind" });
  } catch (err) {
    console.error("getPlans error:", err);
    return res.status(500).json({ error: "Failed to fetch plans" });
  }
};
