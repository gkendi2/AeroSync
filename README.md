
AeroSync ✈️
AeroSync is a mobile ground operations management application built for airport staff. It provides role-based access for handlers and supervisors and supports day-to-day operational workflows including crew task management, baggage tracking, QR-based baggage handling, and incident reporting.

Overview
AeroSync is designed to bring key ground operations activities into one mobile application.

The application uses Firebase Authentication and Cloud Firestore for authentication, staff profiles, operational records, and real-time updates.

User Roles
Handler
Handlers can:

View assigned operational tasks
Start and complete assigned tasks
Scan baggage QR codes
Register baggage handling actions
Record baggage loading and offloading
Report operational incidents
View their account information
Supervisor
Supervisors can:

View the operations dashboard
Review pending staff approvals
Manage baggage operations
View crew information and assignments
Monitor delay-risk information
Review operational information
Access their account
Key Features
📦 Baggage Operations
AeroSync supports a complete baggage tracking workflow:

Register a baggage record
Generate a unique QR code
Save the QR code to the device's photo library
Scan the QR code using the AeroSync scanner
Verify the baggage and flight information
Record the loading action
Record the offloading action
Track the baggage status in Firestore
Baggage records progress through controlled statuses:

Registered → Loading → Offloaded
The handling workflow uses a Firestore transaction so the baggage status update and handling event are recorded as one atomic operation.

👷 Crew Tasks
Supervisors can assign operational activities to handlers.

Handlers can view their assigned tasks and move them through the supported workflow:

Assigned → In Progress → Completed
⚠️ Incident Reporting
Approved staff can report operational incidents with:

Incident type
Flight number
Location
Severity
Description
Reporter
Report time
Incident status
New incidents are stored in Firestore and displayed in the application.

👤 Account Management
The Account screen provides staff with:

Profile information
Account role
Account access status
About AeroSync information
Help and support information
Secure sign-out
Authentication and Security
AeroSync uses Firebase Authentication for user authentication and Cloud Firestore for application data.

Firestore security rules enforce role-based access for operational collections. Handler actions are restricted to valid state transitions, while supervisor permissions provide access to supervisory workflows.

The application also prevents pending accounts from accessing the operational application until their requested role has been approved.

Technology Stack
React Native
Expo SDK 57
Expo Router
TypeScript
Firebase Authentication
Cloud Firestore
React Native SVG
QR code generation and scanning
Jest
Jest Expo
Project Structure
AeroSync/
├── src/
│   ├── app/
│   │   ├── _layout.tsx
│   │   ├── index.tsx
│   │   ├── explore.tsx
│   │   ├── scan-qr.tsx
│   │   ├── baggage.tsx
│   │   ├── incidents.tsx
│   │   └── account.tsx
│   │
│   ├── components/
│   │   ├── app-tabs.tsx
│   │   ├── baggage-qr-card.tsx
│   │   └── register-baggage-screen.tsx
│   │
│   ├── features/
│   │   └── baggage/
│   │       ├── handling.ts
│   │       ├── handlingService.ts
│   │       ├── qr.ts
│   │       ├── validation.ts
│   │       └── _tests_/
│   │
│   └── lib/
│       └── firebase.ts
│
├── firestore.rules
├── jest.config.js
├── package.json
└── README.md
Getting Started
1. Install dependencies
npm install
2. Start the Expo development server
npx expo start
Then open the application using an available development option such as Expo Go, a development build, an Android emulator, or an iOS simulator.

3. Firebase configuration
AeroSync requires a Firebase project configured for:

Firebase Authentication
Cloud Firestore
The application's Firebase configuration is contained in the project's Firebase library configuration.

Do not commit private credentials, service-account files, or other secrets to the repository.

Testing
AeroSync includes Jest unit tests for the baggage workflow.

Run the baggage tests with:

npx jest src/features/baggage/_tests_ --runInBand
The current baggage test suite covers:

Baggage handling state transitions
QR payload creation and parsing
Flight-number validation
Current result:

Test Suites: 3 passed, 3 total
Tests:       27 passed, 27 total
TypeScript can be checked with:

npx tsc --noEmit
Baggage Handling Validation
The baggage workflow includes validation to prevent invalid operations.

Examples:

A registered bag can be loaded.
A loaded bag can be offloaded.
A bag that has already been offloaded cannot be processed again.
A bag cannot be offloaded before it has been loaded.
Invalid flight numbers are rejected during registration.
Invalid QR payloads are rejected during scanning.
These rules are also enforced at the Firestore security-rule level.

Design
AeroSync uses a consistent visual language across the application:

Navy: #163B65
Blue: #2878C8
Light grey background: #F4F6FA
White operational cards
Rounded components
Role-aware navigation
Clear status indicators
The interface is designed to keep important ground-operations actions easy to find and quick to use on mobile devices.

Development Notes
The project uses Expo Router for file-based navigation and a role-aware tab layout.

Authentication state is handled at the application root. Once authenticated, the user's Firestore profile determines whether the user is a handler or supervisor and which operational navigation is displayed.

Operational data is stored in Cloud Firestore and updated in real time where appropriate.

License
This project is developed as an academic software project.

