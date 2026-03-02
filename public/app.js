/* ═══════════════════════════════════════════════════════════════
   InstaSave — Client-side JS
   ═══════════════════════════════════════════════════════════════ */

const API_BASE = '';

// ─── DOM Elements (Private & Exclusive — Tab 3) ────────────────
const urlInput = document.getElementById('urlInput');
const btnFetch = document.getElementById('btnFetch');
const loadingSection = document.getElementById('loadingSection');
const errorSection = document.getElementById('errorSection');
const errorText = document.getElementById('errorText');
const playerCard = document.getElementById('playerCard');
const videoPlayer = document.getElementById('videoPlayer');
const playerUsername = document.getElementById('playerUsername');
const playerCaption = document.getElementById('playerCaption');
const btnOpenIG = document.getElementById('btnOpenIG');
const sessionBadge = document.getElementById('sessionBadge');
const sessionText = document.getElementById('sessionText');
const btnSession = document.getElementById('btnSession');
const btnSessionText = document.getElementById('btnSessionText');
const loginModal = document.getElementById('loginModal');
const sessionInput = document.getElementById('sessionInput');
const loginError = document.getElementById('loginError');
const historySection = document.getElementById('historySection');
const historyGrid = document.getElementById('historyGrid');

// ─── State ─────────────────────────────────────────────────────
let currentVideoData = null;
let currentPublicMediaData = null;

// Bulk downloader state
let bulkState = {
    items: [],
    selected: new Set(),
    cursor: null,
    cursorHistory: [],
    currentPage: 1,
    profileUrl: '',
    profileData: null,
};

// ─── Initialize ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    renderHistory();

    // Enter key to search (Private tab)
    urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') fetchVideo();
    });

    // Enter key for public tab
    document.getElementById('publicUrlInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') fetchPublicMedia();
    });

    // Enter key for bulk tab
    document.getElementById('profileUrlInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') fetchProfileMedia();
    });

    // Enter key for story tab
    document.getElementById('storyUrlInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') fetchStories();
    });

    // Close modal on overlay click
    loginModal.addEventListener('click', (e) => {
        if (e.target === loginModal) toggleLoginModal();
    });

    // Enter key to login
    sessionInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loginWithSession();
    });

    // Paste detection animation
    urlInput.addEventListener('paste', () => {
        urlInput.parentElement.style.borderColor = 'rgba(225, 48, 108, 0.5)';
        setTimeout(() => {
            urlInput.parentElement.style.borderColor = '';
        }, 1000);
    });
});

// ═══════════════════════════════════════════════════════════════
//  TAB NAVIGATION
// ═══════════════════════════════════════════════════════════════

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    const target = document.getElementById(`tab-${tabName}`);
    if (target) {
        target.classList.add('active');
        // Re-trigger animation
        target.style.animation = 'none';
        target.offsetHeight; // force reflow
        target.style.animation = '';
    }
}

// ═══════════════════════════════════════════════════════════════
//  TAB 1: PUBLIC MEDIA DOWNLOADER
// ═══════════════════════════════════════════════════════════════

async function fetchPublicMedia() {
    const input = document.getElementById('publicUrlInput');
    const url = input.value.trim();
    if (!url) {
        input.focus();
        return;
    }

    if (!url.includes('instagram.com')) {
        showPublicError('Please enter a valid Instagram URL.');
        return;
    }

    showPublicLoading();
    hidePublicError();
    hidePublicResults();

    try {
        const res = await fetch(`${API_BASE}/api/fetch-public`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
            hidePublicLoading();
            showPublicError(data.error || 'Could not fetch media.');
            // Auto-open login modal if session is needed
            if (data.needsLogin) {
                setTimeout(() => toggleLoginModal(), 500);
            }
            return;
        }

        currentPublicMediaData = data;
        renderPublicMedia(data);
        hidePublicLoading();

    } catch (err) {
        hidePublicLoading();
        console.error('Fetch error:', err);
        showPublicError('Connection error (Check console for details). Make sure server is running.');
    }
}

