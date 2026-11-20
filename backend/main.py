import asyncio
import os
import re
import shutil
import uuid
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from pipeline.virustotal import VirusTotalClient

load_dotenv()
API_KEY = os.environ.get("VT_API_KEY")
if not API_KEY:
    raise RuntimeError("VT_API_KEY is not set. Add it to backend/.env")

BASE_DIR = Path(__file__).parent
UPLOADS = BASE_DIR / "uploads"
ALLOWED = {".pcap", ".cap", ".pcapng"}

app = FastAPI(title="Packet2Flow API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

vt = VirusTotalClient(API_KEY)
jobs: dict[str, dict] = {}
_tasks: set[asyncio.Task] = set()


def safe_name(name: str, index: int) -> str:
    base = re.sub(r"[^A-Za-z0-9._-]", "_", Path(name).name)
    return f"{index:03d}_{base}"


def save_upload(upload: UploadFile, dest: Path):
    with dest.open("wb") as out:
        shutil.copyfileobj(upload.file, out, 1024 * 1024)


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/analyses")
async def create_analysis(files: list[UploadFile] = File(...)):
    job_id = uuid.uuid4().hex
    job_dir = UPLOADS / job_id
    job_dir.mkdir(parents=True)

    items = []
    for i, upload in enumerate(files):
        name = upload.filename or f"file{i}"
        if Path(name).suffix.lower() not in ALLOWED:
            continue
        dest = job_dir / safe_name(name, i)
        await asyncio.to_thread(save_upload, upload, dest)
        items.append({"name": name, "path": str(dest), "status": "queued"})

    if not items:
        shutil.rmtree(job_dir)
        raise HTTPException(400, "No .pcap, .cap or .pcapng files received.")

    jobs[job_id] = {"id": job_id, "status": "running", "overall": None, "files": items}
    task = asyncio.create_task(run_scan(job_id))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return {"job_id": job_id}


async def run_scan(job_id: str):
    job = jobs[job_id]
    for item in job["files"]:
        item["status"] = "scanning"
        try:
            item.update(await vt.scan_file(item["path"]))
            item["status"] = "done"
        except Exception as exc:
            item["status"] = "error"
            item["error"] = str(exc)

    flags = {f.get("flag") for f in job["files"]}
    job["overall"] = (
        "malicious" if "malicious" in flags
        else "suspicious" if "suspicious" in flags
        else "clean" if "clean" in flags
        else None
    )
    job["status"] = "done"


@app.get("/analyses/{job_id}")
def get_analysis(job_id: str):
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(404, "Unknown analysis")
    files = [{k: v for k, v in f.items() if k != "path"} for f in job["files"]]
    return {**job, "files": files}