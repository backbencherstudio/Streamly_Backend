// import Stripe from 'stripe';
// import { PrismaClient } from "@prisma/client";



// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
// const prisma = new PrismaClient();

// export const createPaymentIntent = async (req, res) => {
//   try {
//     const { paymentMethodId, currency, service_id } = req.body;

//     if (!paymentMethodId || !currency || !service_id) {
//       return res.status(400).json({ error: 'Missing payment method, currency, or service ID' });
//     }

//     const service = await prisma.services.findUnique({
//       where: { id: service_id },
//     });

//     if (!service) {
//       return res.status(404).json({ error: 'Service not found' });
//     }

//     const { email, role, userId } = req.user || {};
//     console.log('User Info:', { email, role, userId });

//     if (!userId) {
//       return res.status(400).json({ error: 'User ID is missing or invalid' });
//     }

//     const user = await prisma.user.findUnique({
//       where: { id: userId },
//     });

//     if (!user) {
//       return res.status(404).json({ error: 'User not found' });
//     }

//     const transaction = await prisma.$transaction(async (prismaTx) => {
//       try {
//         const paymentIntent = await stripe.paymentIntents.create({
//           amount: Math.round(service.price * 100),
//           currency,
//           payment_method: paymentMethodId,
//           metadata: {
//             user_id: userId,
//             user_email: email,
//             user_role: role,
//             service_id: service_id,
//             plan: service.plan || 'basic',
//           }
//         });

//         const paymentTransaction = await prismaTx.paymentTransaction.create({
//           data: {
//             user_id: userId,
//             price: paymentIntent.amount,
//             currency: paymentIntent.currency,
//             status: 'pending',
//             payment_method: paymentIntent.payment_method,
//           },
//         });

//         console.log('Payment Transaction Created:', paymentTransaction);
//         console.log('Payment Intent Created:', paymentIntent.client_secret);
//         console.log('Payment Intent Metadata:', paymentIntent.metadata);

//         return paymentIntent.client_secret;
//       } catch (error) {
//         console.error('Error creating Payment Intent:', error);
//         throw new Error('Error creating payment intent');
//       }
//     });

//     return res.status(200).json({
//       clientSecret: transaction,
//     });
//   } catch (error) {
//     console.error('Payment Intent Error:', error);
//     return res.status(500).json({ error: error.message });
//   }
// };


// //webhook handler
// export const handleWebhook = async (req, res) => {
//   const sig = req.headers['stripe-signature'];
//   const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

//   let event;

//   try {
//     event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
//   } catch (err) {
//     console.error('Webhook Error:', err);
//     return res.status(400).send(`Webhook error: ${err.message}`);
//   }

//   console.log(`Received event type: ${event.type}`);

//   switch (event.type) {
//     case 'payment_intent.created':
//       // console.log('Payment Intent Created:', event.data.object);
//       break;
//     case 'payment_intent.succeeded':
//       console.log('Payment Intent Succeeded:', event.data.object);
//       await handlePaymentIntentSucceeded(event.data.object);
//       break;

//     case 'payment_intent.payment_failed':
//       await handlePaymentIntentFailed(event.data.object);
//       break;

//     default:
//       console.log(`Unhandled event type: ${event.type}`);
//       break;
//   }

//   res.json({ received: true });
// };
// //nesssary functions for handling payment intent succeeded and failed
// const handlePaymentIntentSucceeded = async (paymentIntent) => {
//   const { user_id, service_id, plan } = paymentIntent.metadata;
//   console.log(`Processing payment intent for user ${user_id} with service ${service_id} and plan ${plan}`);
 
//   await sendNotification(`${user_id}, "Your payment was successful and your subscription is now active. your plan is ${plan} , Enjoy our premium features!"`);
//   await sendNotification('cme7zzhds0000venwlry4129y', `New subscription: User ${user_id} subscribed to service ${service_id} with plan ${plan}.`);

 
//   if (!user_id) {
//     console.error('User ID not found in payment intent metadata.');
//     return;
//   }

//   const transaction = await prisma.$transaction(async (prismaTx) => {
//     try {
//       // 1. Update user 
//       const userUpdate = await prismaTx.user.update({
//         where: { id: paymentIntent.metadata.user_id },
//         select: { name: true },
//         data: {
//           role: "premium",
//           is_subscribed: true,
//         },
//       });

//       console.log(`User ${user_id}'s role updated to "premium".`);


//       const service = await prismaTx.services.findUnique({
//         where: { id: paymentIntent.metadata.service_id },
//       });

