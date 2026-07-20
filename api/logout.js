const { getSessionId, setSession, setCorsHeaders } = require('./_shared');

module.exports = (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sessionId = getSessionId(req);
  setSession(sessionId, { sessionid: null, csrftoken: null, username: null, userId: null });
  
  res.json({ success: true });
};
