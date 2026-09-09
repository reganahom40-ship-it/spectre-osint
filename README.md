# SPECTRE // OSINT & Reconnaissance Platform (v3.5)

A multi-vector open source intelligence (OSINT) web platform with a cyber glass sidebar dashboard, interactive particle physics canvas, and zero API keys required.

## Live Cloud Production
**URL:** [https://spectre-osint.onrender.com](https://spectre-osint.onrender.com) (Hosted 24/7 on Render)

---

## Reconnaissance Vectors (8 Modules)

1. **Username Recon** — Scans 112+ global platforms in parallel (~2.2s execution via ThreadPoolExecutor).
2. **Discord Snowflake Intelligence** — Reverse-engineers 64-bit Snowflake IDs to determine exact millisecond registration timestamps, account age, internal worker/process IDs, public avatar, and badges.
3. **IP Intelligence** — Precise coordinates, ISP, ASN routing, reverse DNS hostnames, and proxy / VPN / datacenter flags.
4. **Email Footprint** — MX priority records, mail provider fingerprinting, SPF & DMARC authentication policies, and Gravatar verification.
5. **Domain Recon** — Full WHOIS data, complete DNS zone records (A, AAAA, MX, TXT, SOA), and Certificate Transparency (crt.sh) subdomain enumeration.
6. **Phone Intelligence** — Carrier identification, line classification (Mobile / VOIP / Fixed), timezones, and E.164 standardized dial formats.
7. **HTTP Security Audit** — Evaluates HSTS, CSP, X-Frame-Options, server header signatures, redirect chains, and session cookie security flags.
8. **Hash Identifier** — Analyzes raw cryptographic hashes (MD5, SHA-1, SHA-256, bcrypt, NTLM, Argon2), calculates bit-length, and measures Shannon entropy.

---

## Project Structure

```
osint-platform/
├── .vscode/                  # Workspace debug & editor settings
│   ├── launch.json
│   └── settings.json
├── modules/                  # Reconnaissance engine backends
│   ├── __init__.py
│   ├── username.py           # 112+ platform parallel checker
│   ├── discord_lookup.py     # Discord snowflake reverse engineer
│   ├── ip_lookup.py          # IP geolocation & reverse DNS
│   ├── email_lookup.py       # MX, SPF, DMARC, Gravatar
│   ├── domain_lookup.py      # WHOIS, DNS, crt.sh subdomains
│   ├── phone_lookup.py       # Google libphonenumber analysis
│   ├── headers.py            # HTTP header security compliance
│   └── hash_lookup.py        # Cryptographic hash identifier
├── static/
│   ├── css/
│   │   └── style.css         # Cyber glass sidebar & bubbly theme
│   └── js/
│       └── app.js            # Frontend logic & bubble canvas physics
├── templates/
│   └── index.html            # Main dashboard HTML template
├── app.py                    # Flask REST API & routing
├── config.py                 # 112+ platform list & HTTP pooling config
├── Procfile                  # Gunicorn production config for Render
├── render.yaml               # Render Cloud Infrastructure as Code
├── requirements.txt          # Python dependencies
├── start.bat                 # One-click Windows runner
├── run.ps1                   # PowerShell launch script
└── README.md
```

---

## Local Development & Setup

### Quick Start (Windows)
Double-click `start.bat` or run:

```powershell
.\run.ps1
```

Or manually:

```bash
pip install -r requirements.txt
python app.py
```

Then navigate to: **[http://127.0.0.1:5000](http://127.0.0.1:5000)**

---

## Cloud Deployment (Render.com)

The project includes `render.yaml` and `Procfile` configured for Gunicorn with 4 workers and 4 threads:

```bash
git push origin main
```
Render will automatically build and deploy new commits to [https://spectre-osint.onrender.com](https://spectre-osint.onrender.com).
