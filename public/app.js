/* ChrisStudio dashboard: produce, review, publish, follow. */
const socket = io();
const $ = (id) => document.getElementById(id);

const CHANNEL_ORDER = ['what-if', 'human-odyssey', 'classified-files'];
const state = {
    channels: [],          // [{id, name, description}]
    channel: localStorage.getItem('cs.channel') || 'what-if',
    videos: [],
    ytChannels: [],
    jobId: null,
    publishItem: null,
    publishJobId: null,
    month: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
};

function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
const fmt = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('fr-FR'));
const channelName = (id) => state.channels.find((c) => c.id === id)?.name || id;

async function getJson(url, options) {
    const resp = await fetch(url, options);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw Object.assign(new Error(data.error || `HTTP ${resp.status}`), { data, status: resp.status });
    return data;
}

/* ---------------- Views ---------------- */
function showView() {
    const view = location.hash === '#calendrier' ? 'calendrier' : 'studio';
    document.querySelectorAll('.views a').forEach((a) => a.classList.toggle('active', a.dataset.view === view));
    $('view-studio').hidden = view !== 'studio';
    $('view-calendrier').hidden = view !== 'calendrier';
    if (view === 'calendrier') renderCalendar();
}
window.addEventListener('hashchange', showView);

/* ---------------- Produce ---------------- */
function renderChannelPicker() {
    $('channelPicker').innerHTML = state.channels.map((c) => `
        <button type="button" data-id="${esc(c.id)}" aria-pressed="${c.id === state.channel}">
            <span class="dot ${esc(c.id)}"></span>${esc(c.name)}
        </button>`).join('');
    const current = state.channels.find((c) => c.id === state.channel);
    $('produceHint').textContent = current ? current.description : '';
}

$('channelPicker').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-id]');
    if (!btn) return;
    state.channel = btn.dataset.id;
    localStorage.setItem('cs.channel', state.channel);
    $('suggestions').hidden = true;
    renderChannelPicker();
});

$('suggestBtn').addEventListener('click', async () => {
    const btn = $('suggestBtn');
    btn.disabled = true;
    btn.textContent = 'Recherche…';
    try {
        const data = await getJson(`/api/topics/${encodeURIComponent(state.channel)}?count=5`);
        const list = data.suggestions || [];
        $('suggestions').innerHTML = list.length
            ? list.map((s) => `<li data-topic="${esc(s.topic)}">${esc(s.topic)}${s.angle ? `<small>${esc(s.angle)}</small>` : ''}</li>`).join('')
            : '<li class="muted">Aucune suggestion.</li>';
        $('suggestions').hidden = false;
    } catch (err) {
        $('suggestions').innerHTML = `<li class="muted">Erreur : ${esc(err.message)}</li>`;
        $('suggestions').hidden = false;
    } finally {
        btn.disabled = false;
        btn.textContent = 'Suggérer';
    }
});

$('suggestions').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-topic]');
    if (!li) return;
    $('topic').value = li.dataset.topic;
    $('suggestions').hidden = true;
});

const STEP_MARKERS = [
    ['script', /STEP 1\/5/],
    ['images', /STEP 3\/5/],
    ['download', /STEP 4\/5/],
    ['edit', /STEP 5\/5/],
    ['subtitles', /Writing EN|Subtitles EN/]
];

function setStep(step) {
    const order = STEP_MARKERS.map(([s]) => s);
    const index = order.indexOf(step);
    document.querySelectorAll('#steps li').forEach((li) => {
        const i = order.indexOf(li.dataset.step);
        li.classList.toggle('done', i < index);
        li.classList.toggle('active', i === index);
    });
}

function appendLog(line) {
    const log = $('log');
    log.textContent += `${line}\n`;
    log.scrollTop = log.scrollHeight;
}

$('generateBtn').addEventListener('click', async () => {
    const topic = $('topic').value.trim();
    if (topic.length < 3) {
        $('topic').focus();
        return;
    }
    $('generateBtn').disabled = true;
    $('progress').hidden = false;
    $('log').textContent = '';
    $('progressStatus').className = 'progress-status';
    $('progressStatus').textContent = `${channelName(state.channel)} — « ${topic} ». Compter 10 à 20 minutes.`;
    setStep('script');
    try {
        const data = await getJson('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId: state.channel, topic })
        });
        state.jobId = data.jobId;
        socket.emit('subscribe', data.jobId);
    } catch (err) {
        $('progressStatus').className = 'progress-status error';
        $('progressStatus').textContent = `Échec du lancement : ${err.message}`;
        $('generateBtn').disabled = false;
    }
});

