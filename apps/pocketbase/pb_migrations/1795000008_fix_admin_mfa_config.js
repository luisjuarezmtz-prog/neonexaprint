/// <reference path="../pb_data/types.d.ts" />

// Corrective follow-up to 1795000007_admin_mfa.js: assigning a whole new
// object to collection.otp / collection.mfa (like verificationTemplate
// accepts) is silently ignored by PocketBase's JSVM bindings for these two
// fields — the previous migration ran but left otp/mfa at their defaults.
// Mutating the existing nested fields in place (same pattern already used
// for extending users.role's select values) is what actually persists.

migrate(
  (app) => {
    const otpTemplate = {
      subject: "Tu código de acceso — Neonexa Print",
      body: `<p>Hola,</p><p>Tu código de verificación para iniciar sesión en el panel de Neonexa Print es:</p><p style="font-size:28px;font-weight:bold;letter-spacing:4px;">{OTP}</p><p>Este código expira en unos minutos. Si tú no intentaste iniciar sesión, ignora este mensaje.</p>`,
    };

    const users = app.findCollectionByNameOrId("users");
    users.otp.enabled = true;
    users.otp.duration = 300;
    users.otp.length = 6;
    users.otp.emailTemplate.subject = otpTemplate.subject;
    users.otp.emailTemplate.body = otpTemplate.body;
    users.mfa.enabled = false;
    users.mfa.duration = 1800;
    users.mfa.rule = "role = 'admin'";
    app.save(users);

    const superusers = app.findCollectionByNameOrId("_superusers");
    superusers.otp.enabled = true;
    superusers.otp.duration = 300;
    superusers.otp.length = 6;
    superusers.otp.emailTemplate.subject = otpTemplate.subject;
    superusers.otp.emailTemplate.body = otpTemplate.body;
    superusers.mfa.enabled = false;
    superusers.mfa.duration = 1800;
    superusers.mfa.rule = "";
    app.save(superusers);
  },
  (app) => {
    const defaultBody = "<p>Hello,</p>\n<p>Your one-time password is: <strong>{OTP}</strong></p>\n<p><i>If you didn't ask for the one-time password, you can ignore this email.</i></p>\n<p>\n  Thanks,<br/>\n  {APP_NAME} team\n</p>";
    try {
      const users = app.findCollectionByNameOrId("users");
      users.otp.enabled = false;
      users.otp.duration = 180;
      users.otp.length = 8;
      users.otp.emailTemplate.subject = "OTP for {APP_NAME}";
      users.otp.emailTemplate.body = defaultBody;
      users.mfa.enabled = false;
      users.mfa.duration = 600;
      users.mfa.rule = "";
      app.save(users);
    } catch (_) {}
    try {
      const superusers = app.findCollectionByNameOrId("_superusers");
      superusers.otp.enabled = false;
      superusers.otp.duration = 180;
      superusers.otp.length = 8;
      superusers.otp.emailTemplate.subject = "OTP for {APP_NAME}";
      superusers.otp.emailTemplate.body = defaultBody;
      superusers.mfa.enabled = false;
      superusers.mfa.duration = 600;
      superusers.mfa.rule = "";
      app.save(superusers);
    } catch (_) {}
  },
);
