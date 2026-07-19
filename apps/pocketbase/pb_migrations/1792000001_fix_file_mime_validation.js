/// <reference path="../pb_data/types.d.ts" />

// Fixes a real hole in the previous migration: it allowed "text/plain" and
// "text/xml" as a fallback for bare SVGs, but that also accepts ANY plain
// text file uploaded under any filename/extension (verified: a .txt file
// renamed to fake.png was accepted). Testing confirms real PNG/JPEG/PDF/SVG
// samples are correctly sniffed by their specific mime type without needing
// a text/* fallback, so it's removed entirely.

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
      ];
    }
    app.save(files);
  },
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
        "text/xml",
        "text/plain; charset=utf-8",
      ];
    }
    app.save(files);
  },
);
