/**
 * definition-delete
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
   key: "definition_manager.definition-delete",

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
    *        api_sails/api/controllers/definition_manager/definition-delete.
    * @param {fn} cb
    *        a node style callback(err, results) to send data when job is finished
    */
   fn: function handler(req, cb) {
      req.log("definition_manager.definition-delete:");

      // get the AB for the current tenant
      ABBootstrap.init(req)
         .then((AB) => { // eslint-disable-line

            var id = req.param("ID");

            var fullDefinition = null;
            // {json} the definition in the DB before deletion

            req.retry(() => AB.definitionFind(req, { id })).then((def) => {
               fullDefinition = def[0];

               return req
                  .retry(() => AB.definitionDestroy(req, id))
                  .then(() => {
                     cb(null, fullDefinition);
                  })
                  .then(() => {
                     req.servicePublish("definition.destroyed", id);
                  })
                  .then(() => {
                     // post the broadcast update for this definition
                     req.performance.mark("broadcast");
                     req.broadcast(
                        [
                           {
                              room: req.socketKey("abdesigner"),
                              event: "ab.abdefinition.delete",
                              data: {
                                 id,
                                 data: fullDefinition,
                              },
                           },
                        ],
                        (err) => {
                           if (err) {
                              req.notify.developer(err, {
                                 context:
                                    "Service:definition_manager.definition-delete: Error broadcasting ab.abdefinition.delete.",
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
                           "Service:definition_manager.definition-delete: Error deleting definition.",
                        id,
                     });
                     cb(err);
                  });
            });
         })
         .catch((err) => {
            req.notify.developer(err, {
               context:
                  "Service:definition_manager.definition-delete: Error initializing ABFactory",
            });
            cb(err);
         });
   },
};
