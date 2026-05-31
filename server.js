const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

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

        if (items.length === 0) {
            console.log('[PublicFetch] ✗ All methods failed');
            const needsLogin = !igSession.sessionid;
            return res.status(404).json({
                error: needsLogin
                    ? 'Could not fetch media. Please click Login (top right) and enter your session ID — Instagram requires authentication even for public posts. You only need to do this once!'
                    : 'Could not extract media. The post might be from a private account, or your session expired. Try logging out and back in with a fresh session ID.',
                needsLogin,
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


// ─── BULK PROFILE FETCH (Paginated via Mobile API) ────────────────────
app.post('/api/fetch-profile', async (req, res) => {
    const { profileUrl, cursor } = req.body;
    if (!profileUrl) {
        return res.status(400).json({ error: 'Profile URL is required' });
    }

    const usernameMatch = profileUrl.trim().match(/instagram\.com\/([A-Za-z0-9._]+)/);
    if (!usernameMatch) {
        return res.status(400).json({ error: 'Invalid Instagram profile URL' });
    }
    const profileUsername = usernameMatch[1];
    console.log(`\n[BulkFetch] Profile: @${profileUsername}, cursor: ${cursor || 'start'}`);

    try {
        // Step 1: Get user info and ID
        let userId = null;
        let profileData = null;

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
                    username: user.username,
                    fullName: user.full_name,
                    profilePic: user.profile_pic_url_hd || user.profile_pic_url,
                    postCount: user.edge_owner_to_timeline_media?.count || 0,
                    isPrivate: user.is_private,
                };
                console.log(`[BulkFetch] ✓ User: @${user.username} (ID: ${userId}), posts: ${profileData.postCount}`);

                if (profileData.isPrivate && !igSession.sessionid) {
                    return res.status(403).json({
                        error: `@${profileData.username}'s account is private. Use the "Private & Exclusive" tab with your session ID.`,
                    });
                }

                // Page 1: return timeline from profile info
                if (!cursor) {
                    const timeline = user.edge_owner_to_timeline_media;
                    if (timeline) {
                        const items = (timeline.edges || []).map(edge => {
                            const node = edge.node;
                            return {
                                shortcode: node.shortcode,
                                id: node.id,
                                type: node.is_video ? 'video' : 'image',
                                thumbnailUrl: node.thumbnail_src || node.display_url,
                                caption: node.edge_media_to_caption?.edges?.[0]?.node?.text || '',
                                likeCount: node.edge_liked_by?.count || 0,
                                commentCount: node.edge_media_to_comment?.count || 0,
                                isCarousel: node.__typename === 'GraphSidecar',
                                timestamp: node.taken_at_timestamp,
                            };
                        });

                        const pageInfo = timeline.page_info || {};
                        console.log(`[BulkFetch] ✓ Page 1: ${items.length} posts, hasNext: ${pageInfo.has_next_page}`);

                        return res.json({
                            success: true,
                            items,
                            profileData,
                            nextCursor: pageInfo.has_next_page ? pageInfo.end_cursor : null,
                            totalPosts: profileData.postCount,
                        });
                    }
                }
            }
        }

        // Step 2: Pagination (page 2+) — use Mobile API feed
        if (userId && cursor) {
            console.log(`[BulkFetch] Fetching page 2+ via mobile feed API, max_id: ${cursor}`);
            try {
                const feedRes = await fetch(
                    `https://i.instagram.com/api/v1/feed/user/${userId}/?count=25&max_id=${cursor}`,
                    { headers: MOBILE_HEADERS() }
                );
                console.log(`[BulkFetch] Mobile feed status: ${feedRes.status}`);

                if (feedRes.ok) {
                    const feedData = await feedRes.json();
                    const items = (feedData.items || []).map(item => ({
                        shortcode: item.code,
                        id: item.id,
                        type: (item.video_versions || item.media_type === 2) ? 'video' : 'image',
                        thumbnailUrl: item.image_versions2?.candidates?.[1]?.url || item.image_versions2?.candidates?.[0]?.url || '',
                        caption: item.caption?.text || '',
                        likeCount: item.like_count || 0,
                        commentCount: item.comment_count || 0,
                        isCarousel: !!item.carousel_media,
                        timestamp: item.taken_at,
                    }));

                    const nextMaxId = feedData.next_max_id || null;
                    console.log(`[BulkFetch] ✓ Page 2+: ${items.length} posts, hasNext: ${!!nextMaxId}`);

                    return res.json({
                        success: true,
                        items,
                        profileData,
                        nextCursor: nextMaxId,
                        totalPosts: profileData?.postCount || 0,
                    });
                }
            } catch (e) {
                console.log('[BulkFetch] Mobile feed error:', e.message);
            }
        }

        return res.status(404).json({
            error: !igSession.sessionid
                ? 'Could not fetch profile. Please click Login and enter your session ID for best results.'
                : 'Could not fetch profile. The account may be private or Instagram blocked the request.',
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
        // Try mobile API first (with session if available)
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

        if (items.length === 0) {
            return res.status(404).json({ error: 'Could not fetch media for this post.' });
        }

        return res.json({ success: true, items });
    } catch (err) {
        console.error('[PostMedia] Error:', err);
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
        // Force download if ?download=true
        if (req.query.download === 'true') {
            const filename = req.query.filename || 'instasave_image.jpg';
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

    if (!igSession.sessionid) {
        return res.status(401).json({ error: 'Please login first. Stories require your session ID to access.', needsLogin: true });
    }

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

        if (storyRes.ok) {
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

// GET /api/youtube/file/:token — Serve the prepared file as a native download
app.get('/api/youtube/file/:token', (req, res) => {
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
});

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

// SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n  🎬  OmniSave is running on port ${PORT}\n`);
});
