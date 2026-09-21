# PROJECT EVOLVE

Android-first personal performance system. Public source code; personal data must remain private.

## Status

Initial deterministic domain implementation, not an installable app. No backend has been provisioned and no AI or device integration is active.

Implemented: validated double-progression proposals, assisted-load direction, incomplete-session handling, explicit evidence, civil-date adherence, unit conversion, nutrition arithmetic and age-sensitive policy.

Run tests with Node.js 24+: `npm test`. No runtime dependencies or API credits required.

## Architecture

React Native/TypeScript mobile client → local SQLite and durable outbox → authenticated synchronization → PostgreSQL with owner-isolated access and private media. Independent domain engines supply evidence to a server-side contextual Coach. Native Android builds and device tests are required; a web deployment is not an Android delivery.

Planned modules: onboarding; versioned programs; live workout; exercise library and substitutions; progression/PR; calendar; nutrition/manual/barcode/photo confirmation; meals/recipes/hydration; sleep/steps; check-ins/readiness; goals/scenarios; analytics/reviews; private body timeline; 3D avatar/body map; ranks/achievements; Coach actions; offline sync; export/deletion.

## Safety and privacy

Never commit credentials, photos, real workout histories or health records. Unknown age/minors disable automated calorie restriction and appearance scoring. Photo analysis is optional and estimates are labeled. Game levels do not measure health. Recommendations are product heuristics, not clinical validation.

## Next integration milestones

1. Android shell, SQLite repositories and live logging.
2. Database migrations, authentication, owner isolation and sync conflict tests.
3. Nutrition/device adapters and deterministic analytics.
4. Contextual AI with confirmed actions and budget controls.
5. Licensed rigged 3D avatar and complete device acceptance tests.
