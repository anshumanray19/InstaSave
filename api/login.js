const fetch = require('node-fetch');
const { getSessionId, setSession, MOBILE_HEADERS, WEB_HEADERS, setCorsHeaders } = require('./_shared');

module.exports = async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sessionid } = req.body;
  if (!sessionid || !sessionid.trim()) {
    return res.status(400).json({ error: 'sessionid is required' });
  }

  const sessionId = getSessionId(req);
  const igSession = { sessionid: sessionid.trim(), csrftoken: null, username: null, userId: null };
  let verifiedUsername = null;

  // ═══ Method 1: Mobile API ═══
  try {
    console.log('[Login] Trying mobile API...');
    const response = await fetch('https://i.instagram.com/api/v1/accounts/current_user/?edit=true', {
      headers: MOBILE_HEADERS(igSession),
    });
    console.log(`[Login] Mobile API status: ${response.status}`);

    if (response.ok) {
      const data = await response.json();
      if (data.user && data.user.username) {
        verifiedUsername = data.user.username;
        igSession.userId = data.user.pk ? data.user.pk.toString() : null;
        console.log(`[Login] ✓ Mobile API verified: @${verifiedUsername}`);
      }
    }
  } catch (err) {
    console.log('[Login] Mobile API error:', err.message);
  }

  // ═══ Method 2: Try web API ═══
  if (!verifiedUsername) {
    try {
      console.log('[Login] Trying web API...');
      const webRes = await fetch('https://www.instagram.com/api/v1/accounts/edit/web_form_data/', {
        headers: {
          ...WEB_HEADERS(igSession),
          'Cookie': `sessionid=${sessionid.trim()}`,
        },
        redirect: 'manual',
      });
      console.log(`[Login] Web API status: ${webRes.status}`);

      if (webRes.ok) {
        const data = await webRes.json();
        if (data.form_data && data.form_data.username) {
          verifiedUsername = data.form_data.username;
          console.log(`[Login] ✓ Web API verified: @${verifiedUsername}`);
        }
      }
    } catch (err) {
      console.log('[Login] Web API error:', err.message);
    }
  }

  // ═══ Method 3: Homepage check ═══
  if (!verifiedUsername) {
    try {
      console.log('[Login] Trying homepage check...');
      const homeRes = await fetch('https://www.instagram.com/accounts/edit/', {
        headers: {
          ...WEB_HEADERS(igSession),
          'Cookie': `sessionid=${sessionid.trim()}`,
        },
        redirect: 'manual',
      });
      console.log(`[Login] Homepage status: ${homeRes.status}`);

      if (homeRes.status === 200) {
        const html = await homeRes.text();
        const usernameMatch = html.match(/"username"\s*:\s*"([^"]+)"/);
        if (usernameMatch) {
          verifiedUsername = usernameMatch[1];
          console.log(`[Login] ✓ Homepage verified: @${verifiedUsername}`);
        }
      } else if (homeRes.status === 302) {
        const location = homeRes.headers.get('location') || '';
        console.log(`[Login] Redirect to: ${location}`);
        if (!location.includes('/accounts/login')) {
          verifiedUsername = 'User';
          console.log(`[Login] ✓ Session seems valid (redirect not to login)`);
        }
      }
    } catch (err) {
      console.log('[Login] Homepage check error:', err.message);
    }
  }

  // ═══ Method 4: Accept if session looks valid ═══
  if (!verifiedUsername && sessionid.trim().length > 20) {
    verifiedUsername = 'User';
    console.log('[Login] ⚠ Could not verify, but accepting session (will validate on video fetch)');
  }

  if (verifiedUsername) {
    igSession.username = verifiedUsername;
    setSession(sessionId, igSession);
    return res.json({
      success: true,
      username: igSession.username,
    });
  }

  console.log('[Login] ✗ All verification methods failed');
  return res.status(401).json({ error: 'Could not verify session. Please check your sessionid cookie and try again.' });
};
