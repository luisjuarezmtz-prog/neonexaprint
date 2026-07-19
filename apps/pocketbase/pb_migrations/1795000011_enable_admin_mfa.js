/// <reference path="../pb_data/types.d.ts" />

// SMTP is now confirmed working (Hostinger required an app-specific password
// for external SMTP access, separate from the webmail password). MFA for
// admin accounts was built and deployed disabled on purpose until this was
// verified — flipping it on for real now. Verified live: a correct password
// for an admin account returns 401+mfaId instead of a token, requestOTP
// returns a valid otpId, and a wrong code is rejected with 400.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.mfa.enabled = true;
    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.mfa.enabled = false;
    app.save(users);
  },
);
