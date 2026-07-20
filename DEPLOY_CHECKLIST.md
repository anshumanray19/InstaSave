# Deployment Checklist ✅

Use this checklist to ensure a smooth deployment.

## Pre-Deployment

- [ ] Code is committed and pushed to GitHub/GitLab
- [ ] `.env.example` is up to date
- [ ] No secrets in the code (check for hardcoded API keys)
- [ ] `package.json` dependencies are up to date
- [ ] Test locally with both frontend and backend running

## Vercel Deployment (Frontend)

- [ ] Create account at [vercel.com](https://vercel.com)
- [ ] Import repository
- [ ] Verify `vercel.json` is in root directory
- [ ] Wait for initial deployment to complete
- [ ] Copy Vercel app URL (e.g., `https://your-app.vercel.app`)
- [ ] Test frontend at Vercel URL
- [ ] Verify static files are loading correctly

## Backend Deployment (Choose One)

### Option A: Railway
- [ ] Create account at [railway.app](https://railway.app)
- [ ] Create new project from GitHub
- [ ] Verify `railway.toml` is detected
- [ ] Wait for deployment to complete
- [ ] Copy Railway app URL (e.g., `https://your-app.railway.app`)
- [ ] Test health endpoint: `https://your-app.railway.app/health`
- [ ] Check Railway logs for errors

### Option B: Render
- [ ] Create account at [render.com](https://render.com)
- [ ] Create new web service from repository
- [ ] Verify `render.yaml` is detected
- [ ] Select free tier
- [ ] Wait for deployment (may take 5-10 minutes)
- [ ] Copy Render app URL
- [ ] Test health endpoint
- [ ] Check Render logs for errors

### Option C: Other Platform
- [ ] Follow platform-specific instructions in DEPLOYMENT.md
- [ ] Ensure yt-dlp and ffmpeg are installed
- [ ] Copy deployed URL
- [ ] Test health endpoint

## Environment Variables

### Vercel Environment Variables
- [ ] Go to Project Settings → Environment Variables
- [ ] Add `BACKEND_URL` = `https://your-backend-url`
- [ ] Add `NODE_ENV` = `production`
- [ ] Redeploy Vercel app to apply changes

### Backend Environment Variables
- [ ] Add `ALLOWED_ORIGINS` = `https://your-vercel-app.vercel.app,http://localhost:3000`
- [ ] Add `PORT` = `3001` (if not auto-set)
- [ ] (Optional) Add `REDDIT_CLIENT_ID` 
- [ ] (Optional) Add `REDDIT_CLIENT_SECRET`
- [ ] Redeploy backend to apply changes

## Post-Deployment Testing

### Frontend Tests
- [ ] Visit `https://your-app.vercel.app`
- [ ] Page loads without errors
- [ ] All static assets load (CSS, images, fonts)
- [ ] Navigation works
- [ ] Mobile view looks good

### Instagram Features (Vercel API)
- [ ] Test public Instagram post download
- [ ] Test Instagram reel download
- [ ] Test carousel post (multiple images)
- [ ] Test login with session ID
- [ ] Test private post download (if logged in)

### Backend-Heavy Features
- [ ] Test YouTube video download (uses backend)
- [ ] Check browser console for backend connection
- [ ] Test Reddit video download
- [ ] Verify FFmpeg merging works

### Error Handling
- [ ] Test with invalid Instagram URL
- [ ] Test with invalid YouTube URL
- [ ] Test with deleted/private content
- [ ] Verify error messages are user-friendly

## Monitoring & Maintenance

- [ ] Set up error tracking (optional: Sentry, LogRocket)
- [ ] Bookmark deployment logs:
  - Vercel: Project → Deployments → Logs
  - Railway/Render: Dashboard → Logs
- [ ] Set up uptime monitoring (optional: UptimeRobot, Pingdom)
- [ ] Star your repository for easy access
- [ ] Share the app with friends! 🎉

## Troubleshooting

If something isn't working:

1. **Check logs first**
   - Vercel: Function logs
   - Backend: Platform logs

2. **Common issues**
   - CORS errors: Check `ALLOWED_ORIGINS` includes Vercel URL
   - Backend timeout: Verify backend URL is correct
   - yt-dlp errors: Check backend logs, may need to update yt-dlp
   - 404 errors: Verify routes in `vercel.json` are correct

3. **Test individually**
   - Test backend health endpoint directly
   - Test Vercel API endpoints with curl/Postman
   - Check browser console for JavaScript errors

4. **Still stuck?**
   - Review DEPLOYMENT.md for detailed guides
   - Check platform-specific documentation
   - Verify all environment variables are set

## Success Criteria ✅

You're successfully deployed when:
- ✅ Frontend loads at Vercel URL
- ✅ Backend health check returns `{"status": "healthy"}`
- ✅ Instagram downloads work (public posts)
- ✅ YouTube downloads work (routes to backend)
- ✅ No CORS errors in browser console
- ✅ Mobile view works correctly

## Share Your Success! 🎉

Once deployed:
- Tweet about it (tag relevant hashtags)
- Share on Reddit/Discord
- Add to your portfolio
- Tell your friends

**Congratulations on your successful deployment!** 🚀

---

## Quick Links

- [Quick Deploy Guide](./QUICK_DEPLOY.md) - Simple 3-step deployment
- [Full Deployment Guide](./DEPLOYMENT.md) - Detailed platform guides
- [README](./README.md) - Project documentation
- [Vercel Dashboard](https://vercel.com/dashboard)
- [Railway Dashboard](https://railway.app/dashboard)
- [Render Dashboard](https://dashboard.render.com/)

---

Last Updated: 2024
