/**
 * json-import
 * our Request handler.
 */

const ABBootstrap = require("../AppBuilder/ABBootstrap");
// {ABBootstrap}
// responsible for initializing and returning an {ABFactory} that will work
// with the current tenant for the incoming request.
const cacheUpdate = require("../utils/cacheUpdate");

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
             * @function migrateCreateSequential()
             * a helper fn to ensure the given items perform their
             * .migrateCreate() sequentially.
             * NOTE: this was done to prevent errors related to performing
             * too many operations in parallel.
             * @param {array} allItems
             *        An array of objects that need to perform a .migrateCreate()
             * @param {int} numParallel
             *        How many of these objects do you want to attempt to
             *        process in parallel.
             *        1 = purely sequential
             * @param {fn} onError
             *        An error handler in case the .migrateCreate() fn returns
             *        an error.
             *        NOTE: this will not stop the process from continuing on.
             * @return {Promise}
             */
            // NOTE: keep this INSIDE the context of our fn() handler.
            //       we reference the  req, and thisKnex variables.
            function migrateCreateSequential(allItems, numParallel, onError) {
               return new Promise((resolve /*, reject */) => {
                  function doOne(cb) {
                     if (allItems.length == 0) {
                        cb();
                     } else {
                        var obj = allItems.shift();
                        obj.migrateCreate(req, thisKnex)
                           .then(() => {
                              doOne(cb);
                           })
                           .catch((err) => {
                              onError(err, obj);
                              doOne(cb);
                           });
                     }
                  }

                  // var numParallel = 2;
                  // {int} the number of objects to be processing in parallel

                  var numProcessing = 0;
                  // {int} the # currently running.

                  function endHandler(err) {
                     if (err) {
                        // ok, we should have noted the errors in allErrors
                        // so we continue on here.
                     }
                     numProcessing--;

                     // if all the objects have completed, then:
                     if (numProcessing < 1) {
                        resolve();
                     }
                  }

                  // Start up the number of Objects we want in Parallel
                  for (var i = 1; i <= numParallel; i++) {
                     numProcessing++;
                     doOne(endHandler);
                  }
               });
            }

            cacheUpdate(AB);

            return new Promise((resolve, reject) => {
               Promise.resolve()
                  .then(() => {
                     // Change innodb_lock_wait_timeout to 1 second to avoid lock table issues
                     return thisKnex.schema.raw(
                        "SET GLOBAL innodb_lock_wait_timeout = 1;"
                     );
                  })
                  .then(() => {
                     return thisKnex.schema.raw(
                        "SET SESSION innodb_lock_wait_timeout = 1;"
                     );
                  })
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
                                 "field",
                                 "object",
                                 "query",
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
                     // now load all the Objects, and do a .migrateCreate() on them:
                     // NOTE: there is a timing issue with ABFieldConnect fields.
                     // We have to 1st, create ALL the object tables before we can
                     // create connections between them.

                     req.log("::: IMPORT : creating base objects");

                     var allMigrates = [];
                     (allObjects || []).forEach((object) => {
                        object.stashCombineFields();
                        object.stashConnectFields(); // effectively ignores connectFields
                        object.stashIndexFieldsWithConnection();
                        // NOTE: keep .stashIndexNormal() after .stashIndexFieldsWithConnection()
                        object.stashIndexNormal();

                        allMigrates.push(object);
                     });

                     // {fix} attempt to avoid ER_LOCK_WAIT_TIMEOUT errors by
                     // slowing down the number of parallel requests:
                     return migrateCreateSequential(
                        allMigrates,
                        1,
                        (err, item) => {
                           allErrors.push({
                              context: "developer",
                              message: `>>>>>>>>>>>>>>>>>>>>>>
Pass 1: creating objects WITHOUT connectFields:
ABMigration.createObject() error:
${err.toString()}
>>>>>>>>>>>>>>>>>>>>>>`,
                              error: err,
                              obj: item.toObj(),
                           });
                        }
                     );
                  })
                  .then(() => {
                     // make sure all fields are created before we start with
                     // our Indexes

                     req.log("::: IMPORT : Normal Index Imports");

                     var allIndexes = [];

                     (allObjects || []).forEach((object) => {
                        var stashed = object.getStashedIndexNormals();
                        if (stashed && stashed.length > 0) {
                           allIndexes = allIndexes.concat(stashed);
                           object.applyIndexNormal();
                        }
                     });

                     // clear out any null entries
                     allIndexes = allIndexes.filter((i) => i);

                     return migrateCreateSequential(
                        allIndexes,
                        1,
                        (err, item) => {
                           var strErr = `${err.code}:${err.toString()}`;
                           allErrors.push({
                              context: "developer",
                              message: `>>>>>>>>>>>>>>>>>>>>>>
Pass 2: creating Normal INDEX :
index.migrateCreate() error:
${strErr}
>>>>>>>>>>>>>>>>>>>>>>`,
                              error: err,
                              indx: item.toObj(),
                           });
                        }
                     ).then(() => {
                        // Now make sure knex has the latest object data
                        (allObjects || []).forEach((object) => {
                           object.model().modelKnexRefresh();
                        });
                     });
                  })
                  .then(() => {
                     // Now that all the tables are created, we can go back
                     // and create the connections between them:

                     req.log("::: IMPORT : creating connected fields");

                     var allConnections = [];

                     // reapply connectFields to all objects BEFORE doing any
                     // .createField() s
                     (allObjects || []).forEach((object) => {
                        object.applyConnectFields(); // reapply connectFields
                     });

                     (allObjects || []).forEach((object) => {
                        if (!(object instanceof AB.Class.ABObjectExternal)) {
                           (object.connectFields() || []).forEach((field) => {
                              allConnections.push(field);
                           });
                        }
                     });

                     // Now make sure our SiteObjects include the imported connect
                     // fields:
                     Object.keys(data.siteObjectConnections || {}).forEach(
                        (k) => {
                           let sObj = AB.objectByID(k);
                           if (!sObj) {
                              console.error(
                                 `Unable to dereference SiteObject [${k}]`
                              );
                              return;
                           }
                           let fieldIDs = data.siteObjectConnections[k] || [];
                           fieldIDs.forEach((f) => {
                              sObj.fieldImport(f);
                              // include these fields in the migrations
                              let field = sObj.fieldByID(f);
                              if (field) {
                                 allConnections.push(field);
                              }
                           });
                        }
                     );

                     return migrateCreateSequential(
                        allConnections,
                        1,
                        (err, item) => {
                           var strErr = `${err.code}:${err.toString()}`;
                           allErrors.push({
                              context: "developer",
                              message: `>>>>>>>>>>>>>>>>>>>>>>
Pass 3: creating connectFields:
field.migrateCreate() error:
${strErr}
>>>>>>>>>>>>>>>>>>>>>>`,
                              error: err,
                              field: item.toObj(),
                           });
                        }
                     );
                  })
                  .then(() => {
                     req.log("::: IMPORT : Saving Changes to Site Objects");
                     let allSaves = [];
                     // Update our SiteObjects to reference these new imported
                     // fields
                     Object.keys(data.siteObjectConnections || {}).forEach(
                        (k) => {
                           let sObj = AB.objectByID(k);
                           if (!sObj) {
                              console.error(
                                 `Unable to dereference SiteObject [${k}]`
                              );
                              return;
                           }
                           let values = sObj.toDefinition().toObj();
                           allSaves.push(
                              req.retry(() =>
                                 AB.definitionUpdate(req, sObj.id, values)
                              )
                           );
                        }
                     );
                     return Promise.all(allSaves);
                  })
                  .then(() => {
                     // OK, now we can finish up with the Indexes that were
                     // based on connectFields:

                     req.log("::: IMPORT : Final Index Imports");

                     var allIndexes = [];

                     (allObjects || []).forEach((object) => {
                        var stashed = object.getStashedIndexes();
                        if (stashed && stashed.length > 0) {
                           allIndexes = allIndexes.concat(stashed);
                           object.applyIndexes();
                        }
                     });

                     allIndexes = allIndexes.filter((i) => i);

                     return migrateCreateSequential(
                        allIndexes,
                        1,
                        (err, item) => {
                           var strErr = `${err.code}:${err.toString()}`;
                           allErrors.push({
                              context: "developer",
                              message: `>>>>>>>>>>>>>>>>>>>>>>
Pass 4: creating Final INDEX :
index.migrateCreate() error:
${strErr}
>>>>>>>>>>>>>>>>>>>>>>`,
                              error: err,
                              indx: item.toObj(),
                           });
                        }
                     ).then(() => {
                        // Now make sure knex has the latest object data
                        (allObjects || []).forEach((object) => {
                           object.model().modelKnexRefresh();
                        });

                        Object.keys(data.siteObjectConnections || {}).forEach(
                           (k) => {
                              let sObj = AB.objectByID(k);
                              if (!sObj) return;
                              sObj.model().modelKnexRefresh();
                           }
                        );
                     });
                  })
                  .then(() => {
                     // OK, now we can finish up with the Combine fields that were

                     req.log("::: IMPORT : Final Combine Fields Imports");

                     let allCombineFields = [];

                     (allObjects || []).forEach((object) => {
                        let stashed = object.getStashedCombineFields();
                        if (stashed && stashed.length > 0) {
                           allCombineFields = allCombineFields.concat(stashed);
                           object.applyAllFields();
                        }
                     });

                     allCombineFields = allCombineFields.filter((i) => i);

                     return migrateCreateSequential(
                        allCombineFields,
                        1,
                        (err, item) => {
                           var strErr = `${err.code}:${err.toString()}`;
                           allErrors.push({
                              context: "developer",
                              message: `>>>>>>>>>>>>>>>>>>>>>>
Pass 5: creating Combine FIELD :
ABFieldCombine.migrateCreate() error:
${strErr}
>>>>>>>>>>>>>>>>>>>>>>`,
                              error: err,
                              field: item.toObj(),
                           });
                        }
                     );
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

                     return migrateCreateSequential(
                        allQueries,
                        1,
                        (err, item) => {
                           var strErr = `${err.code}:${err.toString()}`;
                           allErrors.push({
                              context: "developer",
                              message: `>>>>>>>>>>>>>>>>>>>>>>
Pass 6: creating QUERIES :
query.migrateCreate() error:
${strErr}
>>>>>>>>>>>>>>>>>>>>>>`,
                              error: err,
                              query: item.toObj(),
                           });
                        }
                     );
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
                     req.log("::: IMPORT : Saving Roles and Scopes");
                     const SiteRole = AB.objectRole();
                     const SiteScope = AB.objectScope();

                     var allRoles = [];
                     var allScopes = [];
                     (data.roles || []).forEach((role) => {
                        (role.scopes || []).forEach((s) => {
                           let found = allScopes.find(
                              (as) => as.uuid == s.uuid
                           );
                           if (!found) {
                              allScopes.push(s);
                           }
                        });
                        // In order to prevent any loss to existing
                        // assignments, remove any .users field
                        delete role.users;
                        allRoles.push(role);
                     });

                     return Promise.resolve()
                        .then(() => {
                           // Save Scopes 1st
                           var allScopeSaves = allScopes.map((s) =>
                              req
                                 .retry(() => SiteScope.model().create(s))
                                 .catch((err) => {
                                    let strErr = err.toString();
                                    if (strErr.indexOf("ER_DUP_ENTRY") > -1) {
                                       return req.retry(() =>
                                          SiteScope.model().update(s.uuid, s)
                                       );
                                    }
                                    throw err;
                                 })
                           );
                           return Promise.all(allScopeSaves);
                        })
                        .then(() => {
                           // Save Roles with connected ScopeIDs
                           var allRoleSaves = allRoles.map((role) =>
                              req
                                 .retry(() => SiteRole.model().create(role))
                                 .catch((err) => {
                                    let strErr = err.toString();
                                    if (strErr.indexOf("ER_DUP_ENTRY") > -1) {
                                       return req.retry(() =>
                                          SiteRole.model().update(
                                             role.uuid,
                                             role
                                          )
                                       );
                                    }
                                    throw err;
                                 })
                           );
                           return Promise.all(allRoleSaves);
                        });
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
                  .then(() => {
                     // Change innodb_lock_wait_timeout to 1 second to avoid lock table issues
                     return thisKnex.schema.raw(
                        "SET GLOBAL innodb_lock_wait_timeout = 50;"
                     );
                  })
                  .then(() => {
                     return thisKnex.schema.raw(
                        "SET SESSION innodb_lock_wait_timeout = 50;"
                     );
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
