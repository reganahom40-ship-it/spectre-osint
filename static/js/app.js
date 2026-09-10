/**
 * SPECTRE OSINT Platform — Modern Client Apparatus (v300001)
 */

(function () {
    'use strict';

    // --- State & Sound ---
    let soundEnabled = true;
    let audioCtx = null;
    let networkGraph = null;
    let currentOmniTarget = null;
    let totalProbesCounter = 1248;

    // --- Audio Synthesizer ---
    function initAudio() {
        if (!audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) audioCtx = new AudioContext();
        }
    }

    function playTone(freq = 440, type = 'sine', duration = 0.08) {
        if (!soundEnabled) return;
        try {
            initAudio();
            if (!audioCtx) return;
            if (audioCtx.state === 'suspended') audioCtx.resume();

            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            osc.type = type;
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

            gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

            osc.connect(gain);
            gain.connect(audioCtx.destination);

            osc.start();
            osc.stop(audioCtx.currentTime + duration);
        } catch (e) {
            // Audio ignore
        }
    }

    // --- Cursor Follower Glow ---
    function initCursorGlow() {
        const glow = document.getElementById('cursor-glow');
        if (!glow) return;
        window.addEventListener('mousemove', (e) => {
            glow.style.left = e.clientX + 'px';
            glow.style.top = e.clientY + 'px';
        });
    }

    // --- Live UTC Clock ---
    function initClock() {
        const clockEl = document.getElementById('utc-clock');
        function tick() {
            if (clockEl) {
                const now = new Date();
                clockEl.textContent = now.toUTCString().split(' ')[4] + ' UTC';
            }
        }
        tick();
        setInterval(tick, 1000);
    }

    // --- Dynamic Search Placeholder Typing ---
    function initDynamicTyping() {
        const input = document.getElementById('omni-input');
        if (!input) return;

        const placeholders = [
            'Search username: @shadow, @turing, @spectre...',
            'Search IP: 1.1.1.1, 8.8.8.8, 93.184.216.34...',
            'Search Domain: github.com, apple.com, openai.com...',
            'Search Discord ID: 155149108183695360...',
            'Search Hash: 5d41402abc4b2a76b9719d911017c592...',
            'Search Email: contact@domain.com, root@target.org...'
        ];

        let pIdx = 0;
        let charIdx = 0;
        let isDeleting = false;

        function typeLoop() {
            if (document.activeElement === input) {
                setTimeout(typeLoop, 500);
                return;
            }

            const current = placeholders[pIdx];
            if (!isDeleting) {
                input.placeholder = current.substring(0, charIdx + 1);
                charIdx++;
                if (charIdx === current.length) {
                    isDeleting = true;
                    setTimeout(typeLoop, 2000);
                    return;
                }
            } else {
                input.placeholder = current.substring(0, charIdx - 1);
                charIdx--;
                if (charIdx === 0) {
                    isDeleting = false;
                    pIdx = (pIdx + 1) % placeholders.length;
                }
            }
            setTimeout(typeLoop, isDeleting ? 30 : 60);
        }
        typeLoop();
    }

    // --- Toast Notifications ---
    function showToast(msg, icon = 'fas fa-info-circle') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `<i class="${icon}"></i> <span>${msg}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    // --- Tab Navigation Modes ---
    function initNavigation() {
        const pills = document.querySelectorAll('.mode-pill');
        const views = document.querySelectorAll('.mode-view');

        pills.forEach(pill => {
            pill.addEventListener('click', () => {
                playTone(520, 'sine', 0.05);
                const targetMode = pill.dataset.mode;
                
                pills.forEach(p => p.classList.remove('active'));
                views.forEach(v => v.classList.remove('active'));

                pill.classList.add('active');
                const targetView = document.getElementById(`view-${targetMode}`);
                if (targetView) targetView.classList.add('active');

                if (targetMode === 'graph' && networkGraph) {
                    setTimeout(() => networkGraph.fit(), 200);
                }
            });
        });

        // Sound toggle
        const soundBtn = document.getElementById('btn-sound-toggle');
        const soundIcon = document.getElementById('sound-icon');
        const soundLabel = document.getElementById('sound-label');

        if (soundBtn) {
            soundBtn.addEventListener('click', () => {
                soundEnabled = !soundEnabled;
                if (soundEnabled) {
                    soundIcon.className = 'fas fa-volume-high';
                    soundLabel.textContent = 'Audio: ON';
                    playTone(600, 'sine', 0.1);
                    showToast('Audio Synthesis Activated', 'fas fa-volume-high');
                } else {
                    soundIcon.className = 'fas fa-volume-xmark';
                    soundLabel.textContent = 'Audio: OFF';
                    showToast('Audio Synthesis Muted', 'fas fa-volume-xmark');
                }
            });
        }
    }

    // --- Vis.js Topology Graph ---
    function initGraph(containerId = 'vis-full-canvas') {
        const container = document.getElementById(containerId);
        if (!container) return;

        const data = {
            nodes: new vis.DataSet([
                { id: 'spectre', label: 'SPECTRE CORE', color: '#6366f1', shape: 'dot', size: 28, font: { color: '#fff', face: 'JetBrains Mono' } },
                { id: 'v_user', label: 'Social Vectors (112+)', color: '#06b6d4', shape: 'dot', size: 16, font: { color: '#94a3b8' } },
                { id: 'v_ip', label: 'GeoIP & BGP Sockets', color: '#10b981', shape: 'dot', size: 16, font: { color: '#94a3b8' } },
                { id: 'v_dns', label: 'DNS & CT Certificate Stream', color: '#f59e0b', shape: 'dot', size: 16, font: { color: '#94a3b8' } },
                { id: 'v_disc', label: 'Discord Bitshift Engine', color: '#a855f7', shape: 'dot', size: 16, font: { color: '#94a3b8' } }
            ]),
            edges: new vis.DataSet([
                { from: 'spectre', to: 'v_user', color: { color: 'rgba(99,102,241,0.4)' }, arrows: 'to' },
                { from: 'spectre', to: 'v_ip', color: { color: 'rgba(99,102,241,0.4)' }, arrows: 'to' },
                { from: 'spectre', to: 'v_dns', color: { color: 'rgba(99,102,241,0.4)' }, arrows: 'to' },
                { from: 'spectre', to: 'v_disc', color: { color: 'rgba(99,102,241,0.4)' }, arrows: 'to' }
            ])
        };

        const options = {
            physics: {
                stabilization: false,
                barnesHut: { gravitationalConstant: -3500, springLength: 120 }
            },
            interaction: { hover: true, tooltipDelay: 100 }
        };

        networkGraph = new vis.Network(container, data, options);

        const btnFit = document.getElementById('btn-graph-fit');
        if (btnFit) btnFit.addEventListener('click', () => networkGraph.fit());

        const btnReset = document.getElementById('btn-graph-reset');
        if (btnReset) {
            btnReset.addEventListener('click', () => {
                initGraph(containerId);
                showToast('Topology Graph Reset', 'fas fa-rotate');
            });
        }
    }

    function updateGraphWithTarget(target, data) {
        if (!networkGraph) return;
        try {
            const nodes = networkGraph.body.data.nodes;
            const edges = networkGraph.body.data.edges;

            const tNodeId = `target_${Date.now()}`;
            nodes.add({
                id: tNodeId,
                label: `TARGET: ${target}`,
                color: '#f43f5e',
                shape: 'dot',
                size: 24,
                font: { color: '#fff', face: 'JetBrains Mono', strokeWidth: 2, strokeColor: '#000' }
            });
            edges.add({ from: 'spectre', to: tNodeId, color: { color: '#f43f5e' }, width: 2, arrows: 'to' });

            if (data.results) {
                Object.keys(data.results).forEach((modKey) => {
                    const modData = data.results[modKey];
                    if (modData && !modData.error) {
                        const modNodeId = `res_${modKey}_${Date.now()}`;
                        nodes.add({
                            id: modNodeId,
                            label: `${modKey.toUpperCase()}`,
                            color: '#06b6d4',
                            shape: 'dot',
                            size: 14,
                            font: { color: '#cbd5e1' }
                        });
                        edges.add({ from: tNodeId, to: modNodeId, color: { color: 'rgba(6, 182, 212, 0.5)' } });
                    }
                });
            }
            networkGraph.fit();
        } catch (e) {
            console.error('Graph update err', e);
        }
    }

    // --- Omni Recon Execution ---
    async function executeOmniRecon(targetVal) {
        const input = document.getElementById('omni-input');
        const target = (targetVal || (input ? input.value : '')).trim();
        if (!target) {
            showToast('Please enter a target identifier', 'fas fa-triangle-exclamation');
            return;
        }

        currentOmniTarget = target;
        playTone(680, 'sine', 0.1);

        const btnExec = document.getElementById('btn-omni-exec');
        const emptyState = document.getElementById('omni-empty-state');
        const resultsDeck = document.getElementById('omni-results-content');

        if (btnExec) {
            btnExec.disabled = true;
            btnExec.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>Cascading...</span>`;
        }
        if (emptyState) emptyState.style.display = 'none';
        if (resultsDeck) {
            resultsDeck.style.display = 'block';
            resultsDeck.innerHTML = `
                <div class="empty-state-container" style="border: 1px solid var(--border-glow); background: rgba(99,102,241,0.05);">
                    <div class="radar-scan-graphic">
                        <div class="radar-sweep-beam"></div>
                        <i class="fas fa-satellite fa-spin radar-center-icon"></i>
                    </div>
                    <h3>Autonomous Cascade Engaged</h3>
                    <p>Executing parallel queries across all 10 intelligence vectors for <strong style="color:var(--accent-cyan)">${target}</strong>...</p>
                </div>
            `;
        }

        try {
            const resp = await fetch(`/api/omni?target=${encodeURIComponent(target)}`, {
                headers: { 'Cache-Control': 'no-cache' }
            });
            const data = await resp.json();

            totalProbesCounter += 10;
            const counterEl = document.getElementById('counter-probes');
            if (counterEl) counterEl.textContent = totalProbesCounter.toLocaleString();

            renderOmniDossier(target, data);
            updateGraphWithTarget(target, data);
            playTone(880, 'sine', 0.15);
            showToast(`Recon Dossier Built for ${target}`, 'fas fa-check-circle');
        } catch (err) {
            if (resultsDeck) {
                resultsDeck.innerHTML = `
                    <div class="empty-state-container" style="border-color: var(--accent-rose);">
                        <i class="fas fa-circle-xmark text-rose" style="font-size: 2.5rem; margin-bottom: 16px;"></i>
                        <h3>Cascade Failed</h3>
                        <p>${err.message || 'Connection or upstream error'}</p>
                    </div>
                `;
            }
        } finally {
            if (btnExec) {
                btnExec.disabled = false;
                btnExec.innerHTML = `<span class="btn-shine"></span><i class="fas fa-bolt"></i><span>Execute Recon</span><kbd>↵</kbd>`;
            }
        }
    }

    // --- Render Omni Dossier ---
    function renderOmniDossier(target, data) {
        const deck = document.getElementById('omni-results-content');
        if (!deck) return;

        const res = data.results || {};
        const classifications = data.classifications || [data.type || 'Generic'];

        let html = `
            <div class="dossier-summary-card">
                <div class="dossier-target-info">
                    <div class="dossier-avatar-badge">
                        <i class="fas fa-fingerprint"></i>
                    </div>
                    <div class="dossier-target-meta">
                        <h2>${escapeHtml(target)}</h2>
                        <p>Classifications: ${classifications.map(c => `<span class="dcard-badge" style="margin-right:4px;">${c}</span>`).join('')}</p>
                    </div>
                </div>
                <div class="dossier-actions">
                    <button class="btn-dossier-action" id="btn-copy-dossier"><i class="fas fa-copy"></i> Copy JSON</button>
                </div>
            </div>

            <div class="dossier-grid">
        `;

        // 1. IP Module Card
        if (res.ip && !res.ip.error) {
            const ipd = res.ip;
            html += `
                <div class="dossier-card">
                    <div class="dcard-header">
                        <div class="dcard-title-wrap"><i class="fas fa-network-wired"></i><h4>IP Intelligence & Geo</h4></div>
                        <span class="dcard-badge">GEOLOCATION</span>
                    </div>
                    <table class="kv-table">
                        <tr><td class="kv-key">IP Address</td><td class="kv-val">${ipd.ip || target}</td></tr>
                        <tr><td class="kv-key">Location</td><td class="kv-val">${ipd.city || '—'}, ${ipd.country || '—'}</td></tr>
                        <tr><td class="kv-key">ISP / Org</td><td class="kv-val">${ipd.org || ipd.isp || '—'}</td></tr>
                        <tr><td class="kv-key">ASN</td><td class="kv-val">${ipd.as || '—'}</td></tr>
                    </table>
                    ${ipd.lat && ipd.lon ? `<div id="dossier-map" class="map-canvas-container"></div>` : ''}
                </div>
            `;
        }

        // 2. Username Findings
        if (res.username && !res.username.error) {
            const hits = res.username.found || [];
            html += `
                <div class="dossier-card">
                    <div class="dcard-header">
                        <div class="dcard-title-wrap"><i class="fas fa-user-astronaut"></i><h4>Username Discovery (${hits.length} Found)</h4></div>
                        <span class="dcard-badge">${res.username.total_checked || 112}+ CHECKED</span>
                    </div>
                    ${hits.length > 0 ? `
                        <div class="hit-tags-grid">
                            ${hits.map(h => `<a href="${h.url}" target="_blank" rel="noopener" class="hit-badge"><i class="fas fa-arrow-up-right-from-square"></i> ${h.platform}</a>`).join('')}
                        </div>
                    ` : `<p style="color:var(--text-dim);font-size:0.85rem;">No public matches detected on checked platforms.</p>`}
                </div>
            `;
        }

        // 3. Discord Snowflake Card
        if (res.discord && !res.discord.error && res.discord.valid) {
            const d = res.discord;
            html += `
                <div class="dossier-card">
                    <div class="dcard-header">
                        <div class="dcard-title-wrap"><i class="fa-brands fa-discord"></i><h4>Discord Snowflake</h4></div>
                        <span class="dcard-badge">64-BIT TIMESTAMP</span>
                    </div>
                    <table class="kv-table">
                        <tr><td class="kv-key">Snowflake ID</td><td class="kv-val">${d.snowflake}</td></tr>
                        <tr><td class="kv-key">Created UTC</td><td class="kv-val">${d.timestamp_utc}</td></tr>
                        <tr><td class="kv-key">Account Age</td><td class="kv-val">${d.age_days} days</td></tr>
                        <tr><td class="kv-key">Unix Epoch</td><td class="kv-val">${d.unix_timestamp}</td></tr>
                    </table>
                </div>
            `;
        }

        // 4. Domain & WHOIS Card
        if (res.domain && !res.domain.error) {
            const d = res.domain;
            const subs = d.subdomains_ct || [];
            html += `
                <div class="dossier-card">
                    <div class="dcard-header">
                        <div class="dcard-title-wrap"><i class="fas fa-globe"></i><h4>Domain & CT Certificates</h4></div>
                        <span class="dcard-badge">WHOIS + CT</span>
                    </div>
                    <table class="kv-table">
                        <tr><td class="kv-key">Registrar</td><td class="kv-val">${d.registrar || '—'}</td></tr>
                        <tr><td class="kv-key">Created</td><td class="kv-val">${d.creation_date || '—'}</td></tr>
                        <tr><td class="kv-key">Expires</td><td class="kv-val">${d.expiration_date || '—'}</td></tr>
                    </table>
                    ${subs.length > 0 ? `
                        <div style="margin-top:12px;">
                            <span style="font-size:0.75rem;color:var(--text-muted);font-weight:700;">SUBDOMAINS (${subs.length}):</span>
                            <div class="hit-tags-grid" style="margin-top:6px;max-height:120px;">
                                ${subs.slice(0, 15).map(s => `<span class="hit-badge" style="background:rgba(99,102,241,0.1);border-color:rgba(99,102,241,0.3);color:#a5b4fc;">${s}</span>`).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
        }

        // 5. Hash Classifier
        if (res.hash && !res.hash.error) {
            const h = res.hash;
            html += `
                <div class="dossier-card">
                    <div class="dcard-header">
                        <div class="dcard-title-wrap"><i class="fas fa-key"></i><h4>Hash Classification</h4></div>
                        <span class="dcard-badge">ENTROPY: ${h.entropy || '—'}</span>
                    </div>
                    <table class="kv-table">
                        <tr><td class="kv-key">Possible Algos</td><td class="kv-val">${(h.possible_algorithms || []).join(', ') || 'Unknown'}</td></tr>
                        <tr><td class="kv-key">Bit Length</td><td class="kv-val">${h.length ? h.length * 4 : '—'} bits</td></tr>
                        <tr><td class="kv-key">Charset</td><td class="kv-val">${h.charset || '—'}</td></tr>
                    </table>
                </div>
            `;
        }

        // 6. Security Headers
        if (res.headers && !res.headers.error) {
            const hd = res.headers;
            html += `
                <div class="dossier-card">
                    <div class="dcard-header">
                        <div class="dcard-title-wrap"><i class="fas fa-shield-halved"></i><h4>HTTP Security Audit</h4></div>
                        <span class="dcard-badge">STATUS: ${hd.status_code || '—'}</span>
                    </div>
                    <table class="kv-table">
                        <tr><td class="kv-key">Server</td><td class="kv-val">${hd.server || 'Hidden / WAF'}</td></tr>
                        <tr><td class="kv-key">HSTS</td><td class="kv-val">${hd.hsts ? 'Enforced' : 'Missing'}</td></tr>
                        <tr><td class="kv-key">CSP</td><td class="kv-val">${hd.csp ? 'Present' : 'Missing'}</td></tr>
                    </table>
                </div>
            `;
        }

        html += `</div>`; // end grid
        deck.innerHTML = html;

        // Render leaflet map if coordinates exist
        if (res.ip && res.ip.lat && res.ip.lon) {
            setTimeout(() => {
                const mapEl = document.getElementById('dossier-map');
                if (mapEl) {
                    const map = L.map(mapEl).setView([res.ip.lat, res.ip.lon], 9);
                    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                        attribution: '&copy; OpenStreetMap & CARTO',
                        subdomains: 'abcd',
                        maxZoom: 19
                    }).addTo(map);
                    L.marker([res.ip.lat, res.ip.lon]).addTo(map)
                        .bindPopup(`<b>${res.ip.city || 'Target'}</b><br>${res.ip.ip}`)
                        .openPopup();
                }
            }, 100);
        }

        // Copy JSON Dossier
        const btnCopy = document.getElementById('btn-copy-dossier');
        if (btnCopy) {
            btnCopy.addEventListener('click', () => {
                navigator.clipboard.writeText(JSON.stringify(data, null, 2));
                showToast('Dossier JSON Copied to Clipboard', 'fas fa-copy');
            });
        }
    }

    // --- Studio Grid Interactive Cards ---
    function initStudio() {
        const filterInput = document.getElementById('studio-filter-input');
        const cards = document.querySelectorAll('.studio-card');

        if (filterInput) {
            filterInput.addEventListener('input', (e) => {
                const q = e.target.value.toLowerCase().trim();
                cards.forEach(card => {
                    const tags = (card.dataset.tags || '') + ' ' + (card.querySelector('.scard-title')?.textContent || '');
                    card.style.display = tags.toLowerCase().includes(q) ? 'flex' : 'none';
                });
            });
        }

        // Run buttons inside studio cards
        const execBtns = document.querySelectorAll('.scard-exec-btn');
        execBtns.forEach(btn => {
            btn.addEventListener('click', async () => {
                const mod = btn.dataset.mod;
                const input = document.getElementById(`vinput-${mod}`);
                const drawer = document.getElementById(`vdrawer-${mod}`);
                const val = (input ? input.value : '').trim();

                if (!val) {
                    showToast(`Enter target for ${mod.toUpperCase()}`, 'fas fa-triangle-exclamation');
                    return;
                }

                btn.disabled = true;
                btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
                if (drawer) {
                    drawer.style.display = 'block';
                    drawer.innerHTML = `<span style="font-size:0.8rem;color:var(--accent-cyan);font-family:var(--font-mono);"><i class="fas fa-circle-notch fa-spin"></i> Querying vector...</span>`;
                }

                try {
                    let endpoint = `/api/${mod}?`;
                    if (mod === 'username') endpoint += `username=${encodeURIComponent(val)}`;
                    else if (mod === 'ip') endpoint += `ip=${encodeURIComponent(val)}`;
                    else if (mod === 'domain') endpoint += `domain=${encodeURIComponent(val)}`;
                    else if (mod === 'dorks') endpoint += `target=${encodeURIComponent(val)}`;
                    else if (mod === 'discord') endpoint += `id=${encodeURIComponent(val)}`;
                    else if (mod === 'bgp') endpoint += `asn=${encodeURIComponent(val)}`;
                    else if (mod === 'email') endpoint += `email=${encodeURIComponent(val)}`;
                    else if (mod === 'phone') endpoint += `phone=${encodeURIComponent(val)}`;
                    else if (mod === 'headers') endpoint += `url=${encodeURIComponent(val)}`;
                    else if (mod === 'hash') endpoint += `hash=${encodeURIComponent(val)}`;

                    const res = await fetch(endpoint);
                    const json = await res.json();

                    renderStudioDrawer(mod, json, drawer);
                    playTone(720, 'sine', 0.08);
                } catch (e) {
                    if (drawer) {
                        drawer.innerHTML = `<span style="font-size:0.8rem;color:var(--accent-rose);font-family:var(--font-mono);">Error: ${e.message}</span>`;
                    }
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = `<i class="fas fa-play"></i>`;
                }
            });
        });
    }

    function renderStudioDrawer(mod, data, drawer) {
        if (!drawer) return;
        if (data.error) {
            drawer.innerHTML = `<span style="color:var(--accent-rose);font-size:0.8rem;font-family:var(--font-mono);">${data.error}</span>`;
            return;
        }

        let content = `<div style="background:var(--bg-input);padding:10px;border-radius:var(--radius-sm);font-size:0.8rem;font-family:var(--font-mono);max-height:180px;overflow-y:auto;border:1px solid var(--border-subtle);">`;

        if (mod === 'username' && data.found) {
            content += `<div style="margin-bottom:6px;color:var(--accent-emerald);">Found ${data.found.length} profiles:</div>`;
            data.found.forEach(f => {
                content += `<div><a href="${f.url}" target="_blank" style="color:var(--accent-cyan);text-decoration:none;">• ${f.platform}</a></div>`;
            });
        } else if (mod === 'dorks' && data.dorks) {
            content += `<div style="margin-bottom:6px;color:var(--accent-primary);">Generated Dorks:</div>`;
            data.dorks.forEach(d => {
                content += `<div style="margin-bottom:4px;"><a href="${d.search_url}" target="_blank" style="color:#a5b4fc;text-decoration:none;">• ${d.name}</a></div>`;
            });
        } else {
            content += `<pre style="white-space:pre-wrap;word-break:break-all;color:#e2e8f0;">${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
        }

        content += `</div>`;
        drawer.innerHTML = content;
    }

    // --- Live Stream Generator (Threat Radar) ---
    function initLiveStream() {
        const streamBox = document.getElementById('live-stream-box');
        if (!streamBox) return;

        const simulatedEvents = [
            { icon: 'fas fa-user-astronaut', color: '#06b6d4', title: 'Username Sweep', desc: 'Identified public profile on GitHub & GitLab' },
            { icon: 'fas fa-network-wired', color: '#10b981', title: 'BGP Route Match', desc: 'Prefix announced by AS15169 (Google LLC)' },
            { icon: 'fa-brands fa-discord', color: '#a855f7', title: 'Snowflake Bitshift', desc: 'Epoch decoded: Account created Oct 2017' },
            { icon: 'fas fa-shield-halved', color: '#f43f5e', title: 'Security Header Audit', desc: 'Missing Content-Security-Policy header' },
            { icon: 'fas fa-certificate', color: '#f59e0b', title: 'CT Certificate Found', desc: 'Wildcard *.domain.internal logged to crt.sh' },
            { icon: 'fas fa-key', color: '#ec4899', title: 'Cryptographic Hash', desc: 'High entropy MD5 hash classified' }
        ];

        function addEvent() {
            const ev = simulatedEvents[Math.floor(Math.random() * simulatedEvents.length)];
            const timeStr = new Date().toTimeString().split(' ')[0];
            const div = document.createElement('div');
            div.className = 'stream-event-item';
            div.innerHTML = `
                <div class="sevent-left">
                    <div class="sevent-icon" style="background:${ev.color}20; color:${ev.color};">
                        <i class="${ev.icon}"></i>
                    </div>
                    <div class="sevent-meta">
                        <h5>${ev.title}</h5>
                        <p>${ev.desc}</p>
                    </div>
                </div>
                <span class="sevent-time">${timeStr}</span>
            `;

            streamBox.insertBefore(div, streamBox.firstChild);
            if (streamBox.children.length > 20) {
                streamBox.removeChild(streamBox.lastChild);
            }
        }

        // Add 4 initial items
        for (let i = 0; i < 4; i++) addEvent();
        setInterval(addEvent, 3500);
    }

    // --- Presets & Omni Input Wiring ---
    function initPresetsAndInput() {
        const input = document.getElementById('omni-input');
        const btnExec = document.getElementById('btn-omni-exec');

        if (input && btnExec) {
            btnExec.addEventListener('click', () => executeOmniRecon());
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') executeOmniRecon();
            });
        }

        // Preset Chips
        const chips = document.querySelectorAll('.preset-chip');
        chips.forEach(chip => {
            chip.addEventListener('click', () => {
                const val = chip.dataset.val;
                if (input) input.value = val;
                executeOmniRecon(val);
            });
        });
    }

    // --- Helper Utilities ---
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // --- DOM Ready Boot ---
    document.addEventListener('DOMContentLoaded', () => {
        initCursorGlow();
        initClock();
        initNavigation();
        initDynamicTyping();
        initPresetsAndInput();
        initStudio();
        initGraph();
        initLiveStream();
    });

})();
