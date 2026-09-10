/* ==========================================================================
   SPECTRE OSINT CONSOLE — MULTI-MODE TACTICAL JAVASCRIPT (V6.0)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // ---- Global State ----
    let currentMode = 'omni';
    let currentTheme = localStorage.getItem('spectre-theme') || 'onyx';
    let visNetwork = null;
    let visNodes = null;
    let visEdges = null;

    // ---- Elements ----
    const modeTabs = document.querySelectorAll('.mode-tab');
    const viewPanels = document.querySelectorAll('.view-panel');
    const themeBtns = document.querySelectorAll('.theme-btn');
    const systemClock = document.getElementById('system-clock');
    const toastContainer = document.getElementById('toast-container');

    // Omni Mode Elements
    const omniInput = document.getElementById('omni-input');
    const btnRunOmni = document.getElementById('btn-run-omni');
    const omniResultsStage = document.getElementById('omni-results-stage');
    const samplePills = document.querySelectorAll('.qt-pill');

    // Vectors Mode Elements
    const vectorBtns = document.querySelectorAll('.vector-btn');
    const vpanels = document.querySelectorAll('.vpanel');

    // CLI Shell Elements
    const cliScreen = document.getElementById('cli-screen');
    const cliInput = document.getElementById('cli-cmd-input');
    const btnCliClear = document.getElementById('btn-cli-clear');

    // Topology Elements
    const btnTopoFit = document.getElementById('btn-topo-fit');
    const btnTopoClear = document.getElementById('btn-topo-clear');

    // Apply Saved Theme
    applyTheme(currentTheme);

    // Initialize System Clock
    function updateClock() {
        if (!systemClock) return;
        const now = new Date();
        systemClock.textContent = now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    }
    setInterval(updateClock, 1000);
    updateClock();

    // ==========================================================================
    // THEME SWITCHING
    // ==========================================================================
    themeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const theme = btn.getAttribute('data-theme');
            applyTheme(theme);
        });
    });

    function applyTheme(theme) {
        currentTheme = theme;
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('spectre-theme', theme);
        themeBtns.forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-theme') === theme);
        });
        if (visNetwork) buildTopologyFromDossier('SPECTRE', {});
    }

    // ==========================================================================
    // MODE SWITCHING
    // ==========================================================================
    modeTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const mode = tab.getAttribute('data-mode');
            switchMode(mode);
        });
    });

    function switchMode(mode) {
        currentMode = mode;
        modeTabs.forEach(t => t.classList.toggle('active', t.getAttribute('data-mode') === mode));
        viewPanels.forEach(p => p.classList.toggle('active', p.id === `view-${mode}`));

        if (mode === 'terminal' && cliInput) {
            cliInput.focus();
        } else if (mode === 'topology' && visNetwork) {
            setTimeout(() => visNetwork.fit(), 100);
        }
    }

    // ==========================================================================
    // MODE 1: OMNI DOSSIER ENGINE
    // ==========================================================================
    if (btnRunOmni) {
        btnRunOmni.addEventListener('click', () => {
            const target = omniInput.value.trim();
            if (!target) {
                showToast('Enter a target entity to scan', 'error');
                omniInput.focus();
                return;
            }
            executeOmniRecon(target);
        });
    }

    if (omniInput) {
        omniInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                btnRunOmni.click();
            }
        });
    }

    samplePills.forEach(pill => {
        pill.addEventListener('click', () => {
            const val = pill.getAttribute('data-val');
            if (omniInput) {
                omniInput.value = val;
                executeOmniRecon(val);
            }
        });
    });

    async function executeOmniRecon(target) {
        setBtnLoading(btnRunOmni, true);
        omniResultsStage.innerHTML = `
            <div class="placeholder-dossier" style="border-style: solid; border-color: var(--accent-primary);">
                <div style="font-family: var(--font-mono); font-size: 1rem; color: var(--accent-primary); font-weight: 700; margin-bottom: 8px;">
                    <i class="fas fa-spinner fa-spin"></i> CASCADING OMNI RECONNAISSANCE PIPELINE...
                </div>
                <div class="placeholder-text">Executing auto-classifier -> Probing live socket pools -> Aggregating security dossier.</div>
            </div>
        `;

        const startTime = performance.now();
        try {
            const res = await fetch(`/api/omni?target=${encodeURIComponent(target)}`);
            const json = await res.json();
            const elapsed = Math.round(performance.now() - startTime);

            if (!res.ok || json.error) {
                renderOmniError(json.error || 'Failed to generate dossier.', elapsed);
            } else {
                const data = json.data || {};
                renderOmniDossier(target, data.detected_type || 'Entity', data.dossier || {}, elapsed);
                buildTopologyFromDossier(target, data.dossier || {});
                showToast(`Dossier Compiled (${elapsed}ms)`, 'success');
            }
        } catch (err) {
            const elapsed = Math.round(performance.now() - startTime);
            renderOmniError(`Pipeline connection failure: ${err.message}`, elapsed);
        } finally {
            setBtnLoading(btnRunOmni, false);
        }
    }

    function renderOmniError(msg, elapsed) {
        omniResultsStage.innerHTML = `
            <div class="placeholder-dossier" style="border-color: var(--accent-rose);">
                <div style="font-family: var(--font-mono); font-size: 1rem; color: var(--accent-rose); font-weight: 700; margin-bottom: 8px;">
                    <i class="fas fa-triangle-exclamation"></i> DOSSIER GENERATION FAILED [${elapsed}ms]
                </div>
                <div class="placeholder-text" style="color: var(--accent-rose);">${escapeHtml(msg)}</div>
            </div>
        `;
    }

    function renderOmniDossier(target, detectedType, dossier, elapsed) {
        let sectionsHtml = '';

        // 1. IP / BGP Intel
        if (dossier.ip) {
            const ip = dossier.ip;
            sectionsHtml += `
                <div class="intel-section">
                    <div class="intel-section-header">
                        <span class="intel-section-title"><i class="fas fa-satellite-dish"></i> IP & NETWORK TELEMETRY</span>
                        <span class="dossier-badge">${escapeHtml(ip.query || target)}</span>
                    </div>
                    <div class="intel-section-body">
                        <div class="dossier-stat-grid">
                            <div class="stat-item-box">
                                <div class="stat-item-label">Geolocation</div>
                                <div class="stat-item-val">${escapeHtml(ip.city || '')}, ${escapeHtml(ip.country || '')}</div>
                            </div>
                            <div class="stat-item-box">
                                <div class="stat-item-label">ISP Network</div>
                                <div class="stat-item-val" style="font-size:0.9rem;">${escapeHtml(ip.isp || 'N/A')}</div>
                            </div>
                            <div class="stat-item-box">
                                <div class="stat-item-label">Classification</div>
                                <div class="stat-item-val" style="color:${ip.hosting ? 'var(--accent-primary)' : 'var(--accent-emerald)'};">
                                    ${ip.hosting ? 'DATACENTER' : (ip.proxy ? 'PROXY' : 'RESIDENTIAL')}
                                </div>
                            </div>
                            <div class="stat-item-box">
                                <div class="stat-item-label">Autonomous System</div>
                                <div class="stat-item-val" style="font-size:0.85rem; color:var(--accent-cyan);">${escapeHtml(ip.as || ip.asn || 'N/A')}</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        // 2. Domain / WHOIS / CT
        if (dossier.domain) {
            const dom = dossier.domain;
            const subs = dom.subdomains || [];
            sectionsHtml += `
                <div class="intel-section">
                    <div class="intel-section-header">
                        <span class="intel-section-title"><i class="fas fa-globe"></i> DOMAIN & CT LOG SUBDOMAINS</span>
                        <span class="dossier-badge">${subs.length} SUBDOMAINS</span>
                    </div>
                    <div class="intel-section-body">
                        <div class="dossier-stat-grid">
                            <div class="stat-item-box">
                                <div class="stat-item-label">Registrar</div>
                                <div class="stat-item-val" style="font-size:0.9rem;">${escapeHtml(dom.registrar || dom.whois?.registrar || 'N/A')}</div>
                            </div>
                            <div class="stat-item-box">
                                <div class="stat-item-label">Discovered Endpoints</div>
                                <div class="stat-item-val" style="color:var(--accent-cyan);">${subs.length}</div>
                            </div>
                        </div>
                        ${subs.length > 0 ? `
                            <div class="tactical-table-scroll">
                                <table class="tactical-table">
                                    <thead><tr><th>Endpoint</th><th>Discovery Engine</th></tr></thead>
                                    <tbody>
                                        ${subs.slice(0, 15).map(s => `<tr><td><code>${escapeHtml(s)}</code></td><td><span style="color:var(--accent-emerald);">CERTIFICATE TRANSPARENCY</span></td></tr>`).join('')}
                                    </tbody>
                                </table>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }

        // 3. Google Dorks
        if (dossier.dorks) {
            const cats = dossier.dorks.categories || {};
            let dorkItems = '';
            for (const [k, v] of Object.entries(cats)) {
                (v.queries || []).slice(0, 3).forEach(q => {
                    const url = `https://www.google.com/search?q=${encodeURIComponent(q.dork)}`;
                    dorkItems += `
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--border-glass);">
                            <div>
                                <span style="font-size:0.75rem; color:var(--text-dim); display:block;">${escapeHtml(q.purpose || k)}</span>
                                <code style="font-size:0.8rem; color:var(--text-main);">${escapeHtml(q.dork)}</code>
                            </div>
                            <a href="${url}" target="_blank" rel="noopener noreferrer" class="link-recon" style="font-size:0.75rem; white-space:nowrap;">
                                Launch <i class="fas fa-external-link"></i>
                            </a>
                        </div>
                    `;
                });
            }
            sectionsHtml += `
                <div class="intel-section">
                    <div class="intel-section-header">
                        <span class="intel-section-title"><i class="fas fa-brain"></i> PASSIVE GOOGLE DORKS</span>
                    </div>
                    <div class="intel-section-body">${dorkItems}</div>
                </div>
            `;
        }

        // 4. Username Scan
        if (dossier.username) {
            const u = dossier.username;
            const found = u.found || [];
            sectionsHtml += `
                <div class="intel-section">
                    <div class="intel-section-header">
                        <span class="intel-section-title"><i class="fas fa-user-astronaut"></i> USERNAME DISCOVERY (112+ PLATFORMS)</span>
                        <span class="dossier-badge" style="color:var(--accent-emerald);">${found.length} PROFILES FOUND</span>
                    </div>
                    <div class="intel-section-body">
                        <div class="tactical-table-scroll">
                            <table class="tactical-table">
                                <thead><tr><th>Platform</th><th>Profile Endpoint</th><th>Status</th></tr></thead>
                                <tbody>
                                    ${found.map(f => `
                                        <tr>
                                            <td><strong>${escapeHtml(f.platform)}</strong></td>
                                            <td><a href="${escapeHtml(f.url)}" target="_blank" class="link-recon">${escapeHtml(f.url)}</a></td>
                                            <td><span style="color:var(--accent-emerald); font-weight:700;">CONFIRMED</span></td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        }

        // 5. Discord Snowflake
        if (dossier.discord) {
            const dc = dossier.discord;
            sectionsHtml += `
                <div class="intel-section">
                    <div class="intel-section-header">
                        <span class="intel-section-title"><i class="fa-brands fa-discord"></i> DISCORD SNOWFLAKE DECODER</span>
                    </div>
                    <div class="intel-section-body">
                        <div class="dossier-stat-grid">
                            <div class="stat-item-box">
                                <div class="stat-item-label">Created Epoch</div>
                                <div class="stat-item-val" style="font-size:0.95rem; color:var(--accent-primary);">${escapeHtml(dc.created_at || 'N/A')}</div>
                            </div>
                            <div class="stat-item-box">
                                <div class="stat-item-label">Account Age</div>
                                <div class="stat-item-val" style="color:var(--accent-emerald);">${escapeHtml(String(dc.account_age_days ? dc.account_age_days + ' days' : 'N/A'))}</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        // 6. Cryptographic Hash
        if (dossier.hash) {
            const h = dossier.hash;
            const matches = h.possible_types || h.matches || [];
            sectionsHtml += `
                <div class="intel-section">
                    <div class="intel-section-header">
                        <span class="intel-section-title"><i class="fas fa-fingerprint"></i> CRYPTOGRAPHIC HASH IDENTIFICATION</span>
                    </div>
                    <div class="intel-section-body">
                        <div class="dossier-stat-grid">
                            <div class="stat-item-box">
                                <div class="stat-item-label">Primary Candidate</div>
                                <div class="stat-item-val" style="color:var(--accent-emerald);">${escapeHtml(matches[0] || 'Unknown')}</div>
                            </div>
                            <div class="stat-item-box">
                                <div class="stat-item-label">Entropy</div>
                                <div class="stat-item-val" style="color:var(--accent-cyan);">${escapeHtml(String(h.entropy || 'N/A'))}</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        omniResultsStage.innerHTML = `
            <div class="dossier-wrapper">
                <div class="dossier-meta-card">
                    <div>
                        <div class="dossier-target-title">
                            <span>${escapeHtml(target)}</span>
                            <span class="dossier-badge">${escapeHtml(detectedType.toUpperCase())}</span>
                        </div>
                        <div style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-dim); margin-top:4px;">
                            Compiled in ${elapsed}ms // SPECTRE Multi-Vector Core
                        </div>
                    </div>
                    <div class="dossier-actions">
                        <button class="btn-dossier-action" id="btn-export-dossier"><i class="fas fa-download"></i> Export JSON</button>
                        <button class="btn-dossier-action" id="btn-pivot-graph"><i class="fas fa-network-wired"></i> View Topology</button>
                    </div>
                </div>
                ${sectionsHtml}
            </div>
        `;

        const exportBtn = document.getElementById('btn-export-dossier');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                const blob = new Blob([JSON.stringify(dossier, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `spectre-dossier-${target}-${Date.now()}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast('Dossier Exported', 'success');
            });
        }

        const pivotGraphBtn = document.getElementById('btn-pivot-graph');
        if (pivotGraphBtn) {
            pivotGraphBtn.addEventListener('click', () => {
                switchMode('topology');
            });
        }
    }

    // ==========================================================================
    // MODE 2: DEDICATED INDIVIDUAL VECTORS
    // ==========================================================================
    vectorBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const vtab = btn.getAttribute('data-vtab');
            vectorBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-vtab') === vtab));
            vpanels.forEach(p => p.classList.toggle('active', p.id === `vpanel-${vtab}`));
            const input = document.getElementById(`v-input-${vtab}`);
            if (input) input.focus();
        });
    });

    document.querySelectorAll('.btn-v-scan').forEach(btn => {
        btn.addEventListener('click', () => {
            const mod = btn.getAttribute('data-vmod');
            const input = document.getElementById(`v-input-${mod}`);
            const out = document.getElementById(`v-output-${mod}`);
            if (!input || !out) return;
            const val = input.value.trim();
            if (!val) {
                showToast('Enter input query', 'error');
                return;
            }
            executeSingleVector(mod, val, out, btn);
        });
    });

    async function executeSingleVector(moduleName, val, container, triggerBtn) {
        setBtnLoading(triggerBtn, true);
        container.innerHTML = `<div style="font-family:var(--font-mono); color:var(--accent-primary); padding:20px 0;"><i class="fas fa-spinner fa-spin"></i> Querying vector [${moduleName.toUpperCase()}]...</div>`;

        const routes = {
            username: `/api/username?username=${encodeURIComponent(val)}`,
            dorks: `/api/dorks?target=${encodeURIComponent(val)}`,
            discord: `/api/discord?id=${encodeURIComponent(val)}`,
            ip: `/api/ip?ip=${encodeURIComponent(val)}`,
            bgp: `/api/bgp?asn=${encodeURIComponent(val)}`,
            email: `/api/email?email=${encodeURIComponent(val)}`,
            domain: `/api/domain?domain=${encodeURIComponent(val)}`,
            phone: `/api/phone?phone=${encodeURIComponent(val)}`,
            headers: `/api/headers?url=${encodeURIComponent(val)}`,
            hash: `/api/hash?hash=${encodeURIComponent(val)}`
        };

        try {
            const res = await fetch(routes[moduleName]);
            const json = await res.json();
            if (!res.ok || json.error) {
                container.innerHTML = `<div style="font-family:var(--font-mono); color:var(--accent-rose);">${escapeHtml(json.error || 'Vector query failed')}</div>`;
            } else {
                const data = json.data || json;
                container.innerHTML = `<pre style="background:var(--bg-surface); padding:16px; border-radius:6px; border:1px solid var(--border-glass); font-family:var(--font-mono); font-size:0.8rem; overflow:auto; max-height:450px;">${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
                showToast(`Vector [${moduleName}] Scanned`, 'success');
            }
        } catch (err) {
            container.innerHTML = `<div style="font-family:var(--font-mono); color:var(--accent-rose);">${escapeHtml(err.message)}</div>`;
        } finally {
            setBtnLoading(triggerBtn, false);
        }
    }

    // ==========================================================================
    // MODE 3: INTERACTIVE CLI COMMAND SHELL
    // ==========================================================================
    if (cliInput) {
        cliInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const cmd = cliInput.value.trim();
                cliInput.value = '';
                if (!cmd) return;
                handleCliCommand(cmd);
            }
        });
    }

    if (btnCliClear) {
        btnCliClear.addEventListener('click', () => {
            cliScreen.innerHTML = '';
        });
    }

    function printCli(text, type = 'normal') {
        const div = document.createElement('div');
        div.style.marginBottom = '4px';
        if (type === 'prompt') {
            div.style.color = 'var(--accent-primary)';
            div.style.fontWeight = '700';
        } else if (type === 'error') {
            div.style.color = 'var(--accent-rose)';
        } else if (type === 'success') {
            div.style.color = 'var(--accent-emerald)';
        } else if (type === 'cyan') {
            div.style.color = 'var(--accent-cyan)';
        } else {
            div.style.color = 'var(--text-main)';
        }
        div.innerHTML = text;
        cliScreen.appendChild(div);
        cliScreen.scrollTop = cliScreen.scrollHeight;
    }

    async function handleCliCommand(rawCmd) {
        printCli(`spectre@root $ ${escapeHtml(rawCmd)}`, 'prompt');
        const parts = rawCmd.split(' ').filter(Boolean);
        const action = parts[0].toLowerCase();
        const arg = parts.slice(1).join(' ');

        switch (action) {
            case 'help':
                printCli(`
<b>AVAILABLE SPECTRE OSINT COMMANDS:</b>
  recon &lt;target&gt;      Run autonomous multi-vector intelligence pipeline
  user &lt;username&gt;     Probe 112+ social networks for username existence
  ip &lt;address&gt;        Resolve IP geolocation, ISP, and ASN routing
  domain &lt;domain&gt;     Inspect domain WHOIS and CT log subdomains
  dork &lt;keyword&gt;      Generate passive Google search recon queries
  discord &lt;id&gt;        Decode 64-bit Discord Snowflake creation timestamp
  hash &lt;hash&gt;         Identify cryptographic hash algorithm and entropy
  email &lt;email&gt;       Check MX hosts and SPF/DMARC mail compliance
  phone &lt;number&gt;      Lookup phone carrier and E.164 validity
  theme &lt;name&gt;        Switch UI theme: 'onyx', 'matrix', 'cyan', 'mono'
  clear               Clear terminal window buffer
  matrix              Run phosphor stream simulation
                `, 'cyan');
                break;

            case 'clear':
                cliScreen.innerHTML = '';
                break;

            case 'theme':
                if (['onyx', 'matrix', 'cyan', 'monolith', 'mono'].includes(arg.toLowerCase())) {
                    const t = arg.toLowerCase() === 'mono' ? 'monolith' : arg.toLowerCase();
                    applyTheme(t);
                    printCli(`Theme switched to: ${t.toUpperCase()}`, 'success');
                } else {
                    printCli(`Unknown theme. Choose from: onyx, matrix, cyan, mono`, 'error');
                }
                break;

            case 'matrix':
                printCli('Streaming quantum entropy packets...', 'success');
                for (let i = 0; i < 5; i++) {
                    const hex = Array.from({length: 8}, () => Math.floor(Math.random()*16).toString(16)).join('');
                    printCli(`[0x${hex}] RECON_SOCKET_ACK -> 0x${hex.toUpperCase()}`, 'cyan');
                }
                break;

            case 'recon':
            case 'scan':
                if (!arg) {
                    printCli('Usage: recon <target>', 'error');
                    return;
                }
                printCli(`Initiating Omni Recon on: ${escapeHtml(arg)}...`, 'cyan');
                try {
                    const res = await fetch(`/api/omni?target=${encodeURIComponent(arg)}`);
                    const json = await res.json();
                    if (json.data) {
                        printCli(`[SUCCESS] Classified as: ${json.data.detected_type.toUpperCase()}`, 'success');
                        printCli(`<pre style="color:var(--text-muted); font-size:0.75rem;">${escapeHtml(JSON.stringify(json.data.dossier, null, 2))}</pre>`);
                    } else {
                        printCli(`[ERROR] ${json.error || 'Query failed'}`, 'error');
                    }
                } catch (e) {
                    printCli(`Network error: ${e.message}`, 'error');
                }
                break;

            case 'user':
            case 'ip':
            case 'domain':
            case 'dork':
            case 'discord':
            case 'hash':
            case 'email':
            case 'phone':
                if (!arg) {
                    printCli(`Usage: ${action} <target>`, 'error');
                    return;
                }
                const routeMap = {
                    user: `/api/username?username=${encodeURIComponent(arg)}`,
                    ip: `/api/ip?ip=${encodeURIComponent(arg)}`,
                    domain: `/api/domain?domain=${encodeURIComponent(arg)}`,
                    dork: `/api/dorks?target=${encodeURIComponent(arg)}`,
                    discord: `/api/discord?id=${encodeURIComponent(arg)}`,
                    hash: `/api/hash?hash=${encodeURIComponent(arg)}`,
                    email: `/api/email?email=${encodeURIComponent(arg)}`,
                    phone: `/api/phone?phone=${encodeURIComponent(arg)}`
                };
                printCli(`Probing ${action}...`, 'cyan');
                try {
                    const res = await fetch(routeMap[action]);
                    const json = await res.json();
                    printCli(`<pre style="color:var(--text-muted); font-size:0.75rem;">${escapeHtml(JSON.stringify(json.data || json, null, 2))}</pre>`);
                } catch (e) {
                    printCli(`Network error: ${e.message}`, 'error');
                }
                break;

            default:
                printCli(`Command not found: ${escapeHtml(action)}. Type 'help' for valid commands.`, 'error');
        }
    }

    // ==========================================================================
    // MODE 4: FULLSCREEN TOPOLOGY GRAPH (VIS.JS)
    // ==========================================================================
    function buildTopologyFromDossier(target, dossier) {
        const container = document.getElementById('topology-canvas-full');
        if (!container) return;

        const nodes = [
            { id: 'target', label: target, color: '#f59e0b', font: { color: '#ffffff', size: 16, face: 'Fira Code' }, shape: 'box' }
        ];
        const edges = [];

        if (dossier.ip) {
            nodes.push({ id: 'ip_node', label: `IP: ${dossier.ip.query || target}`, color: '#10b981', font: { color: '#fff', size: 12 }, shape: 'ellipse' });
            edges.push({ from: 'target', to: 'ip_node', color: { color: '#10b981' } });
            if (dossier.ip.isp) {
                nodes.push({ id: 'isp_node', label: `ISP: ${dossier.ip.isp}`, color: '#06b6d4', font: { color: '#fff', size: 10 }, shape: 'dot', size: 8 });
                edges.push({ from: 'ip_node', to: 'isp_node', color: { color: '#06b6d4' } });
            }
        }

        if (dossier.domain && dossier.domain.subdomains) {
            dossier.domain.subdomains.slice(0, 15).forEach((s, i) => {
                const subId = `sub_${i}`;
                nodes.push({ id: subId, label: s, color: '#06b6d4', font: { color: '#fff', size: 10 }, shape: 'dot', size: 8 });
                edges.push({ from: 'target', to: subId, color: { color: '#06b6d4' } });
            });
        }

        if (dossier.username && dossier.username.found) {
            dossier.username.found.slice(0, 20).forEach((f, i) => {
                const uId = `usr_${i}`;
                nodes.push({ id: uId, label: f.platform, color: '#10b981', font: { color: '#fff', size: 11 }, shape: 'dot', size: 10 });
                edges.push({ from: 'target', to: uId, color: { color: '#10b981' } });
            });
        }

        visNodes = new vis.DataSet(nodes);
        visEdges = new vis.DataSet(edges);

        const options = {
            nodes: { borderWidth: 1 },
            edges: { width: 1.5, smooth: { type: 'continuous' } },
            physics: {
                solver: 'forceAtlas2Based',
                forceAtlas2Based: { gravitationalConstant: -40, centralGravity: 0.01, springLength: 100 }
            }
        };

        visNetwork = new vis.Network(container, { nodes: visNodes, edges: visEdges }, options);
    }

    if (btnTopoFit) btnTopoFit.addEventListener('click', () => visNetwork && visNetwork.fit());
    if (btnTopoClear) btnTopoClear.addEventListener('click', () => buildTopologyFromDossier('SPECTRE', {}));

    // Helpers
    function setBtnLoading(btn, isLoading) {
        if (!btn) return;
        if (isLoading) {
            btn.disabled = true;
            btn.dataset.origText = btn.innerHTML;
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i><span>SCANNING...</span>`;
        } else {
            btn.disabled = false;
            if (btn.dataset.origText) btn.innerHTML = btn.dataset.origText;
        }
    }

    function showToast(message, type = 'info') {
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = 'toast';
        const color = type === 'success' ? 'var(--accent-emerald)' : (type === 'error' ? 'var(--accent-rose)' : 'var(--accent-primary)');
        toast.style.borderColor = color;
        toast.innerHTML = `<i class="fas fa-circle-notch fa-spin" style="color:${color};"></i><span>${escapeHtml(message)}</span>`;
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
