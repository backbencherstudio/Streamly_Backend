# Download System Setup & Usage

## Architecture

The download system uses a **queue-based architecture**:

```
┌─────────────────────────────────────────┐
│        Frontend / API Client            │
└──────────────────┬──────────────────────┘
                   │ POST /api/downloads/start
                   ▼
┌─────────────────────────────────────────┐
│      Express Server (Main Process)      │
│  - Creates download record (pending)    │
│  - Queues job to Redis Bull Queue       │
│  - Returns immediate response           │
└──────────────────┬──────────────────────┘
                   │ Job added to queue
                   ▼
┌─────────────────────────────────────────┐
│      Redis Bull Queue (Queue Store)     │
│  - Holds pending download jobs          │
│  - Persists across restarts             │
└──────────────────┬──────────────────────┘
                   │ Job consumed
                   ▼
┌─────────────────────────────────────────┐
│   Download Worker (Separate Process)    │
│  - Processes downloads from queue       │
│  - Updates progress in database         │
│  - Marks as completed/failed            │
└─────────────────────────────────────────┘
```

---

## How to Run

### 1. **Start the Main Express Server** (Terminal 1)

```bash
npm start
```

This runs `nodemon index.js` - your API server on port 4000 (or configured port)

### 2. **Start the Download Worker** (Terminal 2)

```bash
npm run worker:download
```

This runs the download worker that processes queued jobs.

**Important:** The worker MUST be running separately for downloads to actually process!

---

## Download Flow Step-by-Step

### 1. **Request Download** (Frontend → API)
```bash
POST /api/downloads/start
Content-Type: application/json

{
  "content_id": "cmkw9udmd0002vhzo4o1hhrj8",
  "quality": "720p"
}
```

**Response (Immediate):**
```json
{
  "success": true,
  "message": "Download started",
  "download": {
    "id": "cmkyyn9xn0001vhr0qg8nlqfj",
    "status": "pending",
    "progress": 0,
    "file_size_bytes": "4975731",
    "downloaded_bytes": "0"
  }
}
```

### 2. **Server Creates Download Record**
- Status: `pending`
- Progress: `0%`
- File size calculated based on quality

### 3. **Job Queued to Redis**
- Download job added to BullMQ queue
- Waits for worker to pick it up

### 4. **Worker Picks Up Job**
When the download worker is running:
- Retrieves job from queue
- Updates status: `pending` → `downloading`
- Starts processing

### 5. **Download Progress Updates**
Worker simulates download progress:
- `0%` → `10%` → `20%` ... → `100%`
- Updates `progress` and `downloaded_bytes` in database
- Takes ~5 seconds total (simulated)

### 6. **Download Completes**
- Status: `completed`
- Progress: `100%`
- `downloaded_bytes` = `file_size_bytes`

---

## Monitoring Downloads

### Check Download Status

**List all downloads:**
```bash
GET /api/downloads
```

**Get specific download progress:**
```bash
GET /api/downloads/{downloadId}/progress
```

**Filter by status:**
```bash
GET /api/downloads?status=downloading  # Show active downloads
GET /api/downloads?status=completed    # Show finished downloads
GET /api/downloads?status=failed       # Show failed downloads
```

---

## Worker Logs

The worker logs all activity:

```
[Download Worker] Download worker started and listening for jobs...
[Download Worker] Processing download job: job-id
[Download Worker] Download cmkyyn9xn0001vhr0qg8nlqfj started
[Download Worker] Job completed: job-id
```

---

## Common Issues

### Problem: Downloads stay "pending"

**Solution:** Check if the worker is running:
```bash
npm run worker:download
```

### Problem: "Cannot read properties of undefined"

**Solution:** Ensure Redis is running:
```bash
redis-cli ping
# Should return: PONG
```

### Problem: Worker crashes

**Check logs** for error messages and ensure all environment variables are set (`.env` file)

---

## Architecture Components

### Main Server (`index.js`)
- Handles HTTP requests
- Creates download records in database
- Queues jobs to Redis

### Download Worker (`modules/workers/download.worker.js`)
- Listens to download queue
- Processes jobs concurrently (2 at a time)
- Updates download progress
- Handles retry logic

### Redis Bull Queue (`modules/libs/queue.js`)
- Persistent job queue
- Automatically retries failed jobs
- Survives process restarts

### Database (Prisma)
- Stores download records
- Tracks progress, status, file sizes

---

## Response Examples

### Starting a Download
```json
{
  "success": true,
  "message": "Download started",
  "download": {
    "id": "cmkyyn9xn0001vhr0qg8nlqfj",
    "user_id": "cmkwgics30000vho0piukda0y",
    "content_id": "cmkw9udmd0002vhzo4o1hhrj8",
    "status": "pending",
    "quality": "720p",
    "progress": 0,
    "file_size_bytes": "4975731",
    "downloaded_bytes": "0",
    "created_at": "2026-01-29T04:34:59.723Z"
  }
}
```

### Checking Progress (while downloading)
```json
{
  "success": true,
  "id": "cmkyyn9xn0001vhr0qg8nlqfj",
  "status": "downloading",
  "progress": 45,
  "downloaded_bytes": "2238879",
  "file_size_bytes": "4975731"
}
```

### Completed Download
```json
{
  "success": true,
  "id": "cmkyyn9xn0001vhr0qg8nlqfj",
  "status": "completed",
  "progress": 100,
  "downloaded_bytes": "4975731",
  "file_size_bytes": "4975731"
}
```

---

## Production Considerations

For production, you would:

1. **Replace Simulated Downloads** with actual S3 download logic
2. **Store Downloaded Files** in a persistent location (S3, local storage, etc.)
3. **Add Pause/Resume** by persisting download state
4. **Increase Worker Concurrency** based on server capacity
5. **Use Docker Compose** to run server and worker as services
6. **Monitor Queue Health** with BullMQ UI or monitoring tools

---

## Cleanup & Deletion

### Delete Single Download
```bash
DELETE /api/downloads/{downloadId}/delete
```

### Delete All Downloads (Clear Storage)
```bash
POST /api/downloads/cleanup
```

Both endpoints free up storage quota.
