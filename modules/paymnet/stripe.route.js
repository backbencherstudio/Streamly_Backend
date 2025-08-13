import express from 'express';
import bodyParser from 'body-parser';
import { createPaymentIntent, getAllSubscriptions, handleWebhook ,getTotalSubscribers , getTotalActiveSubscriptions , getTotalMonthlyRevenue , getAvgSubsctiptionValue} from './stripe.controller.js';
import { verifyUser } from '../../middlewares/verifyUsers.js';
const router = express.Router();

router.post('/pay', verifyUser("normal"), createPaymentIntent);
router.post("/webhook", handleWebhook);
router.get("/getAllSubscriptions", verifyUser("admin"), getAllSubscriptions);


// Subscription 

router.get("/totalSubscribers", verifyUser("admin"),getTotalSubscribers)
router.get("/totalActiveSubscribers", verifyUser("admin"),getTotalActiveSubscriptions)
router.get("/totalMonthlyRevenue", verifyUser("admin"),getTotalMonthlyRevenue)
router.get("/totalAvgSubValue", verifyUser("admin"),getAvgSubsctiptionValue)

export default router;
