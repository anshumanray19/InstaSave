const fetch = require('node-fetch');
const { extractShortcode, shortcodeToMediaId, MOBILE_HEADERS, WEB_HEADERS, getSessionId, getSession, setCorsHeaders } = require('./_shared');

module.exports = async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body;
  if (!url || !url.trim()) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const shortcode = extractShortcode(url.trim());
  if (!shortcode) {
    return res.status(400).json({ error: 'Invalid Instagram URL. Please paste a reel, post, or IGTV link.' });
  }

  const sessionId = getSessionId(req);
  const igSession = getSession(sessionId);
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
      headers: MOBILE_HEADERS(igSession),
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
            ...WEB_HEADERS(igSession),
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
    if (items.length === 0) {
      console.log('[PublicFetch] Trying embed page scrape...');
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
          if (!embedRes.ok) continue;
          
          const html = await embedRes.text();
          if (!html || html.length < 500) continue;

          if (html.includes('EmbedIsBroken') || html.includes('The link to this photo or video may be broken')) {
            embedDisabled = true;
            continue;
          }

          const decodedHtml = html
            .replace(/\\+/g, '\\')
            .replace(/\\u002F/gi, '/')
            .replace(/\\u0026/gi, '&')
            .replace(/\\\\\//g, '/')
            .replace(/\\\//g, '/')
            .replace(/\\"/g, '"');

          // Try carousel first
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

          // Single video
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

          // Single image
          if (items.length === 0) {
            const ogImage = decodedHtml.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i);
            const inlineDisplay = decodedHtml.match(/"display_url"\s*:\s*"([^"]+)"/);
            const imageUrl = ogImage?.[1] || (inlineDisplay ? inlineDisplay[1] : null);
            if (imageUrl) {
              items.push({ type: 'image', url: imageUrl, thumbnailUrl: imageUrl });
              console.log('[PublicFetch] ✓ Got image from embed');
            }
          }

          if (!username) {
            const userMatch = decodedHtml.match(/"username"\s*:\s*"([^"]+)"/);
            if (userMatch) username = userMatch[1];
          }
          
          if (!caption) {
            const capMatch = decodedHtml.match(/"caption"\s*:\s*"((?:[^"\\\\]|\\\\.)*)"/);
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
      if (embedDisabled) {
        return res.status(403).json({
          error: "This post has embedding disabled by the creator or is private. Try logging in with your Instagram session ID in the 'Private & Exclusive' tab.",
          needsLogin: true
        });
      }
      return res.status(404).json({
        error: 'Could not fetch this post. It may be private, deleted, or Instagram is rate limiting requests. Try again in a few minutes.'
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
};
