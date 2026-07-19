/// <reference path="../pb_data/types.d.ts" />

// Migrations only run once — configure_smtp.js read SMTP_PASSWORD the first
// time it ran, and rotating the mailbox password afterwards silently did
// nothing because the stale value stayed saved in settings.smtp.password.
// This re-syncs the SMTP credentials from the env vars on every boot, so a
// future password rotation just needs an app restart, not a new migration.

onBootstrap((e) => {
    e.next();
    try {
        const settings = e.app.settings();
        settings.smtp.enabled = true;
        settings.smtp.host = $os.getenv("SMTP_HOST") || "smtp.hostinger.com";
        settings.smtp.port = Number($os.getenv("SMTP_PORT")) || 465;
        settings.smtp.username = $os.getenv("SMTP_USERNAME");
        settings.smtp.password = $os.getenv("SMTP_PASSWORD");
        settings.smtp.tls = true;
        e.app.save(settings);
    } catch (err) {
        e.app.logger().error("smtp-sync on boot failed", "err", String(err));
    }
});