function renderPublicMedia(data) {
    const grid = document.getElementById('publicMediaGrid');
    const usernameEl = document.getElementById('publicUsername');
    const countEl = document.getElementById('publicMediaCount');
    const captionEl = document.getElementById('publicCaption');

    usernameEl.textContent = data.username ? `@${data.username}` : 'Instagram User';
    countEl.textContent = `${data.items.length} item${data.items.length !== 1 ? 's' : ''}`;

    if (data.caption && data.caption.trim()) {
        captionEl.textContent = truncateCaption(data.caption, 300);
        captionEl.classList.add('visible');
    } else {
        captionEl.classList.remove('visible');
    }

    grid.innerHTML = '';

    data.items.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'media-item';

        const proxyUrl = `${API_BASE}/api/proxy-image?url=${encodeURIComponent(item.thumbnailUrl || item.url)}`;

        div.innerHTML = `
            <img src="${proxyUrl}" alt="Media ${index + 1}" loading="lazy">
            <span class="media-type-badge">${item.type === 'video' ? '▶ Video' : '📷 Photo'}</span>
            <div class="media-item-overlay">
                <span></span>
                <button class="media-item-download" onclick="event.stopPropagation(); downloadPublicItem(${index})" title="Download">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                </button>
            </div>
        `;
        grid.appendChild(div);
    });

    showPublicResults();
}

function downloadPublicItem(index) {
    if (!currentPublicMediaData || !currentPublicMediaData.items[index]) return;
    const item = currentPublicMediaData.items[index];
    const ext = item.type === 'video' ? 'mp4' : 'jpg';
    const filename = `instasave_${currentPublicMediaData.shortcode || 'media'}_${index + 1}.${ext}`;
    const proxyEndpoint = item.type === 'video' ? 'proxy-video' : 'proxy-image';
    const downloadUrl = `${API_BASE}/api/${proxyEndpoint}?url=${encodeURIComponent(item.url)}&download=true&filename=${encodeURIComponent(filename)}`;

    showToast('⬇️', `Downloading ${item.type}...`);

    fetch(downloadUrl)
        .then(res => res.blob())
        .then(blob => {
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
        })
        .catch(err => {
            console.error('Download failed:', err);
            showToast('❌', 'Download failed');
        });
}

function downloadAllPublicMedia() {
    if (!currentPublicMediaData || !currentPublicMediaData.items.length) return;
    currentPublicMediaData.items.forEach((_, i) => {
        setTimeout(() => downloadPublicItem(i), i * 800);
    });
    showToast('⬇️', `Downloading ${currentPublicMediaData.items.length} items...`);
}

// Public UI helpers
function showPublicLoading() {
    document.getElementById('publicLoadingSection').classList.add('visible');
}
function hidePublicLoading() {
    document.getElementById('publicLoadingSection').classList.remove('visible');
}
function showPublicError(msg) {
    document.getElementById('publicErrorText').textContent = msg;
    document.getElementById('publicErrorSection').classList.add('visible');
}
function hidePublicError() {
    document.getElementById('publicErrorSection').classList.remove('visible');
}
function clearPublicError() {
    hidePublicError();
    document.getElementById('publicUrlInput').focus();
}
function showPublicResults() {
    document.getElementById('publicResultsSection').classList.add('visible');
}
function hidePublicResults() {
    document.getElementById('publicResultsSection').classList.remove('visible');
}


// ═══════════════════════════════════════════════════════════════
//  TAB 2: BULK DOWNLOADER
// ═══════════════════════════════════════════════════════════════

