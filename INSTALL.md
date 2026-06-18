# CrewRoster — Installation Guide (Firebase)

CrewRoster is a web application for Portugália Airlines crew members to consult their personal roster. Built with React, Firebase Cloud Functions, and Firestore.

## Prerequisites

- **Node.js 20+** and **npm**
- **Firebase CLI**: `npm install -g firebase-tools`
- A **Firebase project** (free Spark plan works)

---

## Quick Start (Local Development)

### 1. Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2. Login to Firebase

```bash
firebase login
firebase use --add   # Select or create your Firebase project
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set secure values for:
- `JWT_SECRET` — Random string (generate: `openssl rand -hex 64`)
- `JWT_REFRESH_SECRET` — Another random string
- `APP_URL` — Your deployed Cloud Function URL

### 4. Start Firebase Emulators

```bash
firebase emulators:start
```

This starts:
- Firestore Emulator (port 8080)
- Cloud Functions (port 5001)
- Hosting (port 5000)

### 5. Seed demo data

```bash
cd backend
npx ts-node src/db/seed.ts
```

### 6. Start frontend

```bash
cd frontend
npm start
```

- **Frontend**: http://localhost:3000
- **API (emulator)**: http://localhost:5001/crewroster-app/us-central1/api
- **Demo login**: Employee `PT12345` / Password `demo123`

---

## Firebase Deployment

### 1. Deploy Firestore indexes

```bash
firebase deploy --only firestore:indexes
```

Wait for indexes to complete building (check Firebase Console → Firestore → Indexes).

### 2. Deploy Cloud Functions

```bash
npm run deploy   # from backend/
# or:
cd backend && npm run build && firebase deploy --only functions
```

### 3. Deploy Hosting

```bash
cd frontend && npm run build
firebase deploy --only hosting
```

### 4. Full deploy

```bash
cd frontend && npm run build
firebase deploy
```

### 5. Set environment variables in Firebase

```bash
firebase functions:config:set jwt.secret="your-jwt-secret" jwt.refresh_secret="your-refresh-secret"
```

---

## Creating Users

Use Firebase Console → Firestore → `users` collection, or run the seed script:

```bash
cd backend
npx ts-node src/db/seed.ts
```

Each user document needs:

```
users/{auto-id}
  employeeNumber: "PT12345"        (string)
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
