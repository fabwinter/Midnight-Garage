#!/usr/bin/env node
/* Release-readiness preflight — sanity checks that don't need Xcode,
   Android Studio, or any store credentials, so it runs in ordinary Node
   CI on every push. This is a *floor*, not a substitute for
   docs/STORE_SUBMISSION_CHECKLIST.md — passing this script means "nothing
   obviously broken," not "ready to submit."

   Usage: node tools/preflight-release.js
   Exit code 0 = no blocking failures (warnings may still exist).
   Exit code 1 = at least one blocking failure — see the [FAIL] lines. */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const rel = (...p) => path.join(ROOT, ...p);
const read = (p) => (existsSync(rel(p)) ? readFileSync(rel(p), 'utf8') : null);

const failures = [];
const warnings = [];
const fail = (msg) => failures.push(msg);
const warn = (msg) => warnings.push(msg);

// Bundle/package IDs that scaffolding tools (Capacitor, Ionic, Expo,
// Android Studio's "New Project" wizard) generate by default. Shipping
// any of these means the store console will either reject the binary
// (Apple, if the bundle ID isn't registered) or silently collide with
// someone else's app.
const PLACEHOLDER_ID_PATTERNS = [
  /^com\.example\./i,
  /^io\.ionic\.starter/i,
  /^com\.getcapacitor\./i,
  /^com\.mycompany\./i,
  /^org\.reactjs\.native\./i,
  /^host\.exp\.exponent/i,
  /^your\.app\.id/i,
  /^app\.placeholder/i,
];

function isPlaceholderId(id) {
  return PLACEHOLDER_ID_PATTERNS.some((re) => re.test(id));
}

// Hostnames/URLs that only resolve from a developer's own machine or an
// emulator, never from a real device pulling a release build.
const DEV_ENDPOINT_PATTERNS = [
  /localhost/i,
  /127\.0\.0\.1/,
  /\b10\.0\.2\.2\b/, // Android emulator's alias for the host machine
  /0\.0\.0\.0/,
  /\bngrok\.io\b/i,
  /\.local\b/i,
];

function findDevEndpoints(text) {
  const hits = new Set();
  for (const re of DEV_ENDPOINT_PATTERNS) {
    const m = text.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'));
    if (m) m.forEach((h) => hits.add(h));
  }
  return [...hits];
}

console.log('Midnight Garage — release preflight\n');

// ---------------------------------------------------------------------
// 1. capacitor.config.json — appId, and any dev server override
// ---------------------------------------------------------------------
const capRaw = read('capacitor.config.json');
let capConfig = null;
if (!capRaw) {
  fail('capacitor.config.json is missing.');
} else {
  try {
    capConfig = JSON.parse(capRaw);
  } catch (e) {
    fail(`capacitor.config.json is not valid JSON: ${e.message}`);
  }
}

let capAppId = null;
if (capConfig) {
  capAppId = capConfig.appId;
  if (!capAppId) {
    fail('capacitor.config.json is missing "appId".');
  } else if (isPlaceholderId(capAppId)) {
    fail(`capacitor.config.json "appId" is a scaffolding placeholder: "${capAppId}". Set the real reverse-DNS app ID before release.`);
  }
  // A `server.url` block points the whole native shell at a remote/dev
  // origin instead of the bundled webDir — legitimate for live-reload
  // during development, a real bug if it survives into a release build.
  if (capConfig.server && capConfig.server.url) {
    const hits = findDevEndpoints(capConfig.server.url);
    fail(`capacitor.config.json has "server.url" set to "${capConfig.server.url}" — this points the release build at a live/dev server instead of the bundled web app. Remove it before release.${hits.length ? ` (looks like a dev endpoint: ${hits.join(', ')})` : ''}`);
  }
}

// ---------------------------------------------------------------------
// 2. js/config.js — release-sensitive backend config (Supabase URL)
// ---------------------------------------------------------------------
const jsConfig = read('js/config.js');
if (jsConfig === null) {
  warn('js/config.js not found — skipping backend-endpoint checks.');
} else {
  const hits = findDevEndpoints(jsConfig);
  if (hits.length) {
    fail(`js/config.js references a development endpoint (${hits.join(', ')}). Analytics must point at a production Supabase project (or stay blank for fully-offline builds), never a local/dev host.`);
  }
}

