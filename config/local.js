/*
 * Definition_Manager
 */
function env(envKey, defaultValue) {
   if (typeof process.env[envKey] == "undefined") {
      return defaultValue;
   }
   try {
      return JSON.parse(process.env[envKey]);
   } catch (e) {
      console.log(e);
      console.log(process.env[envKey]);
      return process.env[envKey];
   }
}

module.exports = {
   definition_manager: {
      /*************************************************************************/
      /* enable: {bool} is this service active?                                */
      /*************************************************************************/
      enable: env("DEFINITION_MANAGER_ENABLE", true),
   },

   /**
    * datastores:
    * Sails style DB connection settings
    */
   datastores: {
      appbuilder: {
         adapter: "sails-mysql",
         host: env("MYSQL_HOST", "db"),
         port: env("MYSQL_PORT", 3306),
         user: env("MYSQL_USER", "root"),
         password: process.env.MYSQL_PASSWORD,
         database: env("MYSQL_DBPREFIX", "appbuilder"),
      },
      site: {
         adapter: "sails-mysql",
         host: env("MYSQL_HOST", "db"),
         port: env("MYSQL_PORT", 3306),
         user: env("MYSQL_USER", "root"),
         password: process.env.MYSQL_PASSWORD,
         database: env("MYSQL_DBADMIN", "appbuilder-admin"),
      },
   },
};
