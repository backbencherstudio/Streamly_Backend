# Download & Storage API - Quick Reference

## All Endpoints at a Glance

```
┌─ DOWNLOAD MANAGEMENT (8 endpoints)
│
├─ POST   /api/downloads/start
│         Start new download with quality selection
│         Auth: premium
│         Body: /downloads/start
│
├─ GET    /api/downloads
│         List user's downloads with pagination
│         Auth: premium
│         Query: page?, take?, status?
│
├─ GET    /api/downloads/:id/progress
│         Get current download progress
│         Auth: premium
│
├─ PATCH  /api/downloads/:id/pause
│         Pause ongoing download
│         Auth: premium
│
├─ PATCH  /api/downloads/:id/resume
│         Resume paused download
│         Auth: premium
│
├─ DELETE /api/downloads/:id
│         Cancel download (soft delete)
│         Auth: premium
│
├─ DELETE /api/downloads/:id/delete
│         Delete completed download (free storage)
│         Auth: premium
│
└─ POST   /api/downloads/cleanup
          Manual cleanup of expired/old downloads
          Auth: premium
          Body: {type: "expired"|"old"}

┌─ STORAGE USAGE & INFO (2 endpoints)
│
├─ GET    /api/downloads/storage/usage
│         Get storage usage & alert status
│         Auth: premium
│
└─ GET    /api/downloads/storage/info
          Get detailed storage with download summary
          Auth: premium

┌─ STORAGE QUOTA MANAGEMENT (5 endpoints)
│
├─ GET    /api/storage/tiers
│         Get available storage tiers
│         Auth: NONE (public)
│
├─ GET    /api/storage/quota
│         Get user's current quota & usage
│         Auth: premium
│
├─ GET    /api/storage/quota/remaining
│         Quick check: remaining storage available
│         Auth: premium
│
├─ POST   /api/storage/quota/initialize
│         Initialize user's storage quota (on signup)
│         Auth: premium
│         Body: {tier?}
│
├─ POST   /api/storage/quota/upgrade
│         Upgrade storage tier (on subscription)
│         Auth: premium
│         Body: {tier}
│
└─ PATCH  /api/storage/quota/settings
          Update quota settings (auto-delete, thresholds)
          Auth: premium
          Body: {auto_delete_enabled?, auto_delete_days?, notification_threshold?}
```

---

## Response Status Codes

| Code | Meaning | Examples |
|------|---------|----------|
| 200 | Success | Get, Update, Delete successful |
| 201 | Created | Download started, Quota initialized |
| 400 | Bad Request | Missing fields, Invalid quality |
| 403 | Forbidden | Premium required, Unauthorized |
| 404 | Not Found | Download not found, Content unavailable |
| 409 | Conflict | Download already exists |
| 413 | Payload Too Large | Insufficient storage space |
| 500 | Server Error | Database error, Process error |

---

## Common Request/Response Patterns

### Pattern 1: Start Download (201)
```
REQUEST:
  POST /api/downloads/start
  {
    "content_id": "xyz123",
    "quality": "720p"
  }

RESPONSE:
  {
    "success": true,
    "message": "Download started",
    "download": {
      "id": "dl123",
      "status": "pending",
      "progress": 0,
      "file_size_bytes": "536870912"
    }
  }
```

### Pattern 2: Get Progress (200)
```
REQUEST:
  GET /api/downloads/dl123/progress

RESPONSE:
  {
    "success": true,
    "download": {
      "id": "dl123",
      "status": "downloading",
      "progress": 45,
      "file_size_bytes": "536870912",
      "downloaded_bytes": "241172480"
    }
  }
```

### Pattern 3: Get Storage Usage (200)
```
REQUEST:
  GET /api/downloads/storage/usage

RESPONSE:
  {
    "success": true,
    "storage": {
      "tier": "premium",
      "total_storage": "50 GB",
      "used_storage": "25.5 GB",
      "remaining_storage": "24.5 GB",
      "used_percent": 51
    },
    "alert": {
      "should_alert": false,
      "threshold": 80
    }
  }
```

### Pattern 4: Error Response (400/403/404/413)
```
RESPONSE:
  {
    "success": false,
    "message": "Insufficient storage space",
    "error": "Download would exceed quota"
  }
```

---

## Authentication

**All endpoints require authentication except**:
- `GET /api/storage/tiers` (public tier list)

**User Roles Required**:
- `premium` - Premium subscribers

**Auth Headers**:
```
Authorization: Bearer <jwt_token>
```

---

## Data Types & Formats

