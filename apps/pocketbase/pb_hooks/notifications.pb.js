/// <reference path="../pb_data/types.d.ts" />

// Central notification dispatcher: reads notification_settings + notification_templates,
// creates an in-app notification record and sends a branded email when enabled.

function fmt(str, vars) {
  return String(str || "").replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : ""));
}

function settingFor(event) {
  try { return $app.findFirstRecordByFilter("notification_settings", "event = {:e}", { e: event }); }
  catch (_) { return null; }
}

function templateFor(event) {
  try { return $app.findFirstRecordByFilter("notification_templates", "event = {:e} && channel = 'email'", { e: event }); }
  catch (_) { return null; }
}

function ownerRecord(ownerId) {
  try { return $app.findRecordById("users", ownerId); }
  catch (_) { return null; }
}

// eslint-disable-next-line no-unused-vars
function dispatch(event, ownerId, vars, link) {
  const setting = settingFor(event);
  if (setting && !setting.get("notify_client")) return;

  const user = ownerRecord(ownerId);
  if (!user) return;
  vars = Object.assign({ name: user.get("name") || "cliente" }, vars || {});

  const tpl = templateFor(event);
  const title = tpl ? fmt(tpl.get("subject"), vars) : (setting ? setting.get("label") : event);
  const message = tpl ? fmt(tpl.get("body"), vars) : "";

  // in-app notification
  try {
    const col = $app.findCollectionByNameOrId("notifications");
    const rec = new Record(col);
    rec.set("owner", ownerId);
    rec.set("title", title);
    rec.set("message", message);
    rec.set("type", event);
    rec.set("channel", "inapp");
    rec.set("read", false);
    if (link) rec.set("link", link);
    $app.save(rec);
  } catch (err) { $app.logger().error("notif record failed", "err", String(err)); }

  // email
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

// ---- orders: confirmation on create ----
onRecordAfterCreateSuccess((e) => {
  const o = e.record;
  dispatch("pedido_confirmado", o.get("owner"), { folio: o.get("folio") }, "/dashboard");
  e.next();
}, "orders");

// ---- orders: status + payment changes on update ----
onRecordAfterUpdateSuccess((e) => {
  const o = e.record;
  let prev = null;
  try { prev = o.original(); } catch (_) { /* ignore */ }
  const folio = o.get("folio");
  const owner = o.get("owner");

  const newStatus = o.get("status");
  const oldStatus = prev ? prev.get("status") : null;
  if (newStatus && newStatus !== oldStatus) {
    // status keys map directly to notification events
    dispatch(newStatus, owner, { folio }, "/dashboard");
  }

  const newPay = o.get("payment_status");
  const oldPay = prev ? prev.get("payment_status") : null;
  if (newPay === "pagado" && newPay !== oldPay) {
    dispatch("pago_confirmado", owner, { folio }, "/dashboard");
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
  if (st !== oldSt) {
    if (st === "pago_fallido") dispatch("pago_recurrente_fallido", m.get("owner"), {}, "/membresias");
    if (st === "activa" && oldSt === "pago_fallido") dispatch("pago_recurrente_exitoso", m.get("owner"), {}, "/membresias");
  }
  e.next();
}, "memberships");
