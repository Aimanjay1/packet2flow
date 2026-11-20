import asyncio
import hashlib
import os
import time
from pathlib import Path

import httpx

VT_BASE = "https://www.virustotal.com/api/v3"
DIRECT_UPLOAD_LIMIT = 32 * 1024 * 1024  # bigger files need an upload URL
FREE_TIER_INTERVAL = 15.5  # seconds between calls: 4 requests per minute

class VTError(Exception):
    pass

class RateLimiter:
    """Makes every caller wait so calls are at least `interval` seconds apart."""

    def __init__(self, interval: float):
        self.interval = interval
        self._lock = asyncio.Lock()
        self._last = 0.0
    async def wait(self):
        async with self._lock:
            delay = self._last + self.interval - time.monotonic()
            if delay > 0:
                await asyncio.sleep(delay)
            self._last = time.monotonic()
def sha256_of(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()
def verdict_from(attrs: dict, sha256: str) -> dict:
    """Turn a VirusTotal file report into the flag the UI shows."""
    stats = attrs.get("last_analysis_stats", {})
    # For PCAPs VirusTotal also runs IDS rules (Suricata/Snort); use them if present.
    ids = attrs.get("crowdsourced_ids_stats", {})
    malicious = stats.get("malicious", 0)
    suspicious = stats.get("suspicious", 0)

    if malicious > 0 or ids.get("high", 0) > 0:
        flag = "malicious"
    elif suspicious > 0 or ids.get("medium", 0) > 0:
        flag = "suspicious"
    else:
        flag = "clean"

    return {
        "flag": flag,
        "malicious": malicious,
        "suspicious": suspicious,
        "harmless": stats.get("harmless", 0),
        "undetected": stats.get("undetected", 0),
        "ids_alerts": ids,
        "permalink": f"https://www.virustotal.com/gui/file/{sha256}",
    }
class VirusTotalClient:
    def __init__(self, api_key: str, interval: float = FREE_TIER_INTERVAL):
        self.http = httpx.AsyncClient(
            headers={"x-apikey": api_key},
            timeout=httpx.Timeout(60, write=600),  # big uploads need a long write timeout
        )
        self.limiter = RateLimiter(interval)

    async def _request(self, method: str, url: str, file_path: str | None = None):
        for _ in range(5):
            await self.limiter.wait()
            if file_path:
                # Reopen on every attempt so a retry sends the whole file again.
                with open(file_path, "rb") as f:
                    files = {"file": (Path(file_path).name, f)}
                    r = await self.http.request(method, url, files=files)
            else:
                r = await self.http.request(method, url)
            if r.status_code == 429:  # QuotaExceededError
                await asyncio.sleep(60)
                continue
            return r
        raise VTError("VirusTotal quota exceeded. Try again later.")

    async def lookup(self, sha256: str) -> dict | None:
        r = await self._request("GET", f"{VT_BASE}/files/{sha256}")
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return r.json()["data"]["attributes"]

    async def upload(self, path: str) -> str:
        url = f"{VT_BASE}/files"
        if os.path.getsize(path) > DIRECT_UPLOAD_LIMIT:
            r = await self._request("GET", f"{VT_BASE}/files/upload_url")
            r.raise_for_status()
            url = r.json()["data"]
        r = await self._request("POST", url, file_path=path)
        r.raise_for_status()
        return r.json()["data"]["id"]  # analysis id

    async def wait_for_analysis(self, analysis_id: str, timeout: float = 900):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            r = await self._request("GET", f"{VT_BASE}/analyses/{analysis_id}")
            r.raise_for_status()
            if r.json()["data"]["attributes"]["status"] == "completed":
                return
            await asyncio.sleep(15)
        raise VTError("VirusTotal analysis timed out")

    async def scan_file(self, path: str) -> dict:
        sha256 = await asyncio.to_thread(sha256_of, path)  # hashing 500 MB blocks, so use a thread
        attrs = await self.lookup(sha256)
        source = "cached"
        if attrs is None:
            analysis_id = await self.upload(path)
            await self.wait_for_analysis(analysis_id)
            attrs = await self.lookup(sha256) or {}
            source = "uploaded"
        return {"sha256": sha256, "source": source, **verdict_from(attrs, sha256)}