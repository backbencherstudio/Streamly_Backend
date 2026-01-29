# Download & Storage Integration Guide

**For: Payment/Subscription Handlers**

This guide shows you exactly how to integrate the download/storage system with your subscription payment handlers.

---

## 1. When User Subscribes to Premium ✅

### After Stripe Payment Success

```javascript
// In your Stripe webhook handler or payment success callback
// File: routes/payment.route.js or webhooks/stripe.webhook.js

import { createUserStorageQuota } from "../modules/Download/storageHelper.js";

// After payment verification succeeds:
async function handlePaymentSuccess(paymentData) {
  const userId = paymentData.userId; // or from metadata
  const planType = paymentData.planType; // "premium" or "family"

  try {
    // Step 1: Update user role in database
    const user = await prisma.user.update({
      where: { id: userId },
      data: { role: "premium" }, // or "family" if applicable
    });

    // Step 2: Initialize storage quota for premium user
    // This gives them storage access
    const storageQuota = await createUserStorageQuota(userId, "premium");

    console.log(`✅ User ${userId} upgraded to premium`);
    console.log(`✅ Storage quota initialized: ${storageQuota.total_storage_bytes} bytes`);

    // Step 3: Send confirmation email (optional)
    // await sendPremiumActivationEmail(user.email);

    return { success: true, user, storageQuota };
  } catch (error) {
    console.error("Error initializing premium features:", error);
    throw error;
  }
}
```

### Example Stripe Webhook Event

```javascript
// webhooks/stripe.webhook.js
import express from "express";
import stripe from "stripe";
import { createUserStorageQuota } from "../modules/Download/storageHelper.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const router = express.Router();

router.post("/webhooks/stripe", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle successful payment
  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object;
    const userId = paymentIntent.metadata.userId;
    const tier = paymentIntent.metadata.tier || "premium";

    try {
      // Update user role
      await prisma.user.update({
        where: { id: userId },
        data: { role: "premium" },
      });

      // Create storage quota
      await createUserStorageQuota(userId, tier);

      console.log(`✅ Premium activated for user ${userId}`);
    } catch (error) {
      console.error("Error processing premium activation:", error);
      return res.status(500).json({ error: "Failed to activate premium" });
    }
  }

  // Handle subscription cancellation
  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object;
    const userId = subscription.metadata.userId;

    try {
      // Downgrade user back to normal
      await prisma.user.update({
        where: { id: userId },
        data: { role: "normal" },
      });

      // DELETE storage quota (users lose access)
      await prisma.userStorageQuota.delete({
        where: { user_id: userId },
      });

      console.log(`⚠️ Premium downgraded for user ${userId}`);
    } catch (error) {
      console.error("Error processing premium cancellation:", error);
    }
  }

  res.json({ received: true });
});

export default router;
```

---

## 2. When User Signs Up (NORMAL User)

### Do NOT Create Storage Quota

```javascript
// In your signup handler
// File: modules/user/user.controller.js

async function signupUser(req, res) {
  try {
    const { email, password, username } = req.body;

    // Create new user with role = "normal"
    const user = await prisma.user.create({
      data: {
        email,
        username,
        password_hash: hashedPassword,
        role: "normal", // ← Important: not "premium"
      },
    });

    // ❌ DO NOT CALL THIS FOR NORMAL USERS:
    // await createUserStorageQuota(userId, "free");
    // await initializeQuota(req, res);

    // ✅ CORRECT: Just create the user, no storage quota
    console.log(`✅ User ${user.id} created with role='normal'`);
    console.log(`⏭️ Storage will be enabled after premium subscription`);

    return res.status(201).json({
      success: true,
      message: "Account created. Subscribe to premium to download videos.",
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
}
```

---

## 3. Tier Upgrade (Premium to Family)

### Upgrade Existing Premium User

