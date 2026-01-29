# Download Retry & Resume Mechanism 🔄

## ✅ Automatic Retry System

### **How Many Retries?**

**Total Attempts:** **5 tries** (1 initial + 4 automatic retries)

If a download fails due to network issues, server errors, or any other reason, the system automatically retries **4 more times** before marking it as permanently failed.

---

## 📊 Retry Timeline

```
Attempt 1: Download starts immediately
   ↓ (fails due to network error)
   
Attempt 2: Retry after 2 seconds ⏱️
   ↓ (fails again)
   
Attempt 3: Retry after 4 seconds ⏱️⏱️
   ↓ (fails again)
   
Attempt 4: Retry after 8 seconds ⏱️⏱️⏱️⏱️
   ↓ (fails again)
   
Attempt 5: Retry after 16 seconds ⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️
   ↓ (fails again)
   
❌ FINAL: Marked as "failed" permanently
```

**Total wait time:** ~30 seconds across all retries

---

## 🔄 Resume from Where It Stopped

### **NEW FEATURE: Resumable Downloads**

If a download fails after downloading 60% (e.g., 600 MB of 1 GB):

**Before (Old):**
```
Attempt 1: 0% → 60% ❌ (network drops)
Attempt 2: 0% → 25% ❌ (starts from 0% again!)
Attempt 3: 0% → 80% ❌ (starts from 0% again!)
```
❌ Wastes bandwidth, starts over each time

**Now (NEW):**
```
Attempt 1: 0% → 60% ❌ (network drops, saves 600 MB)
Attempt 2: 60% → 75% ❌ (resumes from 60%! saves 750 MB)
Attempt 3: 75% → 100% ✅ (resumes from 75%, completes!)
```
✅ Smart! Continues from where it stopped

---

## 🛠️ How Resume Works

### **Technical Implementation:**

1. **Partial File Saved:**
   - Downloaded bytes are saved to disk even if download fails
   - File: `/downloads/users/{userId}/{contentId}_720p.mp4.partial`

2. **Progress Tracked:**
   - Database stores `downloaded_bytes` and `progress`
   - Example: `downloaded_bytes: 629145600` (600 MB)

3. **Resume on Retry:**
   - Worker checks: "How much was already downloaded?"
   - Uses HTTP Range header: `bytes=629145600-`
   - S3 sends only remaining data (400 MB instead of 1 GB)

4. **Append to File:**
   - New data appends to existing partial file
   - When complete, renames to `.mp4`

### **Example:**

```javascript
// Download 1 GB video that keeps failing

Attempt 1:
  - Downloaded: 0 → 600 MB (60%)
  - Network drops
  - Saves: downloaded_bytes = 629145600
  
Attempt 2 (after 2 seconds):
  - Resumes from: 600 MB
  - Downloads: 600 MB → 750 MB (15% more)
  - Network drops again
  - Saves: downloaded_bytes = 786432000
  
Attempt 3 (after 4 seconds):
  - Resumes from: 750 MB
  - Downloads: 750 MB → 1 GB (25% more)
  - ✅ SUCCESS!
  - Total bandwidth used: 1 GB (not 2.35 GB!)
```

---

## 📈 Retry Strategy: Exponential Backoff

**Why not retry immediately?**

If the server/network is overloaded, retrying immediately might fail again. Exponential backoff gives time for recovery.

### **Delay Formula:**

```
Retry N: delay = 2 seconds × 2^(N-1)

Retry 1: 2 × 2^0 = 2 seconds
Retry 2: 2 × 2^1 = 4 seconds
Retry 3: 2 × 2^2 = 8 seconds
Retry 4: 2 × 2^3 = 16 seconds
```

---

## 🎯 When Does It Retry?

### **Automatic Retry Triggers:**

✅ Network connection lost  
✅ S3 server timeout  
✅ AWS throttling errors  
✅ Temporary server errors (500, 503)  
✅ DNS resolution failures  
✅ Connection reset by peer  

### **No Retry (Permanent Failures):**

❌ File not found on S3 (404)  
❌ Access denied (403)  
❌ Invalid credentials  
❌ Bucket doesn't exist  
❌ User cancelled download manually  

---

## 📊 Database Tracking

Every retry updates the database:

