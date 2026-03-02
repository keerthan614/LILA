/* =========================================
   LILA BLACK — Player Journey Visualizer
   Core Application Logic
   ========================================= */

// ======================= STATE =======================
const state = {
    index: null,           // index.json data
    matchData: null,       // current match JSON
    currentMap: 'AmbroseValley',
    currentDate: 'all',
    currentMatchId: null,
    showHumans: true,
    showBots: true,
    showTrails: true,
    showEvents: true,
    heatmapMode: 'none',   // none, kills, deaths, traffic
    isPlaying: false,
    playbackSpeed: 1,
    playbackTime: 0,       // current time in ms
    playbackMax: 0,        // max time in ms
    animFrame: null,
    lastFrameTime: 0,
    minimapImages: {},
    canvasScale: 1,
    canvasOffsetX: 0,
    canvasOffsetY: 0,
};

// ======================= ELEMENTS =======================
const $ = (id) => document.getElementById(id);
const mapCanvas = $('map-canvas');
const overlayCanvas = $('overlay-canvas');
const heatmapCanvas = $('heatmap-canvas');
const mapCtx = mapCanvas.getContext('2d');
const overlayCtx = overlayCanvas.getContext('2d');
const heatCtx = heatmapCanvas.getContext('2d');

// ======================= INIT =======================
async function init() {
    try {
        const res = await fetch('public/data/index.json');
        state.index = await res.json();
    } catch (e) {
        console.error('Failed to load index.json', e);
        return;
    }

    // Preload minimap images
    const maps = ['AmbroseValley', 'GrandRift', 'Lockdown'];
    const exts = { AmbroseValley: 'png', GrandRift: 'png', Lockdown: 'jpg' };
    await Promise.all(maps.map(m => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => { state.minimapImages[m] = img; resolve(); };
            img.onerror = () => { console.warn(`Failed to load minimap for ${m}`); resolve(); };
            img.src = `public/minimaps/${m}_Minimap.${exts[m]}`;
        });
    }));

    setupEventListeners();
    updateMatchList();
    resizeCanvases();
    renderMap();
}

// ======================= EVENT LISTENERS =======================
function setupEventListeners() {
    // Sidebar toggle
    $('sidebar-toggle').addEventListener('click', () => {
        document.querySelector('.sidebar').classList.toggle('collapsed');
        setTimeout(resizeCanvases, 250);
    });

    // Map selector
    document.querySelectorAll('.map-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.map-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentMap = btn.dataset.map;
            state.currentMatchId = null;
            state.matchData = null;
            $('breadcrumb').textContent = btn.dataset.map;
            updateMatchList();
            hideTimeline();
            showEmptyState();
            clearHeatmap();
            // Ensure canvas is resized and map redraws after layout changes
            requestAnimationFrame(() => {
                resizeCanvases();
                renderMap();
            });
        });
    });

    // Date filter
    $('date-filter').addEventListener('change', (e) => {
        state.currentDate = e.target.value;
        updateMatchList();
    });

    // Match selector
    $('match-selector').addEventListener('change', async (e) => {
        const matchId = e.target.value;
        if (!matchId) return;
        await loadMatch(matchId);
    });

    // Visibility toggles
    $('toggle-humans').addEventListener('change', (e) => { state.showHumans = e.target.checked; renderFrame(); });
    $('toggle-bots').addEventListener('change', (e) => { state.showBots = e.target.checked; renderFrame(); });
    $('toggle-trails').addEventListener('change', (e) => { state.showTrails = e.target.checked; renderFrame(); });
    $('toggle-events').addEventListener('change', (e) => { state.showEvents = e.target.checked; renderFrame(); });

    // Heatmap selector
    document.querySelectorAll('.heatmap-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.heatmap-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.heatmapMode = btn.dataset.heatmap;
            $('heatmap-legend').style.display = state.heatmapMode === 'none' ? 'none' : 'block';
            renderHeatmap();
        });
    });

    // Play/Pause
    $('btn-play').addEventListener('click', togglePlayback);

    // Timeline slider
    $('timeline-slider').addEventListener('input', (e) => {
        state.playbackTime = (e.target.value / 1000) * state.playbackMax;
        renderFrame();
        updateTimeDisplay();
    });

    // Speed controls
    document.querySelectorAll('.speed-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.playbackSpeed = parseInt(btn.dataset.speed);
        });
    });

    // Canvas mouse move for tooltip
    overlayCanvas.addEventListener('mousemove', handleMouseMove);
    overlayCanvas.addEventListener('mouseleave', () => { $('tooltip').style.display = 'none'; });

    // Window resize
    window.addEventListener('resize', () => { resizeCanvases(); renderMap(); renderFrame(); renderHeatmap(); });
}