```javascript
// When premium user upgrades to family plan
// File: modules/Download/storageQuota.controller.js (already implemented)

import { upgradeStorageQuota } from "./storageHelper.js";

async function handleFamilyUpgrade(userId) {
  try {
    const upgraded = await upgradeStorageQuota(userId, "family");

    console.log(`✅ User ${userId} upgraded from premium to family`);
    console.log(`Storage increased from 50GB to 100GB`);

    return upgraded;
  } catch (error) {
    console.error("Error upgrading to family:", error);
    throw error;
  }
}
```

---

## 4. Subscription Cancellation

### Remove Storage Access

```javascript
// When user cancels subscription
// File: webhooks/stripe.webhook.js (see example above)

async function handleSubscriptionCancelled(userId) {
  try {
    // Step 1: Downgrade user role
    await prisma.user.update({
      where: { id: userId },
      data: { role: "normal" }, // Back to normal
    });

    // Step 2: Remove storage quota
    // User loses download/storage access immediately
    await prisma.userStorageQuota.delete({
      where: { user_id: userId },
    });

    // Step 3: Soft-delete user's downloads (optional)
    // Or keep them but make inaccessible until resubscription
    await prisma.download.updateMany({
      where: { user_id: userId, deleted_at: null },
      data: { deleted_at: new Date() },
    });

    console.log(`⚠️ Subscription cancelled for user ${userId}`);
    console.log(`Downloads and storage access disabled`);
  } catch (error) {
    console.error("Error cancelling subscription:", error);
    throw error;
  }
}
```

---

## 5. API Reference for Integration

### Initialize Premium Storage (After Payment)

```bash
# Method 1: Direct Database Call (Recommended)
await createUserStorageQuota(userId, "premium");

# Method 2: HTTP POST (if called from external service)
POST /api/storage/quota/initialize
Headers:
  Authorization: Bearer <USER_TOKEN>
  Content-Type: application/json

Body:
{
  "tier": "premium"
}

Response:
{
  "success": true,
  "message": "Storage quota initialized",
  "quota": {
    "user_id": "user123",
    "tier": "premium",
    "total_storage_bytes": "53687091200",
    "used_storage_bytes": "0",
    "auto_delete_enabled": true,
    "auto_delete_days": 45,
    "notification_threshold": 80
  }
}
```

### Upgrade Storage Tier

```bash
# Method 1: Direct Database Call
await upgradeStorageQuota(userId, "family");

# Method 2: HTTP POST
POST /api/storage/quota/upgrade
Headers:
  Authorization: Bearer <PREMIUM_USER_TOKEN>
  Content-Type: application/json

Body:
{
  "tier": "family"
}

Response:
{
  "success": true,
  "message": "Storage tier upgraded to family",
  "quota": {
    "tier": "family",
    "total_storage_bytes": "107374182400"
  }
}
```

### Check Remaining Storage

```bash
GET /api/storage/quota/remaining
Headers: Authorization: Bearer <PREMIUM_USER_TOKEN>

Response:
{
  "success": true,
  "tier": "premium",
  "total_bytes": "53687091200",
  "used_bytes": "10737418240",
  "remaining_bytes": "42949672960",
  "remaining_gb": 40,
  "used_percent": 20
}
```

### Get User's Current Quota

```bash
GET /api/storage/quota
Headers: Authorization: Bearer <PREMIUM_USER_TOKEN>

Response:
{
  "success": true,
  "quota": {
    "tier": "premium",
    "total_storage": "50 GB",
    "used_storage": "10 GB",
    "remaining_storage": "40 GB",
    "used_percent": 20,
    "auto_delete_enabled": true,
    "auto_delete_days": 45,
    "notification_threshold": 80
  }
}
```

---

## 6. Common Mistakes to Avoid ❌

### Mistake 1: Creating Free Tier Storage

```javascript
// ❌ WRONG - Creates free tier storage for normal users
await createUserStorageQuota(userId, "free");

// ✅ CORRECT - Only create when user is premium
if (user.role === "premium") {
  await createUserStorageQuota(userId, "premium");
}
```

