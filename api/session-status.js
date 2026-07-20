// Session status endpoint for Vercel
// In-memory session storage (lost on restart — by design for security)
const sessions = new Map();

// Helper to get session from request
function getSessionId(req) {
  return req.headers['x-session-id'] || 'default';
}

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-ID');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const sessionId = getSessionId(req);
  const igSession = sessions.get(sessionId) || { sessionid: null, username: null };

  if (igSession.sessionid && igSession.username) {
    return res.json({ loggedIn: true, username: igSession.username });
  }
  
  res.json({ loggedIn: false });
};

// Export sessions map for use in other API routes
module.exports.sessions = sessions;
