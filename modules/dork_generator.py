import urllib.parse

def generate_dorks(target: str, target_type: str = "domain") -> dict:
    target = str(target).strip()
    if not target:
        raise ValueError("Target query cannot be empty.")

    clean_target = target.replace("http://", "").replace("https://", "").split("/")[0]

    dork_categories = [
        {
            "category": "Exposed Configs & Environment Files",
            "icon": "fa-file-code",
            "dorks": [
                {
                    "title": "Environment & Credentials Files",
                    "query": f'site:{clean_target} ext:env | ext:yml | ext:yaml | ext:json | ext:ini | ext:conf'
                },
                {
                    "title": "Database Dumps & SQL Backups",
                    "query": f'site:{clean_target} ext:sql | ext:db | ext:sqlite | ext:dump | ext:bak'
                },
                {
                    "title": "Server Log Files",
                    "query": f'site:{clean_target} ext:log | ext:txt "error" | "debug" | "password"'
                }
            ]
        },
        {
            "category": "Admin & Login Gateways",
            "icon": "fa-key",
            "dorks": [
                {
                    "title": "Administrative Portals",
                    "query": f'site:{clean_target} inurl:admin | inurl:login | inurl:dashboard | inurl:cpanel'
                },
                {
                    "title": "API Documentation & Swagger UIs",
                    "query": f'site:{clean_target} inurl:swagger | inurl:api-docs | inurl:graphql | inurl:redoc'
                },
                {
                    "title": "Public Directory Listings (Open Indexes)",
                    "query": f'site:{clean_target} intitle:"Index of /" | intitle:"parent directory"'
                }
            ]
        },
        {
            "category": "Public Cloud Storage & Code Leaks",
            "icon": "fa-cloud",
            "dorks": [
                {
                    "title": "AWS S3 / Google Cloud Buckets Mentioning Target",
                    "query": f'site:s3.amazonaws.com "{clean_target}" | site:storage.googleapis.com "{clean_target}"'
                },
                {
                    "title": "Paste Sites (Pastebin, Ghostbin, Rentry)",
                    "query": f'site:pastebin.com "{clean_target}" | site:ghostbin.co "{clean_target}" | site:rentry.co "{clean_target}"'
                },
                {
                    "title": "GitHub / GitLab Public Code & Gists",
                    "query": f'site:github.com "{clean_target}" | site:gitlab.com "{clean_target}"'
                }
            ]
        },
        {
            "category": "Public Documents & Sensitive PDFs",
            "icon": "fa-file-pdf",
            "dorks": [
                {
                    "title": "Confidential / Internal Documents",
                    "query": f'site:{clean_target} filetype:pdf "confidential" | "internal only" | "restricted"'
                },
                {
                    "title": "Financial / Spreadsheet Data",
                    "query": f'site:{clean_target} filetype:xls | filetype:xlsx | filetype:csv "budget" | "revenue" | "employees"'
                }
            ]
        }
    ]

    # Generate ready-to-click URLs
    for cat in dork_categories:
        for item in cat["dorks"]:
            encoded = urllib.parse.quote(item["query"])
            item["google_url"] = f"https://www.google.com/search?q={encoded}"
            item["duckduckgo_url"] = f"https://duckduckgo.com/?q={encoded}"

    return {
        "target": clean_target,
        "total_categories": len(dork_categories),
        "total_dorks": sum(len(c["dorks"]) for c in dork_categories),
        "categories": dork_categories
    }
