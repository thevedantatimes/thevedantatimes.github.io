#!/usr/bin/env python3
"""Fetch latest videos from multiple YouTube channels and write a merged JSON cache.

- No API key required (uses official public RSS feeds).
- Resolves @handle -> channelId by scraping the channel page at build time.

Output: assets/data/youtube_videos.json
"""

import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
import xml.etree.ElementTree as ET

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT_PATH = os.path.join(ROOT, "assets", "data", "youtube_videos.json")

CHANNEL_URLS = [
    "https://www.youtube.com/@ChicagoVedanta/videos",
    "https://www.youtube.com/@VedantaNY/videos",
    "https://www.youtube.com/@VedantaOrg/videos",
    "https://www.youtube.com/@vedantasocietyofwesternwa/videos",
    "https://www.youtube.com/@VedantaDC/videos",
]

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36"


def http_get(url: str, timeout: int = 20) -> bytes:
    req = Request(url, headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"})
    with urlopen(req, timeout=timeout) as r:
        return r.read()


def resolve_channel_id(channel_url: str) -> str:
    """Resolve a YouTube channel page (often @handle) to its UC... channel id."""
    base = channel_url
    # Prefer the handle root page for more reliable HTML.
    base = re.sub(r"/videos/?$", "", base)

    html = http_get(base).decode("utf-8", errors="ignore")

    # Common patterns that appear in the page source.
    pats = [
        r'"channelId"\s*:\s*"(UC[0-9A-Za-z_-]{20,})"',
        r'"browseId"\s*:\s*"(UC[0-9A-Za-z_-]{20,})"',
        r"/channel/(UC[0-9A-Za-z_-]{20,})",
    ]
    for p in pats:
        m = re.search(p, html)
        if m:
            return m.group(1)

    raise ValueError(f"Could not resolve channelId from: {channel_url}")


def parse_feed(xml_bytes: bytes) -> list:
    """Parse YouTube Atom feed bytes into a list of dict items."""
    ns = {
        "atom": "http://www.w3.org/2005/Atom",
        "yt": "http://www.youtube.com/xml/schemas/2015",
        "media": "http://search.yahoo.com/mrss/",
    }

    root = ET.fromstring(xml_bytes)

    items = []
    for entry in root.findall("atom:entry", ns):
        vid = entry.findtext("yt:videoId", default="", namespaces=ns).strip()
        title = entry.findtext("atom:title", default="", namespaces=ns).strip()
        published = entry.findtext("atom:published", default="", namespaces=ns).strip()

        link_el = entry.find("atom:link", ns)
        link = (link_el.get("href") if link_el is not None else "").strip()

        author_name = ""
        author_el = entry.find("atom:author", ns)
        if author_el is not None:
            author_name = (author_el.findtext("atom:name", default="", namespaces=ns) or "").strip()

        thumb = ""
        mg = entry.find("media:group", ns)
        if mg is not None:
            th = mg.find("media:thumbnail", ns)
            if th is not None:
                thumb = (th.get("url") or "").strip()

        if not thumb and vid:
            thumb = f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"

        if not link and vid:
            link = f"https://www.youtube.com/watch?v={vid}"

        if not vid or not title or not published:
            continue

        items.append(
            {
                "videoId": vid,
                "title": title,
                "url": link,
                "published": published,
                "channel": author_name,
                "thumbnail": thumb,
            }
        )

    return items


def iso_to_dt(s: str):
    try:
        # Example: 2026-01-15T12:34:56+00:00 or Z
        if s.endswith("Z"):
            return datetime.fromisoformat(s.replace("Z", "+00:00"))
        return datetime.fromisoformat(s)
    except Exception:
        return datetime(1970, 1, 1, tzinfo=timezone.utc)


def main() -> int:
    all_items = []
    errors = []

    for url in CHANNEL_URLS:
        try:
            cid = resolve_channel_id(url)
            feed_url = f"https://www.youtube.com/feeds/videos.xml?channel_id={cid}"
            xml_bytes = http_get(feed_url)
            items = parse_feed(xml_bytes)
            # Keep a reasonable number per channel.
            all_items.extend(items[:12])
        except Exception as e:
            errors.append(f"{url}: {e}")

    # Deduplicate by videoId
    dedup = {}
    for it in all_items:
        dedup[it["videoId"]] = it

    merged = list(dedup.values())
    merged.sort(key=lambda x: iso_to_dt(x.get("published", "")), reverse=True)

    merged = merged[:60]

    payload = {
        "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "items": merged,
    }

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    if errors:
        # Print errors but don't fail the build.
        print("YouTube fetch warnings:\n- " + "\n- ".join(errors), file=sys.stderr)

    print(f"Wrote {len(merged)} videos -> {OUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