### BigInt Fields
All byte counts are strings in JSON (because JavaScript can't safely serialize large numbers):
```json
{
  "file_size_bytes": "536870912",
  "downloaded_bytes": "241172480",
  "total_storage_bytes": "53687091200",
  "used_storage_bytes": "27395133440"
}
```

### DateTime Fields
ISO 8601 format:
```json
{
  "created_at": "2026-01-28T10:30:00.000Z",
  "expires_at": "2026-02-27T10:30:00.000Z"
}
```

### Storage Sizes (Human Readable)
```json
{
  "total_storage": "50 GB",
  "used_storage": "25.5 GB",
  "remaining_storage": "24.5 GB"
}
```

### Enums

**DownloadStatus**:
- `pending` - Waiting to download
- `downloading` - Currently downloading
- `completed` - Download finished
- `paused` - User paused download
- `failed` - Download failed
- `cancelled` - User cancelled download

**StorageTier**:
- `premium` (50 GB)
- `family` (100 GB)

**Quality**:
- `480p` (30% size)
- `720p` (60% size) - default
- `1080p` (100% size)
- `4k` (200% size)

---

## Frontend Integration Examples

### React Hook: Download Management
```javascript
// Start download
const startDownload = async (contentId) => {
  const res = await fetch('/api/downloads/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content_id: contentId, quality: '720p' })
  });
  return res.json();
};

// Track progress
const trackProgress = async (downloadId) => {
  const res = await fetch(`/api/downloads/${downloadId}/progress`);
  return res.json();
};

// Get storage status
const getStorageStatus = async () => {
  const res = await fetch('/api/downloads/storage/usage');
  return res.json();
};
```

### React Hook: Quota Management
```javascript
// Get available tiers
const getTiers = async () => {
  const res = await fetch('/api/storage/tiers');
  return res.json();
};

// Get user quota
const getQuota = async () => {
  const res = await fetch('/api/storage/quota');
  return res.json();
};

// Upgrade tier
const upgradeTier = async (newTier) => {
  const res = await fetch('/api/storage/quota/upgrade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier: newTier })
  });
  return res.json();
};
```

---

## Pagination

**Supported on**:
- `GET /api/downloads` - List downloads

**Parameters**:
```
page=1      // Page number (default: 1, min: 1)
take=20     // Items per page (default: 20, min: 1, max: 100)
status=completed  // Filter by status (optional)
```

**Response includes**:
```json
{
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

## File Size Calculator

Given original file size and quality:

```javascript
const QUALITY_MULTIPLIERS = {
  '480p': 0.3,    // 30%
  '720p': 0.6,    // 60%
  '1080p': 1.0,   // 100%
  '4k': 2.0       // 200%
};

// Example: 1 GB movie at 720p = 600 MB
const downloadSize = originalSize * QUALITY_MULTIPLIERS['720p'];
```

---

## Storage Tier Comparison

| Feature | Free | Premium | Family |
|---------|------|---------|--------|
| Storage | 5 GB | 50 GB | 100 GB |
| Downloads | Limited | Many | Unlimited |
| Auto-Delete | 30 days | 45 days | 60 days |
| Price | Free | $4.99/mo | $7.99/mo |
| Ideal For | Casual | Regular | Families |

---

## Workflow Example: User Downloads Movie

```
1. User views movie details
   → Check storage: GET /api/downloads/storage/remaining

2. User clicks "Download" button
   → Show quality options (480p, 720p, 1080p, 4k)
   → Show estimated file size

3. User selects quality (e.g., 720p)
   → POST /api/downloads/start
   ← Get download ID & initial status

4. Show download progress
   → Poll GET /api/downloads/:id/progress every 2 seconds
   ← Update progress bar

5. User can pause/resume/cancel
   → PATCH /api/downloads/:id/pause
   → PATCH /api/downloads/:id/resume
   → DELETE /api/downloads/:id

6. Download completes
   → Status = "completed"
   → Show in "My Downloads" list
   → Ready to watch offline

7. User wants to free storage
   → DELETE /api/downloads/:id/delete
   ← Storage recalculated automatically
```

---

## Error Handling Patterns

### Insufficient Storage
```json
{
  "success": false,
  "message": "Insufficient storage space",
  "error": "Download would exceed quota",
  "details": {
    "required": "1.5 GB",
    "available": "500 MB"
  }
}
```

### Premium Content / Premium Only
```json
{
  "success": false,
  "message": "Premium subscription required to download this content"
}
```

### Download Already Exists
```json
{
  "success": false,
  "message": "This content is already downloaded or in progress",
  "download": {
    "id": "dl123",
    "status": "completed"
  }
}
```

---

## Performance Tips

1. **Check storage before download**: Avoid unnecessary processing
2. **Poll progress at reasonable intervals**: 1-2 seconds is good
3. **Implement exponential backoff on errors**: Retry with delay
4. **Cache tier list**: `/api/storage/tiers` (rarely changes)
5. **Batch cleanup calls**: Cleanup only when needed, not per delete
6. **Monitor quota threshold**: Alert users at 80% usage

---

## Security Considerations

✅ **Implemented**:
- User isolation (can only access own downloads)
- Premium content access control
- Role-based access (normal/premium)
- Storage quota enforcement
- Soft deletes (audit trail)

⚠️ **TODO**:
- Rate limiting on start/cleanup endpoints
- IP-based access logging
- Encryption for stored files
- Secure file deletion (overwrite)

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| 404 on download | Download doesn't exist or belongs to other user | Check download ID & user auth |
| 409 conflict | Download already exists for content | Update existing instead of creating new |
| 413 insufficient space | Quota exceeded | Delete other downloads or upgrade tier |
| Progress stuck at same % | Download paused or failed | Check status, retry if failed |
| Storage not updated | Cleanup pending | Manual cleanup or wait for cron job |

---

**Last Updated**: January 28, 2026
**Version**: 1.0.0
**Status**: ✅ Production Ready
