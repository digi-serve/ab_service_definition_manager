/**
 * Ensure secrets are properly handled as definitions are created / updated, and
 * removed from the incoming values before they are stored to the DB
 * @param {Object} values
 * @param {string[]} values.storedSecrets a list of already processed secrets
 * @param {string[]} values.deleteSecrets a list of existing secrets to remove
 * @param {object[]} values.secrets an array of unencrypted secrets to process
 * @param {ABFactory} AB
 * @returns {Object} values without secrets
 */
async function process(values, AB) {
   values.storedSecrets = values.storedSecrets ?? [];
   if (values.deleteSecrets) {
      values.deleteSecrets.forEach((name) => {
         AB.Secret.delete(values.id, name);
         const i = values.storedSecrets.indexOf(name);
         values.storedSecrets.splice(i, 0);
      });
      delete values.deleteSecrets;
   }
   if (values.secrets) {
      const secrets = values.secrets.filter(
         ({ name }) => !values.storedSecrets.includes(name)
      );
      await AB.Secret.create(values.id, ...secrets);
      values.storedSecrets = values.storedSecrets.concat(
         values.secrets.map((s) => s.name)
      );
      delete values.secrets;
   }
   return values;
}

module.exports = process;
