import express from 'express';
import bodyParser from 'body-parser';
import { createPaymentIntent, handleWebhook } from './stripe.controller.js';
import { verifyUser } from '../../middlewares/verifyUsers.js';
const router = express.Router();

router.post('/pay', verifyUser("normal"), createPaymentIntent);
router.post("/webhook", handleWebhook);


export default router;
