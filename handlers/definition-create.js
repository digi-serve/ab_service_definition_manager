/**
 * definition-create
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
   key: "definition_manager.definition-create",

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
      id: { string: { uuid: true }, required: true },
      name: { string: true, required: true },
      type: { string: true, required: true },
      json: { required: true },
   },

   /**
    * fn
    * our Request handler.
    * @param {obj} req
    *        the request object sent by the
    *        api_sails/api/controllers/definition_manager/definition-create.
    * @param {fn} cb
    *        a node style callback(err, results) to send data when job is finished
    */
   fn: function handler(req, cb) {
      req.log("definition_manager.definition-create:");

      // get the AB for the current tenant
      ABBootstrap.init(req)
         .then((AB) => { // eslint-disable-line

            var def = {
               id: req.param("id"),
               name: req.param("name"),
               type: req.param("type"),
               json: req.param("json"),
            };

            req.log(def);

            var fullDefinition = null;
            // {obj} the {ABDefinition} data returned from the DB.

            req.retry(() => AB.definitionCreate(req, def))
               .then((definition) => {
                  fullDefinition = definition.toObj();
                  cb(null, fullDefinition);
               })
               .then(() => {
                  // post the broadcast update for this definition
                  req.performance.mark("broadcast");
                  req.broadcast(
                     [
                        {
                           room: req.socketKey("abdesigner"),
                           event: "ab.abdefinition.create",
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
                                 "Service:definition_manager.definition-create: Error broadcasting ab.abdefinition.create.",
                           });
                        }
                        req.performance.measure("broadcast");
                        req.performance.log(["broadcast"]);
                     }
                  );
               })
               .then(() => {
                  req.servicePublish("definition.created", fullDefinition);
               })
               .catch((err) => {
                  req.notify.developer(err, {
                     context:
                        "Service:definition_manager.definition-create: Error creating definition.",
                  });
                  cb(err);
               });
         })
         .catch((err) => {
            req.notify.developer(err, {
               context:
                  "Service:definition_manager.definition-create: Error initializing ABFactory",
            });
            cb(err);
         });
   },
};
