module.exports = (AB) => {
   console.log("Definitions Cache Cleared!");
   // Clear the cached definitions for role
   AB.Cache("defs-for-role", {});
   // Store the date last updated
   AB.Cache("defs-for-role-updated", Date.now());
};
