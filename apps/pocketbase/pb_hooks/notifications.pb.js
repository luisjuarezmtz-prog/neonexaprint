/// <reference path="../pb_data/types.d.ts" />

// Central notification dispatcher: reads notification_settings + notification_templates,
// creates an in-app notification record and sends a branded email when enabled.
//
// Note: the dispatch logic is duplicated inline in each hook below on purpose —
// PocketBase's JSVM does not reliably resolve calls from a hook callback to a
// function declared elsewhere at the top of this same file (it intermittently,
// and sometimes deterministically, throws "X is not defined" for such
// cross-references, which previously broke every order creation).

// ---- orders: confirmation on create ----
onRecordAfterCreateSuccess((e) => {
  const o = e.record;
  const event = "pedido_confirmado";
  const ownerId = o.get("owner");
  const vars = { folio: o.get("folio") };
  const link = "/dashboard";

  const setting = (() => {
    try { return $app.findFirstRecordByFilter("notification_settings", "event = {:e}", { e: event }); }
    catch (_) { return null; }
  })();

  if (!setting || setting.get("notify_client")) {
    const user = (() => {
      try { return $app.findRecordById("users", ownerId); }
      catch (_) { return null; }
    })();

    if (user) {
      const fullVars = Object.assign({ name: user.get("name") || "cliente" }, vars);
      const tpl = (() => {
        try { return $app.findFirstRecordByFilter("notification_templates", "event = {:e} && channel = 'email'", { e: event }); }
        catch (_) { return null; }
      })();

      const format = (str) => String(str || "").replace(/\{(\w+)\}/g, (m, k) => (fullVars[k] != null ? String(fullVars[k]) : ""));
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
      } catch (err) { $app.logger().error("notif record failed", "err", String(err)); }

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
        } catch (err) { $app.logger().error("notif email failed", "err", String(err)); }
      }
    }
  }

  e.next();
}, "orders");

// ---- orders: status + payment changes on update ----
onRecordAfterUpdateSuccess((e) => {
  const o = e.record;
  let prev = null;
  try { prev = o.original(); } catch (_) { /* ignore */ }
  const folio = o.get("folio");
  const ownerId = o.get("owner");

  const events = [];
  const newStatus = o.get("status");
  const oldStatus = prev ? prev.get("status") : null;
  if (newStatus && newStatus !== oldStatus) events.push(newStatus);

  const newPay = o.get("payment_status");
  const oldPay = prev ? prev.get("payment_status") : null;
  if (newPay === "pagado" && newPay !== oldPay) events.push("pago_confirmado");

  for (const event of events) {
    const vars = { folio };
    const link = "/dashboard";

    const setting = (() => {
      try { return $app.findFirstRecordByFilter("notification_settings", "event = {:e}", { e: event }); }
      catch (_) { return null; }
    })();
    if (setting && !setting.get("notify_client")) continue;

    const user = (() => {
      try { return $app.findRecordById("users", ownerId); }
      catch (_) { return null; }
    })();
    if (!user) continue;

    const fullVars = Object.assign({ name: user.get("name") || "cliente" }, vars);
    const tpl = (() => {
      try { return $app.findFirstRecordByFilter("notification_templates", "event = {:e} && channel = 'email'", { e: event }); }
      catch (_) { return null; }
    })();

    const format = (str) => String(str || "").replace(/\{(\w+)\}/g, (m, k) => (fullVars[k] != null ? String(fullVars[k]) : ""));
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
    } catch (err) { $app.logger().error("notif record failed", "err", String(err)); }

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
      } catch (err) { $app.logger().error("notif email failed", "err", String(err)); }
    }
  }

  e.next();
}, "orders");

// ---- memberships: recurring payment result ----
onRecordAfterUpdateSuccess((e) => {
  const m = e.record;
  let prev = null;
  try { prev = m.original(); } catch (_) { /* ignore */ }
  const st = m.get("status");
  const oldSt = prev ? prev.get("status") : null;
  const ownerId = m.get("owner");

  let event = null;
  if (st !== oldSt) {
    if (st === "pago_fallido") event = "pago_recurrente_fallido";
    else if (st === "activa" && oldSt === "pago_fallido") event = "pago_recurrente_exitoso";
  }

  if (event) {
    const link = "/membresias";

    const setting = (() => {
      try { return $app.findFirstRecordByFilter("notification_settings", "event = {:e}", { e: event }); }
      catch (_) { return null; }
    })();

    if (!setting || setting.get("notify_client")) {
      const user = (() => {
        try { return $app.findRecordById("users", ownerId); }
        catch (_) { return null; }
      })();

      if (user) {
        const fullVars = { name: user.get("name") || "cliente" };
        const tpl = (() => {
          try { return $app.findFirstRecordByFilter("notification_templates", "event = {:e} && channel = 'email'", { e: event }); }
          catch (_) { return null; }
        })();

        const format = (str) => String(str || "").replace(/\{(\w+)\}/g, (m2, k) => (fullVars[k] != null ? String(fullVars[k]) : ""));
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
        } catch (err) { $app.logger().error("notif record failed", "err", String(err)); }

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
          } catch (err) { $app.logger().error("notif email failed", "err", String(err)); }
        }
      }
    }
  }

  e.next();
}, "memberships");
