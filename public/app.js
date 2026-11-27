// Initialize Socket.IO
const socket = io();

// DOM Elements
const generateForm = document.getElementById('generateForm');
const channelSelect = document.getElementById('channel');
const topicInput = document.getElementById('topic');
const generateTopicBtn = document.getElementById('generateTopicBtn');
const channelDescription = document.getElementById('channelDescription');
const generateBtn = document.getElementById('generateBtn');
const progressCard = document.getElementById('progressCard');
const progressFill = document.getElementById('progressFill');
const progressLog = document.getElementById('progressLog');
const resultCard = document.getElementById('resultCard');
const resultInfo = document.getElementById('resultInfo');
const downloadBtn = document.getElementById('downloadBtn');
const newVideoBtn = document.getElementById('newVideoBtn');
const historyList = document.getElementById('historyList');
const statTotal = document.getElementById('statTotal');
const statWeek = document.getElementById('statWeek');
const statPublished = document.getElementById('statPublished');
const generateCard = document.getElementById('generateCard');
const thumbnailPreview = document.getElementById('thumbnailPreview');

// Production options
const optMusic = document.getElementById('optMusic');
const optEffects = document.getElementById('optEffects');
const optColorGrade = document.getElementById('optColorGrade');

// YouTube publish UI
const ytStatusText = document.getElementById('ytStatusText');
const ytConnectBtn = document.getElementById('ytConnectBtn');
const ytPublishBtn = document.getElementById('ytPublishBtn');
const ytTitle = document.getElementById('ytTitle');
const ytDescription = document.getElementById('ytDescription');
const ytTags = document.getElementById('ytTags');
const ytCategoryId = document.getElementById('ytCategoryId');
const ytPrivacy = document.getElementById('ytPrivacy');
const ytLog = document.getElementById('ytLog');
const ytProgressBar = document.getElementById('ytProgressBar');
const ytProgressFill = document.getElementById('ytProgressFill');
const ytChecks = document.getElementById('ytChecks');
const ytFixActions = document.getElementById('ytFixActions');

let currentJobId = null;
let currentVideoPath = null;
let currentScriptPath = null;
let currentPublishJobId = null;
let ytConnected = false;
let activeFixJobId = null;
let lastGenerationChannelId = null;
let lastGenerationTopic = null;

// Channel placeholder examples
const CHANNEL_EXAMPLES = {
    'what-if': 'Ex: Et si les humains pouvaient respirer sous l\'eau ?',
    'human-odyssey': 'Ex: L\'essor et la chute de l\'Empire romain',
    'classified-files': 'Ex: Le mystère du Triangle des Bermudes'
};

// Mobile tabs handling
document.querySelectorAll('.mobile-tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;

        // Update buttons
        document.querySelectorAll('.mobile-tabs button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Update content
        document.querySelectorAll('.tab-content').forEach(content => {
            if (content.dataset.tab === tab) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });
    });
});

