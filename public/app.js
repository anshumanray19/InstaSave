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

    // Close info modal on overlay click
    const infoModal = document.getElementById('infoModal');
    infoModal.addEventListener('click', (e) => {
        if (e.target === infoModal) closeInfoModal();
    });

    // Enter key for notify email
    document.getElementById('notifyEmailInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') registerNotification();
    });

    // Enter key for YouTube tab
    document.getElementById('ytUrlInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') fetchYouTubeInfo();
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

        let downloadButtons = `
            <button class="media-item-download" onclick="event.stopPropagation(); downloadPublicItem(${index})" title="Download Media">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
            </button>
        `;

        if (item.type === 'video' && (item.thumbnailUrl || item.url)) {
            downloadButtons += `
                <button class="media-item-download" onclick="event.stopPropagation(); downloadPublicItemThumbnail(${index})" title="Download Thumbnail" style="margin-left: 6px; background: rgba(255,255,255,0.35);">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                    </svg>
                </button>
            `;
        }

        div.innerHTML = `
            <img src="${proxyUrl}" alt="Media ${index + 1}" loading="lazy">
            <span class="media-type-badge">${item.type === 'video' ? '▶ Video' : '📷 Photo'}</span>
            <div class="media-item-overlay">
                <span></span>
                <div style="display: flex;">
                    ${downloadButtons}
                </div>
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

function downloadPublicItemThumbnail(index) {
    if (!currentPublicMediaData || !currentPublicMediaData.items[index]) return;
    const item = currentPublicMediaData.items[index];
    const thumbUrl = item.thumbnailUrl || item.url;
    if (!thumbUrl) return;

    const filename = `instasave_${currentPublicMediaData.shortcode || 'media'}_${index + 1}_thumb.jpg`;
    const downloadUrl = `${API_BASE}/api/proxy-image?url=${encodeURIComponent(thumbUrl)}&download=true&filename=${encodeURIComponent(filename)}`;

    showToast('⬇️', 'Downloading thumbnail...');

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
            console.error('Thumbnail download failed:', err);
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
            body: JSON.stringify({
                profileUrl,
                cursor,
                // Send userId on page 2+ so server skips the redundant web_profile_info lookup
                userId: cursor ? bulkState.profileData?.userId : undefined,
            }),
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
            hideBulkLoading();
            showBulkError(data.error || 'Could not fetch profile.');
            return;
        }

        // Store state — profileData is only sent on page 1, keep the existing one for page 2+
        bulkState.items = data.items;
        bulkState.cursor = data.nextCursor;
        if (data.profileData) bulkState.profileData = data.profileData;
        bulkState.selected = new Set();

        // Show profile card
        if (data.profileData) {
            renderProfileCard(data.profileData);
        }

        // If we hit the unauthenticated 12-post cap, surface a non-blocking notice
        if (data.paginationLimited && !cursor) {
            showToast('ℹ️', `Showing first ${data.items.length} posts. Log in for the full feed.`);
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
                <div class="bulk-item-actions">
                    <button class="bulk-item-btn bulk-item-view-btn" onclick="event.stopPropagation(); viewBulkItem(${index})" title="View Post">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                    </button>
                    <button class="bulk-item-btn bulk-item-dl-btn" onclick="event.stopPropagation(); downloadSingleBulkItem(${index})" title="Download Post">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                    </button>
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

// View a single bulk item — shows in-app preview modal
async function viewBulkItem(index, slideIndex = 0) {
    const item = bulkState.items[index];
    if (!item) return;

    // Build or get modal
    let modal = document.getElementById('bulkPreviewModal');
    let isNewModal = !modal;

    if (isNewModal) {
        modal = document.createElement('div');
        modal.id = 'bulkPreviewModal';
        modal.className = 'bulk-preview-overlay';
        modal.onclick = (e) => { if (e.target === modal) closeBulkPreview(); };
        document.body.appendChild(modal);

        // Close on Escape key
        const escHandler = (e) => {
            if (e.key === 'Escape') closeBulkPreview();
        };
        document.addEventListener('keydown', escHandler);
        modal._escHandler = escHandler;
    }

    modal.dataset.index = index;
    modal.dataset.shortcode = item.shortcode;

    // Update innerHTML of modal if it's new
    if (isNewModal) {
        modal.innerHTML = `
            <div class="bulk-preview-container">
                <div class="bulk-preview-header">
                    <div class="bulk-preview-info">
                        <span class="bulk-preview-type">...</span>
                        <span class="bulk-preview-caption">...</span>
                    </div>
                    <div class="bulk-preview-actions">
                        <button class="bulk-preview-btn bulk-preview-dl-btn" onclick="event.stopPropagation(); downloadCurrentPreviewItem()" title="Download Slide">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="7 10 12 15 17 10"/>
                                <line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                        </button>
                        <button class="bulk-preview-btn bulk-preview-close-btn" onclick="closeBulkPreview()" title="Close">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="bulk-preview-body">
                    <!-- Media content gets rendered here -->
                </div>
                <div class="bulk-preview-nav">
                    <button class="bulk-preview-nav-btn" onclick="event.stopPropagation(); viewBulkItem(${index > 0 ? index - 1 : bulkState.items.length - 1})" title="Previous Post">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
                            <polyline points="15 18 9 12 15 6"/>
                        </svg>
                    </button>
                    <span class="bulk-preview-counter">${index + 1} / ${bulkState.items.length}</span>
                    <button class="bulk-preview-nav-btn" onclick="event.stopPropagation(); viewBulkItem(${index < bulkState.items.length - 1 ? index + 1 : 0})" title="Next Post">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
                            <polyline points="9 18 15 12 9 6"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
        // Trigger animation
        requestAnimationFrame(() => modal.classList.add('visible'));
    } else {
        // Update post counter
        modal.querySelector('.bulk-preview-counter').textContent = `${index + 1} / ${bulkState.items.length}`;
        // Update post navigation buttons
        const navBtns = modal.querySelectorAll('.bulk-preview-nav-btn');
        navBtns[0].setAttribute('onclick', `event.stopPropagation(); viewBulkItem(${index > 0 ? index - 1 : bulkState.items.length - 1})`);
        navBtns[1].setAttribute('onclick', `event.stopPropagation(); viewBulkItem(${index < bulkState.items.length - 1 ? index + 1 : 0})`);
    }

    // Update basic header caption
    modal.querySelector('.bulk-preview-caption').textContent = item.caption ? truncateCaption(item.caption, 120) : '';

    const typeEl = modal.querySelector('.bulk-preview-type');
    const bodyEl = modal.querySelector('.bulk-preview-body');

    // Helper to update body for a specific media item
    const setMediaContent = (mediaItem, currentSlide, totalSlides) => {
        const isVideo = mediaItem.type === 'video';
        const proxyEndpoint = isVideo ? 'proxy-video' : 'proxy-image';
        const proxyUrl = `${API_BASE}/api/${proxyEndpoint}?url=${encodeURIComponent(mediaItem.url)}`;

        typeEl.textContent = `${isVideo ? '▶ Video' : '📷 Photo'} ${totalSlides > 1 ? `(Slide ${currentSlide + 1}/${totalSlides})` : ''}`;

        let mediaTag = '';
        if (isVideo) {
            mediaTag = `<video src="${proxyUrl}" controls autoplay playsinline class="bulk-preview-media"></video>`;
        } else {
            mediaTag = `<img src="${proxyUrl}" alt="Preview" class="bulk-preview-media">`;
        }

        // Slide arrows if multiple slides
        if (totalSlides > 1) {
            const prevSlide = slideIndex > 0 ? slideIndex - 1 : totalSlides - 1;
            const nextSlide = slideIndex < totalSlides - 1 ? slideIndex + 1 : 0;
            bodyEl.innerHTML = `
                <div class="bulk-preview-slide-container" style="position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
                    <button class="bulk-preview-slide-arrow bulk-preview-slide-left" onclick="event.stopPropagation(); viewBulkItem(${index}, ${prevSlide})" style="position: absolute; left: 15px; z-index: 10; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.2); color: white; border-radius: 50%; width: 40px; height: 40px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; transition: background 0.2s;">
                        ‹
                    </button>
                    ${mediaTag}
                    <button class="bulk-preview-slide-arrow bulk-preview-slide-right" onclick="event.stopPropagation(); viewBulkItem(${index}, ${nextSlide})" style="position: absolute; right: 15px; z-index: 10; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.2); color: white; border-radius: 50%; width: 40px; height: 40px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; transition: background 0.2s;">
                        ›
                    </button>
                </div>
            `;
        } else {
            bodyEl.innerHTML = mediaTag;
        }

        // Store current details for downloader
        modal.dataset.currentMediaUrl = mediaItem.url;
        modal.dataset.currentMediaType = mediaItem.type;
        modal.dataset.currentSlideIndex = currentSlide;
    };

    // Case 1: Item is a carousel
    if (item.isCarousel) {
        if (item.carouselItems && item.carouselItems.length > 0) {
            setMediaContent(item.carouselItems[slideIndex], slideIndex, item.carouselItems.length);
        } else {
            // Fetch slides in background
            typeEl.textContent = '📷 Carousel (Loading slides...)';
            bodyEl.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; gap: 12px; color: var(--text-secondary);">
                    <div class="loader-ring"></div>
                    <span>Fetching slide gallery...</span>
                </div>
            `;

            try {
                const res = await fetch(`${API_BASE}/api/fetch-post-media`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ shortcode: item.shortcode }),
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.items?.length > 0) {
                        item.carouselItems = data.items;
                        // Check if user is still viewing this post
                        const currentModal = document.getElementById('bulkPreviewModal');
                        if (currentModal && currentModal.dataset.shortcode === item.shortcode) {
                            viewBulkItem(index, 0);
                        }
                        return;
                    }
                }
            } catch (err) {
                console.error('Carousel fetch error:', err);
            }

            // Fallback if fetch fails: show first thumbnail/mediaUrl as single image
            const fallbackMedia = { type: item.type, url: item.mediaUrl || item.thumbnailUrl };
            setMediaContent(fallbackMedia, 0, 1);
            showToast('⚠️', 'Could not load carousel gallery; showing first slide');
        }
    }
    // Case 2: Item is a video but no video URL available directly (e.g. web fallback)
    else if (item.type === 'video' && !item.hasVideoUrl) {
        // Show thumbnail placeholder first
        const fallbackMedia = { type: 'image', url: item.mediaUrl || item.thumbnailUrl };
        setMediaContent(fallbackMedia, 0, 1);

        typeEl.textContent = '▶ Video (Resolving URL...)';
        const wrapper = bodyEl.querySelector('.bulk-preview-slide-container') || bodyEl;
        const originalHtml = wrapper.innerHTML;
        wrapper.innerHTML = `
            <div style="position: relative; display: flex; justify-content: center; align-items: center; width: 100%; height: 100%;">
                ${originalHtml}
                <div style="position: absolute; display: flex; flex-direction: column; align-items: center; gap: 8px; color: white; background: rgba(0,0,0,0.6); padding: 12px 20px; border-radius: 8px;">
                    <div class="loader-ring" style="width: 20px; height: 20px; border-width: 2px;"></div>
                    <span style="font-size: 0.8rem; font-weight: 500;">Loading video stream...</span>
                </div>
            </div>
        `;

        try {
            const res = await fetch(`${API_BASE}/api/fetch-post-media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shortcode: item.shortcode }),
            });
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.items?.length > 0) {
                    const videoItem = data.items.find(mi => mi.type === 'video');
                    if (videoItem && videoItem.url) {
                        item.mediaUrl = videoItem.url;
                        item.hasVideoUrl = true;

                        const currentModal = document.getElementById('bulkPreviewModal');
                        if (currentModal && currentModal.dataset.shortcode === item.shortcode) {
                            setMediaContent(videoItem, 0, 1);
                        }
                        return;
                    }
                }
            }
        } catch (err) {
            console.error('Video fetch error:', err);
        }

        // If fetch fails, keep showing static image cover
        const currentModal = document.getElementById('bulkPreviewModal');
        if (currentModal && currentModal.dataset.shortcode === item.shortcode) {
            setMediaContent(fallbackMedia, 0, 1);
            showToast('ℹ️', 'Could not load video; showing image cover');
        }
    }
    // Case 3: Standard single image or video with URL already cached
    else {
        const singleMedia = { type: item.type, url: item.mediaUrl || item.thumbnailUrl };
        setMediaContent(singleMedia, 0, 1);
    }
}

