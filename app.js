//
// definition_manager
// (AppBuilder) A service to manage the definitions for a running AppBuilder platform.
//
const AB = require("ab-utils");

var controller = AB.controller("definition_manager");
// controller.afterStartup((cb)=>{ return cb(/* err */) });
// controller.beforeShutdown((cb)=>{ return cb(/* err */) });
controller.init();
