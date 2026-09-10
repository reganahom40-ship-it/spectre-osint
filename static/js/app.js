/* ==========================================================================
   SPECTRE OSINT ENGINE — INTERACTIVE RECON JAVASCRIPT (V5.8)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // ---- Global State ----
    let currentTab = 'username';
    let visNetwork = null;
    let visNodes = null;
    let visEdges = null;
    let currentMap = null;

    // ---- DOM Elements ----
    const navItems = document.querySelectorAll('.nav-item');
    const tabPanels = document.querySelectorAll('.tab-panel');
    const vectorTitle = document.getElementById('current-vector-title');
    const clockEl = document.getElementById('utc-clock');
    const toastContainer = document.getElementById('toast-container');
    const terminalDrawer = document.getElementById('terminal-drawer');
    const terminalLogs = document.getElementById('terminal-logs');
    const btnToggleTerm = document.getElementById('btn-toggle-terminal');
    const btnClearTerm = document.getElementById('btn-clear-terminal');
    const btnCloseTerm = document.getElementById('btn-close-terminal');
    
    // View Toggles
    const btnViewData = document.getElementById('btn-view-data');
    const btnViewGraph = document.getElementById('btn-view-graph');
    const graphContainer = document.getElementById('graph-visualizer-container');
    const panelsContainer = document.getElementById('panels-container');
    const btnGraphFit = document.getElementById('btn-graph-fit');
    const btnGraphReset = document.getElementById('btn-graph-reset');

    // Command Palette
    const cmdPaletteTrigger = document.getElementById('cmd-palette-trigger');
    const cmdPaletteModal = document.getElementById('cmd-palette-modal');
    const cmdPaletteInput = document.getElementById('cmd-palette-input');
    const cmdResultsList = document.getElementById('cmd-results-list');

    const VECTOR_META = {
        username: { title: 'Username Matrix', icon: 'fa-user-astronaut', color: '#06b6d4', endpoint: '/api/username', param: 'username' },
        dorks:    { title: 'Google Dork Engine', icon: 'fa-brain', color: '#3b82f6', endpoint: '/api/dorks', param: 'target' },
        discord:  { title: 'Discord Snowflake', icon: 'fa-discord', color: '#8b5cf6', endpoint: '/api/discord', param: 'id' },
        ip:       { title: 'IP Telemetry & Geo', icon: 'fa-satellite-dish', color: '#10b981', endpoint: '/api/ip', param: 'ip' },
        bgp:      { title: 'BGP Routing & ASN', icon: 'fa-diagram-project', color: '#f59e0b', endpoint: '/api/bgp', param: 'asn' },
        email:    { title: 'Email & DNS Intel', icon: 'fa-envelope-shield', color: '#ec4899', endpoint: '/api/email', param: 'email' },
        domain:   { title: 'Domain & CT Map', icon: 'fa-globe', color: '#06b6d4', endpoint: '/api/domain', param: 'domain' },
        phone:    { title: 'Phone & Carrier', icon: 'fa-phone-nodes', color: '#14b8a6', endpoint: '/api/phone', param: 'phone' },
        headers:  { title: 'HTTP Security Audit', icon: 'fa-shield-halved', color: '#f43f5e', endpoint: '/api/headers', param: 'url' },
        hash:     { title: 'Hash Classifier', icon: 'fa-fingerprint', color: '#a855f7', endpoint: '/api/hash', param: 'hash' }
    };

    // Initialize Clock
    function initClock() {
        const update = () => {
            if (clockEl) {
                const now = new Date();
                clockEl.textContent = now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
            }
        };
        setInterval(update, 1000);
        update();
    }
    initClock();

    // ---- Logging Utility ----
    function appendLog(text, level = 'info') {
        if (!terminalLogs) return;
        const now = new Date().toISOString().slice(11, 19);
        const div = document.createElement('div');
        div.className = 'log-line';
        div.innerHTML = `<span class="log-ts">[${now}]</span> <span class="log-${level}">${escapeHtml(text)}</span>`;
        terminalLogs.appendChild(div);
        terminalLogs.scrollTop = terminalLogs.scrollHeight;
    }

    // Terminal Toggles
    if (btnToggleTerm) {
        btnToggleTerm.addEventListener('click', () => {
            terminalDrawer.classList.toggle('collapsed');
        });
    }
    if (btnCloseTerm) {
        btnCloseTerm.addEventListener('click', () => {
            terminalDrawer.classList.add('collapsed');
        });
    }
    if (btnClearTerm) {
        btnClearTerm.addEventListener('click', () => {
            terminalLogs.innerHTML = '';
            appendLog('Log buffer cleared.', 'info');
        });
    }

    // ---- Tab Switching ----
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const tab = item.getAttribute('data-tab');
            switchTab(tab);
        });
    });

    function switchTab(tabId) {
        currentTab = tabId;
        navItems.forEach(item => {
            item.classList.toggle('active', item.getAttribute('data-tab') === tabId);
        });
        tabPanels.forEach(panel => {
            panel.classList.toggle('active', panel.id === `panel-${tabId}`);
        });
        if (vectorTitle && VECTOR_META[tabId]) {
            vectorTitle.textContent = VECTOR_META[tabId].title;
        }
        
        // Return to data view if in graph view
        setDataViewActive(true);

        const activeInput = document.getElementById(`input-${tabId}`);
        if (activeInput) activeInput.focus();
        appendLog(`Switched active vector to: [${tabId.toUpperCase()}]`, 'info');
    }

    // ---- View Mode Toggle (Data vs Interactive Graph) ----
    function setDataViewActive(isData) {
        if (isData) {
            btnViewData.classList.add('active');
            btnViewGraph.classList.remove('active');
            graphContainer.style.display = 'none';
            panelsContainer.style.display = 'block';
        } else {
            btnViewGraph.classList.add('active');
            btnViewData.classList.remove('active');
            panelsContainer.style.display = 'none';
            graphContainer.style.display = 'block';
            if (visNetwork) {
                setTimeout(() => visNetwork.fit(), 50);
            }
        }
    }

    if (btnViewData) btnViewData.addEventListener('click', () => setDataViewActive(true));
    if (btnViewGraph) btnViewGraph.addEventListener('click', () => setDataViewActive(false));

    // ---- Input & Scan Triggers ----
    document.querySelectorAll('.target-input').forEach(input => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const panel = input.closest('.tab-panel');
                const btn = panel.querySelector('.btn-launch-scan');
                if (btn) btn.click();
            }
        });
    });

    document.querySelectorAll('.btn-launch-scan').forEach(btn => {
        btn.addEventListener('click', () => {
            const mod = btn.getAttribute('data-module');
            executeRecon(mod, btn);
        });
    });

    // ---- Execution Engine ----
    async function executeRecon(moduleName, triggerBtn) {
        const inputEl = document.getElementById(`input-${moduleName}`);
        const resultsEl = document.getElementById(`results-${moduleName}`);
        if (!inputEl || !resultsEl) return;

        const rawValue = inputEl.value.trim();
        if (!rawValue) {
            showToast('Enter a target value to begin scanning', 'error');
            inputEl.focus();
            return;
        }

        const meta = VECTOR_META[moduleName];
        if (!meta) return;

        setBtnLoading(triggerBtn, true);
        appendLog(`Initiating passive query on [${moduleName.toUpperCase()}]: ${rawValue}`, 'info');

        resultsEl.innerHTML = `
            <div class="loading-stage-box">
                <div class="quantum-spinner"></div>
                <div class="loading-label">Executing Reconnaissance Pipeline...</div>
                <div class="loading-sub">Connecting to live endpoints and aggregating security intelligence.</div>
            </div>
        `;

        const startTime = performance.now();
        const url = `${meta.endpoint}?${encodeURIComponent(meta.param)}=${encodeURIComponent(rawValue)}`;

        try {
            const res = await fetch(url);
            const data = await res.json();
            const elapsed = Math.round(performance.now() - startTime);

            if (!res.ok || data.error) {
                const errText = data.error || 'Endpoint responded with an error.';
                renderError(resultsEl, errText, elapsed);
                appendLog(`[ERROR] ${moduleName}: ${errText}`, 'error');
                showToast(`Scan Failed: ${errText}`, 'error');
            } else {
                const payload = (data && data.data !== undefined) ? data.data : data;
                renderModuleResult(moduleName, payload, resultsEl, elapsed, rawValue);
                buildTopologyGraph(moduleName, rawValue, payload);
                appendLog(`[SUCCESS] ${moduleName} completed in ${elapsed}ms for target: ${rawValue}`, 'success');
                showToast(`Scan Completed in ${elapsed}ms`, 'success');
            }
        } catch (err) {
            const elapsed = Math.round(performance.now() - startTime);
            renderError(resultsEl, `Network timeout or connection error: ${err.message}`, elapsed);
            appendLog(`[EXCEPTION] ${err.message}`, 'error');
            showToast('Network request timed out', 'error');
        } finally {
            setBtnLoading(triggerBtn, false);
        }
    }

    function setBtnLoading(btn, isLoading) {
        if (!btn) return;
        if (isLoading) {
            btn.disabled = true;
            btn.dataset.origHtml = btn.innerHTML;
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i><span>Scanning...</span>`;
        } else {
            btn.disabled = false;
            if (btn.dataset.origHtml) btn.innerHTML = btn.dataset.origHtml;
        }
    }

    function renderError(container, message, elapsed) {
        container.innerHTML = `
            <div class="intel-card" style="border-color: rgba(244,63,94,0.3); background: rgba(244,63,94,0.03);">
                <div class="intel-card-header">
                    <div class="intel-card-title" style="color: var(--accent-rose);">
                        <i class="fas fa-triangle-exclamation"></i>
                        <span>Scan Execution Failed</span>
                    </div>
                    <span class="tag-latency">${elapsed}ms</span>
                </div>
                <div style="font-family: var(--font-mono); font-size: 0.85rem; color: var(--accent-rose);">
                    ${escapeHtml(message)}
                </div>
            </div>
        `;
    }

    // ==========================================================================
    // RESULT RENDERERS
    // ==========================================================================
    function renderModuleResult(moduleName, payload, container, elapsed, target) {
        let html = '';
        switch (moduleName) {
            case 'username': html = renderUsername(payload, elapsed, target); break;
            case 'dorks':    html = renderDorks(payload, elapsed, target); break;
            case 'discord':  html = renderDiscord(payload, elapsed, target); break;
            case 'ip':       html = renderIp(payload, elapsed, target); break;
            case 'bgp':      html = renderBgp(payload, elapsed, target); break;
            case 'email':    html = renderEmail(payload, elapsed, target); break;
            case 'domain':   html = renderDomain(payload, elapsed, target); break;
            case 'phone':    html = renderPhone(payload, elapsed, target); break;
            case 'headers':  html = renderHeaders(payload, elapsed, target); break;
            case 'hash':     html = renderHash(payload, elapsed, target); break;
            default:         html = `<pre style="font-family:var(--font-mono); font-size:0.8rem;">${escapeHtml(JSON.stringify(payload, null, 2))}</pre>`;
        }
        container.innerHTML = html;
        bindInteractions(container, payload, target, moduleName);

        // If IP module, mount interactive Leaflet map
        if (moduleName === 'ip' && payload.lat && payload.lon) {
            setTimeout(() => mountLeafletMap(payload.lat, payload.lon, payload.city, payload.country, payload.ip || target), 50);
        }
    }

    // 1. Username
    function renderUsername(data, elapsed, target) {
        const found = data.found || [];
        const notFound = data.not_found || [];
        const total = data.total_checked || (found.length + notFound.length);
        const rate = total > 0 ? Math.round((found.length / total) * 100) : 0;

        let rows = '';
        found.forEach(item => {
            rows += `
                <tr class="user-row" data-name="${escapeHtml(item.platform.toLowerCase())}">
                    <td><span class="platform-name-tag">${escapeHtml(item.platform)}</span></td>
                    <td>
                        <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="target-url-link">
                            ${escapeHtml(item.url)} <i class="fas fa-arrow-up-right-from-square"></i>
                        </a>
                    </td>
                    <td><span class="badge-tag-status badge-found">CONFIRMED</span></td>
                    <td class="text-right">
                        <button class="btn-card-action copy-action" data-copy="${escapeHtml(item.url)}"><i class="fas fa-copy"></i></button>
                    </td>
                </tr>
            `;
        });

        return `
            <div class="intel-card">
                <div class="intel-card-header">
                    <div class="intel-card-title">
                        <i class="fas fa-user-astronaut"></i>
                        <span>Username Intelligence // @${escapeHtml(target)}</span>
                    </div>
                    <div class="intel-card-actions">
                        <span class="tag-latency">${elapsed}ms</span>
                        <button class="btn-card-action" id="btn-export-json"><i class="fas fa-download"></i> Export</button>
                    </div>
                </div>

                <div class="stat-pill-grid">
                    <div class="stat-pill">
                        <span class="stat-pill-label">Probed Platforms</span>
                        <span class="stat-pill-value">${total}</span>
                    </div>
                    <div class="stat-pill">
                        <span class="stat-pill-label">Detected Profiles</span>
                        <span class="stat-pill-value" style="color: var(--accent-emerald);">${found.length}</span>
                    </div>
                    <div class="stat-pill">
                        <span class="stat-pill-label">Hit Rate</span>
                        <span class="stat-pill-value" style="color: var(--accent-cyan);">${rate}%</span>
                    </div>
                </div>

                <div class="table-scroll">
                    <table class="table-modern">
                        <thead>
                            <tr>
                                <th>Platform</th>
                                <th>Profile URL</th>
                                <th>Detection Status</th>
                                <th class="text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${found.length > 0 ? rows : `<tr><td colspan="4" style="text-align:center; padding:24px; color:var(--text-dim);">No public profiles discovered.</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // 2. Google Dorks
    function renderDorks(data, elapsed, target) {
        const cats = data.categories || {};
        let sections = '';
        for (const [key, val] of Object.entries(cats)) {
            const queries = val.queries || [];
            let qRows = '';
            queries.forEach(q => {
                const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(q.dork)}`;
                qRows += `
                    <div class="dork-item-row">
                        <div style="flex:1; min-width:0;">
                            <div style="font-size:0.8rem; font-weight:600; color:#fff; margin-bottom:4px;">${escapeHtml(q.purpose || q.name || 'Dork')}</div>
                            <div class="dork-query-box">${escapeHtml(q.dork)}</div>
                        </div>
                        <div style="display:flex; gap:6px;">
                            <button class="btn-card-action copy-action" data-copy="${escapeHtml(q.dork)}"><i class="fas fa-copy"></i></button>
                            <a href="${searchUrl}" target="_blank" rel="noopener noreferrer" class="btn-card-action" style="color:var(--accent-cyan);">
                                <i class="fas fa-external-link"></i> Launch
                            </a>
                        </div>
                    </div>
                `;
            });

            sections += `
                <div class="dork-section">
                    <div class="dork-section-header">
                        <span>${escapeHtml(val.title || key.toUpperCase())}</span>
                        <span style="color:var(--accent-cyan); font-family:var(--font-mono); font-size:0.7rem;">${queries.length} QUERIES</span>
                    </div>
                    <div>${qRows}</div>
                </div>
            `;
        }

        return `
            <div class="intel-card">
                <div class="intel-card-header">
                    <div class="intel-card-title">
                        <i class="fas fa-brain"></i>
                        <span>Passive Google Dork Matrix // ${escapeHtml(target)}</span>
                    </div>
                    <div class="intel-card-actions">
                        <span class="tag-latency">${elapsed}ms</span>
                        <button class="btn-card-action" id="btn-export-json"><i class="fas fa-download"></i> Export</button>
                    </div>
                </div>
                ${sections}
            </div>
        `;
    }

    // 3. Discord Snowflake
    function renderDiscord(data, elapsed, target) {
        const user = data.user || data;
        const avatarUrl = data.avatar_url || (user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256` : 'https://cdn.discordapp.com/embed/avatars/0.png');

        return `
            <div class="intel-card">
                <div class="intel-card-header">
                    <div class="intel-card-title">
                        <i class="fa-brands fa-discord"></i>
                        <span>Discord Snowflake Telemetry // ${escapeHtml(target)}</span>
                    </div>
                    <span class="tag-latency">${elapsed}ms</span>
                </div>

                <div class="discord-card-flex">
                    <div class="discord-avatar-panel">
                        <img src="${escapeHtml(avatarUrl)}" alt="Avatar" class="discord-avatar-img">
                        <div class="discord-name-tag">${escapeHtml(data.username || user.username || 'Snowflake Target')}</div>
                        <div style="font-family:var(--font-mono); font-size:0.7rem; color:var(--text-dim);">${escapeHtml(target)}</div>
                    </div>

                    <div style="flex:1;">
                        <div class="prop-grid-container">
                            <div class="prop-box">
                                <span class="prop-box-key">Created Timestamp</span>
                                <span class="prop-box-val" style="color:var(--accent-cyan);">${escapeHtml(data.created_at || data.created_at_utc || 'N/A')}</span>
                            </div>
                            <div class="prop-box">
                                <span class="prop-box-key">Account Age</span>
                                <span class="prop-box-val" style="color:var(--accent-emerald);">${escapeHtml(String(data.account_age_days ? data.account_age_days + ' days' : (data.account_age || 'N/A')))}</span>
                            </div>
                            <div class="prop-box">
                                <span class="prop-box-key">Worker Thread ID</span>
                                <span class="prop-box-val"><code>${escapeHtml(String(data.snowflake_metadata?.worker_id ?? data.worker_id ?? '0'))}</code></span>
                            </div>
                            <div class="prop-box">
                                <span class="prop-box-key">Process Thread ID</span>
                                <span class="prop-box-val"><code>${escapeHtml(String(data.snowflake_metadata?.process_id ?? data.process_id ?? '0'))}</code></span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // 4. IP Intelligence & Live Dark Map
    function renderIp(data, elapsed, target) {
        const asn = data.asn || data.as || '';
        const asnClean = asn.split(' ')[0];

        return `
            <div class="intel-card">
                <div class="intel-card-header">
                    <div class="intel-card-title">
                        <i class="fas fa-satellite-dish"></i>
                        <span>IP Intelligence & Dark Telemetry // ${escapeHtml(data.query || data.ip || target)}</span>
                    </div>
                    <div class="intel-card-actions">
                        <span class="tag-latency">${elapsed}ms</span>
                        <button class="btn-card-action" id="btn-export-json"><i class="fas fa-download"></i> Export</button>
                    </div>
                </div>

                <!-- Multi-Vector Pivot Option -->
                ${asnClean ? `
                    <div class="pivot-box">
                        <span class="pivot-title"><i class="fas fa-bolt"></i> Quick Pivot:</span>
                        <button class="pivot-link-btn" data-pivot-mod="bgp" data-pivot-val="${escapeHtml(asnClean)}">
                            Inspect BGP Routing for ${escapeHtml(asnClean)} <i class="fas fa-arrow-right"></i>
                        </button>
                    </div>
                ` : ''}

                <!-- Leaflet Interactive Map -->
                ${data.lat && data.lon ? `
                    <div class="map-embed-wrapper">
                        <div id="leaflet-ip-map"></div>
                    </div>
                ` : ''}

                <div class="stat-pill-grid">
                    <div class="stat-pill">
                        <span class="stat-pill-label">Country / Region</span>
                        <span class="stat-pill-value">${escapeHtml(data.country || 'N/A')} (${escapeHtml(data.countryCode || '--')})</span>
                    </div>
                    <div class="stat-pill">
                        <span class="stat-pill-label">City</span>
                        <span class="stat-pill-value" style="color:var(--accent-cyan);">${escapeHtml(data.city || 'N/A')}</span>
                    </div>
                    <div class="stat-pill">
                        <span class="stat-pill-label">Classification</span>
                        <span class="stat-pill-value" style="color:${data.hosting || data.proxy ? 'var(--accent-amber)' : 'var(--accent-emerald)'};">
                            ${data.hosting ? 'DATACENTER' : (data.proxy ? 'PROXY / VPN' : 'RESIDENTIAL')}
                        </span>
                    </div>
                    <div class="stat-pill">
                        <span class="stat-pill-label">Autonomous System</span>
                        <span class="stat-pill-value" style="font-size:0.95rem; color:var(--accent-purple);">${escapeHtml(asn || 'N/A')}</span>
                    </div>
                </div>

                <div class="prop-grid-container">
                    <div class="prop-box">
                        <span class="prop-box-key">ISP / Provider</span>
                        <span class="prop-box-val">${escapeHtml(data.isp || 'N/A')}</span>
                    </div>
                    <div class="prop-box">
                        <span class="prop-box-key">Organization</span>
                        <span class="prop-box-val">${escapeHtml(data.org || 'N/A')}</span>
                    </div>
                    <div class="prop-box">
                        <span class="prop-box-key">Reverse PTR DNS</span>
                        <span class="prop-box-val"><code>${escapeHtml(data.reverse || data.reverse_dns || 'None')}</code></span>
                    </div>
                    <div class="prop-box">
                        <span class="prop-box-key">Timezone</span>
                        <span class="prop-box-val">${escapeHtml(data.timezone || 'N/A')}</span>
                    </div>
                </div>
            </div>
        `;
    }

    // 5. BGP Routing
    function renderBgp(data, elapsed, target) {
        const prefixes = data.announced_prefixes || data.prefixes || [];
        let rows = '';
        prefixes.slice(0, 100).forEach(p => {
            const cidr = typeof p === 'string' ? p : (p.prefix || JSON.stringify(p));
            rows += `
                <tr>
                    <td><code style="color:var(--accent-cyan);">${escapeHtml(cidr)}</code></td>
                    <td><span class="badge-tag-status badge-found">ANNOUNCED</span></td>
                    <td class="text-right">
                        <button class="btn-card-action copy-action" data-copy="${escapeHtml(cidr)}"><i class="fas fa-copy"></i></button>
                    </td>
                </tr>
            `;
        });

        return `
            <div class="intel-card">
                <div class="intel-card-header">
                    <div class="intel-card-title">
                        <i class="fas fa-diagram-project"></i>
                        <span>BGP Routing & Peering // ${escapeHtml(data.asn || target)}</span>
                    </div>
                    <div class="intel-card-actions">
                        <span class="tag-latency">${elapsed}ms</span>
                        <button class="btn-card-action" id="btn-export-json"><i class="fas fa-download"></i> Export</button>
                    </div>
                </div>

                <div class="stat-pill-grid">
                    <div class="stat-pill">
                        <span class="stat-pill-label">Holder Entity</span>
                        <span class="stat-pill-value" style="font-size:1rem;">${escapeHtml(data.holder || data.name || 'N/A')}</span>
                    </div>
                    <div class="stat-pill">
                        <span class="stat-pill-label">Announced CIDRs</span>
                        <span class="stat-pill-value" style="color:var(--accent-cyan);">${prefixes.length}</span>
                    </div>
                </div>

                <div class="table-scroll">
                    <table class="table-modern">
                        <thead>
                            <tr>
                                <th>Prefix Block</th>
                                <th>Status</th>
                                <th class="text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody>${rows || `<tr><td colspan="3" style="text-align:center; padding:20px; color:var(--text-dim);">No announced prefixes.</td></tr>`}</tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // 6. Email Intel
    function renderEmail(data, elapsed, target) {
        const mx = data.mx_records || [];
        const domain = target.includes('@') ? target.split('@')[1] : target;
        let mxRows = '';
        mx.forEach(m => {
            mxRows += `
                <tr>
                    <td><span style="color:var(--accent-cyan); font-family:var(--font-mono); font-weight:700;">${escapeHtml(String(m.priority || 0))}</span></td>
                    <td><code>${escapeHtml(m.host || m.exchange || String(m))}</code></td>
                </tr>
            `;
        });

        return `
            <div class="intel-card">
                <div class="intel-card-header">
                    <div class="intel-card-title">
                        <i class="fas fa-envelope-shield"></i>
                        <span>Email & DNS Security Intelligence // ${escapeHtml(target)}</span>
                    </div>
                    <div class="intel-card-actions">
                        <span class="tag-latency">${elapsed}ms</span>
                        <button class="btn-card-action" id="btn-export-json"><i class="fas fa-download"></i> Export</button>
                    </div>
                </div>

                ${domain ? `
                    <div class="pivot-box">
                        <span class="pivot-title"><i class="fas fa-bolt"></i> Quick Pivot:</span>
                        <button class="pivot-link-btn" data-pivot-mod="domain" data-pivot-val="${escapeHtml(domain)}">
                            Inspect Domain WHOIS & CT for ${escapeHtml(domain)} <i class="fas fa-arrow-right"></i>
                        </button>
                    </div>
                ` : ''}

                <div class="stat-pill-grid">
                    <div class="stat-pill">
                        <span class="stat-pill-label">Mail Provider</span>
                        <span class="stat-pill-value" style="font-size:1rem; color:var(--accent-cyan);">${escapeHtml(data.provider || 'Self-Hosted')}</span>
                    </div>
                    <div class="stat-pill">
                        <span class="stat-pill-label">SPF Policy</span>
                        <span class="stat-pill-value" style="color:${data.has_spf ? 'var(--accent-emerald)' : 'var(--accent-rose)'};">
                            ${data.has_spf ? 'CONFIGURED' : 'MISSING'}
                        </span>
                    </div>
                    <div class="stat-pill">
                        <span class="stat-pill-label">DMARC Policy</span>
                        <span class="stat-pill-value" style="color:${data.has_dmarc ? 'var(--accent-emerald)' : 'var(--accent-rose)'};">
                            ${data.has_dmarc ? 'CONFIGURED' : 'MISSING'}
                        </span>
                    </div>
                </div>

                <div class="table-scroll">
                    <table class="table-modern">
                        <thead><tr><th style="width:90px;">Priority</th><th>MX Server Hostname</th></tr></thead>
                        <tbody>${mxRows || `<tr><td colspan="2" style="text-align:center; padding:16px;">No MX records resolved.</td></tr>`}</tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // 7. Domain Intel
    function renderDomain(data, elapsed, target) {
        const subs = data.subdomains || [];
        let subRows = '';
        subs.slice(0, 100).forEach(s => {
            subRows += `
                <tr>
                    <td><code style="color:var(--accent-cyan);">${escapeHtml(s)}</code></td>
                    <td><span class="badge-tag-status badge-found">CT LOG</span></td>
                    <td class="text-right">
                        <button class="pivot-link-btn" data-pivot-mod="headers" data-pivot-val="https://${escapeHtml(s)}">
                            Audit Headers <i class="fas fa-arrow-right"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        return `
            <div class="intel-card">
                <div class="intel-card-header">
                    <div class="intel-card-title">
                        <i class="fas fa-globe"></i>
                        <span>Domain Infrastructure & Subdomain Map // ${escapeHtml(target)}</span>
                    </div>
                    <div class="intel-card-actions">
                        <span class="tag-latency">${elapsed}ms</span>
                        <button class="btn-card-action" id="btn-export-json"><i class="fas fa-download"></i> Export</button>
                    </div>
                </div>

                <div class="stat-pill-grid">
                    <div class="stat-pill">
                        <span class="stat-pill-label">Registrar</span>
                        <span class="stat-pill-value" style="font-size:0.95rem;">${escapeHtml(data.registrar || data.whois?.registrar || 'N/A')}</span>
                    </div>
                    <div class="stat-pill">
                        <span class="stat-pill-label">Discovered Subdomains</span>
                        <span class="stat-pill-value" style="color:var(--accent-cyan);">${subs.length}</span>
                    </div>
                </div>

                <div class="table-scroll">
                    <table class="table-modern">
                        <thead><tr><th>Subdomain Endpoint</th><th>Source</th><th class="text-right">Action</th></tr></thead>
                        <tbody>${subRows || `<tr><td colspan="3" style="text-align:center; padding:16px;">No subdomains logged.</td></tr>`}</tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // 8. Phone Intel
    function renderPhone(data, elapsed, target) {
        return `
            <div class="intel-card">
                <div class="intel-card-header">
                    <div class="intel-card-title">
                        <i class="fas fa-phone-nodes"></i>
                        <span>Phone / Telco Identification // ${escapeHtml(target)}</span>
                    </div>
                    <span class="tag-latency">${elapsed}ms</span>
                </div>

                <div class="stat-pill-grid">
                    <div class="stat-pill">
                        <span class="stat-pill-label">Validation</span>
                        <span class="stat-pill-value" style="color:${data.is_valid ? 'var(--accent-emerald)' : 'var(--accent-rose)'};">
                            ${data.is_valid ? 'VALID E.164' : 'INVALID'}
                        </span>
                    </div>
                    <div class="stat-pill">
                        <span class="stat-pill-label">Line Classification</span>
                        <span class="stat-pill-value" style="color:var(--accent-cyan);">${escapeHtml(data.line_type || 'Unknown')}</span>
                    </div>
                    <div class="stat-pill">
                        <span class="stat-pill-label">Carrier Network</span>
                        <span class="stat-pill-value" style="font-size:0.95rem;">${escapeHtml(data.carrier || 'N/A')}</span>
                    </div>
                </div>
            </div>
        `;
    }

    // 9. HTTP Security Headers
    function renderHeaders(data, elapsed, target) {
        const h = data.headers || {};
        let hRows = '';
        for (const [k, v] of Object.entries(h)) {
            hRows += `<tr><td><code>${escapeHtml(k)}</code></td><td style="font-family:var(--font-mono); font-size:0.75rem;">${escapeHtml(String(v))}</td></tr>`;
        }

        return `
            <div class="intel-card">
                <div class="intel-card-header">
                    <div class="intel-card-title">
                        <i class="fas fa-shield-halved"></i>
                        <span>HTTP Security Headers Audit // ${escapeHtml(target)}</span>
                    </div>
                    <span class="tag-latency">${elapsed}ms</span>
                </div>

                <div class="stat-pill-grid">
                    <div class="stat-pill">
                        <span class="stat-pill-label">HSTS</span>
                        <span class="stat-pill-value" style="color:${data.has_hsts ? 'var(--accent-emerald)' : 'var(--accent-rose)'};">${data.has_hsts ? 'PRESENT' : 'MISSING'}</span>
                    </div>
                    <div class="stat-pill">
                        <span class="stat-pill-label">Content-Security-Policy</span>
                        <span class="stat-pill-value" style="color:${data.has_csp ? 'var(--accent-emerald)' : 'var(--accent-rose)'};">${data.has_csp ? 'PRESENT' : 'MISSING'}</span>
                    </div>
                    <div class="stat-pill">
                        <span class="stat-pill-label">X-Frame-Options</span>
                        <span class="stat-pill-value" style="color:${data.has_x_frame ? 'var(--accent-emerald)' : 'var(--accent-rose)'};">${data.has_x_frame ? 'PROTECTED' : 'MISSING'}</span>
                    </div>
                </div>

                <div class="table-scroll">
                    <table class="table-modern">
                        <thead><tr><th style="width:240px;">Header</th><th>Value</th></tr></thead>
                        <tbody>${hRows}</tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // 10. Hash Classifier
    function renderHash(data, elapsed, target) {
        const matches = data.possible_types || data.matches || [];
        return `
            <div class="intel-card">
                <div class="intel-card-header">
                    <div class="intel-card-title">
                        <i class="fas fa-fingerprint"></i>
                        <span>Cryptographic Hash Identification</span>
                    </div>
                    <span class="tag-latency">${elapsed}ms</span>
                </div>

                <div class="stat-pill-grid">
                    <div class="stat-pill">
                        <span class="stat-pill-label">Length</span>
                        <span class="stat-pill-value">${escapeHtml(String(data.length || target.length))} chars</span>
                    </div>
                    <div class="stat-pill">
                        <span class="stat-pill-label">Shannon Entropy</span>
                        <span class="stat-pill-value" style="color:var(--accent-cyan);">${escapeHtml(String(data.entropy || 'N/A'))}</span>
                    </div>
                    <div class="stat-pill">
                        <span class="stat-pill-label">Primary Candidate</span>
                        <span class="stat-pill-value" style="color:var(--accent-emerald); font-size:1.05rem;">${escapeHtml(matches[0] || 'Unknown')}</span>
                    </div>
                </div>
            </div>
        `;
    }

    // ==========================================================================
    // INTERACTIVE MAP (LEAFLET.JS)
    // ==========================================================================
    function mountLeafletMap(lat, lon, city, country, ip) {
        const mapContainer = document.getElementById('leaflet-ip-map');
        if (!mapContainer) return;

        if (currentMap) {
            currentMap.remove();
            currentMap = null;
        }

        currentMap = L.map('leaflet-ip-map', {
            zoomControl: false,
            attributionControl: false
        }).setView([lat, lon], 10);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19
        }).addTo(currentMap);

        const customIcon = L.divIcon({
            className: 'custom-map-pin',
            html: `<div style="width:14px; height:14px; background:#06b6d4; border-radius:50%; box-shadow:0 0 15px #06b6d4, 0 0 30px #06b6d4;"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7]
        });

        const marker = L.marker([lat, lon], { icon: customIcon }).addTo(currentMap);
        marker.bindPopup(`<b>${escapeHtml(ip)}</b><br>${escapeHtml(city || '')}, ${escapeHtml(country || '')}`).openPopup();
    }

    // ==========================================================================
    // INTERACTIVE NODE GRAPH TOPOLOGY (VIS.JS)
    // ==========================================================================
    function buildTopologyGraph(moduleName, target, data) {
        const container = document.getElementById('vis-network-canvas');
        if (!container) return;

        const nodes = [
            { id: 'target', label: target, color: '#06b6d4', font: { color: '#ffffff', size: 16, face: 'Plus Jakarta Sans' }, shape: 'box' }
        ];
        const edges = [];

        if (moduleName === 'username') {
            const found = (data.found || []).slice(0, 25);
            found.forEach((item, idx) => {
                const nodeId = `social_${idx}`;
                nodes.push({ id: nodeId, label: item.platform, color: '#10b981', font: { color: '#ffffff', size: 12 }, shape: 'dot', size: 12 });
                edges.push({ from: 'target', to: nodeId, color: { color: '#10b981', opacity: 0.6 } });
            });
        } else if (moduleName === 'ip') {
            if (data.country) {
                nodes.push({ id: 'geo', label: `${data.city || ''}, ${data.country}`, color: '#f59e0b', font: { color: '#ffffff', size: 12 }, shape: 'ellipse' });
                edges.push({ from: 'target', to: 'geo', color: { color: '#f59e0b', opacity: 0.6 } });
            }
            if (data.asn || data.as) {
                nodes.push({ id: 'asn', label: data.asn || data.as, color: '#8b5cf6', font: { color: '#ffffff', size: 12 }, shape: 'box' });
                edges.push({ from: 'target', to: 'asn', color: { color: '#8b5cf6', opacity: 0.6 } });
            }
            if (data.isp) {
                nodes.push({ id: 'isp', label: `ISP: ${data.isp}`, color: '#3b82f6', font: { color: '#ffffff', size: 12 }, shape: 'dot', size: 10 });
                edges.push({ from: 'target', to: 'isp', color: { color: '#3b82f6', opacity: 0.6 } });
            }
        } else if (moduleName === 'domain') {
            const subs = (data.subdomains || []).slice(0, 20);
            subs.forEach((sub, idx) => {
                const nodeId = `sub_${idx}`;
                nodes.push({ id: nodeId, label: sub, color: '#06b6d4', font: { color: '#ffffff', size: 11 }, shape: 'dot', size: 8 });
                edges.push({ from: 'target', to: nodeId, color: { color: '#06b6d4', opacity: 0.5 } });
            });
        }

        visNodes = new vis.DataSet(nodes);
        visEdges = new vis.DataSet(edges);

        const options = {
            nodes: { borderWidth: 1, shadow: true },
            edges: { width: 1.5, smooth: { type: 'continuous' } },
            physics: {
                solver: 'forceAtlas2Based',
                forceAtlas2Based: { gravitationalConstant: -35, centralGravity: 0.01, springLength: 90, springConstant: 0.08 }
            },
            interaction: { hover: true, tooltipDelay: 100 }
        };

        visNetwork = new vis.Network(container, { nodes: visNodes, edges: visEdges }, options);
    }

    if (btnGraphFit) btnGraphFit.addEventListener('click', () => visNetwork && visNetwork.fit());
    if (btnGraphReset) btnGraphReset.addEventListener('click', () => visNetwork && visNetwork.setData({ nodes: visNodes, edges: visEdges }));

    // ==========================================================================
    // ACTION BINDINGS (PIVOTS, COPY, EXPORTS)
    // ==========================================================================
    function bindInteractions(container, data, target, moduleName) {
        // Quick Pivots
        container.querySelectorAll('.pivot-link-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const pivotMod = btn.getAttribute('data-pivot-mod');
                const pivotVal = btn.getAttribute('data-pivot-val');
                if (pivotMod && pivotVal) {
                    switchTab(pivotMod);
                    const targetInput = document.getElementById(`input-${pivotMod}`);
                    if (targetInput) {
                        targetInput.value = pivotVal;
                        const panel = document.getElementById(`panel-${pivotMod}`);
                        const scanBtn = panel?.querySelector('.btn-launch-scan');
                        if (scanBtn) scanBtn.click();
                    }
                }
            });
        });

        // Copy buttons
        container.querySelectorAll('.copy-action').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const val = btn.getAttribute('data-copy');
                if (val) {
                    navigator.clipboard.writeText(val).then(() => showToast('Copied to clipboard', 'info'));
                }
            });
        });

        // Export JSON
        const exportBtn = container.querySelector('#btn-export-json');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `spectre-${moduleName}-${target}-${Date.now()}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast('Intelligence JSON Exported', 'success');
            });
        }
    }

    // ==========================================================================
    // GLOBAL COMMAND PALETTE (CMD+K / CTRL+K)
    // ==========================================================================
    function openCmdPalette() {
        if (!cmdPaletteModal) return;
        cmdPaletteModal.style.display = 'flex';
        cmdPaletteInput.value = '';
        cmdPaletteInput.focus();
        filterCmdItems('');
    }

    function closeCmdPalette() {
        if (!cmdPaletteModal) return;
        cmdPaletteModal.style.display = 'none';
    }

    if (cmdPaletteTrigger) cmdPaletteTrigger.addEventListener('click', openCmdPalette);
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            if (cmdPaletteModal.style.display === 'none' || !cmdPaletteModal.style.display) {
                openCmdPalette();
            } else {
                closeCmdPalette();
            }
        } else if (e.key === 'Escape') {
            closeCmdPalette();
        }
    });

    if (cmdPaletteModal) {
        cmdPaletteModal.querySelector('.cmd-palette-backdrop').addEventListener('click', closeCmdPalette);
    }

    if (cmdPaletteInput) {
        cmdPaletteInput.addEventListener('input', (e) => {
            filterCmdItems(e.target.value.toLowerCase().trim());
        });
    }

    function filterCmdItems(q) {
        const items = cmdResultsList.querySelectorAll('.cmd-item');
        items.forEach(item => {
            const text = item.textContent.toLowerCase();
            item.style.display = text.includes(q) ? 'flex' : 'none';
        });
    }

    if (cmdResultsList) {
        cmdResultsList.querySelectorAll('.cmd-item').forEach(item => {
            item.addEventListener('click', () => {
                const targetMod = item.getAttribute('data-target');
                if (targetMod) {
                    switchTab(targetMod);
                    closeCmdPalette();
                }
            });
        });
    }

    // ==========================================================================
    // TOAST NOTIFICATIONS
    // ==========================================================================
    function showToast(message, type = 'info') {
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
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
        }, 3000);
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