function closeBulkPreview() {
    const modal = document.getElementById('bulkPreviewModal');
    if (!modal) return;
    if (modal._escHandler) document.removeEventListener('keydown', modal._escHandler);
    modal.classList.remove('visible');
    // Pause any video
    const video = modal.querySelector('video');
    if (video) video.pause();
    setTimeout(() => modal.remove(), 300);
}

// Download currently visible slide inside the preview modal
async function downloadCurrentPreviewItem() {
    const modal = document.getElementById('bulkPreviewModal');
    if (!modal) return;
    const index = parseInt(modal.dataset.index);
    const item = bulkState.items[index];
    if (!item) return;

    const url = modal.dataset.currentMediaUrl;
    const type = modal.dataset.currentMediaType;
    const slideIdx = parseInt(modal.dataset.currentSlideIndex || '0');

    if (!url) {
        showToast('❌', 'No download URL available');
        return;
    }

    const ext = type === 'video' ? 'mp4' : 'jpg';
    const proxyEndpoint = type === 'video' ? 'proxy-video' : 'proxy-image';
    const filename = `instasave_${item.shortcode || 'post'}_slide${slideIdx + 1}.${ext}`;
    const downloadUrl = `${API_BASE}/api/${proxyEndpoint}?url=${encodeURIComponent(url)}&download=true&filename=${encodeURIComponent(filename)}`;

    showToast('⬇️', `Downloading ${type}...`);
    try {
        const dlRes = await fetch(downloadUrl);
        if (!dlRes.ok) throw new Error(`HTTP ${dlRes.status}`);
        const blob = await dlRes.blob();
        if (blob.size === 0) throw new Error('File is empty');
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
        showToast('✅', 'Downloaded!');
    } catch (err) {
        console.error('Preview download failed:', err);
        showToast('❌', 'Download failed — rate limited/network error');
    }
}

