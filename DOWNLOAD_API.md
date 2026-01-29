# Download & Storage Management API Documentation

## Overview

The Download & Storage Management system allows users to download content for offline viewing, similar to YouTube's offline feature. Each user gets allocated storage space based on their subscription tier:

- **Free**: 5 GB
- **Premium**: 50 GB
- **Family**: 100 GB

---

## Database Schema

### Download Model
```prisma
model Download {
  id              String
  user_id         String         // Reference to User
  content_id      String         // Reference to Content
  status          DownloadStatus // pending|downloading|completed|paused|failed|cancelled
  quality         String         // "480p", "720p", "1080p", "4k"
  progress        Int            // 0-100 percentage
  file_size_bytes BigInt         // Actual downloaded file size
  downloaded_bytes BigInt        // Bytes downloaded so far
  expires_at      DateTime       // Auto-delete date (optional)
  error_message   String         // Error details if failed
  failed_count    Int            // Number of failed attempts
  created_at      DateTime
  updated_at      DateTime
}
```

### UserStorageQuota Model
```prisma
model UserStorageQuota {
  id                      String
  user_id                 String  // Reference to User (unique)
  tier                    StorageTier // free|premium|family
  total_storage_bytes     BigInt
  used_storage_bytes      BigInt
  auto_delete_enabled     Boolean // Enable auto-delete old downloads
  auto_delete_days        Int     // Delete downloads older than X days
  notification_threshold  Int     // Notify when X% of storage used
  created_at              DateTime
  updated_at              DateTime
}
```

---

## API Endpoints

### 1. Download Management

#### 1.1 Start Download
```
POST /api/downloads/start
```

**Authentication**: Required (normal, premium)

**Request Body**:
```json
{
  "content_id": "clx456def",
  "quality": "720p"  // Optional: "480p" | "720p" | "1080p" | "4k" (default: "720p")
}
```

**Response (201 Created)**:
```json
{
  "success": true,
  "message": "Download started",
  "download": {
    "id": "clx123abc",
    "user_id": "clx789ghi",
    "content_id": "clx456def",
    "status": "pending",
    "quality": "720p",
    "progress": 0,
    "file_size_bytes": "536870912",
    "downloaded_bytes": "0",
    "expires_at": "2026-02-27T10:30:00.000Z",
    "created_at": "2026-01-28T10:30:00.000Z"
  }
}
```

**Error Responses**:
- `400`: Missing content_id
- `404`: Content not found
- `403`: Premium subscription required
- `409`: Download already exists
- `413`: Insufficient storage space

---

#### 1.2 Get Downloads List
```
GET /api/downloads?page=1&take=20&status=completed
```

**Authentication**: Required (normal, premium)

**Query Parameters**:
- `page` (optional): Page number (default: 1)
- `take` (optional): Items per page (default: 20, max: 100)
- `status` (optional): Filter by status (pending|downloading|completed|paused|failed)

**Response (200 OK)**:
```json
{
  "success": true,
  "downloads": [
    {
      "id": "clx123abc",
      "user_id": "clx789ghi",
      "content_id": "clx456def",
      "status": "completed",
      "quality": "720p",
      "progress": 100,
      "file_size_bytes": "536870912",
      "downloaded_bytes": "536870912",
      "expires_at": "2026-02-27T10:30:00.000Z",
      "content": {
        "id": "clx456def",
        "title": "The Dark Knight",
        "content_type": "movie",
        "thumbnail": "https://...",
        "is_premium": true
      },
      "created_at": "2026-01-28T10:30:00.000Z",
      "updated_at": "2026-01-28T10:35:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "take": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

---

#### 1.3 Get Download Progress
```
GET /api/downloads/:id/progress
```

**Authentication**: Required (normal, premium)

**URL Parameters**:
- `id`: Download ID

**Response (200 OK)**:
```json
{
  "success": true,
  "download": {
    "id": "clx123abc",
    "status": "downloading",
    "progress": 45,
    "file_size_bytes": "536870912",
    "downloaded_bytes": "241172480",
    "content": {
      "id": "clx456def",
      "title": "The Dark Knight"
    }
  }
}
```

**Error Response** (404):
```json
{
  "success": false,
  "message": "Download not found"
}
```

---

#### 1.4 Pause Download
```
PATCH /api/downloads/:id/pause
```

**Authentication**: Required (normal, premium)

**URL Parameters**:
- `id`: Download ID

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Download paused",
  "download": {
    "id": "clx123abc",
    "status": "paused",
    "progress": 45
  }
}
```

