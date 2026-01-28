# Schema Review & Content Types Support

## Schema Status ✅

The Streamly Backend schema is **properly designed** and **production-ready** with full support for all content types.

---

## 📺 Supported Content Types

### 1. **Movie**
- Single video file with duration
- Can have trailers attached via `trailer_for_id`
- Belongs to one category
- Can be tagged with multiple genres
- Fields:
  - `duration_seconds` - Length of movie in seconds
  - `release_date` - Public availability date
  - `is_premium` - Access restriction flag
  - `quality` - Video quality (e.g., "4K", "1080p", "720p")

### 2. **Series**
- Parent content with episodes
- Has multiple episodes via `episodes` relation (reverse `series_id`)
- Single video file (series intro/overview video, optional)
- Constraints:
  - Episode uniqueness enforced: `@@unique([series_id, season_number, episode_number])`
  - Cannot have `season_number` or `episode_number` set
  - Can have trailers via `trailer_for_id`
- Fields:
  - `series_id: null` - No parent series

### 3. **Episode**
- Part of a series via `series_id`
- Requires:
  - `series_id` - Parent series ID
  - `season_number` - Season number (1-based)
  - `episode_number` - Episode number within season (1-based)
- Uniqueness enforced by schema
- Can have thumbnails and video files
- Can be individually rated/favorited

### 4. **Trailer**
- Promotional video for another content
- Requires:
  - `trailer_for_id` - Points to the content being promoted
  - `content_type = 'trailer'`
- Can be attached to movies, series, or episodes
- Uses same video storage (S3/local) as other content

### 5. **Music Video** ✨
- Standalone music video content
- No series relationship required
- Can have multiple genres (e.g., "music", "pop", "rock")
- Belongs to one category
- Treated as standalone video (like movies)
- Fields same as movie:
  - `duration_seconds`
  - `release_date`
  - `is_premium`
  - `quality`

---

## 📊 Current Schema Fields

```prisma
model Content {
  // Identity & Metadata
  id                String        @id @default(cuid())
  title             String?
  description       String?
  created_at        DateTime      @default(now())
  updated_at        DateTime      @updatedAt
  deleted_at        DateTime?     // Soft delete support

  // Content Classification
  content_type      ContentType   // movie|series|episode|trailer|music_video
  genre             Genra[]       // Array of genres
  category_id       String?
  category          Category?     @relation

  // Media Details
  duration_seconds  Int?          // For movie/episode/music_video
  quality           String?       // "4K", "1080p", "720p", etc.
  mime_type         String?       // "video/mp4", "video/webm", etc.

  // Storage
  storage_provider  String?       // "local" | "s3"
  s3_bucket         String?
  s3_key            String?
  s3_thumb_key      String?
  original_name     String?
  file_size_bytes   BigInt?
  etag              String?
  checksum_sha256   String?

  // URLs
  thumbnail         String?       // Fallback local URL
  video             String?       // Fallback local URL

  // Status & Publishing
  content_status    Content_status // published|draft|uploading_local|uploading_s3|processing|failed
  is_premium        Boolean       @default(false)
  release_date      DateTime?

  // Series & Episodes
  series_id         String?       // For episodes only
  season_number     Int?          // For episodes only
  episode_number    Int?          // For episodes only

  // Relationships
  parent_series     Content?      @relation("SeriesEpisodes")
  episodes          Content[]     @relation("SeriesEpisodes")
  
  trailer_for_id    String?       // For trailers: points to parent content
  trailer_for       Content?      @relation("TrailerOf")
  trailers          Content[]     @relation("TrailerOf")

  // Engagement
  view_count        Int           @default(0)
  Rating            Rating[]
  Favourite         Favourite[]
  ContentView       ContentView[]
  Cast              Cast[]

  // Indexes for performance
  @@index([category_id])
  @@index([is_premium])
  @@index([release_date])
  @@index([series_id])
  @@index([view_count])
  @@index([deleted_at])
  @@unique([series_id, season_number, episode_number])
}
```

---

## 🔗 Content Type Validation Rules

| Content Type | `series_id` | `season_number` | `episode_number` | `trailer_for_id` | Required Fields |
|---|---|---|---|---|---|
| **movie** | ✗ null | ✗ null | ✗ null | ✓ optional | title, video |
| **series** | ✗ null | ✗ null | ✗ null | ✓ optional | title, video (optional) |
| **episode** | ✓ required | ✓ required | ✓ required | ✗ null | series_id, season_number, episode_number |
| **trailer** | ✗ null | ✗ null | ✗ null | ✓ required | trailer_for_id, title, video |
| **music_video** | ✗ null | ✗ null | ✗ null | ✓ optional | title, video |

---

## 🎬 Upcoming Content API

