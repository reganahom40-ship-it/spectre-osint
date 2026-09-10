/* =========================================================
   SPECTRE INTELLIGENCE PLATFORM — TACTICAL HUD JS (V5.0)
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {
    // ---- System State & Audio Engine ----
    let audioEnabled = true;
    let audioCtx = null;

    // ---- Initialize Canvas, Clock & Telemetry ----
    initCyberCanvas();
    initClock();
    loadTargetHistory();

    // ---- DOM Elements ----
    const vectorTabs = document.querySelectorAll('.v-tab');
    const opsPanels = document.querySelectorAll('.ops-panel');
    const scanButtons = document.querySelectorAll('.hud-scan-btn');
    const vectorTitle = document.getElementById('current-vector-title');
    const toastContainer = document.getElementById('hud-toast-container');
    const audioToggleBtn = document.getElementById('audio-toggle');
    const audioIcon = document.getElementById('audio-icon');
    const audioLabel = document.getElementById('audio-label');
    const clearHistoryBtn = document.getElementById('btn-clear-history');

    const VECTOR_TITLES = {
        username: '01 // USERNAME_ENUMERATION',
        dorks:    '02 // GOOGLE_DORK_ENGINE',
        discord:  '03 // DISCORD_SNOWFLAKE_DECODER',
        ip:       '04 // IP_GEOLOCATION_AND_ASN',
        bgp:      '05 // BGP_ROUTING_AND_PREFIXES',
        email:    '06 // EMAIL_AND_DNS_SECURITY',
        domain:   '07 // DOMAIN_AND_SUBDOMAIN_MAP',
        phone:    '08 // PHONE_AND_TELCO_VALIDATION',
        headers:  '09 // HTTP_SECURITY_COMPLIANCE',
        hash:     '10 // CRYPTOGRAPHIC_HASH_IDENTIFIER'
    };

    const API_ROUTES = {
        username: { endpoint: '/api/username', key: 'username' },
        dorks:    { endpoint: '/api/dorks',    key: 'target' },
        discord:  { endpoint: '/api/discord',  key: 'id' },
        ip:       { endpoint: '/api/ip',       key: 'ip' },
        bgp:      { endpoint: '/api/bgp',      key: 'asn' },
        email:    { endpoint: '/api/email',    key: 'email' },
        domain:   { endpoint: '/api/domain',   key: 'domain' },
        phone:    { endpoint: '/api/phone',    key: 'phone' },
        headers:  { endpoint: '/api/headers',  key: 'url' },
        hash:     { endpoint: '/api/hash',     key: 'hash' }
    };

    // ---- Tactical Sound Synthesizer (Web Audio API) ----
    function playBeep(type = 'click') {
        if (!audioEnabled) return;
        try {
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }

            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);

            const now = audioCtx.currentTime;

            if (type === 'click') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(800, now);
                osc.frequency.exponentialRampToValueAtTime(400, now + 0.04);
                gain.gain.setValueAtTime(0.08, now);
                gain.gain.linearRampToValueAtTime(0.001, now + 0.04);
                osc.start(now);
                osc.stop(now + 0.04);
            } else if (type === 'engage') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(300, now);
                osc.frequency.exponentialRampToValueAtTime(1200, now + 0.12);
                gain.gain.setValueAtTime(0.12, now);
                gain.gain.linearRampToValueAtTime(0.001, now + 0.12);
                osc.start(now);
                osc.stop(now + 0.12);
            } else if (type === 'success') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(520, now);
                osc.frequency.setValueAtTime(880, now + 0.08);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.linearRampToValueAtTime(0.001, now + 0.18);
                osc.start(now);
                osc.stop(now + 0.18);
            } else if (type === 'error') {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(220, now);
                osc.frequency.setValueAtTime(160, now + 0.08);
                gain.gain.setValueAtTime(0.12, now);
                gain.gain.linearRampToValueAtTime(0.001, now + 0.2);
                osc.start(now);
                osc.stop(now + 0.2);
            }
        } catch (e) {}
    }

    // Audio Toggle Handler
    if (audioToggleBtn) {
        audioToggleBtn.addEventListener('click', () => {
            audioEnabled = !audioEnabled;
            if (audioEnabled) {
                audioIcon.className = 'fas fa-volume-high';
                audioLabel.textContent = 'AUDIO FX: ON';
                audioToggleBtn.classList.remove('muted');
                playBeep('success');
            } else {
                audioIcon.className = 'fas fa-volume-xmark';
                audioLabel.textContent = 'AUDIO FX: MUTED';
                audioToggleBtn.classList.add('muted');
            }
        });
    }

    // ---- Sidebar Navigation ----
    function switchTab(modName) {
        const targetTab = document.querySelector(`.v-tab[data-tab="${modName}"]`);
        const targetPanel = document.getElementById(`panel-${modName}`);
        if (!targetTab || !targetPanel) return;

        vectorTabs.forEach(t => t.classList.remove('active'));
        opsPanels.forEach(p => p.classList.remove('active'));

        targetTab.classList.add('active');
        targetPanel.classList.add('active');

        if (vectorTitle && VECTOR_TITLES[modName]) {
            vectorTitle.textContent = VECTOR_TITLES[modName];
        }

        const input = targetPanel.querySelector('.hud-input');
        if (input) input.focus();

        playBeep('click');
        appendLog(`[VECTOR_SWITCH] Active tool set to: ${modName.toUpperCase()}`);
    }

    vectorTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const mod = tab.getAttribute('data-tab');
            switchTab(mod);
        });
    });

    // Keyboard Shortcuts (1-9 and 0)
    window.addEventListener('keydown', (e) => {
        if (document.activeElement.tagName === 'INPUT') return;
        const keyMap = {
            '1': 'username', '2': 'dorks', '3': 'discord', '4': 'ip', '5': 'bgp',
            '6': 'email', '7': 'domain', '8': 'phone', '9': 'headers', '0': 'hash'
        };
        if (keyMap[e.key]) {
            switchTab(keyMap[e.key]);
        }
    });

    // ---- Scan Triggering ----
    scanButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const mod = btn.getAttribute('data-module');
            const input = document.getElementById(`input-${mod}`);
            const queryVal = input ? input.value.trim() : '';

            if (!queryVal) {
                showToast('Target input is empty!', 'error');
                playBeep('error');
                if (input) input.focus();
                return;
            }

            executeScan(mod, queryVal, btn);
        });
    });

    // Enter Key Listener
    document.querySelectorAll('.hud-input').forEach(input => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const mod = input.id.replace('input-', '');
                const btn = document.querySelector(`.hud-scan-btn[data-module="${mod}"]`);
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
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>PROBING...</span>';
        resultsDiv.innerHTML = getLoadingHTML(module, query);

        playBeep('engage');
        appendLog(`[PROBE_ENGAGED] Vector: ${module.toUpperCase()} // Query: "${query}"`);
        saveTargetHistory(module, query);

        const startTime = performance.now();

        try {
            const payload = {};
            payload[route.key] = query;

            const res = await fetch(route.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const json = await res.json();
            const duration = Math.round(performance.now() - startTime);

            if (json.success && json.data) {
                renderModuleResults(module, json.data, query);
                showToast(`Scan complete in ${duration}ms`, 'success');
                playBeep('success');
                appendLog(`[PROBE_OK] 200 SUCCESS in ${duration}ms`);
            } else {
                resultsDiv.innerHTML = getErrorHTML(json.error || 'Vector execution returned an error');
                showToast(json.error || 'Scan failed', 'error');
                playBeep('error');
                appendLog(`[PROBE_ERR] 400 FAILURE: ${json.error || 'Unknown'}`);
            }
        } catch (err) {
            resultsDiv.innerHTML = getErrorHTML('Connection failed: ' + err.message);
            showToast('Network error', 'error');
            playBeep('error');
            appendLog(`[NET_FATAL] Error communicating with endpoint: ${err.message}`);
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
            case 'dorks':    html = buildDorksView(data, query); break;
            case 'discord':  html = buildDiscordView(data, query); break;
            case 'ip':       html = buildIPView(data, query); break;
            case 'bgp':      html = buildBGPView(data, query); break;
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
    //  MODULE RENDERERS
    // =========================================================
    function buildUsernameView(data, query) {
        const list = data.results || [];
        const found = list.filter(r => r.status === 'found');
        const notFound = list.filter(r => r.status === 'not_found');
        const errors = list.filter(r => r.status === 'error');

        return `
            <div class="results-meta-bar">
                <div class="results-title"><i class="fas fa-crosshairs"></i> TARGET: <strong>${esc(query)}</strong></div>
                <button class="export-json-btn"><i class="fas fa-file-export"></i> EXPORT_JSON</button>
            </div>

            <div class="stats-metrics-grid">
                <div class="metric-card">
                    <div class="metric-val green">${found.length}</div>
                    <div class="metric-lbl">FOUND</div>
                </div>
                <div class="metric-card">
                    <div class="metric-val pink">${notFound.length}</div>
                    <div class="metric-lbl">NOT FOUND</div>
                </div>
                <div class="metric-card">
                    <div class="metric-val yellow">${errors.length}</div>
                    <div class="metric-lbl">ERR / LIMIT</div>
                </div>
                <div class="metric-card">
                    <div class="metric-val cyan">${data.total_platforms || list.length}</div>
                    <div class="metric-lbl">TOTAL SCANNED</div>
                </div>
            </div>

            <div class="filter-bar">
                <button class="filter-btn active" data-filter="all">ALL (${list.length})</button>
                <button class="filter-btn" data-filter="found">FOUND (${found.length})</button>
                <button class="filter-btn" data-filter="not_found">NOT FOUND (${notFound.length})</button>
                <input type="text" class="filter-search" placeholder="Filter 112+ networks...">
            </div>

            <div class="platform-grid" id="username-platform-grid">
                ${renderPlatformCards(list)}
            </div>
        `;
    }

    function renderPlatformCards(items) {
        if (!items || items.length === 0) {
            return '<div class="info-item full-span" style="text-align:center;color:var(--text-muted);padding:24px;">No matching networks discovered.</div>';
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
                playBeep('click');
            });
        });

        if (filterSearch) {
            filterSearch.addEventListener('input', (e) => {
                currentSearchQuery = e.target.value.toLowerCase().trim();
                applyFilters();
            });
        }
    }

    function buildDorksView(data, query) {
        const categories = data.categories || [];
        const catCards = categories.map(cat => {
            const dorkItems = (cat.dorks || []).map(d => `
                <div class="dork-item-box">
                    <div class="dork-item-top">
                        <span class="dork-title">${esc(d.title)}</span>
                        <div class="dork-links">
                            <a href="${esc(d.google_url)}" target="_blank" rel="noopener" class="dork-btn google">
                                <i class="fa-brands fa-google"></i> Google
                            </a>
                            <a href="${esc(d.duckduckgo_url)}" target="_blank" rel="noopener" class="dork-btn ddg">
                                <i class="fa-solid fa-duck"></i> DuckDuckGo
                            </a>
                        </div>
                    </div>
                    <div class="dork-query-text">${esc(d.query)}</div>
                </div>
            `).join('');

            return `
                <div class="dork-category-card">
                    <div class="dork-category-header">
                        <i class="fas ${esc(cat.icon || 'fa-folder')}"></i>
                        <span>${esc(cat.category)}</span>
                    </div>
                    <div class="dork-category-body">
                        ${dorkItems}
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="results-meta-bar">
                <div class="results-title"><i class="fas fa-fire-flame-curved"></i> TARGET: <strong>${esc(data.target || query)}</strong></div>
                <button class="export-json-btn"><i class="fas fa-file-export"></i> EXPORT_JSON</button>
            </div>

            <div class="stats-metrics-grid">
                <div class="metric-card">
                    <div class="metric-val pink">${data.total_dorks}</div>
                    <div class="metric-lbl">TARGET DORKS</div>
                </div>
                <div class="metric-card">
                    <div class="metric-val cyan">${data.total_categories}</div>
                    <div class="metric-lbl">CATEGORIES</div>
                </div>
                <div class="metric-card">
                    <div class="metric-val green">100%</div>
                    <div class="metric-lbl">PASSIVE RECON</div>
                </div>
                <div class="metric-card">
                    <div class="metric-val yellow">DIRECT</div>
                    <div class="metric-lbl">1-CLICK LAUNCH</div>
                </div>
            </div>

            ${catCards}
        `;
    }

    function buildDiscordView(data, query) {
        return `
            <div class="results-meta-bar">
                <div class="results-title"><i class="fa-brands fa-discord"></i> SNOWFLAKE: <strong>${esc(data.id || query)}</strong></div>
                <button class="export-json-btn"><i class="fas fa-file-export"></i> EXPORT_JSON</button>
            </div>

            <div class="discord-profile-banner">
                <img src="${esc(data.avatar_url)}" alt="Avatar" class="discord-avatar-large" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                <div class="discord-user-info">
                    <h3>${esc(data.global_name)}</h3>
                    <div class="tag">@${esc(data.username)}</div>
                </div>
            </div>

            <div class="stats-metrics-grid">
                <div class="metric-card">
                    <div class="metric-val purple">${data.account_age_years} yrs</div>
                    <div class="metric-lbl">ACCOUNT AGE</div>
                </div>
                <div class="metric-card">
                    <div class="metric-val cyan">${data.account_age_days} days</div>
                    <div class="metric-lbl">REGISTRATION DAYS</div>
                </div>
                <div class="metric-card">
                    <div class="metric-val green">${data.bot ? 'BOT' : 'USER'}</div>
                    <div class="metric-lbl">ENTITY TYPE</div>
                </div>
                <div class="metric-card">
                    <div class="metric-val yellow">${data.snowflake_metadata.worker_id} / ${data.snowflake_metadata.process_id}</div>
                    <div class="metric-lbl">WORKER / PROCESS</div>
                </div>
            </div>

            <div class="data-grid-two">
                ${infoBox('Exact Registration Timestamp', data.created_at, true, true)}
                ${infoBox('Discord Snowflake ID', data.id)}
                ${infoBox('Unix Epoch Timestamp (ms)', data.created_timestamp)}
                ${infoBox('Internal Sequence Increment', data.snowflake_metadata.increment)}
                ${infoBox('Avatar URL', data.avatar_url, true, false, true)}
            </div>
        `;
    }

    function buildIPView(data, query) {
        const flag = data.countryCode ? getFlagEmoji(data.countryCode) : '🌐';
        return `
            <div class="results-meta-bar">
                <div class="results-title"><i class="fas fa-network-wired"></i> IP_REPORT: <strong>${esc(data.query || query)}</strong></div>
                <button class="export-json-btn"><i class="fas fa-file-export"></i> EXPORT_JSON</button>
            </div>
            <div class="data-grid-two">
                ${infoBox('IP Address', data.query || query, true, true)}
                ${infoBox('Geographic Country', `${flag} ${data.country || 'N/A'} (${data.countryCode || 'N/A'})`)}
                ${infoBox('Region / City', `${data.regionName || 'N/A'}, ${data.city || 'N/A'} (${data.zip || 'N/A'})`)}
                ${infoBox('Coordinates', `${data.lat ?? 'N/A'}, ${data.lon ?? 'N/A'}`)}
                ${infoBox('Timezone', `${data.timezone || 'N/A'} (UTC ${data.offset ? (data.offset / 3600) + 'h' : '0'})`)}
                ${infoBox('ISP / Organization', `${data.isp || 'N/A'} // ${data.org || 'N/A'}`)}
                ${infoBox('Autonomous System', `${data.as || 'N/A'} (${data.asname || 'N/A'})`)}
                ${infoBox('Reverse DNS PTR', data.reverse_dns || data.reverse || 'None', false, false, true)}
                ${infoBox('Proxy / VPN Status', data.proxy ? 'FLAGGED (PROXY / VPN)' : 'CLEAN (DIRECT)', false, data.proxy)}
                ${infoBox('Hosting Network', data.hosting ? 'YES (DATACENTER / VPS)' : 'RESIDENTIAL', false, false)}
            </div>
        `;
    }

    function buildBGPView(data, query) {
        return `
            <div class="results-meta-bar">
                <div class="results-title"><i class="fas fa-diagram-project"></i> BGP_ASN: <strong>${esc(data.asn || query)}</strong></div>
                <button class="export-json-btn"><i class="fas fa-file-export"></i> EXPORT_JSON</button>
            </div>

            <div class="stats-metrics-grid">
                <div class="metric-card">
                    <div class="metric-val green">${data.total_announced_prefixes}</div>
                    <div class="metric-lbl">ANNOUNCED CIDR</div>
                </div>
                <div class="metric-card">
                    <div class="metric-val cyan">${data.prefixes_v4_count}</div>
                    <div class="metric-lbl">IPV4 PREFIXES</div>
                </div>
                <div class="metric-card">
                    <div class="metric-val purple">${data.prefixes_v6_count}</div>
                    <div class="metric-lbl">IPV6 PREFIXES</div>
                </div>
                <div class="metric-card">
                    <div class="metric-val yellow">RIPE</div>
                    <div class="metric-lbl">DATA FEED</div>
                </div>
            </div>

            <div class="data-grid-two">
                ${infoBox('Autonomous System Number', data.asn, false, true)}
                ${infoBox('Resource Name', data.resource || 'N/A')}
                ${infoBox('Network Owner / Holder', data.holder || 'N/A', true, false, true)}
                ${infoBox('HE Looking Glass', `<a href="${esc(data.looking_glass_url)}" target="_blank" rel="noopener" style="color:var(--neon-cyan);">${esc(data.looking_glass_url)}</a>`, true)}
            </div>

            <div class="sub-header"><i class="fas fa-network-wired"></i> Announced CIDR Prefixes (Sample)</div>
            <div class="intel-code-box">${(data.sample_prefixes && data.sample_prefixes.length > 0) ? data.sample_prefixes.map(p => `• ${esc(p)}`).join('\n') : 'No active CIDR prefixes'}</div>
        `;
    }

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

        return `
            <div class="results-meta-bar">
                <div class="results-title"><i class="fas fa-at"></i> TARGET: <strong>${esc(data.email || query)}</strong></div>
                <button class="export-json-btn"><i class="fas fa-file-export"></i> EXPORT_JSON</button>
            </div>
            <div class="data-grid-two">
                ${infoBox('Handle', data.handle || 'N/A')}
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

    function buildDomainView(data, query) {
        const w = data.whois || {};
        const subdomains = data.subdomains || [];

        return `
            <div class="results-meta-bar">
                <div class="results-title"><i class="fas fa-globe"></i> TARGET: <strong>${esc(data.domain || query)}</strong></div>
                <button class="export-json-btn"><i class="fas fa-file-export"></i> EXPORT_JSON</button>
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
        `;
    }

    function buildPhoneView(data, query) {
        const fmt = data.formatted || {};
        return `
            <div class="results-meta-bar">
                <div class="results-title"><i class="fas fa-phone-volume"></i> TARGET: <strong>${esc(data.input || query)}</strong></div>
                <button class="export-json-btn"><i class="fas fa-file-export"></i> EXPORT_JSON</button>
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

        return `
            <div class="results-meta-bar">
                <div class="results-title"><i class="fas fa-shield-virus"></i> TARGET: <strong>${esc(data.url || query)}</strong></div>
                <button class="export-json-btn"><i class="fas fa-file-export"></i> EXPORT_JSON</button>
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
        `;
    }

    function buildHashView(data, query) {
        return `
            <div class="results-meta-bar">
                <div class="results-title"><i class="fas fa-key"></i> TARGET: <strong>${esc(data.hash || query)}</strong></div>
                <button class="export-json-btn"><i class="fas fa-file-export"></i> EXPORT_JSON</button>
            </div>

            <div class="stats-metrics-grid">
                <div class="metric-card">
                    <div class="metric-val green">${data.length} chars</div>
                    <div class="metric-lbl">HASH LENGTH</div>
                </div>
                <div class="metric-card">
                    <div class="metric-val cyan">${data.is_hex ? 'HEX' : 'BASE64'}</div>
                    <div class="metric-lbl">ENCODING</div>
                </div>
                <div class="metric-card">
                    <div class="metric-val yellow">${data.entropy}</div>
                    <div class="metric-lbl">ENTROPY</div>
                </div>
                <div class="metric-card">
                    <div class="metric-val purple">${data.possible_algorithms.length}</div>
                    <div class="metric-lbl">MATCHES</div>
                </div>
            </div>

            <div class="sub-header"><i class="fas fa-fingerprint"></i> Primary Algorithm Match</div>
            <div class="info-item full-span" style="background:rgba(0,255,157,0.08);border-color:var(--neon-green);padding:14px;">
                <div style="font-size:0.65rem;color:var(--neon-green);font-family:var(--font-mono);font-weight:800;">CONFIRMED HIGH PROBABILITY</div>
                <div style="font-size:1.3rem;font-weight:800;color:#fff;margin-top:2px;">${esc(data.primary_match)}</div>
            </div>

            <div class="sub-header"><i class="fas fa-list"></i> Candidate Algorithms</div>
            <div class="intel-code-box">${data.possible_algorithms.map(a => `• ${esc(a)}`).join('\n')}</div>
        `;
    }

    // =========================================================
    //  UI UTILITIES
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
                    <span>PROBING // ${esc(target)}</span>
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
                <i class="fas fa-triangle-exclamation" style="margin-right:8px;"></i>
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
        showToast(`Exported ${filename}`, 'success');
        playBeep('success');
    }

    function showToast(msg, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `hud-toast ${type}`;
        toast.textContent = msg;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(20px)';
            toast.style.transition = 'all 0.2s ease';
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 200);
        }, 2600);
    }

    function initClock() {
        const clock = document.getElementById('hud-clock');
        if (!clock) return;
        function update() {
            const now = new Date();
            clock.textContent = now.toUTCString().split(' ')[4] + ' UTC';
        }
        setInterval(update, 1000);
        update();
    }

    function appendLog(text) {
        const logBox = document.getElementById('telemetry-log');
        if (!logBox) return;
        const now = new Date();
        const timeStr = now.toTimeString().split(' ')[0];
        const line = document.createElement('div');
        line.className = 'log-line';
        line.innerHTML = `<span class="log-ts">[${timeStr}]</span> ${esc(text)}`;
        logBox.appendChild(line);
        logBox.scrollTop = logBox.scrollHeight;
    }

    // ---- Recent Target History Engine (localStorage) ----
    function saveTargetHistory(module, target) {
        try {
            let history = JSON.parse(localStorage.getItem('spectre_history') || '[]');
            history = history.filter(h => !(h.module === module && h.target === target));
            history.unshift({ module, target, ts: Date.now() });
            if (history.length > 10) history = history.slice(0, 10);
            localStorage.setItem('spectre_history', JSON.stringify(history));
            loadTargetHistory();
        } catch (e) {}
    }

    function loadTargetHistory() {
        const box = document.getElementById('recent-targets-box');
        if (!box) return;
        try {
            const history = JSON.parse(localStorage.getItem('spectre_history') || '[]');
            if (history.length === 0) {
                box.innerHTML = '<div class="empty-history">No past engagements</div>';
                return;
            }
            box.innerHTML = history.map(item => `
                <div class="target-pill" data-module="${esc(item.module)}" data-target="${esc(item.target)}">
                    <i class="fas fa-angle-right"></i>
                    <span>${esc(item.target)}</span>
                </div>
            `).join('');

            box.querySelectorAll('.target-pill').forEach(pill => {
                pill.addEventListener('click', () => {
                    const mod = pill.getAttribute('data-module');
                    const trg = pill.getAttribute('data-target');
                    switchTab(mod);
                    const input = document.getElementById(`input-${mod}`);
                    if (input) {
                        input.value = trg;
                        const btn = document.querySelector(`.hud-scan-btn[data-module="${mod}"]`);
                        if (btn) btn.click();
                    }
                });
            });
        } catch (e) {}
    }

    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', () => {
            localStorage.removeItem('spectre_history');
            loadTargetHistory();
            showToast('Target history cleared', 'info');
            playBeep('click');
        });
    }

    // =========================================================
    //  INTERACTIVE CYBER CONSTELLATION CANVAS
    // =========================================================
    function initCyberCanvas() {
        const canvas = document.getElementById('cyber-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let width, height;
        let particles = [];

        function resize() {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
        }
        window.addEventListener('resize', resize);
        resize();

        for (let i = 0; i < 45; i++) {
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 0.4,
                vy: (Math.random() - 0.5) * 0.4,
                radius: Math.random() * 2 + 1
            });
        }

        let mouseX = -1000, mouseY = -1000;
        window.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        });

        // Click shockwave
        window.addEventListener('click', (e) => {
            particles.forEach(p => {
                const dx = p.x - e.clientX;
                const dy = p.y - e.clientY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 150) {
                    const force = (150 - dist) / 150;
                    p.vx += (dx / dist) * force * 4;
                    p.vy += (dy / dist) * force * 4;
                }
            });
        });

        function animate() {
            ctx.clearRect(0, 0, width, height);

            // Update and draw particles
            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                p.x += p.vx;
                p.y += p.vy;

                // Friction
                p.vx *= 0.98;
                p.vy *= 0.98;

                // Edge wrap
                if (p.x < 0) p.x = width;
                if (p.x > width) p.x = 0;
                if (p.y < 0) p.y = height;
                if (p.y > height) p.y = 0;

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0, 255, 157, 0.4)';
                ctx.fill();

                // Connect nearby particles with laser grid lines
                for (let j = i + 1; j < particles.length; j++) {
                    const p2 = particles[j];
                    const dx = p.x - p2.x;
                    const dy = p.y - p2.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < 130) {
                        ctx.beginPath();
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.strokeStyle = `rgba(0, 229, 255, ${0.15 * (1 - dist / 130)})`;
                        ctx.lineWidth = 0.8;
                        ctx.stroke();
                    }
                }

                // Connect to mouse
                const mdx = p.x - mouseX;
                const mdy = p.y - mouseY;
                const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
                if (mdist < 140) {
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(mouseX, mouseY);
                    ctx.strokeStyle = `rgba(0, 255, 157, ${0.25 * (1 - mdist / 140)})`;
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            }

            requestAnimationFrame(animate);
        }

        animate();
    }
});
