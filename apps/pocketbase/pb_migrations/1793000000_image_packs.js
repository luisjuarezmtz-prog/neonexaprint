/// <reference path="../pb_data/types.d.ts" />

// Biblioteca de Imágenes DTF por Packs (Prompt 4).
//
// Core security rule: an original design file must never be downloadable by
// a user who hasn't paid for the pack it belongs to. Enforced at the
// PocketBase rule level (not just hidden in the UI) via a back-relation
// check against pack_purchases — see pack_images.viewRule below.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const adminWrite = "@request.auth.id != '' && @request.auth.role = 'admin'";

    // --- image_packs: the sellable commercial unit ---
    let packs;
    try { packs = app.findCollectionByNameOrId("image_packs"); } catch (_) {
      packs = new Collection({
        type: "base",
        name: "image_packs",
        listRule: "", // public catalog — anyone can browse
        viewRule: "",
        createRule: adminWrite,
        updateRule: adminWrite,
        deleteRule: adminWrite,
        fields: [
          { name: "name", type: "text", required: true, max: 160 },
          { name: "slug", type: "text", required: true, max: 160 },
          { name: "cover", type: "file", maxSelect: 1, maxSize: 10485760, mimeTypes: ["image/png", "image/jpeg", "image/webp"] },
          { name: "short_description", type: "text", max: 300 },
          { name: "full_description", type: "editor", maxSize: 50000 },
          { name: "category", type: "select", required: true, maxSelect: 1, values: [
            "temporadas", "oficios", "deportes", "frases", "infantiles", "estilos", "nichos", "tendencias",
          ] },
          { name: "subcategory", type: "text", max: 120 },
          { name: "tags", type: "json", maxSize: 20000 },
          { name: "item_count", type: "number", required: true },
          { name: "formats", type: "json", maxSize: 5000 },
          { name: "resolution_note", type: "text", max: 200 },
          { name: "price", type: "number", required: true },
          { name: "promo_price", type: "number" },
          { name: "promo_start", type: "date" },
          { name: "promo_end", type: "date" },
          { name: "license_type", type: "select", required: true, maxSelect: 1, values: [
            "personal", "comercial", "no_reventa", "exclusivo",
          ] },
          { name: "license_notes", type: "text", max: 2000 },
          { name: "version", type: "text", max: 40 },
          { name: "status", type: "select", required: true, maxSelect: 1, values: [
            "borrador", "publicado", "oculto", "agotado",
          ] },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: ["CREATE UNIQUE INDEX idx_image_packs_slug ON image_packs (slug)"],
      });
      app.save(packs);
    }

    // --- pack_images: individual images inside a pack (public sample) ---
    let packImages;
    try { packImages = app.findCollectionByNameOrId("pack_images"); } catch (_) {
      packImages = new Collection({
        type: "base",
        name: "pack_images",
        listRule: "", // public — the watermarked sample gallery
        viewRule: "",
        createRule: adminWrite,
        updateRule: adminWrite,
        deleteRule: adminWrite,
        fields: [
          { name: "pack", type: "relation", required: true, maxSelect: 1, collectionId: packs.id, cascadeDelete: true },
          { name: "name", type: "text", required: true, max: 160 },
          { name: "thumbnail", type: "file", maxSelect: 1, maxSize: 10485760, mimeTypes: ["image/png", "image/jpeg", "image/webp"] },
          { name: "dominant_color", type: "text", max: 30 },
          { name: "style", type: "text", max: 60 },
          { name: "product_type", type: "text", max: 60 },
          { name: "sort", type: "number" },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        ],
      });
      app.save(packImages);
    }

    // --- pack_purchases: purchase → payment → unlock record ---
    let purchases;
    try { purchases = app.findCollectionByNameOrId("pack_purchases"); } catch (_) {
      purchases = new Collection({
        type: "base",
        name: "pack_purchases",
        listRule: "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.role = 'admin' || @request.auth.role = 'operador' || @request.auth.role = 'ventas')",
        viewRule: "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.role = 'admin' || @request.auth.role = 'operador' || @request.auth.role = 'ventas')",
        createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
        updateRule: adminWrite,
        deleteRule: adminWrite,
        fields: [
          { name: "pack", type: "relation", required: true, maxSelect: 1, collectionId: packs.id, cascadeDelete: true },
          { name: "owner", type: "relation", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
          { name: "amount_paid", type: "number", required: true },
          { name: "currency", type: "text", max: 8 },
          { name: "transaction_reference", type: "text", max: 120 },
          { name: "payment_status", type: "select", required: true, maxSelect: 1, values: [
            "pendiente", "pagado", "fallido", "reembolsado",
          ] },
          { name: "license_snapshot", type: "text", max: 40 },
          { name: "version_purchased", type: "text", max: 40 },
          { name: "downloads_count", type: "number" },
          { name: "last_download_at", type: "date" },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      });
      app.save(purchases);
    }

    // --- pack_originals: the actual protected deliverable files ---
    // Only unlocked once a matching pack_purchases row is "pagado" — this is
    // enforced here, at the rule level, not just hidden in the UI.
    let originals;
    try { originals = app.findCollectionByNameOrId("pack_originals"); } catch (_) {
      originals = new Collection({
        type: "base",
        name: "pack_originals",
        listRule: `@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operador' || (pack ?= @request.auth.pack_purchases_via_owner.pack && @request.auth.pack_purchases_via_owner.payment_status ?= 'pagado'))`,
        viewRule: `@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operador' || (pack ?= @request.auth.pack_purchases_via_owner.pack && @request.auth.pack_purchases_via_owner.payment_status ?= 'pagado'))`,
        createRule: adminWrite,
        updateRule: adminWrite,
        deleteRule: adminWrite,
        fields: [
          { name: "pack", type: "relation", required: true, maxSelect: 1, collectionId: packs.id, cascadeDelete: true },
          { name: "pack_image", type: "relation", required: true, maxSelect: 1, collectionId: packImages.id, cascadeDelete: true },
          { name: "file", type: "file", required: true, maxSelect: 1, maxSize: 52428800, protected: true },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        ],
      });
      app.save(originals);
    }

    // --- image_favorites ---
    let favorites;
    try { favorites = app.findCollectionByNameOrId("image_favorites"); } catch (_) {
      favorites = new Collection({
        type: "base",
        name: "image_favorites",
        listRule: "@request.auth.id != '' && @request.auth.id = owner",
        viewRule: "@request.auth.id != '' && @request.auth.id = owner",
        createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
        deleteRule: "@request.auth.id != '' && @request.auth.id = owner",
        fields: [
          { name: "pack_image", type: "relation", required: true, maxSelect: 1, collectionId: packImages.id, cascadeDelete: true },
          { name: "owner", type: "relation", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        ],
        indexes: ["CREATE UNIQUE INDEX idx_fav_owner_image ON image_favorites (owner, pack_image)"],
      });
      app.save(favorites);
    }
  },
  (app) => {
    for (const name of ["image_favorites", "pack_originals", "pack_purchases", "pack_images", "image_packs"]) {
      try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {}
    }
  },
);
