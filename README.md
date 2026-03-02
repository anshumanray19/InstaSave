# 🎬 InstaSave — Instagram Video Viewer

**InstaSave** is a sleek, modern web application that allows you to view any Instagram reel or video inline, including content from private accounts that you follow. It features a beautiful glassmorphic UI, smooth animations, and a seamless video viewing experience.

---

## ✨ Features

- **📺 View Any Video:** Supports Instagram Reels, Posts, and IGTV links.
- **🔐 Private Account Support:** View videos from private accounts you follow by securely providing your Instagram `sessionid` cookie.
- **🚀 Proxy Streaming:** Bypasses CORS issues by proxying video and image streams safely through the server.
- **💾 Download & Share:** Download videos directly to your device or copy the video link with a single click.
- **🕰️ Viewing History:** Keeps track of your recently viewed videos for quick access.
- **🎨 Modern UI:** Beautiful glassmorphism design, animated background blobs, responsive layout, and an intuitive user experience.

---

## 🛠️ Technology Stack

- **Frontend:** HTML5, CSS3, Vanilla JavaScript.
- **Backend:** Node.js, Express.js.
- **Dependencies:** `cors`, `express`, `node-fetch`.

---

## 🚀 Getting Started

### Prerequisites

Ensure you have [Node.js](https://nodejs.org/) installed on your machine.

### Installation

1. **Clone or Download the Repository**
2. **Navigate to the Project Directory:**
   ```bash
   cd InstaSave
   ```
3. **Install Dependencies:**
   ```bash
   npm install
   ```

### Running the Application

Start the server using npm:

```bash
npm start
```
*Or for development mode:*
```bash
npm run dev
```

The application will start running at `http://localhost:3000`. Open this URL in your web browser.

---

## 🔐 How to View Private Videos (Session Connect)

To view videos from private accounts you follow, you need to connect your Instagram session to InstaSave.

1. **Open Instagram** in your desktop browser and ensure you are logged in.
2. **Open Developer Tools** by pressing `F12` (or `Right Click -> Inspect`).
3. Go to the **Application** tab (or **Storage** in Firefox).
4. Under **Cookies** in the left sidebar, click on `https://www.instagram.com`.
5. Find the row where the Name is `sessionid`.
6. **Copy its Value**.
7. In **InstaSave**, click the "Login" button at the top right, and paste your `sessionid` into the input field.
8. Click **Connect**.

*Note: Your session ID is only kept in the server's temporary memory while it runs and is automatically destroyed when the server restarts.*

---

## 📸 Screenshots & Usage

1. **Paste Link:** Paste any supported Instagram link (`instagram.com/reel/...`, `instagram.com/p/...`, etc.) into the main search bar.
2. **Click View:** The application will fetch the highest quality video and its thumbnail.
3. **Enjoy:** Play the video, download it, or explore your recently viewed history.

---

## ⚠️ Disclaimer

This application is intended for personal and educational use only. It is not affiliated with, endorsed, or sponsored by Instagram or Meta Platforms, Inc. Please respect copyright and privacy laws when viewing or downloading content.
