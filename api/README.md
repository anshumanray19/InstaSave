# API Routes (Vercel Serverless Functions)

This directory contains serverless API functions that run on Vercel's edge network.

## Files

### `_shared.js`
Common utilities and helpers used by all API routes:
- Session management (in-memory storage)
- Instagram API headers (mobile & web)
- Helper functions (extractShortcode, shortcodeToMediaId, etc.)
- CORS configuration

### `session-status.js`
**Endpoint**: `GET /api/session-status`

Check if user has an active Instagram session.

**Response**:
```json
{
  "loggedIn": true,
  "username": "johndoe"
}
```

### `login.js`
**Endpoint**: `POST /api/login`

Authenticate user with Instagram session ID.

**Request**:
```json
{
  "sessionid": "abc123..."
}
```

**Response**:
```json
{
  "success": true,
  "username": "johndoe"
}
```

### `logout.js`
**Endpoint**: `POST /api/logout`

Clear user session.

**Response**:
```json
{
  "success": true
}
```

### `fetch-public.js`
**Endpoint**: `POST /api/fetch-public`

Fetch Instagram post/reel data (public content).

**Request**:
```json
{
  "url": "https://instagram.com/p/ABC123"
}
```

**Response**:
```json
{
  "success": true,
  "items": [
    {
      "type": "video",
      "url": "https://...",
      "thumbnailUrl": "https://..."
    }
  ],
  "username": "johndoe",
  "caption": "Post caption...",
  "shortcode": "ABC123"
}
```

## How Vercel Routes to These Functions

Vercel automatically maps files in the `api/` directory to API routes:

```
api/session-status.js  →  /api/session-status
api/login.js           →  /api/login
api/logout.js          →  /api/logout
api/fetch-public.js    →  /api/fetch-public
```

## Session Management

Sessions are stored **in-memory** using a JavaScript Map:
- Lightweight and fast
- Cleared on function cold start (by design for security)
- No database required
- Suitable for temporary sessions

## CORS Configuration

All API routes include CORS headers to allow:
- Cross-origin requests from the frontend
- OPTIONS preflight requests
- Configurable allowed origins

## Timeout

Vercel serverless functions have a **10-second timeout** on the free tier.

These functions are optimized to complete within that limit:
- Instagram API calls: ~1-3 seconds
- Session management: < 100ms
- Most operations: < 5 seconds

For operations that take longer (YouTube downloads, FFmpeg processing), use the separate backend server.

## Testing Locally

These functions can be tested locally with Vercel CLI:

```bash
# Install Vercel CLI
npm install -g vercel

# Run locally
vercel dev

# API will be available at:
# http://localhost:3000/api/session-status
# http://localhost:3000/api/login
# etc.
```

## Deployment

When you deploy to Vercel, these functions are automatically:
- ✅ Deployed to edge locations globally
- ✅ Auto-scaled based on demand
- ✅ Cached when appropriate
- ✅ Monitored for errors

No additional configuration needed!

## Dependencies

These functions use:
- `node-fetch` - For making HTTP requests to Instagram
- `_shared.js` - Shared utilities within this directory

All dependencies are bundled automatically by Vercel.

## Notes

- These functions are **stateless** (except for in-memory sessions)
- They don't write to disk
- They don't require a database
- They scale automatically to zero when not in use
- They start quickly (< 100ms cold start)

---

**Last Updated**: 2024  
**Platform**: Vercel Serverless Functions  
**Language**: Node.js
