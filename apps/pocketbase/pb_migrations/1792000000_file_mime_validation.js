/// <reference path="../pb_data/types.d.ts" />

// Real server-side file-type validation: PocketBase's mimeTypes validator
// sniffs the actual uploaded bytes (not the client-declared extension or
// Content-Type header), so a renamed binary disguised as a PNG is rejected
// at the API level, not just flagged by client-side heuristics.

migrate(
  (app) => {
    const files = app.findCollectionByNameOrId("files");
    const asset = files.fields.getByName("asset");
    if (asset) {
      asset.mimeTypes = [
        "image/png",
        "image/jpeg",
        "image/tiff",
        "application/pdf",
        "image/svg+xml",
        "text/xml", // some sniffers detect plain SVG text as this instead of image/svg+xml
        "text/plain; charset=utf-8", // ditto, for minimal/no-doctype SVGs
      ];
    }
    app.save(files);
  },
  (app) => {
    const files = app.findCollectionByNameOrId("files");
    const asset = files.fields.getByName("asset");
    if (asset) asset.mimeTypes = [];
    app.save(files);
  },
);