// ======================= DATA LOADING =======================
function updateMatchList() {
    const select = $('match-selector');
    select.innerHTML = '<option value="">Select a match...</option>';

    if (!state.index) return;

    const filtered = state.index.matches.filter(m => {
        if (m.map !== state.currentMap) return false;
        if (state.currentDate !== 'all' && m.date !== state.currentDate) return false;
        return true;
    });

    // Sort by humans desc, then duration desc
    filtered.sort((a, b) => (b.humans - a.humans) || (b.duration_ms - a.duration_ms));

    filtered.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        const dur = formatDuration(m.duration_ms);
        opt.textContent = `${m.humans}H / ${m.bots}B — ${dur} — ${m.date.replace('February_', 'Feb ')}`;
        select.appendChild(opt);
    });
}

async function loadMatch(matchId) {
    state.currentMatchId = matchId;
    try {
        const res = await fetch(`public/data/${matchId}.json`);
        state.matchData = await res.json();
    } catch (e) {
        console.error('Failed to load match', e);
        return;
    }

    // Find match meta
    const meta = state.index.matches.find(m => m.id === matchId);
    if (meta) {
        $('stat-humans').textContent = meta.humans;
        $('stat-bots').textContent = meta.bots;
        $('stat-duration').textContent = formatDuration(meta.duration_ms);
        $('match-stats').style.display = 'flex';
        state.playbackMax = meta.duration_ms;
    }

    // Count events
    let eventCount = 0;
    Object.values(state.matchData.players).forEach(p => { eventCount += p.events.length; });
    $('event-counter').textContent = `${eventCount.toLocaleString()} events`;

    state.playbackTime = state.playbackMax; // Show full match initially
    $('timeline-slider').value = 1000;
    updateTimeDisplay();

    hideEmptyState();
    showTimeline();
    // Ensure map re-renders after timeline shows (which changes canvas size)
    requestAnimationFrame(() => {
        resizeCanvases();
        renderMap();
        renderFrame();
        renderHeatmap();
    });
}

// ======================= CANVAS SIZING =======================
function resizeCanvases() {
    const container = $('canvas-container');
    const w = container.clientWidth;
    const h = container.clientHeight;
    const dpr = window.devicePixelRatio || 1;

    [mapCanvas, overlayCanvas, heatmapCanvas].forEach(c => {
        c.width = w * dpr;
        c.height = h * dpr;
        c.style.width = w + 'px';
        c.style.height = h + 'px';
        c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    });

    // Calculate scale to fit 1024x1024 map into container with padding
    const pad = 20;
    const availW = w - pad * 2;
    const availH = h - pad * 2;
    state.canvasScale = Math.min(availW / 1024, availH / 1024);
    state.canvasOffsetX = (w - 1024 * state.canvasScale) / 2;
    state.canvasOffsetY = (h - 1024 * state.canvasScale) / 2;
}

// ======================= RENDERING =======================
function renderMap() {
    const ctx = mapCtx;
    const w = mapCanvas.width / (window.devicePixelRatio || 1);
    const h = mapCanvas.height / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, w, h);

    const img = state.minimapImages[state.currentMap];
    if (!img) return;

    const s = state.canvasScale;
    const ox = state.canvasOffsetX;
    const oy = state.canvasOffsetY;

    // Draw map image
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 20;
    ctx.drawImage(img, ox, oy, 1024 * s, 1024 * s);
    ctx.restore();

    // Map border
    ctx.strokeStyle = 'rgba(99,102,241,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, 1024 * s, 1024 * s);
}

