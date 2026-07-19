/// <reference path="../pb_data/types.d.ts" />

// Tracks the last time a "renewal coming up" reminder was sent for a
// membership, so the daily cron (cron.pb.js) doesn't re-notify every day
// during the reminder window — only once per billing period.

migrate(
  (app) => {
    const memberships = app.findCollectionByNameOrId("memberships");
    if (!memberships.fields.getByName("reminder_sent_at")) {
      memberships.fields.add(new DateField({ name: "reminder_sent_at", required: false }));
    }
    app.save(memberships);
  },
  (app) => {
    const memberships = app.findCollectionByNameOrId("memberships");
    try { memberships.fields.removeByName("reminder_sent_at"); } catch (_) {}
    app.save(memberships);
  },
);
