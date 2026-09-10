/* ==========================================================================
   SPECTRE OSINT COMMAND APPARATUS — TACTICAL HUD COCKPIT JS (V7.0)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // ---- System State ----
    let activeVector = 'omni';
    let activeStage = 'dossier';
    let audioEnabled = true;
    let audioCtx = null;
    let visNetwork = null;
    let miniMap = null;
    let currentPayload = null;

    // ---- DOM Elements ----
    const vectorBtns = document.querySelectorAll('.v-btn');
    const stageTabs = document.querySelectorAll('.stage-tab');
    const targetInput = document.getElementById('target-input');
    const btnEngage = document.getElementById('btn-engage');
    const vectorHeading = document.getElementById('current-vector-heading');
    const utcClock = document.getElementById('utc-clock');
    const resultsContainer = document.getElementById('results-container');
    const emptySlate = document.getElementById('empty-slate');
    const rawJsonViewer = document.getElementById('raw-json-viewer');
    const telemetryStream = document.getElementById('telemetry-log-stream');
    const historyContainer = document.getElementById('history-container');
    const geoMapPod = document.getElementById('geo-map-pod');
    const geoTargetLabel = document.getElementById('geo-target-label');
    const toastDeck = document.getElementById('toast-deck');
    const audioToggleBtn = document.getElementById('audio-toggle');
    const audioIcon = document.getElementById('audio-icon');
    const audioLabel = document.getElementById('audio-label');

    // Preset & Modal
    const presetTags = document.querySelectorAll('.preset-tag');
    const btnCmdK = document.getElementById('btn-cmd-k');
    const cmdModal = document.getElementById('cmd-modal');
    const cmdInput = document.getElementById('cmd-input-field');
    const cmdRows = document.querySelectorAll('.cmd-row');

    // Quick Arsenal
    const btnQuickSweep = document.getElementById('btn-quick-sweep');
    const btnQuickExport = document.getElementById('btn-quick-export-dossier');
    const btnQuickDorks = document.getElementById('btn-quick-dorks');
    const btnQuickTest = document.getElementById('btn-quick-test');
    const btnClearLogs = document.getElementById('btn-clear-logs');
    const btnClearHist = document.getElementById('btn-clear-history');
    const btnCopyRaw = document.getElementById('btn-copy-raw');
    const btnGraphFit = document.getElementById('btn-graph-fit');
    const btnGraphReset = document.getElementById('btn-graph-reset');

    const VECTOR_CONFIG = {
        omni:     { name: '00 // OMNI_RECON_MATRIX', placeholder: 'ENTER TARGET (ANY ENTITY: USERNAME, IP, DOMAIN, EMAIL, HASH)...' },
        username: { name: '01 // USERNAME_ENUMERATOR', placeholder: 'ENTER USERNAME (e.g. shadow, neo, root)...' },
        dorks:    { name: '02 // GOOGLE_DORK_MATRIX', placeholder: 'ENTER TARGET DOMAIN OR ORG (e.g. tesla.com)...' },
        discord:  { name: '03 // DISCORD_SNOWFLAKE', placeholder: 'ENTER 64-BIT DISCORD ID (e.g. 155149108183695360)...' },
        ip:       { name: '04 // IP_GEO_AND_MAP', placeholder: 'ENTER IPV4 / IPV6 (e.g. 1.1.1.1, 8.8.8.8)...' },
        bgp:      { name: '05 // BGP_ROUTING_AND_ASN', placeholder: 'ENTER ASN (e.g. AS15169, AS13335)...' },
        email:    { name: '06 // EMAIL_DNS_SECURITY', placeholder: 'ENTER EMAIL (target@domain.com)...' },
        domain:   { name: '07 // DOMAIN_AND_CT_LOG', placeholder: 'ENTER DOMAIN (e.g. github.com, apple.com)...' },
        phone:    { name: '08 // TELCO_AND_CARRIER', placeholder: 'ENTER PHONE NUMBER (+14155552671)...' },
        headers:  { name: '09 // HTTP_SECURITY_AUDIT', placeholder: 'ENTER FULL URL (https://example.com)...' },
        hash:     { name: '10 // HASH_CLASSIFIER', placeholder: 'ENTER CRYPTOGRAPHIC HASH STRING...' }
    };

    // ---- Initialize Background Radar Canvas ----
    initRadarCanvas();
    initClock();

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

    // ---- Tactical Web Audio Sound Engine ----
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
                osc.frequency.setValueAtTime(900, now);
                osc.frequency.exponentialRampToValueAtTime(300, now + 0.04);
                gain.gain.setValueAtTime(0.06, now);
                gain.gain.linearRampToValueAtTime(0.001, now + 0.04);
                osc.start(now);
                osc.stop(now + 0.04);
            } else if (type === 'engage') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.exponentialRampToValueAtTime(1400, now + 0.12);
                gain.gain.setValueAtTime(0.12, now);
                gain.gain.linearRampToValueAtTime(0.001, now + 0.12);
                osc.start(now);
                osc.stop(now + 0.12);
            } else if (type === 'success') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(520, now);
                osc.frequency.setValueAtTime(880, now + 0.08);
                gain.gain.setValueAtTime(0.08, now);
                gain.gain.linearRampToValueAtTime(0.001, now + 0.18);
                osc.start(now);
                osc.stop(now + 0.18);
            } else if (type === 'error') {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(220, now);
                osc.frequency.setValueAtTime(140, now + 0.1);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.linearRampToValueAtTime(0.001, now + 0.2);
                osc.start(now);
                osc.stop(now + 0.2);
            }
        } catch (e) {}
    }

    if (audioToggleBtn) {
        audioToggleBtn.addEventListener('click', () => {
            audioEnabled = !audioEnabled;
            if (audioEnabled) {
                audioIcon.className = 'fas fa-volume-high';
                audioLabel.textContent = 'AUDIO: ON';
                audioToggleBtn.style.color = 'var(--accent-cyan)';
                playBeep('click');
            } else {
                audioIcon.className = 'fas fa-volume-xmark';
                audioLabel.textContent = 'AUDIO: OFF';
                audioToggleBtn.style.color = 'var(--text-dim)';
            }
        });
    }

    // ---- Logging Utility ----
    function logKernel(text, type = 'info') {
        if (!telemetryStream) return;
        const now = new Date().toISOString().slice(11, 19);
        const div = document.createElement('div');
        div.className = `t-log ${type}`;
        div.innerHTML = `<span class="t-ts">[${now}]</span> ${escapeHtml(text)}`;
        telemetryStream.appendChild(div);
        telemetryStream.scrollTop = telemetryStream.scrollHeight;
    }

    if (btnClearLogs) {
        btnClearLogs.addEventListener('click', () => {
            telemetryStream.innerHTML = '';
            logKernel('Kernel telemetry buffer cleared.', 'info');
            playBeep('click');
        });
    }

    // ---- Vector Switching ----
    vectorBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const v = btn.getAttribute('data-v');
            setVector(v);
        });
    });

    function setVector(v) {
        playBeep('click');
        activeVector = v;
        vectorBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-v') === v));
        const cfg = VECTOR_CONFIG[v] || VECTOR_CONFIG.omni;
        if (vectorHeading) vectorHeading.textContent = cfg.name;
        if (targetInput) {
            targetInput.placeholder = cfg.placeholder;
            targetInput.focus();
        }
        logKernel(`Switched weapon vector to: [${v.toUpperCase()}]`, 'info');
    }

    // ---- Stage Switching ----
    stageTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const stage = tab.getAttribute('data-stage');
            setStage(stage);
        });
    });

    function setStage(stage) {
        playBeep('click');
        activeStage = stage;
        stageTabs.forEach(t => t.classList.toggle('active', t.getAttribute('data-stage') === stage));
        document.querySelectorAll('.stage-screen').forEach(s => s.classList.toggle('active', s.id === `screen-${stage}`));

        if (stage === 'graph' && visNetwork) {
            setTimeout(() => visNetwork.fit(), 80);
        }
    }

    // ---- Target Presets ----
    presetTags.forEach(tag => {
        tag.addEventListener('click', () => {
            const inputVal = tag.getAttribute('data-input');
            const v = tag.getAttribute('data-v') || 'omni';
            setVector(v);
            if (targetInput) {
                targetInput.value = inputVal;
                btnEngage.click();
            }
        });
    });

    // ---- History Item Click ----
    if (historyContainer) {
        historyContainer.addEventListener('click', (e) => {
            const item = e.target.closest('.history-item');
            if (item) {
                const t = item.getAttribute('data-target');
                const v = item.getAttribute('data-vector') || 'omni';
                setVector(v);
                if (targetInput) {
                    targetInput.value = t;
                    btnEngage.click();
                }
            }
        });
    }

    if (btnClearHist) {
        btnClearHist.addEventListener('click', () => {
            if (historyContainer) historyContainer.innerHTML = '<div style="font-family:var(--font-mono); font-size:0.7rem; color:var(--text-dim); padding:6px;">History cleared.</div>';
            playBeep('click');
        });
    }

    // ---- Engagement Trigger ----
    if (targetInput) {
        targetInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                btnEngage.click();
            }
        });
    }

    if (btnEngage) {
        btnEngage.addEventListener('click', () => {
            const raw = targetInput.value.trim();
            if (!raw) {
                showToast('Target input cannot be empty', 'error');
                playBeep('error');
                targetInput.focus();
                return;
            }
            executeEngagement(raw);
        });
    }

    // ---- Execution Engine ----
    async function executeEngagement(target) {
        playBeep('engage');
        setEngageLoading(true);
        emptySlate.style.display = 'none';
        resultsContainer.style.display = 'block';

        resultsContainer.innerHTML = `
            <div class="empty-cockpit-slate" style="border:1px solid var(--accent-cyan); box-shadow:0 0 30px rgba(0,240,255,0.15);">
                <div class="crosshair-lens" style="border-color:var(--accent-cyan);">
                    <i class="fas fa-radar fa-spin lens-icon" style="color:var(--accent-cyan);"></i>
                </div>
                <div class="slate-title" style="color:var(--accent-cyan);">PULSING LIVE RECONNAISSANCE PROBES...</div>
                <div class="slate-sub">Target: <code style="color:#ffffff; font-weight:700;">${escapeHtml(target)}</code> // Probing 112 multi-threaded platform sockets.</div>
            </div>
        `;

        logKernel(`ENGAGE: Target [${target}] on vector [${activeVector.toUpperCase()}]`, 'warn');

        const startTime = performance.now();
        let endpoint = `/api/omni?target=${encodeURIComponent(target)}`;
        if (activeVector !== 'omni') {
            const paramMap = {
                username: 'username', dorks: 'target', discord: 'id', ip: 'ip',
                bgp: 'asn', email: 'email', domain: 'domain', phone: 'phone',
                headers: 'url', hash: 'hash'
            };
            endpoint = `/api/${activeVector}?${paramMap[activeVector] || 'target'}=${encodeURIComponent(target)}`;
        }

        try {
            const res = await fetch(endpoint);
            const json = await res.json();
            const elapsed = Math.round(performance.now() - startTime);

            if (!res.ok || json.error) {
                const err = json.error || 'Engagement query failed.';
                renderEngagementError(err, elapsed, target);
                logKernel(`[FAILURE] ${err}`, 'err');
                playBeep('error');
                showToast(`Scan Failed: ${err}`, 'error');
            } else {
                currentPayload = json;
                if (rawJsonViewer) rawJsonViewer.textContent = JSON.stringify(json, null, 2);

                if (activeVector === 'omni') {
                    const data = json.data || {};
                    renderOmniCockpit(target, data.detected_type || 'entity', data.dossier || {}, elapsed);
                    buildTopologyGraph(target, data.dossier || {});
                } else {
                    const payload = (json && json.data !== undefined) ? json.data : json;
                    renderVectorCockpit(activeVector, target, payload, elapsed);
                    const mockDossier = {};
                    mockDossier[activeVector] = payload;
                    buildTopologyGraph(target, mockDossier);
                }

                addHistoryRecord(target, activeVector);
                logKernel(`[SUCCESS] Weapon [${activeVector.toUpperCase()}] engaged. Response: ${elapsed}ms`, 'ok');
                playBeep('success');
                showToast(`Recon Complete in ${elapsed}ms`, 'success');
            }
        } catch (err) {
            const elapsed = Math.round(performance.now() - startTime);
            renderEngagementError(`Network timeout: ${err.message}`, elapsed, target);
            logKernel(`[NETWORK_ERR] ${err.message}`, 'err');
            playBeep('error');
        } finally {
            setEngageLoading(false);
        }
    }

    function setEngageLoading(isLoading) {
        if (!btnEngage) return;
        if (isLoading) {
            btnEngage.disabled = true;
            btnEngage.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>PULSING...</span>`;
        } else {
            btnEngage.disabled = false;
            btnEngage.innerHTML = `<span class="btn-glow-bar"></span><i class="fas fa-bolt"></i> <span>ENGAGE RECON</span> <kbd>↵</kbd>`;
        }
    }

    function renderEngagementError(msg, elapsed, target) {
        resultsContainer.innerHTML = `
            <div class="empty-cockpit-slate" style="border:1px solid var(--accent-red); background:rgba(255,42,95,0.04);">
                <div class="crosshair-lens" style="border-color:var(--accent-red);">
                    <i class="fas fa-triangle-exclamation lens-icon" style="color:var(--accent-red);"></i>
                </div>
                <div class="slate-title" style="color:var(--accent-red);">RECONNAISSANCE ANOMALY [${elapsed}ms]</div>
                <div class="slate-sub" style="color:var(--accent-red); font-family:var(--font-mono);">${escapeHtml(msg)}</div>
            </div>
        `;
    }

    // ==========================================================================
    // COCKPIT RESULTS RENDERERS
    // ==========================================================================
    function renderOmniCockpit(target, detectedType, dossier, elapsed) {
        let deckHtml = `
            <div class="dossier-deck">
                <div class="dossier-hero-card">
                    <div>
                        <div class="hero-target-text">
                            <i class="fas fa-crosshairs" style="color:var(--accent-cyan);"></i>
                            <span>${escapeHtml(target)}</span>
                            <span class="hero-type-badge">${escapeHtml(detectedType.toUpperCase())}</span>
                        </div>
                        <div style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-dim); margin-top:4px;">
                            Autonomous Multithreaded Cascade // ${elapsed}ms execution
                        </div>
                    </div>
                    <div class="hero-actions">
                        <button class="btn-hero-action" id="btn-export-json"><i class="fas fa-download"></i> EXPORT JSON</button>
                        <button class="btn-hero-action" id="btn-switch-to-graph"><i class="fas fa-circle-nodes"></i> TOPOLOGY</button>
                    </div>
                </div>
        `;

        // 1. IP Telemetry
        if (dossier.ip) {
            const ip = dossier.ip;
            if (ip.lat && ip.lon) mountMiniMap(ip.lat, ip.lon, ip.city, ip.country, ip.query || target);
            deckHtml += `
                <div class="dossier-section">
                    <div class="dossier-section-head">
                        <span class="dossier-section-title"><i class="fas fa-satellite-dish"></i> IP & GEOLOCATION TELEMETRY</span>
                        <span style="font-family:var(--font-mono); font-size:0.7rem; color:var(--accent-cyan);">${escapeHtml(ip.query || target)}</span>
                    </div>
                    <div class="dossier-section-body">
                        <div class="metric-hud-grid">
                            <div class="metric-hud-box">
                                <span class="metric-hud-lbl">Location</span>
                                <span class="metric-hud-val">${escapeHtml(ip.city || '')}, ${escapeHtml(ip.country || '')} (${escapeHtml(ip.countryCode || '--')})</span>
                            </div>
                            <div class="metric-hud-box">
                                <span class="metric-hud-lbl">ISP Network</span>
                                <span class="metric-hud-val" style="font-size:0.9rem;">${escapeHtml(ip.isp || 'N/A')}</span>
                            </div>
                            <div class="metric-hud-box">
                                <span class="metric-hud-lbl">Routing ASN</span>
                                <span class="metric-hud-val" style="color:var(--accent-purple); font-size:0.85rem;">${escapeHtml(ip.as || ip.asn || 'N/A')}</span>
                            </div>
                            <div class="metric-hud-box">
                                <span class="metric-hud-lbl">Classification</span>
                                <span class="metric-hud-val" style="color:${ip.hosting ? 'var(--accent-amber)' : 'var(--accent-green)'};">
                                    ${ip.hosting ? 'DATACENTER' : (ip.proxy ? 'PROXY' : 'RESIDENTIAL')}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        // 2. Domain & Subdomains
        if (dossier.domain) {
            const dom = dossier.domain;
            const subs = dom.subdomains || [];
            deckHtml += `
                <div class="dossier-section">
                    <div class="dossier-section-head">
                        <span class="dossier-section-title"><i class="fas fa-globe"></i> DOMAIN WHOIS & CT SUBDOMAINS</span>
                        <span style="font-family:var(--font-mono); font-size:0.7rem; color:var(--accent-cyan);">${subs.length} DISCOVERED</span>
                    </div>
                    <div class="dossier-section-body">
                        <div class="metric-hud-grid">
                            <div class="metric-hud-box">
                                <span class="metric-hud-lbl">Registrar</span>
                                <span class="metric-hud-val" style="font-size:0.85rem;">${escapeHtml(dom.registrar || dom.whois?.registrar || 'N/A')}</span>
                            </div>
                            <div class="metric-hud-box">
                                <span class="metric-hud-lbl">Subdomain Endpoints</span>
                                <span class="metric-hud-val" style="color:var(--accent-cyan);">${subs.length}</span>
                            </div>
                        </div>
                        ${subs.length > 0 ? `
                            <div class="hud-table-wrapper">
                                <table class="hud-table">
                                    <thead><tr><th>Discovered Subdomain</th><th>Intelligence Source</th></tr></thead>
                                    <tbody>
                                        ${subs.slice(0, 15).map(s => `<tr><td><code>${escapeHtml(s)}</code></td><td><span style="color:var(--accent-green); font-weight:700;">CERTIFICATE TRANSPARENCY</span></td></tr>`).join('')}
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
            deckHtml += `
                <div class="dossier-section">
                    <div class="dossier-section-head">
                        <span class="dossier-section-title"><i class="fas fa-user-astronaut"></i> USERNAME PLATFORM MATRIX</span>
                        <span style="font-family:var(--font-mono); font-size:0.7rem; color:var(--accent-green);">${found.length} PROFILES FOUND</span>
                    </div>
                    <div class="dossier-section-body">
                        <div class="hud-table-wrapper">
                            <table class="hud-table">
                                <thead><tr><th>Platform</th><th>Endpoint</th><th>Status</th></tr></thead>
                                <tbody>
                                    ${found.map(f => `
                                        <tr>
                                            <td><strong style="color:#ffffff;">${escapeHtml(f.platform)}</strong></td>
                                            <td><a href="${escapeHtml(f.url)}" target="_blank" rel="noopener noreferrer" class="link-hud">${escapeHtml(f.url)}</a></td>
                                            <td><span style="color:var(--accent-green); font-weight:800;">CONFIRMED</span></td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        }

        // 4. Google Dorks
        if (dossier.dorks) {
            const cats = dossier.dorks.categories || {};
            let dorkItems = '';
            for (const [k, v] of Object.entries(cats)) {
                (v.queries || []).slice(0, 3).forEach(q => {
                    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(q.dork)}`;
                    dorkItems += `
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--border-subtle);">
                            <div style="flex:1; min-width:0;">
                                <span style="font-size:0.7rem; color:var(--text-dim);">${escapeHtml(q.purpose || k)}</span>
                                <code style="display:block; font-size:0.78rem; color:var(--text-main);">${escapeHtml(q.dork)}</code>
                            </div>
                            <a href="${searchUrl}" target="_blank" rel="noopener noreferrer" class="link-hud" style="font-size:0.75rem; white-space:nowrap;">
                                <i class="fas fa-external-link"></i> Launch
                            </a>
                        </div>
                    `;
                });
            }
            deckHtml += `
                <div class="dossier-section">
                    <div class="dossier-section-head">
                        <span class="dossier-section-title"><i class="fas fa-brain"></i> PASSIVE GOOGLE DORKS</span>
                    </div>
                    <div class="dossier-section-body">${dorkItems}</div>
                </div>
            `;
        }

        deckHtml += `</div>`;
        resultsContainer.innerHTML = deckHtml;
        bindDossierActions(target, dossier);
    }

    function renderVectorCockpit(vector, target, payload, elapsed) {
        let contentHtml = `
            <div class="dossier-deck">
                <div class="dossier-hero-card">
                    <div>
                        <div class="hero-target-text">
                            <i class="fas fa-crosshairs" style="color:var(--accent-cyan);"></i>
                            <span>${escapeHtml(target)}</span>
                            <span class="hero-type-badge">${escapeHtml(vector.toUpperCase())}</span>
                        </div>
                        <div style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-dim); margin-top:4px;">
                            Executed in ${elapsed}ms // Isolated Vector
                        </div>
                    </div>
                    <div class="hero-actions">
                        <button class="btn-hero-action" id="btn-export-json"><i class="fas fa-download"></i> EXPORT JSON</button>
                    </div>
                </div>
        `;

        if (vector === 'username') {
            const found = payload.found || [];
            contentHtml += `
                <div class="dossier-section">
                    <div class="dossier-section-head">
                        <span class="dossier-section-title">PROBE RESULTS (${found.length} DETECTED)</span>
                    </div>
                    <div class="dossier-section-body">
                        <div class="hud-table-wrapper">
                            <table class="hud-table">
                                <thead><tr><th>Platform</th><th>Endpoint</th><th>Detection</th></tr></thead>
                                <tbody>
                                    ${found.map(f => `<tr><td><strong>${escapeHtml(f.platform)}</strong></td><td><a href="${escapeHtml(f.url)}" target="_blank" class="link-hud">${escapeHtml(f.url)}</a></td><td><span style="color:var(--accent-green); font-weight:700;">FOUND</span></td></tr>`).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        } else if (vector === 'ip') {
            if (payload.lat && payload.lon) mountMiniMap(payload.lat, payload.lon, payload.city, payload.country, payload.query || target);
            contentHtml += `
                <div class="dossier-section">
                    <div class="dossier-section-head">
                        <span class="dossier-section-title">IP INTELLIGENCE</span>
                    </div>
                    <div class="dossier-section-body">
                        <div class="metric-hud-grid">
                            <div class="metric-hud-box"><span class="metric-hud-lbl">City</span><span class="metric-hud-val">${escapeHtml(payload.city || 'N/A')}</span></div>
                            <div class="metric-hud-box"><span class="metric-hud-lbl">Country</span><span class="metric-hud-val">${escapeHtml(payload.country || 'N/A')}</span></div>
                            <div class="metric-hud-box"><span class="metric-hud-lbl">ASN</span><span class="metric-hud-val" style="color:var(--accent-purple); font-size:0.85rem;">${escapeHtml(payload.as || payload.asn || 'N/A')}</span></div>
                            <div class="metric-hud-box"><span class="metric-hud-lbl">ISP</span><span class="metric-hud-val" style="font-size:0.85rem;">${escapeHtml(payload.isp || 'N/A')}</span></div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            contentHtml += `
                <div class="dossier-section">
                    <div class="dossier-section-head"><span class="dossier-section-title">DATA PAYLOAD</span></div>
                    <div class="dossier-section-body">
                        <pre style="font-family:var(--font-mono); font-size:0.8rem; color:var(--text-main); overflow:auto; max-height:450px;">${escapeHtml(JSON.stringify(payload, null, 2))}</pre>
                    </div>
                </div>
            `;
        }

        contentHtml += `</div>`;
        resultsContainer.innerHTML = contentHtml;
        bindDossierActions(target, payload);
    }

    function bindDossierActions(target, payload) {
        const exportBtn = document.getElementById('btn-export-json');
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
                showToast('Intelligence Payload Exported', 'success');
                playBeep('click');
            });
        }

        const switchGraphBtn = document.getElementById('btn-switch-to-graph');
        if (switchGraphBtn) {
            switchGraphBtn.addEventListener('click', () => setStage('graph'));
        }
    }

    // ==========================================================================
    // MINI LEAFLET DARK MAP
    // ==========================================================================
    function mountMiniMap(lat, lon, city, country, ip) {
        if (!geoMapPod) return;
        geoMapPod.style.display = 'block';
        if (geoTargetLabel) geoTargetLabel.textContent = `${city || ''}, ${country || ''}`;

        if (miniMap) {
            miniMap.remove();
            miniMap = null;
        }

        miniMap = L.map('mini-leaflet-map', {
            zoomControl: false,
            attributionControl: false
        }).setView([lat, lon], 9);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19
        }).addTo(miniMap);

        const customIcon = L.divIcon({
            className: 'custom-pin',
            html: `<div style="width:12px; height:12px; background:#00f0ff; border-radius:50%; box-shadow:0 0 10px #00f0ff, 0 0 20px #00f0ff;"></div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6]
        });

        L.marker([lat, lon], { icon: customIcon }).addTo(miniMap);
    }

    // ==========================================================================
    // VIS.JS NETWORK TOPOLOGY
    // ==========================================================================
    function buildTopologyGraph(target, dossier) {
        const container = document.getElementById('vis-network-stage');
        if (!container) return;

        const nodes = [
            { id: 'target', label: target, color: '#00f0ff', font: { color: '#ffffff', size: 16, face: 'Chakra Petch' }, shape: 'box' }
        ];
        const edges = [];

        if (dossier.ip) {
            nodes.push({ id: 'node_ip', label: `IP: ${dossier.ip.query || target}`, color: '#00ff66', font: { color: '#ffffff', size: 12 }, shape: 'ellipse' });
            edges.push({ from: 'target', to: 'node_ip', color: { color: '#00ff66' } });
            if (dossier.ip.isp) {
                nodes.push({ id: 'node_isp', label: dossier.ip.isp, color: '#2563eb', font: { color: '#ffffff', size: 10 }, shape: 'dot', size: 8 });
                edges.push({ from: 'node_ip', to: 'node_isp', color: { color: '#2563eb' } });
            }
        }

        if (dossier.domain && dossier.domain.subdomains) {
            dossier.domain.subdomains.slice(0, 15).forEach((s, idx) => {
                const subId = `sub_${idx}`;
                nodes.push({ id: subId, label: s, color: '#00f0ff', font: { color: '#ffffff', size: 10 }, shape: 'dot', size: 8 });
                edges.push({ from: 'target', to: subId, color: { color: '#00f0ff', opacity: 0.5 } });
            });
        }

        if (dossier.username && dossier.username.found) {
            dossier.username.found.slice(0, 20).forEach((f, idx) => {
                const uId = `usr_${idx}`;
                nodes.push({ id: uId, label: f.platform, color: '#00ff66', font: { color: '#ffffff', size: 11 }, shape: 'dot', size: 10 });
                edges.push({ from: 'target', to: uId, color: { color: '#00ff66', opacity: 0.6 } });
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
    if (btnGraphReset) btnGraphReset.addEventListener('click', () => buildTopologyGraph('SPECTRE', {}));

    // ==========================================================================
    // QUICK ARSENAL & COMMAND PALETTE
    // ==========================================================================
    if (btnQuickSweep) {
        btnQuickSweep.addEventListener('click', () => {
            playBeep('click');
            resultsContainer.style.display = 'none';
            emptySlate.style.display = 'flex';
            if (targetInput) targetInput.value = '';
            showToast('Recon Cockpit Swept Clean', 'info');
        });
    }

    if (btnQuickExport) {
        btnQuickExport.addEventListener('click', () => {
            if (!currentPayload) {
                showToast('No active reconnaissance payload', 'error');
                playBeep('error');
                return;
            }
            const blob = new Blob([JSON.stringify(currentPayload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `spectre-dossier-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('Dossier Downloaded', 'success');
            playBeep('click');
        });
    }

    if (btnQuickDorks) {
        btnQuickDorks.addEventListener('click', () => {
            setVector('dorks');
            if (targetInput && targetInput.value) btnEngage.click();
        });
    }

    if (btnQuickTest) {
        btnQuickTest.addEventListener('click', () => {
            logKernel('Ping test socket dispatch: OK 200', 'ok');
            playBeep('success');
            showToast('Socket Health: 100% Operational', 'success');
        });
    }

    if (btnCopyRaw && rawJsonViewer) {
        btnCopyRaw.addEventListener('click', () => {
            navigator.clipboard.writeText(rawJsonViewer.textContent).then(() => {
                showToast('JSON copied to clipboard', 'info');
                playBeep('click');
            });
        });
    }

    // Command Palette Modal (Cmd+K)
    function openCmdModal() {
        if (!cmdModal) return;
        cmdModal.style.display = 'flex';
        cmdInput.value = '';
        cmdInput.focus();
        filterCmd('');
        playBeep('click');
    }

    function closeCmdModal() {
        if (!cmdModal) return;
        cmdModal.style.display = 'none';
    }

    if (btnCmdK) btnCmdK.addEventListener('click', openCmdModal);
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            if (cmdModal.style.display === 'none' || !cmdModal.style.display) {
                openCmdModal();
            } else {
                closeCmdModal();
            }
        } else if (e.key === 'Escape') {
            closeCmdModal();
        }
    });

    if (cmdModal) {
        cmdModal.addEventListener('click', (e) => {
            if (e.target === cmdModal) closeCmdModal();
        });
    }

    if (cmdInput) {
        cmdInput.addEventListener('input', (e) => filterCmd(e.target.value.toLowerCase().trim()));
    }

    function filterCmd(q) {
        cmdRows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(q) ? 'flex' : 'none';
        });
    }

    cmdRows.forEach(row => {
        row.addEventListener('click', () => {
            const v = row.getAttribute('data-v');
            if (v) {
                setVector(v);
                closeCmdModal();
            }
        });
    });

    // History Helper
    function addHistoryRecord(target, vector) {
        if (!historyContainer) return;
        const item = document.createElement('div');
        item.className = 'history-item';
        item.setAttribute('data-target', target);
        item.setAttribute('data-vector', vector);
        item.innerHTML = `<span class="hist-type">${vector.toUpperCase().slice(0, 4)}</span><span class="hist-val">${escapeHtml(target)}</span>`;
        historyContainer.insertBefore(item, historyContainer.firstChild);
    }

    // Toast Deck
    function showToast(msg, type = 'info') {
        if (!toastDeck) return;
        const toast = document.createElement('div');
        toast.className = 'hud-toast';
        const icon = type === 'success' ? 'fa-circle-check' : (type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info');
        const color = type === 'success' ? 'var(--accent-green)' : (type === 'error' ? 'var(--accent-red)' : 'var(--accent-cyan)');
        toast.style.borderColor = color;
        toast.innerHTML = `<i class="fas ${icon}" style="color:${color};"></i><span>${escapeHtml(msg)}</span>`;
        toastDeck.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(6px)';
            toast.style.transition = 'all 0.2s ease';
            setTimeout(() => toast.remove(), 200);
        }, 2800);
    }

    // Background Canvas Radar Particles
    function initRadarCanvas() {
        const canvas = document.getElementById('radar-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let width = canvas.width = window.innerWidth;
        let height = canvas.height = window.innerHeight;

        window.addEventListener('resize', () => {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
        });

        const particles = Array.from({ length: 45 }, () => ({
            x: Math.random() * width,
            y: Math.random() * height,
            vx: (Math.random() - 0.5) * 0.3,
            vy: (Math.random() - 0.5) * 0.3,
            size: Math.random() * 2 + 1
        }));

        function draw() {
            ctx.clearRect(0, 0, width, height);

            // Subtle Grid
            ctx.strokeStyle = 'rgba(0, 240, 255, 0.03)';
            ctx.lineWidth = 1;
            const step = 60;
            for (let x = 0; x < width; x += step) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.stroke();
            }
            for (let y = 0; y < height; y += step) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                ctx.stroke();
            }

            // Particles
            ctx.fillStyle = 'rgba(0, 240, 255, 0.4)';
            particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                if (p.x < 0) p.x = width;
                if (p.x > width) p.x = 0;
                if (p.y < 0) p.y = height;
                if (p.y > height) p.y = 0;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            });

            requestAnimationFrame(draw);
        }
        draw();
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
