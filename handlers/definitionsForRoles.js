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
         const stringifiedDefs = AB.cache("cached-defs") || {};
         const hashKey = roleIDs.join(",");

         if (stringifiedDefs[hashKey] != null) {
            cb(null, stringifiedDefs[hashKey]);

            return;
         }

         req.log("building ID hash");
         req.performance.mark("buildIDHash");

         const isSystemUser =
            roleIDs.filter((roleId) => AB.defaultSystemRoles().includes(roleId))
               .length > 0;
         const applications = AB.applications(
            (a) => isSystemUser || a.isAccessibleForRoles(roles)
         );

         req.log(
            `definition_manager.definitionsForRoles: found ${applications.length} applications to export`
         );

         // This takes a long time!
         // Cache this?
         const allIDs = [];

         applications.forEach((a) => {
            a.exportIDs(allIDs);
         });

         // NOTE: we also need to make sure all the System Objects in the definitions.
         AB.objects((o) => o.isSystemObject).forEach((systemObject) => {
            systemObject.exportIDs(allIDs);
         });

         req.performance.measure("buildIDHash");
         req.log(
            `definition_manager.definitionsForRoles: found ${allIDs.length} ids to export.`
         );
         req.performance.mark("stringify-defs-for-role", {
            op: "serialize",
         });

         stringifiedDefs[hashKey] = await req.worker(
            (defs) => JSON.stringify(defs),
            [
               allIDs
                  .map((id) => AB.definitionByID(id, true))
                  .filter((def) => def != null),
            ]
         );

         req.performance.measure("stringify-defs-for-role");
         AB.cache("cached-defs", stringifiedDefs);

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