// Helper: Resolves all media URLs for a post (fetches slides or resolves missing video url if needed)
async function resolvePostMediaUrls(item) {
    if (item.isCarousel && (!item.carouselItems || item.carouselItems.length === 0)) {
        try {
            const res = await fetch(`${API_BASE}/api/fetch-post-media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shortcode: item.shortcode }),
            });
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.items?.length > 0) {
                    item.carouselItems = data.items;
                }
            }
        } catch (e) {
            console.error('Resolve carousel media fail:', e);
        }
    } else if (item.type === 'video' && !item.hasVideoUrl) {
        try {
            const res = await fetch(`${API_BASE}/api/fetch-post-media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shortcode: item.shortcode }),
            });
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.items?.length > 0) {
                    const videoItem = data.items.find(mi => mi.type === 'video');
                    if (videoItem && videoItem.url) {
                        item.mediaUrl = videoItem.url;
                        item.hasVideoUrl = true;
                    }
                }
            }
        } catch (e) {
            console.error('Resolve video URL fail:', e);
        }
    }

    if (item.isCarousel && item.carouselItems && item.carouselItems.length > 0) {
        return item.carouselItems;
    } else {
        return [{ type: item.type, url: item.mediaUrl || item.thumbnailUrl }];
    }
}

// Download a single post (and all its carousel slides if it has them) from the bulk grid
async function downloadSingleBulkItem(index) {
    const item = bulkState.items[index];
    if (!item) return;

    showToast('⬇️', 'Preparing download...');

    try {
        const mediaList = await resolvePostMediaUrls(item);
        if (!mediaList || mediaList.length === 0) {
            showToast('❌', 'No download URLs available');
            return;
        }

        let downloaded = 0;
        let failed = 0;

        for (let sIdx = 0; sIdx < mediaList.length; sIdx++) {
            const m = mediaList[sIdx];
            const ext = m.type === 'video' ? 'mp4' : 'jpg';
            const proxyEndpoint = m.type === 'video' ? 'proxy-video' : 'proxy-image';
            const filename = `instasave_${item.shortcode || 'post'}_${sIdx + 1}.${ext}`;
            const downloadUrl = `${API_BASE}/api/${proxyEndpoint}?url=${encodeURIComponent(m.url)}&download=true&filename=${encodeURIComponent(filename)}`;

            try {
                const dlRes = await fetch(downloadUrl);
                if (!dlRes.ok) throw new Error(`HTTP ${dlRes.status}`);
                const blob = await dlRes.blob();
                if (blob.size === 0) throw new Error('File is empty');
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
                downloaded++;
            } catch (err) {
                console.error(`Failed to download slide ${sIdx + 1}:`, err);
                failed++;
            }

            if (sIdx < mediaList.length - 1) {
                await new Promise(r => setTimeout(r, 600)); // Delay between slides
            }
        }

        if (failed > 0) {
            showToast('⚠️', `Downloaded ${downloaded}/${mediaList.length} files.`);
        } else {
            showToast('✅', 'Downloaded!');
        }
    } catch (err) {
        console.error('Download error:', err);
        showToast('❌', 'Download failed');
    }
}

