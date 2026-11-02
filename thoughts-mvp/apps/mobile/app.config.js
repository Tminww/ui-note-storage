// EAS Update can only be activated after creating a real EAS project.
// Set EXPO_EAS_PROJECT_ID to the UUID returned by `eas init`.
const base = require('./app.json').expo;
const id = process.env.EXPO_EAS_PROJECT_ID;
module.exports = {expo: {
  ...base,
  ...(id ? {updates:{enabled:true,url:`https://u.expo.dev/${id}`,checkAutomatically:'ON_LOAD',fallbackToCacheTimeout:0},extra:{...(base.extra||{}),eas:{projectId:id}}} : {})
}};