function renderFrame() {
    const ctx = overlayCtx;
    const w = overlayCanvas.width / (window.devicePixelRatio || 1);
    const h = overlayCanvas.height / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, w, h);

    if (!state.matchData) return;

    const s = state.canvasScale;
    const ox = state.canvasOffsetX;
    const oy = state.canvasOffsetY;
    const t = state.playbackTime;

    const players = state.matchData.players;

    // Draw each player
    Object.entries(players).forEach(([uid, pdata]) => {
        const isHuman = pdata.is_human;
        if (isHuman && !state.showHumans) return;
        if (!isHuman && !state.showBots) return;

        // Filter events up to current time
        const events = pdata.events.filter(e => e.ts <= t);
        if (events.length === 0) return;

        const color = isHuman ? '#22d3ee' : '#4b5563';
        const alpha = isHuman ? 0.8 : 0.4;

        // Draw trail
        if (state.showTrails && events.length > 1) {
            ctx.beginPath();
            ctx.strokeStyle = isHuman
                ? `rgba(34,211,238,${alpha * 0.5})`
                : `rgba(75,85,99,${alpha * 0.3})`;
            ctx.lineWidth = isHuman ? 1.5 : 0.8;
            ctx.lineJoin = 'round';

            const posEvents = events.filter(e =>
                e.e === 'Position' || e.e === 'BotPosition'
            );

            if (posEvents.length > 1) {
                ctx.moveTo(ox + posEvents[0].x * s, oy + posEvents[0].y * s);
                for (let i = 1; i < posEvents.length; i++) {
                    ctx.lineTo(ox + posEvents[i].x * s, oy + posEvents[i].y * s);
                }
                ctx.stroke();
            }
        }

        // Draw current position (last position event)
        const lastPos = [...events].reverse().find(e =>
            e.e === 'Position' || e.e === 'BotPosition'
        );
        if (lastPos) {
            const px = ox + lastPos.x * s;
            const py = oy + lastPos.y * s;

            // Glow
            if (isHuman) {
                ctx.beginPath();
                const grad = ctx.createRadialGradient(px, py, 0, px, py, 8 * s / state.canvasScale);
                grad.addColorStop(0, 'rgba(34,211,238,0.4)');
                grad.addColorStop(1, 'rgba(34,211,238,0)');
                ctx.fillStyle = grad;
                ctx.arc(px, py, 8, 0, Math.PI * 2);
                ctx.fill();
            }

            // Dot
            ctx.beginPath();
            ctx.fillStyle = color;
            ctx.arc(px, py, isHuman ? 3.5 : 2, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw event markers
        if (state.showEvents) {
            events.forEach(ev => {
                if (ev.e === 'Position' || ev.e === 'BotPosition') return;
                const ex = ox + ev.x * s;
                const ey = oy + ev.y * s;
                drawEventMarker(ctx, ex, ey, ev.e);
            });
        }
    });
}

function drawEventMarker(ctx, x, y, eventType) {
    const size = 6;
    ctx.save();

    switch (eventType) {
        case 'Kill':
        case 'BotKill':
            // Red crosshair
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x - size, y - size);
            ctx.lineTo(x + size, y + size);
            ctx.moveTo(x + size, y - size);
            ctx.lineTo(x - size, y + size);
            ctx.stroke();
            // Glow
            ctx.shadowColor = '#ef4444';
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, Math.PI * 2);
            ctx.fillStyle = '#ef4444';
            ctx.fill();
            break;

        case 'Killed':
        case 'BotKilled':
            // Orange skull
            ctx.fillStyle = '#f97316';
            ctx.shadowColor = '#f97316';
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(x, y, size - 1, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#0b0e17';
            ctx.font = '8px Inter';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('☠', x, y + 0.5);
            break;

        case 'KilledByStorm':
            // Purple lightning
            ctx.fillStyle = '#a855f7';
            ctx.shadowColor = '#a855f7';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.moveTo(x, y - size);
            ctx.lineTo(x - size * 0.6, y);
            ctx.lineTo(x + size * 0.3, y);
            ctx.lineTo(x, y + size);
            ctx.lineTo(x + size * 0.6, y);
            ctx.lineTo(x - size * 0.3, y);
            ctx.closePath();
            ctx.fill();
            break;

        case 'Loot':
            // Gold diamond
            ctx.fillStyle = '#eab308';
            ctx.shadowColor = '#eab308';
            ctx.shadowBlur = 4;
            ctx.beginPath();
            ctx.moveTo(x, y - size * 0.7);
            ctx.lineTo(x + size * 0.7, y);
            ctx.lineTo(x, y + size * 0.7);
            ctx.lineTo(x - size * 0.7, y);
            ctx.closePath();
            ctx.fill();
            break;
    }

    ctx.restore();
}

