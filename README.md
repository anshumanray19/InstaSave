# ⚡ OmniSave — All-in-One Media Downloader

**OmniSave** is a sleek, modern web app for downloading public media from **Instagram, YouTube, Facebook, Snapchat, and Reddit** — all from one clean, glassmorphic interface. Paste a link, preview the media, and save it in the best available quality.

---

## ✨ Features

### 📷 Instagram
- **Media Downloader** — any public reel, post, or carousel (multi-item posts return every photo & video).
- **Bulk Downloader** — load a public profile's feed and select multiple posts to download at once.
- **Private & Exclusive** — view/download content from private accounts you follow, using your `sessionid`.
- **Story Downloader** — grab active stories & highlights.

### ▶️ YouTube
- **Every resolution** — 360p up to 1080p, 1440p & 4K, each delivered with audio merged in.
- **Audio only** — extract high-quality MP3 / M4A from any video.
- **Live progress** — real-time download & merge progress for large files.

### 📘 Facebook
- **Post / Reel** — download public videos, reels, and photos.
- **Profile Picture** — grab the high-resolution profile picture of any public profile or Page.
- **Story** — best-effort story preview download when publicly shared.

### 👻 Snapchat
- **Public stories** — paste `snapchat.com/@username` to save active story snaps.
- **Highlights** — download saved highlight reels from public profiles.
- **Spotlight** — save Spotlight videos without a watermark.

### 👽 Reddit
- **Images & GIFs** — any public image or GIF post.
- **Galleries** — every image/video in a multi-item gallery post.
- **Videos** — v.redd.it videos merged **with sound** (server-side ffmpeg), shown with live download progress.
- Requires free Reddit API credentials (see [Reddit Setup](#-reddit-setup) below).

### 🎨 General
- **Proxy streaming** — bypasses CORS by safely proxying media through the server.
- **Preview & download** — view each item inline, download individually or all at once.
- **Modern UI** — glassmorphism design, animated blobs, responsive layout, deep-linkable pages.

---

## 🛠️ Technology Stack

- **Frontend:** HTML5, CSS3, Vanilla JavaScript (SPA, relative API paths).
- **Backend:** Node.js, Express.js.
- **Media tooling:** [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) (YouTube & Facebook video extraction), [`ffmpeg-static`](https://www.npmjs.com/package/ffmpeg-static) (bundled — merges high-res video + audio).
- **Dependencies:** `express`, `cors`, `node-fetch`, `ffmpeg-static`.

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended).
- **`yt-dlp`** on your `PATH` (required for YouTube & Facebook video downloads):
  - Windows: `pip install yt-dlp` or drop `yt-dlp.exe` in the project folder.
  - macOS/Linux: `pip install yt-dlp` or `brew install yt-dlp`.
- **ffmpeg** is bundled automatically via the `ffmpeg-static` npm package — no separate install needed.

### Installation

1. **Clone or download the repository.**
2. **Navigate to the project directory:**
   ```bash
   cd InstaSave
   ```
3. **Install dependencies:**
   ```bash
   npm install
   ```

### Running the Application

```bash
npm start
```
*Or directly:*
```bash
node server.js
```

The application runs at **`http://localhost:55964`**. Open this URL in your browser.

---

## 🌐 Hosting / Deployment

- The server listens on **port `55964`** by default.
- The port is overridable with the `PORT` environment variable, so platforms that inject their own port (Render, Railway, Heroku, etc.) work automatically:
  ```bash
  PORT=8080 node server.js     # macOS/Linux
  ```
  ```powershell
  $env:PORT=8080; node server.js   # Windows PowerShell
  ```
- Ensure `yt-dlp` is installed in the hosting environment for YouTube/Facebook video support. `ffmpeg` ships with the app via `ffmpeg-static`.
- For Reddit, set `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` (see [Reddit Setup](#-reddit-setup)).
- Sessions are kept in memory only (see below), so a restart clears any connected Instagram session — by design.

---

## 👽 Reddit Setup

Reddit blocks anonymous server-side access, so OmniSave uses Reddit's official **OAuth API**. Create a free app once:

1. Log in to Reddit and go to **<https://www.reddit.com/prefs/apps>**.
2. Click **"are you a developer? create an app…"** at the bottom.
3. Fill in:
   - **name:** `OmniSave` (anything)
   - **type:** select **`script`**
   - **redirect uri:** `http://localhost:55964` (required field; not actually used)
4. Click **Create app**. You'll now see:
   - The **client ID** — the short string just under the app name (e.g. `p-Xa1bC2d3...`).
   - The **secret** — labeled `secret`.
5. Provide them to the server as environment variables before starting it:

   **Windows (PowerShell):**
   ```powershell
   $env:REDDIT_CLIENT_ID="your_client_id"
   $env:REDDIT_CLIENT_SECRET="your_secret"
   npm start
   ```
   **macOS/Linux:**
   ```bash
   REDDIT_CLIENT_ID="your_client_id" REDDIT_CLIENT_SECRET="your_secret" npm start
   ```
   On hosting platforms (Render, Railway, etc.), add both as environment variables in the dashboard.

> Without these variables, the Reddit tab returns a clear "not configured" message; every other downloader keeps working normally. The credentials authenticate the *app*, not any user — no Reddit login is involved, and nothing is posted on your behalf.

---

## 🔐 How to Download Private Instagram Content (Session Connect)

To access content from private Instagram accounts you follow:

1. **Open Instagram** in your desktop browser and log in.
2. **Open Developer Tools** (`F12`, or Right Click → Inspect).
3. Go to the **Application** tab (or **Storage** in Firefox).
4. Under **Cookies**, click `https://www.instagram.com`.
5. Find the row named `sessionid` and **copy its value**.
6. In OmniSave, click **Login** (top right), paste your `sessionid`, and click **Connect**.

> **Note:** Your session ID is kept only in the server's temporary memory while it runs and is automatically destroyed on restart. It is never written to disk or shared.

---

## 🔗 Quick Links (deep-linking)

You can link straight to a section:

- `/#how-it-works` — the guide
- `/#instagram`, `/#youtube`, `/#facebook`, `/#snapchat`, `/#reddit` — open a specific downloader

---

## ⚠️ Disclaimer

This application is intended for **personal and educational use only**. It is not affiliated with, endorsed, or sponsored by Instagram, YouTube, Meta Platforms, Inc., Snap Inc., or Reddit Inc. All trademarks belong to their respective owners. Please respect copyright and privacy laws when downloading content.
