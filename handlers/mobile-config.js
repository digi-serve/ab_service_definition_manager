/**
 * mobile-config
 * Return the configuration data for the specified mobile app.
 */

const ABBootstrap = require("../AppBuilder/ABBootstrap");
// {ABBootstrap}
// responsible for initializing and returning an {ABFactory} that will work
// with the current tenant for the incoming request.

module.exports = {
   /**
    * Key: the cote message key we respond to.
    */
   key: "definition_manager.mobile-config",

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
    *        api_sails/api/controllers/definition_manager/definition-create.
    * @param {fn} cb
    *        a node style callback(err, results) to send data when job is finished
    */
   fn: async function handler(req, cb) {
      req.log("definition_manager.mobile-config:");

      // get the AB for the current tenant
      try {
         const AB = await ABBootstrap.init(req);

         let appID = req.param("ID");

         let Application = AB.applicationByID(appID);
         if (!Application) {
            let errNotFound = new Error(`ID [${appID}] Not Found`);
            errNotFound.code = "ENOTFOUND";
            cb(errNotFound);
            return;
         }

         cb(null, {
            version: Application.version,
            site: {
               appbuilder: {
                  networkType: Application.networkType,
                  networkNumRetries: 3,
                  // urlCoreServer: "",
               },
               storage: {
                  encrypted: false,
               },
            },
         });
      } catch (err) {
         req.notify.developer(err, {
            context: "Service:definition_manager.mobile-config",
         });
         cb(err);
      }
   },
};
