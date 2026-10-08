# Pathway — Campus placement tracker

A full-stack placement tracker with a responsive frontend, authenticated JSON API, and SQLite/PostgreSQL database support. Student accounts use hashed passwords and each account can access only its own applications.

## Run locally

Requires Python 3.10 or newer. For PostgreSQL, install the optional driver with `pip install -r requirements.txt`.

```powershell
cd C:\tracking
python server.py
```

Open <http://127.0.0.1:8000> and create an account. With no `DATABASE_URL`, the app creates a local SQLite database at `data/pathway.sqlite3`. Set `DATABASE_URL` to a PostgreSQL connection string to use a hosted PostgreSQL database instead. Accounts start with an empty tracker. To check the API and database, open <http://127.0.0.1:8000/api/health>.

The API generates a random signing secret at startup unless `AUTH_SECRET` is set. Set a stable secret when running multiple instances or when you want sessions to survive server restarts:

```powershell
$env:AUTH_SECRET = python -c "import secrets; print(secrets.token_urlsafe(48))"
```

## API

- `POST /api/auth/register` — create an account (`email`, `password`)
- `POST /api/auth/login` — sign in and receive a bearer token
- `GET /api/auth/me` — get the signed-in account (`Authorization: Bearer <token>`)
- `GET /api/applications` — list the signed-in account's applications
- `POST /api/applications` — create an application (`company`, `role`, `status`, `deadline`)
- `DELETE /api/applications/{id}` — remove an application owned by the signed-in account
- `GET /api/recommendations` — get the signed-in account's skill recommendation
- `GET /api/health` — check server and database status

Application and recommendation endpoints require the bearer token returned by the login or registration endpoints. Passwords must be 10–128 characters and are stored using PBKDF2-SHA256.

## Mobile app

The companion Expo app lives in `mobile/` and uses the same API and database.

```powershell
cd C:\tracking\mobile
npm install
$env:EXPO_PUBLIC_API_URL = "http://YOUR_COMPUTER_IP:8000"
npm start
```

Scan the Expo QR code with Expo Go. A physical phone must use your computer's LAN IP; `localhost` on the phone points to the phone itself. Set `EXPO_PUBLIC_API_URL` to the deployed web service URL when the backend is deployed. Sign in in the app; the session token stays in memory and is cleared when the app closes.

## Deploy

`render.yaml` configures a Render web service that expects a PostgreSQL `DATABASE_URL` and a private `AUTH_SECRET`. Push this folder to a Git repository, then in Render choose **New → Blueprint** and connect that repository. Add a PostgreSQL connection string as `DATABASE_URL` and generate an unguessable secret for `AUTH_SECRET` when prompted. Do not commit either secret. Render will create the service from the Blueprint and give it a public URL.

The deployment requires a Render account and a PostgreSQL database connection string. The public repository is at <https://github.com/chirusmart2/placement-preparation-and-application-traker>.
