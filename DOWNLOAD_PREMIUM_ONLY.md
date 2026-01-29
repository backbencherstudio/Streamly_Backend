# Download & Storage - Premium Only Restrictions

**Status**: ✅ Updated January 28, 2026

---

## 📋 Access Restrictions Summary

### Download Feature
- ✅ **Premium Users**: Full access to all download features
- ❌ **Normal/Free Users**: Completely restricted

### Storage Quota
- ✅ **Premium Users**: Full storage quota and management
- ❌ **Normal/Free Users**: No storage allocation or management

---

## 🔒 Restricted Endpoints (13 Total)

All download and storage endpoints now return **403 Forbidden** for non-premium users:

### Download Management (8)
```
POST   /api/downloads/start              ⛔ Premium only
GET    /api/downloads                    ⛔ Premium only
GET    /api/downloads/:id/progress       ⛔ Premium only
PATCH  /api/downloads/:id/pause          ⛔ Premium only
PATCH  /api/downloads/:id/resume         ⛔ Premium only
DELETE /api/downloads/:id                ⛔ Premium only
DELETE /api/downloads/:id/delete         ⛔ Premium only
POST   /api/downloads/cleanup            ⛔ Premium only
```

### Storage Usage (2)
```
GET    /api/downloads/storage/usage      ⛔ Premium only
GET    /api/downloads/storage/info       ⛔ Premium only
```

### Storage Quota (5)
```
GET    /api/storage/tiers                ✅ Public (no auth)
GET    /api/storage/quota                ⛔ Premium only
GET    /api/storage/quota/remaining      ⛔ Premium only
POST   /api/storage/quota/initialize     ⛔ Premium only
POST   /api/storage/quota/upgrade        ⛔ Premium only
PATCH  /api/storage/quota/settings       ⛔ Premium only
```

**Note**: `GET /api/storage/tiers` remains public so users can see available options

---

## 📝 Error Response for Non-Premium Users

When a normal/free user tries to access restricted endpoints:

```json
{
  "success": false,
  "message": "Download feature is only available for premium users",
  "upgrade_required": true
}
```

**Status Code**: 403 Forbidden

---

## 🎯 Implementation Details

### Route Authentication
All download and storage routes now use:
```javascript
verifyUser("premium")  // Only premium role allowed
```

Previous: `verifyUser("normal", "premium")` ❌ Removed

### Controller-Level Checks
Each endpoint also checks user role:
```javascript
if (role !== "premium") {
  return res.status(403).json({
    success: false,
    message: "Feature is only available for premium users",
    upgrade_required: true
  });
}
```

### Default Tier for New Premium Users
When initializing quota for new premium users:
```javascript
const { tier = "premium" } = req.body;  // Default to "premium"
```

Previous: `"free"` ❌ Changed to `"premium"`

---

## 💾 Storage Tier Allocation

### Premium Users (After Subscription)
- **Tier**: `premium` (50 GB)
- **Auto-Delete**: 45 days
- **Notification**: At 80% usage

### Normal/Free Users
- **Storage**: 0 GB (None)
- **Downloads**: Not allowed
- **Response**: 403 Forbidden

---

## 🔄 User Flow Changes

### Before (Old)
```
User Signs Up
  ↓
Auto-initialize Free Tier (5 GB)  ← Can download
  ↓
Upgrade to Premium → Premium Tier (50 GB)
```

### After (New) ✅
```
User Signs Up
  ↓
No Storage (Free Tier)  ← CANNOT download
  ↓
Upgrade to Premium → Premium Tier (50 GB)  ← CAN download
  ↓
Can now use all download features
```

---

## 📲 Frontend Changes Needed

### Download Button
- **Before**: Show for all users
- **After**: Only show for premium users, or show with "Premium Only" badge

### Download List
- **Before**: Accessible to all
- **After**: Return 403 if normal user tries to access

### Storage Management UI
- **Before**: Show for all
- **After**: Only show for premium users

### Tier Selector
- **Before**: Could show free tier
- **After**: Only show premium/family tiers for downloads

---

## 🧪 Testing Scenarios

### Test 1: Normal User Tries to Download
```
User Role: normal
Endpoint: POST /api/downloads/start
Expected: 403 Forbidden
Message: "Download feature is only available for premium users"
```

### Test 2: Premium User Can Download
```
User Role: premium
Endpoint: POST /api/downloads/start
Expected: 201 Created (or appropriate response)
```

### Test 3: Normal User Checks Storage
```
User Role: normal
Endpoint: GET /api/downloads/storage/usage
Expected: 403 Forbidden
```

### Test 4: Public Can Check Tiers
```
Auth: Not required
Endpoint: GET /api/storage/tiers
Expected: 200 OK (returns available tiers)
```

---

## 🚀 Integration Checklist

When connecting to user authentication:

1. **Signup Handler**
   - [ ] Do NOT initialize storage quota
   - [ ] User gets `role: "normal"` (no downloads)

2. **Subscription Upgrade**
   - [ ] After payment, set `role: "premium"`
   - [ ] Call `createUserStorageQuota(userId, "premium")`
   - [ ] User now has 50 GB storage

3. **Subscription Downgrade/Cancel**
   - [ ] Set `role: "normal"`
   - [ ] Optionally soft-delete downloads
   - [ ] Update quota to 0 or mark as inactive

4. **Logout/Session**
   - [ ] Verify role is correctly passed in JWT

---

## 📊 Database Impact

### New Premium User (After Subscription)
```sql
-- User Table
UPDATE users 
SET role = 'premium' 
WHERE id = 'user123';

-- UserStorageQuota Table
INSERT INTO user_storage_quotas (user_id, tier, total_storage_bytes)
VALUES ('user123', 'premium', 53687091200);  -- 50 GB
```

### Normal User (Free)
```sql
-- User Table
SET role = 'normal'

-- UserStorageQuota Table
(No quota created or NULL)
```

---

## ⚠️ Important Notes

1. **No Storage for Free Users**: Free users have 0 bytes allocation
2. **Download Immediately Blocked**: Endpoints return 403 before any processing
3. **Tier List Public**: Users can see what they get by upgrading
4. **Upgrade Required Flag**: Response includes `upgrade_required: true` for UI to handle
5. **Backward Compatible**: Existing premium users keep their downloads

---

## 🔮 Future Options

If you want to offer limited downloads to free users later:
- Add `free_tier` with limited storage (e.g., 1 GB)
- Add `family` tier with 100 GB
- Implement trial period (e.g., 7 days free premium)
- Add ads for free users

---

## Summary Table

| Feature | Normal/Free | Premium | Family |
|---------|------------|---------|--------|
| Download Videos | ❌ No | ✅ Yes | ✅ Yes |
| Storage Quota | ❌ None | ✅ 50 GB | ✅ 100 GB |
| Pause/Resume | ❌ No | ✅ Yes | ✅ Yes |
| Auto-Cleanup | ❌ No | ✅ Yes | ✅ Yes |
| Storage Settings | ❌ No | ✅ Yes | ✅ Yes |

---

**Last Updated**: January 28, 2026
**Status**: ✅ Implementation Complete