// Download selected bulk items
async function bulkDownloadSelected() {
    if (bulkState.selected.size === 0) return;

    const btn = document.getElementById('btnBulkDownload');
    btn.disabled = true;
    btn.textContent = 'Preparing...';

    const selectedItems = [...bulkState.selected].map(i => bulkState.items[i]);
    let downloaded = 0;
    let failed = 0;

    for (let idx = 0; idx < selectedItems.length; idx++) {
        const item = selectedItems[idx];
        btn.textContent = `Processing post ${idx + 1}/${selectedItems.length}...`;

        try {
            const mediaList = await resolvePostMediaUrls(item);
            for (let sIdx = 0; sIdx < mediaList.length; sIdx++) {
                const m = mediaList[sIdx];
                const ext = m.type === 'video' ? 'mp4' : 'jpg';
                const proxyEndpoint = m.type === 'video' ? 'proxy-video' : 'proxy-image';
                const filename = `instasave_${item.shortcode || 'post'}_${idx + 1}_${sIdx + 1}.${ext}`;
                const downloadUrl = `${API_BASE}/api/${proxyEndpoint}?url=${encodeURIComponent(m.url)}&download=true&filename=${encodeURIComponent(filename)}`;

                try {
                    const dlRes = await fetch(downloadUrl);
                    if (!dlRes.ok) throw new Error(`HTTP ${dlRes.status}`);
                    const blob = await dlRes.blob();
                    if (blob.size === 0) throw new Error('File is empty');
                    const blobUrl = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
                    downloaded++;
                } catch (err) {
                    console.error(`Bulk download fail: ${filename}`, err);
                    failed++;
                }

                // Short delay between slide files
                await new Promise(r => setTimeout(r, 600));
            }
        } catch (err) {
            console.error('Bulk download resolve fail:', err);
            failed++;
        }

        // Delay between posts
        if (idx < selectedItems.length - 1) {
            await new Promise(r => setTimeout(r, 1000));
        }
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

    if (failed > 0) {
        showToast('⚠️', `Downloaded ${downloaded} file${downloaded !== 1 ? 's' : ''}, ${failed} failed.`);
    } else {
        showToast('✅', `Downloaded all ${downloaded} files!`);
    }
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
        const btnDownloadThumb = document.getElementById('btnDownloadThumb');
        if (btnDownloadThumb) {
            btnDownloadThumb.style.display = data.thumbnailUrl ? 'flex' : 'none';
        }
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
    const btnDownloadThumb = document.getElementById('btnDownloadThumb');
    if (btnDownloadThumb) btnDownloadThumb.style.display = 'none';
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

function downloadVideoThumbnail() {
    if (!currentVideoData || !currentVideoData.thumbnailUrl) return;
    const filename = `instasave_${currentVideoData.shortcode || 'video'}_thumb.jpg`;
    const downloadUrl = `${API_BASE}/api/proxy-image?url=${encodeURIComponent(currentVideoData.thumbnailUrl)}&download=true&filename=${encodeURIComponent(filename)}`;

    showToast('⬇️', 'Downloading thumbnail...');

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
            console.error('Thumbnail download failed:', err);
            showToast('❌', 'Download failed');
        });
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
//  TAB 6: YOUTUBE DOWNLOADER
// ═══════════════════════════════════════════════════════════════

let currentYtData = null;
let currentYtUrl = '';

async function fetchYouTubeInfo() {
    const input = document.getElementById('ytUrlInput');
    const url = input.value.trim();
    if (!url) {
        input.focus();
        return;
    }

    if (!url.match(/(?:youtube\.com|youtu\.be)/i)) {
        showYtError('Please enter a valid YouTube URL.');
        return;
    }

    currentYtUrl = url;
    showYtLoading();
    hideYtError();
    hideYtResults();

    try {
        const res = await fetch(`${API_BASE}/api/youtube/info`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
            hideYtLoading();
            showYtError(data.error || 'Could not fetch video info.');
            return;
        }

        currentYtData = data;
        renderYouTubeResults(data);
        hideYtLoading();

    } catch (err) {
        hideYtLoading();
        console.error('YouTube fetch error:', err);
        showYtError('Connection error. Make sure the server is running.');
    }
}

function renderYouTubeResults(data) {
    // Set video info
    document.getElementById('ytThumbnail').src = data.thumbnail;
    document.getElementById('ytTitle').textContent = data.title;
    document.getElementById('ytChannel').textContent = data.channel;
    document.getElementById('ytDuration').textContent = formatDuration(data.duration);
    document.getElementById('ytViews').textContent = formatViewCount(data.viewCount) + ' views';

    // Render video+audio formats
    const vaList = document.getElementById('ytFormats-videoaudio');
    vaList.innerHTML = '';
    if (data.videoAudioFormats.length === 0) {
        vaList.innerHTML = '<div class="yt-empty-msg">No video formats available</div>';
    } else {
        data.videoAudioFormats.forEach(f => {
            vaList.appendChild(createFormatRow(f, 'video'));
        });
    }

    // Render audio formats
    const aList = document.getElementById('ytFormats-audio');
    aList.innerHTML = '';
    if (data.audioOnlyFormats.length === 0) {
        aList.innerHTML = '<div class="yt-empty-msg">No audio-only formats available</div>';
    } else {
        data.audioOnlyFormats.forEach(f => {
            aList.appendChild(createFormatRow(f, 'audio'));
        });
    }

    // Default to first tab
    switchYtFormatTab('videoaudio');
    showYtResults();
}

function createFormatRow(f, category) {
    const row = document.createElement('div');
    row.className = 'yt-format-row';

    const isHD = f.height >= 720 || f.abr >= 192;
    const qualityLabel = f.quality || '—';
    const filesizeStr = f.filesize ? formatFilesize(f.filesize) : '—';
    const codecStr = category === 'audio'
        ? (f.acodec || '')
        : (f.vcodec ? f.vcodec : '') + (f.acodec ? ' + ' + f.acodec : '');
    const fpsStr = f.fps && f.fps > 30 ? ` ${f.fps}fps` : '';
    const noteStr = f.note || '';

    row.innerHTML = `
        <span class="yt-quality-badge${isHD ? ' hd' : ''}">${qualityLabel}${fpsStr}</span>
        <div class="yt-format-details">
            <span class="yt-format-ext">${f.ext}</span>
            <span class="yt-format-codec">${codecStr}</span>
            ${noteStr ? `<span class="yt-format-note">${noteStr}</span>` : ''}
        </div>
        <span class="yt-format-size">${filesizeStr}</span>
        <button class="yt-download-btn" onclick="downloadYtFormat('${f.formatId}', '${f.ext}', ${category === 'audio'})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download
        </button>
    `;
    return row;
}

let ytActiveDownload = null; // { source, token }

function downloadYtFormat(formatId, ext, isAudio) {
    if (!currentYtUrl || !currentYtData) return;
    if (ytActiveDownload) {
        showToast('⚠️', 'Another download is already in progress.');
        return;
    }

    const safeTitle = currentYtData.title
        .replace(/[^a-zA-Z0-9\s\-_.]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 80);
    const safeFormatId = formatId.split('+')[0].replace(/[^a-zA-Z0-9]/g, '');
    const filename = `${safeTitle}_${safeFormatId}.${ext}`;

    const params = new URLSearchParams({
        url: currentYtUrl,
        formatId,
        filename,
        audioOnly: isAudio ? 'true' : 'false',
    });
    const prepareUrl = `${API_BASE}/api/youtube/prepare?${params.toString()}`;

    showYtProgress(filename, ext);

    const source = new EventSource(prepareUrl);
    ytActiveDownload = { source };

    source.addEventListener('progress', (e) => {
        try { updateYtProgress(JSON.parse(e.data)); } catch {}
    });

    source.addEventListener('ready', (e) => {
        try {
            const data = JSON.parse(e.data);
            ytProgressReady(data);
            // Trigger native browser download — uses streaming, no memory bloat
            const a = document.createElement('a');
            a.href = `${API_BASE}/api/youtube/file/${data.token}`;
            a.download = data.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => hideYtProgress(), 1800);
        } catch (err) {
            hideYtProgress();
            showToast('❌', 'Could not start file save.');
        } finally {
            source.close();
            ytActiveDownload = null;
        }
    });

    source.addEventListener('fail', (e) => {
        source.close();
        ytActiveDownload = null;
        hideYtProgress();
        let msg = 'Download failed.';
        try { msg = JSON.parse(e.data).error || msg; } catch {}
        showToast('❌', msg);
    });

    source.onerror = () => {
        // EventSource auto-retries; if we got here without a 'ready' or 'fail', the server dropped us
        if (source.readyState === EventSource.CLOSED && ytActiveDownload) {
            source.close();
            ytActiveDownload = null;
            hideYtProgress();
            showToast('❌', 'Connection lost during download.');
        }
    };
}

