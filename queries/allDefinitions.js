/**
 * allDefinitions.js
 * returns all the {ABDefinition} rows in the appbuilder_definition
 * table
 */

module.exports = function (req) {
   return new Promise((resolve, reject) => {
      let tenantDB = req.queryTenantDB(reject);
      if (!tenantDB) {
         // reject() has already been called in .queryTenantDB()
         return;
      }

      tenantDB += ".";

      let sql = `SELECT * FROM ${tenantDB}\`appbuilder_definition\``;

      req.query(sql, [], (error, results, fields) => {
         if (error) {
            req.log(sql);
            reject(error);
         } else {
            resolve(results);
         }
      });
   });
};
