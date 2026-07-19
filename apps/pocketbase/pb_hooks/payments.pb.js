/// <reference path="../pb_data/types.d.ts" />

// Mercado Pago integration — covers both DTF/Personalizados orders and
// Biblioteca de Imágenes pack purchases.
//
// The client never marks anything as paid. It only ever receives a redirect
// URL to Mercado Pago's hosted checkout. The webhook below re-fetches the
// payment from Mercado Pago's own API using our secret token (never trusts
// the notification payload directly) and is the ONLY place payment_status
// is ever set to "pagado". external_reference is prefixed ("order:" /
// "pack:") so the webhook knows which collection to update.
//
// Note: every helper is inlined inside each routerAdd callback on purpose —
// PocketBase's JSVM does not reliably resolve calls from a route handler to
// a function/const declared elsewhere at the top of this same file (it
// intermittently throws "X is not defined" for such cross-references).

// ---- create a Checkout Pro preference for an order's pending payment ----
routerAdd("POST", "/api/mp/preference", (e) => {
    const mpAccessToken = $os.getenv("MP_ACCESS_TOKEN");
    if (!mpAccessToken) throw new InternalServerError("MP_ACCESS_TOKEN no configurado.");
    const site = $os.getenv("SITE_URL") || "https://app.neonexaprint.com.mx";
    const api = $os.getenv("API_URL") || "https://api.neonexaprint.com.mx";

    const auth = e.auth;
    if (!auth) throw new UnauthorizedError("Debes iniciar sesión.");

    const data = new DynamicModel({ orderId: "" });
    e.bindBody(data);
    if (!data.orderId) throw new BadRequestError("Falta orderId.");

    let order;
    try { order = $app.findRecordById("orders", data.orderId); }
    catch (_) { throw new NotFoundError("Pedido no encontrado."); }
    if (order.get("owner") !== auth.id) throw new ForbiddenError("Este pedido no te pertenece.");

    const payment = $app.findFirstRecordByFilter("payments", "order = {:o}", { o: order.id });
    if (!payment) throw new NotFoundError("No hay un pago pendiente para este pedido.");
    if (payment.get("status") === "pagado") throw new BadRequestError("Este pedido ya está pagado.");

    const totals = order.get("totals") || {};
    const contact = order.get("contact") || {};

    const pref = {
        items: [{
            title: `Pedido Neonexa ${order.get("folio")}`,
            quantity: 1,
            currency_id: totals.currency || "MXN",
            unit_price: Number(payment.get("amount")),
        }],
        payer: { email: contact.email || auth.get("email") },
        external_reference: `order:${order.id}`,
        back_urls: {
            success: `${site}/checkout/retorno?order=${order.id}`,
            pending: `${site}/checkout/retorno?order=${order.id}`,
            failure: `${site}/checkout/retorno?order=${order.id}`,
        },
        auto_return: "approved",
        notification_url: `${api}/api/mp/webhook`,
    };

    const res = $http.send({
        url: "https://api.mercadopago.com/checkout/preferences",
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${mpAccessToken}` },
        body: JSON.stringify(pref),
        timeout: 30,
    });

    if (res.statusCode >= 300) {
        $app.logger().error("mp preference failed", "status", res.statusCode, "body", res.json);
        throw new BadRequestError("No se pudo iniciar el pago con Mercado Pago.");
    }

    const prefMeta = Object.assign({}, payment.get("meta") || {}, { mp_preference_id: res.json.id });
    payment.set("meta", JSON.parse(JSON.stringify(prefMeta)));
    $app.save(payment);

    return e.json(200, { init_point: res.json.init_point || res.json.sandbox_init_point });
}, $apis.requireAuth());

// ---- create a Checkout Pro preference for a pack purchase ----
routerAdd("POST", "/api/mp/pack-preference", (e) => {
    const mpAccessToken = $os.getenv("MP_ACCESS_TOKEN");
    if (!mpAccessToken) throw new InternalServerError("MP_ACCESS_TOKEN no configurado.");
    const site = $os.getenv("SITE_URL") || "https://app.neonexaprint.com.mx";
    const api = $os.getenv("API_URL") || "https://api.neonexaprint.com.mx";

    const auth = e.auth;
    if (!auth) throw new UnauthorizedError("Debes iniciar sesión.");

    const data = new DynamicModel({ packId: "" });
    e.bindBody(data);
    if (!data.packId) throw new BadRequestError("Falta packId.");

    let pack;
    try { pack = $app.findRecordById("image_packs", data.packId); }
    catch (_) { throw new NotFoundError("Pack no encontrado."); }
    if (pack.get("status") !== "publicado") throw new BadRequestError("Este pack no está disponible.");

    // "Un mismo pack no debe cobrarse dos veces al mismo usuario salvo nueva
    // versión claramente diferenciada" — block only if already paid for the
    // exact same version.
    const already = $app.findFirstRecordByFilter(
        "pack_purchases",
        "pack = {:p} && owner = {:o} && payment_status = 'pagado' && version_purchased = {:v}",
        { p: pack.id, o: auth.id, v: pack.get("version") || "" }
    );
    if (already) throw new BadRequestError("Ya compraste esta versión de este pack.");

    const now = new Date();
    const promoStart = pack.get("promo_start") ? new Date(pack.get("promo_start")) : null;
    const promoEnd = pack.get("promo_end") ? new Date(pack.get("promo_end")) : null;
    const promoActive = pack.get("promo_price") > 0 && (!promoStart || now >= promoStart) && (!promoEnd || now <= promoEnd);
    const price = promoActive ? pack.get("promo_price") : pack.get("price");

    const purchases = $app.findCollectionByNameOrId("pack_purchases");
    const purchase = new Record(purchases);
    purchase.set("pack", pack.id);
    purchase.set("owner", auth.id);
    purchase.set("amount_paid", price);
    purchase.set("currency", "MXN");
    purchase.set("payment_status", "pendiente");
    purchase.set("license_snapshot", pack.get("license_type"));
    purchase.set("version_purchased", pack.get("version"));
    purchase.set("downloads_count", 0);
    $app.save(purchase);

    const pref = {
        items: [{
            title: `Pack Neonexa: ${pack.get("name")}`,
            quantity: 1,
            currency_id: "MXN",
            unit_price: Number(price),
        }],
        payer: { email: auth.get("email") },
        external_reference: `pack:${purchase.id}`,
        back_urls: {
            success: `${site}/packs/retorno?purchase=${purchase.id}`,
            pending: `${site}/packs/retorno?purchase=${purchase.id}`,
            failure: `${site}/packs/retorno?purchase=${purchase.id}`,
        },
        auto_return: "approved",
        notification_url: `${api}/api/mp/webhook`,
    };

    const res = $http.send({
        url: "https://api.mercadopago.com/checkout/preferences",
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${mpAccessToken}` },
        body: JSON.stringify(pref),
        timeout: 30,
    });

    if (res.statusCode >= 300) {
        $app.logger().error("mp pack-preference failed", "status", res.statusCode, "body", res.json);
        throw new BadRequestError("No se pudo iniciar el pago con Mercado Pago.");
    }

    const prefMeta = { mp_preference_id: res.json.id };
    purchase.set("meta", JSON.parse(JSON.stringify(prefMeta)));
    $app.save(purchase);

    return e.json(200, { init_point: res.json.init_point || res.json.sandbox_init_point, purchaseId: purchase.id });
}, $apis.requireAuth());