// ======================= HEATMAP =======================
function renderHeatmap() {
    const ctx = heatCtx;
    const w = heatmapCanvas.width / (window.devicePixelRatio || 1);
    const h = heatmapCanvas.height / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, w, h);

    if (state.heatmapMode === 'none' || !state.matchData) return;

    const s = state.canvasScale;
    const ox = state.canvasOffsetX;
    const oy = state.canvasOffsetY;

    // Collect points based on mode
    const points = [];
    const players = state.matchData.players;

    Object.values(players).forEach(p => {
        p.events.forEach(ev => {
            if (ev.ts > state.playbackTime) return;

            switch (state.heatmapMode) {
                case 'kills':
                    if (ev.e === 'Kill' || ev.e === 'BotKill')
                        points.push({ x: ev.x, y: ev.y });
                    break;
                case 'deaths':
                    if (ev.e === 'Killed' || ev.e === 'BotKilled' || ev.e === 'KilledByStorm')
                        points.push({ x: ev.x, y: ev.y });
                    break;
                case 'traffic':
                    if (ev.e === 'Position' || ev.e === 'BotPosition')
                        points.push({ x: ev.x, y: ev.y });
                    break;
            }
        });
    });

    if (points.length === 0) return;

    // Draw heatmap using radial gradients
    const radius = state.heatmapMode === 'traffic' ? 20 : 30;

    // Create offscreen canvas at map resolution
    const offCanvas = document.createElement('canvas');
    offCanvas.width = 256;
    offCanvas.height = 256;
    const offCtx = offCanvas.getContext('2d');

    // Draw intensity circles
    points.forEach(p => {
        const px = (p.x / 1024) * 256;
        const py = (p.y / 1024) * 256;
        const r = (radius / 1024) * 256;

        const grad = offCtx.createRadialGradient(px, py, 0, px, py, r);
        grad.addColorStop(0, 'rgba(255,255,255,0.15)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        offCtx.fillStyle = grad;
        offCtx.fillRect(px - r, py - r, r * 2, r * 2);
    });

    // Get intensity data
    const imgData = offCtx.getImageData(0, 0, 256, 256);
    const coloredCanvas = document.createElement('canvas');
    coloredCanvas.width = 256;
    coloredCanvas.height = 256;
    const coloredCtx = coloredCanvas.getContext('2d');
    const output = coloredCtx.createImageData(256, 256);

    // Colorize
    for (let i = 0; i < imgData.data.length; i += 4) {
        const intensity = imgData.data[i + 3] + imgData.data[i]; // use alpha + red for intensity
        const norm = Math.min(intensity / 60, 1);

        if (norm > 0.02) {
            const color = heatmapColor(norm);
            output.data[i] = color[0];
            output.data[i + 1] = color[1];
            output.data[i + 2] = color[2];
            output.data[i + 3] = Math.floor(norm * 200);
        }
    }

    coloredCtx.putImageData(output, 0, 0);

    // Draw to main canvas with smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(coloredCanvas, ox, oy, 1024 * s, 1024 * s);
}

function heatmapColor(t) {
    // Cool to hot: blue → cyan → yellow → red
    if (t < 0.25) {
        const n = t / 0.25;
        return [0, Math.floor(n * 200), 255];
    } else if (t < 0.5) {
        const n = (t - 0.25) / 0.25;
        return [0, 200 + Math.floor(n * 55), Math.floor(255 * (1 - n))];
    } else if (t < 0.75) {
        const n = (t - 0.5) / 0.25;
        return [Math.floor(n * 255), 255, 0];
    } else {
        const n = (t - 0.75) / 0.25;
        return [255, Math.floor(255 * (1 - n)), 0];
    }
}

function clearHeatmap() {
    const w = heatmapCanvas.width / (window.devicePixelRatio || 1);
    const h = heatmapCanvas.height / (window.devicePixelRatio || 1);
    heatCtx.clearRect(0, 0, w, h);
}

// ======================= PLAYBACK =======================
function togglePlayback() {
    if (state.isPlaying) {
        stopPlayback();
    } else {
        startPlayback();
    }
}

