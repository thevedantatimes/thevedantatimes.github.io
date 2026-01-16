#!/usr/bin/env python3
"""Fetch latest YouTube videos for the site sidebar (no API key).

Generates: assets/data/youtube_videos.json

We use public RSS feeds:
  https://www.youtube.com/feeds/videos.xml?channel_id=<CHANNEL_ID>

Stdlib-only for CI reliability.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET


# --- Channels (channel_id is the stable identifier used by RSS) ---
# Sources for IDs:
# - Chicago Vedanta FB post links to youtube.com/channel/UCAwtDOjlkygdHdh0yDfva_Q  (ChicagoVedanta)
# - VedantaNY / VedantaOrg / VedantaDC channel URLs
# - Vedanta Society of Western Washington channel URL
CHANNELS: List[Dict[str, str]] = [
    {
        "name": "ChicagoVedanta",
        "channel_id": "UC64nHa3IWptZ-KPlQxdfsbw",
        "url": "https://www.youtube.com/@ChicagoVedanta/videos",
    },
    {
        "name": "VedantaNY",
        "channel_id": "UCZOKv_xnTzyLD9RJmbBUV9Q",
        "url": "https://www.youtube.com/@VedantaNY/videos",
    },
    {
        "name": "VedantaOrg",
        "channel_id": "UCoeQClkDRaj9uABKHfHJUdw",
        "url": "https://www.youtube.com/@VedantaOrg/videos",
    },
    {
        "name": "VedantaSocietyOfWesternWA",
        "channel_id": "UCHNlxSbZiXS6oBJuJEiiIPA",
        "url": "https://www.youtube.com/@vedantasocietyofwesternwa/videos",
    },
    {
        "name": "VedantaDC",
        "channel_id": "UC4zi_tfjGdO4Gjulz-GSAvg",
        "url": "https://www.youtube.com/@VedantaDC/videos",
    },
]


OUT_PATH = Path("assets/data/youtube_videos.json")
MAX_ITEMS = int(os.environ.get("VT_YT_MAX_ITEMS", "120"))
TIMEOUT_SEC = float(os.environ.get("VT_YT_TIMEOUT", "20"))


def _http_get(url: str, timeout: float) -> bytes:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Connection": "close",
    }
    req = Request(url, headers=headers)
    with urlopen(req, timeout=timeout) as resp:
        return resp.read()


def _parse_iso8601(dt: str) -> Optional[datetime]:
    s = (dt or "").strip()
    if not s:
        return None
    # Typical: 2026-01-15T22:13:04+00:00 or 2026-01-15T22:13:04Z
    try:
        if s.endswith("Z"):
            return datetime.fromisoformat(s[:-1]).replace(tzinfo=timezone.utc)
        return datetime.fromisoformat(s)
    except Exception:
        return None


def _safe_text(el: Optional[ET.Element]) -> str:
    return (el.text or "").strip() if el is not None else ""


def _rss_url(channel_id: str) -> str:
    return f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"


def _thumb_url(video_id: str) -> str:
    # Works reliably; doesn't require API.
    return f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"


def fetch_channel_feed(channel: Dict[str, str]) -> Tuple[List[Dict], Optional[str]]:
    """Return (items, error_string)."""

    name = channel["name"]
    channel_id = channel["channel_id"]
    feed = _rss_url(channel_id)

    try:
        xml_bytes = _http_get(feed, TIMEOUT_SEC)
    except (HTTPError, URLError) as e:
        return [], f"{name}: failed to fetch RSS ({type(e).__name__}: {e})"
    except Exception as e:
        return [], f"{name}: failed to fetch RSS ({type(e).__name__}: {e})"

    try:
        root = ET.fromstring(xml_bytes)
    except Exception as e:
        return [], f"{name}: failed to parse RSS XML ({type(e).__name__}: {e})"

    # Namespaces used by YouTube RSS
    ns = {
        "atom": "http://www.w3.org/2005/Atom",
        "yt": "http://www.youtube.com/xml/schemas/2015",
        "media": "http://search.yahoo.com/mrss/",
    }

    items: List[Dict] = []

    for entry in root.findall("atom:entry", ns):
        vid = _safe_text(entry.find("yt:videoId", ns))
        title = _safe_text(entry.find("atom:title", ns))
        published_raw = _safe_text(entry.find("atom:published", ns))
        published_dt = _parse_iso8601(published_raw)

        link_el = entry.find("atom:link", ns)
        url = (link_el.attrib.get("href") if link_el is not None else "") or ""

        author_el = entry.find("atom:author", ns)
        author_name = _safe_text(author_el.find("atom:name", ns) if author_el is not None else None)

        # Fallback: extract v= from link
        if not vid and url:
            m = re.search(r"[?&]v=([A-Za-z0-9_-]{6,})", url)
            if m:
                vid = m.group(1)

        if not vid:
            continue

        items.append(
            {
                "id": vid,
                "title": title,
                "url": url or f"https://www.youtube.com/watch?v={vid}",
                "published": (published_dt or datetime.now(timezone.utc)).isoformat(),
                "channel": author_name or name,
                "channelId": channel_id,
                "channelSource": name,
                "channelUrl": channel.get("url", ""),
                "thumb": _thumb_url(vid),
            }
        )

    return items, None


def main() -> int:
    all_items: List[Dict] = []
    errors: List[str] = []

    for ch in CHANNELS:
        items, err = fetch_channel_feed(ch)
        if err:
            errors.append(err)
        all_items.extend(items)
        # Be nice to YouTube (and reduce chances of throttling)
        time.sleep(0.35)

    # De-dupe by video id
    dedup: Dict[str, Dict] = {}
    for it in all_items:
        vid = str(it.get("id") or "").strip()
        if not vid:
            continue
        # Keep the newest if duplicates exist
        if vid not in dedup:
            dedup[vid] = it
        else:
            a = _parse_iso8601(str(dedup[vid].get("published") or "")) or datetime(1970, 1, 1, tzinfo=timezone.utc)
            b = _parse_iso8601(str(it.get("published") or "")) or datetime(1970, 1, 1, tzinfo=timezone.utc)
            if b > a:
                dedup[vid] = it

    items = list(dedup.values())

    def sort_key(x: Dict) -> float:
        dt = _parse_iso8601(str(x.get("published") or ""))
        return (dt.timestamp() if dt else 0.0)

    items.sort(key=sort_key, reverse=True)
    items = items[:MAX_ITEMS]

    payload = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "sources": [
            {
                "name": c["name"],
                "channelId": c["channel_id"],
                "url": c.get("url", ""),
                "rss": _rss_url(c["channel_id"]),
            }
            for c in CHANNELS
        ],
        "items": items,
        "errors": errors,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    # Print a short summary for CI logs
    print(f"Wrote {OUT_PATH} with {len(items)} items ({len(errors)} errors)")
    if errors:
        for e in errors[:10]:
            print(f"WARN: {e}")

    # Return non-zero only if EVERYTHING failed (keeps Pages building)
    if len(items) == 0 and errors:
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