// Load channels
async function loadChannels() {
    try {
        const response = await fetch('/api/channels');
        const channels = await response.json();

        channelSelect.innerHTML = '<option value="">-- Sélectionner une chaîne --</option>';
        channels.forEach(channel => {
            const option = document.createElement('option');
            option.value = channel.id;
            option.textContent = channel.name;
            option.dataset.description = channel.description;
            option.dataset.theme = channel.theme;
            channelSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Erreur de chargement des chaînes:', error);
        channelSelect.innerHTML = '<option value="">Erreur de chargement</option>';
    }
}

// Update channel description and theme
channelSelect.addEventListener('change', (e) => {
    const selected = e.target.selectedOptions[0];
    if (selected && selected.dataset.description) {
        channelDescription.textContent = `📺 ${selected.dataset.description}`;
        channelDescription.style.display = 'block';

        // Update placeholder based on channel
        topicInput.placeholder = CHANNEL_EXAMPLES[selected.value] || 'Entrez le sujet de votre vidéo...';

        // Update card theme
        generateCard.dataset.channel = selected.value;

        // Update thumbnail preview with channel theme
        updateThumbnailPreview(selected.value);
    } else {
        channelDescription.style.display = 'none';
        delete generateCard.dataset.channel;
    }
});

// Update thumbnail preview
function updateThumbnailPreview(channelId) {
    const themes = {
        'what-if': { icon: '🚀', text: 'Science & Spéculation', color: 'var(--what-if)' },
        'human-odyssey': { icon: '🏛️', text: 'Histoire & Civilisations', color: 'var(--human-odyssey)' },
        'classified-files': { icon: '🔍', text: 'Mystères & Enquêtes', color: 'var(--classified-files)' }
    };

    const theme = themes[channelId] || { icon: '🎬', text: 'Aperçu', color: 'var(--primary)' };

    thumbnailPreview.innerHTML = `
        <div class="placeholder" style="border-color: ${theme.color}">
            <span>${theme.icon}</span>
            <p>${theme.text}</p>
        </div>
    `;
    thumbnailPreview.style.borderColor = theme.color;
}

// Generate topic automatically using AI
generateTopicBtn.addEventListener('click', async () => {
    const channelId = channelSelect.value;

    if (!channelId) {
        showToast('Veuillez d\'abord sélectionner une chaîne', 'error');
        return;
    }

    // Disable button and show loading
    generateTopicBtn.disabled = true;
    generateTopicBtn.innerHTML = '⏳';
    topicInput.disabled = true;

    try {
        const response = await fetch(`/api/topics/${channelId}?count=1`);
        if (!response.ok) throw new Error('Échec de la génération');

        const data = await response.json();
        if (data.suggestions && data.suggestions.length > 0) {
            topicInput.value = data.suggestions[0].topic;
            showToast(`Sujet généré ! Score viral: ${data.suggestions[0].viralScore}/10`, 'success');
        }
    } catch (error) {
        console.error('Erreur génération sujet:', error);
        showToast('Erreur lors de la génération du sujet', 'error');
    } finally {
        generateTopicBtn.disabled = false;
        generateTopicBtn.innerHTML = '✨ IA';
        topicInput.disabled = false;
    }
});

// Show toast notification
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-size: 1.25rem;">${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
            <div>${message}</div>
        </div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// Request notification permission
async function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
    }
}

// Send push notification
function sendNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, {
            body,
            icon: '/favicon.ico',
            badge: '/favicon.ico'
        });
    }
}

// Handle form submission
generateForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const channelId = channelSelect.value;
    const topic = topicInput.value.trim();
    const mode = document.getElementById('mode').value;

    if (!channelId || !topic) {
        showToast('Veuillez sélectionner une chaîne et entrer un sujet', 'error');
        return;
    }

    // Get production options
    const productionOptions = {
        enableMusic: optMusic?.checked ?? true,
        enableVisualEffects: optEffects?.checked ?? true,
        enableColorGrading: optColorGrade?.checked ?? true
    };

    // Disable form
    generateBtn.disabled = true;
    generateBtn.textContent = '⏳ Démarrage...';

    // Show progress card
    progressCard.style.display = 'block';
    resultCard.style.display = 'none';
    progressLog.innerHTML = '';
    updateProgressSteps('script', 'active');

    try {
        lastGenerationChannelId = channelId;
        lastGenerationTopic = topic;

        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                channelId,
                topic,
                mode,
                ...productionOptions
            })
        });

        const data = await response.json();
        currentJobId = data.jobId;

        // Subscribe to job updates
        socket.emit('subscribe', currentJobId);

        addLog(`🚀 Génération lancée (Job: ${currentJobId})`);
        addLog(`📺 Chaîne: ${channelSelect.selectedOptions[0].textContent}`);
        addLog(`📝 Sujet: ${topic}`);
    } catch (error) {
        console.error('Échec de la génération:', error);
        addLog(`❌ Erreur: ${error.message}`, 'error');
        resetForm();
    }
});