async function fetchProfileMedia(cursor = null) {
    const input = document.getElementById('profileUrlInput');
    const profileUrl = input.value.trim();
    if (!profileUrl) {
        input.focus();
        return;
    }

    if (!profileUrl.includes('instagram.com')) {
        showBulkError('Please enter a valid Instagram profile URL.');
        return;
    }

    showBulkLoading();
    hideBulkError();

    if (!cursor) {
        // Fresh search — reset state
        bulkState = {
            items: [],
            selected: new Set(),
            cursor: null,
            cursorHistory: [],
            currentPage: 1,
            profileUrl: profileUrl,
            profileData: null,
        };
        hideBulkProfile();
        hideBulkSelectionBar();
        document.getElementById('bulkGrid').innerHTML = '';
        document.getElementById('pagination').classList.remove('visible');
    }

    try {
        const res = await fetch(`${API_BASE}/api/fetch-profile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profileUrl, cursor }),
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
            hideBulkLoading();
            showBulkError(data.error || 'Could not fetch profile.');
            return;
        }

        // Store state
        bulkState.items = data.items;
        bulkState.cursor = data.nextCursor;
        bulkState.profileData = data.profileData;
        bulkState.selected = new Set();

        // Show profile card
        if (data.profileData) {
            renderProfileCard(data.profileData);
        }

        // Render grid
        renderBulkGrid(data.items);

        // Show selection bar
        showBulkSelectionBar();
        updateSelectionUI();

        // Show pagination
        renderPagination();

        hideBulkLoading();

    } catch (err) {
        hideBulkLoading();
        console.error('Fetch error:', err);
        showBulkError('Connection error (Check console for details). Make sure server is running.');
    }
}

function renderProfileCard(profile) {
    const card = document.getElementById('profileCard');
    const pic = document.getElementById('profilePic');
    const name = document.getElementById('profileName');
    const username = document.getElementById('profileUsername');
    const postCount = document.getElementById('profilePostCount');

    if (profile.profilePic) {
        pic.src = `${API_BASE}/api/proxy-image?url=${encodeURIComponent(profile.profilePic)}`;
    }
    name.textContent = profile.fullName || profile.username;
    username.textContent = `@${profile.username}`;
    postCount.textContent = `${profile.postCount.toLocaleString()} posts`;

    card.classList.add('visible');
}

function renderBulkGrid(items) {
    const grid = document.getElementById('bulkGrid');
    grid.innerHTML = '';

    items.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'bulk-item';
        div.dataset.index = index;
        div.onclick = () => toggleBulkSelect(index);

        const proxyThumb = `${API_BASE}/api/proxy-image?url=${encodeURIComponent(item.thumbnailUrl)}`;

        let typeIndicator = '';
        if (item.isCarousel) {
            typeIndicator = `<div class="bulk-item-carousel">
                <svg viewBox="0 0 24 24" fill="white" width="18" height="18">
                    <rect x="2" y="6" width="15" height="15" rx="2" fill="none" stroke="white" stroke-width="2"/>
                    <rect x="7" y="3" width="15" height="15" rx="2" fill="none" stroke="white" stroke-width="2"/>
                </svg>
            </div>`;
        } else {
            typeIndicator = `<span class="bulk-item-type">${item.type === 'video' ? '▶' : '📷'}</span>`;
        }

        div.innerHTML = `
            <img src="${proxyThumb}" alt="Post" loading="lazy">
            <div class="bulk-item-check">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
            </div>
            ${typeIndicator}
            <div class="bulk-item-overlay">
                <div class="bulk-item-stats">
                    <span class="bulk-item-stat">❤️ ${formatCount(item.likeCount)}</span>
                    <span class="bulk-item-stat">💬 ${formatCount(item.commentCount)}</span>
                </div>
            </div>
        `;
        grid.appendChild(div);
    });
}

function toggleBulkSelect(index) {
    if (bulkState.selected.has(index)) {
        bulkState.selected.delete(index);
    } else {
        bulkState.selected.add(index);
    }

    // Update UI
    const gridItems = document.querySelectorAll('.bulk-item');
    gridItems.forEach((el, i) => {
        el.classList.toggle('selected', bulkState.selected.has(i));
    });

    updateSelectionUI();
}

function toggleSelectAll() {
    const allSelected = bulkState.selected.size === bulkState.items.length;

    if (allSelected) {
        bulkState.selected.clear();
    } else {
        bulkState.items.forEach((_, i) => bulkState.selected.add(i));
    }

    const gridItems = document.querySelectorAll('.bulk-item');
    gridItems.forEach((el, i) => {
        el.classList.toggle('selected', bulkState.selected.has(i));
    });

    updateSelectionUI();
}

function updateSelectionUI() {
    const count = bulkState.selected.size;
    document.getElementById('selectedCount').textContent = count;
    document.getElementById('btnBulkDownload').disabled = count === 0;
    document.getElementById('selectAllText').textContent =
        count === bulkState.items.length ? 'Deselect All' : 'Select All';
}

async function bulkDownloadSelected() {
    if (bulkState.selected.size === 0) return;

    const btn = document.getElementById('btnBulkDownload');
    btn.disabled = true;
    btn.textContent = 'Preparing...';

    const selectedItems = [...bulkState.selected].map(i => bulkState.items[i]);
    let downloaded = 0;

    for (const item of selectedItems) {
        try {
            // Fetch full media for each post
            const res = await fetch(`${API_BASE}/api/fetch-post-media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shortcode: item.shortcode }),
            });

            const data = await res.json();
            if (data.success && data.items.length > 0) {
                for (let j = 0; j < data.items.length; j++) {
                    const media = data.items[j];
                    const ext = media.type === 'video' ? 'mp4' : 'jpg';
                    const proxyEndpoint = media.type === 'video' ? 'proxy-video' : 'proxy-image';
                    const filename = `instasave_${item.shortcode}${data.items.length > 1 ? '_' + (j + 1) : ''}.${ext}`;
                    const downloadUrl = `${API_BASE}/api/${proxyEndpoint}?url=${encodeURIComponent(media.url)}&download=true&filename=${encodeURIComponent(filename)}`;

                    // Fetch as blob and trigger download
                    try {
                        const dlRes = await fetch(downloadUrl);
                        const blob = await dlRes.blob();
                        const blobUrl = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = blobUrl;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(blobUrl);
                    } catch (dlErr) {
                        console.error(`Download failed for ${filename}:`, dlErr);
                    }

                    // Delay between downloads
                    await new Promise(r => setTimeout(r, 800));
                }
                downloaded++;
            }
        } catch (err) {
            console.error(`Failed to download ${item.shortcode}:`, err);
        }

        btn.textContent = `Downloading ${downloaded}/${selectedItems.length}...`;
    }

    btn.disabled = false;
    btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Download Selected
    `;

    showToast('✅', `Downloaded ${downloaded} post${downloaded !== 1 ? 's' : ''}!`);
}

// Pagination
function renderPagination() {
    const pag = document.getElementById('pagination');
    const prevBtn = document.getElementById('btnPrevPage');
    const nextBtn = document.getElementById('btnNextPage');
    const pageInfo = document.getElementById('pageInfo');

    pag.classList.add('visible');
    prevBtn.disabled = bulkState.currentPage <= 1;
    nextBtn.disabled = !bulkState.cursor;
    pageInfo.textContent = `Page ${bulkState.currentPage}`;
}

function loadNextPage() {
    if (!bulkState.cursor) return;
    bulkState.cursorHistory.push(bulkState.cursor);
    bulkState.currentPage++;
    fetchProfileMedia(bulkState.cursor);
}

function loadPrevPage() {
    if (bulkState.currentPage <= 1) return;
    bulkState.currentPage--;
    const prevCursor = bulkState.cursorHistory.length > 1
        ? bulkState.cursorHistory[bulkState.cursorHistory.length - 2]
        : null;
    // For going back to page 1, we need to re-fetch without cursor
    if (bulkState.currentPage === 1) {
        bulkState.cursorHistory = [];
        // Reset and re-fetch
        const url = bulkState.profileUrl;
        bulkState.cursor = null;
        document.getElementById('profileUrlInput').value = url;
        fetchProfileMedia(null);
    } else {
        bulkState.cursorHistory.pop();
        fetchProfileMedia(prevCursor);
    }
}

// Bulk UI helpers
function showBulkLoading() {
    document.getElementById('bulkLoadingSection').classList.add('visible');
}
function hideBulkLoading() {
    document.getElementById('bulkLoadingSection').classList.remove('visible');
}
function showBulkError(msg) {
    document.getElementById('bulkErrorText').textContent = msg;
    document.getElementById('bulkErrorSection').classList.add('visible');
}
function hideBulkError() {
    document.getElementById('bulkErrorSection').classList.remove('visible');
}
function clearBulkError() {
    hideBulkError();
    document.getElementById('profileUrlInput').focus();
}
function showBulkSelectionBar() {
    document.getElementById('bulkSelectionBar').classList.add('visible');
}
function hideBulkSelectionBar() {
    document.getElementById('bulkSelectionBar').classList.remove('visible');
}
function hideBulkProfile() {
    document.getElementById('profileCard').classList.remove('visible');
}


// ═══════════════════════════════════════════════════════════════
//  TAB 3: PRIVATE & EXCLUSIVE (Original functionality — UNCHANGED)
// ═══════════════════════════════════════════════════════════════

// ─── Session Management ────────────────────────────────────────
async function checkSession() {
    try {
        const res = await fetch(`${API_BASE}/api/session-status`);
        const data = await res.json();

        if (data.loggedIn) {
            setLoggedIn(data.username);
        } else {
            setLoggedOut();
        }
    } catch {
        setLoggedOut();
    }
}

function setLoggedIn(username) {
    sessionBadge.classList.add('active');
    sessionText.textContent = `@${username}`;
    btnSessionText.textContent = 'Logout';
    btnSession.classList.add('logged-in');
    btnSession.onclick = logout;
}

function setLoggedOut() {
    sessionBadge.classList.remove('active');
    sessionText.textContent = 'Not Connected';
    btnSessionText.textContent = 'Login';
    btnSession.classList.remove('logged-in');
    btnSession.onclick = toggleLoginModal;
}

async function loginWithSession() {
    const sessionid = sessionInput.value.trim();
    if (!sessionid) {
        showLoginError('Please paste your sessionid cookie.');
        return;
    }

    const btnConnect = document.getElementById('btnConnect');
    btnConnect.disabled = true;
    btnConnect.textContent = 'Connecting...';
    hideLoginError();

    try {
        const res = await fetch(`${API_BASE}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionid }),
        });

        const data = await res.json();

        if (res.ok && data.success) {
            setLoggedIn(data.username);
            toggleLoginModal();
            sessionInput.value = '';
            showToast('✅', `Connected as @${data.username}`);
        } else {
            showLoginError(data.error || 'Failed to connect. Check your sessionid.');
        }
    } catch (err) {
        console.error('Login error:', err);
        showLoginError('Connection error. Check console or make sure server is running.');
    } finally {
        btnConnect.disabled = false;
        btnConnect.textContent = 'Connect';
    }
}

