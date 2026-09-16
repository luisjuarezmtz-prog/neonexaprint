/// <reference path="../pb_data/types.d.ts" />

// No habia forma de recuperar una cuenta: ni "olvide mi contrasena" en el
// login, ni plantilla de correo apuntando al sitio. Quien perdiera su
// contrasena quedaba bloqueado de forma permanente, con su membresia pagada
// adentro. Esto apunta el enlace a /restablecer, igual que ya se hizo con la
// verificacion (ver 1795000004_verification_email.js y src/pages/AuthPages.jsx).

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.resetPasswordTemplate = {
      subject: "Restablece tu contraseña — Neonexa Print",
      body: `<p>Hola,</p><p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en <strong>Neonexa Print</strong>.</p><p>Elige una contraseña nueva:</p><p><a class="btn" href="https://app.neonexaprint.com.mx/restablecer?token={TOKEN}" target="_blank" rel="noopener">Restablecer mi contraseña</a></p><p>El enlace vence pronto por seguridad. Si tú no pediste este cambio, ignora este mensaje: tu contraseña actual sigue funcionando.</p>`,
    };
    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.resetPasswordTemplate = { subject: "", body: "" };
    app.save(users);
  },
);
