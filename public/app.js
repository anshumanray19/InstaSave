/* ═══════════════════════════════════════════════════════════════
   InstaSave — Client-side JS
   ═══════════════════════════════════════════════════════════════ */

const API_BASE = '';

// ─── DOM Elements ──────────────────────────────────────────────
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

// ─── Initialize ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    renderHistory();

    // Enter key to search
    urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') fetchVideo();
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
        showLoginError('Network error. Make sure the server is running.');
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
        showError('Network error. Make sure the server is running at localhost:3000.');
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

// ─── Utilities ─────────────────────────────────────────────────
function truncateCaption(text, maxLen) {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen).trim() + '...';
}
