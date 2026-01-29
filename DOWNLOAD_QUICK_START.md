# Quick Start: Download System

## 🚀 Running the System

### Terminal 1: Start API Server
```bash
npm start
```
Output: `listening on port 4000` (or configured port)

### Terminal 2: Start Download Worker
```bash
npm run worker:download
```
Output: `Download worker started and listening for jobs...`

**Both processes must be running!**

---

## 📥 Test Download

### 1. Create Download
```bash
curl -X POST http://localhost:4000/api/downloads/start \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content_id":"cmkw9udmd0002vhzo4o1hhrj8","quality":"720p"}'
```

Response:
```json
{
  "success": true,
  "download": {
    "id": "cmkyyn9xn0001vhr0qg8nlqfj",
    "status": "pending"
  }
}
```

### 2. Watch Progress (poll every 2 seconds)
```bash
curl -X GET http://localhost:4000/api/downloads/cmkyyn9xn0001vhr0qg8nlqfj/progress \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Status changes:
- `pending` (0%) → `downloading` (10-90%) → `completed` (100%)

### 3. List All Downloads
```bash
curl -X GET "http://localhost:4000/api/downloads?status=downloading" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🔍 Monitor Worker Logs

Watch the second terminal where you ran `npm run worker:download`:

```
[Download Worker] Processing download job: 1234567
[Download Worker] Download cmkyyn9xn0001vhr0qg8nlqfj started
[Download Worker] Job completed: 1234567
```

---

## ⚡ Key Points

| What | Where | Status |
|------|-------|--------|
| API Server | Terminal 1 | ✅ Required |
| Download Worker | Terminal 2 | ✅ Required |
| Redis | Running in background | ✅ Required |
| Download job | Redis queue | Auto-managed |

**If worker isn't running:** Downloads stay `pending` forever ⏸️

---

## 🎯 Download Lifecycle

```
POST /api/downloads/start
        ↓
Create record (status: pending)
        ↓
Queue job to Redis
        ↓
Return response (✅ success)
        ↓
Worker picks up job
        ↓
Update status: downloading
        ↓
Simulate download (5 seconds)
        ↓
Update status: completed
        ↓
Mark as finished
```

---

## 📊 Check Storage Dashboard

```bash
curl -X GET http://localhost:4000/api/downloads/storage \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Shows:
- Storage used / total
- Downloads summary by status
- List of downloads with progress

---

## ❌ Troubleshooting

| Problem | Solution |
|---------|----------|
| Downloads stuck on "pending" | Is worker running? `npm run worker:download` |
| "Cannot read properties of undefined" | Is Redis running? `redis-cli ping` |
| Port already in use | Kill existing process or change port in `.env` |
| Worker crashes on startup | Check `.env` has all required variables |

---

## 🛑 Stop Services

Press `Ctrl+C` in each terminal to gracefully shutdown.

Both processes will:
- Close database connections
- Flush pending jobs (to be retried on restart)
- Exit cleanly