// ---------------------------------------------------------------------
// 3. Android — applicationId/namespace, versionCode/versionName
// ---------------------------------------------------------------------
const gradle = read('android/app/build.gradle');
let androidAppId = null;
let androidNamespace = null;
let versionCode = null;
let versionName = null;
if (gradle === null) {
  warn('android/app/build.gradle not found — skipping Android checks (has `npx cap add android` been run?).');
} else {
  const appIdMatch = gradle.match(/applicationId\s+["']([^"']+)["']/);
  const nsMatch = gradle.match(/namespace\s+["']([^"']+)["']/);
  const vcMatch = gradle.match(/versionCode\s+(\d+)/);
  const vnMatch = gradle.match(/versionName\s+["']([^"']+)["']/);

  androidAppId = appIdMatch ? appIdMatch[1] : null;
  androidNamespace = nsMatch ? nsMatch[1] : null;
  versionCode = vcMatch ? Number(vcMatch[1]) : null;
  versionName = vnMatch ? vnMatch[1] : null;

  if (!androidAppId) fail('android/app/build.gradle is missing "applicationId".');
  else if (isPlaceholderId(androidAppId)) fail(`android/app/build.gradle "applicationId" is a scaffolding placeholder: "${androidAppId}".`);

  if (!Number.isInteger(versionCode) || versionCode < 1) {
    fail(`android/app/build.gradle "versionCode" is missing or invalid (found: ${vcMatch ? vcMatch[1] : 'none'}). Must be a positive integer, and must increase on every Play Store upload.`);
  }
  if (!versionName || !versionName.trim()) {
    fail('android/app/build.gradle "versionName" is missing or empty.');
  } else if (!/^\d+(\.\d+){1,3}$/.test(versionName)) {
    warn(`android/app/build.gradle "versionName" ("${versionName}") doesn't look like a dot-separated version number — double check it's intentional.`);
  }

  if (capAppId && androidAppId && capAppId !== androidAppId) {
    fail(`App ID mismatch: capacitor.config.json appId ("${capAppId}") != android applicationId ("${androidAppId}").`);
  }
  if (androidNamespace && androidAppId && androidNamespace !== androidAppId) {
    warn(`android/app/build.gradle "namespace" ("${androidNamespace}") differs from "applicationId" ("${androidAppId}") — usually intentional only if you changed applicationId post-launch; confirm this is deliberate.`);
  }
}

// ---------------------------------------------------------------------
// 4. iOS — bundle identifier, marketing/build version, privacy manifest
// ---------------------------------------------------------------------
const pbxproj = read('ios/App/App.xcodeproj/project.pbxproj');
let iosBundleIds = [];
if (pbxproj === null) {
  warn('ios/App/App.xcodeproj/project.pbxproj not found — skipping iOS checks (has `npx cap add ios` been run?).');
} else {
  iosBundleIds = [...pbxproj.matchAll(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*([^;]+);/g)].map((m) => m[1].trim());
  const marketingVersions = [...pbxproj.matchAll(/MARKETING_VERSION\s*=\s*([^;]+);/g)].map((m) => m[1].trim());
  const buildVersions = [...pbxproj.matchAll(/CURRENT_PROJECT_VERSION\s*=\s*([^;]+);/g)].map((m) => m[1].trim());

  if (!iosBundleIds.length) {
    fail('ios/App/App.xcodeproj/project.pbxproj has no PRODUCT_BUNDLE_IDENTIFIER entries.');
  } else {
    const uniqueIds = [...new Set(iosBundleIds)];
    for (const id of uniqueIds) {
      if (isPlaceholderId(id)) fail(`iOS PRODUCT_BUNDLE_IDENTIFIER is a scaffolding placeholder: "${id}".`);
    }
    if (uniqueIds.length > 1) {
      warn(`iOS build configurations disagree on PRODUCT_BUNDLE_IDENTIFIER: ${uniqueIds.join(', ')}. Confirm this is intentional (e.g. distinct Debug/Release IDs) — usually it should be the same across configs.`);
    }
    if (capAppId && !uniqueIds.includes(capAppId)) {
      fail(`App ID mismatch: capacitor.config.json appId ("${capAppId}") not found among iOS PRODUCT_BUNDLE_IDENTIFIER values (${uniqueIds.join(', ')}).`);
    }
  }

  if (!marketingVersions.length || marketingVersions.some((v) => !v)) {
    fail('ios project is missing MARKETING_VERSION (the App Store "version number").');
  }
  if (!buildVersions.length || buildVersions.some((v) => !v || !/^\d+(\.\d+)*$/.test(v))) {
    fail('ios project is missing a valid CURRENT_PROJECT_VERSION (the build number — Xcode accepts an integer or dot-separated integers, e.g. "3" or "1.0.3").');
  }

  // Privacy manifest must exist AND be registered as a resource in the
  // Xcode project — a file merely sitting in the folder isn't packaged
  // into the .ipa unless Xcode's Resources build phase references it.
  // Xcode names a PBXBuildFile entry's comment "<filename> in <phase>",
  // so look for that exact pairing rather than the two substrings
  // appearing anywhere in the file (which could both be true even if
  // some *other* file is the one actually in the Resources phase).
  const manifestPath = 'ios/App/App/PrivacyInfo.xcprivacy';
  if (!existsSync(rel(manifestPath))) {
    fail(`Missing iOS privacy manifest: ${manifestPath}. Apple requires PrivacyInfo.xcprivacy declaring any "required reason" API usage and tracking data.`);
  } else if (!pbxproj.includes('PrivacyInfo.xcprivacy')) {
    fail(`${manifestPath} exists but is not referenced in project.pbxproj — it won't be packaged into the build. Add it via Xcode (Add Files to "App", check the App target) or re-add its PBXBuildFile/PBXFileReference/Resources-phase entries.`);
  } else if (!/PrivacyInfo\.xcprivacy in Resources/.test(pbxproj)) {
    fail(`${manifestPath} is referenced in project.pbxproj but not wired into a "Resources" build phase — it won't be packaged into the build. Add it via Xcode (Add Files to "App", check the App target's Resources build phase).`);
  }

  const infoPlist = read('ios/App/App/Info.plist');
  if (infoPlist === null) {
    warn('ios/App/App/Info.plist not found — skipping ATT usage-description check.');
  } else if (!infoPlist.includes('NSUserTrackingUsageDescription')) {
    warn('ios/App/App/Info.plist has no NSUserTrackingUsageDescription. Required if the app (or an SDK it embeds, e.g. AdMob) can ever request the advertising identifier for tracking.');
  }
}

