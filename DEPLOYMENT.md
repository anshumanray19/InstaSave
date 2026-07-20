# Deployment Guide - OmniSave

This guide explains how to deploy OmniSave with a split architecture:
- **Vercel**: Frontend + lightweight API operations (Instagram, session management)
- **Separate Backend**: Heavy operations (YouTube downloads, FFmpeg processing)

## Architecture Overview

```
┌─────────────────┐
│   User Browser  │
└────────┬────────┘
         │
         ├──────────────┐
         │              │
         v              v
┌────────────────┐  ┌────────────────────┐
│    VERCEL      │  │  Backend Server    │
│  (Frontend +   │  │  (Heavy Ops)       │
│   Light API)   │  │                    │
│                │  │  - YouTube (yt-dlp)│
│ - Static files │  │  - FFmpeg merge    │
│ - Instagram    │  │  - Reddit video    │
│ - Session mgmt │  │  - Media proxy     │
└────────────────┘  └────────────────────┘
```

## Part 1: Deploy Frontend on Vercel

### Prerequisites
- Vercel account (free tier works)
- Git repository with your code

### Step 1: Install Vercel CLI (optional)
```bash
npm install -g vercel
```

### Step 2: Deploy to Vercel

**Option A: Using Vercel Dashboard (Recommended)**
1. Go to [vercel.com](https://vercel.com) and sign in
2. Click "Add New Project"
3. Import your GitHub/GitLab repository
4. Vercel will auto-detect settings
5. Click "Deploy"

**Option B: Using Vercel CLI**
```bash
# Login to Vercel
vercel login

# Deploy
vercel

# Deploy to production
vercel --prod
```

### Step 3: Configure Environment Variables on Vercel
In your Vercel project dashboard:
1. Go to Settings → Environment Variables
2. Add these variables:
   - `BACKEND_URL`: URL of your backend server (e.g., `https://your-backend.railway.app`)
   - `NODE_ENV`: `production`

### Step 4: Update Frontend to Use Backend URL
The frontend will automatically use the `BACKEND_URL` environment variable for heavy operations. No code changes needed if you follow this guide.

## Part 2: Deploy Backend Server

You have several options for deploying the backend server. Choose one:

---

### Option A: Railway (Recommended - Free Tier Available)

1. **Sign up at [railway.app](https://railway.app)**

2. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Connect your repository

3. **Configure Build Settings**
   - Root Directory: `/`
   - Build Command: `npm install`
   - Start Command: `node backend-server.js`

4. **Add Environment Variables**
   ```
   PORT=3001
   ALLOWED_ORIGINS=https://your-vercel-app.vercel.app,http://localhost:3000
   REDDIT_CLIENT_ID=your_reddit_client_id (optional)
   REDDIT_CLIENT_SECRET=your_reddit_secret (optional)
   ```

5. **Install System Dependencies**
   Create a `railway.toml` file:
   ```toml
   [build]
   builder = "NIXPACKS"
   
   [build.nixpacksConfig]
   providers = ["...", "python"]
   
   [build.nixpacksConfig.phases.setup]
   nixPkgs = ["...", "python3", "ffmpeg"]
   
   [build.nixpacksConfig.phases.install]
   cmds = ["pip install yt-dlp"]
   ```

6. **Deploy**
   - Railway will automatically deploy
   - Copy your backend URL (e.g., `https://your-app.railway.app`)

7. **Update Vercel Environment**
   - Go to your Vercel project settings
   - Set `BACKEND_URL` to your Railway URL

---

### Option B: Render (Free Tier Available)

1. **Sign up at [render.com](https://render.com)**

2. **Create New Web Service**
   - Click "New +" → "Web Service"
   - Connect your repository

3. **Configure Service**
   - Name: `omnisave-backend`
   - Environment: `Node`
   - Build Command: `npm install && pip install yt-dlp`
   - Start Command: `node backend-server.js`
   - Instance Type: Free

4. **Add Environment Variables**
   ```
   PORT=3001
   ALLOWED_ORIGINS=https://your-vercel-app.vercel.app
   ```

5. **Add Buildpack (in render.yaml)**
   Create `render.yaml`:
   ```yaml
   services:
     - type: web
       name: omnisave-backend
       env: node
       buildCommand: npm install && apt-get update && apt-get install -y python3 python3-pip ffmpeg && pip3 install yt-dlp
       startCommand: node backend-server.js
       envVars:
         - key: PORT
           value: 3001
   ```

6. **Deploy & Get URL**
   - Copy your Render URL
   - Update Vercel's `BACKEND_URL`

---

### Option C: Heroku

1. **Install Heroku CLI**
   ```bash
   npm install -g heroku
   ```

2. **Login & Create App**
   ```bash
   heroku login
   heroku create omnisave-backend
   ```

3. **Add Buildpacks**
   ```bash
   heroku buildpacks:add --index 1 heroku/nodejs
   heroku buildpacks:add --index 2 heroku/python
   ```

4. **Create Procfile**
   ```
   web: node backend-server.js
   ```

5. **Set Config Vars**
   ```bash
   heroku config:set ALLOWED_ORIGINS=https://your-vercel-app.vercel.app
   ```

6. **Deploy**
   ```bash
   git push heroku main
   ```

---

### Option D: DigitalOcean App Platform

1. **Create Account at [digitalocean.com](https://www.digitalocean.com/products/app-platform)**

2. **Create New App**
   - Connect GitHub repository
   - Select "Web Service"

3. **Configure**
   - Build Command: `npm install`
   - Run Command: `node backend-server.js`
   - HTTP Port: 3001

4. **Add Environment Variables**

5. **Deploy**

---

### Option E: Self-Hosted VPS (Most Control)

If you have a VPS (DigitalOcean Droplet, AWS EC2, etc.):

1. **SSH into your server**
   ```bash
   ssh user@your-server-ip
   ```

2. **Install dependencies**
   ```bash
   # Update system
   sudo apt update && sudo apt upgrade -y
   
   # Install Node.js
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt install -y nodejs
   
   # Install Python & pip
   sudo apt install -y python3 python3-pip
   
   # Install ffmpeg
   sudo apt install -y ffmpeg
   
   # Install yt-dlp
   pip3 install yt-dlp
   
   # Install PM2 (process manager)
   sudo npm install -g pm2
   ```

3. **Clone your repository**
   ```bash
   git clone https://github.com/your-username/omnisave.git
   cd omnisave
   npm install
   ```

4. **Create .env file**
   ```bash
   PORT=3001
   ALLOWED_ORIGINS=https://your-vercel-app.vercel.app
   ```

5. **Start with PM2**
   ```bash
   pm2 start backend-server.js --name omnisave-backend
   pm2 startup
   pm2 save
   ```

6. **Setup Nginx reverse proxy** (optional)
   ```nginx
   server {
       listen 80;
       server_name backend.yourdomain.com;
       
       location / {
           proxy_pass http://localhost:3001;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

7. **Get SSL certificate** (optional)
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d backend.yourdomain.com
   ```

---

## Part 3: Connect Frontend to Backend

### Update Frontend Configuration

Create or update `public/config.js`:
```javascript
// API Configuration
const API_CONFIG = {
  // Lightweight operations (run on Vercel)
  lightApi: '', // Empty string = same origin (Vercel)
  
  // Heavy operations (run on separate backend)
  heavyApi: window.ENV?.BACKEND_URL || 'http://localhost:3001'
};
```

### Update API Calls in `public/app.js`

For YouTube and other heavy operations, use the backend URL:
```javascript
// Example: YouTube download
async function fetchYouTubeVideo(url) {
  const response = await fetch(`${API_CONFIG.heavyApi}/api/youtube/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });
  // ...
}
```

---

## Testing Your Deployment

### 1. Test Backend Health
```bash
curl https://your-backend-url/health
```

Should return:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "server": "backend-heavy-operations"
}
```

### 2. Test Frontend
- Visit your Vercel URL
- Try Instagram downloads (should work via Vercel API)
- Try YouTube downloads (should route to backend)

### 3. Check Logs
- **Vercel**: Project → Deployments → View Function Logs
- **Railway**: Project → Logs
- **Render**: Dashboard → Logs

---

## Monitoring & Maintenance

### Check Backend Status
Add a status indicator in your frontend:
```javascript
async function checkBackendStatus() {
  try {
    const res = await fetch(`${API_CONFIG.heavyApi}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
```

### Keep yt-dlp Updated
Backend servers should regularly update yt-dlp:
```bash
# Add to cron job or CI/CD
pip install --upgrade yt-dlp
```

---

## Troubleshooting

### "yt-dlp not found" Error
- Ensure yt-dlp is installed in your backend environment
- Check PATH includes Python bin directory
- Try absolute path: `/usr/local/bin/yt-dlp`

### CORS Errors
- Verify `ALLOWED_ORIGINS` includes your Vercel domain
- Check backend logs for CORS errors
- Ensure frontend uses correct backend URL

### Vercel Function Timeout
- Keep Vercel functions under 10 seconds (free tier)
- Move slow operations to backend server
- Use streaming responses for large files

### Backend Memory Issues
- Upgrade backend instance size
- Implement request queuing for heavy operations
- Add rate limiting

---

## Cost Estimation

### Vercel (Free Tier)
- ✅ Unlimited deployments
- ✅ 100GB bandwidth/month
- ✅ Hobby projects
- ⚠️ 10s function timeout

### Railway (Free Tier)
- ✅ $5 free credits/month
- ✅ 500 hours/month
- ⚠️ Sleeps after inactivity

### Render (Free Tier)
- ✅ 750 hours/month
- ✅ Always-on possible
- ⚠️ Slower cold starts

### Self-Hosted VPS
- 💰 $5-10/month (DigitalOcean, Linode)
- ✅ Full control
- ⚠️ Requires maintenance

---

## Security Best Practices

1. **Rate Limiting**: Add rate limiting to prevent abuse
2. **API Keys**: Consider adding API authentication
3. **Input Validation**: Sanitize all user inputs
4. **HTTPS Only**: Force HTTPS in production
5. **Environment Variables**: Never commit secrets to Git
6. **Monitoring**: Set up error tracking (Sentry, LogRocket)

---

## Need Help?

- Check logs in Vercel and your backend platform
- Verify environment variables are set correctly
- Test each component separately
- Ensure yt-dlp and ffmpeg are properly installed on backend

---

**You're all set! 🚀**

Your OmniSave app is now running with:
- ✅ Fast frontend on Vercel's CDN
- ✅ Lightweight Instagram API on Vercel serverless
- ✅ Heavy operations on dedicated backend server
- ✅ Scalable, maintainable architecture
