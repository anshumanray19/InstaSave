const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory session storage (lost on restart — by design for security)
let igSession = {
    sessionid: null,
    csrftoken: null,
    username: null,
    userId: null,
};

// ─── Helpers ───────────────────────────────────────────────────────────

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

// Convert Instagram shortcode to numeric media ID
// Instagram uses a base64-like encoding for shortcodes
function shortcodeToMediaId(shortcode) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let mediaId = BigInt(0);
    for (const char of shortcode) {
        mediaId = mediaId * BigInt(64) + BigInt(alphabet.indexOf(char));
    }
    return mediaId.toString();
}

function buildCookieHeader() {
    if (!igSession.sessionid) return '';
    const cookies = [`sessionid=${igSession.sessionid}`];
    if (igSession.csrftoken) cookies.push(`csrftoken=${igSession.csrftoken}`);
    return cookies.join('; ');
}

// Mobile API headers — these work much better than web headers
const MOBILE_HEADERS = () => ({
    'User-Agent': 'Instagram 317.0.0.34.109 Android (34/14; 480dpi; 1080x2400; Google/google; Pixel 8 Pro; husky; tensor; en_US; 562816080)',
    'Accept': '*/*',
    'Accept-Language': 'en-US',
    'X-IG-App-ID': '567067343352427',
    'X-IG-Capabilities': '3brTv10=',
    'X-IG-Connection-Type': 'WIFI',
    'Cookie': buildCookieHeader(),
});

// Web headers (fallback only)
const WEB_HEADERS = () => ({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'X-IG-App-ID': '936619743392459',
    'X-Requested-With': 'XMLHttpRequest',
    'Referer': 'https://www.instagram.com/',
    'Origin': 'https://www.instagram.com',
    'Cookie': buildCookieHeader(),
});

// ─── Routes ────────────────────────────────────────────────────────────

// Check session status
app.get('/api/session-status', (req, res) => {
    if (igSession.sessionid && igSession.username) {
        return res.json({ loggedIn: true, username: igSession.username });
    }
    res.json({ loggedIn: false });
});

