// Quick diagnostic script to test Instagram API responses
const fetch = require('node-fetch');

const SESSIONID = process.argv[2];
const SHORTCODE = process.argv[3] || 'DVOxQ4rE1kW';

if (!SESSIONID) {
    console.log('Usage: node test_api.js <sessionid> [shortcode]');
    process.exit(1);
}

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function shortcodeToMediaId(shortcode) {
    let mediaId = BigInt(0);
    for (const char of shortcode) {
        mediaId = mediaId * BigInt(64) + BigInt(alphabet.indexOf(char));
    }
    return mediaId.toString();
}

const mediaId = shortcodeToMediaId(SHORTCODE);
console.log(`\nShortcode: ${SHORTCODE}`);
console.log(`Media ID: ${mediaId}`);
console.log(`Session ID: ${SESSIONID.substring(0, 10)}...`);
console.log('─'.repeat(60));

async function test() {
    // Test 1: Mobile API
    console.log('\n=== Test 1: Mobile API ===');
    try {
        const res = await fetch(`https://i.instagram.com/api/v1/media/${mediaId}/info/`, {
            headers: {
                'User-Agent': 'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229258)',
                'X-IG-App-ID': '567067343352427',
                'Cookie': `sessionid=${SESSIONID}`,
            },
        });
        console.log(`Status: ${res.status} ${res.statusText}`);
        const text = await res.text();
        console.log(`Response length: ${text.length}`);
        console.log(`Body (first 500 chars): ${text.substring(0, 500)}`);

        if (res.ok) {
            try {
                const data = JSON.parse(text);
                if (data.items && data.items[0]) {
                    const item = data.items[0];
                    console.log(`\nHas items: true`);
                    console.log(`  media_type: ${item.media_type}`);
                    console.log(`  has video_versions: ${!!item.video_versions}`);
                    console.log(`  username: ${item.user?.username}`);
                    if (item.video_versions) {
                        console.log(`  video URL: ${item.video_versions[0]?.url?.substring(0, 80)}...`);
                    }
                }
            } catch (e) { }
        }
    } catch (err) {
        console.log(`Error: ${err.message}`);
    }

    // Test 2: GraphQL query
    console.log('\n=== Test 2: GraphQL Query ===');
    try {
        const res = await fetch('https://www.instagram.com/graphql/query/', {
            method: 'POST',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'X-IG-App-ID': '936619743392459',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': `sessionid=${SESSIONID}`,
                'Referer': 'https://www.instagram.com/',
            },
            body: `query_hash=b3055c01b4b222b8a47dc12b090e4e64&variables=${encodeURIComponent(JSON.stringify({
                shortcode: SHORTCODE,
                child_comment_count: 3,
                fetch_comment_count: 40,
                parent_comment_count: 24,
                has_threaded_comments: true
            }))}`,
            redirect: 'manual',
        });
        console.log(`Status: ${res.status} ${res.statusText}`);
        const text = await res.text();
        console.log(`Response length: ${text.length}`);
        console.log(`Body (first 500 chars): ${text.substring(0, 500)}`);
    } catch (err) {
        console.log(`Error: ${err.message}`);
    }

    // Test 3: Page scrape with reel URL
    console.log('\n=== Test 3: Page Scrape (reel URL) ===');
    try {
        const res = await fetch(`https://www.instagram.com/reel/${SHORTCODE}/`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'X-IG-App-ID': '936619743392459',
                'Cookie': `sessionid=${SESSIONID}`,
                'Accept': 'text/html,application/xhtml+xml',
            },
            redirect: 'manual',
        });
        console.log(`Status: ${res.status} ${res.statusText}`);
        if (res.status === 302) {
            console.log(`Redirect: ${res.headers.get('location')}`);
        }
        const text = await res.text();
        console.log(`Response length: ${text.length}`);

        const videoMatch = text.match(/"video_url"\s*:\s*"(https?:[^"]+)"/);
        console.log(`Has video_url in HTML: ${!!videoMatch}`);

        const ogVideoMatch = text.match(/<meta\s+property="og:video"\s+content="([^"]+)"/);
        console.log(`Has og:video meta: ${!!ogVideoMatch}`);

        if (text.length < 5000) {
            console.log(`\nFull body:\n${text}`);
        }
    } catch (err) {
        console.log(`Error: ${err.message}`);
    }

    // Test 4: ?__a=1
    console.log('\n=== Test 4: ?__a=1&__d=dis ===');
    try {
        const res = await fetch(`https://www.instagram.com/p/${SHORTCODE}/?__a=1&__d=dis`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'X-IG-App-ID': '936619743392459',
                'X-Requested-With': 'XMLHttpRequest',
                'Cookie': `sessionid=${SESSIONID}`,
                'Referer': 'https://www.instagram.com/',
            },
            redirect: 'manual',
        });
        console.log(`Status: ${res.status} ${res.statusText}`);
        if (res.status === 302) {
            console.log(`Redirect: ${res.headers.get('location')}`);
        }
        const text = await res.text();
        console.log(`Response length: ${text.length}`);
        console.log(`Body (first 500 chars): ${text.substring(0, 500)}`);
    } catch (err) {
        console.log(`Error: ${err.message}`);
    }

    // Test 5: Mobile API with reel endpoint
    console.log('\n=== Test 5: Mobile API /reels/media/ ===');
    try {
        const res = await fetch(`https://i.instagram.com/api/v1/clips/item/?media_id=${mediaId}`, {
            headers: {
                'User-Agent': 'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229258)',
                'X-IG-App-ID': '567067343352427',
                'Cookie': `sessionid=${SESSIONID}`,
            },
        });
        console.log(`Status: ${res.status} ${res.statusText}`);
        const text = await res.text();
        console.log(`Response length: ${text.length}`);
        console.log(`Body (first 500 chars): ${text.substring(0, 500)}`);
    } catch (err) {
        console.log(`Error: ${err.message}`);
    }
}

test().then(() => console.log('\nDone'));
