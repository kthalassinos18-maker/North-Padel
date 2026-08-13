# Stage 2 security rollout

This branch must be tested on the separate Git-connected Netlify project before production.

## Required Netlify environment variables

- `FIREBASE_DATABASE_URL`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `ALLOWED_ORIGINS`
- `NOTIFICATIONS_ENABLED` (`false` while testing)
- `CALLMEBOT_RECIPIENTS_JSON` (only after the exposed keys have been rotated)
- `APPS_SCRIPT_URL`

Never commit secret values to GitHub.

## Safe rollout order

1. Keep the production site and Firebase rules unchanged.
2. Configure secrets only on the separate staging Netlify project.
3. Deploy this branch to staging with notifications disabled.
4. Verify availability, validation, admin authentication, and a controlled test booking.
5. Export a fresh Firebase JSON backup immediately before production cutover.
6. Deploy the tested site and functions to the production Netlify project.
7. Verify that production availability and a controlled booking work.
8. Replace `REPLACE_WITH_ADMIN_UID` in the rules template and publish the rules.
9. Verify that public REST reads fail, while the authenticated admin still works.

## Rollback

- Netlify: restore the previous production deploy.
- GitHub: use `backup/pre-stage-2-2026-08-13` or `backup/live-production-2026-08-13`.
- Firebase data: import the private JSON export only if data restoration is actually required.
- Firebase rules: restore the original rules saved below if the new frontend cannot reach the functions.

Original rules (rollback only):

```json
{
  "rules": {
    "bookings": {
      ".read": true,
      "$date": {
        "$slot": {
          ".write": "!data.exists() || auth != null"
        }
      }
    }
  }
}
```
