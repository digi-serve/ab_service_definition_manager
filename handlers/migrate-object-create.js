/**
 * migrate-object-create
 * our Request handler.
 */

const ABBootstrap = require("../AppBuilder/ABBootstrap");
// {ABBootstrap}
// responsible for initializing and returning an {ABFactory} that will work
// with the current tenant for the incoming request.

module.exports = {
   /**
    * Key: the cote message key we respond to.
    */
   key: "definition_manager.migrate-object-create",

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
    *        api_sails/api/controllers/definition_manager/migrate-object-create.
    * @param {fn} cb
    *        a node style callback(err, results) to send data when job is finished
    */
   fn: function handler(req, cb) {
      req.log("definition_manager.migrate-object-create:");

      // get the AB for the current tenant
      ABBootstrap.init(req)
         .then(async (AB) => { // eslint-disable-line

            var id = req.param("ID");
            var object = AB.objectByID(id);
            if (!object) {
               object = AB.queryByID(id);
            }
            if (!object) {
               var err = new Error(`ABObject not found for [${id}]`);
               err.code = 403;
               return cb(err);
            }
            try {
               await object.migrateCreate(req);
               cb(null, { status: "success" });
            } catch (e) {
               req.notify.developer(e, {
                  context:
                     "Service:definition_manager.migrate-object-create: Error migrating object",
                  id,
                  obj: object.toObj(),
               });
               cb(e);
            }
         })
         .catch((err) => {
            req.notify.developer(err, {
               context:
                  "Service:definition_manager.migrate-object-create: Error initializing ABFactory",
            });
            cb(err);
         });
   },
};
