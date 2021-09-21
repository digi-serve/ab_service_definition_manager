/**
 * definition-update
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
   key: "definition_manager.definition-update",

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
      values: { required: true },
      // uuid: { string: { uuid: true }, required: true },
      // email: { string: { email: true }, optional: true },
   },

   /**
    * fn
    * our Request handler.
    * @param {obj} req
    *        the request object sent by the
    *        api_sails/api/controllers/definition_manager/definition-update.
    * @param {fn} cb
    *        a node style callback(err, results) to send data when job is finished
    */
   fn: function handler(req, cb) {
      req.log("definition_manager.definition-update:");

      var fullDefinition = null;
      // {json} the updated definition in the DB

      // get the AB for the current tenant
      ABBootstrap.init(req)
         .then((AB) => { // eslint-disable-line
            // access your config settings if you need them:

            var id = req.param("ID");
            var values = req.param("values");

            req.retry(() => AB.definitionUpdate(req, id, values))
               .then((definition) => {
                  fullDefinition = definition.toObj();
                  cb(null, fullDefinition);
               })
               .then(() => {
                  req.servicePublish("definition.updated", fullDefinition);
               })
               .then(() => {
                  // post the broadcast update for this definition
                  req.performance.mark("broadcast");
                  req.broadcast(
                     [
                        {
                           room: req.socketKey("abdesigner"),
                           event: "ab.abdefinition.update",
                           data: {
                              id: fullDefinition.id,
                              data: fullDefinition,
                           },
                        },
                     ],
                     (err) => {
                        if (err) {
                           req.notify.developer(err, {
                              context:
                                 "Service:definition_manager.definition-update: Error broadcasting ab.abdefinition.update.",
                           });
                        }
                        req.performance.measure("broadcast");
                        req.performance.log(["broadcast"]);
                     }
                  );
               })
               .catch((err) => {
                  req.notify.developer(err, {
                     context:
                        "Service:definition_manager.definition-update: Error updating definition.",
                     values,
                     id,
                  });
                  cb(err);
               });
         })
         .catch((err) => {
            req.notify.developer(err, {
               context:
                  "Service:definition_manager.definition-update: Error initializing ABFactory",
            });
            cb(err);
         });
   },
};