---

#### 1.5 Resume Download
```
PATCH /api/downloads/:id/resume
```

**Authentication**: Required (normal, premium)

**URL Parameters**:
- `id`: Download ID

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Download resumed",
  "download": {
    "id": "clx123abc",
    "status": "downloading",
    "progress": 45
  }
}
```

---

#### 1.6 Cancel Download
```
DELETE /api/downloads/:id
```

**Authentication**: Required (normal, premium)

**URL Parameters**:
- `id`: Download ID

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Download cancelled",
  "download": {
    "id": "clx123abc",
    "status": "cancelled"
  }
}
```

---

#### 1.7 Delete Download (Free Storage)
```
DELETE /api/downloads/:id/delete
```

**Authentication**: Required (normal, premium)

**URL Parameters**:
- `id`: Download ID

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Download deleted",
  "download": {
    "id": "clx123abc",
    "deleted_at": "2026-01-28T11:00:00.000Z"
  }
}
```

---

#### 1.8 Cleanup Storage
```
POST /api/downloads/cleanup
```

**Authentication**: Required (normal, premium)

**Request Body**:
```json
{
  "type": "old"  // "expired" or "old"
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Cleanup completed - deleted 3 downloads",
  "freed_storage": "1.43 GB",
  "freed_storage_bytes": "1537302528"
}
```

---

### 2. Storage Usage & Info

#### 2.1 Get Storage Usage
```
GET /api/downloads/storage/usage
```

**Authentication**: Required (normal, premium)

**Response (200 OK)**:
```json
{
  "success": true,
  "storage": {
    "tier": "premium",
    "total_storage": "50 GB",
    "total_storage_bytes": "53687091200",
    "used_storage": "25.5 GB",
    "used_storage_bytes": "27395133440",
    "remaining_storage": "24.5 GB",
    "remaining_storage_bytes": "26291957760",
    "used_percent": 51,
    "auto_delete_enabled": true,
    "auto_delete_days": 30,
    "notification_threshold": 80
  },
  "alert": {
    "used_percent": 51,
    "threshold": 80,
    "should_alert": false,
    "tier": "premium"
  }
}
```

---

#### 2.2 Get Storage Info (Detailed)
```
GET /api/downloads/storage/info
```

**Authentication**: Required (normal, premium)

**Response (200 OK)**:
```json
{
  "success": true,
  "storage": {
    "tier": "premium",
    "total_storage": "50 GB",
    "used_storage": "25.5 GB",
    "remaining_storage": "24.5 GB",
    "used_percent": 51
  },
  "downloads_summary": {
    "pending": 2,
    "downloading": 1,
    "completed": 15,
    "paused": 1,
    "failed": 0,
    "cancelled": 2
  },
  "oldest_download": "2026-01-15T08:00:00.000Z"
}
```

---

### 3. Storage Quota Management

#### 3.1 Get Storage Tiers
```
GET /api/storage/tiers
```

**Authentication**: Not required (public)

**Response (200 OK)**:
```json
{
  "success": true,
  "tiers": {
    "free": {
      "tier": "free",
      "storage_gb": 5,
      "storage_bytes": "5368709120",
      "description": "Basic storage for casual users",
      "features": [
        "5 GB storage",
        "Download for offline viewing",
        "30-day auto-delete"
      ]
    },
    "premium": {
      "tier": "premium",
      "storage_gb": 50,
      "storage_bytes": "53687091200",
      "description": "Perfect for regular watchers",
      "features": [
        "50 GB storage",
        "Download multiple titles",
        "45-day auto-delete"
      ]
    },
    "family": {
      "tier": "family",
      "storage_gb": 100,
      "storage_bytes": "107374182400",
      "description": "Great for families",
      "features": [
        "100 GB storage",
        "Multiple user accounts",
        "60-day auto-delete"
      ]
    }
  }
}
```

---

#### 3.2 Get User Quota
```
GET /api/storage/quota
```

**Authentication**: Required (normal, premium)

**Response (200 OK)**:
```json
{
  "success": true,
  "quota": {
    "tier": "premium",
    "total_storage": "50 GB",
    "total_storage_bytes": "53687091200",
    "used_storage": "25.5 GB",
    "used_storage_bytes": "27395133440",
    "remaining_storage": "24.5 GB",
    "remaining_storage_bytes": "26291957760",
    "used_percent": 51,
    "auto_delete_enabled": true,
    "auto_delete_days": 30,
    "notification_threshold": 80
  }
}
```

---

#### 3.3 Get Remaining Storage (Quick Check)
```
GET /api/storage/quota/remaining
```

**Authentication**: Required (normal, premium)

**Response (200 OK)**:
```json
{
  "success": true,
  "tier": "premium",
  "total_storage": "50 GB",
  "total_storage_bytes": "53687091200",
  "used_storage": "25.5 GB",
  "used_storage_bytes": "27395133440",
  "remaining_storage": "24.5 GB",
  "remaining_storage_bytes": "26291957760",
  "remaining_percent": 49
}
```

---

#### 3.4 Initialize Storage Quota
```
POST /api/storage/quota/initialize
```

**Authentication**: Required (normal, premium)

**Request Body**:
```json
{
  "tier": "free"  // Optional: "free" (default) | "premium" | "family"
}
```

**Response (201 Created)**:
```json
{
  "success": true,
  "message": "Storage quota initialized",
  "quota": {
    "id": "clx123abc",
    "user_id": "clx789ghi",
    "tier": "free",
    "total_storage_bytes": "5368709120",
    "used_storage_bytes": "0",
    "auto_delete_enabled": true,
    "auto_delete_days": 30,
    "notification_threshold": 80
  }
}
```

---

#### 3.5 Upgrade Storage Quota
```
POST /api/storage/quota/upgrade
```

**Authentication**: Required (normal, premium)

**Request Body**:
```json
{
  "tier": "premium"  // "free" | "premium" | "family"
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Storage upgraded to premium",
  "quota": {
    "id": "clx123abc",
    "user_id": "clx789ghi",
    "tier": "premium",
    "total_storage_bytes": "53687091200",
    "used_storage_bytes": "27395133440"
  }
}
```

---

#### 3.6 Update Quota Settings
```
PATCH /api/storage/quota/settings
```

**Authentication**: Required (normal, premium)

**Request Body**:
```json
{
  "auto_delete_enabled": true,
  "auto_delete_days": 45,
  "notification_threshold": 75
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Storage settings updated",
  "quota": {
    "id": "clx123abc",
    "auto_delete_enabled": true,
    "auto_delete_days": 45,
    "notification_threshold": 75
  }
}
```

---

## Error Codes

| Code | Message | Meaning |
|------|---------|---------|
| 400 | Missing required field | Invalid or missing request parameter |
| 403 | Premium subscription required | User lacks required subscription |
| 404 | Download/Content not found | Resource doesn't exist |
| 409 | Download already exists | Download already in progress |
| 413 | Insufficient storage space | Not enough storage for download |
| 500 | Internal Server Error | Server-side error |

---

## Quality & File Size

Download file sizes are calculated based on quality selection:

| Quality | Size Multiplier | Example (1GB original) |
|---------|-----------------|----------------------|
| 480p    | 30%             | ~300 MB              |
| 720p    | 60% (default)   | ~600 MB              |
| 1080p   | 100%            | ~1 GB                |
| 4K      | 200%            | ~2 GB                |

---

## Auto-Delete & Expiration

### Expiration
- Downloads automatically expire 30 days after creation
- Expired downloads are soft-deleted and don't count toward storage

### Auto-Delete Settings
- **Default**: Enabled
- **Threshold**: Older downloads are deleted based on `auto_delete_days` setting
- **Customizable**: Users can change `auto_delete_days` (1-365 days)

### Storage Quota
- **free**: 5 GB
- **premium**: 50 GB
- **family**: 100 GB

---

## Helper Functions (Internal)

### storageHelper.js

```javascript
// Calculate used storage for a user
calculateStorageUsed(userId)

