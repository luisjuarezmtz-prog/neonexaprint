/// <reference path="../pb_data/types.d.ts" />

// PocketBase supports native MFA, but it wasn't turned on for admin or
// superuser accounts, and login alerts were off. This wires the OTP
// infrastructure (email template, code length/duration) for both `users`
// (admin role) and `_superusers`, but leaves mfa.enabled = false for now —
// the OTP code is delivered by email, and SMTP is currently broken
// (Hostinger auth failing, tracked separately). Flip mfa.enabled to true
// once real email delivery is confirmed working; no redeploy needed, it's
// a normal collection update.

migrate(
  (app) => {
    const otpTemplate = {
      subject: "Tu código de acceso — Neonexa Print",
      body: `<p>Hola,</p><p>Tu código de verificación para iniciar sesión en el panel de Neonexa Print es:</p><p style="font-size:28px;font-weight:bold;letter-spacing:4px;">{OTP}</p><p>Este código expira en unos minutos. Si tú no intentaste iniciar sesión, ignora este mensaje.</p>`,
    };

    const users = app.findCollectionByNameOrId("users");
    users.otp = { enabled: true, duration: 300, length: 6, emailTemplate: otpTemplate };
    users.mfa = { enabled: false, duration: 1800, rule: "role = 'admin'" };
    app.save(users);

    const superusers = app.findCollectionByNameOrId("_superusers");
    superusers.otp = { enabled: true, duration: 300, length: 6, emailTemplate: otpTemplate };
    superusers.mfa = { enabled: false, duration: 1800, rule: "" };
    app.save(superusers);
  },
  (app) => {
    try {
      const users = app.findCollectionByNameOrId("users");
      users.otp = { enabled: false, duration: 300, length: 8, emailTemplate: { subject: "", body: "" } };
      users.mfa = { enabled: false, duration: 1800, rule: "" };
      app.save(users);
    } catch (_) {}
    try {
      const superusers = app.findCollectionByNameOrId("_superusers");
      superusers.otp = { enabled: false, duration: 300, length: 8, emailTemplate: { subject: "", body: "" } };
      superusers.mfa = { enabled: false, duration: 1800, rule: "" };
      app.save(superusers);
    } catch (_) {}
  },
);