function cancelYtDownload() {
    if (!ytActiveDownload) return;
    ytActiveDownload.source.close();
    ytActiveDownload = null;
    hideYtProgress();
    showToast('🛑', 'Download cancelled');
}

function showYtProgress(filename, ext) {
    const modal = document.getElementById('ytProgressModal');
    if (!modal) return;
    modal.querySelector('.yt-progress-filename').textContent = filename;
    modal.querySelector('.yt-progress-bar').style.width = '0%';
    modal.querySelector('.yt-progress-percent').textContent = '0%';
    modal.querySelector('.yt-progress-info').textContent = '';
    modal.querySelector('.yt-progress-phase').textContent = 'Connecting…';
    modal.classList.remove('done', 'indeterminate');
    modal.classList.add('visible', 'indeterminate');
}

function updateYtProgress(data) {
    const modal = document.getElementById('ytProgressModal');
    if (!modal) return;

    if (data.phase === 'downloading') {
        modal.classList.remove('indeterminate');
        const pct = Math.max(0, Math.min(100, data.percent || 0));
        modal.querySelector('.yt-progress-bar').style.width = `${pct}%`;
        modal.querySelector('.yt-progress-percent').textContent = `${pct.toFixed(1)}%`;
        const parts = [];
        if (data.totalSize) parts.push(`of ${data.totalSize}`);
        if (data.speed) parts.push(`${data.speed}`);
        if (data.eta) parts.push(`ETA ${data.eta}`);
        modal.querySelector('.yt-progress-info').textContent = parts.join(' • ');
        modal.querySelector('.yt-progress-phase').textContent = 'Downloading';
    } else if (data.phase === 'merging') {
        modal.classList.add('indeterminate');
        modal.querySelector('.yt-progress-phase').textContent = 'Merging video + audio…';
        modal.querySelector('.yt-progress-info').textContent = 'Almost done';
    }
}

function ytProgressReady(data) {
    const modal = document.getElementById('ytProgressModal');
    if (!modal) return;
    modal.classList.remove('indeterminate');
    modal.classList.add('done');
    modal.querySelector('.yt-progress-bar').style.width = '100%';
    modal.querySelector('.yt-progress-percent').textContent = '100%';
    modal.querySelector('.yt-progress-info').textContent = data.size ? formatFilesize(data.size) : '';
    modal.querySelector('.yt-progress-phase').textContent = '✓ Ready — opening save dialog…';
}

function hideYtProgress() {
    const modal = document.getElementById('ytProgressModal');
    if (modal) modal.classList.remove('visible');
}

function switchYtFormatTab(cat) {
    document.querySelectorAll('.yt-format-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.ytcat === cat);
    });
    document.querySelectorAll('.yt-format-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    const target = document.getElementById(`ytPanel-${cat}`);
    if (target) target.classList.add('active');
}

// YouTube UI helpers
function showYtLoading() {
    document.getElementById('ytLoadingSection').classList.add('visible');
}
function hideYtLoading() {
    document.getElementById('ytLoadingSection').classList.remove('visible');
}
function showYtError(msg) {
    document.getElementById('ytErrorText').textContent = msg;
    document.getElementById('ytErrorSection').classList.add('visible');
}
function hideYtError() {
    document.getElementById('ytErrorSection').classList.remove('visible');
}
function clearYtError() {
    hideYtError();
    document.getElementById('ytUrlInput').focus();
}
function showYtResults() {
    document.getElementById('ytResultsSection').classList.add('visible');
}
function hideYtResults() {
    document.getElementById('ytResultsSection').classList.remove('visible');
}