// Socket event handlers
socket.on('progress', (data) => {
    addLog(data.message);

    // If we're running a fix job from the pre-publish panel, mirror logs there too.
    if (activeFixJobId) {
        ytAddLog(data.message);
    }

    // Update progress based on keywords
    const msg = data.message.toLowerCase();
    if (msg.includes('script')) {
        updateProgressSteps('script', 'active');
        updateProgress(20);
    } else if (msg.includes('audio') || msg.includes('voice') || msg.includes('elevenlabs')) {
        updateProgressSteps('script', 'completed');
        updateProgressSteps('audio', 'active');
        updateProgress(40);
    } else if (msg.includes('collecting') || msg.includes('assets') || msg.includes('pexels')) {
        updateProgressSteps('audio', 'completed');
        updateProgressSteps('assets', 'active');
        updateProgress(60);
    } else if (msg.includes('download') || msg.includes('télécharg')) {
        updateProgressSteps('assets', 'completed');
        updateProgressSteps('download', 'active');
        updateProgress(75);
    } else if (msg.includes('compos') || msg.includes('ffmpeg') || msg.includes('assembl')) {
        updateProgressSteps('download', 'completed');
        updateProgressSteps('compose', 'active');
        updateProgress(90);
    }
});

socket.on('complete', (data) => {
    addLog('✅ Génération terminée !', 'success');
    updateProgressSteps('compose', 'completed');
    updateProgress(100);

    // Send notification
    sendNotification('ChrisStudio', 'Votre vidéo est prête !');

    setTimeout(() => {
        progressCard.style.display = 'none';
        showResult(data);
        resetForm();
        loadHistory();
    }, 1500);
});

socket.on('error', (data) => {
    addLog(`❌ Erreur: ${data.error}`, 'error');
    sendNotification('ChrisStudio', 'Erreur lors de la génération');

    if (activeFixJobId) {
        ytAddLog(`❌ Correction échouée: ${data.error}`, 'error');
        activeFixJobId = null;
        runPrepublishChecks();
    }
    resetForm();
});

// YouTube socket handlers
socket.on('yt:status', (data) => {
    if (!currentPublishJobId) return;
    const status = data.status || 'upload en cours';
    const progress = Number.isFinite(data.progress) ? data.progress : 0;
    ytProgressBar.style.display = 'block';
    ytProgressFill.style.width = `${Math.max(0, Math.min(100, progress))}%`;
    ytAddLog(`📤 ${status} — ${progress}%`);
});

socket.on('yt:done', (data) => {
    if (!currentPublishJobId) return;
    ytProgressBar.style.display = 'block';
    ytProgressFill.style.width = '100%';
    ytAddLog(`✅ Publiée ! ID: ${data.videoId}`, 'success');
    if (data.videoUrl) {
        ytAddLog(`🔗 ${data.videoUrl}`, 'success');
    }
    sendNotification('ChrisStudio', 'Vidéo publiée sur YouTube !');
    currentPublishJobId = null;
    ytPublishBtn.disabled = false;
    refreshYouTubeStatus();
    loadHistory();
});

socket.on('yt:error', (data) => {
    if (!currentPublishJobId) return;
    const msg = data.error || 'Échec de l\'upload';
    if (msg === 'AUTH_REQUIRED') {
        ytAddLog('🔐 Authentification YouTube requise. Cliquez sur "Connecter YouTube".', 'error');
        ytConnected = false;
        refreshYouTubeStatus();
    } else {
        ytAddLog(`❌ ${msg}`, 'error');
    }
    ytPublishBtn.disabled = false;
    currentPublishJobId = null;
});

// Helper functions
function addLog(message, type = 'info') {
    const p = document.createElement('p');
    p.textContent = message;
    if (type === 'error') p.style.color = 'var(--error)';
    if (type === 'success') p.style.color = 'var(--success)';
    progressLog.appendChild(p);
    progressLog.scrollTop = progressLog.scrollHeight;
}

