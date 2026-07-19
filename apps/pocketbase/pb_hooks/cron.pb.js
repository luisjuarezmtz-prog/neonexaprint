/// <reference path="../pb_data/types.d.ts" />

// Scheduled jobs — there were none before, so nothing could proactively
// notify a customer of anything ("tu membresía vence en 3 días") ahead of
// time; every existing notification only reacted to a state change that
// already happened.
//
// Dispatch logic is inlined (not calling a shared function) on purpose,
// matching notifications.pb.js — PocketBase's JSVM does not reliably
// resolve cross-references from inside a hook/cron callback to something
// declared elsewhere in the same file.

cronAdd("membership-renewal-reminders", "0 9 * * *", () => {
  const event = "membresia_renovacion";
  const now = new Date();
  const soon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  let due = [];
  try {
    due = $app.findRecordsByFilter(
      "memberships",
      "status = 'activa' && period_end >= {:now} && period_end <= {:soon}",
      "",
      0,
      0,
      { now: now.toISOString(), soon: soon.toISOString() }
    );
  } catch (err) {
    $app.logger().error("renewal reminder query failed", "err", String(err));
    return;
  }

  const setting = (() => {
    try { return $app.findFirstRecordByFilter("notification_settings", "event = {:e}", { e: event }); }
    catch (_) { return null; }
  })();
  if (setting && !setting.get("notify_client")) return;

  const monthsEs = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

  for (const m of due) {
    const periodStart = m.get("period_start") ? new Date(m.get("period_start")) : null;
    const lastReminder = m.get("reminder_sent_at") ? new Date(m.get("reminder_sent_at")) : null;
    // already reminded for this same billing period — skip until it renews
    if (lastReminder && periodStart && lastReminder >= periodStart) continue;

    const ownerId = m.get("owner");
    const user = (() => {
      try { return $app.findRecordById("users", ownerId); }
      catch (_) { return null; }
    })();
    if (!user) continue;

    const periodEnd = new Date(m.get("period_end"));
    const dateLabel = `${periodEnd.getDate()} de ${monthsEs[periodEnd.getMonth()]} de ${periodEnd.getFullYear()}`;
    const fullVars = { name: user.get("name") || "cliente", date: dateLabel };
    const link = "/membresias";

    const tpl = (() => {
      try { return $app.findFirstRecordByFilter("notification_templates", "event = {:e} && channel = 'email'", { e: event }); }
      catch (_) { return null; }
    })();

    const format = (str) => String(str || "").replace(/\{(\w+)\}/g, (mm, k) => (fullVars[k] != null ? String(fullVars[k]) : ""));
    const title = tpl ? format(tpl.get("subject")) : (setting ? setting.get("label") : event);
    const message = tpl ? format(tpl.get("body")) : "";

    try {
      const col = $app.findCollectionByNameOrId("notifications");
      const rec = new Record(col);
      rec.set("owner", ownerId);
      rec.set("title", title);
      rec.set("message", message);
      rec.set("type", event);
      rec.set("channel", "inapp");
      rec.set("read", false);
      rec.set("link", link);
      $app.save(rec);
    } catch (err) { $app.logger().error("renewal reminder notif record failed", "err", String(err)); }

    const wantEmail = !setting || setting.get("email");
    if (wantEmail && tpl && tpl.get("enabled") && user.get("email")) {
      try {
        const msg = new MailerMessage({
          from: { name: "Neonexa Print" },
          to: [{ address: user.get("email") }],
          subject: title,
          html: `<div style="font-family:Arial,sans-serif;color:#111"><h2 style="color:#00AEEF">${title}</h2><p>${message}</p><p style="color:#888;font-size:12px">Neonexa Print · Impresión DTF y personalizados</p></div>`,
        });
        $app.newMailClient().send(msg);
      } catch (err) { $app.logger().error("renewal reminder email failed", "err", String(err)); }
    }

    try {
      m.set("reminder_sent_at", now.toISOString());
      $app.save(m);
    } catch (err) { $app.logger().error("renewal reminder mark-sent failed", "err", String(err)); }
  }
});
