/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
    let settings = app.settings()

    // Real SMTP instead of Horizons' internal Builder Mailer API (builder-mailer.pb.js
    // falls back to it only when this is disabled, and that API isn't reachable
    // outside Horizons' own infrastructure).
    settings.smtp.enabled = true
    settings.smtp.host = $os.getenv("SMTP_HOST") || "smtp.hostinger.com"
    settings.smtp.port = Number($os.getenv("SMTP_PORT")) || 465
    settings.smtp.username = $os.getenv("SMTP_USERNAME")
    settings.smtp.password = $os.getenv("SMTP_PASSWORD")
    settings.smtp.tls = true

    settings.meta.senderName = $os.getenv("MAIL_SENDER_NAME") || "Neonexa Print"
    settings.meta.senderAddress = $os.getenv("SMTP_USERNAME")

    app.save(settings)
}, (app) => {
    let settings = app.settings()
    settings.smtp.enabled = false
    app.save(settings)
})
