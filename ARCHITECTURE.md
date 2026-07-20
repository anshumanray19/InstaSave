# 🏗️ Architecture Documentation

## Overview

OmniSave uses a **split serverless architecture** to optimize for performance, cost, and scalability.

---

## High-Level Architecture

```
                                    ┌─────────────────┐
                                    │   USER DEVICE   │
                                    │  (Browser/App)  │
                                    └────────┬────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    │                        │                        │
                    │                        │                        │
         ┌──────────▼──────────┐  ┌─────────▼──────────┐  ┌─────────▼──────────┐
         │   Static Assets     │  │  Lightweight API   │  │   Heavy API        │
         │   (Vercel CDN)      │  │  (Vercel Lambda)   │  │  (Railway/Render)  │
         │                     │  │                    │  │                    │
         │  • HTML, CSS, JS    │  │  • Instagram API   │  │  • YouTube (yt-dlp)│
         │  • Images, Fonts    │  │  • Session mgmt    │  │  • FFmpeg merge    │
         │  • Global delivery  │  │  • Auth endpoints  │  │  • Reddit merge    │
         └─────────────────────┘  └────────────────────┘  └────────────────────┘
                 ▲                          ▲                        ▲
                 │                          │                        │
                 └──────────────────────────┴────────────────────────┘
                              Optimized routing
```

---

## Component Breakdown

### 1. Frontend (Vercel CDN)
**Technology**: Static HTML, CSS, Vanilla JavaScript  
**Hosting**: Vercel Edge Network  
**Function**: User interface and client-side logic

**Files**:
- `public/index.html` - Main application UI
- `public/style.css` - Styles and animations
- `public/app.js` - Client-side JavaScript
- `public/config.js` - API endpoint configuration
- `public/*.png`, `*.svg` - Assets and icons

**Features**:
- ✅ Global CDN for fast loading
- ✅ Automatic HTTPS
- ✅ Gzip/Brotli compression
- ✅ Cache optimization
- ✅ Mobile-responsive design

**Routing**:
```javascript
// Frontend determines which API to use
if (operation === 'instagram') {
  // Call Vercel API
  fetch('/api/fetch-public', {...})
} else if (operation === 'youtube') {
  // Call Backend API
  fetch('https://backend.railway.app/api/youtube/download', {...})
}
```

---

### 2. Lightweight API (Vercel Serverless)
**Technology**: Node.js serverless functions  
**Hosting**: Vercel Lambda@Edge  
**Function**: Fast, lightweight operations

**Files**:
```
api/
├── _shared.js          # Common utilities
├── session-status.js   # GET  /api/session-status
├── login.js            # POST /api/login
├── logout.js           # POST /api/logout
└── fetch-public.js     # POST /api/fetch-public
```

**Endpoints**:

#### `GET /api/session-status`
Check if user is logged in with Instagram session
```json
Response: {
  "loggedIn": true,
  "username": "johndoe"
}
```

#### `POST /api/login`
Authenticate with Instagram sessionid cookie
```json
Request: {
  "sessionid": "abc123..."
}
Response: {
  "success": true,
  "username": "johndoe"
}
```

#### `POST /api/logout`
Clear session data
```json
Response: {
  "success": true
}
```

#### `POST /api/fetch-public`
Fetch Instagram post/reel data
```json
Request: {
  "url": "https://instagram.com/p/ABC123"
}
Response: {
  "success": true,
  "items": [
    {
      "type": "video",
      "url": "https://...",
      "thumbnailUrl": "https://..."
    }
  ],
  "username": "johndoe",
  "caption": "...",
  "shortcode": "ABC123"
}
```

**Why Serverless?**
- ⚡ Fast cold starts (< 100ms)
- 💰 No cost when idle
- 🌍 Global edge deployment
- 📈 Auto-scaling
- ⏱️ Suitable for < 10 second operations

**Limitations**:
- ⚠️ 10-second timeout (free tier)
- ⚠️ 50MB response size limit
- ⚠️ No system binaries (ffmpeg, yt-dlp)

---

### 3. Heavy Operations Backend (Railway/Render)
**Technology**: Node.js + Express + System Binaries  
**Hosting**: Railway / Render / VPS  
**Function**: Resource-intensive operations

**File**: `backend-server.js`

**Endpoints**:

#### `GET /health`
Health check endpoint
```json
Response: {
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "server": "backend-heavy-operations"
}
```

