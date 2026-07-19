/// <reference path="../pb_data/types.d.ts" />

// Discovered live: unlike the `users` collection, PocketBase forces
// _superusers.mfa.enabled = true the moment _superusers.otp.enabled = true —
// the two can't be decoupled for that collection specifically (presumably
// because password + OTP would otherwise be the only two factors available
// for the most privileged collection, so it refuses to leave MFA off).
// 1795000008 enabled otp for _superusers, which silently forced mfa on too —
// while SMTP is broken that would have made superuser login return an OTP
// challenge with no way to receive the code. This keeps otp (and therefore
// mfa) off for _superusers until email delivery is confirmed working; the
// `users` (admin role) collection is unaffected since it doesn't have this
// forced coupling.

migrate(
  (app) => {
    const superusers = app.findCollectionByNameOrId("_superusers");
    superusers.otp.enabled = false;
    superusers.mfa.enabled = false;
    app.save(superusers);
  },
  (app) => {
    // no-op: re-enabling is a deliberate manual step once SMTP works, not an
    // automatic rollback of this migration.
  },
);
