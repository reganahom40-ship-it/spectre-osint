/* ==========================================================================
   SPECTRE — 4-MODE MODERN OSINT PLATFORM JAVASCRIPT (V200.0)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // ---- State ----
    let activeMode = 'omni';
    let currentDossier = null;
    let leafletMap = null;
    let visNetwork = null;
    let globalProbeCount = 1248;

    // ---- DOM Elements ----
    const modePills = document.querySelectorAll('.mode-pill');
    const modeViews = document.querySelectorAll('.mode-view');
    const utcClock = document.getElementById('utc-clock');
    const toastContainer = document.getElementById('toast-container');

    // Mode 1: Omni
    const omniInput = document.getElementById('omni-input');
    const btnOmniSearch = document.getElementById('btn-omni-search');
    const omniEmptyState = document.getElementById('omni-empty-state');
    const omniResultsContent = document.getElementById('omni-results-content');
    const sampleBtns = document.querySelectorAll('.sample-btn');

    // Mode 2: Vectors Studio
    const vectorSearchFilter = document.getElementById('vector-search-filter');
    const vectorCards = document.querySelectorAll('.vcard');
    const vcardRunBtns = document.querySelectorAll('.vcard-run-btn');

    // Mode 3: Graph
    const btnGraphFit = document.getElementById('btn-graph-fit');
    const btnGraphReset = document.getElementById('btn-graph-reset');

    // Mode 4: Feed
    const liveStreamBox = document.getElementById('live-stream-box');
    const counterProbes = document.getElementById('counter-probes');

    // ---- Live Clock ----
    function initClock() {
        const update = () => {
            if (utcClock) {
                const now = new Date();
                utcClock.textContent = now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
            }
        };
        setInterval(update, 1000);
        update();
    }
    initClock();

    // ---- Mode Navigation Switching ----
    modePills.forEach(pill => {
        pill.addEventListener('click', () => {
            const mode = pill.getAttribute('data-mode');
            switchMode(mode);
        });
    });

    function switchMode(mode) {
        activeMode = mode;
        modePills.forEach(p => p.classList.toggle('active', p.getAttribute('data-mode') === mode));
        modeViews.forEach(v => v.classList.toggle('active', v.id === `view-${mode}`));

        if (mode === 'graph' && visNetwork) {
            setTimeout(() => visNetwork.fit(), 80);
        } else if (mode === 'omni' && omniInput) {
            omniInput.focus();
        }
    }

    // ==========================================================================
    // MODE 1: UNIVERSAL OMNI RECONNAISSANCE
    // ==========================================================================
    if (omniInput) {
        omniInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                btnOmniSearch.click();
            }
        });
    }

    sampleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const val = btn.getAttribute('data-val');
            if (omniInput) {
                omniInput.value = val;
                executeOmniSearch(val);
            }
        });
    });

    if (btnOmniSearch) {
        btnOmniSearch.addEventListener('click', () => {
            const val = omniInput.value.trim();
            if (!val) {
                showToast('Please enter a target entity', 'error');
                omniInput.focus();
                return;
            }
            executeOmniSearch(val);
        });
    }

    async function executeOmniSearch(target) {
        setOmniLoading(true);
        if (omniEmptyState) omniEmptyState.style.display = 'none';
        if (omniResultsContent) {
            omniResultsContent.style.display = 'flex';
            omniResultsContent.innerHTML = `
                <div class="loading-box">
                    <div class="loading-spinner"></div>
                    <div class="loading-title">Executing Multi-Threaded Reconnaissance Pipeline...</div>
                    <div class="loading-sub">Auto-classifying entity, querying live socket pools, and compiling intelligence dossier.</div>
                </div>
            `;
        }

        const startTime = performance.now();
        try {
            const res = await fetch(`/api/omni?target=${encodeURIComponent(target)}`);
            const json = await res.json();
            const elapsed = Math.round(performance.now() - startTime);

            if (!res.ok || json.error) {
                renderOmniError(json.error || 'Reconnaissance pipeline failed.', elapsed);
                showToast(`Scan Failed: ${json.error || 'Error'}`, 'error');
            } else {
                currentDossier = json;
                const data = json.data || {};
                renderOmniDossier(target, data.detected_type || 'entity', data.dossier || {}, elapsed);
                buildGraphTopology(target, data.dossier || {});
                showToast(`Intelligence Dossier Compiled (${elapsed}ms)`, 'success');
                addLiveStreamEvent('hit', `Omni Recon completed for: ${target} [${data.detected_type?.toUpperCase()}]`);
            }
        } catch (err) {
            const elapsed = Math.round(performance.now() - startTime);
            renderOmniError(`Network timeout: ${err.message}`, elapsed);
            showToast('Request timed out or failed', 'error');
        } finally {
            setOmniLoading(false);
        }
    }

    function setOmniLoading(isLoading) {
        if (!btnOmniSearch) return;
        if (isLoading) {
            btnOmniSearch.disabled = true;
            btnOmniSearch.innerHTML = `<i class="fas fa-spinner fa-spin"></i><span>Scanning...</span>`;
        } else {
            btnOmniSearch.disabled = false;
            btnOmniSearch.innerHTML = `<span>Execute Recon</span><kbd>↵</kbd>`;
        }
    }

    function renderOmniError(msg, elapsed) {
        if (!omniResultsContent) return;
        omniResultsContent.innerHTML = `
            <div class="intel-card-wrapper" style="border-color: rgba(244, 63, 94, 0.4); background: rgba(244, 63, 94, 0.04);">
                <div class="intel-card-header">
                    <span class="intel-card-title" style="color: var(--accent-rose);">
                        <i class="fas fa-circle-exclamation"></i> Reconnaissance Anomaly
                    </span>
                    <span class="latency-badge">${elapsed}ms</span>
                </div>
                <div class="intel-card-body" style="color: var(--accent-rose); font-family: var(--font-mono); font-size: 0.85rem;">
                    ${escapeHtml(msg)}
                </div>
            </div>
        `;
    }

    function renderOmniDossier(target, detectedType, dossier, elapsed) {
        if (!omniResultsContent) return;
        let html = `
            <div class="target-hero-card">
                <div class="target-title-group">
                    <div class="target-entity-name">${escapeHtml(target)}</div>
                    <span class="target-type-badge">${escapeHtml(detectedType)}</span>
                </div>
                <div class="target-actions">
                    <span class="latency-badge">${elapsed}ms</span>
                    <button class="btn-action-tool" id="btn-export-dossier"><i class="fas fa-download"></i> Export JSON</button>
                    <button class="btn-action-tool" id="btn-switch-graph"><i class="fas fa-diagram-project"></i> Topology</button>
                </div>
            </div>
        `;

        // 1. IP Module Section
        if (dossier.ip) {
            const ip = dossier.ip;
            html += `
                <div class="intel-card-wrapper">
                    <div class="intel-card-header">
                        <span class="intel-card-title"><i class="fas fa-network-wired"></i> IP Intelligence & Geolocation</span>
                        <span style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--accent-cyan);">${escapeHtml(ip.query || target)}</span>
                    </div>
                    <div class="intel-card-body">
                        <div class="stat-metric-grid">
                            <div class="stat-metric-card">
                                <span class="stat-label">Location</span>
                                <span class="stat-value" style="font-size: 1.05rem;">${escapeHtml(ip.city || '')}, ${escapeHtml(ip.country || '')}</span>
                            </div>
                            <div class="stat-metric-card">
                                <span class="stat-label">ISP Network</span>
                                <span class="stat-value" style="font-size: 0.9rem;">${escapeHtml(ip.isp || 'N/A')}</span>
                            </div>
                            <div class="stat-metric-card">
                                <span class="stat-label">Routing ASN</span>
                                <span class="stat-value" style="font-size: 0.85rem; color: var(--accent-primary);">${escapeHtml(ip.as || ip.asn || 'N/A')}</span>
                            </div>
                            <div class="stat-metric-card">
                                <span class="stat-label">Classification</span>
                                <span class="stat-value" style="font-size: 0.95rem; color: ${ip.hosting ? 'var(--accent-amber)' : 'var(--accent-emerald)'};">
                                    ${ip.hosting ? 'DATACENTER' : (ip.proxy ? 'PROXY / VPN' : 'RESIDENTIAL')}
                                </span>
                            </div>
                        </div>

                        ${ip.lat && ip.lon ? `
                            <div class="map-container-box">
                                <div id="result-leaflet-map"></div>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }

        // 2. Domain & Subdomains Section
        if (dossier.domain) {
            const dom = dossier.domain;
            const subs = dom.subdomains || [];
            html += `
                <div class="intel-card-wrapper">
                    <div class="intel-card-header">
                        <span class="intel-card-title"><i class="fas fa-globe"></i> Domain WHOIS & CT Subdomains</span>
                        <span style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--accent-cyan);">${subs.length} Discovered</span>
                    </div>
                    <div class="intel-card-body">
                        <div class="stat-metric-grid" style="margin-bottom: 16px;">
                            <div class="stat-metric-card">
                                <span class="stat-label">Registrar</span>
                                <span class="stat-value" style="font-size: 0.9rem;">${escapeHtml(dom.registrar || dom.whois?.registrar || 'N/A')}</span>
                            </div>
                            <div class="stat-metric-card">
                                <span class="stat-label">Discovered Subdomains</span>
                                <span class="stat-value" style="color: var(--accent-cyan);">${subs.length}</span>
                            </div>
                        </div>

                        ${subs.length > 0 ? `
                            <div style="overflow-x: auto; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm);">
                                <table class="clean-table" style="width: 100%; border-collapse: collapse; font-family: var(--font-mono); font-size: 0.78rem;">
                                    <thead><tr><th style="padding: 9px 12px; background: var(--bg-surface); text-align: left; color: var(--text-dim); border-bottom: 1px solid var(--border-subtle);">Subdomain Endpoint</th><th style="padding: 9px 12px; background: var(--bg-surface); text-align: left; color: var(--text-dim); border-bottom: 1px solid var(--border-subtle);">Intelligence Source</th></tr></thead>
                                    <tbody>
                                        ${subs.slice(0, 15).map(s => `<tr><td style="padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.02);"><code>${escapeHtml(s)}</code></td><td style="padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.02); color: var(--accent-emerald);">Certificate Transparency</td></tr>`).join('')}
                                    </tbody>
                                </table>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }

        // 3. Username Section
        if (dossier.username) {
            const u = dossier.username;
            const found = u.found || [];
            html += `
                <div class="intel-card-wrapper">
                    <div class="intel-card-header">
                        <span class="intel-card-title"><i class="fas fa-user"></i> Username Discovery (112+ Platforms)</span>
                        <span style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--accent-emerald); font-weight: 700;">${found.length} Profiles Confirmed</span>
                    </div>
                    <div class="intel-card-body">
                        <div class="platform-hit-grid">
                            ${found.map(f => `
                                <div class="platform-hit-card">
                                    <div>
                                        <div class="platform-name">${escapeHtml(f.platform)}</div>
                                        <a href="${escapeHtml(f.url)}" target="_blank" rel="noopener noreferrer" class="platform-link">${escapeHtml(f.url)}</a>
                                    </div>
                                    <span style="font-size: 0.65rem; font-family: var(--font-mono); font-weight: 700; color: var(--accent-emerald); background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); padding: 2px 6px; border-radius: 4px;">FOUND</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
        }

        // 4. Google Dorks Section
        if (dossier.dorks) {
            const cats = dossier.dorks.categories || {};
            let dorkRows = '';
            for (const [k, v] of Object.entries(cats)) {
                (v.queries || []).slice(0, 3).forEach(q => {
                    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(q.dork)}`;
                    dorkRows += `
                        <div class="dork-query-row">
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-size: 0.75rem; color: var(--text-dim); margin-bottom: 2px;">${escapeHtml(q.purpose || k)}</div>
                                <div class="dork-query-text">${escapeHtml(q.dork)}</div>
                            </div>
                            <a href="${searchUrl}" target="_blank" rel="noopener noreferrer" class="btn-action-tool" style="color: var(--accent-cyan); white-space: nowrap;">
                                <i class="fas fa-arrow-up-right-from-square"></i> Launch
                            </a>
                        </div>
                    `;
                });
            }
            html += `
                <div class="intel-card-wrapper">
                    <div class="intel-card-header">
                        <span class="intel-card-title"><i class="fas fa-search-nodes"></i> Passive Google Dorks</span>
                    </div>
                    <div class="intel-card-body">
                        <div class="dork-query-list">${dorkRows}</div>
                    </div>
                </div>
            `;
        }

        // 5. Discord Snowflake Section
        if (dossier.discord) {
            const dc = dossier.discord;
            html += `
                <div class="intel-card-wrapper">
                    <div class="intel-card-header">
                        <span class="intel-card-title"><i class="fa-brands fa-discord"></i> Discord Snowflake Telemetry</span>
                    </div>
                    <div class="intel-card-body">
                        <div class="stat-metric-grid">
                            <div class="stat-metric-card">
                                <span class="stat-label">Created Epoch (UTC)</span>
                                <span class="stat-value" style="font-size: 0.95rem; color: var(--accent-cyan);">${escapeHtml(dc.created_at || 'N/A')}</span>
                            </div>
                            <div class="stat-metric-card">
                                <span class="stat-label">Account Age</span>
                                <span class="stat-value" style="color: var(--accent-emerald);">${escapeHtml(String(dc.account_age_days ? dc.account_age_days + ' days' : 'N/A'))}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        omniResultsContent.innerHTML = html;

        // Bind actions
        const exportBtn = document.getElementById('btn-export-dossier');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                const blob = new Blob([JSON.stringify(dossier, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `spectre-${target}-${Date.now()}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast('Intelligence JSON Exported', 'success');
            });
        }

        const switchGraphBtn = document.getElementById('btn-switch-graph');
        if (switchGraphBtn) {
            switchGraphBtn.addEventListener('click', () => switchMode('graph'));
        }

        // Mount Map if coordinates exist
        if (dossier.ip && dossier.ip.lat && dossier.ip.lon) {
            setTimeout(() => mountLeafletMap(dossier.ip.lat, dossier.ip.lon, dossier.ip.city, dossier.ip.country, dossier.ip.query || target), 50);
        }
    }

    // ==========================================================================
    // MODE 2: 10 MODULAR VECTORS STUDIO
    // ==========================================================================
    if (vectorSearchFilter) {
        vectorSearchFilter.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase().trim();
            vectorCards.forEach(card => {
                const title = card.querySelector('.vcard-title').textContent.toLowerCase();
                const tags = card.getAttribute('data-tags') || '';
                if (title.includes(q) || tags.includes(q)) {
                    card.style.display = 'flex';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    }

    vcardRunBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const mod = btn.getAttribute('data-mod');
            const input = document.getElementById(`vinput-${mod}`);
            const drawer = document.getElementById(`vdrawer-${mod}`);
            if (!input || !drawer) return;

            const val = input.value.trim();
            if (!val) {
                showToast(`Please enter target for ${mod.toUpperCase()}`, 'error');
                input.focus();
                return;
            }

            executeVectorStudioScan(mod, val, drawer, btn);
        });
    });

    document.querySelectorAll('.vcard-input').forEach(input => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const btn = input.closest('.vcard-interactive').querySelector('.vcard-run-btn');
                if (btn) btn.click();
            }
        });
    });

    async function executeVectorStudioScan(mod, val, drawer, btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
        drawer.style.display = 'block';
        drawer.innerHTML = `<div style="color: var(--accent-cyan); padding: 8px 0;"><i class="fas fa-spinner fa-spin"></i> Probing ${mod}...</div>`;

        const paramMap = {
            username: 'username', dorks: 'target', discord: 'id', ip: 'ip',
            bgp: 'asn', email: 'email', domain: 'domain', phone: 'phone',
            headers: 'url', hash: 'hash'
        };

        try {
            const res = await fetch(`/api/${mod}?${paramMap[mod] || 'target'}=${encodeURIComponent(val)}`);
            const json = await res.json();

            if (!res.ok || json.error) {
                drawer.innerHTML = `<div style="color: var(--accent-rose);">${escapeHtml(json.error || 'Query failed')}</div>`;
            } else {
                const data = json.data || json;
                drawer.innerHTML = `<pre style="background: var(--bg-surface); padding: 10px; border-radius: 4px; border: 1px solid var(--border-subtle); font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-main); max-height: 220px; overflow-y: auto;">${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
                showToast(`Vector [${mod}] Scanned`, 'success');
                addLiveStreamEvent('probe', `Vector [${mod.toUpperCase()}] executed for ${val}`);
            }
        } catch (err) {
            drawer.innerHTML = `<div style="color: var(--accent-rose);">${escapeHtml(err.message)}</div>`;
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<i class="fas fa-play"></i>`;
        }
    }

    // ==========================================================================
    // MODE 3: TOPOLOGY GRAPH
    // ==========================================================================
    function buildGraphTopology(target, dossier) {
        const container = document.getElementById('vis-full-canvas');
        if (!container) return;

        const nodes = [
            { id: 'target', label: target, color: '#6366f1', font: { color: '#ffffff', size: 16, face: 'Inter' }, shape: 'box' }
        ];
        const edges = [];

        if (dossier.ip) {
            nodes.push({ id: 'node_ip', label: `IP: ${dossier.ip.query || target}`, color: '#10b981', font: { color: '#ffffff', size: 12 }, shape: 'ellipse' });
            edges.push({ from: 'target', to: 'node_ip', color: { color: '#10b981' } });
            if (dossier.ip.isp) {
                nodes.push({ id: 'node_isp', label: `ISP: ${dossier.ip.isp}`, color: '#06b6d4', font: { color: '#ffffff', size: 10 }, shape: 'dot', size: 8 });
                edges.push({ from: 'node_ip', to: 'node_isp', color: { color: '#06b6d4' } });
            }
        }

        if (dossier.domain && dossier.domain.subdomains) {
            dossier.domain.subdomains.slice(0, 15).forEach((s, idx) => {
                const subId = `sub_${idx}`;
                nodes.push({ id: subId, label: s, color: '#06b6d4', font: { color: '#ffffff', size: 10 }, shape: 'dot', size: 8 });
                edges.push({ from: 'target', to: subId, color: { color: '#06b6d4', opacity: 0.5 } });
            });
        }

        if (dossier.username && dossier.username.found) {
            dossier.username.found.slice(0, 20).forEach((f, idx) => {
                const uId = `usr_${idx}`;
                nodes.push({ id: uId, label: f.platform, color: '#10b981', font: { color: '#ffffff', size: 11 }, shape: 'dot', size: 10 });
                edges.push({ from: 'target', to: uId, color: { color: '#10b981', opacity: 0.6 } });
            });
        }

        const data = {
            nodes: new vis.DataSet(nodes),
            edges: new vis.DataSet(edges)
        };

        const options = {
            nodes: { borderWidth: 1, shadow: true },
            edges: { width: 1.5, smooth: { type: 'continuous' } },
            physics: {
                solver: 'forceAtlas2Based',
                forceAtlas2Based: { gravitationalConstant: -35, centralGravity: 0.01, springLength: 90 }
            }
        };

        visNetwork = new vis.Network(container, data, options);
    }

    if (btnGraphFit) btnGraphFit.addEventListener('click', () => visNetwork && visNetwork.fit());
    if (btnGraphReset) btnGraphReset.addEventListener('click', () => buildGraphTopology('SPECTRE', {}));

    // ==========================================================================
    // MODE 4: LIVE THREAT RADAR FEED SIMULATION
    // ==========================================================================
    function addLiveStreamEvent(type, text) {
        if (!liveStreamBox) return;
        const now = new Date().toISOString().slice(11, 19);
        const div = document.createElement('div');
        div.className = 'stream-event';
        div.innerHTML = `
            <span class="stream-tag ${type}">${type.toUpperCase()}</span>
            <span class="stream-text">${escapeHtml(text)}</span>
            <span class="stream-time">${now}</span>
        `;
        liveStreamBox.insertBefore(div, liveStreamBox.firstChild);
        if (liveStreamBox.children.length > 50) {
            liveStreamBox.removeChild(liveStreamBox.lastChild);
        }

        globalProbeCount += Math.floor(Math.random() * 3) + 1;
        if (counterProbes) counterProbes.textContent = globalProbeCount.toLocaleString();
    }

    // Periodic live feed generation
    const sampleStreamEvents = [
        { type: 'probe', text: 'Passive WHOIS query dispatched -> .io TLD zone' },
        { type: 'dns', text: 'Certificate Transparency leaf parsed -> *.internal.corp' },
        { type: 'hit', text: 'BGP Prefix announced AS13335 (Cloudflare) -> 172.64.0.0/13' },
        { type: 'probe', text: 'Asynchronous socket check -> GitHub API profile' },
        { type: 'dns', text: 'MX mail exchange resolved -> priority 10 googlemail.com' },
        { type: 'hit', text: 'Shannon entropy verified -> MD5 cryptographic hash format' }
    ];

    setInterval(() => {
        const rand = sampleStreamEvents[Math.floor(Math.random() * sampleStreamEvents.length)];
        addLiveStreamEvent(rand.type, rand.text);
    }, 4500);

    // Initial feed seeds
    sampleStreamEvents.forEach(e => addLiveStreamEvent(e.type, e.text));

    // ==========================================================================
    // LEAFLET MAP
    // ==========================================================================
    function mountLeafletMap(lat, lon, city, country, ip) {
        const mapEl = document.getElementById('result-leaflet-map');
        if (!mapEl) return;

        if (leafletMap) {
            leafletMap.remove();
            leafletMap = null;
        }

        leafletMap = L.map('result-leaflet-map', {
            zoomControl: false,
            attributionControl: false
        }).setView([lat, lon], 9);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19
        }).addTo(leafletMap);

        const customIcon = L.divIcon({
            className: 'map-custom-pin',
            html: `<div style="width: 14px; height: 14px; background: #06b6d4; border-radius: 50%; box-shadow: 0 0 15px #06b6d4, 0 0 25px #06b6d4;"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7]
        });

        L.marker([lat, lon], { icon: customIcon }).addTo(leafletMap);
    }

    // ==========================================================================
    // TOAST NOTIFICATIONS
    // ==========================================================================
    function showToast(message, type = 'info') {
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        let icon = 'fa-circle-info';
        if (type === 'success') icon = 'fa-circle-check';
        if (type === 'error') icon = 'fa-circle-exclamation';

        toast.innerHTML = `<i class="fas ${icon}"></i><span>${escapeHtml(message)}</span>`;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(6px)';
            toast.style.transition = 'all 0.2s ease';
            setTimeout(() => toast.remove(), 200);
        }, 2800);
    }

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
});
