/// <reference path="../pb_data/types.d.ts" />

// Centralizes "download an original from a purchased pack": verifies the
// purchase is actually paid, then returns a signed file URL and records the
// download (downloads_count / last_download_at) — the client can't do this
// itself since pack_purchases.updateRule is admin-only.

routerAdd("POST", "/api/packs/download", (e) => {
    const auth = e.auth;
    if (!auth) throw new UnauthorizedError("Debes iniciar sesión.");

    const data = new DynamicModel({ packImageId: "" });
    e.bindBody(data);
    if (!data.packImageId) throw new BadRequestError("Falta packImageId.");

    let packImage;
    try { packImage = $app.findRecordById("pack_images", data.packImageId); }
    catch (_) { throw new NotFoundError("Imagen no encontrada."); }

    const purchase = $app.findFirstRecordByFilter(
        "pack_purchases",
        "pack = {:p} && owner = {:o} && payment_status = 'pagado'",
        { p: packImage.get("pack"), o: auth.id }
    );
    if (!purchase) throw new ForbiddenError("No has comprado el pack de esta imagen.");

    const original = $app.findFirstRecordByFilter("pack_originals", "pack_image = {:i}", { i: packImage.id });
    if (!original) throw new NotFoundError("Archivo original no disponible.");

    purchase.set("downloads_count", (purchase.get("downloads_count") || 0) + 1);
    purchase.set("last_download_at", new Date().toISOString());
    $app.save(purchase);

    const token = auth.newFileToken();
    const filename = original.get("file");
    return e.json(200, {
        url: `${$os.getenv("API_URL") || "https://api.neonexaprint.com.mx"}/api/files/pack_originals/${original.id}/${filename}?token=${token}`,
    });
}, $apis.requireAuth());
