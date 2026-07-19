/// <reference path="../pb_data/types.d.ts" />

// Mercado Pago integration.
//
// The client never marks anything as paid. It only ever receives a redirect
// URL to Mercado Pago's hosted checkout. The webhook below re-fetches the
// payment from Mercado Pago's own API using our secret token (never trusts
// the notification payload directly) and is the ONLY place payment_status
// is ever set to "pagado".
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
        external_reference: order.id,
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

// ---- Mercado Pago webhook ----
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
    const orderId = mpPayment.external_reference;
    if (!orderId) return e.json(200, { ok: true });

    let order, payment;
    try {
        order = $app.findRecordById("orders", orderId);
        payment = $app.findFirstRecordByFilter("payments", "order = {:o}", { o: orderId });
    } catch (_) { return e.json(200, { ok: true }); }
    if (!order || !payment) return e.json(200, { ok: true });

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
