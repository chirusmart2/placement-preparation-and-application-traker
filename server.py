"""Pathway placement tracker with account authentication and SQLite/PostgreSQL storage."""
from __future__ import annotations

from contextlib import contextmanager
from datetime import date, datetime
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Iterator
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
USE_POSTGRES = DATABASE_URL.startswith(("postgres://", "postgresql://"))
if DATABASE_URL and not USE_POSTGRES:
    raise RuntimeError("DATABASE_URL must be a PostgreSQL connection URL.")
if USE_POSTGRES:
    DB_PATH = None
else:
    DATA_DIR = Path(os.environ.get("DATA_DIR", ROOT / "data"))
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    DB_PATH = Path(os.environ.get("DATABASE_PATH", DATA_DIR / "pathway.sqlite3"))

_auth_secret = os.environ.get("AUTH_SECRET", "")
if _auth_secret and len(_auth_secret.encode("utf-8")) < 32:
    raise RuntimeError("AUTH_SECRET must contain at least 32 bytes.")
AUTH_SECRET = _auth_secret.encode("utf-8") if _auth_secret else secrets.token_bytes(32)
TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7
PASSWORD_ITERATIONS = 310_000
VALID_STATUSES = {"Applied", "In review", "Interview", "Offer"}


@contextmanager
def connect_db() -> Iterator:
    if USE_POSTGRES:
        import psycopg
        from psycopg.rows import dict_row

        connection = psycopg.connect(DATABASE_URL, row_factory=dict_row)
    else:
        connection = sqlite3.connect(DB_PATH)
        connection.row_factory = sqlite3.Row
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def execute(db, statement: str, parameters=()):
    if USE_POSTGRES:
        statement = statement.replace("?", "%s")
    return db.execute(statement, parameters)


def initialize_db() -> None:
    with connect_db() as db:
        user_id_column = "BIGSERIAL PRIMARY KEY" if USE_POSTGRES else "INTEGER PRIMARY KEY AUTOINCREMENT"
        execute(db, f"""CREATE TABLE IF NOT EXISTS users (
            id {user_id_column},
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            full_name TEXT NOT NULL DEFAULT '',
            university TEXT NOT NULL DEFAULT '',
            target_role TEXT NOT NULL DEFAULT '',
            graduation_date TEXT NOT NULL DEFAULT '',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )""")

        if USE_POSTGRES:
            execute(db, "ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT ''")
            execute(db, "ALTER TABLE users ADD COLUMN IF NOT EXISTS university TEXT NOT NULL DEFAULT ''")
            execute(db, "ALTER TABLE users ADD COLUMN IF NOT EXISTS target_role TEXT NOT NULL DEFAULT ''")
            execute(db, "ALTER TABLE users ADD COLUMN IF NOT EXISTS graduation_date TEXT NOT NULL DEFAULT ''")
        else:
            user_columns = {row["name"] for row in execute(db, "PRAGMA table_info(users)").fetchall()}
            for column in ("full_name", "university", "target_role", "graduation_date"):
                if column not in user_columns:
                    execute(db, f"ALTER TABLE users ADD COLUMN {column} TEXT NOT NULL DEFAULT ''")

        id_column = "BIGSERIAL PRIMARY KEY" if USE_POSTGRES else "INTEGER PRIMARY KEY AUTOINCREMENT"
        deadline_column = "DATE NOT NULL" if USE_POSTGRES else "TEXT NOT NULL"
        execute(db, f"""CREATE TABLE IF NOT EXISTS applications (
            id {id_column},
            user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
            company TEXT NOT NULL,
            role TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('Applied', 'In review', 'Interview', 'Offer')),
            deadline {deadline_column},
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )""")

        if USE_POSTGRES:
            execute(db, "ALTER TABLE applications ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE CASCADE")
        else:
            columns = {row["name"] for row in execute(db, "PRAGMA table_info(applications)").fetchall()}
            if "user_id" not in columns:
                execute(db, "ALTER TABLE applications ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE")
        execute(db, "CREATE INDEX IF NOT EXISTS applications_user_deadline ON applications(user_id, deadline)")