// ---- Mercado Pago webhook (orders + pack purchases) ----
routerAdd("POST", "/api/mp/webhook", (e) => {
    const mpAccessToken = $os.getenv("MP_ACCESS_TOKEN");
    if (!mpAccessToken) throw new InternalServerError("MP_ACCESS_TOKEN no configurado.");

    const info = e.requestInfo();
    const body = info.body || {};
    const query = info.query || {};

    const topic = query["type"] || query["topic"] || body["type"];
    const paymentId = query["data.id"] || query["id"] || (body["data"] && body["data"]["id"]);

    if (topic !== "payment" || !paymentId) {
        return e.json(200, { ok: true });
    }

    const res = $http.send({
        url: `https://api.mercadopago.com/v1/payments/${paymentId}`,
        method: "GET",
        headers: { "Authorization": `Bearer ${mpAccessToken}` },
        timeout: 30,
    });

    if (res.statusCode >= 300) {
        $app.logger().error("mp webhook: could not fetch payment", "id", paymentId, "status", res.statusCode);
        return e.json(200, { ok: false });
    }

    const mpPayment = res.json;
    const ref = mpPayment.external_reference || "";
    if (!ref) return e.json(200, { ok: true });

    const statusMap = {
        approved: "pagado",
        rejected: "fallido",
        cancelled: "fallido",
        refunded: "reembolsado",
        charged_back: "reembolsado",
        pending: "pendiente",
        in_process: "pendiente",
        in_mediation: "pendiente",
    };
    const mapped = statusMap[mpPayment.status] || "pendiente";

    if (ref.indexOf("pack:") === 0) {
        const purchaseId = ref.slice("pack:".length);
        let purchase;
        try { purchase = $app.findRecordById("pack_purchases", purchaseId); }
        catch (_) { return e.json(200, { ok: true }); }
        if (!purchase) return e.json(200, { ok: true });

        if (purchase.get("payment_status") === mapped) return e.json(200, { ok: true });

        purchase.set("payment_status", mapped);
        const meta = Object.assign({}, purchase.get("meta") || {}, {
            mp_payment_id: mpPayment.id,
            mp_status: mpPayment.status,
            mp_status_detail: mpPayment.status_detail,
        });
        purchase.set("meta", JSON.parse(JSON.stringify(meta)));
        $app.save(purchase);
        return e.json(200, { ok: true });
    }

    // default: order payment (bare id kept for backwards compatibility with
    // preferences created before the "order:" prefix existed)
    const orderId = ref.indexOf("order:") === 0 ? ref.slice("order:".length) : ref;

    let order, payment;
    try {
        order = $app.findRecordById("orders", orderId);
        payment = $app.findFirstRecordByFilter("payments", "order = {:o}", { o: orderId });
    } catch (_) { return e.json(200, { ok: true }); }
    if (!order || !payment) return e.json(200, { ok: true });

    // idempotency: Mercado Pago retries webhooks until it gets a 200 early on,
    // and again later for status transitions — skip re-processing a no-op.
    if (payment.get("status") === mapped && payment.get("reference") === String(mpPayment.id)) {
        return e.json(200, { ok: true });
    }

    payment.set("status", mapped);
    payment.set("reference", String(mpPayment.id));
    const paymentMeta = Object.assign({}, payment.get("meta") || {}, {
        mp_payment_id: mpPayment.id,
        mp_status: mpPayment.status,
        mp_status_detail: mpPayment.status_detail,
    });
    payment.set("meta", JSON.parse(JSON.stringify(paymentMeta)));
    $app.save(payment);

    order.set("payment_status", mapped);
    const existingEvents = order.get("events");
    const events = Array.isArray(existingEvents) ? existingEvents.slice() : [];
    events.push({
        status: order.get("status"),
        payment_status: mapped,
        at: new Date().toISOString(),
        note: `Webhook Mercado Pago: ${mpPayment.status}`,
    });
    order.set("events", JSON.parse(JSON.stringify(events)));
    $app.save(order); // notifications.pb.js reacts to payment_status changes automatically

    return e.json(200, { ok: true });
});
