/**
 * export-app
 * our Request handler.
 */

const ABBootstrap = require("../AppBuilder/ABBootstrap");
// {ABBootstrap}
// responsible for initializing and returning an {ABFactory} that will work
// with the current tenant for the incoming request.

const _ = require("lodash");
const moment = require("moment");

const IgnoreRoleIDs = [
   "dd6c2d34-0982-48b7-bc44-2456474edbea",
   "6cc04894-a61b-4fb5-b3e5-b8c3f78bd331",
   "e1be4d22-1d00-4c34-b205-ef84b8334b19",
   "320ef94a-73b5-476e-9db4-c08130c64bb8",
   "ee52974b-5276-427f-ad4c-f29af6b5caaf",
];
// {array} The Role.ids of the default roles installed at creation.
// we don't need to import these.

module.exports = {
   /**
    * Key: the cote message key we respond to.
    */
   key: "definition_manager.export-app",

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
    *        api_sails/api/controllers/definition_manager/export-app.
    * @param {fn} cb
    *        a node style callback(err, results) to send data when job is finished
    */
   fn: function handler(req, cb) {
      req.log("definition_manager.export-app:");

      // get the AB for the current tenant
      ABBootstrap.init(req)
         .then(async (AB) => {
            // eslint-disable-line
            try {
               var ID = req.param("ID");
               var app = AB.applicationByID(ID);
               if (!app) {
                  var errNotFound = new Error("Application not found");
                  cb(errNotFound);
                  return;
               }

               var date = moment().format("YYYYMMDD");

               var exportData = {
                  abVersion: "0.0.0",
                  filename: `app_${_.replace(
                     _.trim(app.name),
                     " ",
                     "_"
                  )}_${date}`,
                  date,
                  definitions: [],
                  files: {
                     /* file.id : {
                        meta: {
                           // Wanted:
                           created_at: createdAt
                           updated_at: updatedAt,
                           field: {ABField.id},
                           object: {ABField.object.id},
                           pathFile: ???
                           file: {file | image}, // the name of the original file
                           size: size
                           uploadedBy: null
                           type: type
                           info: info || null
                        },
                        contents: "base64(contents)"
                     }
                     */
                  },
               };
               // {obj}
               // the final output format to return to the request.

               var dataHash = {};
               // {hash}  {def.id : def }
               // we use this to exclude any duplicate definitions. We parse this into
               // our final list at the end.

               // our upgraded export format:
               var data = {
                  settings: {
                     includeSystemObjects: app.isSystemObject,
                     // {bool}
                  },
                  ids: [],
                  siteObjectConnections: {
                     // SiteUser.id : [ ABField.ID, ],
                     // SiteRole.id : [ ABField.ID,, ]
                  },
                  roles: {
                     /* Role.id : Role.id */
                  },
               };
               app.exportData(data);
               data.ids.forEach((id) => {
                  if (!dataHash[id]) {
                     dataHash[id] = AB.definitionByID(id, true);
                  }
               });

               // parse each entry in our dataHash & store it in our
               // definitions
               Object.keys(dataHash).forEach((k) => {
                  exportData.definitions.push(dataHash[k]);
               });

               // copy in the siteObjectConnections
               exportData.siteObjectConnections = {};
               (Object.keys(data.siteObjectConnections) || []).forEach((k) => {
                  exportData.siteObjectConnections[k] = (
                     data.siteObjectConnections[k] || []
                  ).filter((f) => f);
               });

               // anything we export should NOT carry with it the
               // importedFieldID
               var objectDefs = exportData.definitions.filter(
                  (d) => d.type == "object"
               );
               objectDefs.forEach((o) => {
                  if (o.json.importedFieldIDs) {
                     o.json.importedFieldIDs = [];
                  }
               });

               var roleIDs = Object.keys(data.roles || {}).filter(
                  (rid) => IgnoreRoleIDs.indexOf(rid) == -1
               );
               if (roleIDs.length > 0) {
                  const SiteRole = AB.objectRole();
                  const roles =
                     (await req.retry(() =>
                        SiteRole.model().find({
                           where: { uuid: roleIDs },
                           populate: true,
                        })
                     )) || [];
                  const SiteScope = AB.objectScope();
                  // clean up our entries to not try to include
                  // current User data and redundant __relation fields
                  exportData.scopes = [];
                  const PROMISE_ALL_LIMIT = 10;
                  let pendingArrayOfScopes = [];
                  for (let i = 0; i < roles.length; i++) {
                     delete roles[i].id;
                     roles[i].users = [];
                     delete roles[i].scopes__relation;
                     if (roles[i].scopes.length === 0) continue;
                     pendingArrayOfScopes.push(
                        req.retry(() =>
                           SiteScope.model().find({
                              where: { uuid: roles[i].scopes },
                           })
                        )
                     );
                     if (i % PROMISE_ALL_LIMIT !== 0) continue;
                     (await Promise.all(pendingArrayOfScopes)).forEach(
                        (scopes) => {
                           (scopes || []).forEach((s) => {
                              delete s.id;
                              s.createdBy = null;
                           });
                           exportData.scopes.push(...scopes);
                        }
                     );
                     pendingArrayOfScopes = [];
                  }
                  if (pendingArrayOfScopes.length > 0)
                     (await Promise.all(pendingArrayOfScopes)).forEach(
                        (scopes) => {
                           (scopes || []).forEach((s) => {
                              delete s.id;
                              s.createdBy = null;
                           });
                           exportData.scopes.push(...scopes);
                        }
                     );
                  exportData.roles = roles;
               } else {
                  exportData.roles = [];
               }

               // Now lookup any docx views or ABViewImage and pull the related files:
               let types = ["docxBuilder", "image"];
               let fileNames = (exportData.definitions || [])
                  .filter(
                     (d) => d.type == "view" && types.indexOf(d.json.key) > -1
                  )
                  .map((f) => f.json.settings.filename)
                  .filter((f) => f);

               // Add in the ABFieldImage.defaultImage references:
               fileNames = fileNames.concat(
                  (exportData.definitions || [])
                     .filter((d) => d.type == "field" && d.json.key == "image")
                     .map((f) => f.json.settings.defaultImageUrl)
                     .filter((f) => f)
               );

               await ExportFiles(req, fileNames, exportData.files);

               cb(null, exportData);
            } catch (e) {
               req.notify.developer(e, {
                  context:
                     "Service:definition_manager.export-app: Error gathering definitions",
               });
               var returnError = new Error("Error gathering definitions.");
               cb(returnError);
            }
         })
         .catch((err) => {
            req.notify.developer(err, {
               context:
                  "Service:definition_manager.export-app: Error initializing ABFactory",
            });
            cb(err);
         });
   },
};

function ExportFiles(req, list, files) {
   return new Promise((resolve, reject) => {
      if (list.length == 0) {
         return resolve();
      }

      let file = list.shift();
      req.serviceRequest(
         "file_processor.file-export",
         {
            uuid: file,
         },
         (err, fileDef) => {
            if (err) {
               reject(err);
            }
            files[file] = fileDef;

            // continue with the next one
            ExportFiles(req, list, files).then(resolve).catch(reject);
         }
      );
   });
}
