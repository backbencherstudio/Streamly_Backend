# Video Upload API Documentation

## Overview
The video upload API supports uploading different types of content: movies, series, episodes, and trailers with proper metadata, genre tagging, and series/episode relationships.

---

## Upload Video Endpoint

### `POST /api/admin/uploads/video`

Upload a video file with thumbnail and metadata.

### Request Format
- **Content-Type**: `multipart/form-data`
- **Authentication**: Required (Admin only)

### Form Fields

#### Required Fields
| Field | Type | Description |
|-------|------|-------------|
| `file` | File | Video file (max 30GB) |
| `title` | String | Content title |
| `category_id` | String | Category CUID |

#### Optional Fields
| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `thumbnail` | File | Thumbnail image | - |
| `description` | String | Content description | - |
| `genre` | String/Array | Comma-separated genres or array | `"action,thriller"` or `["action","thriller"]` |
| `content_type` | Enum | Type of content | `movie`, `series`, `episode`, `trailer` (default: `movie`) |
| `quality` | String | Video quality | `4k`, `1080p`, `720p`, `480p` |
| `is_premium` | Boolean | Premium content flag | `true` or `false` |
| `release_date` | ISO Date | Release date | `2026-01-27T00:00:00Z` |

#### Series/Episode Fields
| Field | Type | Required For | Description |
|-------|------|-------------|-------------|
| `series_id` | String | Episodes | Parent series content ID |
| `season_number` | Integer | Episodes | Season number (1, 2, 3...) |
| `episode_number` | Integer | Episodes | Episode number within season |

---

## Examples

### 1. Upload a Movie

```bash
curl -X POST http://localhost:5000/api/admin/uploads/video \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@movie.mp4" \
  -F "thumbnail=@poster.jpg" \
  -F "title=The Matrix" \
  -F "description=A computer hacker learns about the true nature of reality" \
  -F "genre=action,sci_fi" \
  -F "category_id=clxxxx123" \
  -F "content_type=movie" \
  -F "quality=4k" \
  -F "is_premium=true" \
  -F "release_date=1999-03-31T00:00:00Z"
```

### 2. Upload a Series (Parent)

```bash
curl -X POST http://localhost:5000/api/admin/uploads/video \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@series_trailer.mp4" \
  -F "thumbnail=@series_poster.jpg" \
  -F "title=Breaking Bad" \
  -F "description=A chemistry teacher turned methamphetamine producer" \
  -F "genre=crime,drama,thriller" \
  -F "category_id=clxxxx456" \
  -F "content_type=series" \
  -F "is_premium=true"
```

### 3. Upload an Episode

**First**, upload the series and get its ID (e.g., `clxxx789`).

**Then**, upload episodes:

```bash
curl -X POST http://localhost:5000/api/admin/uploads/video \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@s01e01.mp4" \
  -F "thumbnail=@s01e01_thumb.jpg" \
  -F "title=Breaking Bad - Pilot" \
  -F "description=Walter White diagnoses his illness" \
  -F "genre=crime,drama" \
  -F "category_id=clxxxx456" \
  -F "content_type=episode" \
  -F "series_id=clxxx789" \
  -F "season_number=1" \
  -F "episode_number=1" \
  -F "is_premium=true"
```

### 4. Upload a Trailer

```bash
curl -X POST http://localhost:5000/api/admin/uploads/video \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@trailer.mp4" \
  -F "thumbnail=@trailer_thumb.jpg" \
  -F "title=Avengers: Endgame Trailer" \
  -F "genre=action,adventure" \
  -F "category_id=clxxxx999" \
  -F "content_type=trailer"
```

---

## Response Format

### Success Response (201 Created)
```json
{
  "id": "clxxx12345",
  "status": "uploading_local",
  "content_type": "movie",
  "title": "The Matrix",
  "genre": ["action", "sci_fi"],
  "videoUrl": "/uploads/videos/uuid-xxx.mp4",
  "thumbnailUrl": "/uploads/thumbnails/uuid-yyy.jpg",
  "message": "Upload initiated. Processing in background."
}
```

### Error Response (400 Bad Request)
```json
{
  "error": "Title is required"
}
```

```json
{
  "error": "series_id is required for episodes"
}
```

---

## Get Upload Status

### `GET /api/admin/uploads/status/:id`

Check the processing status of an uploaded video.

### Example
```bash
curl -X GET http://localhost:5000/api/admin/uploads/status/clxxx12345 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Response
```json
{
  "id": "clxxx12345",
  "title": "The Matrix",
  "content_type": "movie",
  "content_status": "published",
  "storage_provider": "s3",
  "s3_bucket": "streamly-videos",
  "s3_key": "videos/clxxx12345.mp4",
  "created_at": "2026-01-27T10:00:00.000Z",
  "updated_at": "2026-01-27T10:05:32.000Z"
}
```

---

## Content Status Lifecycle

| Status | Description |
|--------|-------------|
| `uploading_local` | File received, saved locally |
| `uploading_s3` | Uploading to S3/MinIO |
| `processing` | Processing video (metadata extraction, etc.) |
| `published` | Ready for streaming |
| `failed` | Upload or processing failed |
| `draft` | Saved as draft (not published) |

---

## Valid Genres

```
action, adventure, animation, biography, comedy, crime,
documentary, drama, family, fantasy, history, horror,
music, musical, mystery, romance, sci_fi, sport,
thriller, war, western
```

---

## Content Types

| Type | Use Case | Required Fields |
|------|----------|-----------------|
| `movie` | Standalone films | title, category_id |
| `series` | Series parent/trailer | title, category_id |
| `episode` | Individual episodes | title, category_id, series_id, season_number, episode_number |
| `trailer` | Trailers/previews | title, category_id |

---

## Important Notes

1. **File Size Limit**: 30GB per upload
2. **Background Processing**: Videos are processed asynchronously via BullMQ
3. **S3/MinIO**: Files are moved to object storage after local upload
4. **Episode Uniqueness**: Cannot upload duplicate episodes (same series_id, season_number, episode_number)
5. **Genre Validation**: Invalid genres are silently filtered out
6. **Premium Content**: Set `is_premium=true` to restrict to premium users only

---

## Error Handling

Common errors and solutions:

| Error | Cause | Solution |
|-------|-------|----------|
| "Video file is required" | No file uploaded | Include `file` field |
| "Title is required" | Missing title | Provide title |
| "Category is required" | Missing category_id | Provide valid category CUID |
| "series_id is required for episodes" | Episode without parent | Upload series first, then reference its ID |
| "Invalid content_type" | Unknown type | Use: movie, series, episode, or trailer |

---

## Database Schema Reference

```prisma
model Content {
  content_type ContentType @default(movie)  // movie | series | episode | trailer
  genre        Genra[]                      // Multi-genre support
  series_id    String?                      // Parent series ID
  season_number Int?                        // Season number
  episode_number Int?                       // Episode number
  is_premium   Boolean @default(false)      // Premium flag
  
  @@unique([series_id, season_number, episode_number]) // Prevent duplicate episodes
}
```

---

## Next Steps

1. Test upload with Postman/Thunder Client
2. Monitor BullMQ dashboard for processing status
3. Check S3/MinIO bucket for uploaded files
4. Use `/status/:id` endpoint to track progress
