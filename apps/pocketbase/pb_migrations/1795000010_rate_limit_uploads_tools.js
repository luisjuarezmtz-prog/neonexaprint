/// <reference path="../pb_data/types.d.ts" />

// File uploads and Tools processing only ever fell under the generic
// /api limit (200 req/5min) — nothing specific stopped a script from
// hammering either endpoint well within that budget. Adds dedicated,
// tighter limits for authenticated users, matching the existing pattern
// from 1769164585_set_rate_limits.js.

migrate(
  (app) => {
    const settings = app.settings();
    const rules = settings.rateLimits.rules.slice();

    rules.push(
      // File uploads (original DTF/Personalizados designs, staff-uploaded
      // processed/approved/production versions) — 30 per 5 minutes/user.
      {
        label: "POST /api/collections/files/records",
        audience: "@auth",
        duration: 5 * 60,
        maxRequests: 30,
      },
      // Tools job creation (includes the protected result_file upload) —
      // 60 per 5 minutes/user. The monthly per-plan limit already caps
      // total usage; this just stops a tight scripted burst.
      {
        label: "POST /api/collections/tool_jobs/records",
        audience: "@auth",
        duration: 5 * 60,
        maxRequests: 60,
      },
    );

    settings.rateLimits.rules = rules;
    app.save(settings);
  },
  (app) => {
    const settings = app.settings();
    settings.rateLimits.rules = settings.rateLimits.rules.filter(
      (r) => r.label !== "POST /api/collections/files/records" && r.label !== "POST /api/collections/tool_jobs/records"
    );
    app.save(settings);
  },
);
