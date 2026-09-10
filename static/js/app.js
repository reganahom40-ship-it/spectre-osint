/* ==========================================================================
   SPECTRE — MODERN OSINT & THREAT INTELLIGENCE APPARATUS JS (V100.0)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // ---- State ----
    let activeMode = 'omni';
    let activeVector = 'omni';
    let currentData = null;
    let leafletMap = null;
    let visNetwork = null;

    // ---- DOM Elements ----
    const modePills = document.querySelectorAll('.mode-pill');
    const vectorChips = document.querySelectorAll('.chip');
    const sampleBtns = document.querySelectorAll('.sample-btn');
    const mainSearchInput = document.getElementById('main-search-input');
    const btnSearchExec = document.getElementById('btn-search-exec');
    const emptyState = document.getElementById('empty-state');
    const resultsContent = document.getElementById('results-content');
    const graphViewportCard = document.getElementById('graph-viewport-card');
    const utcClock = document.getElementById('utc-clock');
    const toastContainer = document.getElementById('toast-container');
    const btnGraphFit = document.getElementById('btn-graph-fit');
    const btnGraphReset = document.getElementById('btn-graph-reset');

    const PLACEHOLDERS = {
        omni: 'Enter target (e.g. shadow, 1.1.1.1, github.com, 155149108183695360, admin@domain.com)...',
        username: 'Enter username to probe (e.g. shadow, neo, alex)...',
        ip: 'Enter IPv4 or IPv6 address (e.g. 1.1.1.1, 8.8.8.8)...',
        domain: 'Enter domain name (e.g. github.com, cloudflare.com)...',
        dorks: 'Enter domain or organization keyword (e.g. tesla.com)...',
        discord: 'Enter 64-bit Discord Snowflake ID (e.g. 155149108183695360)...',
        bgp: 'Enter Autonomous System Number (e.g. AS15169, AS13335)...',
        email: 'Enter email address (e.g. target@domain.com)...',
        phone: 'Enter phone number in international format (+14155552671)...',
        headers: 'Enter full URL (e.g. https://example.com)...',
        hash: 'Enter MD5, SHA-1, SHA-256, or NTLM hash string...'
    };

    // ---- Clock ----
    function updateClock() {
        if (!utcClock) return;
        const now = new Date();
        utcClock.textContent = now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    }
    setInterval(updateClock, 1000);
    updateClock();

    // ---- Mode Switching ----
    modePills.forEach(pill => {
        pill.addEventListener('click', () => {
            const mode = pill.getAttribute('data-mode');
            setMode(mode);
        });
    });

    function setMode(mode) {
        activeMode = mode;
        modePills.forEach(p => p.classList.toggle('active', p.getAttribute('data-mode') === mode));

        if (mode === 'graph') {
            if (resultsContent) resultsContent.style.display = 'none';
            if (emptyState) emptyState.style.display = 'none';
            if (graphViewportCard) {
                graphViewportCard.style.display = 'block';
                if (visNetwork) setTimeout(() => visNetwork.fit(), 80);
            }
        } else {
            if (graphViewportCard) graphViewportCard.style.display = 'none';
            if (currentData) {
                if (resultsContent) resultsContent.style.display = 'flex';
                if (emptyState) emptyState.style.display = 'none';
            } else {
                if (emptyState) emptyState.style.display = 'flex';
                if (resultsContent) resultsContent.style.display = 'none';
            }
        }
    }

    // ---- Vector Chip Filter Switching ----
    vectorChips.forEach(chip => {
        chip.addEventListener('click', () => {
            const vec = chip.getAttribute('data-vector');
            setVector(vec);
        });
    });

    function setVector(vec) {
        activeVector = vec;
        vectorChips.forEach(c => c.classList.toggle('active', c.getAttribute('data-vector') === vec));
        if (mainSearchInput) {
            mainSearchInput.placeholder = PLACEHOLDERS[vec] || PLACEHOLDERS.omni;
            mainSearchInput.focus();
        }
    }

    // ---- Sample Presets ----
    sampleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const val = btn.getAttribute('data-val');
            const vec = btn.getAttribute('data-vec') || 'omni';
            setVector(vec);
            if (mainSearchInput) {
                mainSearchInput.value = val;
                executeSearch(val);
            }
        });
    });

    // ---- Search Engagement Trigger ----
    if (mainSearchInput) {
        mainSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                btnSearchExec.click();
            }
        });
    }

    if (btnSearchExec) {
        btnSearchExec.addEventListener('click', () => {
            const val = mainSearchInput.value.trim();
            if (!val) {
                showToast('Please enter a target query', 'error');
                mainSearchInput.focus();
                return;
            }
            executeSearch(val);
        });
    }

    // ---- Execution Engine ----
    async function executeSearch(target) {
        setLoading(true);
        if (emptyState) emptyState.style.display = 'none';
        if (graphViewportCard) graphViewportCard.style.display = 'none';
        if (resultsContent) {
            resultsContent.style.display = 'flex';
            resultsContent.innerHTML = `
                <div class="loading-box">
                    <div class="loading-spinner"></div>
                    <div class="loading-title">Executing Passive Reconnaissance Pipeline...</div>
                    <div class="loading-sub">Querying live socket pools, WHOIS registries, DNS zones, and platform endpoints.</div>
                </div>
            `;
        }

        const startTime = performance.now();
        let endpoint = `/api/omni?target=${encodeURIComponent(target)}`;
        if (activeVector !== 'omni') {
            const paramMap = {
                username: 'username', ip: 'ip', domain: 'domain', dorks: 'target',
                discord: 'id', bgp: 'asn', email: 'email', phone: 'phone',
                headers: 'url', hash: 'hash'
            };
            endpoint = `/api/${activeVector}?${paramMap[activeVector] || 'target'}=${encodeURIComponent(target)}`;
        }

        try {
            const res = await fetch(endpoint);
            const json = await res.json();
            const elapsed = Math.round(performance.now() - startTime);

            if (!res.ok || json.error) {
                renderError(json.error || 'Reconnaissance query failed.', elapsed);
                showToast(`Scan Failed: ${json.error || 'Error'}`, 'error');
            } else {
                currentData = json;
                if (activeVector === 'omni') {
                    const data = json.data || {};
                    renderOmniResults(target, data.detected_type || 'entity', data.dossier || {}, elapsed);
                    buildGraph(target, data.dossier || {});
                } else {
                    const payload = (json && json.data !== undefined) ? json.data : json;
                    renderVectorResults(activeVector, target, payload, elapsed);
                    const mock = {};
                    mock[activeVector] = payload;
                    buildGraph(target, mock);
                }
                showToast(`Scan Complete in ${elapsed}ms`, 'success');
            }
        } catch (err) {
            const elapsed = Math.round(performance.now() - startTime);
            renderError(`Network error: ${err.message}`, elapsed);
            showToast('Network request timed out', 'error');
        } finally {
            setLoading(false);
        }
    }

    function setLoading(isLoading) {
        if (!btnSearchExec) return;
        if (isLoading) {
            btnSearchExec.disabled = true;
            btnSearchExec.innerHTML = `<i class="fas fa-spinner fa-spin"></i><span>Scanning...</span>`;
        } else {
            btnSearchExec.disabled = false;
            btnSearchExec.innerHTML = `<span>Scan Target</span><kbd>↵</kbd>`;
        }
    }

    function renderError(msg, elapsed) {
        if (!resultsContent) return;
        resultsContent.innerHTML = `
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

    // ==========================================================================
    // MODERN RESULTS RENDERERS
    // ==========================================================================
    function renderOmniResults(target, detectedType, dossier, elapsed) {
        if (!resultsContent) return;
        let cardsHtml = `
            <!-- Target Header Banner -->
            <div class="target-hero-card">
                <div class="target-title-group">
                    <div class="target-entity-name">${escapeHtml(target)}</div>
                    <span class="target-type-badge">${escapeHtml(detectedType)}</span>
                </div>
                <div class="target-actions">
                    <span class="latency-badge">${elapsed}ms</span>
                    <button class="btn-action-tool" id="btn-export-dossier"><i class="fas fa-download"></i> Export JSON</button>
                    <button class="btn-action-tool" id="btn-view-graph-mode"><i class="fas fa-diagram-project"></i> Topology</button>
                </div>
            </div>
        `;

        // 1. IP Module Section
        if (dossier.ip) {
            const ip = dossier.ip;
            cardsHtml += `
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

        // 2. Domain & CT Subdomains
        if (dossier.domain) {
            const dom = dossier.domain;
            const subs = dom.subdomains || [];
            cardsHtml += `
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
                                <table class="clean-table">
                                    <thead><tr><th>Subdomain Endpoint</th><th>Intelligence Source</th></tr></thead>
                                    <tbody>
                                        ${subs.slice(0, 15).map(s => `<tr><td><code>${escapeHtml(s)}</code></td><td><span style="color: var(--accent-emerald); font-weight: 600;">Certificate Transparency</span></td></tr>`).join('')}
                                    </tbody>
                                </table>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }

        // 3. Usernames
        if (dossier.username) {
            const u = dossier.username;
            const found = u.found || [];
            cardsHtml += `
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

        // 4. Google Dorks
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
            cardsHtml += `
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

        // 5. Discord Snowflake
        if (dossier.discord) {
            const dc = dossier.discord;
            cardsHtml += `
                <div class="intel-card-wrapper">
                    <div class="intel-card-header">
                        <span class="intel-card-title"><i class="fa-brands fa-discord"></i> Discord Snowflake Telemetry</span>
                    </div>
                    <div class="intel-card-body">
                        <div class="stat-metric-grid">
                            <div class="stat-metric-card">
                                <span class="stat-label">Created Timestamp</span>
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

        resultsContent.innerHTML = cardsHtml;
        bindActions(target, dossier);

        if (dossier.ip && dossier.ip.lat && dossier.ip.lon) {
            setTimeout(() => mountMap(dossier.ip.lat, dossier.ip.lon, dossier.ip.city, dossier.ip.country, dossier.ip.query || target), 50);
        }
    }

    function renderVectorResults(vector, target, payload, elapsed) {
        if (!resultsContent) return;
        let html = `
            <div class="target-hero-card">
                <div class="target-title-group">
                    <div class="target-entity-name">${escapeHtml(target)}</div>
                    <span class="target-type-badge">${escapeHtml(vector)}</span>
                </div>
                <div class="target-actions">
                    <span class="latency-badge">${elapsed}ms</span>
                    <button class="btn-action-tool" id="btn-export-dossier"><i class="fas fa-download"></i> Export JSON</button>
                </div>
            </div>
        `;

        if (vector === 'username') {
            const found = payload.found || [];
            html += `
                <div class="intel-card-wrapper">
                    <div class="intel-card-header">
                        <span class="intel-card-title"><i class="fas fa-user"></i> Detected Profiles (${found.length})</span>
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
        } else if (vector === 'ip') {
            html += `
                <div class="intel-card-wrapper">
                    <div class="intel-card-header"><span class="intel-card-title"><i class="fas fa-network-wired"></i> IP Telemetry</span></div>
                    <div class="intel-card-body">
                        <div class="stat-metric-grid">
                            <div class="stat-metric-card"><span class="stat-label">City</span><span class="stat-value">${escapeHtml(payload.city || 'N/A')}</span></div>
                            <div class="stat-metric-card"><span class="stat-label">Country</span><span class="stat-value">${escapeHtml(payload.country || 'N/A')}</span></div>
                            <div class="stat-metric-card"><span class="stat-label">ASN</span><span class="stat-value" style="font-size: 0.85rem; color: var(--accent-primary);">${escapeHtml(payload.as || payload.asn || 'N/A')}</span></div>
                            <div class="stat-metric-card"><span class="stat-label">ISP</span><span class="stat-value" style="font-size: 0.85rem;">${escapeHtml(payload.isp || 'N/A')}</span></div>
                        </div>
                        ${payload.lat && payload.lon ? `<div class="map-container-box"><div id="result-leaflet-map"></div></div>` : ''}
                    </div>
                </div>
            `;
        } else {
            html += `
                <div class="intel-card-wrapper">
                    <div class="intel-card-header"><span class="intel-card-title"><i class="fas fa-code"></i> Raw Intel Payload</span></div>
                    <div class="intel-card-body">
                        <pre style="background: var(--bg-surface); padding: 16px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); font-family: var(--font-mono); font-size: 0.8rem; overflow: auto; max-height: 450px;">${escapeHtml(JSON.stringify(payload, null, 2))}</pre>
                    </div>
                </div>
            `;
        }

        resultsContent.innerHTML = html;
        bindActions(target, payload);

        if (vector === 'ip' && payload.lat && payload.lon) {
            setTimeout(() => mountMap(payload.lat, payload.lon, payload.city, payload.country, payload.query || target), 50);
        }
    }

    function bindActions(target, payload) {
        const exportBtn = document.getElementById('btn-export-dossier');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `spectre-${target}-${Date.now()}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast('JSON Export Downloaded', 'success');
            });
        }

        const viewGraphBtn = document.getElementById('btn-view-graph-mode');
        if (viewGraphBtn) {
            viewGraphBtn.addEventListener('click', () => {
                setMode('graph');
            });
        }
    }

    // ==========================================================================
    // MAP & GRAPH ENGINES
    // ==========================================================================
    function mountMap(lat, lon, city, country, ip) {
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

    function buildGraph(target, dossier) {
        const container = document.getElementById('vis-graph-canvas');
        if (!container) return;

        const nodes = [
            { id: 'target', label: target, color: '#6366f1', font: { color: '#ffffff', size: 16, face: 'Inter' }, shape: 'box' }
        ];
        const edges = [];

        if (dossier.ip) {
            nodes.push({ id: 'node_ip', label: `IP: ${dossier.ip.query || target}`, color: '#10b981', font: { color: '#ffffff', size: 12 }, shape: 'ellipse' });
            edges.push({ from: 'target', to: 'node_ip', color: { color: '#10b981' } });
            if (dossier.ip.isp) {
                nodes.push({ id: 'node_isp', label: dossier.ip.isp, color: '#06b6d4', font: { color: '#ffffff', size: 10 }, shape: 'dot', size: 8 });
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
    if (btnGraphReset) btnGraphReset.addEventListener('click', () => buildGraph('SPECTRE', {}));

    // Toast
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