#### `POST /api/youtube/info`
Get YouTube video metadata
```json
Request: {
  "url": "https://youtube.com/watch?v=..."
}
Response: {
  "success": true,
  "title": "Video Title",
  "thumbnail": "https://...",
  "duration": 300,
  "uploader": "Channel Name",
  "formats": [...]
}
```

#### `POST /api/youtube/download`
Download YouTube video with yt-dlp
```json
Request: {
  "url": "https://youtube.com/watch?v=...",
  "format": "video",
  "quality": "1080p"
}
Response: <video/mp4 stream>
```

#### `POST /api/reddit/download`
Merge Reddit video + audio with FFmpeg
```json
Request: {
  "videoUrl": "https://v.redd.it/.../DASH_720.mp4",
  "audioUrl": "https://v.redd.it/.../DASH_audio.mp4"
}
Response: <video/mp4 stream>
```

#### `GET /api/proxy`
Proxy media URLs to bypass CORS
```
Request: GET /api/proxy?url=https://...
Response: <proxied content>
```

**Why Dedicated Server?**
- 🔧 Full system access (yt-dlp, ffmpeg)
- ⏱️ No timeout limits
- 💾 Large file handling
- 🐍 Python environment for yt-dlp
- 📦 Custom binary installation

**Requirements**:
- ✅ Node.js v18+
- ✅ Python 3.x
- ✅ yt-dlp (pip package)
- ✅ ffmpeg (system binary)

---

## Data Flow Examples

### Example 1: Instagram Public Post Download
```
User clicks download
    ↓
Frontend (public/app.js)
    ↓
POST /api/fetch-public (Vercel Lambda)
    ↓
Fetch from Instagram API
    ↓
Return JSON with video URLs
    ↓
Frontend displays preview
    ↓
User clicks final download
    ↓
Browser downloads directly from Instagram CDN
```

**Time**: ~2-3 seconds  
**Backend Used**: Vercel only

---

### Example 2: YouTube Video Download
```
User pastes YouTube URL
    ↓
Frontend (public/app.js)
    ↓
POST /api/youtube/info (Backend Server)
    ↓
yt-dlp extracts metadata
    ↓
Return available formats
    ↓
User selects quality
    ↓
POST /api/youtube/download (Backend Server)
    ↓
yt-dlp downloads + ffmpeg merges audio
    ↓
Stream video directly to user
```

**Time**: ~15-60 seconds (depends on video size)  
**Backend Used**: Railway/Render

---

### Example 3: Reddit Video with Audio
```
User pastes Reddit URL
    ↓
Frontend extracts video + audio URLs
    ↓
POST /api/reddit/download (Backend Server)
    ↓
Fetch both streams
    ↓
FFmpeg merges video + audio
    ↓
Stream merged video to user
```

**Time**: ~5-20 seconds  
**Backend Used**: Railway/Render

---

## Deployment Architecture

### Development
```
┌─────────────────┐         ┌─────────────────┐
│   localhost     │         │   localhost     │
│   :55964        │◄───────►│   :3001         │
│   (Frontend)    │         │   (Backend)     │
└─────────────────┘         └─────────────────┘
```

### Production
```
┌──────────────────────────┐         ┌──────────────────────────┐
│   Vercel Global CDN      │         │   Railway/Render         │
│   *.vercel.app          │◄───────►│   *.railway.app         │
│                          │         │                          │
│  • Static files (CDN)    │         │  • YouTube downloads     │
│  • /api/* (Lambda@Edge)  │         │  • FFmpeg processing     │
└──────────────────────────┘         └──────────────────────────┘
          ▲                                      ▲
          │                                      │
          └──────────────┬───────────────────────┘
                         │
                 ┌───────▼────────┐
                 │   User Browser  │
                 └─────────────────┘
```

---

## Security Architecture

### Session Management
```
User's Instagram Session ID
    ↓
Stored in-memory only (Map)
    ↓
Never written to disk
    ↓
Cleared on server restart
    ↓
Never sent to client
```

### CORS Protection
```
Backend Server:
├── Checks Origin header
├── Validates against ALLOWED_ORIGINS
├── Rejects unauthorized origins
└── Sets appropriate CORS headers
```

### Input Validation
```
All endpoints:
├── Validate URL format
├── Sanitize user input
├── Check for injection attempts
└── Rate limiting (recommended)
```

