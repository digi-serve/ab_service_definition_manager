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
         .then(async (AB) => { // eslint-disable-line
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
                     includeSystemObjects: app.isAdminApp,
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

               var roleIDs = Object.keys(data.roles || {});
               if (roleIDs.length == 0) {
                  done();
                  return;
               }
               const SiteRole = AB.objectRole();
               let list = await req.retry(() =>
                  SiteRole.model().find({
                     where: { uuid: roleIDs },
                     populate: true,
                  })
               );

               // clean up our entries to not try to include
               // current User data and redundant __relation fields
               (list || []).forEach((role) => {
                  delete role.id;
                  role.users = [];
                  delete role.scopes__relation;
                  (role.scopes || []).forEach((s) => {
                     delete s.id;
                     s.createdBy = null;
                  });
               });
               exportData.roles = list;

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