socket.on('progress', (data) => {
    if (!data?.message) return;
    appendLog(data.message);
    for (const [step, re] of STEP_MARKERS) if (re.test(data.message)) setStep(step);
});

socket.on('complete', (data) => {
    if (data.jobId && data.jobId !== state.jobId) return;
    document.querySelectorAll('#steps li').forEach((li) => { li.classList.remove('active'); li.classList.add('done'); });
    $('progressStatus').textContent = 'Vidéo prête. Elle apparaît dans la liste ci-dessous.';
    $('generateBtn').disabled = false;
    loadVideos();
});

socket.on('error', (data) => {
    if (data?.jobId && data.jobId !== state.jobId) return;
    $('progressStatus').className = 'progress-status error';
    $('progressStatus').textContent = `Échec : ${data?.error || 'erreur inconnue'} (détails dans le journal).`;
    $('generateBtn').disabled = false;
});

/* ---------------- Videos ---------------- */
function videoStatus(v) {
    if (v.youtube) {
        const privacy = { private: 'privée', unlisted: 'non répertoriée', public: 'publique' }[v.youtube.privacy] || v.youtube.privacy;
        return `<a class="status published" href="${esc(v.youtube.url)}" target="_blank" rel="noopener">Sur YouTube (${esc(privacy)})</a>`;
    }
    if (!v.hasVideo) return '<span class="status incomplete">Incomplète</span>';
    return '<span class="status generated">Générée</span>';
}

function renderVideos() {
    const body = $('videosBody');
    if (!state.videos.length) {
        body.innerHTML = '<tr><td colspan="5" class="muted">Aucune vidéo pour l\'instant.</td></tr>';
        return;
    }
    body.innerHTML = state.videos.map((v, i) => {
        const files = [
            v.videoPath && `<a href="${esc(v.videoPath)}" target="_blank">Vidéo</a>`,
            v.scriptPath && `<a href="${esc(v.scriptPath)}" target="_blank">Script</a>`,
            v.subtitles?.fr && `<a href="${esc(v.subtitles.fr)}" download>Sous-titres FR</a>`,
            v.subtitles?.en && `<a href="${esc(v.subtitles.en)}" download>EN</a>`
        ].filter(Boolean).join('');
        return `<tr>
            <td><div class="title"><span class="dot ${esc(v.channel)}" title="${esc(channelName(v.channel))}"></span>${esc(v.title)}</div></td>
            <td class="muted">${new Date(v.timestamp).toLocaleDateString('fr-FR')}</td>
            <td>${videoStatus(v)}</td>
            <td><div class="files">${files}</div></td>
            <td class="num">${v.hasVideo ? `<button class="btn small" data-publish="${i}" type="button">Publier</button>` : ''}</td>
        </tr>`;
    }).join('');
}

async function loadVideos() {
    try {
        state.videos = await getJson('/api/history');
        renderVideos();
        if (!$('view-calendrier').hidden) renderCalendar();
    } catch (err) {
        $('videosBody').innerHTML = `<tr><td colspan="5" class="muted">Erreur : ${esc(err.message)}</td></tr>`;
    }
}
$('refreshVideos').addEventListener('click', loadVideos);

