# PROJECT EVOLVE

Android-first personal performance system. Public source code; personal data must remain private.

## Status

The repository now contains two working layers:

1. A deterministic TypeScript domain core with 22 tests covering progression, streak/adherence logic, recovery signal classification, unit conversion, nutrition arithmetic and age-sensitive policy.
2. An Expo/React Native Android app with persistent SQLite storage, a Today dashboard, version-safe weekly planning, rest-aware streaks, private plan photos, live workout logging, per-exercise double-progression profiles, daily recovery signals and a durable sync outbox.

No Supabase project, AI service, private health data, credentials or personal photos are committed.

## Run the domain tests

Requires Node.js 24+.

```bash
npm test
```

## Run the Android app

The mobile package is in `apps/mobile` and targets Expo SDK 57 / React Native 0.86.

```bash
npm install
npm run mobile:android
```

The first launch creates and migrates the local SQLite schema automatically. The app can plan a week, attach private local photos, track streak/adherence, record recovery signals, log sets, configure real equipment load options and calculate evidence-backed progression proposals without a backend connection.

## Architecture

React Native/TypeScript mobile client → local SQLite and durable outbox → authenticated synchronization → PostgreSQL with owner-isolated access and private media. Independent domain engines supply evidence to a server-side contextual Coach.

Planned modules: onboarding; versioned programs; live workout; exercise library and substitutions; progression/PR; calendar; nutrition/manual/barcode/photo confirmation; meals/recipes/hydration; sleep/steps; check-ins/readiness; goals/scenarios; analytics/reviews; private body timeline; 3D avatar/body map; ranks/achievements; Coach actions; offline sync; export/deletion.

## Safety and privacy

Never commit credentials, photos, real workout histories or health records. Unknown age/minors disable automated calorie restriction and appearance scoring. Photo analysis is optional and estimates are labeled. Game levels do not measure health. Recommendations are product heuristics, not clinical validation.

## Next milestones

1. Add exercise templates/substitutions, PRs and richer workout history.
2. Add Supabase migrations, authentication, owner isolation and conflict-safe sync.
3. Add nutrition/manual/barcode/photo-confirmation flows and device adapters.
4. Add contextual AI with confirmed actions and budget controls.
5. Add a licensed rigged 3D avatar and complete Android device acceptance tests.
