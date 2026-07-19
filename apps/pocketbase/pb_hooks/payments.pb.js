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

    let payment;
    try { payment = $app.findFirstRecordByFilter("payments", "order = {:o}", { o: order.id }); }
    catch (_) { throw new NotFoundError("No hay un pago pendiente para este pedido."); }
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

// ---- validate a coupon code and report the discounted amount (read-only —
// usage is only counted once a payment is actually confirmed by the webhook) ----
routerAdd("POST", "/api/coupons/validate", (e) => {
    const auth = e.auth;
    if (!auth) throw new UnauthorizedError("Debes iniciar sesión.");

    const data = new DynamicModel({ code: "", context: "", amount: 0 });
    e.bindBody(data);
    const code = (data.code || "").trim().toUpperCase();
    if (!code) throw new BadRequestError("Falta el código del cupón.");

    let coupon = null;
    try { coupon = $app.findFirstRecordByFilter("coupons", "code = {:c}", { c: code }); }
    catch (_) { throw new NotFoundError("Cupón no válido."); }

    if (!coupon.get("active")) throw new BadRequestError("Cupón inactivo.");
    const now = new Date();
    const validFrom = coupon.get("valid_from") ? new Date(coupon.get("valid_from")) : null;
    const validUntil = coupon.get("valid_until") ? new Date(coupon.get("valid_until")) : null;
    if (validFrom && now < validFrom) throw new BadRequestError("Este cupón aún no está vigente.");
    if (validUntil && now > validUntil) throw new BadRequestError("Este cupón ya expiró.");
    const maxUses = Number(coupon.get("max_uses")) || 0;
    const usedCount = Number(coupon.get("used_count")) || 0;
    if (maxUses > 0 && usedCount >= maxUses) throw new BadRequestError("Este cupón ya alcanzó su límite de usos.");
    const appliesTo = coupon.get("applies_to");
    const context = data.context || "order";
    if (appliesTo !== "all" && appliesTo !== context) throw new BadRequestError("Este cupón no aplica a esta compra.");
    const baseAmount = Number(data.amount) || 0;
    const minAmount = Number(coupon.get("min_amount")) || 0;
    if (minAmount > 0 && baseAmount < minAmount) throw new BadRequestError(`Este cupón requiere un monto mínimo de ${minAmount}.`);

    const discount = coupon.get("discount_type") === "percent"
        ? baseAmount * (Number(coupon.get("discount_value")) / 100)
        : Number(coupon.get("discount_value"));
    const finalAmount = Math.max(0, +(baseAmount - discount).toFixed(2));

    return e.json(200, {
        valid: true, code,
        discount_type: coupon.get("discount_type"),
        discount_value: coupon.get("discount_value"),
        amount: baseAmount, final_amount: finalAmount,
    });
}, $apis.requireAuth());

