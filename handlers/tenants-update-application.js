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

      let applicationID = null;

      for (let i = 0; i < data.definitions.length; i++)
         if (data.definitions[i].type === "application") {
            applicationID = data.definitions[i].id;

            break;
         }

      const tenantUUIDs = await getTenants(req, ["uuid"]);

      const penddingGetApplicationsByTenantUUID = [];

      for (let i = 0; i < tenantUUIDs.length; i++) {
         penddingGetApplicationsByTenantUUID.push(
            getApplicationsByTenantUUID(
               req,
               tenantUUIDs[i].uuid,
               ["id"],
               [applicationID]
            )
         );
      }

      const applicationsByTenantUUID = await Promise.all(
         penddingGetApplicationsByTenantUUID
      );

      const tenantUUIDsFilterByApplication = applicationsByTenantUUID
         .filter((e) => e.results.length)
         .map((e) => e.tenantUUID);

      // Import App and wait 10 seconds for DB connection timeout default
      const importApplication = (tenantUUID, mS = 10000) => {
         const newReq = req;

         // We need the "req._tenantID" parameter to connect tenant databases not ABFactory.tenantID
         newReq._tenantID = tenantUUID;

         return new Promise((resolve, reject) => {
            newReq.serviceRequest(
               "definition_manager.json-import",
               {
                  json: data,
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

                  setTimeout(() => {
                     resolve();
                  }, mS);
               }
            );
         });
      };

      for (let i = 0; i < tenantUUIDsFilterByApplication.length; i++) {
         await importApplication(tenantUUIDsFilterByApplication[i]);
      }

      cb(null, { status: "success" });
   },
};
