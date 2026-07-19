/// <reference path="../pb_data/types.d.ts" />

// Admin action audit trail. Uses the *Request* hook variants (not the
// simpler AfterSuccess ones) specifically because those carry e.auth / who
// made the HTTP request — the AfterSuccess hooks don't reliably expose that.
//
// Every helper is inlined inside each callback on purpose — PocketBase's
// JSVM does not reliably resolve calls from a hook callback to a
// function/const declared elsewhere at the top of this same file.

const AUDITED_COLLECTIONS = [
    "products", "product_variants", "membership_plans",
    "notification_settings", "notification_templates", "tool_limits",
    "image_packs", "pack_images", "settings", "orders", "order_items", "quotes", "coupons",
];

onRecordCreateRequest((e) => {
    e.next();
    try {
        const auth = e.auth;
        const col = $app.findCollectionByNameOrId("audit_logs");
        const log = new Record(col);
        if (auth) log.set("actor", auth.id);
        log.set("actor_label", auth ? (auth.get("email") || auth.id) : "sistema");
        log.set("action", "create");
        log.set("collection_name", e.record.collection().name);
        log.set("record_id", e.record.id);
        log.set("summary", `Creó ${e.record.collection().name} ${e.record.id}`);
        log.set("changes", JSON.parse(JSON.stringify({ after: e.record.publicExport() })));
        $app.save(log);
    } catch (err) { $app.logger().error("audit log (create) failed", "err", String(err)); }
}, ...AUDITED_COLLECTIONS);

onRecordUpdateRequest((e) => {
    let before = null;
    try { before = e.record.original().publicExport(); } catch (_) { /* ignore */ }
    e.next();
    try {
        const auth = e.auth;
        const col = $app.findCollectionByNameOrId("audit_logs");
        const log = new Record(col);
        if (auth) log.set("actor", auth.id);
        log.set("actor_label", auth ? (auth.get("email") || auth.id) : "sistema");
        log.set("action", "update");
        log.set("collection_name", e.record.collection().name);
        log.set("record_id", e.record.id);
        log.set("summary", `Actualizó ${e.record.collection().name} ${e.record.id}`);
        log.set("changes", JSON.parse(JSON.stringify({ before, after: e.record.publicExport() })));
        $app.save(log);
    } catch (err) { $app.logger().error("audit log (update) failed", "err", String(err)); }
}, ...AUDITED_COLLECTIONS);

onRecordDeleteRequest((e) => {
    const before = e.record.publicExport();
    const collectionName = e.record.collection().name;
    const recordId = e.record.id;
    e.next();
    try {
        const auth = e.auth;
        const col = $app.findCollectionByNameOrId("audit_logs");
        const log = new Record(col);
        if (auth) log.set("actor", auth.id);
        log.set("actor_label", auth ? (auth.get("email") || auth.id) : "sistema");
        log.set("action", "delete");
        log.set("collection_name", collectionName);
        log.set("record_id", recordId);
        log.set("summary", `Eliminó ${collectionName} ${recordId}`);
        log.set("changes", JSON.parse(JSON.stringify({ before })));
        $app.save(log);
    } catch (err) { $app.logger().error("audit log (delete) failed", "err", String(err)); }
}, ...AUDITED_COLLECTIONS);