async function logout() {
    try {
        await fetch(`${API_BASE}/api/logout`, { method: 'POST' });
    } catch { /* ignore */ }
    setLoggedOut();
    showToast('👋', 'Disconnected from Instagram');
}

function showLoginError(msg) {
    loginError.textContent = msg;
    loginError.classList.add('visible');
}

function hideLoginError() {
    loginError.classList.remove('visible');
}

// ─── Modal ─────────────────────────────────────────────────────
function toggleLoginModal() {
    loginModal.classList.toggle('visible');
    if (loginModal.classList.contains('visible')) {
        setTimeout(() => sessionInput.focus(), 300);
    }
    hideLoginError();
}

// ─── Fetch Video ───────────────────────────────────────────────
async function fetchVideo() {
    const url = urlInput.value.trim();
    if (!url) {
        urlInput.focus();
        return;
    }

    // Basic URL validation
    if (!url.includes('instagram.com')) {
        showError('Please enter a valid Instagram URL.');
        return;
    }

    showLoading();
    hideError();
    hidePlayer();

    try {
        const res = await fetch(`${API_BASE}/api/fetch-video`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
        });

        const data = await res.json();

        if (res.status === 401) {
            hideLoading();
            showError(data.error || 'Please login first.');
            // Auto-open login modal
            setTimeout(() => toggleLoginModal(), 500);
            return;
        }

        if (!res.ok || !data.success) {
            hideLoading();
            showError(data.error || 'Could not fetch video.');
            return;
        }

        currentVideoData = data;

        // Set video source through proxy
        const proxyUrl = `${API_BASE}/api/proxy-video?url=${encodeURIComponent(data.videoUrl)}`;
        videoPlayer.src = proxyUrl;

        // Set metadata
        playerUsername.textContent = data.username ? `@${data.username}` : 'Instagram User';
        btnOpenIG.href = url;

        if (data.caption && data.caption.trim()) {
            playerCaption.textContent = truncateCaption(data.caption, 200);
            playerCaption.classList.add('visible');
        } else {
            playerCaption.classList.remove('visible');
        }

        // Add to history
        addToHistory({
            url,
            shortcode: data.shortcode,
            username: data.username,
            thumbnailUrl: data.thumbnailUrl,
            timestamp: Date.now(),
        });

        hideLoading();
        showPlayer();
        videoPlayer.play().catch(() => { /* autoplay blocked — that's ok */ });

    } catch (err) {
        hideLoading();
        console.error('Fetch error:', err);
        showError('Connection error (Check console for details). Make sure server is running.');
    }
}