// Format helpers
function formatDuration(seconds) {
    if (!seconds) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function formatViewCount(num) {
    if (!num) return '0';
    if (num >= 1000000000) return (num / 1000000000).toFixed(1) + 'B';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString();
}

function formatFilesize(bytes) {
    if (!bytes) return '—';
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return bytes + ' B';
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

// ═══════════════════════════════════════════════════════════════
//  TAB 0: HOMEPAGE NAVIGATION & INFORMATION MODAL
// ═══════════════════════════════════════════════════════════════

// Info Modal State & Platforms
let currentInfoPlatform = null;
const PLATFORM_DETAILS = {
    youtube: {
        title: 'YouTube Downloader',
        icon: '📺',
        class: 'info-modal-youtube',
        features: [
            'Download videos up to 4K Ultra HD quality',
            'Extract high-quality audio in MP3/M4A format',
            'Save full playlists or channels with one click',
            'Support for YouTube Shorts and YouTube Music'
        ]
    },
    snapchat: {
        title: 'Snapchat Downloader',
        icon: '👻',
        class: 'info-modal-snapchat',
        features: [
            'Save public Snapchat Spotlight videos in HD',
            'Download user stories before they expire (24h)',
            'Extract high-quality snap media without watermarks',
            'Extremely fast, secure, and direct video downloads'
        ]
    },
    twitter: {
        title: 'Twitter / X Downloader',
        icon: '𝕏',
        class: 'info-modal-twitter',
        features: [
            'Download high-definition videos from any tweet',
            'Convert and download Twitter GIFs as MP4',
            'Save thread image galleries in full quality',
            'One-click copy and instant download links'
        ]
    },
    reddit: {
        title: 'Reddit Downloader',
        icon: '👽',
        class: 'info-modal-reddit',
        features: [
            'Save Reddit videos combined with high-quality audio',
            'Download entire image gallery subreddit posts',
            'Save Reddit GIFs, links, and text details',
            'Supports old.reddit.com and new Reddit URLs'
        ]
    },
    threads: {
        title: 'Threads Downloader',
        icon: '🧵',
        class: 'info-modal-threads',
        features: [
            'Download Threads videos and reels in high resolution',
            'Save carousel posts (multiple images) in high quality',
            'Extract and download audio/voice notes from posts',
            'Clean, direct links without Meta API limitations'
        ]
    }
};

// ─── Homepage Navigation ───────────────────────────────────────
function showHomepage() {
    // Hide sub nav
    document.getElementById('tabNav').style.display = 'none';
    
    // Hide header right actions
    document.getElementById('sessionBadge').style.display = 'none';
    document.getElementById('btnSession').style.display = 'none';
    
    // Switch to tab-home
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    const target = document.getElementById('tab-home');
    if (target) {
        target.classList.add('active');
        target.style.animation = 'none';
        target.offsetHeight; // force reflow
        target.style.animation = '';
    }
}

function openDownloader(platform) {
    if (platform === 'instagram') {
        // Show sub nav
        document.getElementById('tabNav').style.display = '';
        
        // Show header right actions
        document.getElementById('sessionBadge').style.display = '';
        document.getElementById('btnSession').style.display = '';
        
        // Switch to the Instagram Media tab by default
        switchTab('media');
    } else if (platform === 'youtube') {
        // Navigate directly to YouTube tab
        // Hide Instagram sub nav, keep header clean
        document.getElementById('tabNav').style.display = 'none';
        document.getElementById('sessionBadge').style.display = 'none';
        document.getElementById('btnSession').style.display = 'none';

        // Switch to YouTube tab
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        const ytTab = document.getElementById('tab-youtube');
        if (ytTab) {
            ytTab.classList.add('active');
            ytTab.style.animation = 'none';
            ytTab.offsetHeight;
            ytTab.style.animation = '';
        }
    } else if (platform === 'facebook') {
        // Hide Instagram sub nav + session UI (Facebook tab is self-contained)
        document.getElementById('tabNav').style.display = 'none';
        document.getElementById('sessionBadge').style.display = 'none';
        document.getElementById('btnSession').style.display = 'none';

        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        const fbTab = document.getElementById('tab-facebook');
        if (fbTab) {
            fbTab.classList.add('active');
            fbTab.style.animation = 'none';
            fbTab.offsetHeight;
            fbTab.style.animation = '';
        }
    } else {
        openInfoModal(platform);
    }
}

// ═══════════════════════════════════════════════════════════════
//  TAB: FACEBOOK DOWNLOADER (Post + Profile)
// ═══════════════════════════════════════════════════════════════

let currentFbPostData = null;

function switchFbMode(mode) {
    document.querySelectorAll('.fb-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.fbmode === mode);
    });
    document.querySelectorAll('.fb-mode-panel').forEach(panel => panel.classList.remove('active'));
    const target = document.getElementById(`fbPanel-${mode}`);
    if (target) target.classList.add('active');
}

// ─── POST MODE ─────────────────────────────────────────────────
async function fetchFacebookPost() {
    const input = document.getElementById('fbPostUrlInput');
    const url = input.value.trim();
    if (!url) { input.focus(); return; }
    if (!/facebook\.com|fb\.watch|fb\.com/i.test(url)) {
        showFbPostError('Please enter a valid Facebook URL.');
        return;
    }

    showFbPostLoading();
    hideFbPostError();
    hideFbPostResults();

    try {
        const res = await fetch(`${API_BASE}/api/facebook/fetch-post`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
            hideFbPostLoading();
            showFbPostError(data.error || 'Could not fetch this Facebook post.');
            return;
        }
        currentFbPostData = data;
        renderFbPostMedia(data);
        hideFbPostLoading();
    } catch (err) {
        hideFbPostLoading();
        console.error('Facebook post fetch error:', err);
        showFbPostError('Connection error. Make sure the server is running.');
    }
}

function renderFbPostMedia(data) {
    const grid = document.getElementById('fbPostMediaGrid');
    document.getElementById('fbPostUsername').textContent = data.username ? `@${data.username}` : 'Facebook';
    document.getElementById('fbPostMediaCount').textContent = `${data.items.length} item${data.items.length !== 1 ? 's' : ''}`;

    const captionEl = document.getElementById('fbPostCaption');
    if (data.caption && data.caption.trim()) {
        captionEl.textContent = data.caption.length > 300 ? data.caption.slice(0, 300) + '…' : data.caption;
        captionEl.classList.add('visible');
    } else {
        captionEl.classList.remove('visible');
    }

    grid.innerHTML = '';
    data.items.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'media-item';
        const proxySrc = `${API_BASE}/api/proxy-image?url=${encodeURIComponent(item.thumbnailUrl || item.url)}`;
        div.innerHTML = `
            <img src="${proxySrc}" alt="Media ${index + 1}" loading="lazy"
                 onerror="this.style.display='none'">
            <span class="media-type-badge">${item.type === 'video' ? '▶ Video' : '📷 Photo'}</span>
            <div class="media-item-overlay">
                <button class="media-item-view" onclick="event.stopPropagation(); viewFbPostItem(${index})" title="View">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                    </svg>
                </button>
                <button class="media-item-download" onclick="event.stopPropagation(); downloadFbPostItem(${index})" title="Download">
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

    showFbPostResults();
}

function viewFbPostItem(index) {
    if (!currentFbPostData || !currentFbPostData.items[index]) return;
    const item = currentFbPostData.items[index];
    const proxyEndpoint = item.type === 'video' ? 'proxy-video' : 'proxy-image';
    const viewUrl = `${API_BASE}/api/${proxyEndpoint}?url=${encodeURIComponent(item.url)}`;
    window.open(viewUrl, '_blank', 'noopener,noreferrer');
}

function downloadFbPostItem(index) {
    if (!currentFbPostData || !currentFbPostData.items[index]) return;
    const item = currentFbPostData.items[index];
    const ext = item.type === 'video' ? 'mp4' : 'jpg';
    const filename = `omnisave_facebook_${index + 1}.${ext}`;
    const proxyEndpoint = item.type === 'video' ? 'proxy-video' : 'proxy-image';
    const downloadUrl = `${API_BASE}/api/${proxyEndpoint}?url=${encodeURIComponent(item.url)}&download=true&filename=${encodeURIComponent(filename)}`;

    showToast('⬇️', `Downloading ${item.type}…`);
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
            console.error('FB download failed:', err);
            showToast('❌', 'Download failed');
        });
}

function downloadAllFbPostMedia() {
    if (!currentFbPostData || !currentFbPostData.items.length) return;
    currentFbPostData.items.forEach((_, i) => setTimeout(() => downloadFbPostItem(i), i * 800));
    showToast('⬇️', `Downloading ${currentFbPostData.items.length} item${currentFbPostData.items.length !== 1 ? 's' : ''}…`);
}

function showFbPostLoading()  { document.getElementById('fbPostLoadingSection').classList.add('visible'); }
function hideFbPostLoading()  { document.getElementById('fbPostLoadingSection').classList.remove('visible'); }
function showFbPostError(m)   { document.getElementById('fbPostErrorText').textContent = m; document.getElementById('fbPostErrorSection').classList.add('visible'); }
function hideFbPostError()    { document.getElementById('fbPostErrorSection').classList.remove('visible'); }
function clearFbPostError()   { hideFbPostError(); document.getElementById('fbPostUrlInput').focus(); }
function showFbPostResults()  { document.getElementById('fbPostResultsSection').classList.add('visible'); }
function hideFbPostResults()  { document.getElementById('fbPostResultsSection').classList.remove('visible'); }

// Generic Facebook media renderer used by Story + Profile Picture tabs.
// Both endpoints return the same `{ items: [{type, url, thumbnailUrl}] }`
// shape as the Post tab, so they reuse the same media-grid markup.
function renderFbMediaGrid(gridEl, data, downloadFn, viewFn) {
    gridEl.innerHTML = '';
    data.items.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'media-item';
        const proxySrc = `${API_BASE}/api/proxy-image?url=${encodeURIComponent(item.thumbnailUrl || item.url)}`;
        div.innerHTML = `
            <img src="${proxySrc}" alt="Media ${index + 1}" loading="lazy" onerror="this.style.display='none'">
            <span class="media-type-badge">${item.type === 'video' ? '▶ Video' : '📷 Photo'}</span>
            <div class="media-item-overlay">
                <button class="media-item-view" onclick="event.stopPropagation(); ${viewFn}(${index})" title="View">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                    </svg>
                </button>
                <button class="media-item-download" onclick="event.stopPropagation(); ${downloadFn}(${index})" title="Download">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                </button>
            </div>
        `;
        gridEl.appendChild(div);
    });
}

function downloadFbMediaItem(item, filename) {
    const proxyEndpoint = item.type === 'video' ? 'proxy-video' : 'proxy-image';
    const downloadUrl = `${API_BASE}/api/${proxyEndpoint}?url=${encodeURIComponent(item.url)}&download=true&filename=${encodeURIComponent(filename)}`;
    showToast('⬇️', `Downloading ${item.type}…`);
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
            console.error('FB download failed:', err);
            showToast('❌', 'Download failed');
        });
}

function viewFbMediaItem(item) {
    const proxyEndpoint = item.type === 'video' ? 'proxy-video' : 'proxy-image';
    const viewUrl = `${API_BASE}/api/${proxyEndpoint}?url=${encodeURIComponent(item.url)}`;
    window.open(viewUrl, '_blank', 'noopener,noreferrer');
}

// ─── STORY MODE ────────────────────────────────────────────────
let currentFbStoryData = null;

async function fetchFacebookStory() {
    const input = document.getElementById('fbStoryUrlInput');
    const url = input.value.trim();
    if (!url) { input.focus(); return; }
    if (!/facebook\.com|fb\.com/i.test(url)) {
        showFbStoryError('Please enter a valid Facebook story URL.');
        return;
    }

    showFbStoryLoading();
    hideFbStoryError();
    hideFbStoryResults();

    try {
        const res = await fetch(`${API_BASE}/api/facebook/fetch-story`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
            hideFbStoryLoading();
            showFbStoryError(data.error || 'Could not fetch this story.');
            return;
        }
        currentFbStoryData = data;
        document.getElementById('fbStoryUsername').textContent = data.username || 'Facebook Story';
        document.getElementById('fbStoryMediaCount').textContent = `${data.items.length} item${data.items.length !== 1 ? 's' : ''}`;
        const captionEl = document.getElementById('fbStoryCaption');
        if (data.caption) {
            captionEl.textContent = data.caption.length > 300 ? data.caption.slice(0, 300) + '…' : data.caption;
            captionEl.classList.add('visible');
        } else {
            captionEl.classList.remove('visible');
        }
        renderFbMediaGrid(document.getElementById('fbStoryMediaGrid'), data, 'downloadFbStoryItem', 'viewFbStoryItem');
        showFbStoryResults();
        hideFbStoryLoading();
    } catch (err) {
        hideFbStoryLoading();
        console.error('Facebook story fetch error:', err);
        showFbStoryError('Connection error. Make sure the server is running.');
    }
}

function viewFbStoryItem(index) {
    if (!currentFbStoryData?.items[index]) return;
    viewFbMediaItem(currentFbStoryData.items[index]);
}

function downloadFbStoryItem(index) {
    if (!currentFbStoryData?.items[index]) return;
    const item = currentFbStoryData.items[index];
    const ext = item.type === 'video' ? 'mp4' : 'jpg';
    downloadFbMediaItem(item, `omnisave_fb_story_${index + 1}.${ext}`);
}

function showFbStoryLoading() { document.getElementById('fbStoryLoadingSection').classList.add('visible'); }
function hideFbStoryLoading() { document.getElementById('fbStoryLoadingSection').classList.remove('visible'); }
function showFbStoryError(m)  { document.getElementById('fbStoryErrorText').textContent = m; document.getElementById('fbStoryErrorSection').classList.add('visible'); }
function hideFbStoryError()   { document.getElementById('fbStoryErrorSection').classList.remove('visible'); }
function clearFbStoryError()  { hideFbStoryError(); document.getElementById('fbStoryUrlInput').focus(); }
function showFbStoryResults() { document.getElementById('fbStoryResultsSection').classList.add('visible'); }
function hideFbStoryResults() { document.getElementById('fbStoryResultsSection').classList.remove('visible'); }

// ─── PROFILE PICTURE MODE ──────────────────────────────────────
let currentFbPfpData = null;

async function fetchFacebookProfilePicture() {
    const input = document.getElementById('fbPfpUrlInput');
    const url = input.value.trim();
    if (!url) { input.focus(); return; }

    showFbPfpLoading();
    hideFbPfpError();
    hideFbPfpResults();

    try {
        const res = await fetch(`${API_BASE}/api/facebook/fetch-profile-picture`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
            hideFbPfpLoading();
            showFbPfpError(data.error || 'Could not fetch the profile picture.');
            return;
        }
        currentFbPfpData = data;
        document.getElementById('fbPfpUsername').textContent = data.caption || `@${data.username}`;
        renderFbMediaGrid(document.getElementById('fbPfpMediaGrid'), data, 'downloadFbPfpItem', 'viewFbPfpItem');
        showFbPfpResults();
        hideFbPfpLoading();
    } catch (err) {
        hideFbPfpLoading();
        console.error('Facebook profile-pic fetch error:', err);
        showFbPfpError('Connection error. Make sure the server is running.');
    }
}

function viewFbPfpItem(index) {
    if (!currentFbPfpData?.items[index]) return;
    viewFbMediaItem(currentFbPfpData.items[index]);
}

function downloadFbPfpItem(index) {
    if (!currentFbPfpData?.items[index]) return;
    const item = currentFbPfpData.items[index];
    const safeUser = (currentFbPfpData.username || 'profile').replace(/[^a-zA-Z0-9._-]/g, '');
    downloadFbMediaItem(item, `omnisave_fb_pfp_${safeUser}.jpg`);
}

function showFbPfpLoading() { document.getElementById('fbPfpLoadingSection').classList.add('visible'); }
function hideFbPfpLoading() { document.getElementById('fbPfpLoadingSection').classList.remove('visible'); }
function showFbPfpError(m)  { document.getElementById('fbPfpErrorText').textContent = m; document.getElementById('fbPfpErrorSection').classList.add('visible'); }
function hideFbPfpError()   { document.getElementById('fbPfpErrorSection').classList.remove('visible'); }
function clearFbPfpError()  { hideFbPfpError(); document.getElementById('fbPfpUrlInput').focus(); }
function showFbPfpResults() { document.getElementById('fbPfpResultsSection').classList.add('visible'); }
function hideFbPfpResults() { document.getElementById('fbPfpResultsSection').classList.remove('visible'); }

// ─── Coming Soon Information Modal ─────────────────────────────
function openInfoModal(platform) {
    const details = PLATFORM_DETAILS[platform];
    if (!details) return;
    
    currentInfoPlatform = platform;
    
    // Set icon
    const iconEl = document.getElementById('infoModalIcon');
    iconEl.textContent = details.icon;
    iconEl.className = 'info-modal-icon';
    iconEl.classList.add(details.class);
    
    // Set title
    document.getElementById('infoModalTitle').textContent = details.title;
    
    // Set features
    const featuresEl = document.getElementById('infoModalFeatures');
    featuresEl.innerHTML = details.features.map(f => `
        <div class="feature-item">
            <span class="feature-check">✓</span>
            <span>${f}</span>
        </div>
    `).join('');
    
    // Load upvote count
    const votes = getUpvoteCount(platform);
    document.getElementById('upvoteCount').textContent = votes;
    
    // Check if user has already upvoted
    const upvoteBtn = document.getElementById('btnUpvote');
    const hasVoted = checkHasUpvoted(platform);
    if (hasVoted) {
        upvoteBtn.classList.add('voted');
        upvoteBtn.innerHTML = `✓ Upvoted! (${votes})`;
    } else {
        upvoteBtn.classList.remove('voted');
        upvoteBtn.innerHTML = `👍 Upvote Downloader (<span id="upvoteCount">${votes}</span>)`;
    }
    
    // Clear notification input
    document.getElementById('notifyEmailInput').value = '';
    
    // Show modal
    const infoModal = document.getElementById('infoModal');
    infoModal.classList.add('visible');
}

function closeInfoModal() {
    const infoModal = document.getElementById('infoModal');
    infoModal.classList.remove('visible');
    currentInfoPlatform = null;
}

function getUpvoteCount(platform) {
    const votesStr = localStorage.getItem(`votes_${platform}`);
    if (votesStr !== null) return parseInt(votesStr, 10);
    
    // Initial votes so page doesn't look empty
    const mockVotes = {
        youtube: 342,
        snapchat: 184,
        twitter: 279,
        reddit: 125,
        threads: 96
    };
    const initialVotes = mockVotes[platform] || 0;
    localStorage.setItem(`votes_${platform}`, initialVotes);
    return initialVotes;
}

function checkHasUpvoted(platform) {
    return localStorage.getItem(`has_voted_${platform}`) === 'true';
}

function upvotePlatform() {
    if (!currentInfoPlatform) return;
    
    const platform = currentInfoPlatform;
    if (checkHasUpvoted(platform)) {
        showToast('ℹ️', 'You have already upvoted this downloader!');
        return;
    }
    
    const currentVotes = getUpvoteCount(platform) + 1;
    localStorage.setItem(`votes_${platform}`, currentVotes);
    localStorage.setItem(`has_voted_${platform}`, 'true');
    
    // Update button UI
    const upvoteBtn = document.getElementById('btnUpvote');
    upvoteBtn.classList.add('voted');
    upvoteBtn.innerHTML = `✓ Upvoted! (${currentVotes})`;
    
    showToast('👍', 'Thanks for voting! We are prioritising this feature.');
}

function registerNotification() {
    if (!currentInfoPlatform) return;
    const emailInput = document.getElementById('notifyEmailInput');
    const email = emailInput.value.trim();
    if (!email || !email.includes('@')) {
        showToast('⚠️', 'Please enter a valid email address.');
        emailInput.focus();
        return;
    }
    
    // Save email simulated registration
    const signupsKey = `notif_signups_${currentInfoPlatform}`;
    const currentSignups = JSON.parse(localStorage.getItem(signupsKey) || '[]');
    if (!currentSignups.includes(email)) {
        currentSignups.push(email);
        localStorage.setItem(signupsKey, JSON.stringify(currentSignups));
    }
    
    emailInput.value = '';
    closeInfoModal();
    showToast('✅', "You're registered! We'll notify you on launch.");
}