def application_dict(row) -> dict:
    deadline = row["deadline"]
    if isinstance(deadline, (date, datetime)):
        deadline = deadline.isoformat()[:10]
    return {"id": row["id"], "company": row["company"], "role": row["role"],
            "status": row["status"], "deadline": deadline}


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def issue_token(user_id: int, email: str) -> str:
    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = b64url(json.dumps({"sub": str(user_id), "email": email,
                               "exp": int(time.time()) + TOKEN_TTL_SECONDS}, separators=(",", ":")).encode())
    unsigned = f"{header}.{payload}"
    signature = b64url(hmac.new(AUTH_SECRET, unsigned.encode(), hashlib.sha256).digest())
    return f"{unsigned}.{signature}"


def parse_token(token: str):
    try:
        header, payload, signature = token.split(".")
        unsigned = f"{header}.{payload}"
        expected = b64url(hmac.new(AUTH_SECRET, unsigned.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            return None
        decoded = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        if int(decoded["exp"]) <= int(time.time()):
            return None
        return {"id": int(decoded["sub"]), "email": str(decoded["email"])}
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        return None


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

    def current_user(self):
        authorization = self.headers.get("Authorization", "")
        if not authorization.startswith("Bearer "):
            self.send_json({"error": "Sign in to continue."}, 401)
            return None
        user = parse_token(authorization[7:].strip())
        if user is None:
            self.send_json({"error": "Your session expired. Please sign in again."}, 401)
            return None
        with connect_db() as db:
            row = execute(db, "SELECT email FROM users WHERE id = ?", (user["id"],)).fetchone()
        if not row:
            self.send_json({"error": "Account not found. Please sign in again."}, 401)
            return None
        user["email"] = row["email"]
        return user

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/health":
            try:
                with connect_db() as db:
                    execute(db, "SELECT 1")
                self.send_json({"status": "ok", "database": "postgresql" if USE_POSTGRES else "sqlite"})
            except Exception:
                self.send_json({"status": "error", "database": "unavailable"}, 503)
            return
        if path == "/api/auth/me":
            user = self.current_user()
            if user:
                with connect_db() as db:
                    row = execute(db, "SELECT id, email, full_name, university, target_role, graduation_date FROM users WHERE id = ?",
                                  (user["id"],)).fetchone()
                if not row:
                    self.send_json({"error": "Account not found."}, 404)
                    return
                self.send_json({"user": dict(row)})
            return
        if path == "/api/applications":
            user = self.current_user()
            if not user:
                return
            with connect_db() as db:
                rows = execute(db, "SELECT * FROM applications WHERE user_id = ? ORDER BY deadline, id",
                               (user["id"],)).fetchall()
            self.send_json([application_dict(row) for row in rows])
            return
        if path == "/api/recommendations":
            user = self.current_user()
            if not user:
                return
            with connect_db() as db:
                roles = [row["role"].lower() for row in execute(
                    db, "SELECT role FROM applications WHERE user_id = ?", (user["id"],)
                )]
                profile = execute(db, "SELECT target_role FROM users WHERE id = ?", (user["id"],)).fetchone()
            target_role = profile["target_role"] if profile else ""
            keywords = {word for word in re.findall(r"[a-z0-9]+", target_role.lower()) if len(word) > 2}
            matched = sum(1 for role in roles if keywords and any(word in role for word in keywords))
            if any(word in target_role.lower() for word in ("software", "engineer", "developer", "backend", "frontend")):
                topics = ["Data structures & algorithms", "Trees and graph traversal", "Practice common patterns"]
            elif any(word in target_role.lower() for word in ("data", "analyst", "analytics")):
                topics = ["SQL queries and joins", "Statistics fundamentals", "Communicating insights"]
            elif any(word in target_role.lower() for word in ("design", "ux", "product")):
                topics = ["Portfolio case studies", "User research methods", "Product thinking"]
            else:
                topics = ["Role specific interview practice", "Communication and STAR stories", "Review your target role"]
            self.send_json({"title": topics[0], "target_role": target_role, "matched_roles": matched,
                            "match_boost": round(matched / len(roles) * 100) if roles else None,
                            "topics": topics})
            return
        super().do_GET()

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        try:
            data = self.read_json()
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json({"error": str(error)}, 400)
            return

        if path in ("/api/auth/register", "/api/auth/login"):
            email = str(data.get("email", "")).strip().lower()
            password = str(data.get("password", ""))
            if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email) or len(email) > 254:
                self.send_json({"error": "Enter a valid email address."}, 400)
                return
            if path.endswith("register"):
                if len(password) < 10 or len(password) > 128:
                    self.send_json({"error": "Use a password between 10 and 128 characters."}, 400)
                    return
                salt = secrets.token_bytes(16)
                digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)
                stored_hash = f"pbkdf2_sha256${PASSWORD_ITERATIONS}${b64url(salt)}${b64url(digest)}"
                full_name = str(data.get("full_name", "")).strip()[:80]
                university = str(data.get("university", "")).strip()[:120]
                target_role = str(data.get("target_role", "")).strip()[:120]
                graduation_date = str(data.get("graduation_date", "")).strip()
                if not full_name or not university or not target_role or not graduation_date:
                    self.send_json({"error": "Complete your name, university, target role, and expected graduation date."}, 400)
                    return
                if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", graduation_date):
                    self.send_json({"error": "Enter a valid graduation date."}, 400)
                    return
                if graduation_date:
                    try:
                        date.fromisoformat(graduation_date)
                    except ValueError:
                        self.send_json({"error": "Enter a valid graduation date."}, 400)
                        return
                try:
                    with connect_db() as db:
                        if USE_POSTGRES:
                            row = execute(db, "INSERT INTO users(email, password_hash, full_name, university, target_role, graduation_date) VALUES (?, ?, ?, ?, ?, ?) RETURNING id, email, full_name, university, target_role, graduation_date",
                                          (email, stored_hash, full_name, university, target_role, graduation_date)).fetchone()
                        else:
                            cursor = execute(db, "INSERT INTO users(email, password_hash, full_name, university, target_role, graduation_date) VALUES (?, ?, ?, ?, ?, ?)",
                                             (email, stored_hash, full_name, university, target_role, graduation_date))
                            row = execute(db, "SELECT id, email, full_name, university, target_role, graduation_date FROM users WHERE id = ?", (cursor.lastrowid,)).fetchone()
                    user = dict(row)
                    self.send_json({"user": user, "token": issue_token(user["id"], user["email"])}, 201)
                except sqlite3.IntegrityError:
                    self.send_json({"error": "An account with that email already exists."}, 409)
                except Exception as error:
                    if USE_POSTGRES and error.__class__.__name__ == "UniqueViolation":
                        self.send_json({"error": "An account with that email already exists."}, 409)
                    else:
                        raise
                return

            with connect_db() as db:
                row = execute(db, "SELECT id, email, password_hash, full_name, university, target_role, graduation_date FROM users WHERE email = ?", (email,)).fetchone()
            valid = False
            if row:
                try:
                    scheme, iterations, salt, stored = row["password_hash"].split("$")
                    candidate = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"),
                                                    base64.urlsafe_b64decode(salt + "=" * (-len(salt) % 4)),
                                                    int(iterations))
                    valid = scheme == "pbkdf2_sha256" and hmac.compare_digest(b64url(candidate), stored)
                except (ValueError, TypeError):
                    valid = False
            if not valid:
                self.send_json({"error": "Email or password is incorrect."}, 401)
                return
            user = {key: row[key] for key in ("id", "email", "full_name", "university", "target_role", "graduation_date")}
            self.send_json({"user": user, "token": issue_token(user["id"], user["email"])})
            return

        if path != "/api/applications":
            self.send_json({"error": "Endpoint not found."}, 404)
            return
        user = self.current_user()
        if not user:
            return
        company = str(data.get("company", "")).strip()
        role = str(data.get("role", "")).strip()
        status = str(data.get("status", "Applied"))
        deadline = str(data.get("deadline", ""))
        if not company or len(company) > 100:
            self.send_json({"error": "Company is required and must be 100 characters or fewer."}, 400)
            return
        if not role or len(role) > 140:
            self.send_json({"error": "Role is required and must be 140 characters or fewer."}, 400)
            return
        if status not in VALID_STATUSES:
            self.send_json({"error": "Choose a valid application status."}, 400)
            return
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", deadline):
            self.send_json({"error": "Enter a valid deadline."}, 400)
            return
        try:
            parsed_deadline = date.fromisoformat(deadline)
        except ValueError:
            self.send_json({"error": "Enter a valid deadline."}, 400)
            return
        with connect_db() as db:
            row = execute(db,
                "INSERT INTO applications(user_id, company, role, status, deadline) VALUES (?, ?, ?, ?, ?) RETURNING *",
                (user["id"], company, role, status, parsed_deadline if USE_POSTGRES else deadline),
            ).fetchone()
        self.send_json(application_dict(row), 201)

    def do_PATCH(self) -> None:
        if urlparse(self.path).path != "/api/auth/me":
            self.send_json({"error": "Endpoint not found."}, 404)
            return
        user = self.current_user()
        if not user:
            return
        try:
            data = self.read_json()
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json({"error": str(error)}, 400)
            return
        full_name = str(data.get("full_name", "")).strip()
        university = str(data.get("university", "")).strip()
        target_role = str(data.get("target_role", "")).strip()
        graduation_date = str(data.get("graduation_date", "")).strip()
        if not full_name or len(full_name) > 80:
            self.send_json({"error": "Enter your name (80 characters or fewer)."}, 400)
            return
        if not university or not target_role or not graduation_date:
            self.send_json({"error": "Complete your university, target role, and expected graduation date."}, 400)
            return
        if len(university) > 120 or len(target_role) > 120:
            self.send_json({"error": "University and target role must be 120 characters or fewer."}, 400)
            return
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", graduation_date):
            self.send_json({"error": "Enter a valid graduation date."}, 400)
            return
        try:
            date.fromisoformat(graduation_date)
        except ValueError:
            self.send_json({"error": "Enter a valid graduation date."}, 400)
            return
        with connect_db() as db:
            execute(db, "UPDATE users SET full_name = ?, university = ?, target_role = ?, graduation_date = ? WHERE id = ?",
                    (full_name, university, target_role, graduation_date, user["id"]))
            row = execute(db, "SELECT id, email, full_name, university, target_role, graduation_date FROM users WHERE id = ?",
                          (user["id"],)).fetchone()
        self.send_json({"user": dict(row)})

    def do_DELETE(self) -> None:
        user = self.current_user()
        if not user:
            return
        match = re.fullmatch(r"/api/applications/(\d+)", urlparse(self.path).path)
        if not match:
            self.send_json({"error": "Endpoint not found."}, 404)
            return
        with connect_db() as db:
            cursor = execute(db, "DELETE FROM applications WHERE id = ? AND user_id = ?",
                             (int(match.group(1)), user["id"]))
        if cursor.rowcount == 0:
            self.send_json({"error": "Application not found."}, 404)
            return
        self.send_json({"deleted": True})


if __name__ == "__main__":
    initialize_db()
    port = int(os.environ.get("PORT", "8000"))
    print(f"Pathway is running at http://127.0.0.1:{port}")
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
