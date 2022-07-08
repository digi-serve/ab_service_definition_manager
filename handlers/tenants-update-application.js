/**
 * find
 * our Request handler.
 */

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

      const getTenantUUIDs = () => {
         const SITE_TENANT = "site_tenant";

         return new Promise((resolve, reject) => {
            const sqlQueryTenantUUID = `SELECT uuid FROM \`${SITE_TENANT}\``;

            req.query(
               sqlQueryTenantUUID,
               [],
               (error, results /*, fields */) => {
                  if (error) {
                     req.log(sqlQueryTenantUUID);

                     reject(error);
                     cb(error);

                     return;
                  }

                  resolve(results);
               }
            );
         });
      };

      const tenantUUIDs = await getTenantUUIDs();

      const penddingFilterTenantUUIDsByApplication = [];

      for (let i = 0; i < tenantUUIDs.length; i++) {
         const APPBUILDER_DEFINITION = "appbuilder_definition";
         const sqlQueryDefinition = `SELECT \`id\` FROM \`appbuilder-${tenantUUIDs[i].uuid}\`.\`${APPBUILDER_DEFINITION}\` WHERE \`id\` = "${applicationID}"`;

         const getTenantUUIDByApplication = () => {
            return new Promise((resolve, reject) => {
               req.query(sqlQueryDefinition, [], (error, results) => {
                  if (error) {
                     req.log(sqlQueryDefinition);

                     reject(error);
                     cb(error);

                     return;
                  }

                  if (results.length) {
                     resolve(tenantUUIDs[i].uuid);

                     return;
                  }

                  resolve(null);
               });
            });
         };

         penddingFilterTenantUUIDsByApplication.push(
            getTenantUUIDByApplication()
         );
      }

      const tenantUUIDsByApplication = (
         await Promise.all(penddingFilterTenantUUIDsByApplication)
      ).filter((e) => e);

      for (let i = 0; i < tenantUUIDsByApplication.length; i++) {
         const importApplication = () => {
            return new Promise((resolve, reject) => {
               const newReq = req;

               newReq._tenantID = tenantUUIDsByApplication[i];
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
                     resolve();
                  }
               );
            });
         };

         await importApplication();
      }

      cb(null, { status: "success" });
   },
};