### Mistake 2: Creating Storage on Signup

```javascript
// ❌ WRONG - Normal users get storage on signup
async function signupUser(req, res) {
  const user = await prisma.user.create({ ... });
  await createUserStorageQuota(user.id, "free"); // ← NO!
}

// ✅ CORRECT - Only create after premium payment
async function handlePaymentSuccess(userId) {
  await createUserStorageQuota(userId, "premium");
}
```

### Mistake 3: Not Removing Storage on Downgrade

```javascript
// ❌ WRONG - User downgraded but storage still exists
await prisma.user.update({
  where: { id: userId },
  data: { role: "normal" },
});
// Storage quota still in database!

// ✅ CORRECT - Remove storage when downgrading
await prisma.user.update({
  where: { id: userId },
  data: { role: "normal" },
});
await prisma.userStorageQuota.delete({
  where: { user_id: userId },
});
```

### Mistake 4: Allowing Free Tier in Requests

```javascript
// ❌ WRONG - Accepting free tier
POST /api/storage/quota/upgrade
Body: { tier: "free" } ← Rejected (validation in place)

// ✅ CORRECT - Only premium or family
POST /api/storage/quota/upgrade
Body: { tier: "premium" } OR { tier: "family" }
```

---

## 7. Database Queries for Verification

### Check Premium Users Without Storage

```sql
-- Find premium users who should have storage but don't
SELECT u.id, u.email, u.role
FROM "User" u
WHERE u.role = 'premium'
  AND u.id NOT IN (
    SELECT user_id FROM "UserStorageQuota"
  );
```

### Check for Invalid Free Tier Storage

```sql
-- Should be empty - free tier should never exist
SELECT * FROM "UserStorageQuota" WHERE tier = 'free';
```

### Check User Storage Growth

```sql
-- Monitor storage usage trends
SELECT 
  user_id,
  tier,
  total_storage_bytes,
  used_storage_bytes,
  (used_storage_bytes * 100.0 / total_storage_bytes) as used_percent
FROM "UserStorageQuota"
ORDER BY used_percent DESC;
```

---

## 8. Testing Checklist

- [ ] Create normal user → No storage quota created
- [ ] Normal user tries to download → 403 Forbidden
- [ ] Normal user tries to view storage → 403 Forbidden
- [ ] Premium user subscribes → Storage quota auto-created with 50GB
- [ ] Premium user can download → 201 Created response
- [ ] Premium user can view storage → 200 OK with usage data
- [ ] Premium user upgrades to family → Storage increases to 100GB
- [ ] User cancels subscription → Role changed to normal, storage deleted
- [ ] Cancelled user tries to download → 403 Forbidden
- [ ] DB has no free tier quotas → Query returns empty

---

## 9. Timeline for Implementation

### Week 1: Storage Integration
- [ ] Update user signup to skip storage quota
- [ ] Add storage quota creation to payment handler
- [ ] Test premium signup flow

### Week 2: Subscription Management
- [ ] Add storage removal to cancellation handler
- [ ] Add tier upgrade to payment handler
- [ ] Test upgrade/downgrade flows

### Week 3: Monitoring
- [ ] Set up storage quota monitoring
- [ ] Add alerts for quota-related issues
- [ ] Add audit logging for storage changes

---

## 10. Support Contact

For issues with download/storage integration:
1. Check `DOWNLOAD_SECURITY_CHECKLIST.md` for security validation
2. Check `DOWNLOAD_API.md` for endpoint documentation
3. Check error responses for `upgrade_required` flag
4. Enable debug logging on `storageHelper.js` functions

---

**Last Updated**: January 28, 2026
**Status**: ✅ READY FOR INTEGRATION
**Files Modified**: 3 (storageHelper.js, download.controller.js, storageQuota.controller.js)
