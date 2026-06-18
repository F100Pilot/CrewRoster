# CrewRoster — Installation Guide (Firebase + Render)

CrewRoster is a web application for Portugália Airlines crew members to consult their personal roster. Built with React (Firebase Hosting), Express API (Render), and Firestore.

## Architecture

| Component | Platform | URL |
|-----------|----------|-----|
| Frontend | Firebase Hosting | `https://crewroster-app.web.app` |
| Backend API | Render (free tier) | `https://crewroster-api.onrender.com` |
| Database | Firebase Firestore | `(default)` |

## Prerequisites

- **Node.js 20+** and **npm**
- **Firebase CLI**: `npm install -g firebase-tools`
- A **Firebase project** (free Spark plan)
- A **Render account** (free at [render.com](https://render.com))

---

## Quick Start (Local Development)

### 1. Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2. Configure environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and set secure values for:
- `JWT_SECRET` — Random string (generate: `openssl rand -hex 64`)
- `JWT_REFRESH_SECRET` — Another random string
- `REGISTRATION_SECRET` — Secret for user registration endpoint
- `GOOGLE_APPLICATION_CREDENTIALS` — Path to Firebase service account key

### 3. Start Firebase Emulators (for Firestore)

```bash
firebase emulators:start --only firestore
```

### 4. Start backend

```bash
cd backend
npm run dev
```

### 5. Seed demo data OR register your user

```bash
# Option A: Seed demo data
cd backend && npx ts-node src/db/seed.ts

# Option B: Register via API
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"crewCode":"PT12345","password":"demo123","fullName":"João Silva","base":"LIS","role":"First Officer","registrationSecret":"<your-secret>"}'
```

### 6. Start frontend

```bash
cd frontend
npm start
```

- **Frontend**: http://localhost:3000
- **API**: http://localhost:4000
- **Demo login**: CREW CODE `PT12345` / Password `demo123`

---

## Production Deployment

### Step 1: Deploy Firestore rules & indexes

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

### Step 2: Deploy backend to Render

1. Push the repo to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your GitHub repo (`F100Pilot/CrewRoster`)
4. Configure:
   - **Name**: `crewroster-api`
   - **Root Directory**: `backend`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Free tier**: Yes
5. Add environment variables:
   - `JWT_SECRET` — a long random string
   - `JWT_REFRESH_SECRET` — another long random string
   - `REGISTRATION_SECRET` — secret for user registration
   - `FRONTEND_URL` — `https://crewroster-app.web.app`
   - `GOOGLE_APPLICATION_CREDENTIALS` — content of your Firebase service account key (base64)
6. Click "Create Web Service"
7. Copy your Render URL (e.g., `https://crewroster-api.onrender.com`)

### Step 3: Configure frontend to point to Render

Edit `frontend/.env.production`:
```
REACT_APP_API_URL=https://crewroster-api.onrender.com
```

### Step 4: Deploy frontend to Firebase Hosting

```bash
cd frontend
npm run build
cd ..
firebase deploy --only hosting
```

### Step 5: Create your user account

```bash
curl -X POST https://crewroster-api.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"crewCode":"<YOUR-CREW-CODE>","password":"<YOUR-PASSWORD>","fullName":"<YOUR-NAME>","base":"LIS","role":"First Officer","registrationSecret":"<REGISTRATION_SECRET>"}'
```

You can now log in at `https://crewroster-app.web.app` with your real credentials.

---

## Creating Users

### Via API (recommended)

```
POST /api/auth/register
Body: { crewCode, password, fullName, base?, role?, email?, registrationSecret }
```

Requires `REGISTRATION_SECRET` to match the server's env var.

### Via seed script

```bash
cd backend
npx ts-node src/db/seed.ts
```

### Via Firebase Console

Go to Firestore → `users` collection → Add document.

Each user document needs:

```
users/{auto-id}
  crewCode: "PT12345"              (string)
  passwordHash: "<bcrypt hash>"    (string)
  fullName: "João Silva"           (string)
  base: "LIS"                      (string)
  role: "First Officer"            (string)
  email: "..."                     (string, optional)
  medicalValidity: <Timestamp>     (optional)
  lpcValidity: <Timestamp>         (optional)
  refreshToken: null               (string, optional)
```

Generate password hash:
```bash
node -e "require('bcrypt').hash('password', 12).then(h => console.log(h))"
```

---

## ICS Feed Usage

Each user gets a unique, permanent ICS feed URL.

1. Go to **Calendar** tab in the app
2. Copy your ICS feed URL
3. Subscribe in your calendar app:

| App | How to subscribe |
|-----|-----------------|
| **Google Calendar** | Settings → Add Calendar → From URL → Paste ICS URL |
| **Apple Calendar** | File → New Calendar Subscription → Paste URL |
| **Outlook** | Add Calendar → From Internet → Paste URL |
| **Thunderbird** | New Calendar → On the Network → iCalendar (ICS) → Paste URL |

When you import a new roster, events update automatically in all subscribed calendars.

---

## Importing from NetLine CrewLink

### CSV Export

1. In NetLine CrewLink, export your roster as CSV
2. In CrewRoster, go to **Roster** tab → **Import**
3. The system maps NetLine columns automatically

### ICS Export

1. In NetLine CrewLink, export as ICS/iCalendar
2. Click **Import** and select the `.ics` file

---

## Firestore Indexes

Required composite indexes are defined in `firestore.indexes.json`.

Deploy them before first use:
```bash
firebase deploy --only firestore:indexes
```

---

## Project Structure

```
CrewRoster/
├── firebase.json              # Firebase Hosting + Functions config
├── .firebaserc                 # Firebase project alias
├── firestore.indexes.json     # Firestore composite indexes
├── .env.example               # Example environment variables
├── INSTALL.md                 # This file
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env
│   └── src/
│       ├── index.ts           # Cloud Function entry point
│       ├── config/
│       │   └── firebase.ts    # Firebase Admin init
│       ├── middleware/
│       │   ├── auth.ts        # JWT authentication
│       │   └── errorHandler.ts
│       ├── routes/
│       │   ├── auth.ts        # Login/refresh/logout
│       │   ├── roster.ts      # Roster queries
│       │   ├── profile.ts     # User profile
│       │   ├── notifications.ts
│       │   ├── calendar.ts    # ICS feed + export
│       │   └── import.ts      # File import
│       ├── services/
│       │   ├── csvParser.ts   # CSV parsing
│       │   └── icsParser.ts   # ICS parsing
│       └── db/
│           └── seed.ts        # Demo data seeder
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── public/
│   │   └── index.html
│   └── src/
│       ├── index.tsx          # React entry
│       ├── App.tsx            # Routing
│       ├── theme.ts           # MUI theme
│       ├── contexts/
│       │   └── AuthContext.tsx
│       ├── services/
│       │   └── api.ts         # Axios client
│       ├── components/
│       │   └── Layout.tsx     # Bottom nav
│       └── pages/
│           ├── LoginPage.tsx
│           ├── DashboardPage.tsx
│           ├── MonthlyRosterPage.tsx
│           ├── DailyDetailPage.tsx
│           ├── CalendarExportPage.tsx
│           ├── NotificationsPage.tsx
│           └── ProfilePage.tsx
```

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/register | No | Register (needs secret) |
| POST | /api/auth/login | No | Login |
| POST | /api/auth/refresh | No | Refresh token |
| POST | /api/auth/logout | Yes | Logout |
| GET | /api/auth/me | Yes | Current user |
| GET | /api/roster/:year/:month | Yes | Monthly roster |
| GET | /api/roster/daily/:date | Yes | Daily details |
| GET | /api/roster/next | Yes | Next duty |
| GET | /api/roster/stats | Yes | Monthly stats |
| GET | /api/roster/changes | Yes | Recent changes |
| GET | /api/profile | Yes | User profile |
| PUT | /api/profile | Yes | Update profile |
| GET | /api/notifications | Yes | Notifications |
| PUT | /api/notifications/:id/read | Yes | Mark read |
| PUT | /api/notifications/read-all | Yes | Mark all read |
| GET | /api/calendar/export | Yes | ICS feed URL |
| GET | /api/calendar/ics-feed/:token | No | Public ICS feed |
| POST | /api/import/upload | Yes | Import roster |

---

## Security Notes

- Change all JWT secrets before deploying
- Never commit `.env` files
- ICS feed tokens are random UUIDs — keep them private
- Set up Firebase Security Rules for Firestore
- Enable Firebase App Check for API protection
