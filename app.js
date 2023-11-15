//
// definition_manager
// (AppBuilder) A service to manage the definitions for a running AppBuilder platform.
//
const AB = require("@digiserve/ab-utils");
const { version } = require("./package");
// Use sentry by default, but can override with env.TELEMETRY_PROVIDER
if (AB.defaults.env("TELEMETRY_PROVIDER", "sentry") == "sentry") {
   AB.telemetry.init("sentry", {
      dsn: AB.defaults.env(
         "SENTRY_DSN",
         "https://9990233f92238ba5c25eb80dbbb61dfa@o144358.ingest.sentry.io/4506121405661184"
      ),
      release: version,
   });
}
var controller = AB.controller("definition_manager");
controller.afterStartup((req, cb) => {
   // We need to kick start our publisher creating broadcast messages.
   // We just have to send 1 message, it doesn't even have to have
   // a correct TenantID ...
   req.servicePublish("definition.stale", {});

   // nothing to wait for so:
   return cb(/* err */);
});
// controller.beforeShutdown((req, cb)=>{ return cb(/* err */) });
controller.init();