### Endpoint: `GET /api/contents/user/upcoming-by-category`

Returns upcoming content organized by category with pagination support.

**Query Parameters:**
- `page` (optional, default: 1) - Page number for pagination
- `take` (optional, default: 12, max: 50) - Items per page
- `limit` (optional, default: 5) - Number of categories to fetch
- `content_type` (optional) - Filter by type: `movie`, `series`, `episode`, or `music_video`

**Response Structure:**
```json
{
  "upcoming": {
    "action": {
      "items": [
        {
          "id": "...",
          "title": "Upcoming Action Movie",
          "content_type": "movie",
          "release_date": "2026-02-15",
          "thumbnail": "https://...",
          "view_count": 1250,
          "is_premium": false,
          "duration_seconds": 7200,
          "quality": "4K"
        }
      ],
      "page": 1,
      "take": 12,
      "total": 24,
      "totalPages": 2,
      "category_name": "Action"
    },
    "comedy": { /* same structure */ },
    "drama": { /* same structure */ }
  },
  "page": 1,
  "take": 12,
  "filter": "All types (movie, series, episode, music_video)"
}
```

**Example Requests:**
```bash
# Get all upcoming content by category
GET /api/contents/user/upcoming-by-category?page=1&take=12

# Get only upcoming movies
GET /api/contents/user/upcoming-by-category?content_type=movie&page=1

# Get only upcoming music videos
GET /api/contents/user/upcoming-by-category?content_type=music_video&take=20

# Get upcoming series and episodes
GET /api/contents/user/upcoming-by-category?content_type=series&page=2
```

---

## 🔍 Other Content Type Endpoints

### 1. **Upload Endpoint**
`POST /api/contents/admin/video` - Upload any content type with validation

```json
{
  "title": "New Music Video",
  "content_type": "music_video",
  "genre": ["music", "pop"],
  "duration_seconds": 240,
  "is_premium": false,
  "release_date": "2026-02-01"
}
```

### 2. **Home Sections**
`GET /api/contents/user/home` - Displays popular content by category (all types included)

### 3. **New & Popular**
`GET /api/contents/user/new-and-popular` - Newest and most-viewed content (paginated)

### 4. **Trending**
`GET /api/contents/user/trending` - Trending content in last 7 days (by category)

### 5. **Watch Details**
`GET /api/contents/user/watch/:id` - Full video details with recommendations
- For **series**: includes all episodes
- For **episode**: includes related episodes and similar content
- For **movie/music_video**: includes recommendations

---

## 🛡️ Soft Delete Implementation

All content types support soft deletes:
- Delete operation: Sets `deleted_at` timestamp (no hard delete)
- Query filtering: All endpoints automatically filter `deleted_at: null`
- Recovery possible: Can update `deleted_at` to null to restore

**Example:**
```javascript
// Soft delete
await prisma.content.update({
  where: { id },
  data: { deleted_at: new Date() }
});

// Restore
await prisma.content.update({
  where: { id },
  data: { deleted_at: null }
});
```

---

## 📈 Performance Indexes

All indexes are optimized for common queries:
- `view_count` - Sorting by popularity
- `deleted_at` - Filtering soft-deleted items
- `series_id` - Finding episodes of a series
- `category_id` - Browsing by category
- `is_premium` - Premium content filtering
- `release_date` - Upcoming content queries
- `ContentView` dual indexes - User viewing history

---

## ✨ Features Summary

| Feature | Status | Notes |
|---|---|---|
| Movie content | ✅ Full | With trailers & recommendations |
| TV Series | ✅ Full | With episode uniqueness constraint |
| Episodes | ✅ Full | Season/episode numbering enforced |
| Trailers | ✅ Full | Linked to parent content |
| Music Videos | ✅ Full | New support added |
| Soft Deletes | ✅ Full | All queries filtered automatically |
| Pagination | ✅ Full | All endpoints support page/take |
| Genre Arrays | ✅ Full | Multi-genre support per content |
| Premium Content | ✅ Full | Access control via `is_premium` flag |
| Ratings | ✅ Full | Per-user per-content unique constraint |
| Favorites | ✅ Full | Like/unlike functionality |
| View Tracking | ✅ Full | User content view history |
| Cast Information | ✅ Full | Actor/crew details |

---

## 🚀 Next Steps (Future Enhancements)

- [ ] Search/full-text search endpoint
- [ ] Watch history & resume playback
- [ ] User playback quality selection
- [ ] Subtitle/audio track management
- [ ] Live streaming support
- [ ] Content recommendations ML model
- [ ] Cast model expansion (currently String[])
- [ ] Detailed content analytics dashboard

---

**Last Updated:** January 27, 2026  
**Schema Version:** 20260127071540 (trailer_relationship migration)
