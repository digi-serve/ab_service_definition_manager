/**
 * information-object
 * our Request handler.
 */

const ABBootstrap = require("../AppBuilder/ABBootstrap");

module.exports = {
   /**
    * Key: the cote message key we respond to.
    */
   key: "definition_manager.information-object",

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
    *        api_sails/api/controllers/definition_manager/information-object.
    * @param {fn} cb
    *        a node style callback(err, results) to send data when job is finished
    */
   fn: function handler(req, cb) {
      req.log("definition_manager.information-object:");

      // get the AB for the current tenant
      ABBootstrap.init(req)
         .then(async (AB) => {
            const objID = req.param("ID");
            const object = AB.objectByID(objID);
            if (!object) {
               const err = new Error(`ABObject not found for [${objID}]`);
               err.code = 404;
               return cb(err);
            }

            const dbConn = AB.Knex.connection();

            req.log(`Getting Information... Object[${object.id}]`);

            try {
               const rows = (
                  await dbConn.raw(`DESCRIBE \`${object.tableName}\``)
               )?.[0];

               const result = {
                  definitionId: object.id,
                  tableName: object.tableName,
                  fields: rows,
               };

               cb(null, result);
            } catch (err) {
               req.notify.developer(err, {
                  context: `Service:definition_manager.information-object: Error getting the object information. - Object[${objID}]`,
               });
               cb(err);
            }
         })
         .catch((err) => {
            req.notify.developer(err, {
               context:
                  "Service:definition_manager.information-object: Error initializing ABFactory",
            });
            cb(err);
         });
   },
};