// ---- create a Checkout Pro preference for a membership subscription/plan change ----
routerAdd("POST", "/api/mp/membership-preference", (e) => {
    const mpAccessToken = $os.getenv("MP_ACCESS_TOKEN");
    if (!mpAccessToken) throw new InternalServerError("MP_ACCESS_TOKEN no configurado.");
    const site = $os.getenv("SITE_URL") || "https://app.neonexaprint.com.mx";
    const api = $os.getenv("API_URL") || "https://api.neonexaprint.com.mx";

    const auth = e.auth;
    if (!auth) throw new UnauthorizedError("Debes iniciar sesión.");

    const data = new DynamicModel({ planId: "", couponCode: "" });
    e.bindBody(data);
    if (!data.planId) throw new BadRequestError("Falta planId.");

    let plan;
    try { plan = $app.findRecordById("membership_plans", data.planId); }
    catch (_) { throw new NotFoundError("Plan no encontrado."); }
    if (!plan.get("active")) throw new BadRequestError("Este plan no está disponible.");

    const baseAmount = Number(plan.get("price")) || 0;
    let finalAmount = baseAmount;
    let couponCode = "";
    const code = (data.couponCode || "").trim().toUpperCase();
    if (code) {
        let coupon = null;
        try { coupon = $app.findFirstRecordByFilter("coupons", "code = {:c}", { c: code }); } catch (_) { /* not found */ }
        if (!coupon) throw new BadRequestError("Cupón no válido.");
        if (!coupon.get("active")) throw new BadRequestError("Cupón inactivo.");
        const now = new Date();
        const validFrom = coupon.get("valid_from") ? new Date(coupon.get("valid_from")) : null;
        const validUntil = coupon.get("valid_until") ? new Date(coupon.get("valid_until")) : null;
        if (validFrom && now < validFrom) throw new BadRequestError("Este cupón aún no está vigente.");
        if (validUntil && now > validUntil) throw new BadRequestError("Este cupón ya expiró.");
        const maxUses = Number(coupon.get("max_uses")) || 0;
        const usedCount = Number(coupon.get("used_count")) || 0;
        if (maxUses > 0 && usedCount >= maxUses) throw new BadRequestError("Este cupón ya alcanzó su límite de usos.");
        const appliesTo = coupon.get("applies_to");
        if (appliesTo !== "all" && appliesTo !== "membership") throw new BadRequestError("Este cupón no aplica a membresías.");
        const minAmount = Number(coupon.get("min_amount")) || 0;
        if (minAmount > 0 && baseAmount < minAmount) throw new BadRequestError(`Este cupón requiere un monto mínimo de ${minAmount}.`);
        const discount = coupon.get("discount_type") === "percent"
            ? baseAmount * (Number(coupon.get("discount_value")) / 100)
            : Number(coupon.get("discount_value"));
        finalAmount = Math.max(0, +(baseAmount - discount).toFixed(2));
        couponCode = code;
    }

    // Find (or create) this user's membership shell. Its plan/status/period
    // are only ever set by the webhook once payment is confirmed — never here.
    let membership = null;
    try { membership = $app.findFirstRecordByFilter("memberships", "owner = {:o}", { o: auth.id }); } catch (_) { /* none yet */ }
    if (!membership) {
        const membershipsCol = $app.findCollectionByNameOrId("memberships");
        membership = new Record(membershipsCol);
        membership.set("status", "pendiente");
        membership.set("auto_renew", true);
        membership.set("owner", auth.id);
        $app.save(membership);
    }

    const historyCol = $app.findCollectionByNameOrId("membership_history");
    const history = new Record(historyCol);
    history.set("membership", membership.id);
    history.set("plan", plan.id);
    history.set("action", membership.get("status") === "pendiente" ? "alta" : "cambio_plan");
    history.set("amount", finalAmount);
    history.set("currency", plan.get("currency") || "MXN");
    history.set("note", `${plan.get("name")} (${plan.get("interval")})`);
    history.set("coupon", couponCode);
    history.set("payment_status", "pendiente");
    history.set("owner", auth.id);
    $app.save(history);

    const pref = {
        items: [{
            title: `Membresía Neonexa: ${plan.get("name")}`,
            quantity: 1,
            currency_id: plan.get("currency") || "MXN",
            unit_price: Number(finalAmount),
        }],
        payer: { email: auth.get("email") },
        external_reference: `membership:${history.id}`,
        back_urls: {
            success: `${site}/membresias/retorno?history=${history.id}`,
            pending: `${site}/membresias/retorno?history=${history.id}`,
            failure: `${site}/membresias/retorno?history=${history.id}`,
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
        $app.logger().error("mp membership-preference failed", "status", res.statusCode, "body", res.json);
        throw new BadRequestError("No se pudo iniciar el pago con Mercado Pago.");
    }

    const histMeta = { mp_preference_id: res.json.id };
    history.set("meta", JSON.parse(JSON.stringify(histMeta)));
    $app.save(history);

    return e.json(200, { init_point: res.json.init_point || res.json.sandbox_init_point, historyId: history.id });
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
    let already = null;
    try {
        already = $app.findFirstRecordByFilter(
            "pack_purchases",
            "pack = {:p} && owner = {:o} && payment_status = 'pagado' && version_purchased = {:v}",
            { p: pack.id, o: auth.id, v: pack.get("version") || "" }
        );
    } catch (_) { /* no matching purchase — fine, continue */ }
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

    if (ref.indexOf("membership:") === 0) {
        const historyId = ref.slice("membership:".length);
        let history;
        try { history = $app.findRecordById("membership_history", historyId); }
        catch (_) { return e.json(200, { ok: true }); }
        if (!history) return e.json(200, { ok: true });

        if (history.get("payment_status") === mapped) return e.json(200, { ok: true });

        history.set("payment_status", mapped);
        const histMeta = Object.assign({}, history.get("meta") || {}, {
            mp_payment_id: mpPayment.id,
            mp_status: mpPayment.status,
            mp_status_detail: mpPayment.status_detail,
        });
        history.set("meta", JSON.parse(JSON.stringify(histMeta)));
        $app.save(history);

        let membership;
        try { membership = $app.findRecordById("memberships", history.get("membership")); }
        catch (_) { return e.json(200, { ok: true }); }

        if (mapped === "pagado") {
            const planId = history.get("plan");
            let plan;
            try { plan = $app.findRecordById("membership_plans", planId); } catch (_) { plan = null; }
            const start = new Date();
            const end = new Date(start);
            if (plan && plan.get("interval") === "anual") end.setFullYear(end.getFullYear() + 1);
            else end.setMonth(end.getMonth() + 1);

            membership.set("status", "activa");
            if (planId) membership.set("plan", planId);
            membership.set("period_start", start.toISOString());
            membership.set("period_end", end.toISOString());
            membership.set("cancel_at_period_end", false);
            membership.set("coupon", history.get("coupon") || "");
            $app.save(membership);

            const code = (history.get("coupon") || "").trim().toUpperCase();
            if (code) {
                try {
                    const coupon = $app.findFirstRecordByFilter("coupons", "code = {:c}", { c: code });
                    coupon.set("used_count", (Number(coupon.get("used_count")) || 0) + 1);
                    $app.save(coupon);
                } catch (_) { /* coupon may have been deleted since — ignore */ }
            }
        } else if (mapped === "fallido") {
            // only downgrade to pago_fallido if this wasn't already an active,
            // paid-up membership (a failed renewal shouldn't kill current access)
            if (membership.get("status") === "pendiente") {
                membership.set("status", "pago_fallido");
                $app.save(membership);
            }
        }
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

    if (mapped === "pagado" && payment.get("status") !== "pagado") {
        const code = ((order.get("totals") || {}).coupon || "").trim().toUpperCase();
        if (code) {
            try {
                const coupon = $app.findFirstRecordByFilter("coupons", "code = {:c}", { c: code });
                coupon.set("used_count", (Number(coupon.get("used_count")) || 0) + 1);
                $app.save(coupon);
            } catch (_) { /* coupon may have been deleted since — ignore */ }
        }
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