// ─── UI State Helpers ──────────────────────────────────────────
function showLoading() {
    loadingSection.classList.add('visible');
}

function hideLoading() {
    loadingSection.classList.remove('visible');
}

function showError(msg) {
    errorText.textContent = msg;
    errorSection.classList.add('visible');
}

function hideError() {
    errorSection.classList.remove('visible');
}

function clearError() {
    hideError();
    urlInput.focus();
    urlInput.select();
}

function showPlayer() {
    playerCard.classList.add('visible');
    playerCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function hidePlayer() {
    playerCard.classList.remove('visible');
    videoPlayer.pause();
    videoPlayer.src = '';
}

// ─── Download & Copy ───────────────────────────────────────────
function downloadVideo() {
    if (!currentVideoData) return;
    const proxyUrl = `${API_BASE}/api/proxy-video?url=${encodeURIComponent(currentVideoData.videoUrl)}`;

    const a = document.createElement('a');
    a.href = proxyUrl;
    a.download = `instasave_${currentVideoData.shortcode || 'video'}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('⬇️', 'Download started!');
}

function copyVideoLink() {
    const url = urlInput.value.trim();
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
        showToast('📋', 'Link copied to clipboard!');
    }).catch(() => {
        showToast('⚠️', 'Could not copy link');
    });
}

// ─── History ───────────────────────────────────────────────────
function getHistory() {
    try {
        return JSON.parse(localStorage.getItem('instasave_history') || '[]');
    } catch {
        return [];
    }
}

function saveHistory(history) {
    localStorage.setItem('instasave_history', JSON.stringify(history));
}

function addToHistory(item) {
    let history = getHistory();
    // Remove duplicate
    history = history.filter(h => h.shortcode !== item.shortcode);
    history.unshift(item);
    // Keep max 12
    history = history.slice(0, 12);
    saveHistory(history);
    renderHistory();
}

function renderHistory() {
    const history = getHistory();

    if (history.length === 0) {
        historySection.classList.remove('visible');
        return;
    }

    historySection.classList.add('visible');
    historyGrid.innerHTML = '';

    history.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.onclick = () => {
            urlInput.value = item.url;
            fetchVideo();
        };

        const thumbnailSrc = item.thumbnailUrl
            ? `${API_BASE}/api/proxy-image?url=${encodeURIComponent(item.thumbnailUrl)}`
            : '';

        div.innerHTML = `
            ${thumbnailSrc ? `<img src="${thumbnailSrc}" alt="Thumbnail" loading="lazy">` : ''}
            <div class="history-item-overlay">
                <span class="history-item-user">${item.username ? '@' + item.username : 'Video'}</span>
            </div>
            <div class="history-item-play">
                <svg viewBox="0 0 24 24" fill="white" width="16" height="16">
                    <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
            </div>
        `;
        historyGrid.appendChild(div);
    });
}

function clearHistory() {
    localStorage.removeItem('instasave_history');
    renderHistory();
    showToast('🗑️', 'History cleared');
}

// ═══════════════════════════════════════════════════════════════
//  TAB 4: STORY & HIGHLIGHT DOWNLOADER
// ═══════════════════════════════════════════════════════════════

let currentStoryData = null;

async function fetchStories() {
    const input = document.getElementById('storyUrlInput');
    const url = input.value.trim();
    if (!url) {
        input.focus();
        return;
    }

    if (!url.includes('instagram.com')) {
        showStoryError('Please enter a valid Instagram story or highlight URL.');
        return;
    }

    showStoryLoading();
    hideStoryError();
    hideStoryResults();

    try {
        const res = await fetch(`${API_BASE}/api/fetch-stories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
            hideStoryLoading();
            showStoryError(data.error || 'Could not fetch stories.');
            if (data.needsLogin) {
                setTimeout(() => toggleLoginModal(), 500);
            }
            return;
        }

        currentStoryData = data;
        renderStoryMedia(data);
        hideStoryLoading();

    } catch (err) {
        hideStoryLoading();
        showStoryError('Network error. Make sure the server is running.');
    }
}