function updateProgress(percent) {
    progressFill.style.width = `${percent}%`;
}

function updateProgressSteps(step, status) {
    const stepEl = document.querySelector(`[data-step="${step}"]`);
    if (stepEl) {
        stepEl.classList.remove('active', 'completed');
        if (status) stepEl.classList.add(status);
    }
}

function showResult(data) {
    resultCard.style.display = 'block';
    resultInfo.innerHTML = `
        <p><strong>🎬 Fichier :</strong> ${data.videoPath?.split('/').pop() || 'video.mp4'}</p>
        <p><strong>📊 Qualité :</strong> 1080p, 30fps</p>
    `;

    // Extract filename from path for download API
    const filename = data.videoPath?.split('/').pop() || 'video.mp4';
    downloadBtn.href = `/api/download/video/${filename}`;
    downloadBtn.download = filename;

    currentVideoPath = data.videoPath;
    currentScriptPath = data.scriptPath || null;

    // Reset YouTube UI state
    ytLog.innerHTML = '';
    ytProgressBar.style.display = 'none';
    ytProgressFill.style.width = '0%';
    ytPublishBtn.disabled = true;
    currentPublishJobId = null;
    activeFixJobId = null;

    // Reset checks UI
    if (ytChecks) {
        ytChecks.innerHTML = '<p class="loading">Chargement des vérifications…</p>';
    }
    if (ytFixActions) {
        ytFixActions.innerHTML = '';
    }

    // Prefill metadata from script if available
    prefillYouTubeMetadata(data).finally(async () => {
        await refreshYouTubeStatus();
        await runPrepublishChecks();
    });
}

function resetForm() {
    generateBtn.disabled = false;
    generateBtn.textContent = '🚀 Générer la vidéo';
    currentJobId = null;
}

newVideoBtn.addEventListener('click', () => {
    resultCard.style.display = 'none';
    progressCard.style.display = 'none';
    topicInput.value = '';
    progressFill.style.width = '0%';
    document.querySelectorAll('.step').forEach(el => {
        el.classList.remove('active', 'completed');
    });
});

const YT_CHANNEL_KEYS = ['classified-files', 'human-odyssey', 'what-if'];
const YT_DEFAULT_CATEGORY = { 'what-if': '27', 'human-odyssey': '27', 'classified-files': '24' };

/** ChrisStudio channel of the current video (file name prefix), else the channel picked in the form. */
function getCurrentChannelKey() {
    const file = (currentVideoPath || '').split(/[\\/]/).pop() || '';
    const fromFile = YT_CHANNEL_KEYS.find(k => file.startsWith(`${k}-`));
    if (fromFile) return fromFile;
    const select = document.getElementById('channel');
    return select && YT_CHANNEL_KEYS.includes(select.value) ? select.value : '';
}

async function refreshYouTubeStatus() {
    try {
        const key = getCurrentChannelKey();
        if (key && ytCategoryId && YT_DEFAULT_CATEGORY[key]) ytCategoryId.value = YT_DEFAULT_CATEGORY[key];
        const resp = await fetch(`/api/youtube/status?channel=${encodeURIComponent(key)}`);
        const status = await resp.json();

        if (!status.hasCredentials) {
            ytConnected = false;
            ytStatusText.textContent = 'YouTube non configuré. Ajoutez les identifiants OAuth.';
            ytConnectBtn.disabled = true;
            ytPublishBtn.disabled = true;
            return;
        }

        ytConnected = !!status.connected;
        if (ytConnected) {
            ytStatusText.textContent = `✅ ${status.youtubeChannelTitle || 'YouTube'} connecté. Prêt à publier.`;
            ytConnectBtn.disabled = false;
            ytConnectBtn.textContent = '🔄 Reconnecter';
            ytPublishBtn.disabled = !currentVideoPath;
        } else {
            ytStatusText.textContent = `🔐 Chaîne ${getCurrentChannelKey() || ''} non connectée à YouTube.`;
            ytConnectBtn.disabled = false;
            ytConnectBtn.textContent = '🔐 Connecter YouTube';
            ytPublishBtn.disabled = true;
        }
    } catch (e) {
        ytConnected = false;
        ytStatusText.textContent = '⚠️ Impossible de vérifier YouTube.';
        ytConnectBtn.disabled = false;
        ytPublishBtn.disabled = true;
    }
}

