/**
 * definitionsForRoles
 * our Request handler.
 */

const ABBootstrap = require("../AppBuilder/ABBootstrap");

module.exports = {
   /**
    * Key: the cote message key we respond to.
    */
   key: "definition_manager.definitionsForRoles",

   /**
    * inputValidation
    * define the expected inputs to this service handler:
    */
   inputValidation: {
      roles: { array: true, required: true },
   },

   /**
    * fn
    * our Request handler.
    * @param {obj} req
    *        the request object sent by the api_sails/api/controllers/definition_manager/definitionsForRoles.
    * @param {fn} cb
    *        a node style callback(err, results) to send data when job is finished
    */
   fn: async function handler(req, cb) {
      //
      const ServiceKey = this.key;

      req.log(ServiceKey);

      // Get the passed in parameters
      const roles = req.param("roles");
      const roleIDs = roles.map((r) => r.uuid);

      roleIDs.sort(); // so they will always be in same order.

      req.log("-- roles: --", roleIDs);

      try {
         const AB = await ABBootstrap.init(req);

         let hashIDs = AB.cache("defs-for-role");
         if (!hashIDs) hashIDs = {};

         let ids = [];
         // {array}
         // all the ABDefinition.id that need to be exported.

         const hashKey = roleIDs.join(",");

         if (!hashIDs[hashKey] || hashIDs[hashKey].length == 0) {
            req.log("building ID hash");
            req.performance.mark("buildIDHash");

            const applications = AB.applications(
               (a) =>
                  // Check for a system user.
                  roleIDs.filter((roleId) =>
                     AB.defaultSystemRoles().includes(roleId)
                  ).length > 0 || a.isAccessibleForRoles(roles)
            );

            req.log(
               `definition_manager.definitionsForRoles: found ${applications.length} applications to export`
            );

            // This takes a long time!
            // Cache this?
            const aIDs = [];

            applications.forEach((a) => {
               a.exportIDs(aIDs);
            });

            // NOTE: we also need to make sure all the System Objects in the definitions.
            AB.objects((o) => o.isSystemObject).forEach((systemObject) => {
               systemObject.exportIDs(aIDs);
            });

            hashIDs[hashKey] = aIDs;

            AB.cache("defs-for-role", hashIDs);
            req.performance.measure("buildIDHash");
         }

         ids = hashIDs[hashKey];

         req.log(
            `definition_manager.definitionsForRoles: found ${ids.length} ids to export.`
         );

         const stringifiedDefs = AB.cache("cached-defs") || {};

         if (stringifiedDefs[hashKey] == null) {
            req.performance.mark("stringify-defs-for-role", {
               op: "serialize",
            });

            stringifiedDefs[hashKey] = await req.worker(
               (defs) => JSON.stringify(defs),
               [
                  ids
                     .map((id) => AB.definitionByID(id, true))
                     .filter((def) => def != null),
               ]
            );

            req.performance.measure("stringify-defs-for-role");
            AB.cache("cached-defs", stringifiedDefs);
         }

         cb(null, stringifiedDefs[hashKey]);
      } catch (error) {
         // we clear the cache just in case our data was incorrect.
         // AB.cacheClear(ServiceKey);
         req.notify.developer(error, {
            context:
               "Service:definition_manager.definitionsForRoles: Error initializing ABFactory",
         });
         cb(error);
      }
   },
};