//       if (!service) {
//         throw new Error('Service not found for subscription.');
//       }

//       const startDate = new Date();
//       const endDate = calculateSubscriptionEndDate(startDate, plan);

//       const subscription = await prismaTx.subscription.create({
//         data: {
//           service_id: service_id,
//           user_id: user_id,
//           username:userUpdate.name,
//           plan: plan,
//           start_date: startDate,
//           end_date: endDate,
//           price: service.price,
//           transaction_id: paymentIntent.id,
//         },
//       });

//       console.log(`Subscription created for user ${user_id} with plan ${plan}.`);

//       // 2. Update payment transaction
//       if (!paymentIntent.id) {
//         console.log('Payment Intent ID is missing.');
//       }
//       const paymentTransaction = await prismaTx.paymentTransaction.update({
//         where: { id: paymentIntent.id },
//         data: {
//           status: "succeeded",
//           subscription: { connect: { id: subscription.id } },
//         },
//       });

//       console.log(`Payment transaction updated for user ${user_id}:`, paymentTransaction);

//       return 'Payment Intent Success';
//     } catch (error) {
//       console.error(`Error processing payment intent for user ${user_id}:`, error);
//       throw new Error('Failed to handle payment intent succeeded');
//     }
//   });

//   console.log('Payment Intent processing complete:', transaction);
// };
// const handlePaymentIntentFailed = async (paymentIntent) => {
//   const { user_id } = paymentIntent.metadata;

//   if (!user_id) {
//     console.error('User ID not found in payment intent metadata.');
//     return;
//   }

//   const transaction = await prisma.$transaction(async (prismaTx) => {
//     try {
//       // 1. IF the payment intent fails
//       const paymentTransaction = await prismaTx.paymentTransaction.update({
//         where: { id: paymentIntent.id },
//         data: {
//           status: 'failed',
//         },
//       });

//       console.log(`Payment transaction for user ${user_id} failed:`, paymentTransaction);
//       return 'Payment Intent Failed';
//     } catch (error) {
//       console.error(`Error handling payment intent failure for user ${user_id}:`, error);
//       throw new Error('Failed to handle failed payment');
//     }
//   });

//   console.log('Payment Intent failure processed:', transaction);
// };
// const calculateSubscriptionEndDate = (startDate, plan) => {
//   const endDate = new Date(startDate);

//   if (plan === "HalfYearly") {
//     endDate.setMonth(startDate.getMonth() + 6);
//   } else {
//     endDate.setFullYear(startDate.getFullYear() + 1);
//   }

//   return endDate;
// };

// -----------------------------------------------------------------------------
// Payment controller for Stripe integration
// -----------------------------------------------------------------------------

import Stripe from 'stripe';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
});
const prisma = new PrismaClient();

const toCents = (n) => Math.round(Number(n) * 100);
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// -----------------------------------------------------------------------------
// Create & confirm PaymentIntent (cards-only in dev; no redirect PMs)
// ----------------------------------------------------------------------------- 
export const createPaymentIntent = async (req, res) => {
  try {
    const { paymentMethodId, service_id } = req.body;

    if (!paymentMethodId || !service_id) {
      return res.status(400).json({ error: 'Missing payment method or service ID' });
    }

    const service = await prisma.services.findUnique({ where: { id: service_id } });
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const currency = (service.currency || 'usd').toLowerCase();
    const amount = toCents(service.price);

    const { email, role, type, userId } = req.user || {};
    if (!userId) return res.status(401).json({ error: 'Unauthenticated user' });

    let user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user.customer_id) {
      const stripeCustomer = await stripe.customers.create({
        email: email || '',
        name: user.name || '',
      });
      user = await prisma.user.update({
        where: { id: userId },
        data: { customer_id: stripeCustomer.id },
      });
    }

    // Payment Intent parameters
    const piParams = {
      amount,
      currency,
      payment_method: paymentMethodId,
      confirm: true,
      customer: user.customer_id, 
      setup_future_usage: 'off_session',
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never',
      },
      metadata: {
        user_id: userId,
        user_email: email || '',
        user_role: role || '',
        user_type: type || '',
        service_id,
        plan: service.plan || '',
      },
    };

    const uniqueId = `${userId}:${service_id}:${amount}:${currency}:${new Date().getTime()}:${Math.random().toString(36).substr(2, 9)}`;
    const idempotencyKey = sha256(uniqueId);

    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create(piParams, { idempotencyKey });
    } catch (err) {
      if (err?.type === 'StripeIdempotencyError') {
        const retryKey = `${idempotencyKey}-v2`;
        paymentIntent = await stripe.paymentIntents.create(piParams, { idempotencyKey: retryKey });
      } else {
        throw err;
      }
    }

    await prisma.paymentTransaction.upsert({
      where: { provider_payment_intent_id: paymentIntent.id },
      update: {
        status: paymentIntent.status || 'pending',
        updated_at: new Date(),
        payment_method: paymentIntent.payment_method || null,
        provider_payment_method_id: paymentIntent.payment_method || null,
        price: service.price,
        currency,
        provider: 'stripe',
      },
      create: {
        status: paymentIntent.status || 'pending',
        provider: 'stripe',
        provider_payment_intent_id: paymentIntent.id,
        provider_payment_method_id: paymentIntent.payment_method || null,
        user: { connect: { id: userId } },
        price: service.price,
        currency,
        payment_method: paymentIntent.payment_method || null,
      },
    });

    return res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      nextAction: paymentIntent.next_action || null,
    });

  } catch (error) {
    console.error('createPaymentIntent error:', error);
    return res.status(400).json({ error: error.message });
  }
};

