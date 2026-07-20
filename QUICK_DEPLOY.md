# Quick Deployment Guide

## 🚀 Deploy in 3 Steps

### Step 1: Deploy Frontend to Vercel (5 minutes)

1. Push your code to GitHub/GitLab
2. Go to [vercel.com](https://vercel.com)
3. Click "Import Project" and select your repository
4. Click "Deploy" - that's it! ✅

Your frontend is now live at `https://your-app.vercel.app`

---

### Step 2: Deploy Backend to Railway (5 minutes)

1. Go to [railway.app](https://railway.app)
2. Click "New Project" → "Deploy from GitHub"
3. Select your repository
4. Railway auto-detects settings from `railway.toml`
5. Click "Deploy" ✅

Copy your Railway URL (e.g., `https://your-app.railway.app`)

---

### Step 3: Connect Frontend to Backend (2 minutes)

1. Go to your Vercel project dashboard
2. Navigate to "Settings" → "Environment Variables"
3. Add a new variable:
   - **Name**: `BACKEND_URL`
   - **Value**: `https://your-app.railway.app` (your Railway URL)
4. Click "Save"
5. Redeploy your Vercel app (Deployments → click ⋯ → "Redeploy")

---

## ✅ Done!

Your app is now fully deployed:
- ✅ **Frontend**: Fast, global CDN via Vercel
- ✅ **Light API**: Instagram, session management on Vercel
- ✅ **Heavy API**: YouTube, FFmpeg, Reddit on Railway

---

## 🧪 Test Your Deployment

### Test Backend Health
Open: `https://your-app.railway.app/health`

Should see:
```json
{
  "status": "healthy",
  "server": "backend-heavy-operations"
}
```

### Test Frontend
1. Visit `https://your-app.vercel.app`
2. Try Instagram download (uses Vercel API)
3. Try YouTube download (uses Railway backend)

---

## 🔧 Optional: Add Reddit Support

To enable Reddit downloads:

1. Go to [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps)
2. Click "create another app"
3. Fill in:
   - **name**: OmniSave
   - **type**: script
   - **redirect uri**: `http://localhost` (not actually used)
4. Copy the **client ID** and **secret**
5. Add to Railway environment variables:
   - `REDDIT_CLIENT_ID=your_client_id`
   - `REDDIT_CLIENT_SECRET=your_secret`

---

## 📊 What's Included (Free Tier)

### Vercel Free Tier
- ✅ Unlimited deployments
- ✅ 100GB bandwidth/month
- ✅ Global CDN
- ✅ Auto HTTPS

### Railway Free Tier
- ✅ $5 credit/month (enough for ~500 hours)
- ✅ Auto-scaling
- ✅ Easy setup with `railway.toml`

---

## 🆘 Troubleshooting

### Backend shows "yt-dlp not found"
- Railway should auto-install from `railway.toml`
- Check Railway logs to verify installation
- If issue persists, redeploy

### CORS errors
1. Go to Railway dashboard
2. Add environment variable:
   - `ALLOWED_ORIGINS=https://your-app.vercel.app`
3. Redeploy backend

### Vercel timeout errors
- Vercel functions have 10s limit (free tier)
- Heavy operations should automatically route to Railway
- Check that `BACKEND_URL` is set correctly

---

## 💰 Costs

Both services are **FREE** for:
- Personal projects
- Small to medium traffic
- Non-commercial use

If you need more:
- **Vercel Pro**: $20/month (longer function timeout)
- **Railway**: Pay-as-you-go after free credits

---

## 📚 Need More Details?

See full deployment guide: [DEPLOYMENT.md](./DEPLOYMENT.md)

---

## 🎉 You're Live!

Share your app:
- Instagram: Download reels and posts
- YouTube: Download videos in HD/4K
- Reddit: Save videos with audio
- Facebook: Download public videos
- Snapchat: Save stories and Spotlight

**URL**: `https://your-app.vercel.app`

Enjoy! 🚀
