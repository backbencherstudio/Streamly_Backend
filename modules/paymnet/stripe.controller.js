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

    const { email, role, type, userId } = req.user || {};
    console.log('User Info:', { email, role, type, userId });

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
            user_type: type,
            service_id,
            plan: service.plan,
          }
        });

        const paymentTransaction = await prismaTx.paymentTransaction.create({
          data: {
            user: { connect: { id: userId } },
            price: paymentIntent.amount,
            currency: paymentIntent.currency,
            status: "pending",
            payment_method: paymentIntent.payment_method,
          },
        });

        // console.log('Payment Transaction Created:', paymentTransaction);
        // console.log('Payment Intent Created:', paymentIntent.client_secret);
        // console.log('Payment Intent Metadata:', paymentIntent.metadata);

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

  if (!user_id) {
    console.error('User ID not found in payment intent metadata.');
    return;
  }

  const transaction = await prisma.$transaction(async (prismaTx) => {
    try {
      // 1. Update user 
      const userUpdate = await prismaTx.user.update({
        where: { id: user_id },
        select: { name: true },
        data: {
          role: "premium",
          is_subscribed: true,
        },
      });

      console.log(`User ${user_id}'s role updated to "premium".`);


      const service = await prismaTx.services.findUnique({
        where: { id: service_id },
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
          username: userUpdate.name,
          plan: plan,
          start_date: startDate,
          end_date: endDate,
          price: service.price,
        },
      });

      console.log(`Subscription created for user ${user_id} with plan ${plan}.`);

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
