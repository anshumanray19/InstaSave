// Test with newer User-Agent and following redirects
const fetch = require('node-fetch');

const SESSIONID = process.argv[2];
const SHORTCODE = process.argv[3] || 'DVOxQ4rE1kW';

if (!SESSIONID) {
    console.log('Usage: node test_fix.js <sessionid> [shortcode]');
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
console.log(`Shortcode: ${SHORTCODE} -> Media ID: ${mediaId}\n`);

async function test() {
    // Test 1: Mobile API with NEWER User-Agent
    console.log('=== Test 1: Mobile API (newer UA) ===');
    try {
        const res = await fetch(`https://i.instagram.com/api/v1/media/${mediaId}/info/`, {
            headers: {
                'User-Agent': 'Instagram 317.0.0.34.109 Android (34/14; 480dpi; 1080x2400; Google/google; Pixel 8 Pro; husky; tensor; en_US; 562816080)',
                'X-IG-App-ID': '567067343352427',
                'X-IG-Capabilities': '3brTv10=',
                'X-IG-Connection-Type': 'WIFI',
                'Cookie': `sessionid=${SESSIONID}`,
            },
        });
        console.log(`Status: ${res.status}`);
        const text = await res.text();
        console.log(`Length: ${text.length}`);
        console.log(`Body: ${text.substring(0, 600)}`);

        if (res.ok) {
            try {
                const data = JSON.parse(text);
                if (data.items?.[0]) {
                    console.log(`\nSUCCESS! media_type=${data.items[0].media_type}, has_video=${!!data.items[0].video_versions}, user=${data.items[0].user?.username}`);
                    if (data.items[0].video_versions) {
                        console.log(`Video URL: ${data.items[0].video_versions[0].url.substring(0, 100)}...`);
                    }
                }
            } catch (e) { }
        }
    } catch (err) {
        console.log(`Error: ${err.message}`);
    }

    // Test 2: Page scrape with redirect FOLLOWING
    console.log('\n=== Test 2: Page scrape (follow redirects) ===');
    try {
        const res = await fetch(`https://www.instagram.com/reel/${SHORTCODE}/`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Cookie': `sessionid=${SESSIONID}`,
                'Sec-Fetch-Mode': 'navigate',
            },
            redirect: 'follow',
        });
        console.log(`Status: ${res.status}`);
        console.log(`Final URL: ${res.url}`);
        const text = await res.text();
        console.log(`Length: ${text.length}`);

        const videoMatch = text.match(/"video_url"\s*:\s*"(https?:[^"]+)"/);
        console.log(`Has video_url: ${!!videoMatch}`);
        if (videoMatch) {
            console.log(`Video URL: ${videoMatch[1].replace(/\\u0026/g, '&').substring(0, 100)}...`);
        }

        const ogVideo = text.match(/<meta\s+(?:property|name)="og:video"\s+content="([^"]+)"/);
        console.log(`Has og:video: ${!!ogVideo}`);
        if (ogVideo) console.log(`og:video: ${ogVideo[1].substring(0, 100)}...`);
    } catch (err) {
        console.log(`Error: ${err.message}`);
    }

    // Test 3: /reels/ (plural) directly + follow redirects
    console.log('\n=== Test 3: /reels/ (plural) direct ===');
    try {
        const res = await fetch(`https://www.instagram.com/reels/${SHORTCODE}/`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Cookie': `sessionid=${SESSIONID}`,
            },
            redirect: 'follow',
        });
        console.log(`Status: ${res.status}`);
        const text = await res.text();
        console.log(`Length: ${text.length}`);

        const videoMatch = text.match(/"video_url"\s*:\s*"(https?:[^"]+)"/);
        console.log(`Has video_url: ${!!videoMatch}`);
        if (videoMatch) {
            console.log(`Video URL: ${videoMatch[1].replace(/\\u0026/g, '&').substring(0, 100)}...`);
        }
    } catch (err) {
        console.log(`Error: ${err.message}`);
    }
}

test().then(() => console.log('\nDone'));
