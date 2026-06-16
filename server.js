const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 55964;

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

    const mediaId = shortcodeToMediaId(shortcode);
    console.log(`\n[Fetch] Shortcode: ${shortcode} → Media ID: ${mediaId}`);

    let videoUrl, thumbnailUrl, caption, username;
    let embedDisabled = false;

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
        // ═══ Method 3: Web page scrape (last resort, works without authentication) ═══
        if (!videoUrl) {
            console.log('[Fetch] Trying page scrape via embed...');
            const embedHeaders = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'sec-fetch-mode': 'navigate',
            };

            for (const urlType of ['p', 'reel', 'tv']) {
                try {
                    const embedUrl = `https://www.instagram.com/${urlType}/${shortcode}/embed/captioned/`;
                    const embedRes = await fetch(embedUrl, { headers: embedHeaders, redirect: 'manual' });
                    if (!embedRes.ok) {
                        console.log(`[Fetch] Embed /${urlType}/ status: ${embedRes.status}`);
                        continue;
                    }
                    const html = await embedRes.text();
                    if (!html || html.length < 500) continue;

                    if (html.includes('EmbedIsBroken') || html.includes('The link to this photo or video may be broken')) {
                        console.log(`[Fetch] Embed is broken/disabled for /${urlType}/`);
                        embedDisabled = true;
                        continue;
                    }

                    // Unescape/decode quotes, slashes, and characters in the HTML first
                    const decodedHtml = html
                        .replace(/\\+/g, '\\')
                        .replace(/\\u002F/gi, '/')
                        .replace(/\\u0026/gi, '&')
                        .replace(/\\\\\//g, '/')
                        .replace(/\\\//g, '/')
                        .replace(/\\"/g, '"');

                    const ogVideoSec = decodedHtml.match(/property=["']og:video:secure_url["']\s+content=["']([^"']+)["']/i);
                    const ogVideo = decodedHtml.match(/property=["']og:video["']\s+content=["']([^"']+)["']/i);
                    const inlineVideoUrl = decodedHtml.match(/"video_url"\s*:\s*"([^"]+)"/);
                    const parsedVideoUrl = ogVideoSec?.[1] || ogVideo?.[1] || (inlineVideoUrl ? inlineVideoUrl[1] : null);

                    if (parsedVideoUrl) {
                        videoUrl = parsedVideoUrl;
                        const ogImage = decodedHtml.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i);
                        const inlineDisplay = decodedHtml.match(/"display_url"\s*:\s*"([^"]+)"/);
                        thumbnailUrl = ogImage?.[1] || (inlineDisplay ? inlineDisplay[1] : null);

                        const userMatch = decodedHtml.match(/"username"\s*:\s*"([^"]+)"/);
                        if (userMatch) username = userMatch[1];

                        const capMatch = decodedHtml.match(/"caption"\s*:\s*"((?:[^"\\]|\\.)*)"/);
                        if (capMatch) caption = capMatch[1];

                        console.log(`[Fetch] ✓ Got video from embed page scrape`);
                        break;
                    }
                } catch (e) {
                    console.log(`[Fetch] Embed /${urlType}/ error:`, e.message);
                }
            }
        }

        // ═══ Final response ═══
        if (!videoUrl) {
            console.log('[Fetch] ✗ All methods failed');
            if (embedDisabled && !igSession.sessionid) {
                return res.status(403).json({
                    error: "This post has embedding disabled by the creator (or is restricted). Please log in with your Instagram Session ID in the 'Private & Exclusive' tab to download it.",
                    needsLogin: true
                });
            }
            if (!igSession.sessionid) {
                return res.status(401).json({
                    error: 'Could not fetch this post. If it is private or restricted, please log in with your Instagram session ID.',
                    needsLogin: true
                });
            }
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

// ─── PUBLIC MEDIA FETCH ──────────────────────────────────────────────
app.post('/api/fetch-public', async (req, res) => {
    const { url } = req.body;
    if (!url || !url.trim()) {
        return res.status(400).json({ error: 'URL is required' });
    }

    const shortcode = extractShortcode(url.trim());
    if (!shortcode) {
        return res.status(400).json({ error: 'Invalid Instagram URL. Please paste a reel, post, or IGTV link.' });
    }

    const mediaId = shortcodeToMediaId(shortcode);
    console.log(`\n[PublicFetch] Shortcode: ${shortcode} → Media ID: ${mediaId}`);

    let items = [];
    let caption = '';
    let username = '';
    let embedDisabled = false;

    try {
        // ═══ Method 1: Mobile API (most reliable) ═══
        console.log('[PublicFetch] Trying mobile API...');
        const mobileRes = await fetch(`https://i.instagram.com/api/v1/media/${mediaId}/info/`, {
            headers: MOBILE_HEADERS(),
        });
        console.log(`[PublicFetch] Mobile API status: ${mobileRes.status}`);

        if (mobileRes.ok) {
            const data = await mobileRes.json();
            if (data.items && data.items.length > 0) {
                const item = data.items[0];
                username = item.user?.username || '';
                caption = item.caption?.text || '';

                // Carousel post with multiple items
                if (item.carousel_media) {
                    for (const cm of item.carousel_media) {
                        if (cm.video_versions && cm.video_versions.length > 0) {
                            items.push({ type: 'video', url: cm.video_versions[0].url, thumbnailUrl: cm.image_versions2?.candidates?.[0]?.url || null });
                        } else if (cm.image_versions2?.candidates?.length > 0) {
                            items.push({ type: 'image', url: cm.image_versions2.candidates[0].url, thumbnailUrl: cm.image_versions2.candidates[0].url });
                        }
                    }
                    console.log(`[PublicFetch] ✓ Got ${items.length} carousel items`);
                }
                // Single video
                else if (item.video_versions && item.video_versions.length > 0) {
                    items.push({ type: 'video', url: item.video_versions[0].url, thumbnailUrl: item.image_versions2?.candidates?.[0]?.url || null });
                    console.log('[PublicFetch] ✓ Got video');
                }
                // Single image
                else if (item.image_versions2?.candidates?.length > 0) {
                    items.push({ type: 'image', url: item.image_versions2.candidates[0].url, thumbnailUrl: item.image_versions2.candidates[0].url });
                    console.log('[PublicFetch] ✓ Got image');
                }
            }
        }

        // ═══ Method 2: Web GraphQL (fallback) ═══
        if (items.length === 0) {
            console.log('[PublicFetch] Trying GraphQL fallback...');
            try {
                const gqlRes = await fetch('https://www.instagram.com/graphql/query/', {
                    method: 'POST',
                    headers: {
                        ...WEB_HEADERS(),
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Accept': '*/*',
                    },
                    body: `query_hash=b3055c01b4b222b8a47dc12b090e4e64&variables=${encodeURIComponent(JSON.stringify({
                        shortcode,
                        child_comment_count: 3,
                        fetch_comment_count: 40,
                        parent_comment_count: 24,
                        has_threaded_comments: true
                    }))}`,
                    redirect: 'manual',
                });

                if (gqlRes.ok) {
                    const gqlData = await gqlRes.json();
                    const media = gqlData?.data?.shortcode_media;
                    if (media) {
                        username = media.owner?.username || username;
                        caption = media.edge_media_to_caption?.edges?.[0]?.node?.text || caption;

                        if (media.edge_sidecar_to_children) {
                            for (const edge of media.edge_sidecar_to_children.edges || []) {
                                const node = edge.node;
                                if (node.is_video && node.video_url) {
                                    items.push({ type: 'video', url: node.video_url, thumbnailUrl: node.display_url });
                                } else {
                                    items.push({ type: 'image', url: node.display_url, thumbnailUrl: node.display_url });
                                }
                            }
                        } else if (media.is_video && media.video_url) {
                            items.push({ type: 'video', url: media.video_url, thumbnailUrl: media.display_url });
                        } else if (media.display_url) {
                            items.push({ type: 'image', url: media.display_url, thumbnailUrl: media.display_url });
                        }
                    }
                }
            } catch (e) {
                console.log('[PublicFetch] GraphQL error:', e.message);
            }
        }

        // ═══ Method 3: Embed page scrape (works without authentication) ═══
        // Instagram's /embed/captioned/ endpoint is publicly accessible — it's the
        // fallback that lets us get public posts when the auth-gated APIs above refuse.
        if (items.length === 0) {
            console.log('[PublicFetch] Trying embed page scrape...');
            const embedHeaders = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'sec-fetch-mode': 'navigate',
            };
            // Try each URL flavour — Instagram serves the same content under /p/, /reel/, /tv/
            for (const urlType of ['p', 'reel', 'tv']) {
                try {
                    const embedUrl = `https://www.instagram.com/${urlType}/${shortcode}/embed/captioned/`;
                    const embedRes = await fetch(embedUrl, { headers: embedHeaders, redirect: 'manual' });
                    if (!embedRes.ok) {
                        console.log(`[PublicFetch] Embed /${urlType}/ status: ${embedRes.status}`);
                        continue;
                    }
                    const html = await embedRes.text();
                    if (!html || html.length < 500) continue;

                    if (html.includes('EmbedIsBroken') || html.includes('The link to this photo or video may be broken')) {
                        console.log(`[PublicFetch] Embed is broken/disabled for /${urlType}/`);
                        embedDisabled = true;
                        continue;
                    }

                    // Unescape/decode quotes, slashes, and characters in the HTML first
                    const decodedHtml = html
                        .replace(/\\+/g, '\\')
                        .replace(/\\u002F/gi, '/')
                        .replace(/\\u0026/gi, '&')
                        .replace(/\\\\\//g, '/')
                        .replace(/\\\//g, '/')
                        .replace(/\\"/g, '"');

                    // Carousels first: look for the embedded "edge_sidecar_to_children" blob
                    const sidecarMatch = decodedHtml.match(/"edge_sidecar_to_children"\s*:\s*\{\s*"edges"\s*:\s*(\[[\s\S]*?\])\s*\}/);
                    if (sidecarMatch) {
                        try {
                            const edges = JSON.parse(sidecarMatch[1]);
                            for (const edge of edges) {
                                const node = edge.node || edge;
                                if (node?.is_video && node?.video_url) {
                                    items.push({ type: 'video', url: node.video_url, thumbnailUrl: node.display_url || '' });
                                } else if (node?.display_url) {
                                    items.push({ type: 'image', url: node.display_url, thumbnailUrl: node.display_url });
                                }
                            }
                            if (items.length) console.log(`[PublicFetch] ✓ Got ${items.length} carousel items from embed`);
                        } catch (e) {
                            console.log('[PublicFetch] Embed carousel parse error:', e.message);
                        }
                    }

                    // Single video: try og:video / inline video_url
                    if (items.length === 0) {
                        const ogVideoSec = decodedHtml.match(/property=["']og:video:secure_url["']\s+content=["']([^"']+)["']/i);
                        const ogVideo = decodedHtml.match(/property=["']og:video["']\s+content=["']([^"']+)["']/i);
                        const inlineVideoUrl = decodedHtml.match(/"video_url"\s*:\s*"([^"]+)"/);
                        const videoUrl = ogVideoSec?.[1] || ogVideo?.[1] || (inlineVideoUrl ? inlineVideoUrl[1] : null);
                        if (videoUrl) {
                            const ogImage = decodedHtml.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i);
                            const inlineDisplay = decodedHtml.match(/"display_url"\s*:\s*"([^"]+)"/);
                            const thumb = ogImage?.[1] || (inlineDisplay ? inlineDisplay[1] : null);
                            items.push({ type: 'video', url: videoUrl, thumbnailUrl: thumb });
                            console.log('[PublicFetch] ✓ Got video from embed');
                        }
                    }

                    // Single image: og:image
                    if (items.length === 0) {
                        const ogImage = decodedHtml.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i);
                        const inlineDisplay = decodedHtml.match(/"display_url"\s*:\s*"([^"]+)"/);
                        const imageUrl = ogImage?.[1] || (inlineDisplay ? inlineDisplay[1] : null);
                        if (imageUrl) {
                            items.push({ type: 'image', url: imageUrl, thumbnailUrl: imageUrl });
                            console.log('[PublicFetch] ✓ Got image from embed');
                        }
                    }

                    // Pick up username / caption if we don't have them
                    if (!username) {
                        const userMatch = decodedHtml.match(/"username"\s*:\s*"([^"]+)"/);
                        if (userMatch) username = userMatch[1];
                    }
                    if (!caption) {
                        const capMatch = decodedHtml.match(/"caption"\s*:\s*"((?:[^"\\]|\\.)*)"/);
                        if (capMatch) caption = capMatch[1];
                    }

                    if (items.length > 0) break;
                } catch (e) {
                    console.log(`[PublicFetch] Embed /${urlType}/ error:`, e.message);
                }
            }
        }

        if (items.length === 0) {
            console.log('[PublicFetch] ✗ All methods failed');
            if (embedDisabled && !igSession.sessionid) {
                return res.status(403).json({
                    error: "This post has embedding disabled by the creator (or is restricted). Please use the 'Private & Exclusive' tab with your Instagram Session ID to download it.",
                    needsLogin: true
                });
            }
            return res.status(404).json({
                error: igSession.sessionid
                    ? 'Could not extract media. The post might be from a private account, or your session expired.'
                    : 'Could not fetch this post. Instagram may have rate-limited the request — try again in a minute, or use the Private & Exclusive tab with a session ID if it\'s a private/restricted post.',
            });
        }

        return res.json({
            success: true,
            items,
            caption,
            username,
            shortcode,
        });
    } catch (err) {
        console.error('[PublicFetch] Error:', err);
        return res.status(500).json({ error: 'Server error: ' + err.message });
    }
});


// ─── BULK PROFILE FETCH (Paginated via Mobile Feed API) ───────────────
// IMPORTANT: pagination uses ONE cursor format throughout. The mobile-feed API
// returns `next_max_id` (e.g. "3001234_56789"); the web profile-info endpoint
// returns a GraphQL `end_cursor` (base64). Mixing them silently breaks page 2.
// We always paginate via mobile feed and only use web_profile_info for the
// initial user_id lookup + as a 12-post fallback when mobile feed is blocked.
app.post('/api/fetch-profile', async (req, res) => {
    const { profileUrl, cursor, userId: providedUserId } = req.body;
    if (!profileUrl) {
        return res.status(400).json({ error: 'Profile URL is required' });
    }

    const usernameMatch = profileUrl.trim().match(/instagram\.com\/([A-Za-z0-9._]+)/);
    if (!usernameMatch) {
        return res.status(400).json({ error: 'Invalid Instagram profile URL' });
    }
    const profileUsername = usernameMatch[1];
    console.log(`\n[BulkFetch] Profile: @${profileUsername}, cursor: ${cursor || 'start'}, userId: ${providedUserId || 'lookup'}`);

    try {
        let userId = providedUserId || null;
        let profileData = null;
        let embeddedTimeline = null;

        // Look up user_id + profile metadata if we don't have it yet
        if (!userId) {
            const infoRes = await fetch(`https://i.instagram.com/api/v1/users/web_profile_info/?username=${profileUsername}`, {
                headers: { ...WEB_HEADERS(), 'Accept': '*/*' },
                redirect: 'manual',
            });
            console.log(`[BulkFetch] Profile info status: ${infoRes.status}`);

            if (infoRes.ok) {
                const infoData = await infoRes.json();
                const user = infoData?.data?.user;
                if (user) {
                    userId = user.id;
                    profileData = {
                        userId: user.id,
                        username: user.username,
                        fullName: user.full_name,
                        profilePic: user.profile_pic_url_hd || user.profile_pic_url,
                        postCount: user.edge_owner_to_timeline_media?.count || 0,
                        isPrivate: user.is_private,
                    };
                    embeddedTimeline = user.edge_owner_to_timeline_media || null;
                    console.log(`[BulkFetch] ✓ User: @${user.username} (ID: ${userId}), posts: ${profileData.postCount}`);

                    if (profileData.isPrivate && !igSession.sessionid) {
                        return res.status(403).json({
                            error: `@${profileData.username}'s account is private. Use the "Private & Exclusive" tab with your session ID.`,
                        });
                    }
                }
            }

            if (!userId) {
                return res.status(404).json({
                    error: `Could not find @${profileUsername}, or Instagram blocked the lookup. Try again in a minute.`,
                });
            }
        }

        // Try mobile feed for posts — works for both page 1 (no cursor) and page 2+ (with cursor).
        // Output cursor format is the same across pages, so pagination is consistent.
        const feedUrl = cursor
            ? `https://i.instagram.com/api/v1/feed/user/${userId}/?count=30&max_id=${encodeURIComponent(cursor)}`
            : `https://i.instagram.com/api/v1/feed/user/${userId}/?count=30`;
        try {
            const feedRes = await fetch(feedUrl, { headers: MOBILE_HEADERS() });
            console.log(`[BulkFetch] Mobile feed status: ${feedRes.status}`);

            if (feedRes.ok) {
                const feedData = await feedRes.json();
                const feedItems = feedData.items || [];
                if (feedItems.length > 0) {
                    const items = feedItems.map(item => {
                        const isVideo = !!(item.video_versions || item.media_type === 2);
                        // Full-res media URL for direct download
                        const mediaUrl = isVideo
                            ? (item.video_versions?.[0]?.url || '')
                            : (item.image_versions2?.candidates?.[0]?.url || '');
                        return {
                            shortcode: item.code,
                            id: item.id,
                            type: isVideo ? 'video' : 'image',
                            hasVideoUrl: isVideo && !!(item.video_versions?.[0]?.url),
                            thumbnailUrl: item.image_versions2?.candidates?.[1]?.url || item.image_versions2?.candidates?.[0]?.url || '',
                            mediaUrl,
                            caption: item.caption?.text || '',
                            likeCount: item.like_count || 0,
                            commentCount: item.comment_count || 0,
                            isCarousel: !!item.carousel_media,
                            timestamp: item.taken_at,
                        };
                    });

                    const nextMaxId = feedData.next_max_id || null;
                    console.log(`[BulkFetch] ✓ Feed ${cursor ? 'page 2+' : 'page 1'}: ${items.length} posts, hasNext: ${!!nextMaxId}`);

                    return res.json({
                        success: true,
                        items,
                        profileData,
                        nextCursor: nextMaxId,
                        totalPosts: profileData?.postCount || 0,
                    });
                }
            }
        } catch (e) {
            console.log('[BulkFetch] Mobile feed error:', e.message);
        }

        // Mobile feed failed. Try GraphQL query fallback for public profile pagination.
        if (cursor) {
            console.log(`[BulkFetch] Trying GraphQL fallback for cursor: ${cursor}`);
            try {
                const queryHash = 'e7e2f7790b8640edc34d53f27e5a0841';
                const variables = JSON.stringify({
                    id: userId,
                    first: 30,
                    after: cursor
                });
                const gqlUrl = `https://www.instagram.com/graphql/query/?query_hash=${queryHash}&variables=${encodeURIComponent(variables)}`;
                const gqlRes = await fetch(gqlUrl, {
                    headers: WEB_HEADERS(),
                    redirect: 'manual'
                });
                console.log(`[BulkFetch] GraphQL page fallback status: ${gqlRes.status}`);

                if (gqlRes.ok) {
                    const gqlData = await gqlRes.json();
                    const timeline = gqlData?.data?.user?.edge_owner_to_timeline_media;
                    if (timeline && timeline.edges) {
                        const items = timeline.edges.map(edge => {
                            const node = edge.node;
                            const mediaUrl = (node.is_video && node.video_url)
                                ? node.video_url
                                : (node.display_url || node.thumbnail_src || '');
                            return {
                                shortcode: node.shortcode,
                                id: node.id,
                                type: node.is_video ? 'video' : 'image',
                                hasVideoUrl: node.is_video && !!node.video_url,
                                thumbnailUrl: node.thumbnail_src || node.display_url,
                                mediaUrl,
                                caption: node.edge_media_to_caption?.edges?.[0]?.node?.text || '',
                                likeCount: node.edge_liked_by?.count || 0,
                                commentCount: node.edge_media_to_comment?.count || 0,
                                isCarousel: node.__typename === 'GraphSidecar',
                                timestamp: node.taken_at_timestamp,
                            };
                        });
                        const nextCursor = timeline.page_info?.has_next_page ? timeline.page_info?.end_cursor : null;
                        console.log(`[BulkFetch] ✓ GraphQL fallback: ${items.length} posts, nextCursor: ${nextCursor}`);
                        return res.json({
                            success: true,
                            items,
                            profileData,
                            nextCursor,
                            totalPosts: profileData?.postCount || 0,
                            paginationLimited: false,
                        });
                    }
                }
            } catch (gqlErr) {
                console.log('[BulkFetch] GraphQL fallback error:', gqlErr.message);
            }
        }

        // Mobile feed failed. For page 1 we can still return the 12 posts embedded in
        // web_profile_info's response — but pagination beyond that requires auth.
        if (!cursor && embeddedTimeline?.edges?.length > 0) {
            const items = embeddedTimeline.edges.map(edge => {
                const node = edge.node;
                // For web fallback, display_url is typically the highest quality image
                const mediaUrl = (node.is_video && node.video_url)
                    ? node.video_url
                    : (node.display_url || node.thumbnail_src || '');
                return {
                    shortcode: node.shortcode,
                    id: node.id,
                    type: node.is_video ? 'video' : 'image',
                    hasVideoUrl: node.is_video && !!node.video_url,
                    thumbnailUrl: node.thumbnail_src || node.display_url,
                    mediaUrl,
                    caption: node.edge_media_to_caption?.edges?.[0]?.node?.text || '',
                    likeCount: node.edge_liked_by?.count || 0,
                    commentCount: node.edge_media_to_comment?.count || 0,
                    isCarousel: node.__typename === 'GraphSidecar',
                    timestamp: node.taken_at_timestamp,
                };
            });

            const pageInfo = embeddedTimeline.page_info || {};
            const nextCursor = pageInfo.has_next_page ? pageInfo.end_cursor : null;
            const paginationLimited = !igSession.sessionid && !nextCursor && (profileData?.postCount || 0) > items.length;
            console.log(`[BulkFetch] ✓ Web-info fallback: ${items.length} posts, nextCursor=${nextCursor}, paginationLimited=${paginationLimited}`);

            return res.json({
                success: true,
                items,
                profileData,
                nextCursor,
                totalPosts: profileData?.postCount || 0,
                paginationLimited,
            });
        }

        // Page 2+ failed — be honest about why.
        return res.status(404).json({
            error: igSession.sessionid
                ? 'Could not fetch more posts. Instagram blocked the request — try again in a minute.'
                : 'Instagram blocks paginating past the first 12 posts without a session. Click Login (top right) and paste your session ID to load the rest.',
        });
    } catch (err) {
        console.error('[BulkFetch] Error:', err);
        return res.status(500).json({ error: 'Server error: ' + err.message });
    }
});

// ─── FETCH SINGLE POST MEDIA (for bulk download) ─────────────────────
app.post('/api/fetch-post-media', async (req, res) => {
    const { shortcode } = req.body;
    if (!shortcode) {
        return res.status(400).json({ error: 'Shortcode is required' });
    }

    const mediaId = shortcodeToMediaId(shortcode);
    console.log(`\n[PostMedia] Shortcode: ${shortcode} → Media ID: ${mediaId}`);

    let items = [];

    try {
        // ═══ Method 1: Mobile API (most reliable when not rate-limited) ═══
        try {
            const mobileRes = await fetch(`https://i.instagram.com/api/v1/media/${mediaId}/info/`, {
                headers: MOBILE_HEADERS(),
            });
            console.log(`[PostMedia] Mobile API status: ${mobileRes.status}`);

            if (mobileRes.ok) {
                const data = await mobileRes.json();
                if (data.items && data.items.length > 0) {
                    const item = data.items[0];

                    if (item.carousel_media) {
                        for (const cm of item.carousel_media) {
                            if (cm.video_versions && cm.video_versions.length > 0) {
                                items.push({ type: 'video', url: cm.video_versions[0].url });
                            } else if (cm.image_versions2?.candidates?.length > 0) {
                                items.push({ type: 'image', url: cm.image_versions2.candidates[0].url });
                            }
                        }
                    } else if (item.video_versions && item.video_versions.length > 0) {
                        items.push({ type: 'video', url: item.video_versions[0].url });
                    } else if (item.image_versions2?.candidates?.length > 0) {
                        items.push({ type: 'image', url: item.image_versions2.candidates[0].url });
                    }
                }
            }
        } catch (e) {
            console.log('[PostMedia] Mobile API error:', e.message);
        }

        // ═══ Method 2: Web GraphQL (fallback) ═══
        if (items.length === 0) {
            console.log('[PostMedia] Trying GraphQL fallback...');
            try {
                const gqlRes = await fetch('https://www.instagram.com/graphql/query/', {
                    method: 'POST',
                    headers: {
                        ...WEB_HEADERS(),
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Accept': '*/*',
                    },
                    body: `query_hash=b3055c01b4b222b8a47dc12b090e4e64&variables=${encodeURIComponent(JSON.stringify({
                        shortcode,
                        child_comment_count: 3,
                        fetch_comment_count: 40,
                        parent_comment_count: 24,
                        has_threaded_comments: true
                    }))}`,
                    redirect: 'manual',
                });
                console.log(`[PostMedia] GraphQL status: ${gqlRes.status}`);

                if (gqlRes.ok) {
                    const gqlData = await gqlRes.json();
                    const media = gqlData?.data?.shortcode_media;
                    if (media) {
                        if (media.edge_sidecar_to_children) {
                            for (const edge of media.edge_sidecar_to_children.edges || []) {
                                const node = edge.node;
                                if (node.is_video && node.video_url) {
                                    items.push({ type: 'video', url: node.video_url });
                                } else if (node.display_url) {
                                    items.push({ type: 'image', url: node.display_url });
                                }
                            }
                        } else if (media.is_video && media.video_url) {
                            items.push({ type: 'video', url: media.video_url });
                        } else if (media.display_url) {
                            items.push({ type: 'image', url: media.display_url });
                        }
                        if (items.length > 0) console.log(`[PostMedia] ✓ Got ${items.length} items from GraphQL`);
                    }
                }
            } catch (e) {
                console.log('[PostMedia] GraphQL error:', e.message);
            }
        }

        // ═══ Method 3: Embed page scrape (works without authentication) ═══
        if (items.length === 0) {
            console.log('[PostMedia] Trying embed page scrape...');
            const embedHeaders = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'sec-fetch-mode': 'navigate',
            };

            for (const urlType of ['p', 'reel', 'tv']) {
                try {
                    const embedUrl = `https://www.instagram.com/${urlType}/${shortcode}/embed/captioned/`;
                    const embedRes = await fetch(embedUrl, { headers: embedHeaders, redirect: 'manual' });
                    if (!embedRes.ok) {
                        console.log(`[PostMedia] Embed /${urlType}/ status: ${embedRes.status}`);
                        continue;
                    }
                    const html = await embedRes.text();
                    if (!html || html.length < 500) continue;

                    // Unescape/decode quotes, slashes, and characters in the HTML first
                    const decodedHtml = html
                        .replace(/\\+/g, '\\')
                        .replace(/\\u002F/gi, '/')
                        .replace(/\\u0026/gi, '&')
                        .replace(/\\\\\//g, '/')
                        .replace(/\\\//g, '/')
                        .replace(/\\"/g, '"');

                    // Carousels: look for edge_sidecar_to_children
                    const sidecarMatch = decodedHtml.match(/"edge_sidecar_to_children"\s*:\s*\{\s*"edges"\s*:\s*(\[[\s\S]*?\])\s*\}/);
                    if (sidecarMatch) {
                        try {
                            const edges = JSON.parse(sidecarMatch[1]);
                            for (const edge of edges) {
                                const node = edge.node || edge;
                                if (node?.is_video && node?.video_url) {
                                    items.push({ type: 'video', url: node.video_url });
                                } else if (node?.display_url) {
                                    items.push({ type: 'image', url: node.display_url });
                                }
                            }
                            if (items.length) console.log(`[PostMedia] ✓ Got ${items.length} carousel items from embed`);
                        } catch (e) {
                            console.log('[PostMedia] Embed carousel parse error:', e.message);
                        }
                    }

                    // Single video
                    if (items.length === 0) {
                        const ogVideoSec = decodedHtml.match(/property=["']og:video:secure_url["']\s+content=["']([^"']+)["']/i);
                        const ogVideo = decodedHtml.match(/property=["']og:video["']\s+content=["']([^"']+)["']/i);
                        const inlineVideoUrl = decodedHtml.match(/"video_url"\s*:\s*"([^"]+)"/);
                        const videoUrl = ogVideoSec?.[1] || ogVideo?.[1] || (inlineVideoUrl ? inlineVideoUrl[1] : null);
                        if (videoUrl) {
                            items.push({ type: 'video', url: videoUrl });
                            console.log('[PostMedia] ✓ Got video from embed');
                        }
                    }

                    // Single image
                    if (items.length === 0) {
                        const ogImage = decodedHtml.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i);
                        const inlineDisplay = decodedHtml.match(/"display_url"\s*:\s*"([^"]+)"/);
                        const imageUrl = ogImage?.[1] || (inlineDisplay ? inlineDisplay[1] : null);
                        if (imageUrl) {
                            items.push({ type: 'image', url: imageUrl });
                            console.log('[PostMedia] ✓ Got image from embed');
                        }
                    }

                    if (items.length > 0) break;
                } catch (e) {
                    console.log(`[PostMedia] Embed /${urlType}/ error:`, e.message);
                }
            }
        }

        if (items.length === 0) {
            console.log('[PostMedia] ✗ All methods failed');
            return res.status(404).json({ error: 'Could not fetch media for this post. Try logging in with your session ID.' });
        }

        console.log(`[PostMedia] ✓ Returning ${items.length} media items`);
        return res.json({ success: true, items });
    } catch (err) {
        console.error('[PostMedia] Error:', err);
        return res.status(500).json({ error: 'Server error: ' + err.message });
    }
});

// Proxy video stream (avoids CORS issues) — pick UA based on CDN host
app.get('/api/proxy-video', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'Video URL is required' });
    }

    const isInstagramCdn = /cdninstagram|instagram\.com/i.test(url);
    const ua = isInstagramCdn
        ? 'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229258)'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': ua,
                ...(isInstagramCdn ? { 'Cookie': buildCookieHeader() } : {}),
            },
        });

        if (!response.ok) {
            return res.status(response.status).json({ error: 'Failed to fetch video' });
        }

        res.setHeader('Content-Type', response.headers.get('content-type') || 'video/mp4');
        const contentLength = response.headers.get('content-length');
        if (contentLength) res.setHeader('Content-Length', contentLength);
        res.setHeader('Accept-Ranges', 'bytes');
        // Force download if ?download=true
        if (req.query.download === 'true') {
            const filename = req.query.filename || 'instasave_video.mp4';
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        }

        response.body.pipe(res);
    } catch (err) {
        console.error('Proxy error:', err);
        res.status(500).json({ error: 'Failed to proxy video' });
    }
});

// Proxy thumbnail — pick a UA that fits the CDN: Instagram CDN prefers the IG mobile UA,
// Facebook CDN serves a desktop browser UA, anything else gets a generic Chrome.
app.get('/api/proxy-image', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL required' });

    const isInstagramCdn = /(?:cdninstagram|fbcdn).+instagram/i.test(url) || /instagram\.com/i.test(url);
    const isFacebookCdn = /fbcdn\.net|facebook\.com/i.test(url) && !isInstagramCdn;
    const ua = isInstagramCdn
        ? 'Instagram 275.0.0.27.98 Android'
        : isFacebookCdn
            ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': ua,
                // Only send IG cookies to IG CDN — sending them to FB would taint the request
                ...(isInstagramCdn ? { 'Cookie': buildCookieHeader() } : {}),
            },
        });
        if (!response.ok) return res.status(response.status).end();
        res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
        if (req.query.download === 'true') {
            const filename = req.query.filename || 'omnisave_image.jpg';
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        }
        response.body.pipe(res);
    } catch (err) {
        res.status(500).end();
    }
});

// ─── STORY DOWNLOADER ─────────────────────────────────────────────────
app.post('/api/fetch-stories', async (req, res) => {
    const { url } = req.body;
    if (!url || !url.trim()) {
        return res.status(400).json({ error: 'URL is required' });
    }

    // Note: we DON'T hard-block on missing sessionid here. Instagram's stories API
    // generally rejects anonymous requests, but we try anyway so the user gets a real
    // error from Instagram rather than a preemptive "please log in" wall.
    const trimmedUrl = url.trim();
    console.log(`\n[Stories] URL: ${trimmedUrl}`);

    try {
        // Check if it's a highlight URL
        const highlightMatch = trimmedUrl.match(/stories\/highlights\/(\d+)/);
        if (highlightMatch) {
            const highlightId = highlightMatch[1];
            console.log(`[Stories] Fetching highlight: ${highlightId}`);

            const hlRes = await fetch(
                `https://i.instagram.com/api/v1/feed/reels_media/?reel_ids=highlight%3A${highlightId}`,
                { headers: MOBILE_HEADERS() }
            );
            console.log(`[Stories] Highlight API status: ${hlRes.status}`);

            if (hlRes.ok) {
                const hlData = await hlRes.json();
                const reel = hlData.reels_media?.[0] || hlData.reels?.[`highlight:${highlightId}`];
                if (reel && reel.items && reel.items.length > 0) {
                    const items = reel.items.map((item, i) => {
                        const isVideo = item.media_type === 2 || !!item.video_versions;
                        return {
                            type: isVideo ? 'video' : 'image',
                            url: isVideo
                                ? item.video_versions[0].url
                                : item.image_versions2.candidates[0].url,
                            thumbnailUrl: item.image_versions2?.candidates?.[0]?.url || null,
                            timestamp: item.taken_at,
                        };
                    });
                    console.log(`[Stories] ✓ Got ${items.length} highlight items`);
                    return res.json({
                        success: true,
                        type: 'highlight',
                        title: reel.title || 'Highlight',
                        username: reel.user?.username || '',
                        profilePic: reel.user?.profile_pic_url || '',
                        items,
                    });
                }
            }
            return res.status(404).json({ error: 'Could not fetch highlight. It may have been deleted or you don\'t have access.' });
        }

        // Regular story URL: /stories/username/ or /stories/username/storyId/
        const storyMatch = trimmedUrl.match(/stories\/([A-Za-z0-9._]+)/);
        if (!storyMatch) {
            return res.status(400).json({ error: 'Invalid URL. Use a story link (instagram.com/stories/username/) or highlight link (instagram.com/stories/highlights/id/).' });
        }

        const storyUsername = storyMatch[1];
        if (storyUsername === 'highlights') {
            return res.status(400).json({ error: 'Invalid highlight URL. Use format: instagram.com/stories/highlights/12345/' });
        }
        console.log(`[Stories] Fetching stories for @${storyUsername}`);

        // Get user ID from username
        const userInfoRes = await fetch(`https://i.instagram.com/api/v1/users/web_profile_info/?username=${storyUsername}`, {
            headers: { ...WEB_HEADERS(), 'Accept': '*/*' },
            redirect: 'manual',
        });

        if (!userInfoRes.ok) {
            return res.status(404).json({ error: `Could not find user @${storyUsername}.` });
        }

        const userInfo = await userInfoRes.json();
        const userId = userInfo?.data?.user?.id;
        if (!userId) {
            return res.status(404).json({ error: `Could not find user @${storyUsername}.` });
        }

        // Fetch stories
        const storyRes = await fetch(
            `https://i.instagram.com/api/v1/feed/reels_media/?reel_ids=${userId}`,
            { headers: MOBILE_HEADERS() }
        );
        console.log(`[Stories] Story API status: ${storyRes.status}`);

        // Non-OK response (401/403/etc) — Instagram refused. Auth is almost certainly the cause.
        if (!storyRes.ok) {
            return res.status(401).json({
                error: igSession.sessionid
                    ? 'Instagram refused the story request — your session may have expired. Try logging out and back in.'
                    : 'Instagram requires a logged-in session to view stories. Click Login (top right) and paste your session ID.',
                needsLogin: !igSession.sessionid,
            });
        }

        const storyData = await storyRes.json();
        const reel = storyData.reels_media?.[0] || storyData.reels?.[userId];
        if (reel && reel.items && reel.items.length > 0) {
            const items = reel.items.map(item => {
                const isVideo = item.media_type === 2 || !!item.video_versions;
                return {
                    type: isVideo ? 'video' : 'image',
                    url: isVideo
                        ? item.video_versions[0].url
                        : item.image_versions2.candidates[0].url,
                    thumbnailUrl: item.image_versions2?.candidates?.[0]?.url || null,
                    timestamp: item.taken_at,
                };
            });
            console.log(`[Stories] ✓ Got ${items.length} stories for @${storyUsername}`);
            return res.json({
                success: true,
                type: 'story',
                username: storyUsername,
                profilePic: reel.user?.profile_pic_url || '',
                items,
            });
        }

        // Got 200 OK but empty payload. WITHOUT a session this is Instagram silently refusing
        // (it never returns real data to anonymous callers). Don't tell the user "no stories"
        // when the truth is "we weren't allowed to look".
        if (!igSession.sessionid) {
            return res.status(401).json({
                error: 'Instagram needs a logged-in session to fetch stories. Click Login (top right) and paste your session ID — public stories aren\'t accessible without one.',
                needsLogin: true,
            });
        }

        return res.json({
            success: true,
            type: 'story',
            username: storyUsername,
            profilePic: '',
            items: [],
            message: `@${storyUsername} has no active stories right now.`,
        });
    } catch (err) {
        console.error('[Stories] Error:', err);
        return res.status(500).json({ error: 'Server error: ' + err.message });
    }
});

// ─── YOUTUBE DOWNLOADER ───────────────────────────────────────────────
const { execFile, spawn } = require('child_process');

// Bundled ffmpeg path (used for merging adaptive YouTube streams and MP3 conversion).
// Falls back to whatever's on PATH if the package isn't available.
let FFMPEG_PATH = null;
try {
    const ffPath = require('ffmpeg-static');
    if (ffPath && require('fs').existsSync(ffPath)) {
        FFMPEG_PATH = ffPath;
        console.log(`[YouTube] Using bundled ffmpeg: ${FFMPEG_PATH}`);
    }
} catch {
    console.log('[YouTube] ffmpeg-static not installed — relying on system ffmpeg in PATH');
}

function ffmpegArgs() {
    return FFMPEG_PATH ? ['--ffmpeg-location', FFMPEG_PATH] : [];
}

// Helper: find yt-dlp binary (try common names)
function getYtDlpBinary() {
    if (process.platform === 'win32') {
        const fs = require('fs');
        const path = require('path');
        
        // 1. Try local file in project directory
        const localPath = path.join(__dirname, 'yt-dlp.exe');
        if (fs.existsSync(localPath)) {
            return localPath;
        }
        
        // 2. Try scanning common AppData/Programs locations for Python script binaries
        const userProfile = process.env.USERPROFILE;
        if (userProfile) {
            // Check AppData\Roaming\Python\Python*\Scripts\yt-dlp.exe
            const roamingBase = path.join(userProfile, 'AppData', 'Roaming', 'Python');
            if (fs.existsSync(roamingBase)) {
                try {
                    const pyDirs = fs.readdirSync(roamingBase);
                    for (const pyDir of pyDirs) {
                        const target = path.join(roamingBase, pyDir, 'Scripts', 'yt-dlp.exe');
                        if (fs.existsSync(target)) {
                            return target;
                        }
                    }
                } catch (e) {}
            }
            
            // Check AppData\Local\Programs\Python\Python*\Scripts\yt-dlp.exe
            const localBase = path.join(userProfile, 'AppData', 'Local', 'Programs', 'Python');
            if (fs.existsSync(localBase)) {
                try {
                    const pyDirs = fs.readdirSync(localBase);
                    for (const pyDir of pyDirs) {
                        const target = path.join(localBase, pyDir, 'Scripts', 'yt-dlp.exe');
                        if (fs.existsSync(target)) {
                            return target;
                        }
                    }
                } catch (e) {}
            }
        }
        
        // Fall back to just 'yt-dlp.exe' if PATH is set
        return 'yt-dlp.exe';
    }
    return 'yt-dlp';
}

// POST /api/youtube/info — Extract video metadata & available formats
app.post('/api/youtube/info', async (req, res) => {
    const { url } = req.body;
    if (!url || !url.trim()) {
        return res.status(400).json({ error: 'URL is required' });
    }

    const trimmedUrl = url.trim();

    // Basic YouTube URL validation
    if (!trimmedUrl.match(/(?:youtube\.com|youtu\.be|youtube-nocookie\.com)/i)) {
        return res.status(400).json({ error: 'Please enter a valid YouTube URL.' });
    }

    console.log(`\n[YouTube] Fetching info for: ${trimmedUrl}`);

    try {
        const info = await new Promise((resolve, reject) => {
            const ytdlp = getYtDlpBinary();
            execFile(ytdlp, [
                '--dump-json',
                '--no-download',
                '--no-warnings',
                '--no-playlist',
                trimmedUrl
            ], { maxBuffer: 1024 * 1024 * 10, timeout: 30000 }, (error, stdout, stderr) => {
                if (error) {
                    console.error(`[YouTube] yt-dlp error: ${error.message}`);
                    if (stderr) console.error(`[YouTube] stderr: ${stderr}`);
                    reject(new Error(stderr || error.message));
                    return;
                }
                try {
                    resolve(JSON.parse(stdout));
                } catch (parseErr) {
                    reject(new Error('Failed to parse yt-dlp output'));
                }
            });
        });

        // Extract video metadata
        const title = info.title || 'Untitled';
        const channel = info.channel || info.uploader || 'Unknown';
        const duration = info.duration || 0;
        const thumbnail = info.thumbnail || info.thumbnails?.[info.thumbnails.length - 1]?.url || '';
        const viewCount = info.view_count || 0;
        const uploadDate = info.upload_date || '';

        // Process formats
        const allFormats = info.formats || [];
        const audioOnlyFormats = [];

        // Find best audio (used for merging with video-only streams and estimating size)
        const isAudioOnly = (fm) => fm.url && fm.acodec && fm.acodec !== 'none' && (fm.vcodec === 'none' || !fm.vcodec);
        const bestM4aAudio = allFormats
            .filter(fm => isAudioOnly(fm) && fm.ext === 'm4a')
            .sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0))[0];
        const bestWebmAudio = allFormats
            .filter(fm => isAudioOnly(fm) && fm.ext === 'webm')
            .sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0))[0];
        const bestAnyAudio = allFormats
            .filter(fm => isAudioOnly(fm))
            .sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0))[0];

        // Bucket video formats by height — prefer progressive, fall back to video-only
        const videoByHeight = new Map();

        for (const f of allFormats) {
            if (!f.url) continue;
            if (f.format_note === 'storyboard') continue;
            if (f.protocol && f.protocol.includes('m3u8')) continue;

            const vcodec = f.vcodec || 'none';
            const acodec = f.acodec || 'none';
            const hasVideo = vcodec !== 'none';
            const hasAudio = acodec !== 'none';

            if (hasVideo) {
                const height = f.height || 0;
                if (height <= 0) continue;

                const existing = videoByHeight.get(height);
                const isProgressive = hasVideo && hasAudio;

                // Prefer progressive over video-only; among same type prefer mp4
                let replace = false;
                if (!existing) {
                    replace = true;
                } else if (isProgressive && !existing.isProgressive) {
                    replace = true;
                } else if (isProgressive === existing.isProgressive) {
                    const curIsMp4 = f.ext === 'mp4';
                    const exIsMp4 = existing.f.ext === 'mp4';
                    if (curIsMp4 && !exIsMp4) replace = true;
                    else if (curIsMp4 === exIsMp4 && (f.tbr || 0) > (existing.f.tbr || 0)) replace = true;
                }

                if (replace) {
                    videoByHeight.set(height, { f, isProgressive });
                }
            } else if (hasAudio) {
                const abr = f.abr || f.tbr || 0;
                if (abr <= 0) continue;

                const label = `${Math.round(abr)}kbps`;
                const filesize = f.filesize || f.filesize_approx || null;
                const formatId = f.format_id;
                const ext = f.ext || 'm4a';

                audioOnlyFormats.push({
                    formatId,
                    type: 'audio',
                    quality: label,
                    abr: Math.round(abr),
                    ext,
                    filesize,
                    acodec: acodec.split('.')[0],
                });

                audioOnlyFormats.push({
                    formatId,
                    type: 'audio',
                    quality: label,
                    abr: Math.round(abr),
                    ext: 'mp3',
                    filesize: null,
                    acodec: 'mp3 (converted)',
                });
            }
        }

        // Build final video list — every resolution gets video+audio
        const videoAudioFormats = Array.from(videoByHeight.entries()).map(([height, { f, isProgressive }]) => {
            const vcodec = (f.vcodec || '').split('.')[0];
            const videoSize = f.filesize || f.filesize_approx || 0;

            if (isProgressive) {
                return {
                    formatId: f.format_id,
                    type: 'video+audio',
                    quality: `${height}p`,
                    height,
                    ext: f.ext || 'mp4',
                    filesize: videoSize || null,
                    fps: f.fps || null,
                    vcodec,
                    acodec: (f.acodec || '').split('.')[0],
                    needsMerge: false,
                };
            }

            // Video-only: pair with same-container audio so merge produces a clean container.
            // CRITICAL: the fallback selector MUST repeat the video format ID — otherwise yt-dlp's
            // `A/B` operator falls back to just-audio if the A combo can't match.
            const videoExt = f.ext || 'mp4';
            let audioPrimary, outputExt, audioForSize;
            if (videoExt === 'mp4') {
                audioPrimary = 'bestaudio[ext=m4a]';
                outputExt = 'mp4';
                audioForSize = bestM4aAudio || bestAnyAudio;
            } else if (videoExt === 'webm') {
                audioPrimary = 'bestaudio[ext=webm]';
                outputExt = 'webm';
                audioForSize = bestWebmAudio || bestAnyAudio;
            } else {
                audioPrimary = 'bestaudio';
                outputExt = 'mkv';
                audioForSize = bestAnyAudio;
            }
            const audioSize = audioForSize ? (audioForSize.filesize || audioForSize.filesize_approx || 0) : 0;
            const mergedSize = videoSize && audioSize ? videoSize + audioSize : null;

            return {
                formatId: `${f.format_id}+${audioPrimary}/${f.format_id}+bestaudio`,
                type: 'video+audio',
                quality: `${height}p`,
                height,
                ext: outputExt,
                filesize: mergedSize,
                fps: f.fps || null,
                vcodec,
                acodec: (audioForSize?.acodec || 'aac').split('.')[0],
                needsMerge: true,
            };
        });

        // Dedupe audio (same label+ext) and sort
        const seenAudio = new Set();
        const dedupedAudio = audioOnlyFormats.filter(a => {
            const key = `${a.quality}-${a.ext}`;
            if (seenAudio.has(key)) return false;
            seenAudio.add(key);
            return true;
        });

        videoAudioFormats.sort((a, b) => b.height - a.height);
        dedupedAudio.sort((a, b) => b.abr - a.abr);

        console.log(`[YouTube] ✓ "${title}" — ${videoAudioFormats.length} video, ${dedupedAudio.length} audio`);

        return res.json({
            success: true,
            title,
            channel,
            duration,
            thumbnail,
            viewCount,
            uploadDate,
            videoAudioFormats,
            audioOnlyFormats: dedupedAudio,
        });

    } catch (err) {
        console.error('[YouTube] Error:', err.message);
        const msg = err.message || '';
        if (msg.includes('is not recognized') || msg.includes('not found') || msg.includes('ENOENT')) {
            return res.status(500).json({
                error: 'yt-dlp is not installed on this server. Please install it: pip install yt-dlp'
            });
        }
        if (msg.includes('Video unavailable') || msg.includes('Private video')) {
            return res.status(404).json({ error: 'This video is unavailable or private.' });
        }
        return res.status(500).json({ error: 'Failed to fetch video info. ' + msg.substring(0, 200) });
    }
});

// GET /api/youtube/download — Stream a specific format
app.get('/api/youtube/download', (req, res) => {
    const { url, formatId, filename, audioOnly } = req.query;

    if (!url || !formatId) {
        return res.status(400).json({ error: 'url and formatId are required' });
    }

    console.log(`\n[YouTube DL] Downloading format ${formatId} from ${url}`);

    const ytdlp = getYtDlpBinary();
    const dlFilename = filename || `omnisave_youtube_${formatId}.mp4`;
    const ext = dlFilename.split('.').pop() || 'mp4';
    const mimeTypes = {
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'mkv': 'video/x-matroska',
        'm4a': 'audio/mp4',
        'opus': 'audio/ogg',
        'ogg': 'audio/ogg',
        'mp3': 'audio/mpeg',
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    // Merged formats (contain '+') need ffmpeg to mux — pipe to stdout via temp file
    const needsMerge = formatId.includes('+');

    if (needsMerge) {
        const fs = require('fs');
        const os = require('os');
        const tempBase = path.join(os.tmpdir(), `omnisave-yt-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const tempTemplate = `${tempBase}.%(ext)s`;

        // Let yt-dlp pick the container based on input streams.
        // Forcing --merge-output-format mp4 fails (or silently drops audio) when streams aren't mp4-compatible.
        const args = [
            '-f', formatId,
            '--no-playlist',
            '--no-warnings',
            ...ffmpegArgs(),
            '-o', tempTemplate,
            url
        ];

        const child = spawn(ytdlp, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stderrBuf = '';
        let clientClosed = false;

        child.stderr.on('data', (data) => {
            const msg = data.toString();
            stderrBuf += msg;
            if (!msg.includes('[download]')) {
                console.error(`[YouTube DL] stderr: ${msg.trim()}`);
            }
        });

        child.on('error', (err) => {
            console.error(`[YouTube DL] spawn error: ${err.message}`);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Download failed: ' + err.message });
            }
        });

        child.on('close', (code) => {
            if (clientClosed) {
                cleanupTempFiles(tempBase);
                return;
            }
            if (code !== 0) {
                console.error(`[YouTube DL] yt-dlp exited with code ${code}`);
                cleanupTempFiles(tempBase);
                if (!res.headersSent) {
                    const msg = stderrBuf.includes('ffmpeg')
                        ? 'Merging failed — ffmpeg may not be installed on the server.'
                        : 'Download failed';
                    res.status(500).json({ error: msg });
                }
                return;
            }

            const downloadedPath = findTempFile(tempBase);
            if (!downloadedPath) {
                cleanupTempFiles(tempBase);
                if (!res.headersSent) {
                    res.status(500).json({
                        error: 'Merge failed — no output file produced. Ensure ffmpeg is installed and on PATH.'
                    });
                }
                return;
            }

            try {
                const stat = fs.statSync(downloadedPath);
                // The merge container may differ from what the client requested (e.g., webm vs mp4).
                // Use the actual extension so the browser saves a valid file.
                const actualExt = path.extname(downloadedPath).slice(1).toLowerCase();
                const finalContentType = mimeTypes[actualExt] || contentType;
                const finalFilename = (actualExt && !dlFilename.toLowerCase().endsWith('.' + actualExt))
                    ? dlFilename.replace(/\.[^.]+$/, '') + '.' + actualExt
                    : dlFilename;

                res.setHeader('Content-Type', finalContentType);
                res.setHeader('Content-Disposition', `attachment; filename="${finalFilename}"`);
                res.setHeader('Content-Length', stat.size);

                const stream = fs.createReadStream(downloadedPath);
                stream.pipe(res);
                const finalize = () => cleanupTempFiles(tempBase);
                stream.on('close', finalize);
                stream.on('error', finalize);
            } catch (e) {
                console.error(`[YouTube DL] stream error: ${e.message}`);
                cleanupTempFiles(tempBase);
                if (!res.headersSent) res.status(500).json({ error: 'Failed to stream file' });
            }
        });

        req.on('close', () => {
            clientClosed = true;
            if (!child.killed) child.kill('SIGTERM');
        });

        return;
    }

    // Single-stream (progressive or audio-only) — pipe yt-dlp stdout directly
    const args = [
        '-f', formatId,
        '--no-playlist',
        '--no-warnings',
        '-o', '-',
        url
    ];

    if (audioOnly === 'true' && dlFilename.endsWith('.mp3')) {
        // MP3 conversion needs ffmpeg too
        args.push('-x', '--audio-format', 'mp3', ...ffmpegArgs());
    }

    const child = spawn(ytdlp, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${dlFilename}"`);

    child.stdout.pipe(res);

    child.stderr.on('data', (data) => {
        const msg = data.toString();
        if (!msg.includes('[download]')) {
            console.error(`[YouTube DL] stderr: ${msg.trim()}`);
        }
    });

    child.on('error', (err) => {
        console.error(`[YouTube DL] spawn error: ${err.message}`);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Download failed: ' + err.message });
        }
    });

    child.on('close', (code) => {
        if (code !== 0 && !res.headersSent) {
            console.error(`[YouTube DL] yt-dlp exited with code ${code}`);
            res.status(500).json({ error: 'Download failed' });
        }
    });

    req.on('close', () => {
        if (!child.killed) child.kill('SIGTERM');
    });
});

// ─── Progress-aware YouTube download (SSE prepare + token file serve) ───
const crypto = require('crypto');
const pendingDownloads = new Map(); // token -> { path, tempBase, filename, contentType, size, createdAt }

// Garbage-collect stale prepared downloads every minute
setInterval(() => {
    const now = Date.now();
    for (const [token, info] of pendingDownloads.entries()) {
        if (now - info.createdAt > 10 * 60 * 1000) {
            cleanupTempFiles(info.tempBase);
            pendingDownloads.delete(token);
            console.log(`[YouTube] Cleaned expired download: ${token}`);
        }
    }
}, 60 * 1000).unref();

// GET /api/youtube/prepare — Run yt-dlp, stream progress via SSE, hand back a token when ready
app.get('/api/youtube/prepare', (req, res) => {
    const { url, formatId, filename, audioOnly } = req.query;
    if (!url || !formatId) {
        res.status(400).json({ error: 'url and formatId are required' });
        return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const sendEvent = (event, data) => {
        if (res.writableEnded) return;
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const fs = require('fs');
    const os = require('os');
    const ytdlp = getYtDlpBinary();
    const dlFilename = filename || `omnisave_youtube.mp4`;
    const tempBase = path.join(os.tmpdir(), `omnisave-yt-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const tempTemplate = `${tempBase}.%(ext)s`;

    const args = [
        '-f', formatId,
        '--no-playlist',
        '--no-warnings',
        '--newline',
        ...ffmpegArgs(),
        '-o', tempTemplate,
        url
    ];
    if (audioOnly === 'true' && dlFilename.endsWith('.mp3')) {
        args.push('-x', '--audio-format', 'mp3');
    }

    console.log(`[YouTube Prepare] format=${formatId}`);
    const child = spawn(ytdlp, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderrBuf = '';
    let clientClosed = false;
    let lastPercent = -1;
    let phase = 'starting';

    const handleProgressText = (text) => {
        // [download]  23.4% of 124.50MiB at 1.23MiB/s ETA 01:23
        const re = /\[download\]\s+(\d+(?:\.\d+)?)%(?:\s+of\s+~?\s*(\S+))?(?:\s+at\s+(\S+))?(?:\s+ETA\s+(\S+))?/g;
        let m;
        while ((m = re.exec(text)) !== null) {
            const percent = parseFloat(m[1]);
            // Throttle to ~1% steps so we don't spam the client
            if (Math.abs(percent - lastPercent) >= 0.5 || percent === 100) {
                lastPercent = percent;
                phase = 'downloading';
                sendEvent('progress', {
                    phase,
                    percent,
                    totalSize: m[2] || '',
                    speed: m[3] || '',
                    eta: m[4] || '',
                });
            }
        }
        if ((text.includes('[Merger]') || text.includes('[ffmpeg]') || text.includes('[ExtractAudio]')) && phase !== 'merging') {
            phase = 'merging';
            sendEvent('progress', { phase: 'merging' });
        }
    };

    child.stdout.on('data', d => handleProgressText(d.toString()));
    child.stderr.on('data', (d) => {
        const text = d.toString();
        stderrBuf += text;
        handleProgressText(text);
        if (!text.includes('[download]') && !/^\s*\d+(\.\d+)?%/.test(text)) {
            console.error(`[YouTube Prepare] stderr: ${text.trim()}`);
        }
    });

    child.on('error', (err) => {
        sendEvent('fail', { error: 'Spawn failed: ' + err.message });
        res.end();
    });

    child.on('close', (code) => {
        if (clientClosed) {
            cleanupTempFiles(tempBase);
            return;
        }
        if (code !== 0) {
            cleanupTempFiles(tempBase);
            const errorMsg = stderrBuf.includes('ffmpeg') && !FFMPEG_PATH
                ? 'Merge failed — ffmpeg is not available.'
                : stderrBuf.includes('Unavailable') || stderrBuf.includes('Private video')
                    ? 'This video is unavailable or private.'
                    : `Download failed (exit ${code})`;
            sendEvent('fail', { error: errorMsg });
            res.end();
            return;
        }

        const downloadedPath = findTempFile(tempBase);
        if (!downloadedPath) {
            cleanupTempFiles(tempBase);
            sendEvent('fail', { error: 'Output file not found after download.' });
            res.end();
            return;
        }

        const stat = fs.statSync(downloadedPath);
        const actualExt = path.extname(downloadedPath).slice(1).toLowerCase();
        const mimeTypes = {
            mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska',
            m4a: 'audio/mp4', opus: 'audio/ogg', ogg: 'audio/ogg', mp3: 'audio/mpeg',
        };
        const contentType = mimeTypes[actualExt] || 'application/octet-stream';
        const finalFilename = (actualExt && !dlFilename.toLowerCase().endsWith('.' + actualExt))
            ? dlFilename.replace(/\.[^.]+$/, '') + '.' + actualExt
            : dlFilename;

        const token = crypto.randomBytes(16).toString('hex');
        pendingDownloads.set(token, {
            path: downloadedPath,
            tempBase,
            filename: finalFilename,
            contentType,
            size: stat.size,
            createdAt: Date.now(),
        });

        console.log(`[YouTube Prepare] Ready: ${token} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
        sendEvent('ready', { token, filename: finalFilename, size: stat.size });
        res.end();
    });

    req.on('close', () => {
        clientClosed = true;
        if (!child.killed) child.kill('SIGTERM');
    });
});

// Shared handler: serve a prepared file (by token) as a native download.
// Used by both the YouTube and Reddit progress flows.
function serveTokenFile(req, res) {
    const fs = require('fs');
    const info = pendingDownloads.get(req.params.token);
    if (!info) {
        return res.status(404).json({ error: 'Download not found or expired. Please request the download again.' });
    }

    res.setHeader('Content-Type', info.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${info.filename}"`);
    res.setHeader('Content-Length', info.size);

    const stream = fs.createReadStream(info.path);
    stream.pipe(res);
    const finalize = () => {
        cleanupTempFiles(info.tempBase);
        pendingDownloads.delete(req.params.token);
    };
    stream.on('close', finalize);
    stream.on('error', finalize);
}

// GET /api/youtube/file/:token — Serve the prepared file as a native download
app.get('/api/youtube/file/:token', serveTokenFile);
app.get('/api/reddit/file/:token', serveTokenFile);

function findTempFile(basePath) {
    const fs = require('fs');
    const path = require('path');
    const dir = path.dirname(basePath);
    const prefix = path.basename(basePath);
    try {
        const files = fs.readdirSync(dir);
        // Only consider the merged/final file — skip yt-dlp intermediates like "<prefix>.f137.mp4".
        // If we don't filter these out, readdir's alphabetical order picks the intermediate
        // (".f137.mp4" sorts before ".mp4"), which is the video-only or audio-only stream.
        const candidates = files
            .filter(f => f.startsWith(prefix + '.'))
            .filter(f => {
                const rest = f.substring(prefix.length + 1);
                if (/^f\d+\./.test(rest)) return false; // intermediate stream file
                if (rest.endsWith('.part')) return false; // partial download
                return true;
            })
            .map(f => path.join(dir, f));
        if (candidates.length === 0) return null;
        // Multiple candidates would be unusual — pick the largest (most likely the merged output).
        let best = candidates[0];
        let bestSize = -1;
        for (const p of candidates) {
            try {
                const s = fs.statSync(p).size;
                if (s > bestSize) { bestSize = s; best = p; }
            } catch {}
        }
        return best;
    } catch {
        return null;
    }
}

function cleanupTempFiles(basePath) {
    const fs = require('fs');
    const path = require('path');
    const dir = path.dirname(basePath);
    const prefix = path.basename(basePath);
    try {
        const files = fs.readdirSync(dir);
        for (const f of files) {
            if (f.startsWith(prefix)) {
                fs.unlink(path.join(dir, f), () => {});
            }
        }
    } catch {}
}

// ─── FACEBOOK DOWNLOADER ──────────────────────────────────────────────
// Strategy:
//   • Videos (any FB URL with a video): yt-dlp handles facebook.com/watch, /reel/,
//     /share/v/, fb.watch/, /{user}/videos/{id} natively. It already lives in
//     this app for YouTube — we just point it at the FB URL.
//   • Photo posts / image-only posts: fall back to scraping og:image and
//     og:video meta tags from the page, which Facebook still serves
//     unauthenticated for link-preview crawlers.
//   • Profile listing: scrape mbasic.facebook.com (the lightweight mobile UI),
//     which is the only public FB surface that survives without a session.

const FB_DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const FB_MBASIC_UA = 'Mozilla/5.0 (compatible; FacebookCrawler/1.0; +https://developers.facebook.com/docs/sharing/webmasters/crawler/)';

function isFacebookUrl(u) {
    return /(?:^|\/\/)(?:m\.|www\.|mbasic\.)?(?:facebook\.com|fb\.watch|fb\.com)\b/i.test(u);
}

function unescapeOg(s) {
    return s.replace(/&amp;/g, '&').replace(/\\u0026/g, '&').replace(/&#x2F;/gi, '/').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
}

// POST /api/facebook/fetch-post — extract media from a single FB URL.
// CONSERVATIVE strategy: only emit items from sources we trust 100%.
//   (a) yt-dlp — for video posts (single OR multi-video; we DON'T pass
//       --no-playlist so multi-video posts give one JSON line per video).
//   (b) og:image / og:video meta tags — single primary match each, for
//       photo posts when yt-dlp finds nothing.
// We deliberately do NOT scrape arbitrary `scontent.fbcdn.net` URLs from
// the page HTML, because that picks up sidebar/comment/reaction noise
// whose URLs return 404 when proxied — that was the "empty boxes" bug.
// Tradeoff: multi-image albums currently surface only the cover photo
// (the rest aren't reliably extractable without auth). Better one real
// item than one real item plus a wall of broken thumbnails.
app.post('/api/facebook/fetch-post', async (req, res) => {
    const { url } = req.body;
    if (!url || !url.trim()) {
        return res.status(400).json({ error: 'URL is required' });
    }
    const fbUrl = url.trim();
    if (!isFacebookUrl(fbUrl)) {
        return res.status(400).json({ error: 'Please paste a Facebook URL (facebook.com, fb.watch, m.facebook.com).' });
    }

    console.log(`\n[Facebook] Post fetch: ${fbUrl}`);
    const items = [];
    let caption = '';
    let username = '';

    // Dedupe by URL basename (origin + path) since FB serves the same media
    // at varying signed-query URLs over time.
    const basenameOf = (u) => {
        try { const x = new URL(u); return x.origin + x.pathname; }
        catch { return (u || '').split('?')[0]; }
    };
    const seenBases = new Set();
    const addItem = (item) => {
        if (!item || !item.url) return;
        const key = basenameOf(item.url);
        if (seenBases.has(key)) return;
        seenBases.add(key);
        items.push(item);
    };

    // ─── Method 1: yt-dlp ─────────────────────────────────────────────
    // We DON'T pass --no-playlist: for true multi-video posts FB returns
    // one JSON line per video. For ordinary single-video posts yt-dlp
    // still emits exactly one line. Either way, we never invent items.
    try {
        const stdout = await new Promise((resolve, reject) => {
            const ytdlp = getYtDlpBinary();
            execFile(ytdlp, [
                '--dump-json',
                '--no-download',
                '--no-warnings',
                fbUrl,
            ], { maxBuffer: 1024 * 1024 * 20, timeout: 30000 }, (err, out, stderr) => {
                if (err) return reject(new Error((stderr || err.message || '').split('\n').slice(0, 2).join(' | ')));
                resolve(out);
            });
        });

        for (const line of stdout.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('{')) continue;
            try {
                const info = JSON.parse(trimmed);
                const formats = info.formats || [];
                const progressive = formats
                    .filter(f => f.url && f.vcodec !== 'none' && f.acodec !== 'none')
                    .sort((a, b) => (b.height || 0) - (a.height || 0) || ((b.tbr || 0) - (a.tbr || 0)));
                const bestProgressive = progressive.find(f => f.ext === 'mp4') || progressive[0];
                const videoUrl = bestProgressive?.url || info.url;
                if (!videoUrl) continue;
                addItem({
                    type: 'video',
                    url: videoUrl,
                    thumbnailUrl: info.thumbnail || info.thumbnails?.[info.thumbnails.length - 1]?.url || null,
                });
                if (!username) username = info.uploader || info.channel || info.uploader_id || '';
                if (!caption)  caption  = info.description || info.title || '';
            } catch { /* skip malformed JSON line */ }
        }
        if (items.length > 0) {
            console.log(`[Facebook] ✓ yt-dlp got ${items.length} video(s)`);
        }
    } catch (err) {
        console.log('[Facebook] yt-dlp did not produce a video:', err.message);
    }

    // ─── Method 2: HTML scrape — og:image/og:video + targeted multi-image
    // extraction. We fetch the page once and pull TWO things from it:
    //   (a) Primary og:image / og:video for the cover media
    //   (b) Multi-image album members via FB's embedded GraphQL JSON:
    //       "image":{"uri":"..."} entries filtered to content-photo CDN
    //       buckets (t39.30808-6, t31.18172-8, t1.6435-9) only. This is
    //       narrow enough to skip sidebar/avatar noise but catches every
    //       album member that's actually in the post.
    try {
        const pageRes = await fetch(fbUrl, {
            headers: {
                // Crawler UA reliably returns the rich-preview meta block + embedded JSON
                'User-Agent': FB_MBASIC_UA,
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            redirect: 'follow',
        });
        console.log(`[Facebook] HTML scrape status: ${pageRes.status}`);

        if (pageRes.ok) {
            const html = await pageRes.text();
            const og = (prop) => {
                const re = new RegExp(`<meta\\s+(?:property|name)=["']${prop}["']\\s+content=["']([^"']+)["']`, 'i');
                const rev = new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+(?:property|name)=["']${prop}["']`, 'i');
                const m = html.match(re) || html.match(rev);
                return m ? unescapeOg(m[1]) : null;
            };

            const ogVideo = og('og:video:secure_url') || og('og:video:url') || og('og:video');
            const ogImage = og('og:image:secure_url') || og('og:image:url') || og('og:image');
            const ogTitle = og('og:title');
            const ogDesc  = og('og:description');

            // (a) Add cover image/video if yt-dlp didn't already cover it
            if (items.length === 0) {
                if (ogVideo) {
                    addItem({ type: 'video', url: ogVideo, thumbnailUrl: ogImage || null });
                    console.log('[Facebook] ✓ og:video');
                } else if (ogImage) {
                    addItem({ type: 'image', url: ogImage, thumbnailUrl: ogImage });
                    console.log('[Facebook] ✓ og:image');
                }
            }

            // (b) Multi-image album extraction — pull every "image":{"uri":"..."}
            // entry that points to FB's CONTENT-PHOTO CDN buckets. JSON URIs
            // are escape-encoded as "https:\/\/..." so we must decode \/ first.
            const decodeJsonUrl = (s) => s
                .replace(/\\u002F/gi, '/')
                .replace(/\\\//g, '/')
                .replace(/\\u0026/g, '&')
                .replace(/&amp;/g, '&');
            const imageRe = /"image"\s*:\s*\{\s*"uri"\s*:\s*"((?:[^"\\]|\\.)+)"/g;
            let albumAdded = 0;
            let im;
            while ((im = imageRe.exec(html)) !== null) {
                const url = decodeJsonUrl(im[1]);
                // Only keep URLs from FB's content-photo buckets. The narrow
                // bucket list (t39.30808-6, t31.18172-8, t1.6435-9) excludes
                // profile pics (-1), reactions, avatars, and sidebar content.
                if (!/\/t39\.30808-6\/|\/t31\.18172-8\/|\/t1\.6435-9\//.test(url)) continue;
                // Skip if already added (dedupe by URL basename via addItem)
                addItem({ type: 'image', url, thumbnailUrl: url });
                albumAdded++;
            }
            if (albumAdded > 0) {
                console.log(`[Facebook] ✓ multi-image extraction added ${albumAdded} photo candidate(s) (deduped to ${items.length} total)`);
            }

            if (!username) username = ogTitle || '';
            if (!caption)  caption  = ogDesc || ogTitle || '';
        }
    } catch (err) {
        console.log('[Facebook] HTML scrape error:', err.message);
    }

    if (items.length === 0) {
        return res.status(404).json({
            error: 'Could not extract media from this Facebook URL. The post may be private, deleted, or restricted to logged-in users.',
        });
    }

    return res.json({ success: true, items, caption, username });
});

// Shared helper used by the profile-picture + story endpoints: parse the
// rich-preview meta block off any FB URL and return the primary image/video.
async function fetchFbOgMeta(fbUrl) {
    const pageRes = await fetch(fbUrl, {
        headers: {
            // Crawler UA gets the og: rich preview reliably without auth
            'User-Agent': FB_MBASIC_UA,
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
    });
    if (!pageRes.ok) {
        return { ok: false, status: pageRes.status };
    }
    const html = await pageRes.text();
    const og = (prop) => {
        const re = new RegExp(`<meta\\s+(?:property|name)=["']${prop}["']\\s+content=["']([^"']+)["']`, 'i');
        const rev = new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+(?:property|name)=["']${prop}["']`, 'i');
        const m = html.match(re) || html.match(rev);
        return m ? unescapeOg(m[1]) : null;
    };
    return {
        ok: true,
        html,
        finalUrl: pageRes.url,
        ogImage: og('og:image:secure_url') || og('og:image:url') || og('og:image'),
        ogVideo: og('og:video:secure_url') || og('og:video:url') || og('og:video'),
        ogTitle: og('og:title'),
        ogDescription: og('og:description'),
    };
}

// POST /api/facebook/fetch-profile-picture
// Returns the highest-quality profile picture for a Facebook profile / Page.
// FB serves og:image to the crawler UA without auth for almost every public
// profile (personal users and Pages alike), so this is reliable.
app.post('/api/facebook/fetch-profile-picture', async (req, res) => {
    const { url } = req.body;
    if (!url || !url.trim()) {
        return res.status(400).json({ error: 'Profile URL or username is required' });
    }
    let raw = url.trim();

    // Accept either a full URL or a bare username
    if (!/facebook\.com|fb\.com/i.test(raw)) {
        raw = `https://www.facebook.com/${raw.replace(/^@/, '')}`;
    }
    if (!isFacebookUrl(raw)) {
        return res.status(400).json({ error: 'Please paste a Facebook profile URL or username.' });
    }

    const handleMatch = raw.match(/facebook\.com\/([^/?#]+)/i) || raw.match(/fb\.com\/([^/?#]+)/i);
    const handle = handleMatch ? handleMatch[1] : 'profile';

    console.log(`\n[Facebook] Profile-picture fetch: @${handle}`);

    try {
        const meta = await fetchFbOgMeta(`https://www.facebook.com/${encodeURIComponent(handle)}`);
        if (!meta.ok) {
            return res.status(meta.status || 502).json({
                error: 'Facebook returned an error for this profile. The handle may be wrong or the profile may be deleted.',
            });
        }
        if (!meta.ogImage) {
            return res.status(404).json({
                error: 'Could not find a profile picture for this profile. The profile may be private, deleted, or require login.',
            });
        }

        console.log(`[Facebook] ✓ Profile picture for @${handle}`);
        return res.json({
            success: true,
            items: [{ type: 'image', url: meta.ogImage, thumbnailUrl: meta.ogImage }],
            username: handle,
            caption: meta.ogTitle || handle,
        });
    } catch (err) {
        console.error('[Facebook] Profile-picture fetch error:', err);
        return res.status(500).json({ error: 'Server error: ' + err.message });
    }
});

// POST /api/facebook/fetch-story
// Tries to extract media from a Facebook story URL. Stories on FB usually
// require authentication, so we attempt the og: scrape and return an honest
// error if Facebook didn't serve the preview meta tags.
app.post('/api/facebook/fetch-story', async (req, res) => {
    const { url } = req.body;
    if (!url || !url.trim()) {
        return res.status(400).json({ error: 'Story URL is required' });
    }
    const storyUrl = url.trim();
    if (!isFacebookUrl(storyUrl)) {
        return res.status(400).json({ error: 'Please paste a Facebook story URL.' });
    }

    console.log(`\n[Facebook] Story fetch: ${storyUrl}`);

    try {
        const meta = await fetchFbOgMeta(storyUrl);
        if (!meta.ok) {
            return res.status(meta.status || 502).json({
                error: 'Facebook refused this story URL. Stories typically require a logged-in session to view — there\'s no anonymous way to fetch them.',
            });
        }

        const items = [];
        if (meta.ogVideo) {
            items.push({ type: 'video', url: meta.ogVideo, thumbnailUrl: meta.ogImage || null });
        } else if (meta.ogImage) {
            items.push({ type: 'image', url: meta.ogImage, thumbnailUrl: meta.ogImage });
        }

        if (items.length === 0) {
            return res.status(404).json({
                error: 'Facebook served the page but didn\'t expose any media in the link preview. Stories almost always require login to view — try downloading via the Post tab if you have a regular post URL.',
            });
        }

        console.log(`[Facebook] ✓ Story media`);
        return res.json({
            success: true,
            items,
            username: meta.ogTitle || '',
            caption: meta.ogDescription || '',
        });
    } catch (err) {
        console.error('[Facebook] Story fetch error:', err);
        return res.status(500).json({ error: 'Server error: ' + err.message });
    }
});

// ─── SNAPCHAT DOWNLOADER ──────────────────────────────────────────────
// Snapchat's web pages are server-side-rendered with Next.js and embed all
// the data we need inside <script id="__NEXT_DATA__">. We parse that JSON and
// pull media from whichever shape the URL produced:
//   • Spotlight video  → props.pageProps.videoMetadata.contentUrl
//   • Public story      → props.pageProps.story.snapList[]
//   • Highlight/saved   → props.pageProps.story.snapList[] (loaded into the
//                         story slot) or matched within curatedHighlights
// snapMediaType: 0 = image, 1 = video, 2 = video (no audio).
const SNAP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function isSnapchatUrl(u) {
    return /(?:^|\/\/)(?:www\.|story\.|t\.)?snapchat\.com\//i.test(u) || /(?:^|\/\/)t\.snapchat\.com\//i.test(u);
}

// Some Snapchat fields are wrapped as { value: "..." } — unwrap to a plain string
function snapText(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'object' && typeof v.value === 'string') return v.value;
    return '';
}

// Map a single Snapchat "snap" object to our normalized media item
function snapToItem(snap) {
    if (!snap || !snap.snapUrls || !snap.snapUrls.mediaUrl) return null;
    const isVideo = snap.snapMediaType === 1 || snap.snapMediaType === 2;
    const thumb = snap.snapUrls.mediaPreviewUrl?.value || null;
    return {
        type: isVideo ? 'video' : 'image',
        url: snap.snapUrls.mediaUrl,
        thumbnailUrl: thumb,
        timestamp: snap.timestampInSec || null,
    };
}

app.post('/api/snapchat/fetch', async (req, res) => {
    const { url } = req.body;
    if (!url || !url.trim()) {
        return res.status(400).json({ error: 'URL is required' });
    }
    const snapUrl = url.trim();
    if (!isSnapchatUrl(snapUrl)) {
        return res.status(400).json({ error: 'Please paste a Snapchat URL (snapchat.com profile, story, highlight, or spotlight link).' });
    }

    console.log(`\n[Snapchat] Fetch: ${snapUrl}`);

    try {
        const pageRes = await fetch(snapUrl, {
            headers: {
                'User-Agent': SNAP_UA,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            redirect: 'follow',
        });
        console.log(`[Snapchat] HTTP ${pageRes.status} (final: ${pageRes.url})`);

        if (!pageRes.ok) {
            return res.status(pageRes.status === 404 ? 404 : 502).json({
                error: pageRes.status === 404
                    ? 'Snapchat returned 404 — the profile/story/spotlight doesn\'t exist or the link is wrong.'
                    : `Snapchat returned an error (HTTP ${pageRes.status}). Try again in a moment.`,
            });
        }

        const html = await pageRes.text();
        const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
        if (!m) {
            return res.status(404).json({ error: 'Could not read Snapchat page data. The link format may be unsupported.' });
        }

        let data;
        try { data = JSON.parse(m[1]); }
        catch { return res.status(500).json({ error: 'Failed to parse Snapchat page data.' }); }

        const pp = data?.props?.pageProps;
        if (!pp) {
            return res.status(404).json({ error: 'Snapchat page contained no media data.' });
        }

        let items = [];
        let username = '';
        let title = '';
        let kind = '';

        // ─── Case 1: Spotlight (single video) ───────────────────────────
        if (pp.videoMetadata && pp.videoMetadata.contentUrl) {
            const vm = pp.videoMetadata;
            items.push({
                type: 'video',
                url: vm.contentUrl,
                thumbnailUrl: vm.thumbnailUrl || null,
            });
            username = snapText(vm.creator?.personCreator?.username);
            title = snapText(vm.description) || snapText(vm.name) || '';
            kind = 'spotlight';
            console.log(`[Snapchat] ✓ Spotlight video (@${username})`);
        }

        // Display name / handle lives under userProfile.publicProfileInfo
        const profileUsername = snapText(pp.userProfile?.publicProfileInfo?.username);
        const profileTitle = snapText(pp.userProfile?.publicProfileInfo?.title);

        // ─── Case 2: Public story / highlight (snapList) ────────────────
        if (items.length === 0 && pp.story && Array.isArray(pp.story.snapList) && pp.story.snapList.length > 0) {
            items = pp.story.snapList.map(snapToItem).filter(Boolean);
            username = profileUsername;
            title = snapText(pp.story.storyTitle) || profileTitle || '';
            kind = 'story';
            console.log(`[Snapchat] ✓ Story: ${items.length} snaps (@${username})`);
        }

        // ─── Case 3: A specific highlight when the link targets one ─────
        // Some highlight links load the highlight directly into a highlight
        // object rather than the story slot. Match by the URL suffix/id, else
        // fall back to the first available highlight.
        if (items.length === 0) {
            const allHighlights = []
                .concat(Array.isArray(pp.curatedHighlights) ? pp.curatedHighlights : [])
                .concat(Array.isArray(pp.spotlightHighlights) ? pp.spotlightHighlights : []);
            if (allHighlights.length > 0) {
                // Try to match the highlight referenced by the URL
                const lowerUrl = snapUrl.toLowerCase();
                let target = allHighlights.find(h =>
                    (h.canonicalUrlSuffix && lowerUrl.includes(String(h.canonicalUrlSuffix).toLowerCase())) ||
                    (h.storyShareId && lowerUrl.includes(String(h.storyShareId).toLowerCase())) ||
                    (h.highlightId && lowerUrl.includes(String(h.highlightId).toLowerCase()))
                );
                if (!target) target = allHighlights[0];
                if (target && Array.isArray(target.snapList)) {
                    items = target.snapList.map(snapToItem).filter(Boolean);
                    username = profileUsername;
                    title = snapText(target.storyTitle);
                    kind = 'highlight';
                    console.log(`[Snapchat] ✓ Highlight "${title}": ${items.length} snaps`);
                }
            }
        }

        if (items.length === 0) {
            return res.status(404).json({
                error: 'No downloadable media found. If this is a profile, the user may have no active story right now. Highlights and Spotlight links always work.',
            });
        }

        return res.json({ success: true, items, username, title, kind });
    } catch (err) {
        console.error('[Snapchat] Error:', err);
        return res.status(500).json({ error: 'Server error: ' + err.message });
    }
});

// ─── REDDIT DOWNLOADER ────────────────────────────────────────────────
// Reddit blocks anonymous server-side access (the public .json returns 403),
// so we use the official OAuth "app-only" flow. Set these env vars from a free
// Reddit app at https://www.reddit.com/prefs/apps (type: "script" or "web app"):
//   REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET
// Media itself (i.redd.it / v.redd.it CDN) is not auth-gated — only the API is.
const REDDIT_CLIENT_ID = process.env.REDDIT_CLIENT_ID || '';
const REDDIT_CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET || '';
const REDDIT_UA = 'web:omnisave:v1.0 (by /u/omnisave)';

let redditToken = { value: null, expiresAt: 0 };

async function getRedditToken() {
    // Reuse cached token until ~1 min before expiry
    if (redditToken.value && Date.now() < redditToken.expiresAt - 60000) {
        return redditToken.value;
    }
    if (!REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET) {
        const err = new Error('NOT_CONFIGURED');
        err.code = 'NOT_CONFIGURED';
        throw err;
    }
    const basic = Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`).toString('base64');
    const res = await fetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${basic}`,
            'User-Agent': REDDIT_UA,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
    });
    if (!res.ok) {
        const body = await res.text();
        console.error(`[Reddit] Token request failed: ${res.status} ${body.slice(0, 120)}`);
        throw new Error(res.status === 401 ? 'Invalid Reddit API credentials.' : `Reddit auth failed (${res.status}).`);
    }
    const data = await res.json();
    redditToken = {
        value: data.access_token,
        expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
    };
    console.log('[Reddit] Obtained app-only token');
    return redditToken.value;
}

// Convert any reddit URL into the api comments path (e.g. /r/sub/comments/abc123)
function redditCommentsPath(rawUrl) {
    try {
        let u = rawUrl.trim();
        // Resolve short links like redd.it/abc123 → /comments/abc123
        const shortMatch = u.match(/redd\.it\/([a-z0-9]+)/i);
        if (shortMatch && !/\/comments\//i.test(u)) {
            return `/comments/${shortMatch[1]}`;
        }
        const url = new URL(u.startsWith('http') ? u : `https://www.reddit.com/${u}`);
        let p = url.pathname;
        // Strip trailing slash and any /comment/ deep-link suffix; keep through the post id
        const m = p.match(/\/r\/[^/]+\/comments\/[a-z0-9]+/i) || p.match(/\/comments\/[a-z0-9]+/i);
        return m ? m[0] : p.replace(/\/$/, '');
    } catch {
        return null;
    }
}

function bestPreviewImage(img) {
    if (!img) return null;
    // source is highest-res; URLs are HTML-escaped in the API
    const u = img.source?.url || (img.resolutions && img.resolutions[img.resolutions.length - 1]?.url);
    return u ? u.replace(/&amp;/g, '&') : null;
}

// Parse a single Reddit post object into normalized media items
function parseRedditPost(post) {
    const items = [];
    const add = (it) => { if (it && it.url) items.push(it); };

    // 1. Native video (v.redd.it) — DASH, needs video+audio merge
    if (post.is_video && post.media?.reddit_video) {
        const rv = post.media.reddit_video;
        add({
            type: 'video',
            needsMerge: true,
            dashUrl: rv.dash_url || null,
            fallbackUrl: rv.fallback_url || null,
            hlsUrl: rv.hls_url || null,
            duration: rv.duration || 0,
            hasAudio: rv.has_audio !== false,
            thumbnailUrl: bestPreviewImage(post.preview?.images?.[0]),
        });
        return { items, hasMore: false };
    }

    // 2. Gallery — multiple images/gifs
    if (post.is_gallery && post.media_metadata && post.gallery_data) {
        for (const g of post.gallery_data.items || []) {
            const meta = post.media_metadata[g.media_id];
            if (!meta) continue;
            // m = mime; s = source (largest). For gifs, s.gif/s.mp4; for images, s.u
            if (meta.s?.mp4) {
                add({ type: 'video', url: meta.s.mp4.replace(/&amp;/g, '&'), thumbnailUrl: (meta.s.gif || meta.s.u || '').replace(/&amp;/g, '&') || null });
            } else if (meta.s?.gif) {
                add({ type: 'image', url: meta.s.gif.replace(/&amp;/g, '&'), thumbnailUrl: meta.s.gif.replace(/&amp;/g, '&') });
            } else if (meta.s?.u) {
                const u = meta.s.u.replace(/&amp;/g, '&');
                add({ type: 'image', url: u, thumbnailUrl: u });
            }
        }
        return { items, hasMore: false };
    }

    // 3. Animated GIF served as mp4 (gifs, gfycat-mirrored, etc.)
    const mp4Variant = post.preview?.images?.[0]?.variants?.mp4?.source?.url;
    if (mp4Variant) {
        add({
            type: 'video',
            url: mp4Variant.replace(/&amp;/g, '&'),
            thumbnailUrl: bestPreviewImage(post.preview?.images?.[0]),
        });
        return { items, hasMore: false };
    }

    // 4. Direct image (i.redd.it or external direct image link)
    const directUrl = post.url_overridden_by_dest || post.url || '';
    if (/\.(jpe?g|png|webp|gif)$/i.test(directUrl)) {
        const isGif = /\.gif$/i.test(directUrl);
        add({ type: isGif ? 'image' : 'image', url: directUrl, thumbnailUrl: bestPreviewImage(post.preview?.images?.[0]) || directUrl });
        return { items, hasMore: false };
    }

    // 5. Fallback: any preview image we can find (covers most image posts)
    const prev = bestPreviewImage(post.preview?.images?.[0]);
    if (prev) {
        add({ type: 'image', url: prev, thumbnailUrl: prev });
    }
    return { items, hasMore: false };
}

// POST /api/reddit/fetch — extract media metadata from a Reddit post URL
app.post('/api/reddit/fetch', async (req, res) => {
    const { url } = req.body;
    if (!url || !url.trim()) {
        return res.status(400).json({ error: 'URL is required' });
    }
    if (!/reddit\.com|redd\.it/i.test(url)) {
        return res.status(400).json({ error: 'Please paste a Reddit post URL (reddit.com/... or redd.it/...).' });
    }

    const commentsPath = redditCommentsPath(url);
    if (!commentsPath || !/\/comments\/[a-z0-9]+/i.test(commentsPath)) {
        return res.status(400).json({ error: 'That doesn\'t look like a Reddit post link. Use a full post URL (it contains /comments/).' });
    }

    console.log(`\n[Reddit] Fetch: ${commentsPath}`);

    let token;
    try {
        token = await getRedditToken();
    } catch (err) {
        if (err.code === 'NOT_CONFIGURED') {
            return res.status(503).json({
                error: 'Reddit downloader isn\'t configured yet. The server needs REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET (free — create an app at reddit.com/prefs/apps).',
            });
        }
        return res.status(502).json({ error: err.message });
    }

    try {
        const apiUrl = `https://oauth.reddit.com${commentsPath}?raw_json=1`;
        const apiRes = await fetch(apiUrl, {
            headers: { 'Authorization': `Bearer ${token}`, 'User-Agent': REDDIT_UA },
        });
        console.log(`[Reddit] API ${apiRes.status}`);
        if (!apiRes.ok) {
            if (apiRes.status === 401) { redditToken = { value: null, expiresAt: 0 }; }
            return res.status(apiRes.status === 404 ? 404 : 502).json({
                error: apiRes.status === 404
                    ? 'Post not found — it may have been removed or the link is wrong.'
                    : `Reddit API error (${apiRes.status}). Try again in a moment.`,
            });
        }

        const data = await apiRes.json();
        const post = data?.[0]?.data?.children?.[0]?.data;
        if (!post) {
            return res.status(404).json({ error: 'Could not read post data from Reddit.' });
        }

        const { items } = parseRedditPost(post);
        if (items.length === 0) {
            return res.status(404).json({
                error: 'No downloadable media found in this post. It may be a text post, a poll, or a link to an unsupported site.',
            });
        }

        return res.json({
            success: true,
            items,
            title: post.title || '',
            subreddit: post.subreddit_name_prefixed || (post.subreddit ? `r/${post.subreddit}` : ''),
            author: post.author ? `u/${post.author}` : '',
            nsfw: !!post.over_18,
        });
    } catch (err) {
        console.error('[Reddit] Error:', err);
        return res.status(500).json({ error: 'Server error: ' + err.message });
    }
});

// GET /api/reddit/prepare — merge a v.redd.it DASH video (video+audio) with
// ffmpeg, streaming progress over SSE, then hand back a download token.
app.get('/api/reddit/prepare', (req, res) => {
    const { dashUrl, fallbackUrl, duration, filename } = req.query;
    const sourceUrl = dashUrl || fallbackUrl;
    if (!sourceUrl) {
        res.status(400).json({ error: 'dashUrl or fallbackUrl is required' });
        return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const sendEvent = (event, data) => {
        if (res.writableEnded) return;
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const fs = require('fs');
    const os = require('os');
    const ffmpegBin = FFMPEG_PATH || 'ffmpeg';
    const tempBase = path.join(os.tmpdir(), `omnisave-rd-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const outPath = `${tempBase}.mp4`;
    const totalDuration = parseFloat(duration) || 0;
    const dlFilename = filename || 'omnisave_reddit.mp4';

    // ffmpeg reads the DASH manifest (or fallback mp4), copies streams into mp4.
    // -progress pipe:1 emits machine-readable progress (out_time_ms=...).
    const args = [
        '-y',
        '-i', sourceUrl,
        '-c', 'copy',
        '-movflags', '+faststart',
        '-progress', 'pipe:1',
        '-loglevel', 'error',
        outPath,
    ];

    console.log(`[Reddit Prepare] ffmpeg merge from ${sourceUrl.slice(0, 60)}…`);
    const child = spawn(ffmpegBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderrBuf = '';
    let clientClosed = false;
    let lastPercent = -1;

    // Parse -progress output: out_time_ms=12345678 (microseconds)
    child.stdout.on('data', (d) => {
        const text = d.toString();
        const m = [...text.matchAll(/out_time_ms=(\d+)/g)].pop();
        if (m && totalDuration > 0) {
            const sec = parseInt(m[1], 10) / 1000000;
            const percent = Math.min(99, (sec / totalDuration) * 100);
            if (percent - lastPercent >= 0.5) {
                lastPercent = percent;
                sendEvent('progress', { phase: 'downloading', percent });
            }
        } else if (text.includes('progress=continue') && lastPercent < 0) {
            sendEvent('progress', { phase: 'downloading', percent: 0 });
        }
    });

    child.stderr.on('data', (d) => { stderrBuf += d.toString(); });

    child.on('error', (err) => {
        sendEvent('fail', { error: 'ffmpeg failed to start: ' + err.message });
        res.end();
    });

    child.on('close', (code) => {
        if (clientClosed) { cleanupTempFiles(tempBase); return; }
        if (code !== 0 || !fs.existsSync(outPath)) {
            cleanupTempFiles(tempBase);
            console.error(`[Reddit Prepare] ffmpeg exit ${code}: ${stderrBuf.slice(0, 200)}`);
            sendEvent('fail', { error: 'Failed to process the video. ' + (stderrBuf.slice(0, 120) || '') });
            res.end();
            return;
        }
        const stat = fs.statSync(outPath);
        const token = crypto.randomBytes(16).toString('hex');
        const finalFilename = dlFilename.toLowerCase().endsWith('.mp4') ? dlFilename : dlFilename.replace(/\.[^.]+$/, '') + '.mp4';
        pendingDownloads.set(token, {
            path: outPath,
            tempBase,
            filename: finalFilename,
            contentType: 'video/mp4',
            size: stat.size,
            createdAt: Date.now(),
        });
        console.log(`[Reddit Prepare] Ready: ${token} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
        sendEvent('ready', { token, filename: finalFilename, size: stat.size });
        res.end();
    });

    req.on('close', () => {
        clientClosed = true;
        if (!child.killed) child.kill('SIGTERM');
    });
});

// SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n  🎬  OmniSave is running on port ${PORT}\n`);
});