/* ---------------- Channels ---------------- */
function renderChannels() {
    $('channelsList').innerHTML = state.ytChannels.map((row) => {
        const head = `<div class="channel-head"><span class="dot ${esc(row.channel)}"></span><strong>${esc(row.name || row.channel)}</strong><span class="handle">${esc(row.handle)}</span></div>`;
        if (!row.hasCredentials) return `<div class="channel">${head}<p class="muted small">Fichier secrets/youtube_oauth_client.json manquant.</p></div>`;
        if (!row.connected) {
            return `<div class="channel">${head}<p class="muted small">Non connectée.</p>
                <button class="btn small" data-connect="${esc(row.channel)}" type="button">Connecter</button></div>`;
        }
        if (row.error || !row.stats) return `<div class="channel">${head}<p class="muted small">${esc(row.error || 'Statistiques indisponibles')}</p></div>`;
        const st = row.stats;
        const recent = (st.recentVideos || []).slice(0, 5).map((v) => `
            <tr><td><a href="https://www.youtube.com/watch?v=${encodeURIComponent(v.videoId)}" target="_blank" rel="noopener">${esc(v.title)}</a></td>
            <td class="num">${fmt(v.views)} vues</td></tr>`).join('');
        return `<div class="channel">${head}
            <div class="kpis">
                <div class="kpi"><strong>${fmt(st.subscribers)}</strong><span>abonnés</span></div>
                <div class="kpi"><strong>${fmt(st.totalViews)}</strong><span>vues</span></div>
                <div class="kpi"><strong>${fmt(st.videoCount)}</strong><span>vidéos</span></div>
            </div>
            ${recent ? `<table class="mini">${recent}</table>` : '<p class="muted small">Aucune vidéo en ligne.</p>'}
        </div>`;
    }).join('');
}

async function loadChannels() {
    try {
        state.ytChannels = await getJson('/api/youtube/channels');
        renderChannels();
        if (!$('view-calendrier').hidden) renderCalendar();
    } catch (err) {
        $('channelsList').innerHTML = `<p class="muted">Erreur : ${esc(err.message)}</p>`;
    }
}
$('refreshChannels').addEventListener('click', loadChannels);

$('channelsList').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-connect]');
    if (!btn) return;
    const data = await getJson(`/api/youtube/connect?channel=${encodeURIComponent(btn.dataset.connect)}`).catch((err) => ({ error: err.message }));
    if (!data.url) return alert(data.error || 'Impossible d\'ouvrir la connexion Google.');
    alert(`Sur la page Google, choisissez la chaîne « ${channelName(btn.dataset.connect)} ». Revenez ensuite ici et cliquez sur Actualiser.`);
    window.open(data.url, '_blank');
});

/* ---------------- Publish ---------------- */
const dialog = $('publishDialog');

$('videosBody').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-publish]');
    if (!btn) return;
    const item = state.videos[Number(btn.dataset.publish)];
    state.publishItem = item;
    state.publishJobId = null;
    const yt = state.ytChannels.find((c) => c.channel === item.channel);
    $('publishTarget').textContent = `Chaîne : ${channelName(item.channel)} ${yt ? yt.handle : ''}`;
    $('pubTitle').value = item.title;
    $('pubDescription').value = '';
    $('pubTags').value = '';
    $('pubPrivacy').value = 'private';
    $('pubChecks').innerHTML = '<li class="muted">Vérifications en cours…</li>';
    $('pubBar').hidden = true;
    $('pubBarFill').style.width = '0';
    $('pubSubmit').disabled = true;
    $('pubNotice').textContent = yt && !yt.connected
        ? 'Cette chaîne n\'est pas connectée : connectez-la dans le panneau Chaînes.'
        : 'Tant que le projet API n\'est pas audité par YouTube, une vidéo envoyée par l\'API reste privée.';
    dialog.showModal();

    try {
        const meta = await getJson(`/api/videos/${encodeURIComponent(item.projectId)}/metadata`);
        $('pubTitle').value = meta.title || item.title;
        $('pubDescription').value = meta.description || '';
        $('pubTags').value = (meta.tags || []).join(', ');
    } catch (err) {
        $('pubNotice').textContent = `Métadonnées non générées (${err.message}). Remplissez-les à la main.`;
    }

    try {
        const report = await getJson('/api/prepublish/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoPath: item.videoPath, metadata: currentMetadata() })
        });
        renderChecks(report);
        $('pubSubmit').disabled = !report.ok || !(yt && yt.connected);
    } catch (err) {
        $('pubChecks').innerHTML = `<li class="ko">Vérification impossible : ${esc(err.message)}</li>`;
    }
});

function currentMetadata() {
    return {
        title: $('pubTitle').value.trim(),
        description: $('pubDescription').value.trim(),
        tags: $('pubTags').value.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 50),
        privacyStatus: $('pubPrivacy').value
    };
}