// -----------------------------------------------------------------------------
// Webhook handler (ensure raw body middleware only on this route)
// -----------------------------------------------------------------------------
export const handleWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'payment_intent.created':
        break;

      case 'payment_intent.processing':
      case 'payment_intent.requires_action':
        await onUpdateGeneric(event.data.object);
        break;

      case 'payment_intent.succeeded':
        await onSucceeded(event.data.object);
        break;

      case 'payment_intent.payment_failed':
      case 'payment_intent.canceled':
        await onFailedOrCanceled(event.data.object);
        break;

      default:
        break;
    }
  } catch (err) {
    console.error('Webhook processing error:', err);
  }

  res.json({ received: true });
};

// -----------------------------------------------------------------------------
// Generic status updater (processing / requires_action)
// -----------------------------------------------------------------------------
async function onUpdateGeneric(intent) {
  const { id: piId, status } = intent;
  if (!piId) return;

  await prisma.paymentTransaction.updateMany({
    where: { provider_payment_intent_id: piId },
    data: { status, updated_at: new Date() },
  });
}

// -----------------------------------------------------------------------------
// Success path: update tx by PI id, then user & subscription (idempotent)
// -----------------------------------------------------------------------------
async function onSucceeded(intent) {
  console.log('Processing succeeded payment for PaymentIntent:', intent);

  const { id: piId, amount_received, currency, latest_charge, metadata } = intent;
  const { user_id, service_id, plan } = metadata || {};
  if (!piId || !user_id) {
    console.log('Invalid PaymentIntent data:', intent);
    return;
  }

  console.log('Valid PaymentIntent data, proceeding with subscription creation...');

  await prisma.$transaction(async (tx) => {
    await tx.paymentTransaction.update({
      where: { provider_payment_intent_id: piId },
      data: {
        status: 'succeeded',
        paid_amount: Number(amount_received) / 100,
        paid_currency: currency,
        provider_charge_id: latest_charge || null,
        provider: 'stripe',
        updated_at: new Date(),
      },
    });

    const user = await tx.user.update({
      where: { id: user_id },
      data: { role: 'premium', is_subscribed: true },
      select: { name: true },
    });

    const existingSubscription = await tx.subscription.findFirst({
      where: { user_id, service_id, status: 'Active' },
    });

    let subscriptionId;
    if (existingSubscription) {
      subscriptionId = existingSubscription.id;
      const purchasesCount = await prisma.paymentTransaction.count({
        where: {
          user_id: user_id,
          subscription: {
            service_id: service_id, 
          },
          status: 'succeeded',
        },
      });

      console.log('Number of purchases:', purchasesCount);
      const planDurationMapping = {
        'HalfYearly': 6, 
        'Yearly': 12,
      };

      const selectedPlan = plan || existingSubscription.plan || 'Yearly'; 
      const planDurationInMonths = planDurationMapping[selectedPlan] || 12;

      const newEndDate = new Date(existingSubscription.end_date);
      newEndDate.setMonth(newEndDate.getMonth() + planDurationInMonths * purchasesCount); 

      await tx.subscription.update({
        where: { id: subscriptionId },
        data: { end_date: newEndDate },
      });

    } else {
      const service = await tx.services.findUnique({ where: { id: service_id } });
      if (!service) throw new Error('Service missing during succeeded webhook');

      const startDate = new Date();
      const endDate = calculateSubscriptionEndDate(startDate, plan || service.plan || 'Yearly');

      const newSubscription = await tx.subscription.create({
        data: {
          service_id,
          user_id,
          username: user.name,
          plan: plan || service.plan,
          start_date: startDate,
          end_date: endDate,
          price: service.price,
        },
      });
      subscriptionId = newSubscription.id;
    }

    await tx.paymentTransaction.update({
      where: { provider_payment_intent_id: piId },
      data: { subscription_id: subscriptionId },
    });
  });

  console.log('Subscription creation or update completed successfully.');
}