function startPlayback() {
    if (!state.matchData) return;
    state.isPlaying = true;
    $('btn-play').textContent = '⏸';
    $('btn-play').classList.add('playing');

    // If at end, restart
    if (state.playbackTime >= state.playbackMax) {
        state.playbackTime = 0;
    }

    state.lastFrameTime = performance.now();
    animate();
}

function stopPlayback() {
    state.isPlaying = false;
    $('btn-play').textContent = '▶';
    $('btn-play').classList.remove('playing');
    if (state.animFrame) {
        cancelAnimationFrame(state.animFrame);
        state.animFrame = null;
    }
}

function animate() {
    if (!state.isPlaying) return;

    const now = performance.now();
    const dt = now - state.lastFrameTime;
    state.lastFrameTime = now;

    // Advance time — normalize so matches play over ~10 seconds at 1x
    // playbackMax is in ms, we want the full match to take ~10 real seconds
    const normalizedSpeed = (state.playbackMax / 10000) * state.playbackSpeed;
    state.playbackTime += dt * normalizedSpeed;

    if (state.playbackTime >= state.playbackMax) {
        state.playbackTime = state.playbackMax;
        stopPlayback();
    }

    // Update slider
    $('timeline-slider').value = (state.playbackTime / state.playbackMax) * 1000;
    updateTimeDisplay();

    renderFrame();
    if (state.heatmapMode !== 'none') renderHeatmap();

    state.animFrame = requestAnimationFrame(animate);
}

function updateTimeDisplay() {
    $('time-current').textContent = formatDuration(state.playbackTime);
    $('time-total').textContent = formatDuration(state.playbackMax);
}

// ======================= TOOLTIP =======================
function handleMouseMove(e) {
    if (!state.matchData) return;

    const rect = overlayCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const s = state.canvasScale;
    const ox = state.canvasOffsetX;
    const oy = state.canvasOffsetY;

    // Convert to map coords
    const mapX = (mx - ox) / s;
    const mapY = (my - oy) / s;

    if (mapX < 0 || mapX > 1024 || mapY < 0 || mapY > 1024) {
        $('tooltip').style.display = 'none';
        return;
    }

    // Find nearest event
    let closest = null;
    let closestDist = 15; // max 15px snap distance

    Object.entries(state.matchData.players).forEach(([uid, pdata]) => {
        pdata.events.forEach(ev => {
            if (ev.ts > state.playbackTime) return;
            if (ev.e === 'Position' || ev.e === 'BotPosition') return;

            const dx = ev.x - mapX;
            const dy = ev.y - mapY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < closestDist) {
                closestDist = dist;
                closest = { uid, ev, isHuman: pdata.is_human };
            }
        });
    });

    if (closest) {
        const tip = $('tooltip');
        const eventNames = {
            'Kill': '⚔️ Player Kill',
            'Killed': '☠️ Player Death',
            'BotKill': '⚔️ Bot Kill',
            'BotKilled': '☠️ Killed by Bot',
            'KilledByStorm': '⚡ Storm Death',
            'Loot': '💎 Loot Pickup'
        };
        tip.innerHTML = `
            <strong>${eventNames[closest.ev.e] || closest.ev.e}</strong><br>
            ${closest.isHuman ? '👤 Human' : '🤖 Bot'}: ${closest.uid.substring(0, 8)}...<br>
            ⏱ ${formatDuration(closest.ev.ts)}
        `;
        tip.style.display = 'block';
        tip.style.left = (e.clientX - rect.left + 12) + 'px';
        tip.style.top = (e.clientY - rect.top - 10) + 'px';
    } else {
        $('tooltip').style.display = 'none';
    }
}

// ======================= UI HELPERS =======================
function showEmptyState() { $('empty-state').style.display = 'block'; }
function hideEmptyState() { $('empty-state').style.display = 'none'; }
function showTimeline() { $('timeline-bar').style.display = 'flex'; setTimeout(resizeCanvases, 50); }
function hideTimeline() { $('timeline-bar').style.display = 'none'; stopPlayback(); }

function formatDuration(ms) {
    if (!ms || ms <= 0) return '0.000s';
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    const totalSec = ms / 1000;
    if (totalSec < 60) return `${totalSec.toFixed(1)}s`;
    const min = Math.floor(totalSec / 60);
    const sec = Math.floor(totalSec % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
}

// ======================= START =======================
window.addEventListener('DOMContentLoaded', init);
