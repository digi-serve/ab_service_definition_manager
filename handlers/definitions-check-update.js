/**
 * definitions-check-update
 * Check for the date definitions where last updated
 * (When defs-for-role cache was last cleared)
 * our Request handler.
 */

const ABBootstrap = require("../AppBuilder/ABBootstrap");

module.exports = {
   /**
    * Key: the cote message key we respond to.
    */
   key: "definition_manager.definitions-check-update",

   /**
    * inputValidation
    * define the expected inputs to this service handler:
    */
   inputValidation: {},

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

      ABBootstrap.init(req)
         .then((AB) => {
            if (!AB.cache("defs-for-role-updated")) {
               AB.cache("defs-for-role-updated", Date.now());
            }
            const updated = AB.cache("defs-for-role-updated");
            cb(null, updated);
         })
         .catch((err) => {
            console.log(err);
         });
   },
};
