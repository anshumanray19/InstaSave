// Shared utilities and session storage for Vercel API routes
const sessions = new Map();

function getSessionId(req) {
  return req.headers['x-session-id'] || req.cookies?.sessionId || 'default';
}

function getSession(sessionId) {
  return sessions.get(sessionId) || { sessionid: null, csrftoken: null, username: null, userId: null };
}

function setSession(sessionId, sessionData) {
  sessions.set(sessionId, sessionData);
}

function extractShortcode(url) {
  const patterns = [
    /instagram\.com\/(?:reel|p|tv|reels)\/([A-Za-z0-9_-]+)/,
    /instagram\.com\/stories\/[^/]+\/(\d+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function shortcodeToMediaId(shortcode) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let mediaId = BigInt(0);
  for (const char of shortcode) {
    mediaId = mediaId * BigInt(64) + BigInt(alphabet.indexOf(char));
  }
  return mediaId.toString();
}

function buildCookieHeader(igSession) {
  if (!igSession.sessionid) return '';
  const cookies = [`sessionid=${igSession.sessionid}`];
  if (igSession.csrftoken) cookies.push(`csrftoken=${igSession.csrftoken}`);
  return cookies.join('; ');
}

const MOBILE_HEADERS = (igSession) => ({
  'User-Agent': 'Instagram 317.0.0.34.109 Android (34/14; 480dpi; 1080x2400; Google/google; Pixel 8 Pro; husky; tensor; en_US; 562816080)',
  'Accept': '*/*',
  'Accept-Language': 'en-US',
  'X-IG-App-ID': '567067343352427',
  'X-IG-Capabilities': '3brTv10=',
  'X-IG-Connection-Type': 'WIFI',
  'Cookie': buildCookieHeader(igSession),
});

const WEB_HEADERS = (igSession) => ({
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'X-IG-App-ID': '936619743392459',
  'X-Requested-With': 'XMLHttpRequest',
  'Referer': 'https://www.instagram.com/',
  'Origin': 'https://www.instagram.com',
  'Cookie': buildCookieHeader(igSession),
});

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-ID');
}

module.exports = {
  sessions,
  getSessionId,
  getSession,
  setSession,
  extractShortcode,
  shortcodeToMediaId,
  buildCookieHeader,
  MOBILE_HEADERS,
  WEB_HEADERS,
  setCorsHeaders
};
