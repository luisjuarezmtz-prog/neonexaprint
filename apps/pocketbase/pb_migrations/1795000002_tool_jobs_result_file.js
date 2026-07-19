/// <reference path="../pb_data/types.d.ts" />

// Tool results only ever lived as a data-URL in the browser tab, or as a
// tiny embedded JPEG thumbnail — nothing recoverable after leaving the page,
// and no protected/temporary URL as required. This adds a real protected
// file field so the actual result can be re-downloaded later via a
// short-lived file token instead of being gone the moment you navigate away.

migrate(
  (app) => {
    const jobs = app.findCollectionByNameOrId("tool_jobs");
    if (!jobs.fields.getByName("result_file")) {
      jobs.fields.add(new FileField({
        name: "result_file", maxSelect: 1, maxSize: 26214400, protected: true,
      }));
    }
    app.save(jobs);
  },
  (app) => {
    const jobs = app.findCollectionByNameOrId("tool_jobs");
    try { jobs.fields.removeByName("result_file"); } catch (_) {}
    app.save(jobs);
  },
);
