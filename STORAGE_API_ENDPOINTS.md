# Storage & Download API Endpoints (Consolidated)

## Overview
**Total Endpoints: 12** (Down from 16 - Consolidated to single unified storage dashboard)
**Authentication:** All endpoints require `role: "premium"`
**Base Path:** `/api/downloads` (except quota which is `/api/storage`)

---

## 1. Download Management Endpoints (8)

### 1. Start Download
**POST** `/api/downloads/start`
```json
{
  "content_id": "string",
  "quality": "480p" | "720p" | "1080p" | "4k"
}
```
**Response:**
```json
{
  "success": true,
  "download": {
    "id": "string",
    "user_id": "string",
    "content_id": "string",
    "file_size_bytes": "string",
    "quality": "720p",
    "status": "pending",
    "progress": 0,
    "created_at": "ISO8601",
    "content": {
      "id": "string",
      "title": "string",
      "thumbnail": "string"
    }
  }
}
```

---

### 2. Get All Downloads
**GET** `/api/downloads?page=1&take=20&status=completed`
**Query Parameters:**
- `page` (optional, default: 1)
- `take` (optional, default: 20, max: 100)
- `status` (optional: pending, downloading, completed, paused, failed, cancelled)

**Response:**
```json
{
  "success": true,
  "downloads": [...],
  "pagination": {
    "page": 1,
    "take": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

---

### 3. Get Download Progress
**GET** `/api/downloads/:id/progress`
**Response:**
```json
{
  "success": true,
  "id": "string",
  "status": "downloading",
  "progress": 75,
  "downloaded_bytes": "string",
  "file_size_bytes": "string"
}
```

---

### 4. Pause Download
**PATCH** `/api/downloads/:id/pause`
**Response:**
```json
{
  "success": true,
  "message": "Download paused",
  "download": { ... }
}
```

---

### 5. Resume Download
**PATCH** `/api/downloads/:id/resume`
**Response:**
```json
{
  "success": true,
  "message": "Download resumed",
  "download": { ... }
}
```

---

### 6. Cancel Download
**DELETE** `/api/downloads/:id`
**Response:**
```json
{
  "success": true,
  "message": "Download cancelled",
  "freed_storage": "125 MB"
}
```

---

### 7. Delete Download (Free Storage)
**DELETE** `/api/downloads/:id/delete`
**Response:**
```json
{
  "success": true,
  "message": "Download deleted",
  "freed_storage": "125 MB"
}
```

---

### 8. Cleanup All Downloads
**POST** `/api/downloads/cleanup`
**Response:**
```json
{
  "success": true,
  "message": "All downloads cleaned up",
  "deleted_count": 25,
  "freed_storage": "2.5 GB",
  "freed_storage_bytes": "2684354560"
}
```

---

## 2. Storage Dashboard Endpoint (1 - CONSOLIDATED)

### 9. Get Storage Dashboard ⭐ CONSOLIDATED
**GET** `/api/downloads/storage?page=1&take=20`

**Replaces:** `/storage/usage` + `/storage/info` + `/quota` + `/quota/remaining`

**Query Parameters:**
- `page` (optional, default: 1) - for downloads list pagination
- `take` (optional, default: 20, max: 100) - items per page

**Response:**
```json
{
  "success": true,
  "storage": {
    "tier": "premium",
    "total_storage": "50 GB",
    "total_storage_bytes": "53687091200",
    "used_storage": "30 GB",
    "used_storage_bytes": "32212254720",
    "remaining_storage": "20 GB",
    "remaining_storage_bytes": "21474836480",
    "used_percent": 60,
    "auto_delete_enabled": true,
    "auto_delete_days": 30,
    "notification_threshold": 80
  },
  "alert": {
    "used_percent": 60,
    "threshold": 80,
    "should_alert": false,
    "tier": "premium"
  },
  "downloads_summary": {
    "pending": 2,
    "downloading": 1,
    "completed": 15,
    "paused": 0,
    "failed": 1,
    "cancelled": 0
  },
  "downloads": [
    {
      "id": "string",
      "user_id": "string",
      "content_id": "string",
      "title": "string",
      "file_size_bytes": "string",
      "downloaded_bytes": "string",
      "quality": "720p",
      "status": "completed",
      "progress": 100,
      "created_at": "ISO8601",
      "content": {
        "id": "string",
        "title": "string",
        "thumbnail": "string"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "take": 20,
    "total": 19,
    "totalPages": 1
  }
}
```

**Use Cases:**
- Display storage circle/progress bar with percentage
- Show total, used, and remaining storage
- Display alert when approaching threshold
- Render downloads list with pagination
- Show summary of downloads by status

---

## 3. Storage Quota Management Endpoints (3)

### 10. Initialize Storage Quota
**POST** `/api/storage/quota/initialize`
**Body:**
```json
{
  "tier": "premium" | "family"
}
```
**Note:** Called automatically by payment/subscription handlers
**Response:**
```json
{
  "success": true,
  "quota": {
    "user_id": "string",
    "tier": "premium",
    "total_storage": "50 GB",
    "total_storage_bytes": "53687091200",
    "auto_delete_enabled": false,
    "notification_threshold": 80
  }
}
```

---

### 11. Upgrade Storage Tier
**POST** `/api/storage/quota/upgrade`
**Body:**
```json
{
  "tier": "premium" | "family"
}
```
**Note:** Prevents downgrade (family → premium only, not vice versa)
**Response:**
```json
{
  "success": true,
  "message": "Storage tier upgraded to family",
  "quota": { ... }
}
```

---

### 12. Update Storage Settings
**PATCH** `/api/storage/quota/settings`
**Body:**
```json
{
  "auto_delete_enabled": true,
  "notification_threshold": 85
}
```
**Notes:**
- When `auto_delete_enabled: true` → automatically sets 30-day retention
- When `auto_delete_enabled: false` → disables auto-deletion
- `notification_threshold`: 0-100 (percentage of storage used)

**Response:**
```json
{
  "success": true,
  "message": "Settings updated",
  "quota": {
    "user_id": "string",
    "tier": "premium",
    "total_storage": "50 GB",
    "auto_delete_enabled": true,
    "auto_delete_days": 30,
    "notification_threshold": 85
  }
}
```

---

## Summary of Changes

### Consolidation Details
| Old Endpoints | New Endpoint | Benefit |
|---|---|---|
| `/storage/usage` + `/storage/info` | `/storage` | Single API call for dashboard |
| `/quota` | Removed (redundant) | Data merged into `/storage` |
| `/quota/remaining` | Removed (redundant) | Remaining calculated from total - used |
| `/storage/tiers` | Removed | Tier info on subscription page |

### API Reduction
- **Before:** 16 endpoints
- **After:** 12 endpoints
- **Reduction:** 25% fewer endpoints
- **Benefit:** Simpler frontend, fewer API calls, cleaner data flow

---

## Authentication & Authorization

**All endpoints require:**
1. Valid JWT token in Authorization header
2. User role = "premium"
3. Three-layer security:
   - Route middleware: `verifyUser("premium")`
   - Controller validation: role check
   - Helper functions: null checks and premium validation

**Error Responses:**

Unauthorized (Not Premium):
```json
{
  "success": false,
  "message": "Storage feature is only available for premium users",
  "upgrade_required": true,
  "statusCode": 403
}
```

---

## Usage Examples

### Frontend: Display Storage Dashboard
```javascript
// Single API call replaces 4 old calls
const response = await fetch('/api/downloads/storage?page=1&take=20', {
  headers: { Authorization: `Bearer ${token}` }
});

const data = await response.json();

// Render circular progress
progress.textContent = `${data.storage.used_percent}%`;

// Render storage info
storageInfo.textContent = `${data.storage.used_storage} / ${data.storage.total_storage}`;

// Show alert if needed
if (data.alert.should_alert) {
  showAlert(`Storage usage at ${data.alert.used_percent}%`);
}

// Render downloads list
data.downloads.forEach(download => {
  renderDownloadItem(download);
});
```

### Backend: Initialize Quota After Subscription
```javascript
// Called when user upgrades to premium (payment success handler)
await initializeQuota(userId, 'premium');
```

### Backend: Update Auto-Delete Setting
```javascript
// Called when user toggles auto-delete
await updateQuotaSettings(userId, {
  auto_delete_enabled: true,
  notification_threshold: 80
});
```

---

## Error Handling

All endpoints return consistent error format:
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message",
  "statusCode": 400
}
```

**Common Status Codes:**
- `200` - Success
- `400` - Bad request
- `403` - Forbidden (not premium user)
- `404` - Not found
- `500` - Server error
