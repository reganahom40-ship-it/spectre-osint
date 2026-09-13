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
    let totalProbesCounter = 0;
    let streamPaused = false;
    let streamInterval = null;

    // --- User Preferences Configuration ---
    const prefs = {
        theme: localStorage.getItem('spectre_theme') || 'indigo',
        glow: localStorage.getItem('spectre_glow') || 'high',
        particles: localStorage.getItem('spectre_particles') !== 'false',
        tilt: localStorage.getItem('spectre_tilt') !== 'false',
        font: localStorage.getItem('spectre_font') || 'sans',
        atmosphere: localStorage.getItem('spectre_atmosphere') || 'neural',
        motion: localStorage.getItem('spectre_motion') || 'normal',
        graphStyle: localStorage.getItem('spectre_graphstyle') || 'technical',
        shape: localStorage.getItem('spectre_shape') || 'dots',
        lineStyle: localStorage.getItem('spectre_linestyle') || 'straight',
        density: parseInt(localStorage.getItem('spectre_density') || '50', 10),
        lineDensity: parseInt(localStorage.getItem('spectre_linedensity') || '50', 10),
        speed: parseInt(localStorage.getItem('spectre_speed') || '100', 10)
    };

    let particleRebuildTrigger = null;

    function applyPreferences() {
        document.documentElement.setAttribute('data-theme', prefs.theme);
        document.documentElement.setAttribute('data-glow', prefs.glow);
        document.documentElement.setAttribute('data-particles', prefs.particles.toString());
        document.documentElement.setAttribute('data-font', prefs.font);
        document.documentElement.setAttribute('data-motion', prefs.motion);
        document.documentElement.setAttribute('data-graphstyle', prefs.graphStyle);

        // Update Theme picker UI
        document.querySelectorAll('.theme-choice').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.t === prefs.theme);
        });

        // Update Glow UI
        document.querySelectorAll('#glow-segmented .seg-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.glow === prefs.glow);
        });

        // Update Motion UI
        document.querySelectorAll('#motion-segmented .seg-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.motion === prefs.motion);
        });

        // Update Graph Style UI
        document.querySelectorAll('#graphstyle-segmented .seg-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.graphstyle === prefs.graphStyle);
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

        // Update Atmosphere UI
        document.querySelectorAll('#atmosphere-grid .atmo-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.atmo === prefs.atmosphere);
        });

        // Update Shape UI
        document.querySelectorAll('#shape-grid .shape-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.shape === prefs.shape);
        });

        // Update Line Style UI
        document.querySelectorAll('#line-grid .line-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.line === prefs.lineStyle);
        });

        // Update Sliders UI
        const sDensity = document.getElementById('slider-density');
        const vDensity = document.getElementById('val-density');
        if (sDensity && vDensity) {
            sDensity.value = prefs.density;
            vDensity.textContent = `${prefs.density}%`;
        }

        const sLineDensity = document.getElementById('slider-linedensity');
        const vLineDensity = document.getElementById('val-linedensity');
        if (sLineDensity && vLineDensity) {
            sLineDensity.value = prefs.lineDensity;
            vLineDensity.textContent = `${prefs.lineDensity}%`;
        }

        const sSpeed = document.getElementById('slider-speed');
        const vSpeed = document.getElementById('val-speed');
        if (sSpeed && vSpeed) {
            sSpeed.value = prefs.speed;
            vSpeed.textContent = `${(prefs.speed / 100).toFixed(1)}x`;
        }

        if (typeof particleRebuildTrigger === 'function') {
            particleRebuildTrigger();
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

    // --- Geometry / Shape Drawing Utilities ---
    function drawParticleShape(ctx, p, shape, size) {
        ctx.beginPath();
        switch (shape) {
            case 'circles':
                ctx.arc(p.x, p.y, size * 1.3, 0, Math.PI * 2);
                ctx.stroke();
                break;
            case 'squares':
                ctx.fillRect(p.x - size, p.y - size, size * 2, size * 2);
                break;
            case 'diamonds':
                ctx.moveTo(p.x, p.y - size * 1.4);
                ctx.lineTo(p.x + size * 1.4, p.y);
                ctx.lineTo(p.x, p.y + size * 1.4);
                ctx.lineTo(p.x - size * 1.4, p.y);
                ctx.closePath();
                ctx.fill();
                break;
            case 'stars': {
                const spikes = 5;
                const outer = size * 1.6;
                const inner = size * 0.7;
                let rot = Math.PI / 2 * 3;
                let x = p.x;
                let y = p.y;
                const step = Math.PI / spikes;
                ctx.moveTo(p.x, p.y - outer);
                for (let i = 0; i < spikes; i++) {
                    x = p.x + Math.cos(rot) * outer;
                    y = p.y + Math.sin(rot) * outer;
                    ctx.lineTo(x, y);
                    rot += step;
                    x = p.x + Math.cos(rot) * inner;
                    y = p.y + Math.sin(rot) * inner;
                    ctx.lineTo(x, y);
                    rot += step;
                }
                ctx.lineTo(p.x, p.y - outer);
                ctx.closePath();
                ctx.fill();
                break;
            }
            case 'hexagons': {
                const sides = 6;
                const r = size * 1.3;
                for (let i = 0; i < sides; i++) {
                    const angle = (i * 2 * Math.PI) / sides;
                    const hx = p.x + r * Math.cos(angle);
                    const hy = p.y + r * Math.sin(angle);
                    if (i === 0) ctx.moveTo(hx, hy);
                    else ctx.lineTo(hx, hy);
                }
                ctx.closePath();
                ctx.fill();
                break;
            }
            case 'crosses': {
                const arm = size * 1.4;
                const thick = size * 0.45;
                ctx.fillRect(p.x - thick, p.y - arm, thick * 2, arm * 2);
                ctx.fillRect(p.x - arm, p.y - thick, arm * 2, thick * 2);
                break;
            }
            case 'hearts': {
                ctx.save();
                ctx.translate(p.x, p.y);
                const s = size * 0.22;
                ctx.scale(s, s);
                ctx.beginPath();
                ctx.moveTo(0, -3);
                ctx.bezierCurveTo(-4, -10, -12, -7, -12, 0);
                ctx.bezierCurveTo(-12, 6, 0, 14, 0, 14);
                ctx.bezierCurveTo(0, 14, 12, 6, 12, 0);
                ctx.bezierCurveTo(12, -7, 4, -10, 0, -3);
                ctx.fill();
                ctx.restore();
                break;
            }
            case 'flowers': {
                ctx.save();
                ctx.translate(p.x, p.y);
                const pr = size * 0.7;
                for (let i = 0; i < 5; i++) {
                    const angle = (i * 2 * Math.PI) / 5;
                    ctx.beginPath();
                    ctx.arc(Math.cos(angle) * pr, Math.sin(angle) * pr, pr * 0.6, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.beginPath();
                ctx.arc(0, 0, pr * 0.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                break;
            }
            case 'dots':
            default:
                ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
                ctx.fill();
                break;
        }
    }

    function drawConnectionLine(ctx, p1, p2, style, dist, maxDist, baseColor) {
        ctx.save();
        const alpha = Math.max(0, 1 - dist / maxDist) * 0.42;

        switch (style) {
            case 'dotted':
                ctx.setLineDash([2, 3]);
                ctx.strokeStyle = `rgba(99, 102, 241, ${alpha * 1.1})`;
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
                break;
            case 'dashed':
                ctx.setLineDash([6, 5]);
                ctx.strokeStyle = `rgba(6, 182, 212, ${alpha * 1.3})`;
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
                break;
            case 'glow':
                ctx.shadowBlur = 10;
                ctx.shadowColor = 'rgba(99, 102, 241, 0.7)';
                ctx.strokeStyle = `rgba(168, 85, 247, ${alpha * 1.6})`;
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
                break;
            case 'thin':
                ctx.lineWidth = 0.6;
                ctx.strokeStyle = `rgba(148, 163, 184, ${alpha * 0.8})`;
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
                break;
            case 'orbital': {
                ctx.strokeStyle = `rgba(6, 182, 212, ${alpha * 1.1})`;
                ctx.beginPath();
                const midX = (p1.x + p2.x) / 2 + (p1.y - p2.y) * 0.2;
                const midY = (p1.y + p2.y) / 2 + (p2.x - p1.x) * 0.2;
                ctx.moveTo(p1.x, p1.y);
                ctx.quadraticCurveTo(midX, midY, p2.x, p2.y);
                ctx.stroke();
                break;
            }
            case 'straight':
            default:
                ctx.strokeStyle = `rgba(99, 102, 241, ${alpha})`;
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
                break;
        }
        ctx.restore();
    }

    // --- Interactive Atmospheric Particle Engine ---
    function initParticles() {
        const canvas = document.getElementById('bg-particles-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let width = canvas.width = window.innerWidth;
        let height = canvas.height = window.innerHeight;

        window.addEventListener('resize', () => {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
            rebuildParticles();
        });

        let particles = [];

        function rebuildParticles() {
            particles = [];
            if (prefs.atmosphere === 'off') return;
            const baseCount = Math.floor((width / 26) * (prefs.density / 50));
            const count = Math.max(12, Math.min(baseCount, 130));
            const motionMult = prefs.motion === 'off' ? 0 : prefs.motion === 'subtle' ? 0.35 : prefs.motion === 'cinematic' ? 1.35 : 0.7;
            const speedFactor = (prefs.speed / 100) * motionMult;

            for (let i = 0; i < count; i++) {
                const depth = Math.random() * 0.7 + 0.3; // depth scale 0.3 - 1.0
                particles.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    vx: (Math.random() - 0.5) * speedFactor * depth,
                    vy: (prefs.shape === 'hearts' || prefs.shape === 'flowers') ? -(Math.random() * 0.4 + 0.2) * speedFactor : (Math.random() - 0.5) * speedFactor * depth,
                    size: (Math.random() * 2 + 1.2) * depth,
                    depth: depth,
                    baseAlpha: 0.2 + depth * 0.5,
                    phase: Math.random() * Math.PI * 2,
                    twinkleSpeed: Math.random() * 0.03 + 0.015
                });
            }
        }

        particleRebuildTrigger = rebuildParticles;
        rebuildParticles();

        let mouseX = -1000;
        let mouseY = -1000;
        window.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
            document.documentElement.style.setProperty('--mouse-x', `${mouseX}px`);
            document.documentElement.style.setProperty('--mouse-y', `${mouseY}px`);
        });

        function animate() {
            if (!prefs.particles || prefs.atmosphere === 'off' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                ctx.clearRect(0, 0, width, height);
                requestAnimationFrame(animate);
                return;
            }

            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = 'rgba(99, 102, 241, 0.75)';
            ctx.strokeStyle = 'rgba(99, 102, 241, 0.6)';

            const maxLineDist = 65 + (prefs.lineDensity * 0.95);
            const shape = prefs.shape || 'dots';
            const lineStyle = prefs.lineStyle || 'straight';

            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                p.phase += p.twinkleSpeed;

                // Gentle Cursor Repulsion / Attraction Reaction
                const mdx = p.x - mouseX;
                const mdy = p.y - mouseY;
                const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
                if (mdist < 120 && mdist > 2) {
                    const force = (1 - mdist / 120) * 0.6;
                    p.x += (mdx / mdist) * force;
                    p.y += (mdy / mdist) * force;
                }

                if (shape === 'hearts' || shape === 'flowers') {
                    p.x += Math.sin(p.phase) * 0.3;
                    p.y += p.vy;
                } else {
                    p.x += p.vx;
                    p.y += p.vy;
                }

                if (p.x < -20) p.x = width + 20;
                if (p.x > width + 20) p.x = -20;
                if (p.y < -20) p.y = height + 20;
                if (p.y > height + 20) p.y = -20;

                const twAlpha = p.baseAlpha + Math.sin(p.phase) * 0.2;
                ctx.save();
                ctx.globalAlpha = Math.max(0.12, Math.min(twAlpha, 0.9));

                drawParticleShape(ctx, p, shape, p.size);
                ctx.restore();

                if (prefs.lineDensity > 0 && shape !== 'hearts' && shape !== 'flowers') {
                    for (let j = i + 1; j < particles.length; j++) {
                        const p2 = particles[j];
                        const dx = p.x - p2.x;
                        const dy = p.y - p2.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);

                        if (dist < maxLineDist) {
                            drawConnectionLine(ctx, p, p2, lineStyle, dist, maxLineDist);
                        }
                    }
                }

                // Interactive Mouse Connection Glow
                if (mdist < 140) {
                    ctx.save();
                    ctx.strokeStyle = `rgba(6, 182, 212, ${0.45 * (1 - mdist / 140)})`;
                    ctx.lineWidth = 0.8;
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(mouseX, mouseY);
                    ctx.stroke();
                    ctx.restore();
                }
            }
            requestAnimationFrame(animate);
        }
        animate();
    }

    // --- Magnetic Interactive Cards & 3D Tilt ---
    function initMagneticCards() {
        const vcards = document.querySelectorAll('.ops-vcard, .studio-card');
        vcards.forEach(card => {
            card.addEventListener('mousemove', (e) => {
                if (!prefs.tilt || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const cx = rect.width / 2;
                const cy = rect.height / 2;
                const rotX = ((y - cy) / cy) * -3.2; // max ~3 deg
                const rotY = ((x - cx) / cx) * 3.2;
                const transX = ((x - cx) / cx) * 2; // max 2px
                const transY = ((y - cy) / cy) * 2 - 4;
                card.style.transform = `perspective(800px) rotateX(${rotX}deg) rotateY(${rotY}deg) translate(${transX}px, ${transY}px)`;
            });
            card.addEventListener('mouseleave', () => {
                card.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) translate(0px, 0px)';
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

        // Atmosphere Presets (10 Full Presets)
        document.querySelectorAll('#atmosphere-grid .atmo-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const atmo = btn.dataset.atmo;
                prefs.atmosphere = atmo;
                localStorage.setItem('spectre_atmosphere', atmo);

                if (atmo === 'neural') {
                    prefs.shape = 'dots';
                    prefs.lineStyle = 'straight';
                    prefs.density = 50;
                    prefs.lineDensity = 50;
                    prefs.speed = 100;
                } else if (atmo === 'constellation') {
                    prefs.shape = 'dots';
                    prefs.lineStyle = 'straight';
                    prefs.density = 60;
                    prefs.lineDensity = 65;
                    prefs.speed = 50;
                } else if (atmo === 'particles') {
                    prefs.shape = 'circles';
                    prefs.lineStyle = 'straight';
                    prefs.density = 75;
                    prefs.lineDensity = 0;
                    prefs.speed = 120;
                } else if (atmo === 'orbital') {
                    prefs.shape = 'circles';
                    prefs.lineStyle = 'orbital';
                    prefs.density = 40;
                    prefs.lineDensity = 50;
                    prefs.speed = 90;
                } else if (atmo === 'geometric') {
                    prefs.shape = 'hexagons';
                    prefs.lineStyle = 'dotted';
                    prefs.density = 45;
                    prefs.lineDensity = 40;
                    prefs.speed = 70;
                } else if (atmo === 'hearts') {
                    prefs.shape = 'hearts';
                    prefs.lineStyle = 'thin';
                    prefs.density = 35;
                    prefs.lineDensity = 20;
                    prefs.speed = 60;
                } else if (atmo === 'flowers') {
                    prefs.shape = 'flowers';
                    prefs.lineStyle = 'thin';
                    prefs.density = 35;
                    prefs.lineDensity = 20;
                    prefs.speed = 60;
                } else if (atmo === 'stars') {
                    prefs.shape = 'stars';
                    prefs.lineStyle = 'glow';
                    prefs.density = 65;
                    prefs.lineDensity = 30;
                    prefs.speed = 50;
                } else if (atmo === 'minimal') {
                    prefs.shape = 'dots';
                    prefs.lineStyle = 'thin';
                    prefs.density = 20;
                    prefs.lineDensity = 15;
                    prefs.speed = 40;
                } else if (atmo === 'off') {
                    prefs.density = 0;
                    prefs.lineDensity = 0;
                    prefs.speed = 0;
                }

                localStorage.setItem('spectre_shape', prefs.shape);
                localStorage.setItem('spectre_linestyle', prefs.lineStyle);
                localStorage.setItem('spectre_density', prefs.density);
                localStorage.setItem('spectre_linedensity', prefs.lineDensity);
                localStorage.setItem('spectre_speed', prefs.speed);

                applyPreferences();
                playTone(600, 'sine', 0.08);
                showToast(`Ambient Scene: ${atmo.toUpperCase()}`, 'fas fa-meteor');
            });
        });

        // Motion Intensity segment
        document.querySelectorAll('#motion-segmented .seg-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const m = btn.dataset.motion;
                savePref('motion', m);
                playTone(630, 'sine', 0.06);
                showToast(`Motion Dynamics: ${m.toUpperCase()}`, 'fas fa-wind');
            });
        });

        // Graph Style segment
        document.querySelectorAll('#graphstyle-segmented .seg-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const gs = btn.dataset.graphstyle;
                savePref('graphStyle', gs);
                playTone(650, 'sine', 0.06);
                showToast(`Topology Style: ${gs.toUpperCase()}`, 'fas fa-circle-nodes');
                if (networkGraph) networkGraph.redraw();
            });
        });

        // Particle Shape Choices
        document.querySelectorAll('#shape-grid .shape-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const s = btn.dataset.shape;
                prefs.shape = s;
                prefs.atmosphere = 'custom';
                localStorage.setItem('spectre_shape', s);
                localStorage.setItem('spectre_atmosphere', 'custom');
                applyPreferences();
                playTone(640, 'sine', 0.06);
                showToast(`Particle Shape: ${s.toUpperCase()}`, 'fas fa-shapes');
            });
        });

        // Connection Line Style Choices
        document.querySelectorAll('#line-grid .line-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const l = btn.dataset.line;
                prefs.lineStyle = l;
                prefs.atmosphere = 'custom';
                localStorage.setItem('spectre_linestyle', l);
                localStorage.setItem('spectre_atmosphere', 'custom');
                applyPreferences();
                playTone(640, 'sine', 0.06);
                showToast(`Line Style: ${l.toUpperCase()}`, 'fas fa-bezier-curve');
            });
        });

        // Sliders Listeners
        const sDensity = document.getElementById('slider-density');
        if (sDensity) {
            sDensity.addEventListener('input', (e) => {
                const val = parseInt(e.target.value, 10);
                prefs.density = val;
                prefs.atmosphere = 'custom';
                localStorage.setItem('spectre_density', val);
                localStorage.setItem('spectre_atmosphere', 'custom');
                const v = document.getElementById('val-density');
                if (v) v.textContent = `${val}%`;
                if (typeof particleRebuildTrigger === 'function') particleRebuildTrigger();
            });
        }

        const sLineDensity = document.getElementById('slider-linedensity');
        if (sLineDensity) {
            sLineDensity.addEventListener('input', (e) => {
                const val = parseInt(e.target.value, 10);
                prefs.lineDensity = val;
                prefs.atmosphere = 'custom';
                localStorage.setItem('spectre_linedensity', val);
                localStorage.setItem('spectre_atmosphere', 'custom');
                const v = document.getElementById('val-linedensity');
                if (v) v.textContent = `${val}%`;
            });
        }

        const sSpeed = document.getElementById('slider-speed');
        if (sSpeed) {
            sSpeed.addEventListener('input', (e) => {
                const val = parseInt(e.target.value, 10);
                prefs.speed = val;
                prefs.atmosphere = 'custom';
                localStorage.setItem('spectre_speed', val);
                localStorage.setItem('spectre_atmosphere', 'custom');
                const v = document.getElementById('val-speed');
                if (v) v.textContent = `${(val / 100).toFixed(1)}x`;
                if (typeof particleRebuildTrigger === 'function') particleRebuildTrigger();
            });
        }

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
                prefs.atmosphere = 'neural';
                prefs.shape = 'dots';
                prefs.lineStyle = 'straight';
                prefs.density = 50;
                prefs.lineDensity = 50;
                prefs.speed = 100;
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
            if (!list) return;
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
            if (!backdrop) return;
            backdrop.classList.add('active');
            if (input) {
                input.value = '';
                renderList();
                setTimeout(() => input.focus(), 50);
            }
            playTone(600, 'sine', 0.06);
        }

        function closePalette() {
            if (backdrop) backdrop.classList.remove('active');
        }

        if (btnOpen) btnOpen.addEventListener('click', openPalette);
        if (backdrop) {
            backdrop.addEventListener('click', (e) => {
                if (e.target === backdrop) closePalette();
            });
        }

        if (input) {
            input.addEventListener('input', (e) => renderList(e.target.value));
        }

        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                if (backdrop && backdrop.classList.contains('active')) closePalette();
                else if (backdrop) openPalette();
            } else if (e.key === 'Escape' && backdrop && backdrop.classList.contains('active')) {
                closePalette();
            } else if (e.key === 'Enter' && backdrop && backdrop.classList.contains('active')) {
                if (list) {
                    const sel = list.querySelector('.palette-item.selected') || list.querySelector('.palette-item');
                    if (sel) sel.click();
                }
            }
        });
    }

    // --- Vis.js Topology Graph ---
    let latestTargetNodeId = 'spectre';
    let autoRotate = false;
    let autoRotateFrame = null;
    let originalNodeStyles = {};
    let originalEdgeStyles = {};

    function updateGraphNodeCount() {
        const badge = document.getElementById('graph-node-count');
        if (badge && networkGraph) {
            const count = networkGraph.body.data.nodes.length;
            badge.textContent = `${count} NODES`;
        }
    }

    function initGraph(containerId = 'vis-full-canvas') {
        const container = document.getElementById(containerId);
        if (!container) return;

        const data = {
            nodes: new vis.DataSet([
                { id: 'spectre', label: 'SPECTRE CORE', type: 'CORE', meta: 'Central Neural Aggregator • Status: Active', color: { background: '#312e81', border: '#818cf8', highlight: { background: '#4338ca', border: '#a5b4fc' } }, shape: 'dot', size: 28, font: { color: '#ffffff', face: 'Plus Jakarta Sans', size: 13, weight: '700', strokeWidth: 2, strokeColor: '#04060a' } },
                { id: 'coord_1', label: 'POINT-α (IP/BGP)', type: 'VECTOR', meta: 'Network Ingestion Gateway • Latency: 12ms', color: { background: '#1e293b', border: '#6366f1', highlight: { background: '#334155', border: '#06b6d4' } }, shape: 'dot', size: 16, font: { color: '#cbd5e1', face: 'JetBrains Mono', size: 11, weight: '600' } },
                { id: 'coord_2', label: 'POINT-β (OSINT)', type: 'VECTOR', meta: 'Social & Identity Discovery Mesh', color: { background: '#1e293b', border: '#6366f1', highlight: { background: '#334155', border: '#06b6d4' } }, shape: 'dot', size: 16, font: { color: '#cbd5e1', face: 'JetBrains Mono', size: 11, weight: '600' } },
                { id: 'coord_3', label: 'POINT-γ (DNS)', type: 'VECTOR', meta: 'Infrastructure & Subdomain Enumerator', color: { background: '#1e293b', border: '#6366f1', highlight: { background: '#334155', border: '#06b6d4' } }, shape: 'dot', size: 16, font: { color: '#cbd5e1', face: 'JetBrains Mono', size: 11, weight: '600' } },
                { id: 'coord_4', label: 'POINT-δ (THREAT)', type: 'VECTOR', meta: 'Threat Telemetry & Anomaly Radar', color: { background: '#1e293b', border: '#6366f1', highlight: { background: '#334155', border: '#06b6d4' } }, shape: 'dot', size: 16, font: { color: '#cbd5e1', face: 'JetBrains Mono', size: 11, weight: '600' } }
            ]),
            edges: new vis.DataSet([
                { id: 'e_coord_1', from: 'spectre', to: 'coord_1', color: { color: 'rgba(99,102,241,0.3)', highlight: 'rgba(6,182,212,0.9)' }, width: 1.5, dashes: true },
                { id: 'e_coord_2', from: 'spectre', to: 'coord_2', color: { color: 'rgba(99,102,241,0.3)', highlight: 'rgba(6,182,212,0.9)' }, width: 1.5, dashes: true },
                { id: 'e_coord_3', from: 'spectre', to: 'coord_3', color: { color: 'rgba(99,102,241,0.3)', highlight: 'rgba(6,182,212,0.9)' }, width: 1.5, dashes: true },
                { id: 'e_coord_4', from: 'spectre', to: 'coord_4', color: { color: 'rgba(99,102,241,0.3)', highlight: 'rgba(6,182,212,0.9)' }, width: 1.5, dashes: true }
            ])
        };

        const options = {
            physics: {
                stabilization: { iterations: 140 },
                barnesHut: { gravitationalConstant: -4200, springLength: 145, springConstant: 0.045, damping: 0.09 }
            },
            interaction: { hover: true, tooltipDelay: 80, zoomView: true, dragView: true }
        };

        networkGraph = new vis.Network(container, data, options);
        updateGraphNodeCount();

        // Fit gracefully after layout stabilization
        setTimeout(() => {
            if (networkGraph) {
                networkGraph.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
            }
        }, 150);

        // Subtle Mouse Parallax on Stage
        const stage = document.getElementById('spatial-graph-stage');
        if (stage) {
            stage.addEventListener('mousemove', (e) => {
                const rect = stage.getBoundingClientRect();
                const ox = ((e.clientX - rect.left) / rect.width - 0.5) * 6;
                const oy = ((e.clientY - rect.top) / rect.height - 0.5) * 6;
                container.style.transform = `translate(${ox}px, ${oy}px)`;
            });
            stage.addEventListener('mouseleave', () => {
                container.style.transform = 'translate(0px, 0px)';
            });
        }

        // Node Hover: Edge brightening, neighbor shadow aura & cursor
        networkGraph.on('hoverNode', function (params) {
            container.style.cursor = 'pointer';
            const nodeId = params.node;
            try {
                const connectedEdges = networkGraph.getConnectedEdges(nodeId);
                connectedEdges.forEach(eid => {
                    networkGraph.body.data.edges.update({ id: eid, width: 3, color: { color: '#06b6d4', opacity: 1 } });
                });
                const connectedNodes = networkGraph.getConnectedNodes(nodeId);
                connectedNodes.forEach(nid => {
                    networkGraph.body.data.nodes.update({ id: nid, shadow: { enabled: true, color: '#06b6d4', size: 10 } });
                });
            } catch (e) {}
        });

        networkGraph.on('blurNode', function (params) {
            container.style.cursor = 'default';
            const nodeId = params.node;
            try {
                const connectedEdges = networkGraph.getConnectedEdges(nodeId);
                connectedEdges.forEach(eid => {
                    networkGraph.body.data.edges.update({ id: eid, width: 1.5, color: { color: 'rgba(99,102,241,0.3)', opacity: 0.5 } });
                });
                const connectedNodes = networkGraph.getConnectedNodes(nodeId);
                connectedNodes.forEach(nid => {
                    networkGraph.body.data.nodes.update({ id: nid, shadow: { enabled: false } });
                });
            } catch (e) {}
        });

        // Click-to-Focus & Node Inspection Popover with Dominance Feedback
        networkGraph.on('selectNode', function (params) {
            if (params.nodes.length > 0) {
                const nodeId = params.nodes[0];
                showNodeInspectionPopover(nodeId);
                networkGraph.focus(nodeId, {
                    scale: 1.35,
                    animation: { duration: 380, easingFunction: 'easeInOutQuad' }
                });
                playTone(720, 'sine', 0.06);

                try {
                    const connectedEdges = new Set(networkGraph.getConnectedEdges(nodeId));
                    const allEdges = networkGraph.body.data.edges.get();
                    allEdges.forEach(edge => {
                        if (connectedEdges.has(edge.id)) {
                            networkGraph.body.data.edges.update({ id: edge.id, width: 3, color: { color: '#06b6d4', opacity: 1 } });
                        } else {
                            networkGraph.body.data.edges.update({ id: edge.id, width: 0.6, color: { color: 'rgba(255,255,255,0.06)', opacity: 0.15 } });
                        }
                    });
                } catch (e) {}
            }
        });

        networkGraph.on('deselectNode', function () {
            hideNodeInspectionPopover();
            try {
                const allEdges = networkGraph.body.data.edges.get();
                allEdges.forEach(edge => {
                    networkGraph.body.data.edges.update({ id: edge.id, width: 1.5, color: { color: 'rgba(99,102,241,0.3)', opacity: 0.5 } });
                });
            } catch (e) {}
        });

        // Double-Click Deep Focus
        networkGraph.on('doubleClick', function (params) {
            if (params.nodes.length > 0) {
                const nodeId = params.nodes[0];
                networkGraph.focus(nodeId, {
                    scale: 1.65,
                    animation: { duration: 400, easingFunction: 'easeInOutQuad' }
                });
                playTone(840, 'sine', 0.08);
            }
        });

        // ESC Key Listener: Clear selection & close popover
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (networkGraph) networkGraph.unselectAll();
                hideNodeInspectionPopover();
            }
        });

        // Toolbar: Fit View
        const btnFit = document.getElementById('btn-graph-fit');
        if (btnFit) btnFit.addEventListener('click', () => {
            networkGraph.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
            playTone(600, 'sine', 0.05);
            hideNodeInspectionPopover();
        });

        // Toolbar: Focus Target
        const btnFocusTarget = document.getElementById('btn-graph-focus-target');
        if (btnFocusTarget) btnFocusTarget.addEventListener('click', () => {
            if (networkGraph) {
                const targetNode = networkGraph.body.data.nodes.get(latestTargetNodeId) ? latestTargetNodeId : 'spectre';
                window.focusGraphNode(targetNode);
                playTone(680, 'sine', 0.06);
            }
        });

        // Toolbar: Auto Rotate Loop
        const btnAutoRotate = document.getElementById('btn-graph-autorotate');
        const lblAutoRotate = document.getElementById('lbl-autorotate');
        if (btnAutoRotate) {
            btnAutoRotate.addEventListener('click', () => {
                autoRotate = !autoRotate;
                btnAutoRotate.classList.toggle('active', autoRotate);
                if (lblAutoRotate) {
                    lblAutoRotate.innerHTML = autoRotate ? `<span class="pulse-dot"></span> Rotate: On` : `Rotate: Off`;
                }
                if (autoRotate) {
                    playTone(750, 'sine', 0.06);
                    showToast('Auto-Rotate Engaged', 'fas fa-arrows-rotate');
                    runAutoRotate();
                } else {
                    if (autoRotateFrame) cancelAnimationFrame(autoRotateFrame);
                    showToast('Auto-Rotate Disengaged', 'fas fa-pause');
                }
            });
        }

        function runAutoRotate() {
            if (!autoRotate || !networkGraph) return;
            try {
                const pos = networkGraph.getViewPosition();
                const currentScale = networkGraph.getScale();
                networkGraph.moveTo({
                    position: { x: pos.x + Math.sin(Date.now() * 0.001) * 0.4, y: pos.y + Math.cos(Date.now() * 0.001) * 0.4 },
                    scale: currentScale
                });
            } catch (e) {}
            autoRotateFrame = requestAnimationFrame(runAutoRotate);
        }

        // Toolbar: Reset Network
        const btnReset = document.getElementById('btn-graph-reset');
        if (btnReset) {
            btnReset.addEventListener('click', () => {
                initGraph(containerId);
                hideNodeInspectionPopover();
                showToast('Topology Graph Reset', 'fas fa-rotate');
            });
        }

        // Toolbar: Fullscreen Toggle
        const btnFullscreen = document.getElementById('btn-graph-fullscreen');
        if (btnFullscreen && stage) {
            btnFullscreen.addEventListener('click', () => {
                stage.classList.toggle('fullscreen-stage');
                const isFull = stage.classList.contains('fullscreen-stage');
                btnFullscreen.innerHTML = isFull ? `<i class="fas fa-down-left-and-up-right-to-center"></i>` : `<i class="fas fa-up-right-and-down-left-from-center"></i>`;
                setTimeout(() => {
                    if (networkGraph) {
                        networkGraph.redraw();
                        networkGraph.fit({ animation: { duration: 300, easingFunction: 'easeInOutQuad' } });
                    }
                }, 100);
            });
        }

        // Popover Controls
        const btnGnpClose = document.getElementById('btn-gnp-close');
        if (btnGnpClose) btnGnpClose.addEventListener('click', hideNodeInspectionPopover);

        const btnGnpFocus = document.getElementById('btn-gnp-focus');
        if (btnGnpFocus) {
            btnGnpFocus.addEventListener('click', () => {
                const nid = btnGnpFocus.dataset.nodeId;
                if (nid && networkGraph) {
                    networkGraph.focus(nid, { scale: 1.5, animation: { duration: 350, easingFunction: 'easeInOutQuad' } });
                    playTone(800, 'sine', 0.06);
                }
            });
        }

        const btnGnpCopy = document.getElementById('btn-gnp-copy');
        if (btnGnpCopy) {
            btnGnpCopy.addEventListener('click', () => {
                const text = btnGnpCopy.dataset.copyText || '';
                navigator.clipboard.writeText(text);
                showToast(`Copied: ${text}`, 'fas fa-copy');
                playTone(880, 'sine', 0.05);
            });
        }

        window.addEventListener('resize', () => {
            if (networkGraph) {
                networkGraph.redraw();
            }
        });
    }

    // Node Inspection Popover Display
    function showNodeInspectionPopover(nodeId) {
        const popover = document.getElementById('graph-node-popover');
        if (!popover || !networkGraph) return;
        const node = networkGraph.body.data.nodes.get(nodeId);
        if (!node) return;

        const lbl = document.getElementById('gnp-label');
        const type = document.getElementById('gnp-type');
        const meta = document.getElementById('gnp-meta');
        const btnFocus = document.getElementById('btn-gnp-focus');
        const btnCopy = document.getElementById('btn-gnp-copy');

        if (lbl) lbl.textContent = node.label || nodeId;
        if (type) type.textContent = node.type || 'NODE';
        if (meta) meta.textContent = node.meta || `Connected to active intelligence graph (${networkGraph.getConnectedNodes(nodeId).length} links).`;
        if (btnFocus) btnFocus.dataset.nodeId = nodeId;
        if (btnCopy) btnCopy.dataset.copyText = node.label ? node.label.replace(/^TARGET:\s*|^IP:\s*|^DOMAIN:\s*|^ASN:\s*/, '') : nodeId;

        popover.style.display = 'block';
    }

    function hideNodeInspectionPopover() {
        const popover = document.getElementById('graph-node-popover');
        if (popover) popover.style.display = 'none';
    }

    // Global helper to focus node by ID from any dossier card
    window.focusGraphNode = function (nodeId) {
        if (!networkGraph) return;
        try {
            const exists = networkGraph.body.data.nodes.get(nodeId);
            if (!exists) return;

            networkGraph.selectNodes([nodeId]);
            networkGraph.focus(nodeId, {
                scale: 1.4,
                animation: { duration: 400, easingFunction: 'easeInOutQuad' }
            });
            showNodeInspectionPopover(nodeId);
            playTone(760, 'sine', 0.08);

            // Scroll smoothly towards topology if not in view
            const graphEl = document.getElementById('spatial-graph-stage');
            if (graphEl) {
                const rect = graphEl.getBoundingClientRect();
                if (rect.top < 0 || rect.bottom > window.innerHeight) {
                    graphEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        } catch (e) {
            console.error('Focus node error', e);
        }
    };

    // Progressive Node Addition with Timed Cascade Animation
    function updateGraphWithTarget(target, data) {
        if (!networkGraph) return;
        try {
            const nodes = networkGraph.body.data.nodes;
            const edges = networkGraph.body.data.edges;

            const tNodeId = `target_${Date.now()}`;
            latestTargetNodeId = tNodeId;

            // Direct Engine Topology Ingestion
            if (data.graph && data.graph.nodes && data.graph.nodes.length > 1) {
                const gNodes = data.graph.nodes;
                const gEdges = data.graph.edges || [];
                const rootId = gNodes[0].id;
                latestTargetNodeId = rootId;

                try {
                    edges.add({ id: `e_root_${rootId}`, from: 'spectre', to: rootId, color: { color: '#00f0ff' }, width: 2, arrows: 'to' });
                } catch (e) {}

                gNodes.forEach((gn, idx) => {
                    setTimeout(() => {
                        if (!nodes.get(gn.id)) {
                            nodes.add({
                                id: gn.id,
                                label: gn.label,
                                type: gn.group || 'INTEL_NODE',
                                meta: gn.title || `${gn.label} (${gn.group || 'NODE'})`,
                                color: gn.color || '#00f0ff',
                                shape: gn.shape || 'dot',
                                size: gn.size || 14,
                                font: { color: '#e2e8f0', face: 'JetBrains Mono', size: 10 }
                            });
                        }
                    }, idx * 25);
                });

                gEdges.forEach((ge, idx) => {
                    setTimeout(() => {
                        const edgeId = `ge_${ge.from}_${ge.to}`;
                        if (!edges.get(edgeId)) {
                            edges.add({
                                id: edgeId,
                                from: ge.from,
                                to: ge.to,
                                label: ge.label || '',
                                color: ge.color || { color: 'rgba(0,240,255,0.45)' },
                                arrows: 'to',
                                font: { color: 'rgba(255,255,255,0.45)', size: 9, align: 'middle' }
                            });
                        }
                    }, (gNodes.length * 25) + (idx * 20));
                });

                setTimeout(() => {
                    updateGraphNodeCount();
                    networkGraph.fit({ animation: { duration: 500, easingFunction: 'easeInOutQuad' } });
                }, (gNodes.length * 25) + (gEdges.length * 20) + 80);
                return;
            }

            // 1. Root Target Node Fallback
            nodes.add({
                id: tNodeId,
                label: `TARGET: ${target}`,
                type: 'TARGET ROOT',
                meta: `Root target entity investigated at ${new Date().toLocaleTimeString()}`,
                color: '#6366f1',
                shape: 'dot',
                size: 24,
                font: { color: '#fff', face: 'JetBrains Mono', size: 13, strokeWidth: 2, strokeColor: '#000' }
            });
            edges.add({ id: `e_root_${tNodeId}`, from: 'spectre', to: tNodeId, color: { color: '#6366f1' }, width: 2, arrows: 'to' });

            const res = data.results || (data.data && data.data.dossier) || {};
            
            // 2. IP & Location (Staggered 60ms)
            setTimeout(() => {
                if (res.ip && !res.ip.error) {
                    const ipNodeId = `res_ip_${Date.now()}`;
                    nodes.add({
                        id: ipNodeId,
                        label: `IP: ${res.ip.ip || target}`,
                        type: 'IP ROUTE',
                        meta: `ISP: ${res.ip.org || res.ip.isp || 'Public IP'} • Geo: ${res.ip.city || ''}, ${res.ip.country || ''}`,
                        color: '#10b981',
                        shape: 'dot',
                        size: 16,
                        font: { color: '#6ee7b7', face: 'JetBrains Mono', size: 11 }
                    });
                    edges.add({ id: `e_${ipNodeId}`, from: tNodeId, to: ipNodeId, color: { color: 'rgba(16,185,129,0.6)' }, width: 1.5 });

                    if (res.ip.city || res.ip.country) {
                        const locNodeId = `res_loc_${Date.now()}`;
                        nodes.add({
                            id: locNodeId,
                            label: `${res.ip.city || ''}, ${res.ip.country || ''}`,
                            type: 'GEOLOCATION',
                            meta: `Lat: ${res.ip.lat || '—'}, Lon: ${res.ip.lon || '—'}`,
                            color: '#06b6d4',
                            shape: 'dot',
                            size: 12,
                            font: { color: '#94a3b8', face: 'JetBrains Mono', size: 10 }
                        });
                        edges.add({ id: `e_${locNodeId}`, from: ipNodeId, to: locNodeId, color: { color: 'rgba(6,182,212,0.45)' } });
                    }
                    updateGraphNodeCount();
                }
            }, 60);

            // 3. BGP ASN (Staggered 120ms)
            setTimeout(() => {
                if (res.bgp && !res.bgp.error) {
                    const bgpNodeId = `res_bgp_${Date.now()}`;
                    nodes.add({
                        id: bgpNodeId,
                        label: `ASN: ${res.bgp.asn || target}`,
                        type: 'BGP AUTONOMOUS SYSTEM',
                        meta: `Holder: ${res.bgp.holder || 'BGP Carrier'} • ${res.bgp.prefixes ? res.bgp.prefixes.length : 0} routes`,
                        color: '#f59e0b',
                        shape: 'dot',
                        size: 16,
                        font: { color: '#fcd34d', face: 'JetBrains Mono', size: 11 }
                    });
                    edges.add({ id: `e_${bgpNodeId}`, from: tNodeId, to: bgpNodeId, color: { color: 'rgba(245,158,11,0.6)' }, width: 1.5 });
                    updateGraphNodeCount();
                }
            }, 120);

            // 4. Social / Username Found Nodes (Staggered 180ms)
            setTimeout(() => {
                if (res.username && !res.username.error && res.username.found) {
                    const hits = res.username.found.slice(0, 4);
                    hits.forEach((h, idx) => {
                        const uNodeId = `res_u_${idx}_${Date.now()}`;
                        nodes.add({
                            id: uNodeId,
                            label: `${h.platform}`,
                            type: 'SOCIAL PLATFORM',
                            meta: `Account URL: ${h.url || 'Discovered Profile'}`,
                            color: '#06b6d4',
                            shape: 'dot',
                            size: 13,
                            font: { color: '#67e8f9', face: 'JetBrains Mono', size: 10 }
                        });
                        edges.add({ id: `e_${uNodeId}`, from: tNodeId, to: uNodeId, color: { color: 'rgba(6,182,212,0.45)' } });
                    });
                    updateGraphNodeCount();
                }
            }, 180);

            // 5. Domain & Subdomains Nodes (Staggered 240ms)
            setTimeout(() => {
                if (res.domain && !res.domain.error) {
                    const domNodeId = `res_dom_${Date.now()}`;
                    nodes.add({
                        id: domNodeId,
                        label: `DOMAIN: ${res.domain.domain || target}`,
                        type: 'DNS INFRASTRUCTURE',
                        meta: `Registrar: ${res.domain.registrar || 'ICANN Registry'}`,
                        color: '#8b5cf6',
                        shape: 'dot',
                        size: 16,
                        font: { color: '#c4b5fd', face: 'JetBrains Mono', size: 11 }
                    });
                    edges.add({ id: `e_${domNodeId}`, from: tNodeId, to: domNodeId, color: { color: 'rgba(139,92,246,0.6)' }, width: 1.5 });

                    if (res.domain.subdomains_ct) {
                        res.domain.subdomains_ct.slice(0, 3).forEach((sub, idx) => {
                            const sNodeId = `res_sub_${idx}_${Date.now()}`;
                            nodes.add({
                                id: sNodeId,
                                label: `${sub}`,
                                type: 'SUBDOMAIN',
                                meta: `Parent: ${res.domain.domain}`,
                                color: '#a855f7',
                                shape: 'dot',
                                size: 11,
                                font: { color: '#94a3b8', face: 'JetBrains Mono', size: 10 }
                            });
                            edges.add({ id: `e_${sNodeId}`, from: domNodeId, to: sNodeId, color: { color: 'rgba(168,85,247,0.35)' } });
                        });
                    }
                    updateGraphNodeCount();
                }
            }, 240);

            // 6. Discord Snowflake / Extra metadata (Staggered 300ms)
            setTimeout(() => {
                if (res.discord && !res.discord.error) {
                    const discNodeId = `res_disc_${Date.now()}`;
                    nodes.add({
                        id: discNodeId,
                        label: `Discord: ${res.discord.created_at_utc || 'Epoch'}`,
                        type: 'DISCORD ARTIFACT',
                        meta: `Created UTC: ${res.discord.created_at_utc} • Timestamp: ${res.discord.timestamp_ms}`,
                        color: '#a855f7',
                        shape: 'dot',
                        size: 14,
                        font: { color: '#d8b4fe', face: 'JetBrains Mono', size: 10 }
                    });
                    edges.add({ id: `e_${discNodeId}`, from: tNodeId, to: discNodeId, color: { color: 'rgba(168,85,247,0.5)' } });
                    updateGraphNodeCount();
                }

                networkGraph.fit({ animation: { duration: 500, easingFunction: 'easeInOutQuad' } });
            }, 300);

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

            if (resp.status === 403 || data.upgrade_required) {
                if (resultsDeck) {
                    resultsDeck.innerHTML = `
                        <div class="paywall-gate-card">
                            <div class="pg-badge"><i class="fas fa-lock text-amber"></i> QUOTA EXCEEDED</div>
                            <h3>${escapeHtml(data.message || 'Free Investigation Quota Exceeded')}</h3>
                            <p>${escapeHtml(data.detail || 'Free searches are capped. Unlock unlimited queries, raw node exports, and automated correlates with Lifetime or Pro access.')}</p>
                            <div class="pg-actions">
                                <button class="btn-primary" onclick="window.SPECTRE_AUTH.openUpgradeModal('lifetime')"><i class="fas fa-bolt"></i> Unlock Lifetime Access ($99)</button>
                                <button class="btn-secondary" onclick="window.SPECTRE_AUTH.openUpgradeModal('premium')"><i class="fas fa-calendar"></i> Monthly Pro ($19)</button>
                            </div>
                        </div>
                    `;
                }
                playTone(400, 'sawtooth', 0.2);
                showToast(data.message || 'Quota exceeded. Please upgrade.', 'fas fa-lock');
                if (window.SPECTRE_AUTH && window.SPECTRE_AUTH.openUpgradeModal) {
                    window.SPECTRE_AUTH.openUpgradeModal();
                }
                return;
            }

            const executedCount = (data.provenance && data.provenance.length) ? data.provenance.length : 4;
            totalProbesCounter += executedCount;
            const counterEl = document.getElementById('counter-probes');
            if (counterEl) counterEl.textContent = totalProbesCounter.toLocaleString();

            const latencyMeter = document.getElementById('omni-latency-meter');
            if (latencyMeter) latencyMeter.textContent = `${latencyMs}ms`;
            const hudLatency = document.getElementById('hud-avg-latency');
            if (hudLatency) hudLatency.textContent = `${latencyMs}ms`;
            const engineStatus = document.getElementById('engine-status-val');
            if (engineStatus) engineStatus.textContent = 'SYNCHRONIZED';

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

        // Compute dynamic confidence level
        let confidenceText = 'ANALYZED';
        if (data.confidence) {
            confidenceText = String(data.confidence).toUpperCase();
        } else if (data.data && data.data.confidence) {
            confidenceText = String(data.data.confidence).toUpperCase();
        } else if (detectedType === 'PHONE') {
            confidenceText = (res.phone && res.phone.valid) ? '100% VALIDATED E.164' : 'INVALID / UNALLOCATED (0%)';
        } else if (detectedType === 'EMAIL') {
            const mxCount = res.email && res.email.mx_records ? res.email.mx_records.length : 0;
            confidenceText = mxCount > 0 ? `${mxCount} MX HOSTS VERIFIED` : 'NO MX (UNRESOLVED DOMAIN)';
        } else if (detectedType === 'PORT') {
            confidenceText = 'IANA STANDARD PORT';
        } else if (detectedType === 'DISCORD') {
            confidenceText = (res.discord && res.discord.valid) ? 'VERIFIED DISCORD EPOCH' : 'UNUSUAL EPOCH';
        } else if (detectedType === 'IP') {
            confidenceText = 'PUBLIC UNICAST ROUTED';
        } else if (detectedType === 'NUMBER') {
            confidenceText = 'NUMERIC ENCODINGS & MATH';
        } else {
            confidenceText = 'MULTI-VECTOR DISCOVERY';
        }

        const confidenceColor = (confidenceText.includes('INVALID') || confidenceText.includes('UNRESOLVED') || confidenceText.includes('0%')) ? 'var(--accent-rose)' : 'var(--accent-emerald)';

        let previewBanner = '';
        if (data.is_preview) {
            previewBanner = `
                <div class="paywall-gate-card" style="margin-bottom: 20px;">
                    <div class="pg-badge"><i class="fas fa-crown text-amber"></i> FREE PREVIEW ACTIVE (${data.quota_used || 0}/${data.quota_limit || 3} SEARCHES)</div>
                    <h3>Target Synthesized • Partial Intelligence Restricted</h3>
                    <p>You are viewing an automated free preview. Deep correlates, raw graph exports, and unlimited concurrent queries require an active <strong>SPECTRE Membership</strong>.</p>
                    <div class="pg-actions">
                        <button class="btn-primary" onclick="window.SPECTRE_AUTH.openUpgradeModal('lifetime')"><i class="fas fa-bolt"></i> Unlock Full Lifetime Access ($99)</button>
                        <button class="btn-secondary" onclick="window.SPECTRE_AUTH.openUpgradeModal('premium')"><i class="fas fa-calendar"></i> Monthly Pro ($19/mo)</button>
                    </div>
                </div>
            `;
        }

        let html = previewBanner + `
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
                    <span class="kpi-lbl"><i class="fas fa-shield-halved text-green"></i> Verification Status</span>
                    <span class="kpi-val" style="color:${confidenceColor}">${confidenceText}</span>
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
                        <button class="btn-focus-node-action" onclick="window.focusGraphNode(latestTargetNodeId);" title="Locate in 3D Topology"><i class="fas fa-crosshairs"></i> Locate</button>
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
                        <button class="btn-focus-node-action" onclick="window.focusGraphNode(latestTargetNodeId);" title="Locate in 3D Topology"><i class="fas fa-crosshairs"></i> Locate</button>
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
                        <button class="btn-focus-node-action" onclick="window.focusGraphNode(latestTargetNodeId);" title="Locate in 3D Topology"><i class="fas fa-crosshairs"></i> Locate</button>
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
                        <button class="btn-focus-node-action" onclick="window.focusGraphNode(latestTargetNodeId);" title="Locate in 3D Topology"><i class="fas fa-crosshairs"></i> Locate</button>
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
        if (res.domain && !res.domain.error && detectedType === 'DOMAIN') {
            const d = res.domain;
            const w = d.whois || {};
            const subs = d.subdomains || [];
            html += `
                <div class="dossier-card">
                    <div class="dcard-header">
                        <div class="dcard-title-wrap"><i class="fas fa-globe"></i><h4>Domain & CT Certificates</h4></div>
                        <span class="dcard-badge">WHOIS + CT</span>
                        <button class="btn-focus-node-action" onclick="window.focusGraphNode(latestTargetNodeId);" title="Locate in 3D Topology"><i class="fas fa-crosshairs"></i> Locate</button>
                    </div>
                    <table class="kv-table">
                        <tr><td class="kv-key">Registrar</td><td class="kv-val">${w.registrar || '—'}</td></tr>
                        <tr><td class="kv-key">Created Date</td><td class="kv-val">${w.creation_date || '—'}</td></tr>
                        <tr><td class="kv-key">Expiration Date</td><td class="kv-val">${w.expiration_date || '—'}</td></tr>
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
            const mxList = em.mx_records || [];
            const mxStr = mxList.length > 0
                ? mxList.map(m => typeof m === 'object' ? `${escapeHtml(m.server)} (p:${m.priority})` : escapeHtml(m)).join(', ')
                : '<span style="color:var(--accent-rose);">None / Domain Unresolved</span>';
            html += `
                <div class="dossier-card">
                    <div class="dcard-header">
                        <div class="dcard-title-wrap"><i class="fas fa-envelope-shield text-rose"></i><h4>Email & DNS Posture</h4></div>
                        <span class="dcard-badge">${em.mail_provider || 'MAIL AUDIT'}</span>
                    </div>
                    <table class="kv-table">
                        <tr><td class="kv-key">Mail Provider</td><td class="kv-val"><strong>${escapeHtml(em.mail_provider || 'Custom / Self-Hosted')}</strong></td></tr>
                        <tr><td class="kv-key">MX Records</td><td class="kv-val" style="word-break:break-all;">${mxStr}</td></tr>
                        <tr><td class="kv-key">SPF Valid</td><td class="kv-val">${em.spf_record ? '<span class="text-green">Enforced</span>' : '<span style="color:var(--accent-amber);">Missing / Incomplete</span>'}</td></tr>
                        <tr><td class="kv-key">DMARC Policy</td><td class="kv-val">${em.dmarc_record ? '<span class="text-green">Configured</span>' : '<span style="color:var(--accent-amber);">Not Configured</span>'}</td></tr>
                        <tr><td class="kv-key">Gravatar Account</td><td class="kv-val">${(em.gravatar && em.gravatar.exists) ? '<span class="text-green">Identified Profile</span>' : '<span style="color:var(--text-dim);">Not Found</span>'}</td></tr>
                    </table>
                </div>
            `;
        }

        // 9. Phone Intelligence & Carrier Routing Card
        if (res.phone && (res.phone.valid || detectedType === 'PHONE')) {
            const ph = res.phone;
            const fm = ph.formatted || {};
            const piv = ph.messaging_pivots || {};
            html += `
                <div class="dossier-card">
                    <div class="dcard-header">
                        <div class="dcard-title-wrap"><i class="fas fa-phone-nodes text-teal"></i><h4>Telephone Intelligence</h4></div>
                        <span class="dcard-badge" style="background:${ph.valid ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.15)'};color:${ph.valid ? '#34d399' : '#f87171'};border-color:${ph.valid ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.3)'};">${ph.valid ? 'VALID E.164' : 'INVALID RANGE'}</span>
                    </div>
                    <table class="kv-table">
                        <tr><td class="kv-key">E.164 Format</td><td class="kv-val"><strong>${fm.e164 || ph.input}</strong></td></tr>
                        <tr><td class="kv-key">Validation Status</td><td class="kv-val">${ph.valid ? '<span class="text-green">Allocated ITU-T Number</span>' : '<span style="color:var(--accent-rose);">Unallocated / Invalid Number</span>'}</td></tr>
                        <tr><td class="kv-key">Country / Region</td><td class="kv-val">${escapeHtml(ph.country || 'Unknown')}</td></tr>
                        <tr><td class="kv-key">Carrier / Telco</td><td class="kv-val">${escapeHtml(ph.carrier || 'Unknown')}</td></tr>
                        <tr><td class="kv-key">Line Standard</td><td class="kv-val">${escapeHtml(ph.line_type || 'STANDARD')}</td></tr>
                        <tr><td class="kv-key">National Format</td><td class="kv-val">${escapeHtml(fm.national || ph.digits || '—')}</td></tr>
                    </table>
                    ${ph.valid ? `
                        <div style="margin-top:12px;">
                            <span style="font-size:0.75rem;color:var(--text-muted);font-weight:700;">ACTIVE MESSAGING & TELCO PIVOTS:</span>
                            <div class="hit-tags-grid" style="margin-top:6px;">
                                ${piv.whatsapp_url ? `<a href="${piv.whatsapp_url}" target="_blank" rel="noopener" class="hit-badge" style="background:rgba(37,211,102,0.12);color:#25d366;border-color:rgba(37,211,102,0.3);"><i class="fa-brands fa-whatsapp"></i> WhatsApp API</a>` : ''}
                                ${piv.telegram_url ? `<a href="${piv.telegram_url}" target="_blank" rel="noopener" class="hit-badge" style="background:rgba(0,136,204,0.12);color:#0088cc;border-color:rgba(0,136,204,0.3);"><i class="fa-brands fa-telegram"></i> Telegram Chat</a>` : ''}
                                ${piv.truecaller_search ? `<a href="${piv.truecaller_search}" target="_blank" rel="noopener" class="hit-badge"><i class="fas fa-search"></i> Truecaller Search</a>` : ''}
                                ${piv.numlookup_search ? `<a href="${piv.numlookup_search}" target="_blank" rel="noopener" class="hit-badge"><i class="fas fa-tower-cell"></i> NumLookup Carrier</a>` : ''}
                            </div>
                        </div>
                    ` : ''}
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

        // 13. Breach Intelligence & Risk Engine Card
        const breachData = res.breaches || (data.data && data.data.dossier && data.data.dossier.breaches);
        const riskData = data.risk || (data.data && data.data.risk);
        if (riskData || (breachData && breachData.total_breaches !== undefined)) {
            const rScore = riskData ? riskData.score : 0;
            const rSev = riskData ? riskData.severity : 'MINIMAL';
            let sevColor = '#10b981';
            if (rSev === 'CRITICAL') sevColor = '#ef4444';
            else if (rSev === 'HIGH') sevColor = '#f43f5e';
            else if (rSev === 'MEDIUM') sevColor = '#f59e0b';
            else if (rSev === 'LOW') sevColor = '#06b6d4';

            const bList = breachData ? (breachData.breaches || []) : [];
            const pList = breachData ? (breachData.pastes || []) : [];

            html += `
                <div class="dossier-card" style="border-color:${sevColor}40;">
                    <div class="dcard-header">
                        <div class="dcard-title-wrap"><i class="fas fa-shield-virus" style="color:${sevColor};"></i><h4>Breach Intelligence & Risk Engine</h4></div>
                        <span class="dcard-badge" style="background:${sevColor}20;color:${sevColor};border-color:${sevColor}60;">${rScore}/100 ${rSev}</span>
                    </div>
                    <div style="margin-bottom:12px;font-size:0.85rem;color:var(--text-secondary);line-height:1.4;">
                        ${riskData && riskData.summary ? escapeHtml(riskData.summary) : 'No critical exposure detected across indexed breach records.'}
                    </div>
                    ${riskData && riskData.factors && riskData.factors.length > 0 ? `
                        <div style="margin-bottom:14px;">
                            <span style="font-size:0.75rem;color:var(--text-muted);font-weight:700;">RISK FACTOR BREAKDOWN:</span>
                            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin-top:6px;">
                                ${riskData.factors.map(f => `
                                    <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:6px;padding:8px;">
                                        <div style="display:flex;justify-content:space-between;font-size:0.75rem;">
                                            <span style="color:var(--text-secondary);">${f.name}</span>
                                            <strong style="color:${f.score > 0 ? sevColor : '#94a3b8'};">${f.score}/${f.max_score}</strong>
                                        </div>
                                        <div style="font-size:0.7rem;color:var(--text-muted);margin-top:4px;">${escapeHtml(f.explanation)}</div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                    ${bList.length > 0 ? `
                        <span style="font-size:0.75rem;color:var(--text-muted);font-weight:700;">EXPOSED IN ${bList.length} BREACHES:</span>
                        <div style="max-height:220px;overflow-y:auto;margin-top:6px;display:flex;flex-direction:column;gap:6px;">
                            ${bList.map(b => `
                                <div style="background:rgba(239,68,68,0.05);border:1px solid rgba(239,68,68,0.2);border-radius:6px;padding:8px;">
                                    <div style="display:flex;justify-content:space-between;align-items:center;">
                                        <strong style="color:#fca5a5;font-size:0.85rem;">${escapeHtml(b.name)}</strong>
                                        <span style="font-size:0.75rem;color:var(--text-muted);">${b.breach_date || 'Date unknown'}</span>
                                    </div>
                                    <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:4px;">
                                        ${b.pwn_count ? `PwnCount: <strong>${b.pwn_count.toLocaleString()}</strong> • ` : ''}
                                        Domain: <code>${escapeHtml(b.domain || '—')}</code>
                                    </div>
                                    ${b.data_classes && b.data_classes.length > 0 ? `
                                        <div class="hit-tags-grid" style="margin-top:6px;">
                                            ${b.data_classes.slice(0, 8).map(dc => `<span class="hit-badge" style="background:rgba(239,68,68,0.1);color:#fca5a5;border-color:rgba(239,68,68,0.25);font-size:0.65rem;">${escapeHtml(dc)}</span>`).join('')}
                                        </div>
                                    ` : ''}
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                    ${pList.length > 0 ? `
                        <div style="margin-top:12px;">
                            <span style="font-size:0.75rem;color:var(--text-muted);font-weight:700;">FOUND IN ${pList.length} PASTE DUMPS:</span>
                            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">
                                ${pList.slice(0, 5).map(p => `<span class="hit-badge" style="background:rgba(245,158,11,0.1);color:#fcd34d;border-color:rgba(245,158,11,0.3);font-size:0.75rem;">${escapeHtml(p.source || 'Paste')}: ${escapeHtml(p.title || p.id)}</span>`).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
        }

        // 14. Normalized Chronological Timeline Card
        const timelineEvents = data.timeline || (data.data && data.data.timeline) || [];
        if (timelineEvents.length > 0) {
            html += `
                <div class="dossier-card">
                    <div class="dcard-header">
                        <div class="dcard-title-wrap"><i class="fas fa-clock-rotate-left text-cyan"></i><h4>Investigation Timeline</h4></div>
                        <span class="dcard-badge">${timelineEvents.length} VERIFIED EVENTS</span>
                    </div>
                    <div style="max-height:240px;overflow-y:auto;padding-left:12px;border-left:2px solid var(--border-glow);display:flex;flex-direction:column;gap:12px;margin-top:8px;">
                        ${timelineEvents.map(ev => `
                            <div style="position:relative;">
                                <div style="position:absolute;left:-18px;top:4px;width:10px;height:10px;border-radius:50%;background:var(--accent-secondary);box-shadow:0 0 8px var(--accent-secondary);"></div>
                                <div style="display:flex;justify-content:space-between;font-size:0.75rem;">
                                    <strong style="color:var(--text-primary);">${escapeHtml(ev.title || ev.event_type)}</strong>
                                    <span style="color:var(--accent-secondary);">${ev.timestamp ? ev.timestamp.slice(0, 10) : ''}</span>
                                </div>
                                <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:2px;">${escapeHtml(ev.description || '')}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // 15. Cross-Module Correlations Card
        const correlations = data.correlations || (data.data && data.data.correlations) || [];
        if (correlations.length > 0) {
            html += `
                <div class="dossier-card">
                    <div class="dcard-header">
                        <div class="dcard-title-wrap"><i class="fas fa-brain-circuit text-purple"></i><h4>Cross-Module Correlations & Pivots</h4></div>
                        <span class="dcard-badge">${correlations.length} INSIGHTS</span>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:8px;max-height:240px;overflow-y:auto;">
                        ${correlations.map(c => `
                            <div style="background:rgba(168,85,247,0.05);border:1px solid rgba(168,85,247,0.2);border-radius:6px;padding:8px;">
                                <div style="display:flex;justify-content:space-between;align-items:center;">
                                    <strong style="color:#d8b4fe;font-size:0.85rem;">${escapeHtml(c.title)}</strong>
                                    <span class="dcard-badge" style="font-size:0.65rem;background:rgba(168,85,247,0.15);color:#d8b4fe;">${c.confidence || 'HIGH'}</span>
                                </div>
                                <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:4px;">${escapeHtml(c.description)}</div>
                                ${c.suggested_targets && c.suggested_targets.length > 0 ? `
                                    <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px;">
                                        ${c.suggested_targets.map(st => `
                                            <button onclick="executeOmniRecon('${escapeHtml(st)}')" class="hit-badge" style="cursor:pointer;background:rgba(168,85,247,0.15);border-color:rgba(168,85,247,0.3);color:#e9d5ff;font-size:0.75rem;">
                                                <i class="fas fa-arrow-right"></i> Pivot to <strong>${escapeHtml(st)}</strong>
                                            </button>
                                        `).join('')}
                                    </div>
                                ` : ''}
                            </div>
                        `).join('')}
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

    // --- Live Stream Generator (Threat Radar & Home Operations Hub) ---
    function initLiveStream() {
        const streamBox = document.getElementById('live-stream-box');
        const homeFeed = document.getElementById('home-event-feed');
        const btnToggle = document.getElementById('btn-feed-toggle');

        const simulatedEvents = [
            { icon: 'fas fa-user-astronaut', color: '#06b6d4', badge: 'USER', badgeCls: 'badge-cyan', title: 'Username Sweep', desc: 'Identified public profile on GitHub & GitLab' },
            { icon: 'fas fa-network-wired', color: '#10b981', badge: 'BGP', badgeCls: 'badge-green', title: 'BGP Route Match', desc: 'Prefix announced by AS15169 (Google LLC)' },
            { icon: 'fa-brands fa-discord', color: '#a855f7', badge: 'EPOCH', badgeCls: 'badge-purple', title: 'Snowflake Bitshift', desc: 'Epoch decoded: Account created Oct 2017' },
            { icon: 'fas fa-shield-halved', color: '#f43f5e', badge: 'AUDIT', badgeCls: 'badge-amber', title: 'Security Header Audit', desc: 'Missing Content-Security-Policy header' },
            { icon: 'fas fa-certificate', color: '#f59e0b', badge: 'SSL/CT', badgeCls: 'badge-amber', title: 'CT Certificate Found', desc: 'Wildcard *.domain.internal logged to crt.sh' },
            { icon: 'fas fa-key', color: '#ec4899', badge: 'CRYPTO', badgeCls: 'badge-purple', title: 'Cryptographic Hash', desc: 'High entropy MD5 digest classified' },
            { icon: 'fas fa-phone-nodes', color: '#14b8a6', badge: 'TELCO', badgeCls: 'badge-cyan', title: 'Carrier Routing', desc: 'E.164 ITU-T validation confirmed' }
        ];

        function addEvent() {
            if (streamPaused) return;
            const ev = simulatedEvents[Math.floor(Math.random() * simulatedEvents.length)];
            const timeStr = new Date().toTimeString().split(' ')[0];

            if (streamBox) {
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
                if (streamBox.children.length > 20) streamBox.removeChild(streamBox.lastChild);
            }

            if (homeFeed) {
                const item = document.createElement('div');
                item.className = 'tevent-item';
                item.innerHTML = `<span class="tevent-time">${timeStr.slice(3, 8)}</span> <span class="tevent-badge ${ev.badgeCls}">${ev.badge}</span> ${ev.title}: ${ev.desc.slice(0, 32)}...`;
                homeFeed.insertBefore(item, homeFeed.firstChild);
                if (homeFeed.children.length > 8) homeFeed.removeChild(homeFeed.lastChild);
            }
        }

        for (let i = 0; i < 4; i++) addEvent();
        streamInterval = setInterval(addEvent, 2800);

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
        const typingIndicator = document.getElementById('spotlight-typing-indicator');

        if (input) {
            // Real-time keystroke inspector & typing state
            input.addEventListener('input', (e) => {
                const val = e.target.value.trim();
                inspectTargetRealtime(val);
                if (typingIndicator) {
                    if (val.length > 0) {
                        typingIndicator.classList.add('active');
                        const stiText = typingIndicator.querySelector('.sti-text');
                        if (stiText) stiText.textContent = 'ANALYZING...';
                    } else {
                        typingIndicator.classList.remove('active');
                    }
                }
            });

            input.addEventListener('focus', () => {
                playTone(580, 'sine', 0.04);
            });

            if (btnExec) {
                btnExec.addEventListener('click', () => executeOmniRecon());
            }

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') executeOmniRecon();
            });

            // Handle URL Search Params (?q=... / ?target=...)
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const queryParam = urlParams.get('q') || urlParams.get('target') || urlParams.get('query');
                if (queryParam) {
                    input.value = queryParam;
                    inspectTargetRealtime(queryParam);
                    setTimeout(() => {
                        executeOmniRecon(queryParam);
                    }, 120);
                }
            } catch (e) {}
        }

        const chips = document.querySelectorAll('.preset-chip');
        chips.forEach(chip => {
            chip.addEventListener('click', () => {
                const val = chip.dataset.val;
                playTone(640, 'sine', 0.06);
                if (input) {
                    input.value = val;
                    inspectTargetRealtime(val);
                    if (typingIndicator) {
                        typingIndicator.classList.add('active');
                        const stiText = typingIndicator.querySelector('.sti-text');
                        if (stiText) stiText.textContent = 'PRIMED';
                    }
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

    // =========================================================================
    // AUTHENTICATION, PAYMENT CHECKOUT & MASTER ADMIN UPGRADE PORTAL
    // =========================================================================
    window.SPECTRE_AUTH = {
        currentUser: null,
        selectedTier: 'lifetime',
        selectedAmount: 99,
        selectedMethod: 'card',

        openAuthModal(mode = 'login') {
            const backdrop = document.getElementById('auth-modal-backdrop');
            if (!backdrop) return;
            backdrop.style.display = 'flex';
            this.setAuthMode(mode);
            const emailInput = document.getElementById('auth-input-email');
            if (emailInput) setTimeout(() => emailInput.focus(), 50);
        },

        closeAuthModal() {
            const backdrop = document.getElementById('auth-modal-backdrop');
            if (backdrop) backdrop.style.display = 'none';
            const err = document.getElementById('auth-error-msg');
            if (err) { err.style.display = 'none'; err.textContent = ''; }
        },

        setAuthMode(mode) {
            const tabLogin = document.getElementById('tab-auth-signin');
            const tabRegister = document.getElementById('tab-auth-register');
            const label = document.getElementById('btn-auth-label');
            const form = document.getElementById('auth-form');

            if (mode === 'register') {
                if (tabRegister) tabRegister.classList.add('active');
                if (tabLogin) tabLogin.classList.remove('active');
                if (label) label.textContent = 'Create Intelligence Account';
                if (form) form.dataset.mode = 'register';
            } else {
                if (tabLogin) tabLogin.classList.add('active');
                if (tabRegister) tabRegister.classList.remove('active');
                if (label) label.textContent = 'Authenticate Session';
                if (form) form.dataset.mode = 'login';
            }
        },

        openUpgradeModal(defaultTier = 'lifetime') {
            const backdrop = document.getElementById('upgrade-modal-backdrop');
            if (!backdrop) return;
            backdrop.style.display = 'flex';
            this.selectTier(defaultTier, defaultTier === 'lifetime' ? 99 : 19);
        },

        closeUpgradeModal() {
            const backdrop = document.getElementById('upgrade-modal-backdrop');
            if (backdrop) backdrop.style.display = 'none';
        },

        selectTier(tier, amount) {
            this.selectedTier = tier;
            this.selectedAmount = amount;

            const cardPro = document.getElementById('card-tier-pro');
            const cardLifetime = document.getElementById('card-tier-lifetime');
            const label = document.getElementById('btn-pay-amount-label');

            if (tier === 'lifetime') {
                if (cardLifetime) cardLifetime.classList.add('selected');
                if (cardPro) cardPro.classList.remove('selected');
                if (label) label.textContent = '$99.00';
            } else {
                if (cardPro) cardPro.classList.add('selected');
                if (cardLifetime) cardLifetime.classList.remove('selected');
                if (label) label.textContent = '$19.00';
            }
        },

        setPaymentMethod(method) {
            this.selectedMethod = method;
            const pills = document.querySelectorAll('.pmethod-pill');
            pills.forEach(p => {
                p.classList.toggle('active', p.dataset.method === method);
            });

            const panels = {
                card: document.getElementById('panel-pay-card'),
                paypal: document.getElementById('panel-pay-paypal'),
                crypto: document.getElementById('panel-pay-crypto'),
                cashapp: document.getElementById('panel-pay-cashapp'),
                instant: document.getElementById('panel-pay-instant')
            };

            Object.keys(panels).forEach(k => {
                if (panels[k]) {
                    panels[k].style.display = (k === method) ? 'block' : 'none';
                }
            });
        },

        async processCheckout() {
            try {
                const resp = await fetch('/api/payment/checkout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        tier: this.selectedTier,
                        method: this.selectedMethod,
                        amount: this.selectedAmount
                    })
                });
                const data = await resp.json();
                if (resp.ok && data.success) {
                    showToast(`Access Upgraded: ${data.tier.toUpperCase()} Active!`, 'fas fa-crown text-amber');
                    playTone(880, 'sine', 0.2);
                    this.closeUpgradeModal();
                    await this.fetchCurrentUser();
                } else {
                    showToast(data.error || 'Payment failed', 'fas fa-circle-exclamation text-rose');
                }
            } catch (err) {
                showToast(`Checkout error: ${err.message}`, 'fas fa-triangle-exclamation');
            }
        },

        switchAdminTab(tab) {
            const tabs = ['pay', 'plans', 'orders', 'users', 'vault'];
            tabs.forEach(t => {
                const btn = document.getElementById(`tab-btn-admin-${t}`);
                const pane = document.getElementById(`tab-pane-admin-${t}`);
                if (btn) btn.classList.toggle('active', t === tab);
                if (pane) pane.style.display = t === tab ? 'block' : 'none';
            });
            if (tab === 'pay') this.loadAdminSettings();
            if (tab === 'vault') this.loadAdminVault();
            if (tab === 'plans') this.loadAdminPlans();
            if (tab === 'orders') this.loadAdminOrders();
            if (tab === 'users') this.loadAdminUsers();
        },

        async loadAdminOrders() {
            const tbody = document.getElementById('admin-orders-tbody-app');
            const badge = document.getElementById('admin-orders-counter-app');
            if (!tbody) return;

            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Loading order queue...</td></tr>`;

            try {
                const resp = await fetch('/api/admin/orders');
                const data = await resp.json();

                if (resp.ok && data.orders) {
                    const orders = data.orders;
                    const pendingCount = orders.filter(o => o.status === 'verifying' || o.status === 'pending').length;
                    if (badge) {
                        badge.textContent = pendingCount;
                        badge.style.display = pendingCount > 0 ? 'inline-block' : 'none';
                    }

                    if (orders.length === 0) {
                        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">No orders found.</td></tr>`;
                        return;
                    }

                    tbody.innerHTML = orders.map(o => {
                        const statusClass = `status-${o.status}`;
                        const txSnippet = o.tx_hash ? `${o.tx_hash.substring(0, 12)}...` : '<span style="color:var(--text-muted);font-style:italic;">None</span>';
                        const isActionable = o.status !== 'approved';

                        return `
                            <tr>
                                <td><code>${escapeHtml(o.id)}</code></td>
                                <td><strong style="color:var(--text-primary);">${escapeHtml(o.email)}</strong></td>
                                <td><strong style="color:#fcd34d;">$${Number(o.amount).toFixed(2)}</strong> <small style="color:var(--text-muted);">(${escapeHtml(o.plan_id)})</small></td>
                                <td><span style="color:var(--accent-cyan);font-weight:700;">${escapeHtml(o.payment_method.toUpperCase())}</span> ${o.crypto_amount > 0 ? `<br><code style="font-size:0.7rem;">${o.crypto_amount}</code>` : ''}</td>
                                <td>
                                    <span title="${escapeHtml(o.tx_hash)}">${txSnippet}</span>
                                    ${o.notes ? `<br><small style="color:var(--text-muted);">${escapeHtml(o.notes)}</small>` : ''}
                                </td>
                                <td>
                                    <span class="status-badge ${statusClass}">${escapeHtml(o.status)}</span>
                                </td>
                                <td style="text-align:right; white-space:nowrap;">
                                    ${isActionable ? `
                                        <button type="button" class="btn-admin-approve" onclick="window.SPECTRE_AUTH.adminApproveOrder('${escapeHtml(o.id)}')">
                                            <i class="fas fa-check"></i> Approve
                                        </button>
                                        <button type="button" class="btn-admin-reject" onclick="window.SPECTRE_AUTH.adminRejectOrder('${escapeHtml(o.id)}')">
                                            <i class="fas fa-xmark"></i> Reject
                                        </button>
                                    ` : `<span style="color:var(--accent-emerald);font-weight:700;font-size:0.72rem;"><i class="fas fa-circle-check"></i> Activated</span>`}
                                </td>
                            </tr>
                        `;
                    }).join('');
                }
            } catch (err) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--accent-rose);">Error: ${escapeHtml(err.message)}</td></tr>`;
            }
        },

        async adminApproveOrder(orderId) {
            if (!confirm(`Approve order ${orderId} and elevate account?`)) return;
            try {
                const resp = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/approve`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ notes: 'Confirmed via App Admin Console' })
                });
                const data = await resp.json();
                if (resp.ok && data.success) {
                    showToast(`Order ${orderId} approved!`, 'fas fa-check-circle text-emerald');
                    playTone(880, 'sine', 0.2);
                    this.loadAdminOrders();
                    this.loadAdminUsers();
                } else {
                    showToast(data.error || 'Approval failed', 'fas fa-triangle-exclamation text-rose');
                }
            } catch (err) {
                showToast(`Error: ${err.message}`, 'fas fa-triangle-exclamation text-rose');
            }
        },

        async adminRejectOrder(orderId) {
            const reason = prompt(`Reason for rejection:`, 'Unverified transaction hash');
            if (reason === null) return;
            try {
                const resp = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/reject`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reason })
                });
                const data = await resp.json();
                if (resp.ok && data.success) {
                    showToast(`Order ${orderId} rejected`, 'fas fa-info-circle text-sky');
                    this.loadAdminOrders();
                } else {
                    showToast(data.error || 'Rejection failed', 'fas fa-triangle-exclamation text-rose');
                }
            } catch (err) {
                showToast(`Error: ${err.message}`, 'fas fa-triangle-exclamation text-rose');
            }
        },

        openAdminModal() {
            const backdrop = document.getElementById('modal-admin-control-deck') || document.getElementById('admin-modal-backdrop');
            if (!backdrop) return;
            backdrop.style.display = 'flex';
            if (typeof window.refreshAdminData === 'function') {
                window.refreshAdminData();
            } else if (typeof this.switchAdminTab === 'function') {
                this.switchAdminTab('pay');
            }
        },

        closeAdminModal() {
            const backdrop = document.getElementById('modal-admin-control-deck') || document.getElementById('admin-modal-backdrop');
            if (backdrop) backdrop.style.display = 'none';
        },

        async loadAdminSettings() {
            try {
                const resp = await fetch('/api/admin/settings');
                const data = await resp.json();
                if (resp.ok && data.settings) {
                    const s = data.settings;
                    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
                    setVal('adm-ltc', s.LTC_ADDRESS);
                    setVal('adm-btc', s.BTC_ADDRESS);
                    setVal('adm-eth', s.ETH_ADDRESS);
                    setVal('adm-paypal-email', s.PAYPAL_EMAIL);
                    setVal('adm-paypal-link', s.PAYPAL_LINK);
                    setVal('adm-cashapp', s.CASHAPP_TAG);
                    setVal('adm-paypal-client-id', s.PAYPAL_CLIENT_ID);
                    setVal('adm-paypal-client-secret', s.PAYPAL_CLIENT_SECRET);
                    setVal('adm-paypal-mode', s.PAYPAL_MODE || 'live');
                    setVal('adm-cashapp-mode', s.CASHAPP_VERIFY_MODE || 'auto_note');
                }
            } catch (err) {
                showToast(`Failed loading settings: ${err.message}`, 'fas fa-triangle-exclamation text-rose');
            }
        },

        async saveAdminSettings() {
            const getVal = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
            const payload = {
                LTC_ADDRESS: getVal('adm-ltc'),
                BTC_ADDRESS: getVal('adm-btc'),
                ETH_ADDRESS: getVal('adm-eth'),
                PAYPAL_EMAIL: getVal('adm-paypal-email'),
                PAYPAL_LINK: getVal('adm-paypal-link'),
                CASHAPP_TAG: getVal('adm-cashapp'),
                PAYPAL_CLIENT_ID: getVal('adm-paypal-client-id'),
                PAYPAL_CLIENT_SECRET: getVal('adm-paypal-client-secret'),
                PAYPAL_MODE: getVal('adm-paypal-mode') || 'live',
                CASHAPP_VERIFY_MODE: getVal('adm-cashapp-mode') || 'auto_note'
            };

            try {
                const resp = await fetch('/api/admin/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await resp.json();
                if (resp.ok && data.success) {
                    showToast('Payment Routing Saved Live!', 'fas fa-check-circle text-emerald');
                    playTone(880, 'sine', 0.15);
                } else {
                    showToast(data.error || 'Failed saving payment routing', 'fas fa-circle-exclamation text-rose');
                }
            } catch (err) {
                showToast(`Error: ${err.message}`, 'fas fa-triangle-exclamation text-rose');
            }
        },

        // --- PLATFORM TREASURY & COLD VAULT (APP) ---
        _vaultDataApp: null,

        async loadAdminVault() {
            const tbodyWd = document.getElementById('admin-vault-withdrawals-tbody-app');
            const tbodyWallets = document.getElementById('admin-vault-wallets-tbody-app');

            try {
                const resp = await fetch('/api/admin/vault/summary');
                const data = await resp.json();
                if (!resp.ok || !data.vault) {
                    showToast(data.error || 'Failed loading vault summary', 'fas fa-circle-exclamation text-rose');
                    return;
                }

                this._vaultDataApp = data.vault;
                const totals = data.vault.totals || {};

                const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val; };
                setTxt('vault-stat-total-fiat-app', `$${Number(data.vault.total_fiat_usd || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} <span style="font-size:0.75rem; color:var(--text-muted);">USD</span>`);
                
                const ltc = totals.ltc || { available: 0, fiat_usd_value: 0 };
                setTxt('vault-stat-ltc-bal-app', `${Number(ltc.available).toFixed(4)} <span style="font-size:0.75rem;">LTC</span>`);
                setTxt('vault-stat-ltc-fiat-app', `≈ $${Number(ltc.fiat_usd_value || 0).toFixed(2)} USD`);

                const btc = totals.btc || { available: 0, fiat_usd_value: 0 };
                setTxt('vault-stat-btc-bal-app', `${Number(btc.available).toFixed(6)} <span style="font-size:0.75rem;">BTC</span>`);
                setTxt('vault-stat-btc-fiat-app', `≈ $${Number(btc.fiat_usd_value || 0).toFixed(2)} USD`);

                const eth = totals.eth || { available: 0, fiat_usd_value: 0 };
                setTxt('vault-stat-eth-bal-app', `${Number(eth.available).toFixed(5)} <span style="font-size:0.75rem;">ETH</span>`);
                setTxt('vault-stat-eth-fiat-app', `≈ $${Number(eth.fiat_usd_value || 0).toFixed(2)} USD`);

                if (tbodyWd) {
                    const wds = data.vault.recent_withdrawals || [];
                    if (wds.length === 0) {
                        tbodyWd.innerHTML = `<tr><td colspan="6" style="padding:10px;text-align:center;color:var(--text-muted);">No withdrawal history recorded yet.</td></tr>`;
                    } else {
                        tbodyWd.innerHTML = wds.map(w => `
                            <tr>
                                <td><code>${escapeHtml(w.id)}</code></td>
                                <td style="font-weight:700;color:var(--accent-cyan);">${escapeHtml(w.currency)}</td>
                                <td style="font-weight:700;color:#10b981;">${Number(w.amount).toFixed(6)}</td>
                                <td style="font-family:var(--font-mono);"><span title="${escapeHtml(w.destination_address)}">${escapeHtml(w.destination_address.substring(0, 10))}...${escapeHtml(w.destination_address.substring(w.destination_address.length - 6))}</span></td>
                                <td><code>${escapeHtml(w.tx_hash)}</code></td>
                                <td style="color:var(--text-muted);font-size:0.7rem;">${escapeHtml(w.created_at)}</td>
                            </tr>
                        `).join('');
                    }
                }

                if (tbodyWallets) {
                    const wls = data.vault.wallets || [];
                    if (wls.length === 0) {
                        tbodyWallets.innerHTML = `<tr><td colspan="5" style="padding:10px;text-align:center;color:var(--text-muted);">No generated custodial wallets yet.</td></tr>`;
                    } else {
                        tbodyWallets.innerHTML = wls.map(w => `
                            <tr>
                                <td style="font-weight:700;color:var(--accent-cyan);">${escapeHtml(w.currency)}</td>
                                <td style="font-family:var(--font-mono);">${escapeHtml(w.address)}</td>
                                <td style="font-weight:700;color:${w.balance > 0 ? '#10b981' : 'var(--text-muted)'};">${Number(w.balance).toFixed(6)}</td>
                                <td><code>${escapeHtml(w.order_id || 'Direct')}</code></td>
                                <td style="color:var(--text-muted);font-size:0.7rem;">${escapeHtml(w.created_at)}</td>
                            </tr>
                        `).join('');
                    }
                }

                this.updateWithdrawMaxApp();
            } catch (err) {
                showToast(`Error loading vault: ${err.message}`, 'fas fa-triangle-exclamation text-rose');
            }
        },

        updateWithdrawMaxApp() {
            const curr = document.getElementById('adm-vault-currency-app')?.value.toLowerCase() || 'ltc';
            const amtInput = document.getElementById('adm-vault-amount-app');
            if (!this._vaultDataApp || !this._vaultDataApp.totals || !amtInput) return;
            const available = this._vaultDataApp.totals[curr]?.available || 0;
            amtInput.placeholder = `Max: ${Number(available).toFixed(6)}`;
        },

        setWithdrawMaxApp() {
            const curr = document.getElementById('adm-vault-currency-app')?.value.toLowerCase() || 'ltc';
            const amtInput = document.getElementById('adm-vault-amount-app');
            if (!this._vaultDataApp || !this._vaultDataApp.totals || !amtInput) return;
            const available = this._vaultDataApp.totals[curr]?.available || 0;
            amtInput.value = available;
        },

        async executeAdminWithdrawalApp() {
            const curr = document.getElementById('adm-vault-currency-app')?.value || 'LTC';
            const dest = document.getElementById('adm-vault-dest-app')?.value.trim();
            const amt = parseFloat(document.getElementById('adm-vault-amount-app')?.value || 0);
            const notes = document.getElementById('adm-vault-notes-app')?.value.trim() || '';

            if (!dest) {
                showToast('Destination cold address is required.', 'fas fa-triangle-exclamation text-rose');
                return;
            }
            if (amt <= 0) {
                showToast('Withdrawal amount must be greater than 0.', 'fas fa-triangle-exclamation text-rose');
                return;
            }

            if (!confirm(`Confirm cold storage withdrawal of ${amt} ${curr} to ${dest}?`)) return;

            try {
                const resp = await fetch('/api/admin/vault/withdraw', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        currency: curr,
                        destination_address: dest,
                        amount: amt,
                        notes: notes
                    })
                });
                const data = await resp.json();

                if (resp.ok && data.success) {
                    showToast(`Cold sweep successful! TX: ${data.tx_hash}`, 'fas fa-check-circle text-emerald');
                    document.getElementById('admin-vault-withdraw-form-app')?.reset();
                    this.loadAdminVault();
                } else {
                    showToast(data.error || 'Withdrawal failed', 'fas fa-circle-exclamation text-rose');
                }
            } catch (err) {
                showToast(`Error: ${err.message}`, 'fas fa-triangle-exclamation text-rose');
            }
        },

        async runAdminPaymentSync() {
            showToast('Initiating automated payment synchronization...', 'fas fa-satellite-dish text-cyan');
            try {
                const resp = await fetch('/api/admin/payments/sync', { method: 'POST' });
                const data = await resp.json();
                if (resp.ok && data.success) {
                    const s = data.sync;
                    showToast(`Sync complete! Scanned ${s.scanned_count} orders, cleared ${s.cleared_count} new payments!`, 'fas fa-check-circle text-emerald');
                    this.loadAdminOrders();
                    this.loadAdminVault();
                } else {
                    showToast(data.error || 'Sync failed', 'fas fa-triangle-exclamation text-rose');
                }
            } catch (err) {
                showToast(`Sync error: ${err.message}`, 'fas fa-triangle-exclamation text-rose');
            }
        },

        async loadAdminPlans() {
            const tbody = document.getElementById('admin-plans-tbody');
            if (!tbody) return;
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Loading pricing plans...</td></tr>`;

            try {
                const resp = await fetch('/api/admin/plans');
                const data = await resp.json();
                if (resp.ok && data.plans) {
                    if (data.plans.length === 0) {
                        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">No plans found.</td></tr>`;
                        return;
                    }
                    tbody.innerHTML = data.plans.map(p => `
                        <tr>
                            <td><code>${escapeHtml(p.id)}</code></td>
                            <td><strong style="color:var(--text-primary);">${escapeHtml(p.name)}</strong></td>
                            <td><strong style="color:#10b981;">$${Number(p.price).toFixed(2)}</strong></td>
                            <td style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(p.billing_period)}</td>
                            <td><span style="font-size:0.7rem;padding:2px 6px;border-radius:4px;background:rgba(255,255,255,0.06);color:#fbbf24;">${escapeHtml(p.badge || '—')}</span></td>
                            <td><span style="font-size:0.7rem;color:${p.is_active ? '#34d399' : '#f43f5e'};">${p.is_active ? 'ACTIVE' : 'INACTIVE'}</span></td>
                            <td>
                                <button onclick="window.SPECTRE_AUTH.deleteAdminPlan('${escapeHtml(p.id)}')" style="background:rgba(244,63,94,0.15);border:1px solid rgba(244,63,94,0.4);color:#f43f5e;padding:2px 8px;border-radius:4px;cursor:pointer;font-size:0.7rem;" title="Delete or Deactivate Plan">Remove</button>
                            </td>
                        </tr>
                    `).join('');
                }
            } catch (err) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--accent-rose);">Error: ${escapeHtml(err.message)}</td></tr>`;
            }
        },

        async saveAdminPlan() {
            const planId = document.getElementById('adm-plan-id')?.value.trim();
            const name = document.getElementById('adm-plan-name')?.value.trim();
            const price = parseFloat(document.getElementById('adm-plan-price')?.value || 0);
            const billingPeriod = document.getElementById('adm-plan-period')?.value.trim() || 'one-time';
            const badge = document.getElementById('adm-plan-badge')?.value.trim() || '';
            const desc = document.getElementById('adm-plan-desc')?.value.trim() || '';
            const features = document.getElementById('adm-plan-features')?.value.trim() || '';

            if (!planId || !name) {
                showToast('Plan ID and Display Name are required', 'fas fa-triangle-exclamation text-amber');
                return;
            }

            try {
                const resp = await fetch('/api/admin/plans', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: planId,
                        name: name,
                        price: price,
                        billing_period: billingPeriod,
                        badge: badge,
                        description: desc,
                        features: features
                    })
                });
                const data = await resp.json();
                if (resp.ok && data.success) {
                    showToast(`Plan ${name} saved!`, 'fas fa-check-circle text-emerald');
                    this.loadAdminPlans();
                    document.getElementById('admin-new-plan-form')?.reset();
                } else {
                    showToast(data.error || 'Failed saving plan', 'fas fa-circle-exclamation text-rose');
                }
            } catch (err) {
                showToast(`Error: ${err.message}`, 'fas fa-triangle-exclamation');
            }
        },

        async deleteAdminPlan(planId) {
            if (!confirm(`Are you sure you want to remove or deactivate plan '${planId}'?`)) return;
            try {
                const resp = await fetch(`/api/admin/plans/${encodeURIComponent(planId)}`, { method: 'DELETE' });
                const data = await resp.json();
                if (resp.ok && data.success) {
                    showToast(`Plan ${planId} removed/deactivated`, 'fas fa-check');
                    this.loadAdminPlans();
                } else {
                    showToast(data.error || 'Failed to remove plan', 'fas fa-circle-exclamation text-rose');
                }
            } catch (err) {
                showToast(`Error: ${err.message}`, 'fas fa-triangle-exclamation');
            }
        },

        async loadAdminUsers() {
            const tbody = document.getElementById('admin-users-tbody');
            const datalist = document.getElementById('registered-emails-list');
            if (!tbody) return;

            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Loading registered operators...</td></tr>`;

            try {
                const resp = await fetch('/api/admin/users');
                const data = await resp.json();
                if (resp.ok && data.users) {
                    if (datalist) {
                        datalist.innerHTML = data.users.map(u => `<option value="${escapeHtml(u.email)}"></option>`).join('');
                    }

                    if (data.users.length === 0) {
                        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">No users found.</td></tr>`;
                        return;
                    }

                    tbody.innerHTML = data.users.map(u => {
                        const tierColor = u.tier === 'lifetime' ? '#fbbf24' : (u.tier === 'premium' ? '#06b6d4' : (u.tier === 'admin' ? '#f43f5e' : '#94a3b8'));
                        return `
                            <tr>
                                <td><strong style="color:var(--text-primary);">${escapeHtml(u.email)}</strong></td>
                                <td><span class="user-tier-badge" style="color:${tierColor};border-color:${tierColor};background:rgba(255,255,255,0.05);">${escapeHtml(u.tier.toUpperCase())}</span></td>
                                <td>${u.probes_count || 0}</td>
                                <td style="font-size:0.75rem;color:var(--text-muted);">${(u.created_at || '').substring(0, 16)}</td>
                                <td>
                                    <div style="display:flex;gap:4px;">
                                        <button class="btn-tier-pill" onclick="window.SPECTRE_AUTH.upgradeUserDirect('${escapeHtml(u.email)}', 'lifetime')" style="color:#fbbf24;border:1px solid rgba(251,191,36,0.3);background:rgba(251,191,36,0.08);padding:2px 8px;border-radius:4px;cursor:pointer;font-size:0.7rem;" title="Set Lifetime">Lifetime</button>
                                        <button class="btn-tier-pill" onclick="window.SPECTRE_AUTH.upgradeUserDirect('${escapeHtml(u.email)}', 'premium')" style="color:#06b6d4;border:1px solid rgba(6,182,212,0.3);background:rgba(6,182,212,0.08);padding:2px 8px;border-radius:4px;cursor:pointer;font-size:0.7rem;" title="Set Pro">Pro</button>
                                        <button class="btn-tier-pill" onclick="window.SPECTRE_AUTH.upgradeUserDirect('${escapeHtml(u.email)}', 'free')" style="color:#94a3b8;border:1px solid rgba(148,163,184,0.3);background:rgba(148,163,184,0.08);padding:2px 8px;border-radius:4px;cursor:pointer;font-size:0.7rem;" title="Reset Free">Free</button>
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join('');
                } else {
                    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--accent-rose);">${escapeHtml(data.error || 'Failed to fetch users')}</td></tr>`;
                }
            } catch (err) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--accent-rose);">Error: ${escapeHtml(err.message)}</td></tr>`;
            }
        },

        async upgradeUserDirect(email, tier) {
            try {
                const resp = await fetch('/api/admin/upgrade', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, tier })
                });
                const data = await resp.json();
                if (resp.ok && data.success) {
                    showToast(`Updated ${email} to ${tier.toUpperCase()}`, 'fas fa-check-circle text-emerald');
                    this.loadAdminUsers();
                    if (this.currentUser && this.currentUser.email === email) {
                        this.fetchCurrentUser();
                    }
                } else {
                    showToast(data.error || 'Upgrade failed', 'fas fa-circle-exclamation text-rose');
                }
            } catch (err) {
                showToast(`Error: ${err.message}`, 'fas fa-triangle-exclamation');
            }
        },

        async fetchCurrentUser() {
            try {
                const resp = await fetch('/api/auth/me');
                const data = await resp.json();
                if (resp.ok && data.authenticated) {
                    this.currentUser = data.user;
                    this.updateNavUI(data.user);
                } else {
                    this.currentUser = null;
                    this.updateNavUI(null);
                }
            } catch (err) {
                this.currentUser = null;
                this.updateNavUI(null);
            }
        },

        updateNavUI(user) {
            const btnOpenAuth = document.getElementById('btn-open-auth');
            const profileWidget = document.getElementById('user-profile-widget');
            const navEmail = document.getElementById('nav-user-email');
            const navTier = document.getElementById('nav-user-tier');
            const dropEmail = document.getElementById('dropdown-user-email');
            const dropTier = document.getElementById('dropdown-user-tier');
            const adminMenuItem = document.getElementById('menu-item-admin');

            if (user) {
                if (btnOpenAuth) btnOpenAuth.style.display = 'none';
                if (profileWidget) profileWidget.style.display = 'block';
                if (navEmail) navEmail.textContent = user.email;
                if (dropEmail) dropEmail.textContent = user.email;

                const tierName = (user.tier || 'free').toUpperCase();
                if (navTier) {
                    navTier.textContent = tierName;
                    navTier.className = `user-tier-badge badge-${user.tier || 'free'}`;
                }
                if (dropTier) dropTier.textContent = `${tierName} MEMBERSHIP`;

                if (adminMenuItem) {
                    adminMenuItem.style.display = (user.role === 'admin' || user.tier === 'admin') ? 'flex' : 'none';
                }
                const btnNavbarAdmin = document.getElementById('btn-navbar-admin');
                if (btnNavbarAdmin) {
                    btnNavbarAdmin.style.display = (user.role === 'admin' || user.tier === 'admin') ? 'inline-flex' : 'none';
                }
            } else {
                if (btnOpenAuth) btnOpenAuth.style.display = 'inline-flex';
                if (profileWidget) profileWidget.style.display = 'none';
                if (adminMenuItem) adminMenuItem.style.display = 'none';
                const btnNavbarAdmin = document.getElementById('btn-navbar-admin');
                if (btnNavbarAdmin) btnNavbarAdmin.style.display = 'none';
            }
        }
    };

    function initAuthAndMembership() {
        const auth = window.SPECTRE_AUTH;

        // Nav Buttons
        const btnOpenPricing = document.getElementById('btn-open-pricing');
        if (btnOpenPricing) {
            btnOpenPricing.addEventListener('click', () => auth.openUpgradeModal('lifetime'));
        }

        const btnNavbarAdmin = document.getElementById('btn-navbar-admin');
        if (btnNavbarAdmin) {
            btnNavbarAdmin.addEventListener('click', (e) => {
                e.preventDefault();
                if (window.openAdminModal) window.openAdminModal();
                else auth.openAdminModal();
            });
        }

        const navAdminDeck = document.getElementById('nav-item-admin-deck');
        if (navAdminDeck) {
            navAdminDeck.addEventListener('click', (e) => {
                e.preventDefault();
                if (window.openAdminModal) window.openAdminModal();
                else auth.openAdminModal();
            });
        }

        const btnTopbarAdmin = document.getElementById('btn-topbar-admin-deck');
        if (btnTopbarAdmin) {
            btnTopbarAdmin.addEventListener('click', (e) => {
                e.preventDefault();
                if (window.openAdminModal) window.openAdminModal();
                else auth.openAdminModal();
            });
        }

        const btnSidebarAdminAction = document.getElementById('btn-sidebar-admin-action');
        if (btnSidebarAdminAction) {
            btnSidebarAdminAction.addEventListener('click', (e) => {
                e.preventDefault();
                if (window.openAdminModal) window.openAdminModal();
                else auth.openAdminModal();
            });
        }

        const btnSavePayments = document.getElementById('btn-save-admin-payments');
        if (btnSavePayments) {
            btnSavePayments.addEventListener('click', () => auth.saveAdminSettings());
        }

        const btnSavePlan = document.getElementById('btn-save-new-plan');
        if (btnSavePlan) {
            btnSavePlan.addEventListener('click', () => auth.saveAdminPlan());
        }

        const btnOpenAuth = document.getElementById('btn-open-auth');
        if (btnOpenAuth) {
            btnOpenAuth.addEventListener('click', () => auth.openAuthModal('login'));
        }

        // Profile Dropdown Toggle
        const btnUserProfile = document.getElementById('btn-user-profile');
        const userProfileDropdown = document.getElementById('user-profile-dropdown');
        if (btnUserProfile && userProfileDropdown) {
            btnUserProfile.addEventListener('click', (e) => {
                e.stopPropagation();
                const isHidden = userProfileDropdown.style.display === 'none' || !userProfileDropdown.style.display;
                userProfileDropdown.style.display = isHidden ? 'flex' : 'none';
            });
            document.addEventListener('click', (e) => {
                if (!e.target.closest('#user-profile-widget')) {
                    userProfileDropdown.style.display = 'none';
                }
            });
        }

        // Profile Dropdown Menu Items
        const menuItemUpgrade = document.getElementById('menu-item-upgrade');
        if (menuItemUpgrade) {
            menuItemUpgrade.addEventListener('click', () => {
                if (userProfileDropdown) userProfileDropdown.style.display = 'none';
                auth.openUpgradeModal('lifetime');
            });
        }

        const menuItemAdmin = document.getElementById('menu-item-admin');
        if (menuItemAdmin) {
            menuItemAdmin.addEventListener('click', () => {
                if (userProfileDropdown) userProfileDropdown.style.display = 'none';
                auth.openAdminModal();
            });
        }

        const directLogoutBtn = document.getElementById('btn-direct-logout');
        if (directLogoutBtn) {
            directLogoutBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                showToast('Logging out...', 'fas fa-power-off');
                try {
                    await fetch('/api/auth/logout', { method: 'POST' });
                } catch (err) {}
                window.location.href = '/logout';
            });
        }

        const menuItemLogout = document.getElementById('menu-item-logout');
        if (menuItemLogout) {
            menuItemLogout.addEventListener('click', async (e) => {
                e.preventDefault();
                if (userProfileDropdown) userProfileDropdown.style.display = 'none';
                showToast('Logging out...', 'fas fa-power-off');
                try {
                    await fetch('/api/auth/logout', { method: 'POST' });
                } catch (err) {}
                window.location.href = '/logout';
            });
        }

        // Auth Modal Close & Backdrop Click
        const authBackdrop = document.getElementById('auth-modal-backdrop');
        const btnCloseAuth = document.getElementById('btn-close-auth');
        if (btnCloseAuth) btnCloseAuth.addEventListener('click', () => auth.closeAuthModal());
        if (authBackdrop) {
            authBackdrop.addEventListener('click', (e) => {
                if (e.target === authBackdrop) auth.closeAuthModal();
            });
        }

        // Auth Tabs
        const tabSignin = document.getElementById('tab-auth-signin');
        const tabRegister = document.getElementById('tab-auth-register');
        if (tabSignin) tabSignin.addEventListener('click', () => auth.setAuthMode('login'));
        if (tabRegister) tabRegister.addEventListener('click', () => auth.setAuthMode('register'));

        // Auth Form Submit
        const authForm = document.getElementById('auth-form');
        const authErrorMsg = document.getElementById('auth-error-msg');
        if (authForm) {
            authForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const mode = authForm.dataset.mode || 'login';
                const email = document.getElementById('auth-input-email').value.trim();
                const password = document.getElementById('auth-input-password').value;
                const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';

                if (authErrorMsg) { authErrorMsg.style.display = 'none'; authErrorMsg.textContent = ''; }

                try {
                    const resp = await fetch(endpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, password })
                    });
                    const data = await resp.json();
                    if (resp.ok && data.success) {
                        showToast(mode === 'register' ? 'Account Created & Authenticated!' : 'Authenticated Successfully', 'fas fa-check-circle text-emerald');
                        playTone(720, 'sine', 0.1);
                        auth.closeAuthModal();
                        await auth.fetchCurrentUser();
                    } else {
                        if (authErrorMsg) {
                            authErrorMsg.style.display = 'block';
                            authErrorMsg.textContent = data.error || 'Authentication failed';
                        }
                    }
                } catch (err) {
                    if (authErrorMsg) {
                        authErrorMsg.style.display = 'block';
                        authErrorMsg.textContent = err.message || 'Network error';
                    }
                }
            });
        }

        // Upgrade / Pricing Modal Close & Backdrop Click
        const upgradeBackdrop = document.getElementById('upgrade-modal-backdrop');
        const btnCloseUpgrade = document.getElementById('btn-close-upgrade');
        if (btnCloseUpgrade) btnCloseUpgrade.addEventListener('click', () => auth.closeUpgradeModal());
        if (upgradeBackdrop) {
            upgradeBackdrop.addEventListener('click', (e) => {
                if (e.target === upgradeBackdrop) auth.closeUpgradeModal();
            });
        }

        // Plan Selection Buttons
        const btnSelectPro = document.getElementById('btn-select-pro');
        const btnSelectLifetime = document.getElementById('btn-select-lifetime');
        if (btnSelectPro) btnSelectPro.addEventListener('click', () => auth.selectTier('premium', 19));
        if (btnSelectLifetime) btnSelectLifetime.addEventListener('click', () => auth.selectTier('lifetime', 99));

        // Payment Method Switcher
        const pmethodPills = document.querySelectorAll('.pmethod-pill');
        pmethodPills.forEach(pill => {
            pill.addEventListener('click', () => {
                auth.setPaymentMethod(pill.dataset.method);
            });
        });

        // Checkout Action Triggers
        const btnPayCard = document.getElementById('btn-pay-card-submit');
        const btnPayPaypal = document.getElementById('btn-pay-paypal-confirm');
        const btnPayCrypto = document.getElementById('btn-pay-crypto-confirm');
        const btnPayCashapp = document.getElementById('btn-pay-cashapp-confirm');
        const btnPayInstant = document.getElementById('btn-pay-instant-submit');

        if (btnPayCard) btnPayCard.addEventListener('click', () => auth.processCheckout());
        if (btnPayPaypal) btnPayPaypal.addEventListener('click', () => auth.processCheckout());
        if (btnPayCrypto) btnPayCrypto.addEventListener('click', () => auth.processCheckout());
        if (btnPayCashapp) btnPayCashapp.addEventListener('click', () => auth.processCheckout());
        if (btnPayInstant) btnPayInstant.addEventListener('click', () => auth.processCheckout());

        // Admin Modal Controls
        const adminBackdrop = document.getElementById('admin-modal-backdrop');
        const btnCloseAdmin = document.getElementById('btn-close-admin');
        if (btnCloseAdmin) btnCloseAdmin.addEventListener('click', () => auth.closeAdminModal());
        if (adminBackdrop) {
            adminBackdrop.addEventListener('click', (e) => {
                if (e.target === adminBackdrop) auth.closeAdminModal();
            });
        }

        // Admin Upgrade Form
        const adminUpgradeForm = document.getElementById('admin-upgrade-form');
        if (adminUpgradeForm) {
            adminUpgradeForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const email = document.getElementById('admin-target-email').value.trim();
                const tier = document.getElementById('admin-target-tier').value;
                if (!email) {
                    showToast('Please enter an operator email', 'fas fa-triangle-exclamation');
                    return;
                }
                auth.upgradeUserDirect(email, tier);
            });
        }

        // Initialize user session
        auth.fetchCurrentUser();
    }

    // Expose core actions globally for direct inline DOM triggers
    window.executeOmniRecon = executeOmniRecon;
    window.inspectTargetRealtime = inspectTargetRealtime;

    // --- DOM Ready Boot ---
    document.addEventListener('DOMContentLoaded', () => {
        const safeRun = (fn, name) => {
            try { 
                if (typeof fn === 'function') fn(); 
            } catch (err) { 
                console.warn(`[SPECTRE Boot] Error in ${name}:`, err); 
            }
        };
        safeRun(applyPreferences, 'applyPreferences');
        safeRun(initParticles, 'initParticles');
        safeRun(initMagneticCards, 'initMagneticCards');
        safeRun(initCursorGlow, 'initCursorGlow');
        safeRun(initClock, 'initClock');
        safeRun(initNavigation, 'initNavigation');
        safeRun(initCustomizer, 'initCustomizer');
        safeRun(initCommandPalette, 'initCommandPalette');
        safeRun(initPresetsAndInput, 'initPresetsAndInput');
        safeRun(initStudio, 'initStudio');
        safeRun(initGraph, 'initGraph');
        safeRun(initLiveStream, 'initLiveStream');
        safeRun(initAuthAndMembership, 'initAuthAndMembership');
    });

})();