function getCurrentMetadataForChecks() {
    const title = (ytTitle.value || '').trim();
    const description = (ytDescription.value || '').trim();
    const tags = (ytTags.value || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .slice(0, 50);
    return { title, description, tags };
}

function renderPrepublishChecks(report) {
    if (!ytChecks) return;

    const items = (report?.checks || []).map(c => {
        const ok = !!c.ok;
        const details = c.details ? `<div class="check-details">${escapeHtml(c.details)}</div>` : '';
        return `
            <div class="check-item ${ok ? 'ok' : 'bad'}">
                <div class="check-left">
                    <div class="check-title">${escapeHtml(c.label)}</div>
                    ${details}
                </div>
                <div class="check-badge ${ok ? 'ok' : 'bad'}">${ok ? 'OK' : 'KO'}</div>
            </div>
        `;
    }).join('');

    ytChecks.innerHTML = items || '<p class="loading">Aucune vérification</p>';

    // Actions: show only for failing checks
    if (ytFixActions) {
        const actions = [];
        (report?.checks || []).forEach(c => {
            if (!c.ok && Array.isArray(c.actions)) {
                c.actions.forEach(a => actions.push(a));
            }
        });

        const dedup = new Map();
        actions.forEach(a => {
            const key = `${a.kind}:${JSON.stringify(a.payload || {})}`;
            if (!dedup.has(key)) dedup.set(key, a);
        });

        ytFixActions.innerHTML = '';
        Array.from(dedup.values()).forEach(a => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-secondary btn-small';
            btn.textContent = a.label;
            btn.addEventListener('click', () => handleFixAction(a));
            ytFixActions.appendChild(btn);
        });
    }

    // Gate Publish button
    const allOk = !!report?.ok;
    if (ytPublishBtn) {
        ytPublishBtn.disabled = !(ytConnected && currentVideoPath && allOk) || !!activeFixJobId;
    }
}

async function runPrepublishChecks() {
    if (!currentVideoPath || !ytChecks) return;

    try {
        const metadata = getCurrentMetadataForChecks();
        const resp = await fetch('/api/prepublish/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoPath: currentVideoPath, metadata })
        });
        const data = await resp.json();
        if (!resp.ok) {
            throw new Error(data.error || 'Validation échouée');
        }
        renderPrepublishChecks(data);
    } catch (e) {
        ytChecks.innerHTML = `<p style="color: var(--error);">❌ Échec: ${escapeHtml(e.message || e)}</p>`;
        if (ytPublishBtn) ytPublishBtn.disabled = true;
    }
}