```javascript
{
  status: "downloading",       // Current state
  progress: 75,                // 75% complete
  downloaded_bytes: 786432000, // 750 MB downloaded
  failed_count: 2,             // Failed 2 times so far
  error_message: "Network timeout", // Last error
}
```

After 5 attempts fail:

```javascript
{
  status: "failed",            // Permanently failed
  progress: 75,                // Stuck at 75%
  downloaded_bytes: 786432000, // 750 MB downloaded (partial)
  failed_count: 5,             // All retries exhausted
  error_message: "Max retries exceeded: Network timeout",
}
```

User can manually restart to try again.

---

## 🔍 Monitoring Retries

### **Check Retry Status:**

```bash
GET /api/downloads/{downloadId}/progress

Response:
{
  "id": "download_123",
  "status": "downloading",
  "progress": 65,
  "downloaded_bytes": "681574400",  // 650 MB
  "failed_count": 1,                // Already failed once
  "error_message": "Network timeout",
  "retry_info": {
    "current_attempt": 2,           // On 2nd attempt
    "max_attempts": 5,              // Will retry 3 more times
    "next_retry_in": "4 seconds"    // Next retry soon
  }
}
```

---

## 🧪 Testing Retry Mechanism

### **Simulate Network Failure:**

```bash
# Start download
curl -X POST http://localhost:4000/api/downloads/start \
  -H "Authorization: Bearer TOKEN" \
  -d '{"content_id":"abc123","quality":"720p"}'

# While downloading, disconnect internet for 10 seconds
# Reconnect internet

# Check status - should show retry attempt
curl http://localhost:4000/api/downloads/{id}/progress

# Download should resume and complete!
```

### **Simulate S3 Error:**

```javascript
// Temporarily set wrong S3 credentials in .env
AWS_S3_BUCKET=wrong-bucket-name

// Start download - will fail 5 times with "Bucket not found"
// After 5 attempts, status becomes "failed"
```

---

## 🎓 Real-World Example

### **Scenario: User downloading 2 GB movie on unstable WiFi**

```
10:00:00 - Download starts (0%)
10:00:45 - Network drops at 30% (600 MB downloaded)
          ⏸️ Paused, saved to disk

10:00:47 - Auto-retry #1 (after 2 seconds)
          ▶️ Resumes from 30%
10:01:15 - Network drops again at 55% (1.1 GB downloaded)
          ⏸️ Paused again

10:01:19 - Auto-retry #2 (after 4 seconds)
          ▶️ Resumes from 55%
10:02:00 - Network drops at 85% (1.7 GB downloaded)
          ⏸️ Paused again

10:02:08 - Auto-retry #3 (after 8 seconds)
          ▶️ Resumes from 85%
10:02:35 - ✅ Complete! (100%, 2 GB)

Total time: 2 minutes 35 seconds
Total bandwidth: 2 GB (not 5.4 GB if started over!)
Retries used: 3 of 5 available
```

---

## ⚙️ Configuration

### **Current Settings:**

| Setting | Value | Description |
|---------|-------|-------------|
| **Max Attempts** | 5 | Total tries (1 + 4 retries) |
| **Initial Delay** | 2 seconds | Wait before 1st retry |
| **Backoff Type** | Exponential | Delays double each time |
| **Resume Support** | ✅ Yes | Continues from last byte |
| **Partial Files** | ✅ Saved | Kept for resume |
| **Manual Retry** | ✅ Yes | User can restart failed downloads |

### **To Change Settings:**

Edit [download.controller.js](modules/Download/download.controller.js):

```javascript
await downloadQueue.add("start", data, {
  attempts: 10,        // Change from 5 to 10 retries
  backoff: {
    type: "exponential",
    delay: 5000,       // Change from 2s to 5s initial delay
  },
});
```

---

## 📝 Summary

✅ **Automatic retries:** 5 attempts total  
✅ **Smart delays:** 2s, 4s, 8s, 16s (exponential)  
✅ **Resume support:** Continues from where it stopped  
✅ **Bandwidth efficient:** Downloads missing parts only  
✅ **Progress saved:** Partial files kept between retries  
✅ **User visibility:** Can see retry count and errors  
✅ **Manual restart:** Users can retry failed downloads  

🚀 **Your downloads are now resilient to network issues!**
