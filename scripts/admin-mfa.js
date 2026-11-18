/**
 * One-off administration of two-factor authentication (TOTP) for AeroSync.
 * Needs Firebase Authentication with Identity Platform and a service-account
 * key stored OUTSIDE this repository.
 *
 *   node scripts/admin-mfa.js status      --key "C:\keys\aerosync-key.json"
 *   node scripts/admin-mfa.js enable-totp --key "C:\keys\aerosync-key.json"
 *   node scripts/admin-mfa.js reset-admin --key "C:\keys\aerosync-key.json"
 *
 * status       Shows the project's MFA setting and the admin's enrolled factors.
 * enable-totp  Turns on TOTP (authenticator app) MFA for the project,
 *              accepting codes from 5 adjacent 30-second windows.
 * reset-admin  Removes ALL second factors from the admin account
 *              (recovery if the authenticator phone is lost).
 *
 * After use: delete the key file and delete the key in the Google Cloud console.
 */
const fs = require('fs');
const path = require('path');
const { cert, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const ADMIN_UID = '1IN8y6QDe4WyqGhMXXG3OzRtSWE3';
const REPO_ROOT = path.resolve(__dirname, '..');
const COMMANDS = ['status', 'enable-totp', 'reset-admin'];

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function readArgs() {
  const [command, ...rest] = process.argv.slice(2);
  const keyIndex = rest.indexOf('--key');
  const keyPath = keyIndex >= 0 ? rest[keyIndex + 1] : undefined;

  if (!COMMANDS.includes(command) || !keyPath) {
    fail(
      'Usage: node scripts/admin-mfa.js <status|enable-totp|reset-admin> --key "<path to service-account key outside the repo>"',
    );
  }

  const resolved = path.resolve(keyPath);
  const relative = path.relative(REPO_ROOT, resolved);
  const insideRepo = !relative.startsWith('..') && !path.isAbsolute(relative);

  if (insideRepo) {
    fail(
      'The key file is inside the AeroSync folder. Move it outside the repository (e.g. C:\\keys\\) and try again.',
    );
  }

  if (!fs.existsSync(resolved)) fail(`Key file not found: ${resolved}`);

  return { command, keyPath: resolved };
}

async function showStatus(auth) {
  const config = await auth.projectConfigManager().getProjectConfig();
  const providers = config.multiFactorConfig?.providerConfigs ?? [];
  const totp = providers.find((provider) => provider.totpProviderConfig);

  console.log(
    `Project TOTP MFA: ${totp ? `${totp.state} (adjacentIntervals ${totp.totpProviderConfig.adjacentIntervals ?? 'default'})` : 'not configured'}`,
  );

  const admin = await auth.getUser(ADMIN_UID);
  const factors = admin.multiFactor?.enrolledFactors ?? [];

  console.log(`Admin: ${admin.email} (email verified: ${admin.emailVerified ? 'yes' : 'no'})`);
  console.log(`Admin second factors: ${factors.length}`);
  for (const factor of factors) {
    console.log(`  - ${factor.factorId} "${factor.displayName ?? ''}" enrolled ${factor.enrollmentTime}`);
  }
}

async function main() {
  const { command, keyPath } = readArgs();

  // The key is only read here; it is never printed.
  const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  initializeApp({ credential: cert(serviceAccount) });
  const auth = getAuth();

  if (command === 'enable-totp') {
    await auth.projectConfigManager().updateProjectConfig({
      multiFactorConfig: {
        providerConfigs: [
          {
            state: 'ENABLED',
            totpProviderConfig: { adjacentIntervals: 5 },
          },
        ],
      },
    });
    console.log('TOTP MFA enabled for the project.');
  }

  if (command === 'reset-admin') {
    await auth.updateUser(ADMIN_UID, { multiFactor: { enrolledFactors: null } });
    console.log('All second factors removed from the admin account.');
  }

  await showStatus(auth);
}

main().catch((error) => {
  console.error(`\nFailed: ${error.message}\n`);
  process.exit(1);
});