---

## Performance Optimization

### 1. Edge Caching (Vercel)
- Static assets cached at edge locations
- CDN serves from nearest location
- 99.99% uptime SLA

### 2. Lazy Loading (Frontend)
- Load heavy features on demand
- Code splitting for faster initial load
- Progressive enhancement

### 3. Streaming (Backend)
- Videos stream directly to user
- No intermediate storage
- Reduced memory usage

### 4. Connection Pooling
- Reuse HTTP connections
- Reduce SSL handshake overhead
- Faster API calls

---

## Scalability

### Vercel (Frontend + Light API)
- **Auto-scaling**: Unlimited
- **Cold start**: < 100ms
- **Rate limit**: None (fair use)
- **Regions**: Global

### Railway/Render (Backend)
- **Auto-scaling**: Available on paid plans
- **Cold start**: ~10s (free tier)
- **Rate limit**: Configure yourself
- **Regions**: Single region (US/EU)

### Scaling Strategy
1. **Small traffic**: Free tiers handle everything
2. **Medium traffic**: Keep free frontend, upgrade backend
3. **High traffic**: Add load balancer, multiple backend instances
4. **Very high traffic**: Consider CDN for proxied media

---

## Monitoring

### Recommended Tools
- **Vercel**: Built-in analytics + logs
- **Railway/Render**: Built-in logs + metrics
- **Sentry**: Error tracking (optional)
- **UptimeRobot**: Uptime monitoring (optional)
- **LogRocket**: Session replay (optional)

### Key Metrics to Monitor
- ✅ Backend health check response time
- ✅ API endpoint success rates
- ✅ Average download times
- ✅ Error rates by endpoint
- ✅ Monthly bandwidth usage

---

## Cost Optimization

### Free Tier Limits
**Vercel**:
- 100GB bandwidth/month
- 100GB-hrs compute/month
- Unlimited builds

**Railway**:
- $5 free credits/month
- ~500 hours runtime

### Stay Free
1. Use Vercel CDN for static files (offload bandwidth)
2. Cache Instagram API responses (reduce calls)
3. Implement rate limiting (prevent abuse)
4. Add download limits per IP (fair use)

### When to Upgrade
- Backend exceeds 500 hours/month → Railway Pro ($5/mo)
- Vercel exceeds 100GB bandwidth → Vercel Pro ($20/mo)
- Need faster backend cold starts → Paid tier
- Need custom domains → Usually free on both platforms

---

## Disaster Recovery

### Backend Goes Down
- Instagram downloads still work (Vercel)
- Show friendly error for YouTube/Reddit
- Automatic restart policies (Railway/Render)

### Vercel Goes Down (rare)
- Vercel 99.99% uptime SLA
- Static assets cached in browser
- Backend still accessible directly

### Complete Outage
- Both providers have status pages
- Set up status page redirects
- Have backup deployment ready

---

## Future Enhancements

### Potential Improvements
1. **Queue System**: Handle concurrent downloads
2. **Caching Layer**: Redis for API responses
3. **CDN Integration**: Cloudflare for media proxy
4. **User Accounts**: Save download history
5. **Analytics**: Track popular downloads
6. **Rate Limiting**: Prevent abuse
7. **API Keys**: Monetization option
8. **Webhook Support**: Integrate with other services

---

## Technology Stack Summary

### Frontend
- HTML5, CSS3, Vanilla JavaScript
- No frameworks (lightweight, fast)
- Progressive Web App (PWA) ready

### Backend (Vercel)
- Node.js v18+
- Serverless functions
- Express-like routing

### Backend (Heavy Ops)
- Node.js v18+
- Express.js
- Python 3 (for yt-dlp)
- FFmpeg (system binary)
- yt-dlp (Python package)

### Deployment
- Vercel CLI
- Railway automatic deployment
- Git-based workflow

---

## Conclusion

This architecture provides:
- ✅ Fast global delivery (Vercel CDN)
- ✅ Reliable Instagram downloads (Vercel Lambda)
- ✅ Powerful YouTube processing (Railway/Render)
- ✅ Cost-effective (free tiers)
- ✅ Scalable (auto-scaling)
- ✅ Easy to deploy (git push)

**Total Cost**: $0/month for small to medium traffic

---

**Last Updated**: 2024  
**Version**: 2.0  
**Status**: Production Ready ✅
