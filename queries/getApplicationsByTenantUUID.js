/**
 * getDefinitionsByTenantUUID.js
 * returns the {Tenant's definitions} rows in `appbuilder-{Tenant UUID}`.`appbuilder_definition`
 * table
 */

module.exports = function (
   req,
   tenantUUID = null,
   fields = [],
   filterByApplicationUUIDs = []
) {
   const DATABASE = `appbuilder-${tenantUUID}`;
   const TABLE = "appbuilder_definition";
   const sqlQuery = `SELECT ${
      fields.length ? `\`${fields.join("`, `")}\`` : "*"
   } FROM \`${DATABASE}\`.\`${TABLE}\` WHERE \`type\` = "application" ${
      filterByApplicationUUIDs.length
         ? `AND \`id\` = "${filterByApplicationUUIDs.join('" OR `id` = "')}"`
         : ""
   }`;

   return new Promise((resolve, reject) => {
      req.query(sqlQuery, [], (error, results /*, fields */) => {
         if (error) {
            req.log(sqlQuery);

            reject(error);

            return;
         }

         resolve({ tenantUUID, results });
      });
   });
};
