# AeroSync

AeroSync is a mobile app for airport ground operations. Handlers and supervisors use it to coordinate crew tasks, baggage handling, incident reports and flight delay risk. It is built with **Expo SDK 58** (React Native, Expo Router, TypeScript) and **Firebase** (Authentication and Cloud Firestore), and runs on Android, iOS (Expo Go) and the web.

## Roles

- **Handler:** checks in and out for the day, works through assigned tasks, scans baggage QR codes to record loading and offloading, reports incidents and sees the supervisor's corrective action, and messages the crew of their flights.
- **Supervisor:** manages flights, registers baggage (with QR codes and a handling history per bag), assigns crew, monitors delay risk, manages incident reports and messages any flight.
- **Administrator:** a supervisor account that also approves or rejects new registrations. Approvals require two-factor sign-in with an authenticator app.

New accounts (email/password, or Google on the web) stay pending until the administrator approves them.

## Main features

- **Baggage:** registration with QR codes, scanning, and the Registered → Loading → Offloaded workflow, recorded in Firestore transactions.
- **Bag history:** a timeline per bag showing who registered, loaded and offloaded it, and when.
- **Crew tasks:** Assigned → In Progress → Completed, with attendance check-in and overdue tasks.
- **Suggested handlers:** the assignment form suggests up to three free handlers for the chosen shift; the supervisor still decides.
- **Delay risk:** a decision tree combined with operational rules R1–R4 gives High, Medium or Low per flight, with a plain-language explanation.
- **Incidents:** reporting, review status and corrective actions.
- **Flight messages:** a message thread per flight.
- **In-app notifications:** new tasks, report updates, messages, new incidents and High-risk flights.
- **Stay signed in on phones:** Android and iOS keep you signed in after the app restarts; the web signs you out when the browser tab closes.

## Getting started

Requirements: Node.js 22 and npm.

```bash
npm install
npx expo start
```

Then scan the QR code with **Expo Go** on a phone, or press `w` to open the web version.

## Tests and type check

```bash
npm test            # Jest unit tests
npm run typecheck   # TypeScript (tsc --noEmit)
```

GitHub Actions runs both on every push and pull request to `main` (`.github/workflows/ci.yml`).

## Project structure

```text
AeroSync/
├── src/
│   ├── app/                 Screens and routes (Expo Router): home, flights, baggage, crew,
│   │                        delay risk, incidents, approvals, messages, notifications, account
│   ├── components/          Shared UI: tab bar, sign-in screen, pickers, QR card, bag history
│   ├── features/            App logic by feature; unit tests sit in each _tests_/ folder
│   │   ├── auth/            Admin two-factor (authenticator app) helpers
│   │   ├── baggage/         Handling workflow, QR codes and flight-number validation
│   │   ├── crew/            Suggested handlers for crew assignments
│   │   ├── datetime/        Date and shift-time formats
│   │   ├── delay-risk/      Decision Tree evaluation, rules R1–R4, live inputs and the risk explanation
│   │   ├── flights/         Airport list and search, upcoming flights, suggested shift times
│   │   ├── handler/         Handler tasks, attendance rules and bag progress
│   │   ├── messages/        Flight message threads and who can use them
│   │   └── notifications/   In-app notifications and unread counts
│   ├── lib/                 Firebase setup (sign-in kept on phones), admin account, Google sign-in
│   ├── constants/, context/, hooks/   Theme colours and helpers
│   └── types/               Extra TypeScript declarations
├── ml/
│   ├── notebooks/           AeroSync.ipynb: model training, evaluation and export
│   └── models/              Decision tree (.pkl, and .json used by the app) and parity test cases
├── data/                    Source and processed datasets for the model (raw zip files not committed)
├── scripts/                 Data preparation, airport list generator, admin two-factor tool
├── docs/brand/              AeroSync logo files
├── .github/workflows/       ci.yml: type check and tests on push and pull request to main
├── firestore.rules          Firestore security rules (publish in the Firebase console)
├── requirements.txt         Python packages for the notebook and scripts
├── jest.config.js           Test setup (jest-expo)
└── app.json, package.json, tsconfig.json   Expo, npm and TypeScript configuration
```

## Firestore security rules

The rules are in `firestore.rules`. Changing the file does not change the live database: publish it in the Firebase console (Firestore Database → Rules → Publish) after every change.

## Machine learning

The delay-risk model lives in `ml/`:

- `ml/notebooks/AeroSync.ipynb`: training, evaluation and export (run in Google Colab)
- `ml/models/`: the trained tree (`.pkl`), the same tree as JSON used by the app, and the test cases that check the app gives the same results
- `ml/README.md`: model inputs, rules and how to reproduce it

Python packages are listed in `requirements.txt` (`pip install -r requirements.txt`). The data preparation scripts are in `scripts/`. The model is trained on synthetic data and is a prototype, not a validated delay prediction.

## Scripts

- `scripts/generate-airports.js`: regenerates the airport list used by the flight form.
- `scripts/admin-mfa.js`: administrator tool to enable two-factor authentication or reset the administrator's second factor. It needs a Firebase service-account key stored **outside** this folder; never commit key files.

## Data sources and attribution

The airport list used by the flight form (`src/features/flights/airports.generated.ts`) is derived from the OpenFlights Airport and Route Databases (https://openflights.org/data.php), from the copy in `data/reference/kq-routes-reference.zip`.

The OpenFlights databases are made available under the Open Database License (ODbL) v1.0 (https://opendatacommons.org/licenses/odbl/1-0/). Any rights in individual contents of the databases are licensed under the Database Contents License (DbCL) v1.0 (https://opendatacommons.org/licenses/dbcl/1-0/). Airport base data in OpenFlights comes from OurAirports and DAFIF and is in the public domain.

The derived airport list (every Kenyan airport with an IATA code, plus every airport in a Kenya Airways route) is likewise made available under the ODbL v1.0. It is generated by `scripts/generate-airports.js`.

The OpenFlights route data stopped being updated in June 2014, so the list reflects Kenya Airways routes as of 2014 and is of historical value only. Current destinations that are missing from the list (for example JFK) can still be entered in the flight form by typing their 3-letter IATA code.

## License

This project is developed as an academic software project. Third-party data is used under the licences listed in Data sources and attribution above.