// -----------------------------------------------------------------------------
// Failure / canceled path
// -----------------------------------------------------------------------------
async function onFailedOrCanceled(intent) {
  const { id: piId, status } = intent;
  if (!piId) return;

  await prisma.paymentTransaction.updateMany({
    where: { provider_payment_intent_id: piId },
    data: {
      status: status === 'canceled' ? 'canceled' : 'failed',
      updated_at: new Date(),
    },
  });
}

// -----------------------------------------------------------------------------
// Utility: subscription end date from plan
// -----------------------------------------------------------------------------
function calculateSubscriptionEndDate(startDate, plan) {
  const end = new Date(startDate);
  if (plan === 'HalfYearly') end.setMonth(end.getMonth() + 6);
  else end.setFullYear(end.getFullYear() + 1);
  return end;
}


/////////-----------------------subscription-----------------------/////////

export const getAllSubscriptions = async (req, res) => {
  try {
    const subscriptions = await prisma.subscription.findMany({
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        start_date: true,
        end_date: true,
        plan: true,
        payment_method: true,
        status: true,
        transaction_id: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },

        Services: {
          select: {
            plan: true,
            name: true,
            price: true,
          },
        },
      },
    });

    if (subscriptions.length === 0) {
      return res.status(201).json({ message: 'No subscriptions found' });
    }

    res.json(subscriptions);
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
};
//Total Subscribers
export const getTotalSubscribers = async (req, res) => {
  try {
    const totalSubscribers = await prisma.subscription.findMany({
      distinct: ['user_id'],
      select: {
        user_id: true,
      },
    });

    res.json({ totalSubscribers: totalSubscribers.length });
  } catch (error) {
    console.error('Error fetching total subscribers:', error);
    res.status(500).json({ error: 'Failed to fetch total subscribers' });
  }
};
//Total Active Subscriptions
export const getTotalActiveSubscriptions = async (req, res) => {
  try {
    const totalActiveSubscriptions = await prisma.subscription.count({
      where: { status: 'active' },
    });

    if (totalActiveSubscriptions === 0) {
      return res.status(201).json({ message: '0' });
    }
    res.json({ totalActiveSubscriptions });
  } catch (error) {
    console.error('Error fetching total active subscriptions:', error);
    res.status(500).json({ error: 'Failed to fetch total active subscriptions' });
  }
}
//Total Monthly Revenue
export const getTotalMonthlyRevenue = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const totalRevenue = await prisma.paymentTransaction.aggregate({
      _sum: {
        price: true,
      },
      where: {
        status: 'succeeded',
        created_at: {
          gte: startOfMonth,
        },
      },
    });

    if (totalRevenue._sum.price === null) {
      return res.status(201).json({ message: '0' });
    }

    res.json({ totalMonthlyRevenue: totalRevenue._sum.price || 0 });
  } catch (error) {
    console.error('Error fetching total monthly revenue:', error);
    res.status(500).json({ error: 'Failed to fetch total monthly revenue' });
  }
}
//Get avg subscription value
export const getAvgSubsctiptionValue = async (req, res) => {
  try {
    const totalRevenue = await prisma.paymentTransaction.aggregate({
      _sum: {
        price: true,
      },
      where: {
        status: 'succeeded',
      },
    });

    const totalSubscriptions = await prisma.subscription.count({
      where: { status: 'active' },
    });

    const avgSubscriptionValue = totalSubscriptions > 0
      ? totalRevenue._sum.price / totalSubscriptions
      : 0;

      if (avgSubscriptionValue === 0) {
        return res.status(201).json({ message: '0' });
      }

    res.json({ avgSubscriptionValue });
  } catch (error) {
    console.error('Error fetching average subscription value:', error);
    res.status(500).json({ error: 'Failed to fetch average subscription value' });
  }
}

