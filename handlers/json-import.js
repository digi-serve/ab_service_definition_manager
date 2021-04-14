/**
 * json-import
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
   key: "definition_manager.json-import",

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
      json: { object: true, required: true },
   },

   /**
    * fn
    * our Request handler.
    * @param {obj} req
    *        the request object sent by the
    *        api_sails/api/controllers/definition_manager/json-import.
    * @param {fn} cb
    *        a node style callback(err, results) to send data when job is finished
    */
   fn: function handler(req, cb) {
      req.log("definition_manager.json-import:");

      // get the AB for the current tenant
      ABBootstrap.init(req)
         .then((AB) => { // eslint-disable-line
            // access your config settings if you need them:

            // req.log(" ... just testing ...");

            // cb(null, { status: "success" });

            var data = req.param("json");
            var hashSaved = {};
            var allObjects = [];

            var allErrors = [];
            // {array} allErrors
            // an array of error messages related to this json-import run.
            // these will be displayed in a block at the end.

            return new Promise((resolve, reject) => {
               Promise.resolve()
                  .then(() => {
                     // Insert all the ABDefinitions for Applications, fields and objects:
                     req.log(
                        "::: IMPORT : importing initial definitions (Application, Fields, objects)"
                     );
                     var allSaves = [];
                     var currDefinitions = [];
                     (data.definitions || [])
                        .filter(
                           (d) =>
                              d &&
                              [
                                 "object",
                                 "field",
                                 "index",
                                 "application",
                              ].indexOf(d.type) > -1
                        )
                        .forEach((def) => {
                           hashSaved[def.id] = def;
                           currDefinitions.push(def);
                           allSaves.push(
                              req
                                 .retry(() =>
                                    AB.definitionCreate(req, def, {
                                       silenceErrors: ["ER_DUP_ENTRY"],
                                    })
                                 )
                                 .catch((err) => {
                                    //                            console.log(`>>>>>>>>>>>>>>>>>>>>>>
                                    // ${err.toString()}
                                    // >>>>>>>>>>>>>>>>>>>>>>`);

                                    if (
                                       err.toString().indexOf("ER_DUP_ENTRY") >
                                       -1
                                    ) {
                                       // console.log("===> trying an update instead.");
                                       return req.retry(() =>
                                          AB.definitionUpdate(req, def.id, def)
                                       );
                                    }
                                 })
                           );
                        });

                     return Promise.all(allSaves).then(() => {
                        return AB.definitionsParse(currDefinitions || []);
                     });
                  })
                  .then(() => {
                     // create instances of all objects first.
                     // this way we make sure our connectFields can reference other
                     // objects properly.
                     (data.definitions || [])
                        .filter((d) => d && d.type == "object")
                        .forEach((o) => {
                           var object = AB.objectNew(o.json);
                           allObjects.push(object);
                        });
                  })
                  .then(() => {
                     // now load all the Objects, and do a .migrageCreate() on them:
                     // NOTE: there is a timing issue with ABFieldConnect fields.
                     // We have to 1st, create ALL the object tables before we can
                     // create connections between them.

                     req.log("::: IMPORT : creating base objects");

                     var allMigrates = [];
                     (allObjects || []).forEach((object) => {
                        object.stashConnectFields(); // effectively ignores connectFields
                        object.stashIndexFieldsWithConnection();

                        allMigrates.push(
                           object.migrateCreate(req).catch((err) => {
                              allErrors.push({
                                 context: "developer",
                                 message: `>>>>>>>>>>>>>>>>>>>>>>
Pass 1: creating objects WITHOUT connectFields:
ABMigration.createObject() error:
${err.toString()}
>>>>>>>>>>>>>>>>>>>>>>`,
                                 error: err,
                              });
                           })
                        );
                     });

                     return Promise.all(allMigrates);
                  })
                  .then(() => {
                     // Now that all the tables are created, we can go back
                     // and create the connections between them:

                     req.log("::: IMPORT : creating connected fields");

                     var allConnections = [];
                     var allRetries = [];

                     // reapply connectFields to all objects BEFORE doing any
                     // .createField() s
                     (allObjects || []).forEach((object) => {
                        object.applyConnectFields(); // reapply connectFields
                     });

                     (allObjects || []).forEach((object) => {
                        if (!(object instanceof AB.Class.ABObjectExternal)) {
                           (object.connectFields() || []).forEach((field) => {
                              allConnections.push(
                                 field
                                    .migrateCreate(req, AB.Knex.connection())
                                    .catch((err) => {
                                       var strErr = err.toString();
                                       if (
                                          strErr.indexOf("ER_LOCK_DEADLOCK") !=
                                          -1
                                       ) {
                                          allRetries.push(field);
                                          return;
                                       }
                                       allErrors.push({
                                          context: "developer",
                                          message: `>>>>>>>>>>>>>>>>>>>>>>
Pass 2: creating connectFields:
ABMigration.createObject() error:
${strErr}
>>>>>>>>>>>>>>>>>>>>>>`,
                                          error: err,
                                       });
                                    })
                              );
                           });
                        }
                     });

                     function seqRetry(cb) {
                        // seqRetry()
                        // a recursive function to sequencially process each of the
                        // fields in the allRetries[].

                        if (allRetries.length == 0) {
                           cb();
                        } else {
                           var field = allRetries.shift();
                           field._deadlockRetry = field._deadlockRetry || 1;
                           req.log(
                              `::: ER_LOCK_DEADLOCK on Field[${field.name}] ... retrying`
                           );

                           field
                              .migrateCreate(req, AB.Knex.connection())
                              .then(() => {
                                 seqRetry(cb);
                              })
                              .catch((err) => {
                                 var strErr = err.toString();
                                 if (strErr.indexOf("ER_LOCK_DEADLOCK") != -1) {
                                    field._deadlockRetry++;
                                    if (field._deadlockRetry < 4) {
                                       allRetries.push(field);
                                       seqRetry(cb);
                                    } else {
                                       req.log(
                                          `:::ER_LOCK_DEADLOCK too many attempts for Field[${field.name}]`
                                       );
                                       cb(err);
                                    }
                                    return;
                                 }
                                 allErrors.push({
                                    context: "developer",
                                    message: `>>>>>>>>>>>>>>>>>>>>>>
Pass 2: creating connectFields:
ER_LOCK_DEADLOCK Retry...
ABMigration.createObject() error:
${strErr}
>>>>>>>>>>>>>>>>>>>>>>`,
                                    error: err,
                                 });
                                 cb(err);
                              });
                        }
                     }

                     return Promise.all(allConnections).then(() => {
                        return new Promise((resolve, reject) => {
                           seqRetry((err) => {
                              if (err) {
                                 return reject(err);
                              }
                              resolve();
                           });
                        });
                     });
                  })
                  .then(() => {
                     // OK, now we can finish up with the Indexes that were
                     // based on connectFields:

                     req.log("::: IMPORT : Final Index Imports");

                     var allIndexes = [];
                     var allUpdates = [];

                     (allObjects || []).forEach((object) => {
                        var stashed = object.getStashedIndexes();
                        if (stashed && stashed.length > 0) {
                           allIndexes = allIndexes.concat(stashed);
                           object.applyIndexes();
                        }
                     });

                     (allIndexes || []).forEach((indx) => {
                        if (indx) {
                           allUpdates.push(
                              index
                                 .migrateCreate(req, AB.Knex.connection())
                                 .catch((err) => {
                                    req.notify.developer(err, {
                                       context: "index.migrateCreate()",
                                       indx: indx.toObj(),
                                    });
                                 })
                           );
                        }
                     });

                     function refreshObject(object) {
                        // var knex = ABMigration.connection(object.connName);
                        var knex = AB.Knex.connection();
                        var tableName = object.dbTableName(true);

                        if (knex.$$objection && knex.$$objection.boundModels) {
                           // delete knex.$$objection.boundModels[tableName];

                           // FIX : Knex Objection v.1.1.8
                           knex.$$objection.boundModels.delete(
                              tableName + "_" + object.modelName()
                           );
                        }
                     }

                     return Promise.all(allUpdates).then(() => {
                        // Now make sure knex has the latest object data
                        (allObjects || []).forEach((object) => {
                           refreshObject(object);
                        });
                     });
                  })
                  .then(() => {
                     // now save all the rest:
                     var numRemaining =
                        data.definitions.length - Object.keys(hashSaved).length;
                     req.log(
                        `::: IMPORT : insert remaining definitions #${numRemaining}`
                     );
                     var allSaves = [];
                     (data.definitions || []).forEach((def) => {
                        if (def && !hashSaved[def.id]) {
                           allSaves.push(
                              AB.definitionCreate(req, def, {
                                 silenceErrors: ["ER_DUP_ENTRY"],
                              }).catch((err) => {
                                 var strErr = err.toString();
                                 //                            console.log(`>>>>>>>>>>>>>>>>>>>>>>
                                 // ${err.toString()}
                                 // >>>>>>>>>>>>>>>>>>>>>>`);

                                 if (strErr.indexOf("ER_DUP_ENTRY") > -1) {
                                    // console.log("===> trying an update instead.");
                                    return AB.definitionUpdate(
                                       req,
                                       def.id,
                                       def
                                    );
                                 }
                                 if (err.code != "ER_DUP_ENTRY") {
                                    allErrors.push({
                                       context: "developer",
                                       message: `>>>>>>>>>>>>>>>>>>>>>>
ABDefinitionModel.create() error:
${strErr}
>>>>>>>>>>>>>>>>>>>>>>`,
                                       error: err,
                                    });
                                 }
                              })
                           );
                        }
                     });
                     return Promise.all(allSaves);
                  })
                  .then(() => {
                     console.log(":::");
                     req.log("::: IMPORT : Finished");
                     console.log(":::");
                     if (allErrors.length > 0) {
                        req.log("::: with Errors:");
                        var bErrors = [];
                        var dErrors = [];
                        allErrors.forEach((e) => {
                           req.logError(e.message, e.error);
                           if (e.context == "developer") {
                              dErrors.push(e);
                           } else {
                              bErrors.push(e);
                           }
                        });

                        if (dErrors.length > 0) {
                           req.notify.developer(dErrors);
                        }

                        if (bErrors.length > 0) {
                           req.notify.builder(bErrors);
                        }
                     }
                     resolve(data);
                  })
                  .catch((err) => {
                     req.notify.developer(err, {});
                     reject(err);
                  });
            });
         })
         .then(() => {
            cb();
         })
         .catch((err) => {
            req.logError("ERROR:", err);
            cb(err);
         });
   },
};