function renderStoryMedia(data) {
    const grid = document.getElementById('storyMediaGrid');
    const usernameEl = document.getElementById('storyUsername');
    const countEl = document.getElementById('storyMediaCount');
    const noContent = document.getElementById('storyNoContent');
    const noContentText = document.getElementById('storyNoContentText');
    const profilePic = document.getElementById('storyProfilePic');
    const downloadAllBtn = document.getElementById('btnDownloadAllStories');

    // Set user info
    const typeLabel = data.type === 'highlight' ? data.title || 'Highlight' : 'Stories';
    usernameEl.textContent = data.username ? `@${data.username} — ${typeLabel}` : typeLabel;

    if (data.profilePic) {
        profilePic.src = `${API_BASE}/api/proxy-image?url=${encodeURIComponent(data.profilePic)}`;
        profilePic.style.display = 'block';
    } else {
        profilePic.style.display = 'none';
    }

    grid.innerHTML = '';

    if (!data.items || data.items.length === 0) {
        countEl.textContent = '0 items';
        noContentText.textContent = data.message || `No active ${data.type === 'highlight' ? 'highlight' : 'stories'} found.`;
        noContent.style.display = 'block';
        downloadAllBtn.style.display = 'none';
        showStoryResults();
        return;
    }

    noContent.style.display = 'none';
    downloadAllBtn.style.display = '';
    countEl.textContent = `${data.items.length} item${data.items.length !== 1 ? 's' : ''}`;

    data.items.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'media-item';

        const proxyUrl = `${API_BASE}/api/proxy-image?url=${encodeURIComponent(item.thumbnailUrl || item.url)}`;

        const timeStr = item.timestamp ? new Date(item.timestamp * 1000).toLocaleString() : '';

        div.innerHTML = `
            <img src="${proxyUrl}" alt="Story ${index + 1}" loading="lazy">
            <span class="media-type-badge">${item.type === 'video' ? '▶ Video' : '📷 Photo'}</span>
            ${timeStr ? `<span class="media-time-badge" style="position:absolute;bottom:8px;left:8px;font-size:0.65rem;background:rgba(0,0,0,0.7);padding:2px 6px;border-radius:4px;color:#fff;">${timeStr}</span>` : ''}
            <div class="media-item-overlay">
                <span></span>
                <button class="media-item-download" onclick="event.stopPropagation(); downloadStoryItem(${index})" title="Download">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                </button>
            </div>
        `;
        grid.appendChild(div);
    });

    showStoryResults();
}

