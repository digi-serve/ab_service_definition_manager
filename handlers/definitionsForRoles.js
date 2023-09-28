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
   fn: function handler(req, cb) {
      //
      var ServiceKey = this.key;
      req.log(ServiceKey);

      // Get the passed in parameters
      var roles = req.param("roles");
      let roleIDs = roles.map((r) => r.uuid);
      roleIDs.sort(); // so they will always be in same order.

      req.log("-- roles: --", roleIDs);

      ABBootstrap.init(req)
         .then((AB) => {
            let hashIDs = AB.cache("defs-for-role");
            if (!hashIDs) hashIDs = {};

            const isSystemUser = roleIDs.filter((roleId) =>
               AB.defaultSystemRoles().includes(roleId)
            );

            var ids = [];
            // {array}
            // all the ABDefinition.id that need to be exported.

            var hashKey = roleIDs.join(",");
            if (!hashIDs[hashKey] || hashIDs[hashKey].length == 0) {
               req.log("building ID hash");

               var applications = AB.applications(
                  (a) => isSystemUser || a.isAccessibleForRoles(roles)
               );

               req.log(
                  `definition_manager.definitionsForRoles: found ${applications.length} applications to export`
               );

               // This takes a long time!
               // Cache this?
               let aIDs = [];
               applications.forEach((a) => {
                  a.exportIDs(aIDs);
               });

               // NOTE: we also need to make sure all the System Objects in the definitions.
               let systemObjects = AB.objects((o) => o.isSystemObject);
               for (var i = 0; i < systemObjects.length; i++) {
                  systemObjects[i].exportIDs(aIDs);
               }

               hashIDs[hashKey] = aIDs;

               AB.cache("defs-for-role", hashIDs);
            }

            ids = hashIDs[hashKey];
            req.log(
               `definition_manager.definitionsForRoles: found ${ids.length} ids to export.`
            );
            var definitions = [];
            ids.forEach((id) => {
               let def = AB.definitionByID(id, true);
               if (def) {
                  definitions.push(def);
               }
            });

            cb(null, definitions);
         })
         .catch((err) => {
            // we clear the cache just in case our data was incorrect.
            // AB.cacheClear(ServiceKey);
            req.notify.developer(err, {
               context:
                  "Service:definition_manager.definitionsForRoles: Error initializing ABFactory",
            });
            cb(err);
         });
   },
};

