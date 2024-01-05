/**
 * definitions-app
 * Gather together the definitions for the specified Mobile App
 */

const ABBootstrap = require("../AppBuilder/ABBootstrap");
// {ABBootstrap}
// responsible for initializing and returning an {ABFactory} that will work
// with the current tenant for the incoming request.

const handlerExportApp = require("./export-app.js");

module.exports = {
   /**
    * Key: the cote message key we respond to.
    */
   key: "definition_manager.definitions-app",

   /**
    * inputValidation
    * define the expected inputs to this service handler:
    * Format:
    * "parameterName" : {
    *    {joi.fn}   : {bool},  // performs: joi.{fn}();
    *    {joi.fn}   : {
    *       {joi.fn1} : true,   // performs: joi.{fn}().{fn1}();
    *       {joi.fn2} : { options } // performs: joi.{fn}().{fn2}({options})
    *    }
    *    // examples:
    *    "required" : {bool},
    *    "optional" : {bool},
    *
    *    // custom:
    *        "validation" : {fn} a function(value, {allValues hash}) that
    *                       returns { error:{null || {new Error("Error Message")} }, value: {normalize(value)}}
    * }
    */
   inputValidation: {
      ID: { string: { uuid: true }, required: true },
   },

   /**
    * fn
    * our Request handler.
    * @param {obj} req
    *        the request object sent by the
    *        api_sails/api/controllers/mobile/app.js.
    * @param {fn} cb
    *        a node style callback(err, results) to send data when job is finished
    */
   fn: async function handler(req, cb) {
      req.log("definition_manager.definitions-app:");

      let errorContext = "";
      try {
         // get the AB for the current tenant
         errorContext = "Error initializing ABFactory";
         const AB = await ABBootstrap.init(req);

         // Check for Cached Definitions
         errorContext = "Error Checking Cache";
         const ID = req.param("ID");
         const allAppDefs = AB.cache("defs-app") || {};

         var cachedData = allAppDefs[ID];
         if (cachedData) {
            cb(null, cachedData);
            return;
         }

         // Gather all the App Definitions from our 'export-app' handler
         errorContext = "Error Gathering App Definitions from export-app";
         handlerExportApp.fn(req, async (err, data) => {
            const allIDs = [];

            // NOTE: we also need to make sure all the System Objects in the definitions.
            AB.objects((o) => o.isSystemObject).forEach((systemObject) => {
               systemObject.exportIDs(allIDs);
            });

            data.definitions = data.definitions.concat(
               allIDs
                  .map((id) => AB.definitionByID(id, true))
                  .filter((def) => def != null)
            );

            allAppDefs[ID] = await req.worker(
               (cData) => JSON.stringify(cData),
               [data]
            );
            AB.cache("defs-app", allAppDefs);
            cb(null, allAppDefs[ID]);
         });
      } catch (err) {
         req.notify.developer(err, {
            context: `Service:definition_manager.definitions-app: ${errorContext}`,
         });
         cb(err);
      }
   },
};