function downloadStoryItem(index) {
    if (!currentStoryData || !currentStoryData.items[index]) return;
    const item = currentStoryData.items[index];
    const ext = item.type === 'video' ? 'mp4' : 'jpg';
    const prefix = currentStoryData.type === 'highlight' ? 'highlight' : 'story';
    const filename = `instasave_${prefix}_${currentStoryData.username || 'media'}_${index + 1}.${ext}`;
    const proxyEndpoint = item.type === 'video' ? 'proxy-video' : 'proxy-image';
    const downloadUrl = `${API_BASE}/api/${proxyEndpoint}?url=${encodeURIComponent(item.url)}&download=true&filename=${encodeURIComponent(filename)}`;

    showToast('⬇️', `Downloading ${item.type}...`);

    fetch(downloadUrl)
        .then(res => res.blob())
        .then(blob => {
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
        })
        .catch(err => {
            console.error('Download failed:', err);
            showToast('❌', 'Download failed');
        });
}

function downloadAllStories() {
    if (!currentStoryData || !currentStoryData.items.length) return;
    currentStoryData.items.forEach((_, i) => {
        setTimeout(() => downloadStoryItem(i), i * 800);
    });
    showToast('⬇️', `Downloading ${currentStoryData.items.length} items...`);
}

// Story UI helpers
function showStoryLoading() {
    document.getElementById('storyLoadingSection').classList.add('visible');
}
function hideStoryLoading() {
    document.getElementById('storyLoadingSection').classList.remove('visible');
}
function showStoryError(msg) {
    document.getElementById('storyErrorText').textContent = msg;
    document.getElementById('storyErrorSection').classList.add('visible');
}
function hideStoryError() {
    document.getElementById('storyErrorSection').classList.remove('visible');
}
function clearStoryError() {
    hideStoryError();
    document.getElementById('storyUrlInput').focus();
}
function showStoryResults() {
    document.getElementById('storyResultsSection').classList.add('visible');
}
function hideStoryResults() {
    document.getElementById('storyResultsSection').classList.remove('visible');
}

// ═══════════════════════════════════════════════════════════════
//  SHARED UTILITIES
// ═══════════════════════════════════════════════════════════════

// ─── Toast ─────────────────────────────────────────────────────
let toastTimeout;
function showToast(icon, message) {
    const toast = document.getElementById('toast');
    const toastIcon = document.getElementById('toastIcon');
    const toastText = document.getElementById('toastText');

    toastIcon.textContent = icon;
    toastText.textContent = message;
    toast.classList.add('visible');

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('visible');
    }, 3000);
}

function truncateCaption(text, maxLen) {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen).trim() + '...';
}

function formatCount(num) {
    if (!num) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}
