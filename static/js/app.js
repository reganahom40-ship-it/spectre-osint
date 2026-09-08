/* ============================================
   SPECTRE OSINT PLATFORM — FRONTEND JS
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

    // ---- State ----
    let currentModule = 'username';
    let lastResults = {};

    // ---- DOM refs ----
    const tabs = document.querySelectorAll('.tab');
    const panels = document.querySelectorAll('.panel');
    const scanBtns = document.querySelectorAll('.scan-btn');
    const toastContainer = document.getElementById('toast-container');

    // ---- Tab Switching ----
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            tabs.forEach(t => t.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`panel-${target}`).classList.add('active');
            currentModule = target;
        });
    });

    // ---- Scan Buttons ----
    scanBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const mod = btn.dataset.module;
            const input = document.getElementById(`input-${mod}`);
            const val = input.value.trim();
            if (!val) {
                showToast('Enter a value to scan', 'error');
                input.focus();
                return;
            }
            runScan(mod, val, btn);
        });
    });

    // ---- Enter Key ----
    document.querySelectorAll('.scan-input').forEach(input => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const mod = input.id.replace('input-', '');
                const btn = document.querySelector(`.scan-btn[data-module="${mod}"]`);
                if (btn && !btn.disabled) {
                    btn.click();
                }
            }
        });
    });

    // ---- API Config ----
    const API_MAP = {
        username: { endpoint: '/api/username', key: 'username' },
        ip:       { endpoint: '/api/ip',       key: 'ip' },
        email:    { endpoint: '/api/email',    key: 'email' },
        domain:   { endpoint: '/api/domain',   key: 'domain' },
        phone:    { endpoint: '/api/phone',    key: 'phone' },
        headers:  { endpoint: '/api/headers',  key: 'url' }
    };

    // ---- Run Scan ----
    async function runScan(module, value, btn) {
        const resultsDiv = document.getElementById(`results-${module}`);
        const api = API_MAP[module];
        const origHTML = btn.innerHTML;

        // UI: loading state
        btn.disabled = true;
        btn.classList.add('scanning');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> SCANNING...';
        resultsDiv.innerHTML = getLoadingHTML();

        try {
            const body = {};
            body[api.key] = value;

            const resp = await fetch(api.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const json = await resp.json();

            if (json.success) {
                lastResults[module] = { query: value, data: json.data, timestamp: json.timestamp };
                renderResults(module, json.data, value);
                showToast(`${module.toUpperCase()} scan complete`, 'success');
            } else {
                resultsDiv.innerHTML = getErrorHTML(json.error || 'Unknown error');
                showToast(json.error || 'Scan failed', 'error');
            }
        } catch (err) {
            resultsDiv.innerHTML = getErrorHTML('Connection error: ' + err.message);
            showToast('Network error', 'error');
        } finally {
            btn.disabled = false;
            btn.classList.remove('scanning');
            btn.innerHTML = origHTML;
        }
    }

    // ---- Render Router ----
    function renderResults(module, data, query) {
        const container = document.getElementById(`results-${module}`);
        let html = '';
        switch (module) {
            case 'username': html = renderUsername(data, query); break;
            case 'ip':       html = renderIP(data, query); break;
            case 'email':    html = renderEmail(data, query); break;
            case 'domain':   html = renderDomain(data, query); break;
            case 'phone':    html = renderPhone(data, query); break;
            case 'headers':  html = renderHeaders(data, query); break;
        }
        container.innerHTML = html;

        // Bind export buttons
        container.querySelectorAll('.export-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                exportJSON(data, `spectre_${module}_${query}`);
            });
        });
    }

    // ============================================
    //  RENDERERS
    // ============================================

    function renderUsername(data, query) {
        const found = (data.results || []).filter(r => r.status === 'found');
        const notFound = (data.results || []).filter(r => r.status === 'not_found');
        const errors = (data.results || []).filter(r => r.status === 'error');

        let html = `
            <div class="results-header">
                <span class="results-title"><i class="fas fa-user-secret"></i> Results for "${esc(query)}"</span>
                <button class="export-btn"><i class="fas fa-download"></i> Export JSON</button>
            </div>
            <div class="stats-bar">
                <div class="stat-box">
                    <div class="stat-value green">${found.length}</div>
                    <div class="stat-label">Found</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value red">${notFound.length}</div>
                    <div class="stat-label">Not Found</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value yellow">${errors.length}</div>
                    <div class="stat-label">Errors</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value cyan">${data.total_platforms || 0}</div>
                    <div class="stat-label">Total</div>
                </div>
            </div>
        `;

        const sorted = [...found, ...notFound, ...errors];
        sorted.forEach(r => {
            const statusClass = r.status === 'found' ? 'status-found' :
                                r.status === 'not_found' ? 'status-not-found' : 'status-error';
            const statusText = r.status === 'found' ? 'FOUND' :
                               r.status === 'not_found' ? 'NOT FOUND' : 'ERROR';
            const urlLink = r.status === 'found'
                ? `<a href="${esc(r.url)}" target="_blank" rel="noopener" class="platform-url">${esc(r.url)}</a>`
                : '';

            html += `
                <div class="result-card">
                    <div class="username-item">
                        <div class="platform-info">
                            <span class="platform-name">${esc(r.platform)}</span>
                            ${urlLink}
                        </div>
                        <span class="status-badge ${statusClass}">${statusText}</span>
                    </div>
                </div>
            `;
        });

        return html;
    }

    function renderIP(data, query) {
        const flag = data.countryCode ? getCountryFlag(data.countryCode) : '';
        const fields = [
            { label: 'IP Address', value: data.query || query, highlight: true },
            { label: 'Country', value: `${flag} ${data.country || 'N/A'}` },
            { label: 'Region', value: data.regionName || 'N/A' },
            { label: 'City', value: data.city || 'N/A' },
            { label: 'ZIP Code', value: data.zip || 'N/A' },
            { label: 'Latitude', value: data.lat ?? 'N/A' },
            { label: 'Longitude', value: data.lon ?? 'N/A' },
            { label: 'Timezone', value: data.timezone || 'N/A' },
            { label: 'ISP', value: data.isp || 'N/A' },
            { label: 'Organization', value: data.org || 'N/A' },
            { label: 'AS Number', value: data.as || 'N/A' },
            { label: 'AS Name', value: data.asname || 'N/A' },
            { label: 'Reverse DNS', value: data.reverse_dns || data.reverse || 'N/A' },
            { label: 'Continent', value: data.continent || 'N/A' },
            { label: 'Mobile', value: data.mobile ? 'Yes' : 'No', bool: data.mobile },
            { label: 'Proxy/VPN', value: data.proxy ? 'Yes' : 'No', bool: data.proxy },
            { label: 'Hosting', value: data.hosting ? 'Yes' : 'No', bool: data.hosting },
            { label: 'Currency', value: data.currency || 'N/A' }
        ];

        let html = `
            <div class="results-header">
                <span class="results-title"><i class="fas fa-network-wired"></i> IP Intelligence Report</span>
                <button class="export-btn"><i class="fas fa-download"></i> Export JSON</button>
            </div>
            <div class="data-grid">
        `;

        fields.forEach(f => {
            const valClass = f.highlight ? 'data-value highlight' :
                             f.bool === true ? 'data-value bool-yes' :
                             f.bool === false ? 'data-value bool-no' : 'data-value';
            html += `
                <div class="data-field">
                    <div class="data-label">${esc(f.label)}</div>
                    <div class="${valClass}">${esc(String(f.value))}</div>
                </div>
            `;
        });

        html += '</div>';
        return html;
    }

    function renderEmail(data, query) {
        let html = `
            <div class="results-header">
                <span class="results-title"><i class="fas fa-envelope"></i> Email Intelligence Report</span>
                <button class="export-btn"><i class="fas fa-download"></i> Export JSON</button>
            </div>
        `;

        // Basic Info
        html += `<h3 class="section-header"><i class="fas fa-info-circle"></i> Email Info</h3>`;
        html += `<div class="data-grid">`;
        html += dataField('Email', data.email || query);
        html += dataField('Handle', data.handle || 'N/A');
        html += dataField('Domain', data.domain || 'N/A');
        html += dataField('Mail Provider', data.mail_provider || 'Unknown');
        html += `</div>`;

        // Gravatar
        if (data.gravatar) {
            html += `<h3 class="section-header"><i class="fas fa-user-circle"></i> Gravatar</h3>`;
            if (data.gravatar.exists) {
                html += `<div class="result-card" style="text-align:center;">
                    <img src="${esc(data.gravatar.url)}" alt="Gravatar" class="gravatar-img">
                    <div style="margin-top:8px;color:var(--accent-green);font-family:var(--font-mono);font-size:0.8rem;">Profile Found</div>
                </div>`;
            } else {
                html += `<div class="result-card"><span style="color:var(--text-muted);">No Gravatar profile found</span></div>`;
            }
        }

        // MX Records
        if (data.mx_records && data.mx_records.length > 0) {
            html += `<h3 class="section-header"><i class="fas fa-exchange-alt"></i> MX Records</h3>`;
            html += `<table class="data-table"><tr><th>Priority</th><th>Mail Server</th></tr>`;
            data.mx_records.forEach(mx => {
                html += `<tr><td><span class="status-badge status-found">${mx.priority}</span></td><td>${esc(mx.server)}</td></tr>`;
            });
            html += `</table>`;
        }

        // Security Records
        html += `<h3 class="section-header"><i class="fas fa-shield-alt"></i> Security Records</h3>`;
        html += `<div class="result-card"><div class="data-label">SPF Record</div><div class="code-block">${esc(data.spf_record || 'Not found')}</div></div>`;
        html += `<div class="result-card"><div class="data-label">DMARC Record</div><div class="code-block">${esc(data.dmarc_record || 'Not found')}</div></div>`;

        // Domain WHOIS
        if (data.domain_whois) {
            html += `<h3 class="section-header"><i class="fas fa-id-card"></i> Domain WHOIS</h3>`;
            html += `<div class="data-grid">`;
            html += dataField('Registrar', data.domain_whois.registrar || 'N/A');
            html += dataField('Created', data.domain_whois.creation_date || 'N/A');
            html += dataField('Expires', data.domain_whois.expiration_date || 'N/A');
            html += `</div>`;
        }

        return html;
    }

    function renderDomain(data, query) {
        let html = `
            <div class="results-header">
                <span class="results-title"><i class="fas fa-globe"></i> Domain Recon Report</span>
                <button class="export-btn"><i class="fas fa-download"></i> Export JSON</button>
            </div>
        `;

        // WHOIS
        if (data.whois) {
            html += `<h3 class="section-header"><i class="fas fa-id-card"></i> WHOIS Information</h3>`;
            html += `<div class="data-grid">`;
            const w = data.whois;
            html += dataField('Registrar', w.registrar || 'N/A');
            html += dataField('Created', formatDate(w.creation_date));
            html += dataField('Expires', formatDate(w.expiration_date));
            if (w.name_servers) {
                const ns = Array.isArray(w.name_servers) ? w.name_servers.join(', ') : w.name_servers;
                html += dataField('Name Servers', ns, true);
            }
            if (w.status) {
                const st = Array.isArray(w.status) ? w.status.join(', ') : w.status;
                html += dataField('Status', st, true);
            }
            if (w.emails) {
                const em = Array.isArray(w.emails) ? w.emails.join(', ') : w.emails;
                html += dataField('Contact', em, true);
            }
            html += `</div>`;
        }

        // DNS Records
        if (data.dns) {
            html += `<h3 class="section-header"><i class="fas fa-project-diagram"></i> DNS Records</h3>`;
            const dnsTypes = ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME', 'SOA'];
            dnsTypes.forEach(type => {
                const records = data.dns[type];
                if (records && records.length > 0) {
                    html += `<div class="result-card"><div class="data-label">${type} Records</div>`;
                    html += `<div class="code-block">${records.map(r => esc(String(r))).join('\n')}</div></div>`;
                }
            });
        }

        // SSL
        if (data.ssl) {
            html += `<h3 class="section-header"><i class="fas fa-lock"></i> SSL Certificate</h3>`;
            html += `<div class="data-grid">`;
            html += dataField('Issuer', data.ssl.issuer || 'N/A');
            html += dataField('Subject', data.ssl.subject || 'N/A');
            html += dataField('Not Before', data.ssl.notBefore || 'N/A');
            html += dataField('Not After', data.ssl.notAfter || 'N/A');
            if (data.ssl.serial_number) html += dataField('Serial', data.ssl.serial_number, true);
            if (data.ssl.subjectAltName) {
                const sans = Array.isArray(data.ssl.subjectAltName) ? data.ssl.subjectAltName.join(', ') : data.ssl.subjectAltName;
                html += dataField('SANs', sans, true);
            }
            html += `</div>`;
        }

        // Subdomains
        if (data.subdomains && data.subdomains.length > 0) {
            html += `<h3 class="section-header"><i class="fas fa-sitemap"></i> Subdomains <span class="count-badge">${data.subdomains.length}</span></h3>`;
            html += `<div class="subdomain-list">`;
            data.subdomains.forEach(s => {
                html += `<div class="subdomain-item">${esc(s)}</div>`;
            });
            html += `</div>`;
        }

        // robots.txt
        if (data.robots_txt) {
            html += `<h3 class="section-header"><i class="fas fa-robot"></i> robots.txt</h3>`;
            html += `<div class="code-block">${esc(data.robots_txt)}</div>`;
        }

        // sitemap
        if (data.sitemap) {
            html += `<h3 class="section-header"><i class="fas fa-map"></i> Sitemap</h3>`;
            html += `<div class="code-block">${esc(data.sitemap)}</div>`;
        }

        return html;
    }

    function renderPhone(data, query) {
        const flag = data.country_code ? getCountryFlag(getCountryCodeFromPhone(data.country_code)) : '';
        let html = `
            <div class="results-header">
                <span class="results-title"><i class="fas fa-phone"></i> Phone Analysis Report</span>
                <button class="export-btn"><i class="fas fa-download"></i> Export JSON</button>
            </div>
            <div class="data-grid">
        `;

        html += dataField('Input', data.input || query);
        html += dataField('Valid', data.valid ? 'Yes' : 'No');
        html += dataField('Country', `${flag} ${data.country || 'N/A'}`);
        html += dataField('Country Code', `+${data.country_code || 'N/A'}`);
        html += dataField('National Number', data.national_number || 'N/A');
        html += dataField('Carrier', data.carrier || 'N/A');
        html += dataField('Line Type', data.line_type || 'N/A');
        html += dataField('Timezone(s)', (data.timezones || []).join(', ') || 'N/A');
        html += `</div>`;

        if (data.formatted) {
            html += `<h3 class="section-header"><i class="fas fa-phone-alt"></i> Formatted Numbers</h3>`;
            html += `<div class="data-grid">`;
            html += dataField('E.164', data.formatted.e164 || 'N/A');
            html += dataField('International', data.formatted.international || 'N/A');
            html += dataField('National', data.formatted.national || 'N/A');
            html += dataField('RFC3966', data.formatted.rfc3966 || 'N/A');
            html += `</div>`;
        }

        return html;
    }

    function renderHeaders(data, query) {
        let html = `
            <div class="results-header">
                <span class="results-title"><i class="fas fa-server"></i> HTTP Headers Report</span>
                <button class="export-btn"><i class="fas fa-download"></i> Export JSON</button>
            </div>
        `;

        // Request Info
        html += `<h3 class="section-header"><i class="fas fa-info-circle"></i> Request Info</h3>`;
        html += `<div class="data-grid">`;
        html += dataField('Final URL', data.url || query);
        html += dataField('Status Code', data.status_code || 'N/A');
        html += dataField('Server', data.server || 'N/A');
        html += dataField('Powered By', data.powered_by || 'N/A');
        html += `</div>`;

        // Redirect Chain
        if (data.redirect_chain && data.redirect_chain.length > 0) {
            html += `<h3 class="section-header"><i class="fas fa-route"></i> Redirect Chain</h3>`;
            html += `<div class="redirect-chain">`;
            data.redirect_chain.forEach((r, i) => {
                html += `<span class="redirect-code">${r.status_code}</span>`;
                html += `<span class="redirect-step">${esc(r.url)}</span>`;
                if (i < data.redirect_chain.length - 1) {
                    html += `<span class="redirect-arrow">→</span>`;
                }
            });
            html += `<span class="redirect-arrow">→</span><span class="redirect-step" style="color:var(--accent-green)">${esc(data.url)}</span>`;
            html += `</div>`;
        }

        // Security Audit
        if (data.security_audit && data.security_audit.length > 0) {
            html += `<h3 class="section-header"><i class="fas fa-shield-alt"></i> Security Header Audit</h3>`;
            data.security_audit.forEach(item => {
                const icon = item.present
                    ? '<i class="fas fa-check-circle audit-icon audit-pass"></i>'
                    : '<i class="fas fa-times-circle audit-icon audit-fail"></i>';
                html += `
                    <div class="audit-item">
                        ${icon}
                        <span class="audit-name">${esc(item.header)}</span>
                        <span class="audit-value">${item.value ? esc(item.value) : '—'}</span>
                    </div>
                `;
            });
        }

        // Response Headers
        if (data.headers) {
            html += `<h3 class="section-header"><i class="fas fa-list"></i> Response Headers</h3>`;
            html += `<table class="data-table"><tr><th>Header</th><th>Value</th></tr>`;
            Object.entries(data.headers).forEach(([k, v]) => {
                html += `<tr><td class="header-name">${esc(k)}</td><td>${esc(String(v))}</td></tr>`;
            });
            html += `</table>`;
        }

        // Cookies
        if (data.cookies && data.cookies.length > 0) {
            html += `<h3 class="section-header"><i class="fas fa-cookie-bite"></i> Cookies</h3>`;
            html += `<table class="data-table"><tr><th>Name</th><th>Domain</th><th>Secure</th><th>HttpOnly</th><th>SameSite</th></tr>`;
            data.cookies.forEach(c => {
                html += `<tr>
                    <td>${esc(c.name)}</td>
                    <td>${esc(c.domain || '')}</td>
                    <td class="${c.secure ? 'bool-yes' : 'bool-no'}">${c.secure ? 'Yes' : 'No'}</td>
                    <td class="${c.httponly ? 'bool-yes' : 'bool-no'}">${c.httponly ? 'Yes' : 'No'}</td>
                    <td>${esc(c.samesite || 'N/A')}</td>
                </tr>`;
            });
            html += `</table>`;
        }

        // SSL Info
        if (data.ssl) {
            html += `<h3 class="section-header"><i class="fas fa-lock"></i> SSL/TLS Info</h3>`;
            html += `<div class="data-grid">`;
            html += dataField('Protocol', data.ssl.protocol || 'N/A');
            html += dataField('Issuer', data.ssl.issuer || 'N/A');
            html += dataField('Subject', data.ssl.subject || 'N/A');
            html += dataField('Expires', data.ssl.expiry || 'N/A');
            html += `</div>`;
        }

        return html;
    }

    // ============================================
    //  HELPERS
    // ============================================

    function dataField(label, value, fullWidth) {
        const cls = fullWidth ? 'data-field full-width' : 'data-field';
        return `<div class="${cls}"><div class="data-label">${esc(label)}</div><div class="data-value">${esc(String(value || 'N/A'))}</div></div>`;
    }

    function formatDate(val) {
        if (!val) return 'N/A';
        if (Array.isArray(val)) val = val[0];
        if (typeof val === 'string') {
            try {
                const d = new Date(val);
                if (!isNaN(d)) return d.toISOString().split('T')[0];
            } catch(e) {}
        }
        return String(val);
    }

    function esc(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    function getCountryFlag(code) {
        if (!code || code.length !== 2) return '';
        const codePoints = [...code.toUpperCase()].map(c => 127397 + c.charCodeAt(0));
        return String.fromCodePoint(...codePoints);
    }

    function getCountryCodeFromPhone(dialCode) {
        // Basic mapping of dial codes to ISO country codes for flag display
        const map = {
            1: 'US', 7: 'RU', 20: 'EG', 27: 'ZA', 30: 'GR', 31: 'NL', 32: 'BE', 33: 'FR',
            34: 'ES', 36: 'HU', 39: 'IT', 40: 'RO', 41: 'CH', 43: 'AT', 44: 'GB', 45: 'DK',
            46: 'SE', 47: 'NO', 48: 'PL', 49: 'DE', 51: 'PE', 52: 'MX', 53: 'CU', 54: 'AR',
            55: 'BR', 56: 'CL', 57: 'CO', 58: 'VE', 60: 'MY', 61: 'AU', 62: 'ID', 63: 'PH',
            64: 'NZ', 65: 'SG', 66: 'TH', 81: 'JP', 82: 'KR', 84: 'VN', 86: 'CN',
            90: 'TR', 91: 'IN', 92: 'PK', 93: 'AF', 94: 'LK', 95: 'MM', 98: 'IR',
            212: 'MA', 213: 'DZ', 216: 'TN', 218: 'LY', 220: 'GM', 234: 'NG', 254: 'KE',
            255: 'TZ', 256: 'UG', 260: 'ZM', 263: 'ZW', 353: 'IE', 354: 'IS', 358: 'FI',
            380: 'UA', 420: 'CZ', 421: 'SK', 852: 'HK', 853: 'MO', 855: 'KH', 880: 'BD',
            886: 'TW', 960: 'MV', 961: 'LB', 962: 'JO', 963: 'SY', 964: 'IQ', 965: 'KW',
            966: 'SA', 968: 'OM', 970: 'PS', 971: 'AE', 972: 'IL', 974: 'QA', 977: 'NP',
            992: 'TJ', 993: 'TM', 994: 'AZ', 995: 'GE', 996: 'KG', 998: 'UZ'
        };
        return map[dialCode] || '';
    }

    function getLoadingHTML() {
        return `
            <div class="loading-container">
                <div class="loading-text"><i class="fas fa-crosshairs"></i> SCANNING TARGET...</div>
                <div class="loading-bar"></div>
            </div>
        `;
    }

    function getErrorHTML(message) {
        return `
            <div class="error-container">
                <div class="error-icon"><i class="fas fa-exclamation-triangle"></i></div>
                <div class="error-message">${esc(message)}</div>
            </div>
        `;
    }

    function exportJSON(data, prefix) {
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${prefix}_${ts}.json`;
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`Exported: ${filename}`, 'success');
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        }, 3000);
    }

});