async function handleFixAction(action) {
    if (!currentVideoPath) return;

    if (action.kind === 'regen_full') {
        if (!lastGenerationChannelId || !lastGenerationTopic) {
            ytAddLog('❌ Impossible de relancer: chaîne/sujet inconnus.', 'error');
            return;
        }
        ytAddLog('🔁 Relance génération complète…');
        channelSelect.value = lastGenerationChannelId;
        topicInput.value = lastGenerationTopic;
        generateForm.dispatchEvent(new Event('submit', { cancelable: true }));
        return;
    }

    const payload = action.payload || {};
    const forceImagesOnly = action.kind === 'regen_assets_images_only';
    const minClips = action.kind === 'regen_assets_more_clips' ? (payload.minClips || 10) : undefined;

    try {
        ytAddLog('🔧 Correction en cours…');
        ytPublishBtn.disabled = true;
        activeFixJobId = '__starting__';

        const resp = await fetch('/api/prepublish/regenerate-assets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                videoPath: currentVideoPath,
                forceImagesOnly,
                minClips
            })
        });
        const data = await resp.json();
        if (!resp.ok) {
            throw new Error(data.error || 'Régénération échouée');
        }

        activeFixJobId = data.jobId;
        socket.emit('subscribe', activeFixJobId);
        ytAddLog(`📡 Correction lancée: ${activeFixJobId}`);
    } catch (e) {
        activeFixJobId = null;
        ytAddLog(`❌ ${e.message || e}`, 'error');
        await runPrepublishChecks();
    }
}

let checksDebounce = null;
function scheduleChecks() {
    if (!currentVideoPath) return;
    if (checksDebounce) clearTimeout(checksDebounce);
    checksDebounce = setTimeout(() => runPrepublishChecks(), 350);
}

// Re-run checks when metadata changes
[ytTitle, ytDescription, ytTags, ytCategoryId, ytPrivacy].forEach(el => {
    if (!el) return;
    el.addEventListener('input', scheduleChecks);
    el.addEventListener('change', scheduleChecks);
});

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

ytConnectBtn.addEventListener('click', async () => {
    try {
        ytAddLog('🔐 Démarrage OAuth YouTube…');
        const resp = await fetch(`/api/youtube/connect?channel=${encodeURIComponent(getCurrentChannelKey())}`);
        const data = await resp.json();
        if (!data.url) {
            ytAddLog('❌ Impossible d\'obtenir l\'URL OAuth.', 'error');
            return;
        }

        ytAddLog('➡️ Ouverture de la page Google. Choisissez bien la chaîne de cette vidéo dans la liste.');
        window.open(data.url, '_blank');
        ytAddLog('Après autorisation, revenez ici et cliquez sur Publier.');

        // Poll status
        for (let i = 0; i < 10; i++) {
            await new Promise(r => setTimeout(r, 1200));
            await refreshYouTubeStatus();
            if (ytConnected) break;
        }
    } catch (e) {
        ytAddLog(`❌ Échec OAuth: ${e.message || e}`, 'error');
    }
});

ytPublishBtn.addEventListener('click', async () => {
    if (!currentVideoPath) {
        ytAddLog('❌ Aucune vidéo à publier.', 'error');
        return;
    }
    if (!ytConnected) {
        ytAddLog('🔐 Veuillez d\'abord connecter YouTube.', 'error');
        return;
    }

    const title = (ytTitle.value || '').trim();
    const description = (ytDescription.value || '').trim();
    const tags = (ytTags.value || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .slice(0, 50);

    const categoryId = (ytCategoryId.value || '27').trim();
    const privacyStatus = ytPrivacy.value;

    if (!title) {
        ytAddLog('❌ Le titre est requis.', 'error');
        return;
    }

    ytPublishBtn.disabled = true;
    ytProgressBar.style.display = 'block';
    ytProgressFill.style.width = '0%';
    ytAddLog('🚀 Démarrage de l\'upload…');

    try {
        const resp = await fetch('/api/youtube/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                videoPath: currentVideoPath,
                channel: getCurrentChannelKey() || undefined,
                metadata: { title, description, tags, categoryId, privacyStatus }
            })
        });
        const data = await resp.json();
        if (!resp.ok) {
            if (data && data.report && data.report.checks) {
                renderPrepublishChecks(data.report);
                ytAddLog('⛔ Publication bloquée: vérifications en échec.', 'error');
            }
            throw new Error(data.error || 'Échec de la publication');
        }

        currentPublishJobId = data.publishJobId;
        socket.emit('subscribe-youtube', currentPublishJobId);
        ytAddLog(`📡 Upload lancé: ${currentPublishJobId}`);
    } catch (e) {
        ytAddLog(`❌ ${e.message || e}`, 'error');
        ytPublishBtn.disabled = false;
        currentPublishJobId = null;
    }
});

