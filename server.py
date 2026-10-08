"""Pathway placement tracker: static frontend and JSON API backed by SQLite."""
from __future__ import annotations

import json
import os
import re
import sqlite3
from datetime import date
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("DATA_DIR", ROOT / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = Path(os.environ.get("DATABASE_PATH", DATA_DIR / "pathway.sqlite3"))
VALID_STATUSES = {"Applied", "In review", "Interview", "Offer"}
SEED = [
    ("Northstar Labs", "Software Engineer Intern", "Interview", "2026-10-14"),
    ("Acme Technologies", "Frontend Developer", "In review", "2026-10-16"),
    ("Figma", "Product Design Intern", "Applied", "2026-10-19"),
    ("Vercel", "Software Engineer Intern", "Applied", "2026-10-22"),
    ("Stripe", "Product Engineer Intern", "In review", "2026-10-26"),
]


def connect_db() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_db() -> None:
    with connect_db() as db:
        db.execute("""CREATE TABLE IF NOT EXISTS applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company TEXT NOT NULL,
            role TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('Applied', 'In review', 'Interview', 'Offer')),
            deadline TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )""")
        count = db.execute("SELECT COUNT(*) FROM applications").fetchone()[0]
        if count == 0:
            db.executemany(
                "INSERT INTO applications(company, role, status, deadline) VALUES (?, ?, ?, ?)",
                SEED,
            )


def application_dict(row: sqlite3.Row) -> dict:
    return {"id": row["id"], "company": row["company"], "role": row["role"],
            "status": row["status"], "deadline": row["deadline"]}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_json(self, payload: object, status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length > 16_384:
            raise ValueError("Request body is too large.")
        data = json.loads(self.rfile.read(length) or b"{}")
        if not isinstance(data, dict):
            raise ValueError("Expected a JSON object.")
        return data

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/health":
            try:
                with connect_db() as db:
                    db.execute("SELECT 1")
                self.send_json({"status": "ok", "database": "connected"})
            except sqlite3.Error:
                self.send_json({"status": "error", "database": "unavailable"}, 503)
            return
        if path == "/api/applications":
            with connect_db() as db:
                rows = db.execute("SELECT * FROM applications ORDER BY deadline, id").fetchall()
            self.send_json([application_dict(row) for row in rows])
            return
        if path == "/api/recommendations":
            with connect_db() as db:
                roles = [row[0].lower() for row in db.execute("SELECT role FROM applications")]
            matched = sum(1 for role in roles if any(word in role for word in ("software", "engineer", "developer")))
            self.send_json({"title": "Data structures & algorithms", "matched_roles": matched,
                            "match_boost": min(12, 4 + matched * 2), "topics": 3})
            return
        super().do_GET()

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/api/applications":
            self.send_json({"error": "Endpoint not found."}, 404)
            return
        try:
            data = self.read_json()
            company = str(data.get("company", "")).strip()
            role = str(data.get("role", "")).strip()
            status = str(data.get("status", "Applied"))
            deadline = str(data.get("deadline", ""))
            if not company or len(company) > 100:
                raise ValueError("Company is required and must be 100 characters or fewer.")
            if not role or len(role) > 140:
                raise ValueError("Role is required and must be 140 characters or fewer.")
            if status not in VALID_STATUSES:
                raise ValueError("Choose a valid application status.")
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", deadline):
                raise ValueError("Enter a valid deadline.")
            date.fromisoformat(deadline)
            with connect_db() as db:
                cursor = db.execute("INSERT INTO applications(company, role, status, deadline) VALUES (?, ?, ?, ?)",
                                    (company, role, status, deadline))
                row = db.execute("SELECT * FROM applications WHERE id = ?", (cursor.lastrowid,)).fetchone()
            self.send_json(application_dict(row), 201)
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json({"error": str(error)}, 400)

    def do_DELETE(self) -> None:
        match = re.fullmatch(r"/api/applications/(\d+)", urlparse(self.path).path)
        if not match:
            self.send_json({"error": "Endpoint not found."}, 404)
            return
        with connect_db() as db:
            cursor = db.execute("DELETE FROM applications WHERE id = ?", (int(match.group(1)),))
        if cursor.rowcount == 0:
            self.send_json({"error": "Application not found."}, 404)
            return
        self.send_json({"deleted": True})


if __name__ == "__main__":
    initialize_db()
    port = int(os.environ.get("PORT", "8000"))
    print(f"Pathway is running at http://127.0.0.1:{port}")
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