// ---------------------------------------------------------------------
// 5. Required release-readiness docs
// ---------------------------------------------------------------------
const REQUIRED_DOCS = [
  'docs/STORE_SUBMISSION_CHECKLIST.md',
  'docs/PRIVACY_POLICY_TEMPLATE.md',
  'docs/ACCOUNT_DELETION.md',
  'docs/STORE_LISTING_TEMPLATE.md',
  'docs/RELEASE_TEST_PLAN.md',
  'docs/store-listing/privacy-policy.html',
  'docs/store-listing/support.html',
];
for (const doc of REQUIRED_DOCS) {
  if (!existsSync(rel(doc))) fail(`Required release doc is missing: ${doc}`);
}

// A hosted privacy policy / support URL is what the store listing
// actually links to — the html exists in-repo, but nothing in
// tracked config records where it's actually hosted yet. That's a
// legitimate manual/console step (see docs/store-listing/README.md),
// not something this script can verify from source alone, so it's a
// warning rather than a failure.
warn('Hosted privacy-policy/support URLs are not tracked in repo config — confirm docs/store-listing/*.html are published at public URLs (see docs/store-listing/README.md) before filling them into the store consoles.');

// ---------------------------------------------------------------------
// 6. Known "fill in before submission" markers still in shipped code
// ---------------------------------------------------------------------
const FILL_IN_TARGETS = ['js/ads.js', 'js/iap.js'];
for (const f of FILL_IN_TARGETS) {
  const content = read(f);
  if (content === null) continue;
  const count = (content.match(/\[FILL IN/g) || []).length;
  if (count) {
    warn(`${f} still has ${count} "[FILL IN ...]" placeholder(s) — expected until real AdMob/RevenueCat accounts exist (see docs/STORE_SUBMISSION_CHECKLIST.md); must be resolved before the release build ships.`);
  }
}

// ---------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------
if (warnings.length) {
  console.log(`Warnings (${warnings.length}) — review, but not blocking:`);
  for (const w of warnings) console.log(`  [WARN] ${w}`);
  console.log('');
}

if (failures.length) {
  console.log(`Failures (${failures.length}):`);
  for (const f of failures) console.log(`  [FAIL] ${f}`);
  console.log('\npreflight-release: FAILED\n');
  process.exit(1);
}

console.log(`preflight-release: OK (${warnings.length} warning${warnings.length === 1 ? '' : 's'}, 0 failures)\n`);