function ytAddLog(message, type = 'info') {
    const p = document.createElement('p');
    p.textContent = message;
    if (type === 'error') p.style.color = 'var(--error)';
    if (type === 'success') p.style.color = 'var(--success)';
    ytLog.appendChild(p);
    ytLog.scrollTop = ytLog.scrollHeight;
}

async function prefillYouTubeMetadata(data) {
    try {
        const scriptUrl = data.scriptPath || (data.videoPath
            .replace('/output/videos/', '/output/scripts/')
            .replace(/\.mp4$/i, '.json'));

        const resp = await fetch(scriptUrl);
        if (!resp.ok) throw new Error('Pas de script JSON');
        const script = await resp.json();

        if (script?.title) ytTitle.value = script.title;

        const descParts = [];
        if (script?.hook) descParts.push(script.hook);
        if (script?.conclusion) descParts.push('\n\n' + script.conclusion);
        ytDescription.value = descParts.join('').trim();

        const tagText = `${script?.title || ''} ${script?.hook || ''} ${script?.sections?.map(s => s.searchQuery).join(' ') || ''}`;
        const tags = deriveTags(tagText).slice(0, 25);
        ytTags.value = tags.join(', ');
    } catch {
        if (!ytTitle.value) ytTitle.value = 'Nouvelle vidéo';
        if (!ytDescription.value) ytDescription.value = '';
        if (!ytTags.value) ytTags.value = '';
    }
}

function deriveTags(text) {
    const stop = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'from', 'into', 'over', 'under', 'about', 'your', 'you', 'are', 'was', 'were', 'has', 'have', 'had', 'will', 'its', 'our', 'their', 'they', 'them', 'his', 'her', 'she', 'him', 'who', 'what', 'when', 'where', 'why', 'how', 'not', 'yes', 'more', 'most', 'less', 'many', 'much', 'new', 'old', 'les', 'des', 'une', 'est', 'que', 'pour', 'dans', 'sur', 'par', 'avec', 'sont', 'plus', 'cette', 'ces']);
    return Array.from(new Set(
        (text || '')
            .toLowerCase()
            .replace(/[^a-z0-9àâäéèêëïîôùûü\s]+/g, ' ')
            .split(/\s+/g)
            .map(s => s.trim())
            .filter(Boolean)
            .filter(s => s.length > 2)
            .filter(s => !stop.has(s))
    ));
}

