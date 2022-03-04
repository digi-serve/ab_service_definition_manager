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

      let tenantID = req.tenantID();

      // Get the passed in parameters
      var roles = req.param("roles");
      let roleIDs = roles.map((r) => r.uuid);
      roleIDs.sort(); // so they will always be in same order.

      req.log("-- roles: --", roleIDs);

      ABBootstrap.init(req)
         .then((AB) => {
            let hashIDs = AB.cache(ServiceKey);
            if (!hashIDs) hashIDs = {};

            var ids = [];
            // {array}
            // all the ABDefinition.id that need to be exported.

            var hashKey = roleIDs.join(",");
            if (!hashIDs[hashKey]) {
               req.log("building ID hash");

               var applications = AB.applications((a) =>
                  a.isAccessibleForRoles(roles)
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
               hashIDs[hashKey] = aIDs;
               AB.cache(ServiceKey, hashIDs);
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
            req.notify.developer(err, {
               context:
                  "Service:definition_manager.definitionsForRoles: Error initializing ABFactory",
               req,
            });
            cb(err);
         });
   },
};
