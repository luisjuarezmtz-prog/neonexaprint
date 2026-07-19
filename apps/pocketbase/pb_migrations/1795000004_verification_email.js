/// <reference path="../pb_data/types.d.ts" />

// requestVerification() was already being called on signup, but the emailed
// link was a double dead-end: appURL still pointed at the abandoned Horizons
// preview host, and there was no frontend route to consume the token even on
// the real domain. This points the link at the live app and gives it
// somewhere to land (see src/pages/VerifyEmail.jsx).

migrate(
  (app) => {
    const settings = app.settings();
    settings.meta.appName = "Neonexa Print";
    settings.meta.appURL = "https://app.neonexaprint.com.mx";
    app.save(settings);

    const users = app.findCollectionByNameOrId("users");
    users.verificationTemplate = {
      subject: "Verifica tu correo — Neonexa Print",
      body: `<p>Hola,</p><p>Gracias por crear tu cuenta en <strong>Neonexa Print</strong>.</p><p>Confirma tu correo para activar tu cuenta:</p><p><a class="btn" href="https://app.neonexaprint.com.mx/verificar?token={TOKEN}" target="_blank" rel="noopener">Verificar mi correo</a></p><p>Si tú no creaste esta cuenta, puedes ignorar este mensaje.</p>`,
    };
    app.save(users);
  },
  (app) => {
    const settings = app.settings();
    settings.meta.appName = "75d0a413-b3be-434b-9818-8b5870cb76d4.app-preview.com";
    settings.meta.appURL = "https://75d0a413-b3be-434b-9818-8b5870cb76d4.app-preview.com/hcgi/platform";
    app.save(settings);

    const users = app.findCollectionByNameOrId("users");
    users.verificationTemplate = { subject: "", body: "" };
    app.save(users);
  },
);
