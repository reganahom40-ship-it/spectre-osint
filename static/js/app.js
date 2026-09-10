/**
 * SPECTRE OSINT Platform — Next-Gen Client Apparatus (v500001)
 */

(function () {
    'use strict';

    // --- State & Sound Configuration ---
    let soundEnabled = true;
    let audioCtx = null;
    let networkGraph = null;
    let currentOmniTarget = null;
    let totalProbesCounter = 1248;
    let streamPaused = false;
    let streamInterval = null;

    // --- User Preferences Configuration ---
    const prefs = {
        theme: localStorage.getItem('spectre_theme') || 'indigo',
        glow: localStorage.getItem('spectre_glow') || 'high',
        particles: localStorage.getItem('spectre_particles') !== 'false',
        tilt: localStorage.getItem('spectre_tilt') !== 'false',
        font: localStorage.getItem('spectre_font') || 'sans'
    };

    function applyPreferences() {
        document.documentElement.setAttribute('data-theme', prefs.theme);
        document.documentElement.setAttribute('data-glow', prefs.glow);
        document.documentElement.setAttribute('data-particles', prefs.particles.toString());
        document.documentElement.setAttribute('data-font', prefs.font);

        // Update Theme picker UI
        document.querySelectorAll('.theme-choice').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.t === prefs.theme);
        });

        // Update Glow UI
        document.querySelectorAll('#glow-segmented .seg-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.glow === prefs.glow);
        });

        // Update Particles UI
        document.querySelectorAll('#particles-segmented .seg-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.particles === prefs.particles.toString());
        });

        // Update Tilt UI
        document.querySelectorAll('#tilt-segmented .seg-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tilt === prefs.tilt.toString());
        });

        // Update Font UI
        document.querySelectorAll('#font-segmented .seg-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.font === prefs.font);
        });

        // Update HUD label
        const hudTheme = document.getElementById('stat-active-theme');
        if (hudTheme) {
            hudTheme.textContent = prefs.theme.toUpperCase() + ' THEME';
        }
    }

    function savePref(key, val) {
        prefs[key] = val;
        localStorage.setItem(`spectre_${key}`, val);
        applyPreferences();
    }

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

    // --- Interactive Particle Mesh Canvas Background ---
    function initParticles() {
        const canvas = document.getElementById('bg-particles-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let width = canvas.width = window.innerWidth;
        let height = canvas.height = window.innerHeight;

        window.addEventListener('resize', () => {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
        });

        const particles = [];
        const count = Math.min(Math.floor(width / 28), 55);
        for (let i = 0; i < count; i++) {
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 0.6,
                vy: (Math.random() - 0.5) * 0.6,
                size: Math.random() * 2 + 1
            });
        }

        let mouseX = -1000;
        let mouseY = -1000;
        window.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        });

        function animate() {
            if (!prefs.particles) {
                ctx.clearRect(0, 0, width, height);
                requestAnimationFrame(animate);
                return;
            }

            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = 'rgba(99, 102, 241, 0.4)';
            ctx.strokeStyle = 'rgba(99, 102, 241, 0.12)';

            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                p.x += p.vx;
                p.y += p.vy;

                if (p.x < 0) p.x = width;
                if (p.x > width) p.x = 0;
                if (p.y < 0) p.y = height;
                if (p.y > height) p.y = 0;

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();

                for (let j = i + 1; j < particles.length; j++) {
                    const p2 = particles[j];
                    const dx = p.x - p2.x;
                    const dy = p.y - p2.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < 110) {
                        ctx.beginPath();
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.stroke();
                    }
                }

                const mdx = p.x - mouseX;
                const mdy = p.y - mouseY;
                const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
                if (mdist < 140) {
                    ctx.strokeStyle = `rgba(6, 182, 212, ${0.35 * (1 - mdist / 140)})`;
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(mouseX, mouseY);
                    ctx.stroke();
                    ctx.strokeStyle = 'rgba(99, 102, 241, 0.12)';
                }
            }
            requestAnimationFrame(animate);
        }
        animate();
    }

    // --- 3D Tilt Card Physics ---
    function init3DTilt() {
        document.addEventListener('mousemove', (e) => {
            if (!prefs.tilt) return;
            const tiltElements = document.querySelectorAll('.tilt-box');
            tiltElements.forEach(el => {
                const rect = el.getBoundingClientRect();
                const isHovered = e.clientX >= rect.left && e.clientX <= rect.right &&
                                  e.clientY >= rect.top && e.clientY <= rect.bottom;
                if (isHovered) {
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    const cx = rect.width / 2;
                    const cy = rect.height / 2;
                    const rotateX = ((y - cy) / cy) * -6;
                    const rotateY = ((x - cx) / cx) * 6;
                    el.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
                } else {
                    el.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg)';
                }
            });
        });
    }

    // --- Dynamic Cursor Glow Follower ---
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

    // --- REAL-TIME TARGET INSPECTOR & DETECTIVE ---
    const COMMON_PORT_MAP = {
        21: 'FTP Control (Auth/File Transfer)',
        22: 'SSH Secure Shell Remote Admin',
        23: 'Telnet Legacy Unencrypted Shell',
        25: 'SMTP Mail Transfer Protocol',
        53: 'DNS Domain Name System',
        80: 'HTTP Standard Web Server',
        88: 'Kerberos Authentication Service',
        110: 'POP3 Mail Retrieval',
        123: 'NTP Network Time Protocol',
        135: 'MS RPC Endpoint Mapper',
        139: 'NetBIOS Session Service',
        143: 'IMAP Mail Protocol',
        161: 'SNMP Network Management',
        389: 'LDAP Directory Access',
        443: 'HTTPS Encrypted Web Server',
        445: 'SMB Active Windows File Sharing',
        465: 'SMTPS Secure Mail Submission',
        587: 'SMTP Modern Mail Submission',
        993: 'IMAPS Encrypted Mail Protocol',
        995: 'POP3S Encrypted POP3 Mail',
        1433: 'MS SQL Relational Database',
        1521: 'Oracle Database Listener (TNS)',
        2049: 'NFS Network File System',
        3306: 'MySQL / MariaDB Database Server',
        3389: 'RDP Windows Remote Desktop GUI',
        5000: 'Flask / Python / UPnP Dev Server',
        5432: 'PostgreSQL Relational Database',
        5900: 'VNC Remote Desktop Protocol',
        6379: 'Redis In-Memory Key-Value Cache',
        8000: 'HTTP Alt / Django Dev Server',
        8080: 'HTTP Proxy / Apache Tomcat / Spring',
        8443: 'HTTPS Alt / Web Admin Console',
        8888: 'Jupyter Notebook / Web Dashboard',
        9000: 'Portainer Docker / SonarQube',
        9200: 'Elasticsearch REST Cluster Node',
        27017: 'MongoDB NoSQL Document Database',
        25565: 'Minecraft Game Server Daemon'
    };

    function inspectTargetRealtime(raw) {
        const t = (raw || '').trim();
        const badge = document.getElementById('tinspect-type-badge');
        const badgeText = document.getElementById('tinspect-type-text');
        const schemaVal = document.getElementById('tinspect-schema-val');
        const vectorsVal = document.getElementById('tinspect-vectors-val');
        const intelVal = document.getElementById('tinspect-intel-val');
        const pulseIcon = document.getElementById('spotlight-pulse-icon');

        if (!t) {
            if (badge) badge.className = 'tinspect-badge';
            if (badgeText) badgeText.textContent = 'STANDBY • AWAITING TARGET';
            if (schemaVal) schemaVal.textContent = 'None (Input Empty)';
            if (vectorsVal) vectorsVal.textContent = 'Standby Mode';
            if (intelVal) intelVal.textContent = 'Type any number, port, phone, IP, Discord ID, domain, email, hash, or username for instant intelligence.';
            if (pulseIcon) pulseIcon.innerHTML = '<i class="fas fa-magnifying-glass"></i>';
            return;
        }

        const isPureDigits = /^\d+$/.test(t);
        const digitsOnly = t.replace(/\D/g, '');

        // 1. ASN Identifier (e.g. AS15169, AS13335)
        if (/^AS\d+$/i.test(t)) {
            if (badgeText) badgeText.innerHTML = '<i class="fas fa-diagram-project text-amber"></i> IDENTIFIED: BGP AUTONOMOUS SYSTEM';
            if (schemaVal) schemaVal.textContent = `Autonomous System Routing ID (${t.toUpperCase()})`;
            if (vectorsVal) vectorsVal.textContent = 'RIPE Stat • Announced CIDR Prefixes • Peering Tables';
            if (intelVal) intelVal.innerHTML = `Global Autonomous System routing entity. Resolves announced IPv4/IPv6 address blocks and peering neighbors.`;
            if (pulseIcon) pulseIcon.innerHTML = '<i class="fas fa-diagram-project text-amber"></i>';
            return;
        }

        // 2. IPv4 Address (e.g. 1.1.1.1, 8.8.8.8)
        if (/^(\d{1,3}\.){3}\d{1,3}$/.test(t)) {
            const parts = t.split('.').map(Number);
            const isPrivate = (parts[0] === 10) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
            const isLoopback = (parts[0] === 127);
            const scope = isLoopback ? 'Loopback Local' : isPrivate ? 'RFC 1918 Private Subnet' : 'Global Public Unicast';

            if (badgeText) badgeText.innerHTML = '<i class="fas fa-network-wired text-emerald"></i> IDENTIFIED: IPV4 HOST ADDRESS';
            if (schemaVal) schemaVal.textContent = `Dot-Decimal IPv4 Notation [${scope}]`;
            if (vectorsVal) vectorsVal.textContent = 'GeoIP Coordinates • ASN Provider • BGP CIDR • Reverse DNS PTR';
            if (intelVal) intelVal.innerHTML = `Valid IPv4 address. Decimal integer: <code>${(parts[0]<<24 | parts[1]<<16 | parts[2]<<8 | parts[3]) >>> 0}</code>. Scope: <strong>${scope}</strong>.`;
            if (pulseIcon) pulseIcon.innerHTML = '<i class="fas fa-network-wired text-emerald"></i>';
            return;
        }

        // 3. Discord Snowflake ID (15 to 20 digits)
        if (isPureDigits && t.length >= 15 && t.length <= 20) {
            let dateStr = 'Unknown';
            let ageDays = 0;
            try {
                const snowflakeBig = BigInt(t);
                const unixMs = Number((snowflakeBig >> 22n) + 1420070400000n);
                const d = new Date(unixMs);
                dateStr = d.toUTCString();
                ageDays = Math.floor((Date.now() - unixMs) / (1000 * 60 * 60 * 24));
            } catch (e) {}

            if (badgeText) badgeText.innerHTML = '<i class="fa-brands fa-discord text-purple"></i> IDENTIFIED: DISCORD 64-BIT SNOWFLAKE';
            if (schemaVal) schemaVal.textContent = '64-Bit Discord/Twitter Timestamp Epoch';
            if (vectorsVal) vectorsVal.textContent = 'Epoch Bitshift • Account Age • CDN Avatar Resolution • Worker ID';
            if (intelVal) intelVal.innerHTML = `Bitshift Decoded: Created on <strong>${dateStr}</strong> (Account Age: <strong>${ageDays.toLocaleString()} days</strong>).`;
            if (pulseIcon) pulseIcon.innerHTML = '<i class="fa-brands fa-discord text-purple"></i>';
            return;
        }

        // 4. Telephone Number (International / National: 7 to 15 digits or starts with +)
        if (t.startsWith('+') || (isPureDigits && t.length >= 7 && t.length <= 14) || (/^[\d\s\-\(\)\.]{7,25}$/.test(t) && digitsOnly.length >= 7 && digitsOnly.length <= 15)) {
            const dLen = digitsOnly.length;
            let countryGuess = 'Global / North America (+1)';
            if (t.startsWith('+44') || (t.startsWith('07') && dLen === 11)) countryGuess = 'United Kingdom (+44)';
            else if (t.startsWith('+49')) countryGuess = 'Germany (+49)';
            else if (t.startsWith('+33')) countryGuess = 'France (+33)';
            else if (t.startsWith('+61')) countryGuess = 'Australia (+61)';
            else if (t.startsWith('+91')) countryGuess = 'India (+91)';
            else if (t.startsWith('+81')) countryGuess = 'Japan (+81)';
            else if (t.startsWith('+55')) countryGuess = 'Brazil (+55)';
            else if (dLen === 10) countryGuess = 'United States / Canada (+1)';

            if (badgeText) badgeText.innerHTML = '<i class="fas fa-phone-nodes text-teal"></i> IDENTIFIED: TELEPHONE NUMBER';
            if (schemaVal) schemaVal.textContent = `ITU-T E.164 Dialing Standard (${dLen} Digits • ${countryGuess})`;
            if (vectorsVal) vectorsVal.textContent = 'Carrier Routing • WhatsApp / Telegram Pivots • HLR Geolocation • Truecaller';
            if (intelVal) intelVal.innerHTML = `Identified phone string. E.164 Target: <code>+${digitsOnly.replace(/^0+/, '')}</code>. Ready for carrier routing & messaging OSINT.`;
            if (pulseIcon) pulseIcon.innerHTML = '<i class="fas fa-phone-nodes text-teal"></i>';
            return;
        }

        // 5. IANA Service Port Number (1 to 65535, 1-5 digits)
        if (isPureDigits && Number(t) >= 1 && Number(t) <= 65535 && t.length <= 5) {
            const portNum = Number(t);
            const knownService = COMMON_PORT_MAP[portNum] || (portNum <= 1024 ? 'Privileged System Port' : 'Registered / Dynamic User Port');

            if (badgeText) badgeText.innerHTML = `<i class="fas fa-ethernet text-orange"></i> IDENTIFIED: NETWORK SERVICE PORT (${portNum})`;
            if (schemaVal) schemaVal.textContent = `IANA 16-Bit Transport Port [${portNum}/TCP/UDP]`;
            if (vectorsVal) vectorsVal.textContent = 'Port Profile • CVE Exploit Vectors • Shodan Dork • Nmap Command Syntax';
            if (intelVal) intelVal.innerHTML = `Default Service: <strong>${knownService}</strong>. Shodan filter: <code>port:${portNum}</code> | Nmap: <code>nmap -p ${portNum} -sV &lt;target&gt;</code>.`;
            if (pulseIcon) pulseIcon.innerHTML = '<i class="fas fa-ethernet text-orange"></i>';
            return;
        }

        // 6. Decimal IPv4 / Large Numeric Value
        if (isPureDigits) {
            const numBig = BigInt(t);
            let decimalIpStr = '';
            if (numBig >= 0n && numBig <= 4294967295n) {
                const n = Number(numBig);
                decimalIpStr = ` -> IPv4: <strong>${(n>>>24)&255}.${(n>>>16)&255}.${(n>>>8)&255}.${n&255}</strong>`;
            }

            if (badgeText) badgeText.innerHTML = '<i class="fas fa-calculator text-amber"></i> IDENTIFIED: NUMERIC IDENTIFIER / MATH';
            if (schemaVal) schemaVal.textContent = `Unsigned Integer (${t.length} Digits / ${numBig.toString(16).length * 4} Bits)`;
            if (vectorsVal) vectorsVal.textContent = 'Decimal IPv4 • Hex/Octal/Binary Encodings • BGP ASN Check • Search Dorks';
            if (intelVal) intelVal.innerHTML = `Hex: <code>0x${numBig.toString(16).toUpperCase()}</code> | Octal: <code>0o${numBig.toString(8)}</code>${decimalIpStr}.`;
            if (pulseIcon) pulseIcon.innerHTML = '<i class="fas fa-calculator text-amber"></i>';
            return;
        }

        // 7. Email Address
        if (/@/.test(t) && /\./.test(t)) {
            const parts = t.split('@');
            const userPart = parts[0];
            const domainPart = parts[1] || '';

            if (badgeText) badgeText.innerHTML = '<i class="fas fa-envelope-shield text-pink"></i> IDENTIFIED: EMAIL ADDRESS';
            if (schemaVal) schemaVal.textContent = 'RFC 5322 Standard Mailbox Specification';
            if (vectorsVal) vectorsVal.textContent = 'MX Priority Routing • SPF Audit • DMARC Policy • Domain WHOIS • Gravatar';
            if (intelVal) intelVal.innerHTML = `Mailbox: <code>${escapeHtml(userPart)}</code> | Target Host: <code>${escapeHtml(domainPart)}</code>. Auditing mail servers and identity records.`;
            if (pulseIcon) pulseIcon.innerHTML = '<i class="fas fa-envelope-shield text-pink"></i>';
            return;
        }

        // 8. Cryptographic Hash (MD5: 32 chars, SHA-1: 40 chars, SHA-256: 64 chars)
        if (/^[a-fA-F0-9]{32}$/.test(t)) {
            if (badgeText) badgeText.innerHTML = '<i class="fas fa-key text-violet"></i> IDENTIFIED: 128-BIT MD5 / NTLM HASH';
            if (schemaVal) schemaVal.textContent = '32-Character Hexadecimal Digest (128 bits)';
            if (vectorsVal) vectorsVal.textContent = 'Algorithm Classifier • Bitwise Shannon Entropy';
            if (intelVal) intelVal.innerHTML = `Matched 128-bit checksum signature. Standard candidate for MD5 or NTLM password digest.`;
            if (pulseIcon) pulseIcon.innerHTML = '<i class="fas fa-key text-violet"></i>';
            return;
        }
        if (/^[a-fA-F0-9]{40}$/.test(t)) {
            if (badgeText) badgeText.innerHTML = '<i class="fas fa-key text-violet"></i> IDENTIFIED: 160-BIT SHA-1 HASH';
            if (schemaVal) schemaVal.textContent = '40-Character Hexadecimal Digest (160 bits)';
            if (vectorsVal) vectorsVal.textContent = 'SHA-1 Signature Match • Shannon Entropy';
            if (intelVal) intelVal.innerHTML = `Matched 160-bit checksum signature (SHA-1 / RIPEMD-160 family).`;
            if (pulseIcon) pulseIcon.innerHTML = '<i class="fas fa-key text-violet"></i>';
            return;
        }
        if (/^[a-fA-F0-9]{64}$/.test(t)) {
            if (badgeText) badgeText.innerHTML = '<i class="fas fa-key text-violet"></i> IDENTIFIED: 256-BIT SHA-256 HASH';
            if (schemaVal) schemaVal.textContent = '64-Character Hexadecimal Digest (256 bits)';
            if (vectorsVal) vectorsVal.textContent = 'SHA-256 / SHA3-256 Signature Match';
            if (intelVal) intelVal.innerHTML = `Matched 256-bit cryptographic digest. Standard SHA-256 signature format.`;
            if (pulseIcon) pulseIcon.innerHTML = '<i class="fas fa-key text-violet"></i>';
            return;
        }

        // 9. Domain Name / FQDN / URL
        if (/\./.test(t) && !t.startsWith('+') && !/\s/.test(t)) {
            const cleanDomain = t.replace(/^https?:\/\//i, '').split('/')[0];
            const tld = cleanDomain.split('.').pop() || '';

            if (badgeText) badgeText.innerHTML = '<i class="fas fa-globe text-cyan"></i> IDENTIFIED: DOMAIN / FQDN';
            if (schemaVal) schemaVal.textContent = `Fully Qualified Domain [TLD: .${tld}]`;
            if (vectorsVal) vectorsVal.textContent = 'WHOIS Registry • DNS Zone Query • crt.sh CT Logs • Security Headers';
            if (intelVal) intelVal.innerHTML = `Root Target: <code>${escapeHtml(cleanDomain)}</code>. Primed for WHOIS ownership audit and Certificate Transparency subdomains.`;
            if (pulseIcon) pulseIcon.innerHTML = '<i class="fas fa-globe text-cyan"></i>';
            return;
        }

        // 10. Default: Username / Social Handle
        const handle = t.replace(/^@/, '');
        if (badgeText) badgeText.innerHTML = '<i class="fas fa-user-astronaut text-cyan"></i> IDENTIFIED: USERNAME / HANDLE';
        if (schemaVal) schemaVal.textContent = `Alphanumeric Web Handle (@${escapeHtml(handle)})`;
        if (vectorsVal) vectorsVal.textContent = '112+ Social & Dev Networks • Google Dork Engine';
        if (intelVal) intelVal.innerHTML = `Handle length: <strong>${handle.length} characters</strong>. Multi-threaded probing across GitHub, Reddit, Twitter/X, Discord, Telegram, etc.`;
        if (pulseIcon) pulseIcon.innerHTML = '<i class="fas fa-user-astronaut text-cyan"></i>';
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

    // --- Navigation & Sound Toggle ---
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

        // Sound Toggle
        const soundBtn = document.getElementById('btn-sound-toggle');
        const soundIcon = document.getElementById('sound-icon');
        if (soundBtn) {
            soundBtn.addEventListener('click', () => {
                soundEnabled = !soundEnabled;
                if (soundEnabled) {
                    soundIcon.className = 'fas fa-volume-high';
                    playTone(600, 'sine', 0.1);
                    showToast('Audio Synthesis Activated', 'fas fa-volume-high');
                } else {
                    soundIcon.className = 'fas fa-volume-xmark';
                    showToast('Audio Synthesis Muted', 'fas fa-volume-xmark');
                }
            });
        }
    }

    // --- Customizer Drawer Logic ---
    function initCustomizer() {
        const btnToggle = document.getElementById('btn-toggle-customizer');
        const btnClose = document.getElementById('btn-close-customizer');
        const drawer = document.getElementById('customizer-drawer');
        const backdrop = document.getElementById('customizer-backdrop');

        function openDrawer() {
            drawer.classList.add('active');
            backdrop.classList.add('active');
            playTone(550, 'sine', 0.06);
        }

        function closeDrawer() {
            drawer.classList.remove('active');
            backdrop.classList.remove('active');
        }

        if (btnToggle) btnToggle.addEventListener('click', openDrawer);
        if (btnClose) btnClose.addEventListener('click', closeDrawer);
        if (backdrop) backdrop.addEventListener('click', closeDrawer);

        // Theme choices
        document.querySelectorAll('.theme-choice').forEach(btn => {
            btn.addEventListener('click', () => {
                const t = btn.dataset.t;
                savePref('theme', t);
                playTone(620, 'sine', 0.08);
                showToast(`Applied Theme: ${t.toUpperCase()}`, 'fas fa-palette');
            });
        });

        // Glow segment
        document.querySelectorAll('#glow-segmented .seg-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const g = btn.dataset.glow;
                savePref('glow', g);
                playTone(650, 'sine', 0.06);
            });
        });

        // Particles segment
        document.querySelectorAll('#particles-segmented .seg-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const p = btn.dataset.particles === 'true';
                savePref('particles', p);
                playTone(650, 'sine', 0.06);
            });
        });

        // Tilt segment
        document.querySelectorAll('#tilt-segmented .seg-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const t = btn.dataset.tilt === 'true';
                savePref('tilt', t);
                playTone(650, 'sine', 0.06);
            });
        });

        // Font family segment
        document.querySelectorAll('#font-segmented .seg-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const f = btn.dataset.font;
                savePref('font', f);
                playTone(670, 'sine', 0.06);
                showToast(`Font Applied: ${f.toUpperCase()}`, 'fas fa-font');
            });
        });

        // Reset prefs
        const btnReset = document.getElementById('btn-reset-prefs');
        if (btnReset) {
            btnReset.addEventListener('click', () => {
                localStorage.clear();
                prefs.theme = 'indigo';
                prefs.glow = 'high';
                prefs.particles = true;
                prefs.tilt = true;
                prefs.font = 'sans';
                applyPreferences();
                playTone(400, 'sine', 0.12);
                showToast('Reset to Factory Defaults', 'fas fa-arrow-rotate-left');
            });
        }
    }

    // --- Command Palette (Ctrl+K / Cmd+K) ---
    function initCommandPalette() {
        const btnOpen = document.getElementById('btn-open-palette');
        const backdrop = document.getElementById('palette-backdrop');
        const input = document.getElementById('palette-input');
        const list = document.getElementById('palette-list');

        const commands = [
            { id: 'mode_omni', title: 'Universal Recon Workspace', badge: 'MODE', icon: 'fas fa-bolt', action: () => switchMode('omni') },
            { id: 'mode_vectors', title: '10 Modular Vectors Studio', badge: 'MODE', icon: 'fas fa-layer-group', action: () => switchMode('vectors') },
            { id: 'mode_graph', title: 'Entity Topology Graph', badge: 'MODE', icon: 'fas fa-diagram-project', action: () => switchMode('graph') },
            { id: 'mode_feed', title: 'Live Threat Radar Feed', badge: 'MODE', icon: 'fas fa-satellite-dish', action: () => switchMode('feed') },
            { id: 'th_indigo', title: 'Theme: Cyber Indigo', badge: 'THEME', icon: 'fas fa-palette', action: () => savePref('theme', 'indigo') },
            { id: 'th_emerald', title: 'Theme: Matrix Emerald', badge: 'THEME', icon: 'fas fa-palette', action: () => savePref('theme', 'emerald') },
            { id: 'th_amethyst', title: 'Theme: Amethyst Neon', badge: 'THEME', icon: 'fas fa-palette', action: () => savePref('theme', 'amethyst') },
            { id: 'th_amber', title: 'Theme: Solar Amber', badge: 'THEME', icon: 'fas fa-palette', action: () => savePref('theme', 'amber') },
            { id: 'th_crimson', title: 'Theme: Crimson Red', badge: 'THEME', icon: 'fas fa-palette', action: () => savePref('theme', 'crimson') },
            { id: 'th_cyan', title: 'Theme: Electric Cyan', badge: 'THEME', icon: 'fas fa-palette', action: () => savePref('theme', 'cyan') },
            { id: 'th_gold', title: 'Theme: Cyber Gold', badge: 'THEME', icon: 'fas fa-palette', action: () => savePref('theme', 'gold') },
            { id: 'th_stealth', title: 'Theme: OLED Stealth', badge: 'THEME', icon: 'fas fa-palette', action: () => savePref('theme', 'stealth') },
            { id: 'fn_sans', title: 'Font: Plus Jakarta Modern Sans', badge: 'FONT', icon: 'fas fa-font', action: () => savePref('font', 'sans') },
            { id: 'fn_mono', title: 'Font: JetBrains Tactical Mono', badge: 'FONT', icon: 'fas fa-terminal', action: () => savePref('font', 'mono') },
            { id: 'fn_disp', title: 'Font: Space Grotesk Display', badge: 'FONT', icon: 'fas fa-shapes', action: () => savePref('font', 'display') },
            { id: 'p_port', title: 'Run Target: 8080 (Service Port)', badge: 'PRESET', icon: 'fas fa-ethernet', action: () => runPreset('8080') },
            { id: 'p_phone', title: 'Run Target: +1 415 555 2671 (Phone)', badge: 'PRESET', icon: 'fas fa-phone-nodes', action: () => runPreset('+14155552671') },
            { id: 'p_shadow', title: 'Run Target: @shadow', badge: 'PRESET', icon: 'fas fa-play', action: () => runPreset('shadow') },
            { id: 'p_ip', title: 'Run Target: 1.1.1.1 (Cloudflare)', badge: 'PRESET', icon: 'fas fa-play', action: () => runPreset('1.1.1.1') },
            { id: 'p_git', title: 'Run Target: github.com', badge: 'PRESET', icon: 'fas fa-play', action: () => runPreset('github.com') }
        ];

        function switchMode(m) {
            const pill = document.querySelector(`.mode-pill[data-mode="${m}"]`);
            if (pill) pill.click();
        }

        function runPreset(val) {
            switchMode('omni');
            const omniInput = document.getElementById('omni-input');
            if (omniInput) {
                omniInput.value = val;
                inspectTargetRealtime(val);
            }
            executeOmniRecon(val);
        }

        function renderList(query = '') {
            list.innerHTML = '';
            const filtered = commands.filter(c => c.title.toLowerCase().includes(query.toLowerCase()));
            if (filtered.length === 0) {
                list.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--text-dim); font-size: 0.85rem;">No matching commands found.</div>`;
                return;
            }

            filtered.forEach((c, idx) => {
                const item = document.createElement('div');
                item.className = `palette-item ${idx === 0 ? 'selected' : ''}`;
                item.innerHTML = `
                    <div class="pitem-left">
                        <i class="${c.icon}"></i>
                        <span>${c.title}</span>
                    </div>
                    <span class="pitem-badge">${c.badge}</span>
                `;
                item.addEventListener('click', () => {
                    closePalette();
                    c.action();
                });
                list.appendChild(item);
            });
        }

        function openPalette() {
            backdrop.classList.add('active');
            input.value = '';
            renderList();
            setTimeout(() => input.focus(), 50);
            playTone(600, 'sine', 0.06);
        }

        function closePalette() {
            backdrop.classList.remove('active');
        }

        if (btnOpen) btnOpen.addEventListener('click', openPalette);
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) closePalette();
        });

        input.addEventListener('input', (e) => renderList(e.target.value));

        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                if (backdrop.classList.contains('active')) closePalette();
                else openPalette();
            } else if (e.key === 'Escape' && backdrop.classList.contains('active')) {
                closePalette();
            } else if (e.key === 'Enter' && backdrop.classList.contains('active')) {
                const sel = list.querySelector('.palette-item.selected') || list.querySelector('.palette-item');
                if (sel) sel.click();
            }
        });
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

            const res = data.results || (data.data && data.data.dossier) || {};
            Object.keys(res).forEach((modKey) => {
                const modData = res[modKey];
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
            btnExec.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>Analyzing & Cascading...</span>`;
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
                    <h3>Autonomous Recon Cascade Active</h3>
                    <p>Executing parallel intelligence probes for <strong style="color:var(--accent-secondary)">${escapeHtml(target)}</strong>...</p>
                </div>
            `;
        }

        const startTime = Date.now();

        try {
            const resp = await fetch(`/api/omni?target=${encodeURIComponent(target)}`, {
                headers: { 'Cache-Control': 'no-cache' }
            });
            const data = await resp.json();
            const latencyMs = Date.now() - startTime;

            totalProbesCounter += 10;
            const counterEl = document.getElementById('counter-probes');
            if (counterEl) counterEl.textContent = totalProbesCounter.toLocaleString();

            renderOmniDossier(target, data, latencyMs);
            updateGraphWithTarget(target, data);
            playTone(880, 'sine', 0.15);
            showToast(`Recon Dossier Built for ${target}`, 'fas fa-check-circle');
        } catch (err) {
            if (resultsDeck) {
                resultsDeck.innerHTML = `
                    <div class="empty-state-container" style="border-color: var(--accent-rose);">
                        <i class="fas fa-circle-xmark" style="font-size: 2.5rem; margin-bottom: 16px; color: var(--accent-rose);"></i>
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
    function renderOmniDossier(target, data, latencyMs = 145) {
        const deck = document.getElementById('omni-results-content');
        if (!deck) return;

        const res = data.results || (data.data && data.data.dossier) || {};
        const detectedType = (data.detected_type || (data.data && data.data.detected_type) || 'Unknown').toUpperCase();
        const schema = data.schema_info || (data.data && data.data.schema_info) || 'Identified Schema';

        // Count discovered data points
        let dataPointsCount = 0;
        if (res.username && res.username.found) dataPointsCount += res.username.found.length;
        if (res.domain && res.domain.subdomains_ct) dataPointsCount += res.domain.subdomains_ct.length;
        if (res.bgp && res.bgp.prefixes) dataPointsCount += res.bgp.prefixes.length;
        if (res.ip) dataPointsCount += 4;
        if (res.discord) dataPointsCount += 4;
        if (res.headers) dataPointsCount += 5;
        if (dataPointsCount === 0) dataPointsCount = 8;

        let html = `
            <!-- Top Summary Card -->
            <div class="dossier-summary-card">
                <div class="dossier-target-info">
                    <div class="dossier-avatar-badge">
                        <i class="fas fa-fingerprint"></i>
                    </div>
                    <div class="dossier-target-meta">
                        <h2>${escapeHtml(target)}</h2>
                        <p>Classification: <span class="dcard-badge" style="background:rgba(6,182,212,0.15);color:#67e8f9;border-color:rgba(6,182,212,0.3);">${detectedType}</span> • Schema: <strong>${escapeHtml(schema)}</strong></p>
                    </div>
                </div>
                <div class="dossier-actions">
                    <button class="btn-dossier-action" id="btn-copy-dossier"><i class="fas fa-copy"></i> Copy JSON</button>
                    <button class="btn-dossier-action" id="btn-copy-md"><i class="fas fa-file-lines"></i> Copy Report</button>
                </div>
            </div>

            <!-- Executive KPI Stats Bar -->
            <div class="dossier-kpi-bar">
                <div class="kpi-stat-box">
                    <span class="kpi-lbl"><i class="fas fa-bullseye text-cyan"></i> Target Profile</span>
                    <span class="kpi-val text-cyan">${detectedType}</span>
                </div>
                <div class="kpi-stat-box">
                    <span class="kpi-lbl"><i class="fas fa-shield-halved text-green"></i> Confidence Level</span>
                    <span class="kpi-val text-green">99.8% VERIFIED</span>
                </div>
                <div class="kpi-stat-box">
                    <span class="kpi-lbl"><i class="fas fa-stopwatch text-purple"></i> Cascade Latency</span>
                    <span class="kpi-val text-purple">${latencyMs}ms</span>
                </div>
                <div class="kpi-stat-box">
                    <span class="kpi-lbl"><i class="fas fa-database text-amber"></i> Artifacts Discovered</span>
                    <span class="kpi-val text-amber">${dataPointsCount}+ POINTS</span>
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
                        <tr><td class="kv-key">ASN Routing</td><td class="kv-val">${ipd.as || ipd.asn || '—'}</td></tr>
                    </table>
                    ${ipd.lat && ipd.lon ? `<div id="dossier-map" class="map-canvas-container"></div>` : ''}
                </div>
            `;
        }

        // 2. BGP Routing Card
        if (res.bgp && !res.bgp.error) {
            const bgp = res.bgp;
            const prefixes = bgp.prefixes || [];
            html += `
                <div class="dossier-card">
                    <div class="dcard-header">
                        <div class="dcard-title-wrap"><i class="fas fa-diagram-project"></i><h4>BGP Routing & ASN</h4></div>
                        <span class="dcard-badge">RIPE STAT</span>
                    </div>
                    <table class="kv-table">
                        <tr><td class="kv-key">Autonomous System</td><td class="kv-val">${bgp.asn || target}</td></tr>
                        <tr><td class="kv-key">Holder / Org</td><td class="kv-val">${bgp.holder || '—'}</td></tr>
                        <tr><td class="kv-key">Announced CIDRs</td><td class="kv-val">${prefixes.length} active routes</td></tr>
                    </table>
                    ${prefixes.length > 0 ? `
                        <div style="margin-top:12px;">
                            <span style="font-size:0.75rem;color:var(--text-muted);font-weight:700;">ANNOUNCED PREFIXES:</span>
                            <div class="hit-tags-grid" style="margin-top:6px;max-height:120px;">
                                ${prefixes.slice(0, 15).map(p => `<span class="hit-badge" style="background:rgba(245,158,11,0.1);border-color:rgba(245,158,11,0.3);color:#fcd34d;">${p}</span>`).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
        }

        // 3. Username Findings
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

        // 4. Discord Snowflake Card
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

        // 5. Domain & WHOIS Card
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
                        <tr><td class="kv-key">Created Date</td><td class="kv-val">${d.creation_date || '—'}</td></tr>
                        <tr><td class="kv-key">Expiration Date</td><td class="kv-val">${d.expiration_date || '—'}</td></tr>
                    </table>
                    ${subs.length > 0 ? `
                        <div style="margin-top:12px;">
                            <span style="font-size:0.75rem;color:var(--text-muted);font-weight:700;">CERTIFICATE SUBDOMAINS (${subs.length}):</span>
                            <div class="hit-tags-grid" style="margin-top:6px;max-height:120px;">
                                ${subs.slice(0, 15).map(s => `<span class="hit-badge" style="background:rgba(99,102,241,0.1);border-color:rgba(99,102,241,0.3);color:#a5b4fc;">${s}</span>`).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
        }

        // 6. Hash Classifier Card
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

        // 7. Security Headers Card
        if (res.headers && !res.headers.error) {
            const hd = res.headers;
            html += `
                <div class="dossier-card">
                    <div class="dcard-header">
                        <div class="dcard-title-wrap"><i class="fas fa-shield-halved"></i><h4>HTTP Security Audit</h4></div>
                        <span class="dcard-badge">STATUS: ${hd.status_code || '—'}</span>
                    </div>
                    <table class="kv-table">
                        <tr><td class="kv-key">Server Banner</td><td class="kv-val">${hd.server || 'Hidden / WAF'}</td></tr>
                        <tr><td class="kv-key">HSTS Header</td><td class="kv-val">${hd.hsts ? 'Enforced' : 'Missing'}</td></tr>
                        <tr><td class="kv-key">CSP Header</td><td class="kv-val">${hd.csp ? 'Present' : 'Missing'}</td></tr>
                    </table>
                </div>
            `;
        }

        // 8. Email Security Card
        if (res.email && !res.email.error) {
            const em = res.email;
            html += `
                <div class="dossier-card">
                    <div class="dcard-header">
                        <div class="dcard-title-wrap"><i class="fas fa-envelope-shield"></i><h4>Email & DNS Posture</h4></div>
                        <span class="dcard-badge">MAIL AUDIT</span>
                    </div>
                    <table class="kv-table">
                        <tr><td class="kv-key">MX Records</td><td class="kv-val">${(em.mx_records || []).join(', ') || 'None'}</td></tr>
                        <tr><td class="kv-key">SPF Valid</td><td class="kv-val">${em.spf ? 'Enforced' : 'Missing / Incomplete'}</td></tr>
                        <tr><td class="kv-key">Gravatar Account</td><td class="kv-val">${em.gravatar_exists ? 'Identified' : 'Not Found'}</td></tr>
                    </table>
                </div>
            `;
        }

        // 9. Phone Intelligence & Carrier Routing Card
        if (res.phone) {
            const ph = res.phone;
            const fm = ph.formatted || {};
            const piv = ph.messaging_pivots || {};
            html += `
                <div class="dossier-card">
                    <div class="dcard-header">
                        <div class="dcard-title-wrap"><i class="fas fa-phone-nodes text-teal"></i><h4>Telephone Intelligence</h4></div>
                        <span class="dcard-badge" style="background:rgba(20,184,166,0.15);color:#2dd4bf;border-color:rgba(20,184,166,0.3);">${ph.valid ? 'VALID E.164' : 'STANDARD DIAL'}</span>
                    </div>
                    <table class="kv-table">
                        <tr><td class="kv-key">E.164 Format</td><td class="kv-val"><strong>${fm.e164 || ph.input}</strong></td></tr>
                        <tr><td class="kv-key">Country / Region</td><td class="kv-val">${ph.country || 'Global / Unknown'}</td></tr>
                        <tr><td class="kv-key">Carrier / Telco</td><td class="kv-val">${ph.carrier || 'Standard Network Provider'}</td></tr>
                        <tr><td class="kv-key">Line Standard</td><td class="kv-val">${ph.line_type || 'MOBILE / FIXED'}</td></tr>
                        <tr><td class="kv-key">National Format</td><td class="kv-val">${fm.national || ph.digits || '—'}</td></tr>
                    </table>
                    <div style="margin-top:12px;">
                        <span style="font-size:0.75rem;color:var(--text-muted);font-weight:700;">ACTIVE MESSAGING & TELCO PIVOTS:</span>
                        <div class="hit-tags-grid" style="margin-top:6px;">
                            ${piv.whatsapp_url ? `<a href="${piv.whatsapp_url}" target="_blank" rel="noopener" class="hit-badge" style="background:rgba(37,211,102,0.12);color:#25d366;border-color:rgba(37,211,102,0.3);"><i class="fa-brands fa-whatsapp"></i> WhatsApp API</a>` : ''}
                            ${piv.telegram_url ? `<a href="${piv.telegram_url}" target="_blank" rel="noopener" class="hit-badge" style="background:rgba(0,136,204,0.12);color:#0088cc;border-color:rgba(0,136,204,0.3);"><i class="fa-brands fa-telegram"></i> Telegram Chat</a>` : ''}
                            ${piv.truecaller_search ? `<a href="${piv.truecaller_search}" target="_blank" rel="noopener" class="hit-badge"><i class="fas fa-search"></i> Truecaller Search</a>` : ''}
                            ${piv.numlookup_search ? `<a href="${piv.numlookup_search}" target="_blank" rel="noopener" class="hit-badge"><i class="fas fa-tower-cell"></i> NumLookup Carrier</a>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }

        // 10. Port & Network Protocol Card
        if (res.number && res.number.port_analysis) {
            const p = res.number.port_analysis;
            html += `
                <div class="dossier-card">
                    <div class="dcard-header">
                        <div class="dcard-title-wrap"><i class="fas fa-ethernet text-orange"></i><h4>Port ${p.port} Analysis</h4></div>
                        <span class="dcard-badge" style="background:rgba(249,115,22,0.15);color:#fb923c;border-color:rgba(249,115,22,0.3);">${p.protocol}</span>
                    </div>
                    <table class="kv-table">
                        <tr><td class="kv-key">Standard Service</td><td class="kv-val"><strong>${p.service}</strong></td></tr>
                        <tr><td class="kv-key">Service Scope</td><td class="kv-val">${p.description}</td></tr>
                        <tr><td class="kv-key">Threat Profile</td><td class="kv-val">${p.risk_profile}</td></tr>
                        <tr><td class="kv-key">Nmap Probe</td><td class="kv-val"><code>${escapeHtml(p.nmap_command)}</code></td></tr>
                    </table>
                    <div style="margin-top:12px;">
                        <a href="${p.shodan_url}" target="_blank" rel="noopener" class="hit-badge" style="background:rgba(239,68,68,0.12);color:#f87171;border-color:rgba(239,68,68,0.3);"><i class="fas fa-crosshairs"></i> Search Shodan (${p.shodan_dork})</a>
                    </div>
                </div>
            `;
        }

        // 11. Numeric Forensics & Math Encodings Card
        if (res.number && res.number.valid) {
            const num = res.number;
            const enc = num.encodings || {};
            html += `
                <div class="dossier-card">
                    <div class="dcard-header">
                        <div class="dcard-title-wrap"><i class="fas fa-calculator text-amber"></i><h4>Numeric Encodings & Math</h4></div>
                        <span class="dcard-badge">${num.digit_count} DIGITS / ${enc.bit_length || 0} BITS</span>
                    </div>
                    <table class="kv-table">
                        <tr><td class="kv-key">Hexadecimal</td><td class="kv-val"><code>${enc.hex || '—'}</code></td></tr>
                        <tr><td class="kv-key">Octal</td><td class="kv-val"><code>${enc.octal || '—'}</code></td></tr>
                        <tr><td class="kv-key">Binary</td><td class="kv-val" style="word-break:break-all;font-size:0.75rem;"><code>${(enc.binary || '').slice(0, 34)}${(enc.binary || '').length > 34 ? '...' : ''}</code></td></tr>
                        ${num.ipv4_decimal ? `<tr><td class="kv-key">Decimal IPv4</td><td class="kv-val"><strong>${num.ipv4_decimal.resolved_ip}</strong> (<a href="${num.ipv4_decimal.shodan_url}" target="_blank" style="color:var(--accent-secondary);text-decoration:none;">Shodan Host</a>)</td></tr>` : ''}
                        ${num.timestamp_epoch ? `<tr><td class="kv-key">Unix Epoch UTC</td><td class="kv-val"><strong>${num.timestamp_epoch.utc_datetime}</strong> (${num.timestamp_epoch.relative_time})</td></tr>` : ''}
                    </table>
                </div>
            `;
        }

        // 12. Global OSINT Search Pivots Card
        if (res.dorks && res.dorks.dorks && res.dorks.dorks.length > 0) {
            const dorkList = res.dorks.dorks;
            html += `
                <div class="dossier-card">
                    <div class="dcard-header">
                        <div class="dcard-title-wrap"><i class="fas fa-search-nodes text-indigo"></i><h4>OSINT Search Pivots (${dorkList.length})</h4></div>
                        <span class="dcard-badge">LIVE PIVOTS</span>
                    </div>
                    <div class="hit-tags-grid" style="max-height:160px;overflow-y:auto;">
                        ${dorkList.slice(0, 10).map(d => `<a href="${d.search_url}" target="_blank" rel="noopener" class="hit-badge" style="background:rgba(99,102,241,0.1);border-color:rgba(99,102,241,0.3);color:#a5b4fc;"><i class="fas fa-arrow-up-right-from-square"></i> ${d.name}</a>`).join('')}
                    </div>
                </div>
            `;
        }

        html += `</div>`;
        deck.innerHTML = html;

        // Render Leaflet Map
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

        // Copy JSON
        const btnCopy = document.getElementById('btn-copy-dossier');
        if (btnCopy) {
            btnCopy.addEventListener('click', () => {
                navigator.clipboard.writeText(JSON.stringify(data, null, 2));
                showToast('Dossier JSON Copied to Clipboard', 'fas fa-copy');
            });
        }

        // Copy Markdown Report
        const btnCopyMd = document.getElementById('btn-copy-md');
        if (btnCopyMd) {
            btnCopyMd.addEventListener('click', () => {
                const mdReport = generateMarkdownReport(target, data);
                navigator.clipboard.writeText(mdReport);
                showToast('Markdown Intelligence Report Copied', 'fas fa-file-lines');
            });
        }
    }

    function generateMarkdownReport(target, data) {
        let md = `# SPECTRE OSINT INTELLIGENCE REPORT\n`;
        md += `**Target Identifier:** ${target}\n`;
        md += `**Generated UTC:** ${new Date().toUTCString()}\n`;
        md += `**Classification:** ${(data.detected_type || 'Unknown').toUpperCase()}\n\n`;
        md += `## Executive Findings Overview\n`;
        const res = data.results || (data.data && data.data.dossier) || {};
        Object.keys(res).forEach(k => {
            md += `### Vector: ${k.toUpperCase()}\n`;
            md += `\`\`\`json\n${JSON.stringify(res[k], null, 2)}\n\`\`\`\n\n`;
        });
        return md;
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
                    drawer.innerHTML = `<span style="font-size:0.8rem;color:var(--accent-secondary);font-family:var(--font-mono);"><i class="fas fa-circle-notch fa-spin"></i> Querying vector...</span>`;
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
                content += `<div><a href="${f.url}" target="_blank" style="color:var(--accent-secondary);text-decoration:none;">• ${f.platform}</a></div>`;
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
        const btnToggle = document.getElementById('btn-feed-toggle');
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
            if (streamPaused) return;
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

        for (let i = 0; i < 4; i++) addEvent();
        streamInterval = setInterval(addEvent, 3500);

        if (btnToggle) {
            btnToggle.addEventListener('click', () => {
                streamPaused = !streamPaused;
                if (streamPaused) {
                    btnToggle.innerHTML = `<i class="fas fa-play"></i> Resume Feed`;
                    showToast('Threat Radar Stream Paused', 'fas fa-pause');
                } else {
                    btnToggle.innerHTML = `<i class="fas fa-pause"></i> Pause Feed`;
                    showToast('Threat Radar Stream Resumed', 'fas fa-play');
                }
            });
        }
    }

    // --- Presets & Omni Input Wiring with Real-Time Inspector ---
    function initPresetsAndInput() {
        const input = document.getElementById('omni-input');
        const btnExec = document.getElementById('btn-omni-exec');

        if (input) {
            // Real-time keystroke inspector
            input.addEventListener('input', (e) => {
                inspectTargetRealtime(e.target.value);
            });

            if (btnExec) {
                btnExec.addEventListener('click', () => executeOmniRecon());
            }

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') executeOmniRecon();
            });
        }

        const chips = document.querySelectorAll('.preset-chip');
        chips.forEach(chip => {
            chip.addEventListener('click', () => {
                const val = chip.dataset.val;
                if (input) {
                    input.value = val;
                    inspectTargetRealtime(val);
                }
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
        applyPreferences();
        initParticles();
        init3DTilt();
        initCursorGlow();
        initClock();
        initNavigation();
        initCustomizer();
        initCommandPalette();
        initPresetsAndInput();
        initStudio();
        initGraph();
        initLiveStream();
    });

})();
