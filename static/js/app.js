/* =========================================================
   SPECTRE — LINEAR / VERCEL MODERN RECON ENGINE JS (V5.5)
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {
    // ---- Navigation & Active State ----
    const navLinks = document.querySelectorAll('.nav-link');
    const tabPanels = document.querySelectorAll('.tab-panel');
    const vectorTitle = document.getElementById('current-vector-title');
    const clockEl = document.getElementById('utc-clock');
    const toastContainer = document.getElementById('toast-container');

    const VECTOR_NAMES = {
        username: 'Username Reconnaissance',
        dorks: 'Google Dork Engine',
        discord: 'Discord Snowflake Intelligence',
        ip: 'IP Intelligence & Routing',
        bgp: 'BGP Routing & Peering',
        email: 'Email & Mail Server Analysis',
        domain: 'Domain WHOIS & Subdomains',
        phone: 'Phone & Carrier Intelligence',
        headers: 'HTTP Security Headers Audit',
        hash: 'Cryptographic Hash Identifier'
    };

    const API_ROUTES = {
        username: { endpoint: '/api/username', param: 'username' },
        dorks:    { endpoint: '/api/dorks',    param: 'target' },
        discord:  { endpoint: '/api/discord',  param: 'id' },
        ip:       { endpoint: '/api/ip',       param: 'ip' },
        bgp:      { endpoint: '/api/bgp',      param: 'asn' },
        email:    { endpoint: '/api/email',    param: 'email' },
        domain:   { endpoint: '/api/domain',   param: 'domain' },
        phone:    { endpoint: '/api/phone',    param: 'phone' },
        headers:  { endpoint: '/api/headers',  param: 'url' },
        hash:     { endpoint: '/api/hash',     param: 'hash' }
    };

    // Initialize UTC Clock
    function updateClock() {
        if (!clockEl) return;
        const now = new Date();
        clockEl.textContent = now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    }
    setInterval(updateClock, 1000);
    updateClock();

    // Tab Navigation
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            const tabId = link.getAttribute('data-tab');
            switchTab(tabId);
        });
    });

    function switchTab(tabId) {
        navLinks.forEach(l => {
            if (l.getAttribute('data-tab') === tabId) {
                l.classList.add('active');
            } else {
                l.classList.remove('active');
            }
        });

        tabPanels.forEach(panel => {
            if (panel.id === `panel-${tabId}`) {
                panel.classList.add('active');
            } else {
                panel.classList.remove('active');
            }
        });

        if (vectorTitle && VECTOR_NAMES[tabId]) {
            vectorTitle.textContent = VECTOR_NAMES[tabId];
        }

        // Focus input of active panel
        const activeInput = document.getElementById(`input-${tabId}`);
        if (activeInput) activeInput.focus();
    }

    // Enter Key Trigger
    document.querySelectorAll('.action-input').forEach(input => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const panel = input.closest('.tab-panel');
                const btn = panel.querySelector('.btn-primary');
                if (btn) btn.click();
            }
        });
    });

    // Button Click Handlers
    document.querySelectorAll('.btn-primary').forEach(btn => {
        btn.addEventListener('click', () => {
            const moduleName = btn.getAttribute('data-module');
            executeModule(moduleName, btn);
        });
    });

    // ---- Execution Engine ----
    async function executeModule(moduleName, triggerBtn) {
        const inputEl = document.getElementById(`input-${moduleName}`);
        const resultsEl = document.getElementById(`results-${moduleName}`);
        if (!inputEl || !resultsEl) return;

        const rawValue = inputEl.value.trim();
        if (!rawValue) {
            showToast('Input required for query execution', 'error');
            inputEl.focus();
            return;
        }

        const route = API_ROUTES[moduleName];
        if (!route) return;

        // UI Loading State
        setLoading(triggerBtn, true);
        resultsEl.innerHTML = `
            <div class="result-card loading-card">
                <div class="spinner-linear"></div>
                <div class="loading-text">
                    <strong>Executing passive reconnaissance query...</strong>
                    <span>Aggregating endpoints, querying live zone data, parsing response feeds.</span>
                </div>
            </div>
        `;

        const startTime = performance.now();
        const url = `${route.endpoint}?${encodeURIComponent(route.param)}=${encodeURIComponent(rawValue)}`;

        try {
            const response = await fetch(url);
            const data = await response.json();
            const elapsed = Math.round(performance.now() - startTime);

            if (!response.ok || data.error) {
                renderError(resultsEl, data.error || 'Server responded with an anomalous error code.', elapsed);
                showToast(`Query failed: ${data.error || 'Unknown error'}`, 'error');
            } else {
                renderResults(moduleName, data, resultsEl, elapsed, rawValue);
                showToast(`Scan complete (${elapsed}ms)`, 'success');
            }
        } catch (err) {
            const elapsed = Math.round(performance.now() - startTime);
            renderError(resultsEl, `Network or timeout exception: ${err.message}`, elapsed);
            showToast('Connection failed or timed out', 'error');
        } finally {
            setLoading(triggerBtn, false);
        }
    }

    function setLoading(btn, isLoading) {
        if (!btn) return;
        if (isLoading) {
            btn.disabled = true;
            btn.classList.add('loading');
            btn.dataset.originalText = btn.innerHTML;
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i><span>Scanning...</span>`;
        } else {
            btn.disabled = false;
            btn.classList.remove('loading');
            if (btn.dataset.originalText) {
                btn.innerHTML = btn.dataset.originalText;
            }
        }
    }

    function renderError(container, message, elapsed) {
        container.innerHTML = `
            <div class="result-card error-card">
                <div class="card-header">
                    <div class="card-title text-red">
                        <i class="fas fa-circle-exclamation"></i>
                        <span>Reconnaissance Query Failed</span>
                    </div>
                    <span class="latency-tag">${elapsed}ms</span>
                </div>
                <div class="card-body">
                    <p class="error-msg">${escapeHtml(message)}</p>
                </div>
            </div>
        `;
    }

    // ---- Render Dispatcher ----
    function renderResults(moduleName, data, container, elapsed, target) {
        let html = '';
        switch (moduleName) {
            case 'username':
                html = renderUsernameModule(data, elapsed, target);
                break;
            case 'dorks':
                html = renderDorksModule(data, elapsed, target);
                break;
            case 'discord':
                html = renderDiscordModule(data, elapsed, target);
                break;
            case 'ip':
                html = renderIpModule(data, elapsed, target);
                break;
            case 'bgp':
                html = renderBgpModule(data, elapsed, target);
                break;
            case 'email':
                html = renderEmailModule(data, elapsed, target);
                break;
            case 'domain':
                html = renderDomainModule(data, elapsed, target);
                break;
            case 'phone':
                html = renderPhoneModule(data, elapsed, target);
                break;
            case 'headers':
                html = renderHeadersModule(data, elapsed, target);
                break;
            case 'hash':
                html = renderHashModule(data, elapsed, target);
                break;
            default:
                html = `<pre class="code-block">${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
        }

        container.innerHTML = html;
        bindResultActions(container, data, target, moduleName);
    }

    // =========================================================
    // 1. USERNAME MODULE
    // =========================================================
    function renderUsernameModule(data, elapsed, target) {
        const found = data.found || [];
        const notFound = data.not_found || [];
        const total = data.total_checked || (found.length + notFound.length);
        const rate = total > 0 ? Math.round((found.length / total) * 100) : 0;

        let rowsHtml = '';
        found.forEach(item => {
            rowsHtml += `
                <tr class="row-found" data-name="${escapeHtml(item.platform.toLowerCase())}">
                    <td>
                        <span class="platform-badge">${escapeHtml(item.platform)}</span>
                    </td>
                    <td>
                        <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="link-target">
                            ${escapeHtml(item.url)} <i class="fas fa-arrow-up-right-from-square"></i>
                        </a>
                    </td>
                    <td><span class="badge-status status-active">FOUND</span></td>
                    <td class="text-right">
                        <button class="btn-sm-action copy-btn" data-copy="${escapeHtml(item.url)}" title="Copy URL">
                            <i class="fas fa-copy"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        return `
            <div class="result-card">
                <div class="card-header">
                    <div class="card-title">
                        <i class="fas fa-user-check"></i>
                        <span>Username Reconnaissance — @${escapeHtml(target)}</span>
                    </div>
                    <div class="header-actions">
                        <span class="latency-tag">${elapsed}ms</span>
                        <button class="btn-export" id="btn-export-json"><i class="fas fa-download"></i> Export JSON</button>
                    </div>
                </div>

                <div class="metrics-grid">
                    <div class="metric-box">
                        <span class="metric-label">Platforms Scanned</span>
                        <span class="metric-value">${total}</span>
                    </div>
                    <div class="metric-box">
                        <span class="metric-label">Confirmed Profiles</span>
                        <span class="metric-value text-green">${found.length}</span>
                    </div>
                    <div class="metric-box">
                        <span class="metric-label">Unregistered</span>
                        <span class="metric-value text-muted">${notFound.length}</span>
                    </div>
                    <div class="metric-box">
                        <span class="metric-label">Hit Rate</span>
                        <span class="metric-value">${rate}%</span>
                    </div>
                </div>

                <div class="table-filter-bar">
                    <div class="input-filter-wrapper">
                        <i class="fas fa-filter"></i>
                        <input type="text" id="username-filter-input" placeholder="Filter detected platforms..." autocomplete="off">
                    </div>
                    <span class="table-counter" id="username-filter-count">Showing ${found.length} profiles</span>
                </div>

                <div class="table-responsive">
                    <table class="data-table" id="username-table">
                        <thead>
                            <tr>
                                <th>Platform</th>
                                <th>Profile Endpoint</th>
                                <th>Status</th>
                                <th class="text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${found.length > 0 ? rowsHtml : `<tr><td colspan="4" class="text-center text-muted">No public profiles detected across the 112 probing platforms.</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // =========================================================
    // 2. GOOGLE DORKS MODULE
    // =========================================================
    function renderDorksModule(data, elapsed, target) {
        const categories = data.categories || {};
        let catSections = '';

        for (const [catKey, catData] of Object.entries(categories)) {
            const queries = catData.queries || [];
            let itemsHtml = '';
            queries.forEach(q => {
                const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(q.dork)}`;
                itemsHtml += `
                    <div class="dork-row">
                        <div class="dork-meta">
                            <span class="dork-purpose">${escapeHtml(q.purpose || q.name || 'Security Query')}</span>
                            <code class="dork-query">${escapeHtml(q.dork)}</code>
                        </div>
                        <div class="dork-actions">
                            <button class="btn-sm-action copy-btn" data-copy="${escapeHtml(q.dork)}" title="Copy Dork">
                                <i class="fas fa-copy"></i>
                            </button>
                            <a href="${searchUrl}" target="_blank" rel="noopener noreferrer" class="btn-sm-action btn-link" title="Open Google Search">
                                <i class="fas fa-external-link"></i> Launch
                            </a>
                        </div>
                    </div>
                `;
            });

            catSections += `
                <div class="dork-category-block">
                    <div class="category-header">
                        <span class="category-title">${escapeHtml(catData.title || catKey.toUpperCase())}</span>
                        <span class="category-badge">${queries.length} queries</span>
                    </div>
                    <div class="dork-list">
                        ${itemsHtml}
                    </div>
                </div>
            `;
        }

        return `
            <div class="result-card">
                <div class="card-header">
                    <div class="card-title">
                        <i class="fas fa-search-nodes"></i>
                        <span>Passive Google Dorks — ${escapeHtml(target)}</span>
                    </div>
                    <div class="header-actions">
                        <span class="latency-tag">${elapsed}ms</span>
                        <button class="btn-export" id="btn-export-json"><i class="fas fa-download"></i> Export JSON</button>
                    </div>
                </div>

                <div class="dork-matrix">
                    ${catSections}
                </div>
            </div>
        `;
    }

    // =========================================================
    // 3. DISCORD MODULE
    // =========================================================
    function renderDiscordModule(data, elapsed, target) {
        const user = data.user || data;
        const avatarUrl = data.avatar_url || (user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256` : null);

        return `
            <div class="result-card">
                <div class="card-header">
                    <div class="card-title">
                        <i class="fa-brands fa-discord"></i>
                        <span>Discord Snowflake Telemetry</span>
                    </div>
                    <span class="latency-tag">${elapsed}ms</span>
                </div>

                <div class="discord-profile-layout">
                    <div class="discord-avatar-col">
                        ${avatarUrl ? `
                            <img src="${escapeHtml(avatarUrl)}" alt="Avatar" class="discord-avatar" onerror="this.src='/static/img/default-avatar.png'">
                        ` : `
                            <div class="discord-avatar-placeholder"><i class="fa-brands fa-discord"></i></div>
                        `}
                        <div class="discord-tag">${escapeHtml(user.username || 'Snowflake Target')}</div>
                        <div class="discord-id">ID: ${escapeHtml(target)}</div>
                    </div>

                    <div class="discord-details-col">
                        <div class="property-grid">
                            <div class="property-item">
                                <span class="prop-key">Account Created (UTC)</span>
                                <span class="prop-val">${escapeHtml(data.created_at_utc || data.timestamp || 'N/A')}</span>
                            </div>
                            <div class="property-item">
                                <span class="prop-key">Account Age</span>
                                <span class="prop-val text-green">${escapeHtml(data.account_age || data.age || 'N/A')}</span>
                            </div>
                            <div class="property-item">
                                <span class="prop-key">Worker ID</span>
                                <span class="prop-val"><code>${escapeHtml(String(data.worker_id !== undefined ? data.worker_id : 'N/A'))}</code></span>
                            </div>
                            <div class="property-item">
                                <span class="prop-key">Process ID</span>
                                <span class="prop-val"><code>${escapeHtml(String(data.process_id !== undefined ? data.process_id : 'N/A'))}</code></span>
                            </div>
                            <div class="property-item">
                                <span class="prop-key">Increment ID</span>
                                <span class="prop-val"><code>${escapeHtml(String(data.increment !== undefined ? data.increment : 'N/A'))}</code></span>
                            </div>
                            <div class="property-item">
                                <span class="prop-key">Binary Snowflake</span>
                                <span class="prop-val mono-xs">${escapeHtml(data.binary || 'N/A')}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // =========================================================
    // 4. IP INTELLIGENCE MODULE
    // =========================================================
    function renderIpModule(data, elapsed, target) {
        return `
            <div class="result-card">
                <div class="card-header">
                    <div class="card-title">
                        <i class="fas fa-network-wired"></i>
                        <span>IP Intelligence — ${escapeHtml(data.ip || target)}</span>
                    </div>
                    <div class="header-actions">
                        <span class="latency-tag">${elapsed}ms</span>
                        <button class="btn-export" id="btn-export-json"><i class="fas fa-download"></i> Export JSON</button>
                    </div>
                </div>

                <div class="metrics-grid">
                    <div class="metric-box">
                        <span class="metric-label">Country</span>
                        <span class="metric-value">${escapeHtml(data.country || 'N/A')} (${escapeHtml(data.country_code || '--')})</span>
                    </div>
                    <div class="metric-box">
                        <span class="metric-label">City / Region</span>
                        <span class="metric-value">${escapeHtml(data.city || 'N/A')}, ${escapeHtml(data.region || 'N/A')}</span>
                    </div>
                    <div class="metric-box">
                        <span class="metric-label">Autonomous System</span>
                        <span class="metric-value text-blue">${escapeHtml(data.asn || data.as || 'N/A')}</span>
                    </div>
                    <div class="metric-box">
                        <span class="metric-label">Hosting / Proxy Flag</span>
                        <span class="metric-value ${data.is_hosting || data.is_proxy ? 'text-yellow' : 'text-green'}">
                            ${data.is_hosting ? 'DATACENTER' : (data.is_proxy ? 'PROXY' : 'RESIDENTIAL / DIRECT')}
                        </span>
                    </div>
                </div>

                <div class="property-grid">
                    <div class="property-item">
                        <span class="prop-key">ISP / Carrier</span>
                        <span class="prop-val">${escapeHtml(data.isp || 'N/A')}</span>
                    </div>
                    <div class="property-item">
                        <span class="prop-key">Organization</span>
                        <span class="prop-val">${escapeHtml(data.org || 'N/A')}</span>
                    </div>
                    <div class="property-item">
                        <span class="prop-key">Coordinates (Lat, Lon)</span>
                        <span class="prop-val">${escapeHtml(String(data.latitude || data.lat || 'N/A'))}, ${escapeHtml(String(data.longitude || data.lon || 'N/A'))}</span>
                    </div>
                    <div class="property-item">
                        <span class="prop-key">Timezone</span>
                        <span class="prop-val">${escapeHtml(data.timezone || 'N/A')}</span>
                    </div>
                    <div class="property-item">
                        <span class="prop-key">Reverse DNS (PTR)</span>
                        <span class="prop-val"><code>${escapeHtml(data.reverse_dns || data.hostname || 'None')}</code></span>
                    </div>
                </div>
            </div>
        `;
    }

    // =========================================================
    // 5. BGP ROUTING MODULE
    // =========================================================
    function renderBgpModule(data, elapsed, target) {
        const prefixes = data.announced_prefixes || data.prefixes || [];
        let prefixRows = '';

        prefixes.slice(0, 100).forEach(p => {
            const cidr = typeof p === 'string' ? p : (p.prefix || JSON.stringify(p));
            prefixRows += `
                <tr>
                    <td><code>${escapeHtml(cidr)}</code></td>
                    <td><span class="badge-status status-active">ANNOUNCED</span></td>
                    <td class="text-right">
                        <button class="btn-sm-action copy-btn" data-copy="${escapeHtml(cidr)}" title="Copy Prefix">
                            <i class="fas fa-copy"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        return `
            <div class="result-card">
                <div class="card-header">
                    <div class="card-title">
                        <i class="fas fa-diagram-project"></i>
                        <span>BGP Routing Table — ${escapeHtml(data.asn || target)}</span>
                    </div>
                    <div class="header-actions">
                        <span class="latency-tag">${elapsed}ms</span>
                        <button class="btn-export" id="btn-export-json"><i class="fas fa-download"></i> Export JSON</button>
                    </div>
                </div>

                <div class="metrics-grid">
                    <div class="metric-box">
                        <span class="metric-label">Holder / Entity</span>
                        <span class="metric-value">${escapeHtml(data.holder || data.name || 'N/A')}</span>
                    </div>
                    <div class="metric-box">
                        <span class="metric-label">Announced IPv4/IPv6 Prefixes</span>
                        <span class="metric-value text-blue">${prefixes.length}</span>
                    </div>
                    <div class="metric-box">
                        <span class="metric-label">Data Source</span>
                        <span class="metric-value">RIPE Stat Global Tables</span>
                    </div>
                </div>

                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Prefix Range (CIDR)</th>
                                <th>Routing Status</th>
                                <th class="text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${prefixes.length > 0 ? prefixRows : `<tr><td colspan="3" class="text-center text-muted">No prefixes found or empty table.</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // =========================================================
    // 6. EMAIL MODULE
    // =========================================================
    function renderEmailModule(data, elapsed, target) {
        const mxRecords = data.mx_records || [];
        let mxRows = '';
        mxRecords.forEach(mx => {
            mxRows += `
                <tr>
                    <td><span class="priority-badge">${escapeHtml(String(mx.priority || '0'))}</span></td>
                    <td><code>${escapeHtml(mx.host || mx.exchange || String(mx))}</code></td>
                </tr>
            `;
        });

        return `
            <div class="result-card">
                <div class="card-header">
                    <div class="card-title">
                        <i class="fas fa-envelope-circle-check"></i>
                        <span>Mail Host & DNS Security — ${escapeHtml(target)}</span>
                    </div>
                    <div class="header-actions">
                        <span class="latency-tag">${elapsed}ms</span>
                        <button class="btn-export" id="btn-export-json"><i class="fas fa-download"></i> Export JSON</button>
                    </div>
                </div>

                <div class="metrics-grid">
                    <div class="metric-box">
                        <span class="metric-label">Provider</span>
                        <span class="metric-value text-blue">${escapeHtml(data.provider || 'Custom / Self-Hosted')}</span>
                    </div>
                    <div class="metric-box">
                        <span class="metric-label">SPF Record</span>
                        <span class="metric-value ${data.has_spf ? 'text-green' : 'text-red'}">
                            ${data.has_spf ? 'CONFIGURED' : 'MISSING'}
                        </span>
                    </div>
                    <div class="metric-box">
                        <span class="metric-label">DMARC Record</span>
                        <span class="metric-value ${data.has_dmarc ? 'text-green' : 'text-red'}">
                            ${data.has_dmarc ? 'CONFIGURED' : 'MISSING'}
                        </span>
                    </div>
                    <div class="metric-box">
                        <span class="metric-label">Gravatar Presence</span>
                        <span class="metric-value ${data.gravatar_exists ? 'text-green' : 'text-muted'}">
                            ${data.gravatar_exists ? 'FOUND' : 'NOT DETECTED'}
                        </span>
                    </div>
                </div>

                <div class="property-grid">
                    <div class="property-item">
                        <span class="prop-key">SPF Text Record</span>
                        <span class="prop-val mono-xs">${escapeHtml(data.spf_record || 'None')}</span>
                    </div>
                    <div class="property-item">
                        <span class="prop-key">DMARC Policy</span>
                        <span class="prop-val mono-xs">${escapeHtml(data.dmarc_record || 'None')}</span>
                    </div>
                </div>

                <div class="table-responsive" style="margin-top: 14px;">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th style="width: 80px;">Priority</th>
                                <th>MX Exchange Host</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${mxRecords.length > 0 ? mxRows : `<tr><td colspan="2" class="text-center text-muted">No MX records returned.</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // =========================================================
    // 7. DOMAIN MODULE
    // =========================================================
    function renderDomainModule(data, elapsed, target) {
        const subdomains = data.subdomains || [];
        const dnsRecords = data.dns_records || {};
        let subRows = '';

        subdomains.slice(0, 100).forEach(sub => {
            subRows += `
                <tr>
                    <td><code>${escapeHtml(sub)}</code></td>
                    <td><span class="badge-status status-active">CT LOG</span></td>
                    <td class="text-right">
                        <a href="https://${escapeHtml(sub)}" target="_blank" rel="noopener noreferrer" class="link-target">
                            <i class="fas fa-arrow-up-right-from-square"></i>
                        </a>
                    </td>
                </tr>
            `;
        });

        return `
            <div class="result-card">
                <div class="card-header">
                    <div class="card-title">
                        <i class="fas fa-globe"></i>
                        <span>Domain Infrastructure — ${escapeHtml(target)}</span>
                    </div>
                    <div class="header-actions">
                        <span class="latency-tag">${elapsed}ms</span>
                        <button class="btn-export" id="btn-export-json"><i class="fas fa-download"></i> Export JSON</button>
                    </div>
                </div>

                <div class="metrics-grid">
                    <div class="metric-box">
                        <span class="metric-label">Registrar</span>
                        <span class="metric-value">${escapeHtml(data.registrar || data.whois?.registrar || 'N/A')}</span>
                    </div>
                    <div class="metric-box">
                        <span class="metric-label">Creation Date</span>
                        <span class="metric-value">${escapeHtml(data.creation_date || data.whois?.creation_date || 'N/A')}</span>
                    </div>
                    <div class="metric-box">
                        <span class="metric-label">Expiration Date</span>
                        <span class="metric-value">${escapeHtml(data.expiration_date || data.whois?.expiration_date || 'N/A')}</span>
                    </div>
                    <div class="metric-box">
                        <span class="metric-label">Discovered Subdomains</span>
                        <span class="metric-value text-blue">${subdomains.length}</span>
                    </div>
                </div>

                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Subdomain</th>
                                <th>Source</th>
                                <th class="text-right">Endpoint</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${subdomains.length > 0 ? subRows : `<tr><td colspan="3" class="text-center text-muted">No Certificate Transparency subdomains logged.</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // =========================================================
    // 8. PHONE MODULE
    // =========================================================
    function renderPhoneModule(data, elapsed, target) {
        return `
            <div class="result-card">
                <div class="card-header">
                    <div class="card-title">
                        <i class="fas fa-phone-volume"></i>
                        <span>Phone / Telco Identification — ${escapeHtml(target)}</span>
                    </div>
                    <span class="latency-tag">${elapsed}ms</span>
                </div>

                <div class="metrics-grid">
                    <div class="metric-box">
                        <span class="metric-label">Valid Number</span>
                        <span class="metric-value ${data.is_valid ? 'text-green' : 'text-red'}">
                            ${data.is_valid ? 'VALID E.164' : 'INVALID'}
                        </span>
                    </div>
                    <div class="metric-box">
                        <span class="metric-label">Line Type</span>
                        <span class="metric-value text-blue">${escapeHtml(data.line_type || 'Unknown')}</span>
                    </div>
                    <div class="metric-box">
                        <span class="metric-label">Carrier</span>
                        <span class="metric-value">${escapeHtml(data.carrier || 'N/A')}</span>
                    </div>
                    <div class="metric-box">
                        <span class="metric-label">Geographic Region</span>
                        <span class="metric-value">${escapeHtml(data.location || data.country || 'N/A')}</span>
                    </div>
                </div>

                <div class="property-grid">
                    <div class="property-item">
                        <span class="prop-key">International Format</span>
                        <span class="prop-val"><code>${escapeHtml(data.international_format || 'N/A')}</code></span>
                    </div>
                    <div class="property-item">
                        <span class="prop-key">National Format</span>
                        <span class="prop-val"><code>${escapeHtml(data.national_format || 'N/A')}</code></span>
                    </div>
                    <div class="property-item">
                        <span class="prop-key">Timezones</span>
                        <span class="prop-val">${escapeHtml((data.timezones || []).join(', ') || 'N/A')}</span>
                    </div>
                </div>
            </div>
        `;
    }

    // =========================================================
    // 9. HEADERS MODULE
    // =========================================================
    function renderHeadersModule(data, elapsed, target) {
        const grade = data.security_score || data.grade || 'B';
        const headers = data.headers || {};
        let headerRows = '';

        for (const [hk, hv] of Object.entries(headers)) {
            headerRows += `
                <tr>
                    <td><code>${escapeHtml(hk)}</code></td>
                    <td class="mono-xs">${escapeHtml(String(hv))}</td>
                </tr>
            `;
        }

        return `
            <div class="result-card">
                <div class="card-header">
                    <div class="card-title">
                        <i class="fas fa-shield-halved"></i>
                        <span>HTTP Response Security Audit — ${escapeHtml(target)}</span>
                    </div>
                    <div class="header-actions">
                        <span class="latency-tag">${elapsed}ms</span>
                        <button class="btn-export" id="btn-export-json"><i class="fas fa-download"></i> Export JSON</button>
                    </div>
                </div>

                <div class="metrics-grid">
                    <div class="metric-box">
                        <span class="metric-label">Server Fingerprint</span>
                        <span class="metric-value">${escapeHtml(data.server || headers['server'] || 'Undisclosed')}</span>
                    </div>
                    <div class="metric-box">
                        <span class="metric-label">HSTS (Strict-Transport-Security)</span>
                        <span class="metric-value ${data.has_hsts ? 'text-green' : 'text-red'}">
                            ${data.has_hsts ? 'PRESENT' : 'MISSING'}
                        </span>
                    </div>
                    <div class="metric-box">
                        <span class="metric-label">Content-Security-Policy</span>
                        <span class="metric-value ${data.has_csp ? 'text-green' : 'text-red'}">
                            ${data.has_csp ? 'PRESENT' : 'MISSING'}
                        </span>
                    </div>
                    <div class="metric-box">
                        <span class="metric-label">X-Frame-Options</span>
                        <span class="metric-value ${data.has_x_frame ? 'text-green' : 'text-red'}">
                            ${data.has_x_frame ? 'PROTECTED' : 'NOT SET'}
                        </span>
                    </div>
                </div>

                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th style="width: 260px;">Header Key</th>
                                <th>Header Value</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${headerRows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // =========================================================
    // 10. HASH MODULE
    // =========================================================
    function renderHashModule(data, elapsed, target) {
        const matches = data.possible_types || data.matches || [];
        return `
            <div class="result-card">
                <div class="card-header">
                    <div class="card-title">
                        <i class="fas fa-key"></i>
                        <span>Cryptographic Hash Identification</span>
                    </div>
                    <span class="latency-tag">${elapsed}ms</span>
                </div>

                <div class="metrics-grid">
                    <div class="metric-box">
                        <span class="metric-label">Byte Length</span>
                        <span class="metric-value">${escapeHtml(String(data.length || target.length))} chars</span>
                    </div>
                    <div class="metric-box">
                        <span class="metric-label">Shannon Entropy</span>
                        <span class="metric-value text-blue">${escapeHtml(String(data.entropy || 'N/A'))}</span>
                    </div>
                    <div class="metric-box">
                        <span class="metric-label">Primary Candidate</span>
                        <span class="metric-value text-green">${escapeHtml(matches[0] || 'Unknown Hash Type')}</span>
                    </div>
                </div>

                <div class="property-grid">
                    <div class="property-item">
                        <span class="prop-key">All Possible Algorithms</span>
                        <span class="prop-val">${matches.map(m => `<span class="platform-badge">${escapeHtml(m)}</span>`).join(' ')}</span>
                    </div>
                </div>
            </div>
        `;
    }

    // =========================================================
    // DOM INTERACTIONS (COPY, EXPORT, FILTERS)
    // =========================================================
    function bindResultActions(container, data, target, moduleName) {
        // Copy buttons
        container.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const text = btn.getAttribute('data-copy');
                if (text) {
                    navigator.clipboard.writeText(text).then(() => {
                        showToast('Copied to clipboard', 'info');
                    });
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
                showToast('JSON export downloaded', 'success');
            });
        }

        // Live username filter
        const filterInput = container.querySelector('#username-filter-input');
        if (filterInput) {
            filterInput.addEventListener('input', () => {
                const q = filterInput.value.toLowerCase().trim();
                const rows = container.querySelectorAll('#username-table tbody tr.row-found');
                let count = 0;
                rows.forEach(r => {
                    const name = r.getAttribute('data-name') || '';
                    if (name.includes(q)) {
                        r.style.display = '';
                        count++;
                    } else {
                        r.style.display = 'none';
                    }
                });
                const countEl = container.querySelector('#username-filter-count');
                if (countEl) countEl.textContent = `Showing ${count} profiles`;
            });
        }
    }

    // Toast Notifications
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
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 250);
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
