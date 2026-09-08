# SPECTRE // OSINT Platform

A self-hosted open source intelligence platform with 6 reconnaissance modules, dark cyberpunk UI, and zero API keys required.

## Modules

- **Username Recon** — Scan 39 platforms simultaneously
- **IP Intelligence** — Geolocation, ISP, ASN, proxy detection
- **Email Intel** — MX records, SPF/DMARC, Gravatar, mail provider
- **Domain Recon** — WHOIS, DNS, SSL certs, subdomain enumeration
- **Phone Lookup** — Carrier, line type, timezone, validation
- **HTTP Headers** — Security audit, server fingerprinting, cookies

## Deploy to Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your GitHub repo
4. Render auto-detects `render.yaml` and configures everything
5. Click **Deploy**

## Run Locally

```bash
pip install -r requirements.txt
python app.py
```

Open [http://localhost:5000](http://localhost:5000)

## Tech Stack

- Python 3 + Flask + Gunicorn
- Vanilla HTML/CSS/JS (zero framework overhead)
- JetBrains Mono + Inter fonts
- Font Awesome 6

## License

Do whatever you want with it.
