const cote = require("cote");
const path = require("path");

const queryAllDefinitions = require(path.join(
   __dirname,
   "..",
   "queries",
   "allDefinitions"
));

// Instantiate a new Publisher component.
const definitionPublisher = new cote.Publisher({
   name: "Definition Publisher",
   // namespace: 'rnd',
   key: "ab.definition.update",
   broadcasts: ["definition.update"],
});

let Definitions = {
   /* tenantID : { def.id: {definition} } */
};
// a Hash of all the ABDefinitions stored in our DB.

/**
 * Publish()
 * send an update to all our subscribers of new Definition values.
 * @param {array} defs
 *        an array of definitions that need to be updated.
 */
function Publish(req, defs) {
   if (!Array.isArray(defs)) {
      defs = [defs];
   }
   // now ensure we are only publishing the .json values:
   var sendDefs = defs.map((d) => d.json || d);

   // we push out the .json data to our subscribers.
   definitionPublisher.publish("definition.update", {
      tenantID: req.tenantID(),
      defs: sendDefs,
   });
}

module.exports = {
   init: (req) => {
      var tID = req.tenantID();
      if (tID) {
         if (Definitions[tID]) {
            return Promise.resolve();
         } else {
            return Promise.resolve().then(() => {});
         }
      }
   },

   /**
    * definition.set(def)
    * store the provided ABDefinition value.
    * @param {ABRequest} req
    *        the req object associated with this operation. We need this to
    *        determine the TenantID associated with this definition.
    * @param {ABDefinition} def
    * @return {Promise}
    */
   set: (req, def) => {
      return Promise.resolve().then(() => {
         if (def.id) {
            var tID = req.tenantID();
            Definitions[tID] = Definitions[tID] || {};
            Definitions[tID][def.id] = def;
            if (typeof def.json == "string") {
               try {
                  def.json = JSON.parse(def.json);
               } catch (e) {
                  console.log(e);
                  var msg = `Unable to parse .json for definition id[${
                     def.id
                  }]: ${e.toString()}`;
                  var errJson = new Error(msg);
                  throw errJson;
                  return;
               }
            }
            Publish(req, def);
         }
      });
   },
};
