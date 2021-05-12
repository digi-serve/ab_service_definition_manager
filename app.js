//
// definition_manager
// (AppBuilder) A service to manage the definitions for a running AppBuilder platform.
//
const AB = require("ab-utils");

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