// Check if user has available storage
checkQuotaAvailable(userId, requiredBytes)

// Get user's storage info (formatted)
getUserStorageInfo(userId)

// Create or update user storage quota
createUserStorageQuota(userId, tier)

// Upgrade user's storage tier
upgradeStorageQuota(userId, newTier)

// Auto-cleanup expired downloads
cleanupExpiredDownloads(userId)

// Cleanup old downloads based on auto_delete_days
cleanupOldDownloads(userId)

// Format bytes to human-readable (B, KB, MB, GB, TB)
formatBytes(bytes)

// Get storage tier limit in bytes
getStorageTierLimit(tier)

// Calculate download file size based on quality
calculateDownloadSize(originalFileSize, quality)
```

---

## Integration Guide

### 1. After User Signup
```javascript
// Initialize storage quota (call in signup handler)
await createUserStorageQuota(userId, "free");
```

### 2. After Subscription Upgrade
```javascript
// Upgrade storage tier when user subscribes
await upgradeStorageQuota(userId, "premium");
```

### 3. Background Job (Cron)
```javascript
// Run daily to clean up expired/old downloads
nodeCron.schedule("0 0 * * *", async () => {
  await cleanupExpiredDownloads();
  await cleanupOldDownloads();
});
```

### 4. Frontend: Check Storage Before Download
```javascript
// Before starting download, check available storage
const {storage} = await fetch('/api/downloads/storage/usage');
const canDownload = storage.remaining_storage_bytes > estimatedFileSize;
```

---

## Example Usage Flows

### Flow 1: Download a Movie
1. User clicks "Download" button on movie
2. Select quality (480p, 720p, 1080p, 4K)
3. `POST /api/downloads/start` with content_id and quality
4. Check response: If success, show progress UI
5. Poll `GET /api/downloads/:id/progress` for real-time progress
6. When complete, download becomes playable offline

### Flow 2: Manage Storage
1. User opens "Downloads" section
2. Show list: `GET /api/downloads?status=completed`
3. Show usage: `GET /api/downloads/storage/usage`
4. User can delete downloads: `DELETE /api/downloads/:id/delete`
5. Auto-cleanup happens based on settings

### Flow 3: Premium Subscription
1. User upgrades to Premium
2. Backend: `POST /api/storage/quota/upgrade` with tier=premium
3. Storage increases from 5GB to 50GB
4. User can download more content

---

## Best Practices

1. **Always check storage before download**: Call `/api/downloads/storage/remaining` before starting
2. **Show progress**: Poll progress endpoint every 1-2 seconds
3. **Allow pause/resume**: Implement pause/resume buttons
4. **Auto-cleanup**: Let users customize auto-delete settings
5. **Notifications**: Alert when storage usage exceeds threshold
6. **Error handling**: Retry failed downloads with backoff strategy

---

## Future Enhancements

- [ ] Real-time progress via WebSocket instead of polling
- [ ] Download queue management
- [ ] Selective download quality per device
- [ ] Download scheduling (download during WiFi only)
- [ ] Multi-file download (series episodes)
- [ ] Storage analytics dashboard
- [ ] Device-specific downloads
