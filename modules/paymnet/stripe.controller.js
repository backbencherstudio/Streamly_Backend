import jwt from 'jsonwebtoken';
import Stripe from 'stripe';
import { PrismaClient } from "@prisma/client";
import cron from 'node-cron';


const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const prisma = new PrismaClient();

export const createPaymentIntent = async (req, res) => {
  try {
    const { paymentMethodId, currency, service_id } = req.body;

    if (!paymentMethodId || !currency || !service_id) {
      return res.status(400).json({ error: 'Missing payment method, currency, or service ID' });
    }

    const service = await prisma.services.findUnique({
      where: { id: service_id },
    });

    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const { email, role, userId } = req.user || {};
    console.log('User Info:', { email, role, userId });

    if (!userId) {
      return res.status(400).json({ error: 'User ID is missing or invalid' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const transaction = await prisma.$transaction(async (prismaTx) => {
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(service.price * 100),
          currency,
          payment_method: paymentMethodId,
          metadata: {
            user_id: userId,
            user_email: email,
            user_role: role,
            service_id: service_id,
            plan: service.plan || 'basic',
          }
        });

        const paymentTransaction = await prismaTx.paymentTransaction.create({
          data: {
            user_id: userId,
            price: paymentIntent.amount,
            currency: paymentIntent.currency,
            status: 'pending',
            payment_method: paymentIntent.payment_method,
          },
        });

        console.log('Payment Transaction Created:', paymentTransaction);
        console.log('Payment Intent Created:', paymentIntent.client_secret);
        console.log('Payment Intent Metadata:', paymentIntent.metadata);

        return paymentIntent.client_secret;
      } catch (error) {
        console.error('Error creating Payment Intent:', error);
        throw new Error('Error creating payment intent');
      }
    });

    return res.status(200).json({
      clientSecret: transaction,
    });
  } catch (error) {
    console.error('Payment Intent Error:', error);
    return res.status(500).json({ error: error.message });
  }
};


//webhook handler
export const handleWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook Error:', err);
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  console.log(`Received event type: ${event.type}`);

  switch (event.type) {
    case 'payment_intent.created':
      // console.log('Payment Intent Created:', event.data.object);
      break;
    case 'payment_intent.succeeded':
      console.log('Payment Intent Succeeded:', event.data.object);
      await handlePaymentIntentSucceeded(event.data.object);
      break;

    case 'payment_intent.payment_failed':
      await handlePaymentIntentFailed(event.data.object);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
      break;
  }

  res.json({ received: true });
};
//nesssary functions for handling payment intent succeeded and failed
const handlePaymentIntentSucceeded = async (paymentIntent) => {
  const { user_id, service_id, plan } = paymentIntent.metadata;
  console.log(`Processing payment intent for user ${user_id} with service ${service_id} and plan ${plan}`);
  

  if (!user_id) {
    console.error('User ID not found in payment intent metadata.');
    return;
  }

  const transaction = await prisma.$transaction(async (prismaTx) => {
    try {
      // 1. Update user 
      const userUpdate = await prismaTx.user.update({
        where: { id: paymentIntent.metadata.user_id },
        select: { name: true },
        data: {
          role: "premium",
          is_subscribed: true,
        },
      });

      console.log(`User ${user_id}'s role updated to "premium".`);


      const service = await prismaTx.services.findUnique({
        where: { id: paymentIntent.metadata.service_id },
      });

      if (!service) {
        throw new Error('Service not found for subscription.');
      }

      const startDate = new Date();
      const endDate = calculateSubscriptionEndDate(startDate, plan);

      const subscription = await prismaTx.subscription.create({
        data: {
          service_id: service_id,
          user_id: user_id,
          username:userUpdate.name,
          plan: plan,
          start_date: startDate,
          end_date: endDate,
          price: service.price,
          transaction_id: paymentIntent.id,
        },
      });

      console.log(`Subscription created for user ${user_id} with plan ${plan}.`);

      // 2. Update payment transaction
      if (!paymentIntent.id) {
        console.log('Payment Intent ID is missing.');
      }
      const paymentTransaction = await prismaTx.paymentTransaction.update({
        where: { id: paymentIntent.id },
        data: {
          status: "succeeded",
          subscription: { connect: { id: subscription.id } },
        },
      });

      console.log(`Payment transaction updated for user ${user_id}:`, paymentTransaction);

      return 'Payment Intent Success';
    } catch (error) {
      console.error(`Error processing payment intent for user ${user_id}:`, error);
      throw new Error('Failed to handle payment intent succeeded');
    }
  });

  console.log('Payment Intent processing complete:', transaction);
};
const handlePaymentIntentFailed = async (paymentIntent) => {
  const { user_id } = paymentIntent.metadata;

  if (!user_id) {
    console.error('User ID not found in payment intent metadata.');
    return;
  }

  const transaction = await prisma.$transaction(async (prismaTx) => {
    try {
      // 1. IF the payment intent fails
      const paymentTransaction = await prismaTx.paymentTransaction.update({
        where: { id: paymentIntent.id },
        data: {
          status: 'failed',
        },
      });

      console.log(`Payment transaction for user ${user_id} failed:`, paymentTransaction);
      return 'Payment Intent Failed';
    } catch (error) {
      console.error(`Error handling payment intent failure for user ${user_id}:`, error);
      throw new Error('Failed to handle failed payment');
    }
  });

  console.log('Payment Intent failure processed:', transaction);
};
const calculateSubscriptionEndDate = (startDate, plan) => {
  const endDate = new Date(startDate);

  if (plan === "HalfYearly") {
    endDate.setMonth(startDate.getMonth() + 6);
  } else {
    endDate.setFullYear(startDate.getFullYear() + 1);
  }

  return endDate;
};

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
      return res.status(201).json({ message: 'Currently no subscription is avilable' });
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
      return res.status(201).json({ message: 'No revenue data available for this month' });
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
        return res.status(201).json({ message: 'No active subscriptions found' });
      }

    res.json({ avgSubscriptionValue });
  } catch (error) {
    console.error('Error fetching average subscription value:', error);
    res.status(500).json({ error: 'Failed to fetch average subscription value' });
  }
}

