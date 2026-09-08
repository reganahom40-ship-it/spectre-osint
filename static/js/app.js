/* =========================================================
   SPECTRE INTELLIGENCE PLATFORM — APP.JS (V3.5)
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {
    // ---- Initialize Canvas & Clock ----
    initBubbleCanvas();
    initClock();

    // ---- DOM Elements ----
    const navItems = document.querySelectorAll('.nav-item');
    const panels = document.querySelectorAll('.recon-panel');
    const scanButtons = document.querySelectorAll('.super-btn');
    const vectorLabel = document.getElementById('current-vector-label');
    const toastContainer = document.getElementById('toast-container');

    const VECTOR_TITLES = {
        username: 'Username Reconnaissance',
        discord:  'Discord Snowflake Intelligence',
        ip:       'IP Geolocation & Routing',
        email:    'Email Intelligence & Security',
        domain:   'Domain WHOIS & Subdomains',
        phone:    'Phone Carrier & Validation',
        headers:  'HTTP Security Compliance',
        hash:     'Cryptographic Hash Identifier'
    };

    // ---- API Routes Map ----
    const API_ROUTES = {
        username: { endpoint: '/api/username', key: 'username' },
        discord:  { endpoint: '/api/discord',  key: 'id' },
        ip:       { endpoint: '/api/ip',       key: 'ip' },
        email:    { endpoint: '/api/email',    key: 'email' },
        domain:   { endpoint: '/api/domain',   key: 'domain' },
        phone:    { endpoint: '/api/phone',    key: 'phone' },
        headers:  { endpoint: '/api/headers',  key: 'url' },
        hash:     { endpoint: '/api/hash',     key: 'hash' }
    };

    // ---- Sidebar Navigation ----
    navItems.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetMod = tab.getAttribute('data-tab');
            
            navItems.forEach(t => t.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));

            tab.classList.add('active');
            const targetPanel = document.getElementById(`panel-${targetMod}`);
            if (targetPanel) {
                targetPanel.classList.add('active');
                if (vectorLabel && VECTOR_TITLES[targetMod]) {
                    vectorLabel.textContent = VECTOR_TITLES[targetMod];
                }
                const searchInput = targetPanel.querySelector('.super-input');
                if (searchInput) searchInput.focus();
            }
        });
    });

    // ---- Scan Triggering ----
    scanButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const mod = btn.getAttribute('data-module');
            const input = document.getElementById(`input-${mod}`);
            const queryVal = input ? input.value.trim() : '';

            if (!queryVal) {
                showToast('Please provide a target query!', 'error');
                if (input) input.focus();
                return;
            }

            executeScan(mod, queryVal, btn);
        });
    });

    // ---- Enter Key Listener ----
    document.querySelectorAll('.super-input').forEach(input => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const mod = input.id.replace('input-', '');
                const btn = document.querySelector(`.super-btn[data-module="${mod}"]`);
                if (btn && !btn.disabled) {
                    btn.click();
                }
            }
        });
    });

    // ---- Scan Engine ----
    async function executeScan(module, query, btn) {
        const resultsDiv = document.getElementById(`results-${module}`);
        const route = API_ROUTES[module];
        const initialBtnContent = btn.innerHTML;

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Scanning...</span>';
        resultsDiv.innerHTML = getLoadingHTML(module, query);

        try {
            const payload = {};
            payload[route.key] = query;

            const res = await fetch(route.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const json = await res.json();

            if (json.success && json.data) {
                renderModuleResults(module, json.data, query);
                showToast(`Scan complete for ${query}`, 'success');
            } else {
                resultsDiv.innerHTML = getErrorHTML(json.error || 'The recon probe encountered an error');
                showToast(json.error || 'Scan failed', 'error');
            }
        } catch (err) {
            resultsDiv.innerHTML = getErrorHTML('Connection failed: ' + err.message);
            showToast('Network request failed', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = initialBtnContent;
        }
    }

    // ---- Result Render Router ----
    function renderModuleResults(module, data, query) {
        const container = document.getElementById(`results-${module}`);
        let html = '';

        switch (module) {
            case 'username': html = buildUsernameView(data, query); break;
            case 'discord':  html = buildDiscordView(data, query); break;
            case 'ip':       html = buildIPView(data, query); break;
            case 'email':    html = buildEmailView(data, query); break;
            case 'domain':   html = buildDomainView(data, query); break;
            case 'phone':    html = buildPhoneView(data, query); break;
            case 'headers':  html = buildHeadersView(data, query); break;
            case 'hash':     html = buildHashView(data, query); break;
        }

        container.innerHTML = html;

        // Attach Export JSON
        const exportBtn = container.querySelector('.export-json-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                exportData(data, `spectre_${module}_${query}`);
            });
        }

        // Attach Username Filters
        if (module === 'username') {
            attachUsernameFilterLogic(container, data.results || []);
        }
    }

    // =========================================================
    //  MODULE: DISCORD SNOWFLAKE (NEW)
    // =========================================================
    function buildDiscordView(data, query) {
        const badgesHtml = (data.badges && data.badges.length > 0)
            ? data.badges.map(b => `<span class="badge badge-found">${esc(b)}</span>`).join('')
            : '<span class="badge badge-found">Standard User</span>';

        return `
            <div class="results-meta-bar">
                <div class="results-title"><i class="fa-brands fa-discord"></i> Discord Snowflake: <strong>${esc(data.id || query)}</strong></div>
                <button class="export-json-btn"><i class="fas fa-file-export"></i> Export JSON</button>
            </div>

            <div class="discord-profile-banner">
                <img src="${esc(data.avatar_url)}" alt="Avatar" class="discord-avatar-large" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                <div class="discord-user-info">
                    <h3>${esc(data.global_name)}</h3>
                    <div class="tag">@${esc(data.username)}</div>
                    <div class="badge-tag-wrap">${badgesHtml}</div>
                </div>
            </div>

            <div class="stats-metrics-grid">
                <div class="metric-card">
                    <div class="metric-val purple">${data.account_age_years} yrs</div>
                    <div class="metric-lbl">Account Age</div>
                </div>
                <div class="metric-card">
                    <div class="metric-val cyan">${data.account_age_days} days</div>
                    <div class="metric-lbl">Days Registered</div>
                </div>
                <div class="metric-card">
                    <div class="metric-val green">${data.bot ? 'BOT / APP' : 'HUMAN'}</div>
                    <div class="metric-lbl">Entity Type</div>
                </div>
                <div class="metric-card">
                    <div class="metric-val yellow">${data.snowflake_metadata.worker_id} / ${data.snowflake_metadata.process_id}</div>
                    <div class="metric-lbl">Worker / Process</div>
                </div>
            </div>

            <div class="data-grid-two">
                ${infoBox('Exact Registration Time', data.created_at, true, true)}
                ${infoBox('Discord Snowflake ID', data.id)}
                ${infoBox('Unix Epoch Timestamp (ms)', data.created_timestamp)}
                ${infoBox('Internal Sequence Inc', data.snowflake_metadata.increment)}
                ${infoBox('Avatar Asset URL', data.avatar_url, true, false, true)}
            </div>
        `;
    }

    // =========================================================
    //  MODULE: HASH IDENTIFIER (NEW)
    // =========================================================
    function buildHashView(data, query) {
        return `
            <div class="results-meta-bar">
                <div class="results-title"><i class="fas fa-key"></i> Hash Analysis: <strong>${esc(data.hash || query)}</strong></div>
                <button class="export-json-btn"><i class="fas fa-file-export"></i> Export JSON</button>
            </div>

            <div class="stats-metrics-grid">
                <div class="metric-card">
                    <div class="metric-val green">${data.length} chars</div>
                    <div class="metric-lbl">Hash Length</div>
                </div>
                <div class="metric-card">
                    <div class="metric-val cyan">${data.is_hex ? 'HEXADECIMAL' : 'BASE64/ASCII'}</div>
                    <div class="metric-lbl">Encoding Format</div>
                </div>
                <div class="metric-card">
                    <div class="metric-val yellow">${data.entropy}</div>
                    <div class="metric-lbl">Shannon Entropy</div>
                </div>
                <div class="metric-card">
                    <div class="metric-val purple">${data.possible_algorithms.length} matches</div>
                    <div class="metric-lbl">Algorithms</div>
                </div>
            </div>

            <div class="sub-header"><i class="fas fa-fingerprint"></i> Primary Algorithm Match</div>
            <div class="info-item full-span" style="background:rgba(0,232,123,0.1);border-color:var(--neon-green);padding:18px;border-radius:18px;">
                <div style="font-size:0.75rem;color:var(--neon-green);font-family:var(--font-mono);text-transform:uppercase;">CONFIRMED HIGH PROBABILITY</div>
                <div style="font-size:1.4rem;font-weight:800;color:#fff;margin-top:4px;">${esc(data.primary_match)}</div>
            </div>

            <div class="sub-header"><i class="fas fa-list"></i> All Potential Algorithm Matches</div>
            <div class="intel-code-box">${data.possible_algorithms.map(a => `• ${esc(a)}`).join('\n')}</div>
        `;
    }

    // =========================================================
    //  MODULE: USERNAME (112+ PLATFORMS)
    // =========================================================
    function buildUsernameView(data, query) {
        const list = data.results || [];
        const found = list.filter(r => r.status === 'found');
        const notFound = list.filter(r => r.status === 'not_found');
        const errors = list.filter(r => r.status === 'error');

        return `
            <div class="results-meta-bar">
                <div class="results-title">
                    <i class="fas fa-bullseye"></i>
                    <span>Target: <strong>${esc(query)}</strong></span>
                </div>
                <button class="export-json-btn">
                    <i class="fas fa-file-export"></i> Export JSON
                </button>
            </div>

            <div class="stats-metrics-grid">
                <div class="metric-card">
                    <div class="metric-val green">${found.length}</div>
                    <div class="metric-lbl">Found</div>
                </div>
                <div class="metric-card">
                    <div class="metric-val red">${notFound.length}</div>
                    <div class="metric-lbl">Not Found</div>
                </div>
                <div class="metric-card">
                    <div class="metric-val yellow">${errors.length}</div>
                    <div class="metric-lbl">Rate / Err</div>
                </div>
                <div class="metric-card">
                    <div class="metric-val cyan">${data.total_platforms || list.length}</div>
                    <div class="metric-lbl">Scanned</div>
                </div>
            </div>

            <div class="filter-bar">
                <button class="filter-btn active" data-filter="all">All (${list.length})</button>
                <button class="filter-btn" data-filter="found">Found (${found.length})</button>
                <button class="filter-btn" data-filter="not_found">Not Found (${notFound.length})</button>
                <input type="text" class="filter-search" placeholder="Filter 112+ networks...">
            </div>

            <div class="platform-grid" id="username-platform-grid">
                ${renderPlatformCards(list)}
            </div>
        `;
    }

    function renderPlatformCards(items) {
        if (!items || items.length === 0) {
            return '<div class="info-item full-span" style="text-align:center;color:var(--text-muted);padding:24px;">No matching networks found.</div>';
        }

        return items.map(item => {
            const isFound = item.status === 'found';
            const isErr = item.status === 'error';
            const badgeClass = isFound ? 'badge-found' : (isErr ? 'badge-error' : 'badge-not-found');
            const badgeText = isFound ? 'FOUND' : (isErr ? 'RATE/ERR' : 'NONE');

            const linkMarkup = isFound 
                ? `<a href="${esc(item.url)}" target="_blank" rel="noopener" class="platform-link"><i class="fas fa-arrow-up-right-from-square"></i> ${esc(item.url)}</a>`
                : `<span class="platform-link" style="color:var(--text-dim);">${esc(item.platform)}</span>`;

            return `
                <div class="platform-row">
                    <div class="platform-left">
                        <div class="platform-title-line">
                            <span class="platform-name">${esc(item.platform)}</span>
                            <span class="platform-cat">${esc(item.category || 'Web')}</span>
                        </div>
                        ${linkMarkup}
                    </div>
                    <span class="badge ${badgeClass}">${badgeText}</span>
                </div>
            `;
        }).join('');
    }

    function attachUsernameFilterLogic(container, allItems) {
        const filterBtns = container.querySelectorAll('.filter-btn');
        const filterSearch = container.querySelector('.filter-search');
        const grid = container.querySelector('#username-platform-grid');

        let currentStatusFilter = 'all';
        let currentSearchQuery = '';

        function applyFilters() {
            const filtered = allItems.filter(item => {
                const matchesStatus = (currentStatusFilter === 'all') || (item.status === currentStatusFilter);
                const matchesSearch = !currentSearchQuery || 
                    item.platform.toLowerCase().includes(currentSearchQuery) || 
                    (item.category && item.category.toLowerCase().includes(currentSearchQuery));
                return matchesStatus && matchesSearch;
            });
            grid.innerHTML = renderPlatformCards(filtered);
        }

        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentStatusFilter = btn.getAttribute('data-filter');
                applyFilters();
            });
        });

        if (filterSearch) {
            filterSearch.addEventListener('input', (e) => {
                currentSearchQuery = e.target.value.toLowerCase().trim();
                applyFilters();
            });
        }
    }

    // =========================================================
    //  MODULE: IP INTELLIGENCE
    // =========================================================
    function buildIPView(data, query) {
        const flag = data.countryCode ? getFlagEmoji(data.countryCode) : '🌐';
        return `
            <div class="results-meta-bar">
                <div class="results-title"><i class="fas fa-network-wired"></i> IP Location & ASN: <strong>${esc(data.query || query)}</strong></div>
                <button class="export-json-btn"><i class="fas fa-file-export"></i> Export JSON</button>
            </div>
            <div class="data-grid-two">
                ${infoBox('IP Address', data.query || query, true, true)}
                ${infoBox('Country', `${flag} ${data.country || 'N/A'} (${data.countryCode || 'N/A'})`)}
                ${infoBox('Region / City', `${data.regionName || 'N/A'}, ${data.city || 'N/A'} (${data.zip || 'N/A'})`)}
                ${infoBox('Coordinates', `${data.lat ?? 'N/A'}, ${data.lon ?? 'N/A'}`)}
                ${infoBox('Timezone', `${data.timezone || 'N/A'} (UTC ${data.offset ? (data.offset / 3600) + 'h' : '0'})`)}
                ${infoBox('ISP / Organization', `${data.isp || 'N/A'} // ${data.org || 'N/A'}`)}
                ${infoBox('Autonomous System', `${data.as || 'N/A'} (${data.asname || 'N/A'})`)}
                ${infoBox('Reverse DNS', data.reverse_dns || data.reverse || 'None', false, false, true)}
                ${infoBox('Proxy / VPN Status', data.proxy ? 'FLAGGED (PROXY / VPN)' : 'CLEAN (DIRECT)', false, data.proxy)}
                ${infoBox('Hosting Provider', data.hosting ? 'YES (DATACENTER / VPS)' : 'RESIDENTIAL NETWORK', false, false)}
            </div>
        `;
    }

    // =========================================================
    //  MODULE: EMAIL INTELLIGENCE
    // =========================================================
    function buildEmailView(data, query) {
        let mxRows = '';
        if (data.mx_records && data.mx_records.length > 0) {
            mxRows = data.mx_records.map(mx => `
                <tr>
                    <td><span class="badge badge-found">Priority ${mx.priority}</span></td>
                    <td style="color:var(--neon-cyan);">${esc(mx.server)}</td>
                </tr>
            `).join('');
        } else {
            mxRows = '<tr><td colspan="2" style="color:var(--text-muted);">No MX records discovered</td></tr>';
        }

        const gravatarSection = (data.gravatar && data.gravatar.exists)
            ? `<div class="info-item full-span" style="display:flex;align-items:center;gap:14px;">
                 <img src="${esc(data.gravatar.url)}" style="width:52px;height:52px;border-radius:50%;border:2px solid var(--neon-green);">
                 <div>
                    <div style="font-family:var(--font-sans);font-size:0.9rem;font-weight:700;color:var(--neon-green);">Gravatar Account Verified</div>
                    <div style="font-family:var(--font-mono);font-size:0.75rem;color:var(--text-muted);">${esc(data.email)}</div>
                 </div>
               </div>`
            : '';

        return `
            <div class="results-meta-bar">
                <div class="results-title"><i class="fas fa-at"></i> Target: <strong>${esc(data.email || query)}</strong></div>
                <button class="export-json-btn"><i class="fas fa-file-export"></i> Export JSON</button>
            </div>
            ${gravatarSection}
            <div class="data-grid-two">
                ${infoBox('Handle / Username', data.handle || 'N/A')}
                ${infoBox('Domain', data.domain || 'N/A', false, false, true)}
                ${infoBox('Mail Provider Fingerprint', data.mail_provider || 'Unknown', false, true)}
                ${infoBox('RFC Validation', data.valid_format ? 'Valid Format (RFC 5322)' : 'Invalid', false, false)}
            </div>

            <div class="sub-header"><i class="fas fa-server"></i> Mail Exchange (MX) Servers</div>
            <table class="intel-table">
                <thead><tr><th>Priority</th><th>Server Hostname</th></tr></thead>
                <tbody>${mxRows}</tbody>
            </table>

            <div class="sub-header"><i class="fas fa-shield-halved"></i> Authentication & SPF / DMARC</div>
            <div class="info-lbl">SPF Policy</div>
            <div class="intel-code-box">${esc(data.spf_record || 'None configured')}</div>
            <div class="info-lbl">DMARC Policy</div>
            <div class="intel-code-box">${esc(data.dmarc_record || 'None configured')}</div>
        `;
    }

    // =========================================================
    //  MODULE: DOMAIN RECON
    // =========================================================
    function buildDomainView(data, query) {
        const w = data.whois || {};
        const subdomains = data.subdomains || [];

        return `
            <div class="results-meta-bar">
                <div class="results-title"><i class="fas fa-globe"></i> Domain Recon: <strong>${esc(data.domain || query)}</strong></div>
                <button class="export-json-btn"><i class="fas fa-file-export"></i> Export JSON</button>
            </div>

            <div class="sub-header"><i class="fas fa-id-card"></i> Domain WHOIS Summary</div>
            <div class="data-grid-two">
                ${infoBox('Registrar', w.registrar || 'N/A')}
                ${infoBox('Created Date', formatDate(w.creation_date))}
                ${infoBox('Expiration Date', formatDate(w.expiration_date))}
                ${infoBox('Registry Status', Array.isArray(w.status) ? w.status.slice(0, 2).join(', ') : (w.status || 'Active'))}
                ${infoBox('Nameservers', Array.isArray(w.name_servers) ? w.name_servers.join(', ') : (w.name_servers || 'N/A'), true, false, true)}
            </div>

            <div class="sub-header"><i class="fas fa-diagram-project"></i> Subdomains Discovered (${subdomains.length})</div>
            <div class="intel-code-box">${subdomains.length > 0 ? subdomains.map(s => esc(s)).join('\n') : 'No public Certificate Transparency subdomains found'}</div>

            ${data.robots_txt ? `
                <div class="sub-header"><i class="fas fa-robot"></i> robots.txt</div>
                <div class="intel-code-box">${esc(data.robots_txt)}</div>
            ` : ''}
        `;
    }

    // =========================================================
    //  MODULE: PHONE INTELLIGENCE
    // =========================================================
    function buildPhoneView(data, query) {
        const fmt = data.formatted || {};
        return `
            <div class="results-meta-bar">
                <div class="results-title"><i class="fas fa-phone-volume"></i> Phone Intel: <strong>${esc(data.input || query)}</strong></div>
                <button class="export-json-btn"><i class="fas fa-file-export"></i> Export JSON</button>
            </div>
            <div class="data-grid-two">
                ${infoBox('Valid Phone', data.valid ? 'YES (VALID NUMBER)' : 'NO', false, data.valid)}
                ${infoBox('Country Location', `${data.country || 'Unknown'} (+${data.country_code || ''})`)}
                ${infoBox('Carrier Network', data.carrier || 'Unknown Network', false, true)}
                ${infoBox('Line Type', data.line_type || 'Unknown Line')}
                ${infoBox('Timezone(s)', (data.timezones || []).join(', ') || 'N/A', true)}
            </div>
            <div class="sub-header"><i class="fas fa-hashtag"></i> Standard Dial Formats</div>
            <div class="data-grid-two">
                ${infoBox('International', fmt.international || 'N/A')}
                ${infoBox('National Format', fmt.national || 'N/A')}
                ${infoBox('E.164 Clean Format', fmt.e164 || 'N/A', false, true)}
                ${infoBox('RFC3966 URI', fmt.rfc3966 || 'N/A')}
            </div>
        `;
    }

    // =========================================================
    //  MODULE: HTTP HEADERS & SECURITY
    // =========================================================
    function buildHeadersView(data, query) {
        const auditList = (data.security_audit || []).map(a => `
            <tr>
                <td>
                    <span class="badge ${a.present ? 'badge-found' : 'badge-not-found'}">
                        ${a.present ? 'PASS' : 'MISSING'}
                    </span>
                </td>
                <td style="color:var(--text-main);font-weight:700;">${esc(a.header)}</td>
                <td style="color:${a.present ? 'var(--neon-green)' : 'var(--text-dim)'};">${a.value ? esc(a.value) : 'Absent'}</td>
            </tr>
        `).join('');

        const headerRows = Object.entries(data.headers || {}).map(([k, v]) => `
            <tr>
                <td style="color:var(--neon-cyan);white-space:nowrap;font-weight:600;">${esc(k)}</td>
                <td style="color:var(--text-muted);word-break:break-all;">${esc(String(v))}</td>
            </tr>
        `).join('');

        return `
            <div class="results-meta-bar">
                <div class="results-title"><i class="fas fa-shield-virus"></i> Response Headers: <strong>${esc(data.url || query)}</strong></div>
                <button class="export-json-btn"><i class="fas fa-file-export"></i> Export JSON</button>
            </div>
            <div class="data-grid-two">
                ${infoBox('HTTP Status', `${data.status_code || 'N/A'} OK`, false, true)}
                ${infoBox('Web Server', data.server || 'Hidden / Cloudflare')}
                ${infoBox('X-Powered-By', data.powered_by || 'Not Disclosed')}
                ${infoBox('Cookies Detected', (data.cookies || []).length + ' session cookies')}
            </div>

            <div class="sub-header"><i class="fas fa-shield-halved"></i> Security Compliance Audit</div>
            <table class="intel-table">
                <thead><tr><th>Status</th><th>Security Header</th><th>Value</th></tr></thead>
                <tbody>${auditList}</tbody>
            </table>

            <div class="sub-header"><i class="fas fa-list"></i> Full Response Headers</div>
            <table class="intel-table">
                <thead><tr><th>Header Name</th><th>Value</th></tr></thead>
                <tbody>${headerRows}</tbody>
            </table>
        `;
    }

    // =========================================================
    //  HELPERS & UTILITIES
    // =========================================================
    function infoBox(lbl, val, isFull = false, isGreen = false, isCyan = false) {
        const spanClass = isFull ? 'info-item full-span' : 'info-item';
        const valClass = isGreen ? 'info-val highlight' : (isCyan ? 'info-val cyan' : 'info-val');
        return `
            <div class="${spanClass}">
                <div class="info-lbl">${esc(lbl)}</div>
                <div class="${valClass}">${esc(String(val || 'N/A'))}</div>
            </div>
        `;
    }

    function formatDate(val) {
        if (!val) return 'N/A';
        if (Array.isArray(val)) val = val[0];
        if (typeof val === 'string') {
            try {
                const d = new Date(val);
                if (!isNaN(d)) return d.toISOString().split('T')[0];
            } catch (e) {}
        }
        return String(val);
    }

    function getFlagEmoji(countryCode) {
        if (!countryCode || countryCode.length !== 2) return '🌐';
        const codePoints = [...countryCode.toUpperCase()].map(c => 127397 + c.charCodeAt(0));
        return String.fromCodePoint(...codePoints);
    }

    function esc(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    function getLoadingHTML(module, target) {
        return `
            <div class="loading-box">
                <div class="loading-pulse-text">
                    <i class="fas fa-crosshairs fa-spin"></i>
                    <span>EXECUTING VECTOR PROBE ON: ${esc(target)}</span>
                </div>
                <div class="loading-track">
                    <div class="loading-bar-fill"></div>
                </div>
            </div>
        `;
    }

    function getErrorHTML(msg) {
        return `
            <div class="error-box">
                <i class="fas fa-circle-exclamation" style="margin-right:8px;"></i>
                ${esc(msg)}
            </div>
        `;
    }

    function exportData(data, filenamePrefix) {
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${filenamePrefix}_${ts}.json`;
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`Saved ${filename}`, 'success');
    }

    function showToast(msg, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = msg;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(16px) scale(0.9)';
            toast.style.transition = 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        }, 2800);
    }

    function initClock() {
        const clock = document.getElementById('live-clock');
        if (!clock) return;
        function update() {
            const now = new Date();
            clock.textContent = now.toUTCString().split(' ')[4] + ' UTC';
        }
        setInterval(update, 1000);
        update();
    }

    function initBubbleCanvas() {
        const canvas = document.getElementById('bubble-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let width, height;
        let bubbles = [];

        function resize() {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
        }
        window.addEventListener('resize', resize);
        resize();

        const colors = [
            'rgba(0, 232, 123, 0.22)',
            'rgba(0, 210, 255, 0.22)',
            'rgba(155, 92, 255, 0.2)',
            'rgba(88, 101, 242, 0.2)'
        ];

        for (let i = 0; i < 30; i++) {
            bubbles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                radius: Math.random() * 16 + 6,
                vx: (Math.random() - 0.5) * 0.5,
                vy: -Math.random() * 0.7 - 0.2,
                color: colors[Math.floor(Math.random() * colors.length)],
                pulse: Math.random() * Math.PI,
                pulseSpeed: 0.02 + Math.random() * 0.02
            });
        }

        let mouseX = -1000, mouseY = -1000;
        window.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        });

        function animate() {
            ctx.clearRect(0, 0, width, height);

            bubbles.forEach(b => {
                b.x += b.vx;
                b.y += b.vy;
                b.pulse += b.pulseSpeed;

                if (b.y < -b.radius) {
                    b.y = height + b.radius;
                    b.x = Math.random() * width;
                }
                if (b.x < -b.radius) b.x = width + b.radius;
                if (b.x > width + b.radius) b.x = -b.radius;

                const dx = b.x - mouseX;
                const dy = b.y - mouseY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 100) {
                    const force = (100 - dist) / 100;
                    b.x += (dx / dist) * force * 2.5;
                    b.y += (dy / dist) * force * 2.5;
                }

                const currentRadius = b.radius + Math.sin(b.pulse) * 2;
                ctx.beginPath();
                ctx.arc(b.x, b.y, Math.max(1, currentRadius), 0, Math.PI * 2);
                ctx.fillStyle = b.color;
                ctx.fill();

                ctx.beginPath();
                ctx.arc(b.x - currentRadius * 0.3, b.y - currentRadius * 0.3, currentRadius * 0.3, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
                ctx.fill();
            });

            requestAnimationFrame(animate);
        }

        animate();
    }
});