// Load history
async function loadHistory() {
    try {
        const response = await fetch('/api/history');
        const history = await response.json();

        if (history.length === 0) {
            historyList.innerHTML = '<p class="loading">Aucune vidéo générée</p>';
            statTotal.textContent = '0';
            statWeek.textContent = '0';
            if (statPublished) statPublished.textContent = '0';
            return;
        }

        // Update stats
        statTotal.textContent = history.length;
        const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        statWeek.textContent = history.filter(h => h.timestamp > weekAgo).length;
        if (statPublished) {
            statPublished.textContent = history.filter(h => h.published).length || '0';
        }

        // Render history
        historyList.innerHTML = history.slice(0, 10).map(item => {
            const date = new Date(item.timestamp);
            const channelClass = `badge-${item.channel}`;

            return `
                <div class="history-item" data-channel="${item.channel}">
                    <h4>${escapeHtml(item.title)}</h4>
                    <div class="history-meta">
                        <span class="history-badge ${channelClass}">${item.channel}</span>
                        <span>📅 ${date.toLocaleDateString('fr-FR')}</span>
                    </div>
                    <div class="history-actions">
                        ${item.hasVideo ? `<a href="/api/download/video/${item.videoPath.split('/').pop()}" download class="action-link">🎬 Vidéo</a>` : ''}
                        ${item.hasAudio ? `<a href="${item.audioPath}" target="_blank" class="action-link">🎵 Audio</a>` : ''}
                        <a href="${item.scriptPath}" target="_blank" class="action-link">📄 Script</a>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Erreur chargement historique:', error);
        historyList.innerHTML = '<p class="loading">Erreur de chargement</p>';
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadChannels();
    loadHistory();
    refreshYouTubeStatus();
    requestNotificationPermission();

    // Refresh history every 30 seconds
    setInterval(loadHistory, 30000);
});


// ---------------------------------------------------------------
// YouTube channels panel (stats tab): logins + live numbers
// ---------------------------------------------------------------
const ytChannelsList = document.getElementById('ytChannelsList');
const ytChannelsRefresh = document.getElementById('ytChannelsRefresh');

function fmtNumber(n) {
    return n === null || n === undefined ? '—' : Number(n).toLocaleString('fr-FR');
}

async function loadYouTubeChannels() {
    if (!ytChannelsList) return;
    try {
        const resp = await fetch('/api/youtube/channels');
        const rows = await resp.json();
        ytChannelsList.innerHTML = rows.map(row => {
            const head = `<h4>${escapeHtml(row.name || row.channel)} <small>${escapeHtml(row.handle)}</small></h4>`;
            if (!row.hasCredentials) {
                return `<div class="yt-channel">${head}<p>⚠️ Fichier secrets/youtube_oauth_client.json manquant.</p></div>`;
            }
            if (!row.connected) {
                return `<div class="yt-channel">${head}<p>🔐 Non connectée.</p>
                    <button class="btn-secondary yt-connect-channel" data-channel="${escapeHtml(row.channel)}" type="button">Connecter cette chaîne</button></div>`;
            }
            if (row.error || !row.stats) {
                return `<div class="yt-channel">${head}<p>⚠️ ${escapeHtml(row.error || 'Statistiques indisponibles')}</p></div>`;
            }
            const st = row.stats;
            const videos = (st.recentVideos || []).map(v => `
                <tr>
                    <td><a href="https://www.youtube.com/watch?v=${encodeURIComponent(v.videoId)}" target="_blank">${escapeHtml(v.title)}</a></td>
                    <td>${escapeHtml(v.privacyStatus || '')}</td>
                    <td style="text-align:right">${fmtNumber(v.views)}</td>
                    <td style="text-align:right">${fmtNumber(v.likes)}</td>
                    <td style="text-align:right">${fmtNumber(v.comments)}</td>
                </tr>`).join('');
            return `<div class="yt-channel">${head}
                <p>👥 ${fmtNumber(st.subscribers)} abonnés · 👁️ ${fmtNumber(st.totalViews)} vues · 🎬 ${fmtNumber(st.videoCount)} vidéos</p>
                ${videos ? `<table class="yt-videos"><thead><tr><th>Vidéo</th><th>Statut</th><th>Vues</th><th>👍</th><th>💬</th></tr></thead><tbody>${videos}</tbody></table>` : '<p>Aucune vidéo pour l\'instant.</p>'}
            </div>`;
        }).join('');
    } catch (e) {
        ytChannelsList.innerHTML = `<p>⚠️ ${escapeHtml(e.message || String(e))}</p>`;
    }
}

if (ytChannelsList) {
    ytChannelsList.addEventListener('click', async (event) => {
        const btn = event.target.closest('.yt-connect-channel');
        if (!btn) return;
        const resp = await fetch(`/api/youtube/connect?channel=${encodeURIComponent(btn.dataset.channel)}`);
        const data = await resp.json();
        if (data.url) {
            alert('Sur la page Google, choisissez la chaîne ' + btn.dataset.channel + ' dans la liste des chaînes.');
            window.open(data.url, '_blank');
        }
    });
    ytChannelsRefresh?.addEventListener('click', loadYouTubeChannels);
    loadYouTubeChannels();
}
