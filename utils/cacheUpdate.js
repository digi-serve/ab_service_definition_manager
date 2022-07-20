module.exports = (AB) => {
   console.log("Definitions Cache Cleared!");
   // Clear the cached definitions for role
   AB.cacheClear("defs-for-role");
   // Store the date last updated
   AB.cache("defs-for-role-updated", Date.now());
};