function renderChecks(report) {
    $('pubChecks').innerHTML = (report.checks || []).map((c) =>
        `<li class="${c.ok ? 'ok' : 'ko'}">${c.ok ? '✓' : '✗'} ${esc(c.label)}${c.details ? ` — ${esc(c.details)}` : ''}</li>`).join('');
}

$('pubSubmit').addEventListener('click', async () => {
    const item = state.publishItem;
    const metadata = currentMetadata();
    if (!metadata.title) return $('pubTitle').focus();
    $('pubSubmit').disabled = true;
    $('pubBar').hidden = false;
    try {
        const data = await getJson('/api/youtube/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoPath: item.videoPath, channel: item.channel, metadata })
        });
        state.publishJobId = data.publishJobId;
        socket.emit('subscribe-youtube', data.publishJobId);
        $('pubNotice').textContent = 'Envoi en cours…';
    } catch (err) {
        if (err.data?.report) renderChecks(err.data.report);
        $('pubNotice').textContent = `Échec : ${err.message}`;
        $('pubSubmit').disabled = false;
    }
});

socket.on('yt:status', (d) => {
    if (!state.publishJobId) return;
    $('pubBarFill').style.width = `${d.progress || 0}%`;
});
socket.on('yt:done', (d) => {
    $('pubBarFill').style.width = '100%';
    $('pubNotice').innerHTML = `Envoyée : <a href="${esc(d.videoUrl)}" target="_blank" rel="noopener">${esc(d.videoUrl)}</a>${d.warning ? `<br>${esc(d.warning)}` : ''}`;
    loadVideos();
    loadChannels();
});
socket.on('yt:error', (d) => {
    $('pubNotice').textContent = `Échec de l'envoi : ${d.error || 'erreur inconnue'}`;
    $('pubSubmit').disabled = false;
});

/* ---------------- Calendar (read only) ---------------- */
function calendarEvents() {
    const events = [];
    for (const v of state.videos) {
        events.push({ date: new Date(v.timestamp), channel: v.channel, title: v.title, href: v.videoPath, yt: false });
    }
    for (const c of state.ytChannels) {
        for (const v of c.stats?.recentVideos || []) {
            if (!v.publishedAt) continue;
            events.push({ date: new Date(v.publishedAt), channel: c.channel, title: v.title, href: `https://www.youtube.com/watch?v=${v.videoId}`, yt: true });
        }
    }
    return events;
}

function renderCalendar() {
    const first = state.month;
    const year = first.getFullYear();
    const month = first.getMonth();
    $('monthTitle').textContent = first.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    $('legend').innerHTML = CHANNEL_ORDER.map((id) => `<span><span class="dot ${id}"></span>${esc(channelName(id))}</span>`).join('');

    const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7)); // Monday first
    const events = calendarEvents();
    const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const today = new Date();

    let html = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'].map((d) => `<div class="dow">${d}</div>`).join('');
    for (let i = 0; i < 42; i++) {
        const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        if (i === 35 && day.getMonth() !== month) break;
        const dayEvents = events.filter((e) => sameDay(e.date, day));
        html += `<div class="day ${day.getMonth() !== month ? 'other' : ''} ${sameDay(day, today) ? 'today' : ''}">
            <span class="date">${day.getDate()}</span>
            ${dayEvents.map((e) => `<a class="event ${esc(e.channel)} ${e.yt ? 'yt' : ''}" href="${esc(e.href || '#')}" target="_blank" rel="noopener" title="${esc(e.title)}">${esc(e.title)}</a>`).join('')}
        </div>`;
    }
    $('calendar').innerHTML = html;
}

$('prevMonth').addEventListener('click', () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); renderCalendar(); });
$('nextMonth').addEventListener('click', () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); renderCalendar(); });

/* ---------------- Boot ---------------- */
(async function init() {
    try {
        const list = await getJson('/api/channels');
        state.channels = CHANNEL_ORDER.map((id) => list.find((c) => c.id === id)).filter(Boolean)
            .concat(list.filter((c) => !CHANNEL_ORDER.includes(c.id)));
        if (!state.channels.some((c) => c.id === state.channel) && state.channels[0]) state.channel = state.channels[0].id;
    } catch {
        state.channels = [];
    }
    renderChannelPicker();
    showView();
    await Promise.all([loadVideos(), loadChannels()]);
})();
