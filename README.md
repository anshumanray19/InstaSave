# ⚡ OmniSave — All-in-One Media Downloader

**OmniSave** is a sleek, modern web app for downloading public media from **Instagram, YouTube, Facebook, and Snapchat** — all from one clean, glassmorphic interface. Paste a link, preview the media, and save it in the best available quality.

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
- Sessions are kept in memory only (see below), so a restart clears any connected Instagram session — by design.

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
- `/#instagram`, `/#youtube`, `/#facebook`, `/#snapchat` — open a specific downloader

---

## ⚠️ Disclaimer

This application is intended for **personal and educational use only**. It is not affiliated with, endorsed, or sponsored by Instagram, YouTube, Meta Platforms, Inc., or Snap Inc. All trademarks belong to their respective owners. Please respect copyright and privacy laws when downloading content.