// Login — accept sessionid cookie
app.post('/api/login', async (req, res) => {
    const { sessionid } = req.body;
    if (!sessionid || !sessionid.trim()) {
        return res.status(400).json({ error: 'sessionid is required' });
    }

    igSession.sessionid = sessionid.trim();
    let verifiedUsername = null;

    // ═══ Method 1: Mobile API ═══
    try {
        console.log('[Login] Trying mobile API...');
        const response = await fetch('https://i.instagram.com/api/v1/accounts/current_user/?edit=true', {
            headers: MOBILE_HEADERS(),
        });
        console.log(`[Login] Mobile API status: ${response.status}`);

        if (response.ok) {
            const data = await response.json();
            if (data.user && data.user.username) {
                verifiedUsername = data.user.username;
                igSession.userId = data.user.pk ? data.user.pk.toString() : null;
                console.log(`[Login] ✓ Mobile API verified: @${verifiedUsername}`);
            }
        } else {
            const body = await response.text();
            console.log(`[Login] Mobile API failed body: ${body.substring(0, 300)}`);
        }
    } catch (err) {
        console.log('[Login] Mobile API error:', err.message);
    }

    // ═══ Method 2: Try web API with follow redirects disabled ═══
    if (!verifiedUsername) {
        try {
            console.log('[Login] Trying web API...');
            const webRes = await fetch('https://www.instagram.com/api/v1/accounts/edit/web_form_data/', {
                headers: {
                    ...WEB_HEADERS(),
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
            } else {
                const body = await webRes.text();
                console.log(`[Login] Web API failed body: ${body.substring(0, 300)}`);
            }
        } catch (err) {
            console.log('[Login] Web API error:', err.message);
        }
    }

    // ═══ Method 3: Try fetching any Instagram page to check if session is valid ═══
    if (!verifiedUsername) {
        try {
            console.log('[Login] Trying homepage check...');
            const homeRes = await fetch('https://www.instagram.com/accounts/edit/', {
                headers: {
                    ...WEB_HEADERS(),
                    'Cookie': `sessionid=${sessionid.trim()}`,
                },
                redirect: 'manual',
            });
            console.log(`[Login] Homepage status: ${homeRes.status}`);

            // A 200 means logged in, a 302 to /accounts/login/ means not logged in
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
                // If it redirects but NOT to login page, session might still be ok
                if (!location.includes('/accounts/login')) {
                    verifiedUsername = 'User';
                    console.log(`[Login] ✓ Session seems valid (redirect not to login)`);
                }
            }
        } catch (err) {
            console.log('[Login] Homepage check error:', err.message);
        }
    }

    // ═══ Method 4: Just accept the session ═══
    // If all verification methods fail but the sessionid looks valid (long alphanumeric string),
    // accept it anyway — the actual video fetch will tell us if it works
    if (!verifiedUsername && sessionid.trim().length > 20) {
        verifiedUsername = 'User';
        console.log('[Login] ⚠ Could not verify, but accepting session (will validate on video fetch)');
    }

    if (verifiedUsername) {
        igSession.username = verifiedUsername;
        return res.json({
            success: true,
            username: igSession.username,
        });
    }

    igSession.sessionid = null;
    console.log('[Login] ✗ All verification methods failed');
    return res.status(401).json({ error: 'Could not verify session. Please check your sessionid cookie and try again.' });
});

// Logout
app.post('/api/logout', (req, res) => {
    igSession = { sessionid: null, csrftoken: null, username: null, userId: null };
    res.json({ success: true });
});

// Debug endpoint — check what Instagram returns
app.get('/api/debug/:shortcode', async (req, res) => {
    const { shortcode } = req.params;
    const mediaId = shortcodeToMediaId(shortcode);
    const results = {};

    console.log(`\n[Debug] Shortcode: ${shortcode} → Media ID: ${mediaId}`);
    console.log(`[Debug] Session: ${igSession.sessionid ? 'present' : 'missing'}`);

    // Test mobile API
    try {
        const mobileRes = await fetch(`https://i.instagram.com/api/v1/media/${mediaId}/info/`, {
            headers: MOBILE_HEADERS(),
        });
        results.mobileApi = {
            status: mobileRes.status,
            statusText: mobileRes.statusText,
            headers: Object.fromEntries(mobileRes.headers.entries()),
        };
        if (mobileRes.ok) {
            const data = await mobileRes.json();
            results.mobileApi.hasItems = !!(data.items && data.items.length > 0);
            results.mobileApi.itemCount = data.items?.length || 0;
            if (data.items?.[0]) {
                results.mobileApi.hasVideoVersions = !!data.items[0].video_versions;
                results.mobileApi.mediaType = data.items[0].media_type;
                results.mobileApi.username = data.items[0].user?.username;
            }
        }
    } catch (err) {
        results.mobileApi = { error: err.message };
    }

    console.log('[Debug] Results:', JSON.stringify(results, null, 2));
    res.json(results);
});

// Fetch video info
app.post('/api/fetch-video', async (req, res) => {
    const { url } = req.body;
    if (!url || !url.trim()) {
        return res.status(400).json({ error: 'URL is required' });
    }

    const shortcode = extractShortcode(url.trim());
    if (!shortcode) {
        return res.status(400).json({ error: 'Invalid Instagram URL. Please paste a reel, post, or IGTV link.' });
    }

    if (!igSession.sessionid) {
        return res.status(401).json({ error: 'Please login first by providing your Instagram sessionid.' });
    }

    const mediaId = shortcodeToMediaId(shortcode);
    console.log(`\n[Fetch] Shortcode: ${shortcode} → Media ID: ${mediaId}`);

    let videoUrl, thumbnailUrl, caption, username;

    try {
        // ═══ Method 1: Mobile API (most reliable) ═══
        console.log('[Fetch] Trying mobile API...');
        const mobileRes = await fetch(`https://i.instagram.com/api/v1/media/${mediaId}/info/`, {
            headers: MOBILE_HEADERS(),
        });
        console.log(`[Fetch] Mobile API status: ${mobileRes.status}`);

        if (mobileRes.ok) {
            const data = await mobileRes.json();

            if (data.items && data.items.length > 0) {
                const item = data.items[0];

                // Check for video versions (reels, IGTV, video posts)
                if (item.video_versions && item.video_versions.length > 0) {
                    // Get highest quality video
                    videoUrl = item.video_versions[0].url;
                    thumbnailUrl = item.image_versions2?.candidates?.[0]?.url || null;
                    caption = item.caption?.text || '';
                    username = item.user?.username || '';
                    console.log(`[Fetch] ✓ Got video from mobile API: @${username}`);
                }
                // Check carousel posts
                else if (item.carousel_media) {
                    for (const carouselItem of item.carousel_media) {
                        if (carouselItem.video_versions && carouselItem.video_versions.length > 0) {
                            videoUrl = carouselItem.video_versions[0].url;
                            thumbnailUrl = carouselItem.image_versions2?.candidates?.[0]?.url || null;
                            caption = item.caption?.text || '';
                            username = item.user?.username || '';
                            console.log(`[Fetch] ✓ Got video from carousel via mobile API`);
                            break;
                        }
                    }
                }
            }
        }

        // ═══ Method 2: Web GraphQL (fallback) ═══
        if (!videoUrl) {
            console.log('[Fetch] Trying web GraphQL...');
            try {
                const gqlRes = await fetch('https://www.instagram.com/graphql/query/', {
                    method: 'POST',
                    headers: {
                        ...WEB_HEADERS(),
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Accept': '*/*',
                    },
                    body: `query_hash=b3055c01b4b222b8a47dc12b090e4e64&variables=${encodeURIComponent(JSON.stringify({
                        shortcode: shortcode,
                        child_comment_count: 3,
                        fetch_comment_count: 40,
                        parent_comment_count: 24,
                        has_threaded_comments: true
                    }))}`,
                    redirect: 'manual',
                });
                console.log(`[Fetch] GraphQL status: ${gqlRes.status}`);

                if (gqlRes.ok) {
                    const gqlData = await gqlRes.json();
                    const media = gqlData?.data?.shortcode_media;
                    if (media && media.is_video && media.video_url) {
                        videoUrl = media.video_url;
                        thumbnailUrl = media.display_url || media.thumbnail_src;
                        caption = media.edge_media_to_caption?.edges?.[0]?.node?.text || '';
                        username = media.owner?.username || '';
                        console.log(`[Fetch] ✓ Got video from GraphQL: @${username}`);
                    }
                }
            } catch (e) {
                console.log('[Fetch] GraphQL error:', e.message);
            }
        }

        // ═══ Method 3: Web page scrape (last resort) ═══
        if (!videoUrl) {
            console.log('[Fetch] Trying page scrape...');
            try {
                const pageRes = await fetch(`https://www.instagram.com/reel/${shortcode}/`, {
                    headers: {
                        ...WEB_HEADERS(),
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    },
                    redirect: 'manual',
                });
                console.log(`[Fetch] Page scrape status: ${pageRes.status}`);

                if (pageRes.ok) {
                    const html = await pageRes.text();
                    console.log(`[Fetch] Page HTML length: ${html.length}`);

                    // Try og:video meta tag
                    const ogVideoMatch = html.match(/<meta\s+(?:property|name)="og:video"\s+content="([^"]+)"/);
                    if (ogVideoMatch) {
                        videoUrl = ogVideoMatch[1];
                        const ogImgMatch = html.match(/<meta\s+(?:property|name)="og:image"\s+content="([^"]+)"/);
                        thumbnailUrl = ogImgMatch ? ogImgMatch[1] : null;
                        caption = '';
                        username = '';
                        console.log(`[Fetch] ✓ Got video from og:video meta tag`);
                    }

                    // Try embedded JSON data
                    if (!videoUrl) {
                        // Look for video_url in raw JSON embedded in the page
                        const videoUrlMatch = html.match(/"video_url"\s*:\s*"(https?:[^"]+)"/);
                        if (videoUrlMatch) {
                            videoUrl = videoUrlMatch[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
                            const thumbMatch = html.match(/"display_url"\s*:\s*"(https?:[^"]+)"/);
                            thumbnailUrl = thumbMatch ? thumbMatch[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/') : null;
                            const userMatch = html.match(/"username"\s*:\s*"([^"]+)"/);
                            username = userMatch ? userMatch[1] : '';
                            caption = '';
                            console.log(`[Fetch] ✓ Got video from embedded JSON`);
                        }
                    }
                }
            } catch (e) {
                console.log('[Fetch] Page scrape error:', e.message);
            }
        }

        // ═══ Final response ═══
        if (!videoUrl) {
            console.log('[Fetch] ✗ All methods failed');
            return res.status(404).json({
                error: 'Could not extract video. This might be a photo post, the account is private and you don\'t follow them, or your session cookie has expired. Try logging out and logging back in with a fresh sessionid.'
            });
        }

        return res.json({
            success: true,
            videoUrl,
            thumbnailUrl,
            caption,
            username,
            shortcode,
        });
    } catch (err) {
        console.error('[Fetch] Error:', err);
        return res.status(500).json({ error: 'Server error: ' + err.message });
    }
});

// Proxy video stream (avoids CORS issues)
app.get('/api/proxy-video', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'Video URL is required' });
    }

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229258)',
                'Cookie': buildCookieHeader(),
            },
        });

        if (!response.ok) {
            return res.status(response.status).json({ error: 'Failed to fetch video' });
        }

        res.setHeader('Content-Type', response.headers.get('content-type') || 'video/mp4');
        const contentLength = response.headers.get('content-length');
        if (contentLength) res.setHeader('Content-Length', contentLength);
        res.setHeader('Accept-Ranges', 'bytes');

        response.body.pipe(res);
    } catch (err) {
        console.error('Proxy error:', err);
        res.status(500).json({ error: 'Failed to proxy video' });
    }
});

// Proxy thumbnail
app.get('/api/proxy-image', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL required' });

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Instagram 275.0.0.27.98 Android',
                'Cookie': buildCookieHeader(),
            },
        });
        if (!response.ok) return res.status(response.status).end();
        res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
        response.body.pipe(res);
    } catch (err) {
        res.status(500).end();
    }
});

// SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n  🎬  InstaSave is running at http://localhost:${PORT}\n`);
});
