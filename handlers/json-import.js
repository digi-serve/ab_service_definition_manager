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
         .then((AB) => {
            var thisKnex = AB.Knex.connection();
            // {Knex}
            // Access the Knex builder and provide it to our operations.

            var data = req.param("json");
            data.files = data.files || [];

            var hashSaved = {};
            // {obj} /* def.id : def */
            // a hash of all the definitions we have saved in the first step

            var allObjects = [];
            // {array ABObject}
            // an array of all the ABObjects we are importing.

            var allErrors = [];
            // {array} allErrors
            // an array of error messages related to this json-import run.
            // these will be displayed in a block at the end.

            /**
             * @function refreshObject()
             * a helper fn to reset the knex bound model definitions with
             * the current definition of the given model.  We need to do
             * this as we have taken off fields and are periodically adding
             * them back on during our import.
             * @param {ABObject} object
             *        The ABObject definition we are recreating.
             */
            function refreshObject(object) {
               // var knex = ABMigration.connection(object.connName);
               var knex = thisKnex;
               var tableName = object.dbTableName(true);

               if (knex.$$objection && knex.$$objection.boundModels) {
                  // delete knex.$$objection.boundModels[tableName];

                  // FIX : Knex Objection v.1.1.8
                  knex.$$objection.boundModels.delete(
                     tableName + "_" + object.modelName()
                  );
               }
            }

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
                                 "query",
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
                                    // if that entry already existed

                                    if (
                                       err.toString().indexOf("ER_DUP_ENTRY") >
                                       -1
                                    ) {
                                       // trying an update instead.");
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
                        // NOTE: keep .stashIndexNormal() after .stashIndexFieldsWithConnection()
                        object.stashIndexNormal();

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
                     // make sure all fields are created before we start with
                     // our Indexes

                     req.log("::: IMPORT : Normal Index Imports");

                     var allIndexes = [];
                     var allUpdates = [];

                     (allObjects || []).forEach((object) => {
                        var stashed = object.getStashedIndexNormals();
                        if (stashed && stashed.length > 0) {
                           allIndexes = allIndexes.concat(stashed);
                           object.applyIndexNormal();
                        }
                     });

                     (allIndexes || []).forEach((indx) => {
                        if (indx) {
                           allUpdates.push(
                              index
                                 .migrateCreate(req, thisKnex)
                                 .catch((err) => {
                                    req.notify.developer(err, {
                                       context: "index.migrateCreate()",
                                       indx: indx.toObj(),
                                    });
                                 })
                           );
                        }
                     });

                     return Promise.all(allUpdates).then(() => {
                        // Now make sure knex has the latest object data
                        (allObjects || []).forEach((object) => {
                           refreshObject(object);
                        });
                     });
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
                                    .migrateCreate(req, thisKnex)
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
                              .migrateCreate(req, thisKnex)
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
                                 .migrateCreate(req, thisKnex)
                                 .catch((err) => {
                                    req.notify.developer(err, {
                                       context: "index.migrateCreate()",
                                       indx: indx.toObj(),
                                    });
                                 })
                           );
                        }
                     });

                     // function refreshObject(object) {
                     //    // var knex = ABMigration.connection(object.connName);
                     //    var knex = thisKnex;
                     //    var tableName = object.dbTableName(true);

                     //    if (knex.$$objection && knex.$$objection.boundModels) {
                     //       // delete knex.$$objection.boundModels[tableName];

                     //       // FIX : Knex Objection v.1.1.8
                     //       knex.$$objection.boundModels.delete(
                     //          tableName + "_" + object.modelName()
                     //       );
                     //    }
                     // }

                     return Promise.all(allUpdates).then(() => {
                        // Now make sure knex has the latest object data
                        (allObjects || []).forEach((object) => {
                           refreshObject(object);
                        });
                     });
                  })
                  .then(() => {
                     ///
                     /// Now Queries
                     ///
                     var allQueries = [];
                     (data.definitions || [])
                        .filter((d) => d && d.type == "query")
                        .forEach((q) => {
                           var query = AB.queryNew(q.json);
                           allQueries.push(query);
                        });

                     var allMigrates = [];
                     (allQueries || []).forEach((query) => {
                        allMigrates.push(
                           query.migrateCreate(req, thisKnex).catch((err) => {
                              allErrors.push({
                                 context: "developer",
                                 message: `>>>>>>>>>>>>>>>>>>>>>>
Pass 3: creating QUERIES:
ABMigration.createQuery() error:
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
                     // now process the default Files included in the import.
                     var fileKeys = Object.keys(data.files);
                     if (fileKeys.length == 0) return;

                     req.log("::: IMPORT : Saving Files");

                     var allFiles = [];
                     fileKeys.forEach((key) => {
                        var file = data.files[key];

                        allFiles.push(
                           new Promise((resolve, reject) => {
                              req.serviceRequest(
                                 "file_processor.file_import",
                                 {
                                    uuid: key,
                                    entry: file.meta,
                                    contents: file.contents,
                                 },
                                 (err) => {
                                    if (err) {
                                       return reject(err);
                                    }
                                    resolve();
                                 }
                              );
                           })
                        );
                     });

                     return Promise.all(allFiles);
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
            req.servicePublish("definition.stale", {});
            cb();
         })
         .catch((err) => {
            // req.logError("ERROR:", err);
            req.notify.developer(err, {
               context:
                  "Service:definition_manager.json-import: Error initializing ABFactory",
               req,
            });
            cb(err);
         });
   },
};
