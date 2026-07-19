/// <reference path="../pb_data/types.d.ts" />

// Migrations run once and are recorded as applied — 1790000000_configure_smtp.js
// only ever read SMTP_PASSWORD the first time it ran. Rotating the mailbox
// password and updating the env var afterwards silently did nothing, because
// the stale password stayed saved in settings.smtp.password. This re-reads
// the current env vars and re-saves them, which is safe to run again if the
// credential ever rotates in the future too.

migrate((app) => {
    const settings = app.settings();
    settings.smtp.host = $os.getenv("SMTP_HOST") || "smtp.hostinger.com";
    settings.smtp.port = Number($os.getenv("SMTP_PORT")) || 465;
    settings.smtp.username = $os.getenv("SMTP_USERNAME");
    settings.smtp.password = $os.getenv("SMTP_PASSWORD");
    app.save(settings);
}, (app) => {
    // no-op: nothing safe to revert to (the previous value was already stale).
});
