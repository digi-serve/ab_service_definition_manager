/**
 * tenants-update-application
 * our Request handler.
 */

const getTenants = require("../queries/getTenants");
const getApplicationsByTenantUUID = require("../queries/getApplicationsByTenantUUID");

module.exports = {
   /**
    * Key: the cote message key we respond to.
    */
   key: "definition_manager.tenants-update-application",

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
    *    "required" : {bool},  // default = false
    *
    *    // custom:
    *        "validation" : {fn} a function(value, {allValues hash}) that
    *                       returns { error:{null || {new Error("Error Message")} }, value: {normalize(value)}}
    * }
    */
   inputValidation: {
      applicationUUID: { string: true, optional: true },
      data: { object: true, required: true },
   },

   /**
    * fn
    * our Request handler.
    * @param {obj} req
    *        the request object sent by the api_sails/api/controllers/definition_manager/find.
    * @param {fn} cb
    *        a node style callback(err, results) to send data when job is finished
    */
   fn: async function handler(req, cb) {
      const data = req.param("data");
      const applicationUUID =
         req.param("applicationUUID") ??
         data.definitions.find((e) => {
            return e.type === "application";
         }).id;

      const tenantUUIDs = await getTenants(req, ["uuid"]);

      const penddingGetApplicationsByTenantUUIDs = [];

      tenantUUIDs.forEach((e) => {
         penddingGetApplicationsByTenantUUIDs.push(
            getApplicationsByTenantUUID(req, e.uuid, ["id"], [applicationUUID])
         );
      });

      const applicationsByTenantUUID = await Promise.all(
         penddingGetApplicationsByTenantUUIDs
      );

      const tenantUUIDsFilterByApplication = applicationsByTenantUUID
         .filter((e) => e.results.length)
         .map((e) => e.tenantUUID);

      // Import App
      const importApplication = (tenantUUID) => {
         const newReq = req;

         // We need the "req._tenantID" parameter to connect tenant databases not ABFactory.tenantID
         newReq._tenantID = tenantUUID;

         return new Promise((resolve, reject) => {
            newReq.serviceRequest(
               "definition_manager.json-import",
               // the parameter "jobData"
               {
                  json: data,
                  longRequest: true, // Tell cote to wait longer as import takes time.
               },
               (error) => {
                  if (error) {
                     req.notify.developer(error, {
                        context:
                           "definition_manager.json-import: Error requesting json-import.",
                     });

                     reject(error);
                     cb(error);

                     return;
                  }

                  resolve();
               }
            );
         });
      };

      for (let i = 0; i < tenantUUIDsFilterByApplication.length; i++)
         await importApplication(tenantUUIDsFilterByApplication[i]);

      cb(null, { success: true });
   },
};
