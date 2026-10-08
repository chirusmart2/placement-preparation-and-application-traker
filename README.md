# Pathway — Campus placement tracker

A full-stack placement tracker with a responsive frontend, a JSON API, and a SQLite database.

## Run locally

Requires Python 3.10 or newer; the app uses only Python's standard library.

```powershell
cd C:\tracking
python server.py
```

Open <http://127.0.0.1:8000>. The first run seeds five example applications in `data/pathway.sqlite3`. New and deleted applications are stored in that database. To check the API and database, open <http://127.0.0.1:8000/api/health>.

## API

- `GET /api/applications` — list applications
- `POST /api/applications` — create an application (`company`, `role`, `status`, `deadline`)
- `DELETE /api/applications/{id}` — remove an application
- `GET /api/recommendations` — get the current skill recommendation
- `GET /api/health` — check server and database status

## Mobile app

The companion Expo app lives in `mobile/` and uses the same API and database.

```powershell
cd C:\tracking\mobile
npm install
$env:EXPO_PUBLIC_API_URL = "http://YOUR_COMPUTER_IP:8000"
npm start
```

Scan the Expo QR code with Expo Go. A physical phone must use your computer's LAN IP; `localhost` on the phone points to the phone itself. Set `EXPO_PUBLIC_API_URL` to the deployed web service URL when the backend is deployed.

## Deploy

`render.yaml` configures a Render web service with a persistent disk for SQLite. Push this folder to a Git repository, then in Render choose **New → Blueprint** and connect that repository. Render will create the service from the Blueprint and give it a public URL. The disk keeps the SQLite data across restarts.

The deployment requires a Render account and a Git repository connected to it. The current workspace has no configured remote, so it cannot be published to a public URL from here yet.
