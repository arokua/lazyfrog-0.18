import { o as getCurrentRedditUser, e as STORAGE_KEYS } from "./missions-D8fOGyOo.js";
async function exportAllData() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(null, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      Promise.all([
        getCurrentRedditUser(),
        Promise.resolve(chrome.runtime.getManifest())
      ]).then(([username, manifest]) => {
        if (!manifest.version) {
          reject(new Error("Extension manifest is missing version field"));
          return;
        }
        const backup = {
          version: "1.0",
          extVersion: manifest.version,
          exportDate: Date.now(),
          username,
          data: {
            missions: result[STORAGE_KEYS.MISSIONS],
            userProgress: result[STORAGE_KEYS.USER_PROGRESS],
            userOptions: result[STORAGE_KEYS.USER_OPTIONS],
            automationFilters: result[STORAGE_KEYS.AUTOMATION_FILTERS],
            automationConfig: result[STORAGE_KEYS.AUTOMATION_CONFIG],
            essenceLootDictionary: result[STORAGE_KEYS.ESSENCE_LOOT_DICTIONARY],
            discoveredAbilities: result.discoveredAbilities,
            discoveredBlessingStats: result.discoveredBlessingStats,
            redditApiCache: result[STORAGE_KEYS.REDDIT_API_CACHE]
          }
        };
        resolve(JSON.stringify(backup, null, 2));
      }).catch(reject);
    });
  });
}
async function importAllData(jsonData) {
  return new Promise((resolve, reject) => {
    try {
      const backup = JSON.parse(jsonData);
      if (!backup.version || !backup.data) {
        throw new Error("Invalid backup file format");
      }
      const dataToRestore = {};
      if (backup.data.missions) {
        dataToRestore[STORAGE_KEYS.MISSIONS] = backup.data.missions;
      }
      if (backup.data.userProgress) {
        dataToRestore[STORAGE_KEYS.USER_PROGRESS] = backup.data.userProgress;
      }
      if (backup.data.userOptions) {
        dataToRestore[STORAGE_KEYS.USER_OPTIONS] = backup.data.userOptions;
      }
      if (backup.data.automationFilters) {
        dataToRestore[STORAGE_KEYS.AUTOMATION_FILTERS] = backup.data.automationFilters;
      }
      if (backup.data.automationConfig) {
        dataToRestore[STORAGE_KEYS.AUTOMATION_CONFIG] = backup.data.automationConfig;
      }
      if (backup.data.essenceLootDictionary) {
        dataToRestore[STORAGE_KEYS.ESSENCE_LOOT_DICTIONARY] = backup.data.essenceLootDictionary;
      }
      if (backup.data.discoveredAbilities) {
        dataToRestore.discoveredAbilities = backup.data.discoveredAbilities;
      }
      if (backup.data.discoveredBlessingStats) {
        dataToRestore.discoveredBlessingStats = backup.data.discoveredBlessingStats;
      }
      if (backup.data.redditApiCache) {
        dataToRestore[STORAGE_KEYS.REDDIT_API_CACHE] = backup.data.redditApiCache;
      }
      chrome.storage.local.set(dataToRestore, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}
export {
  exportAllData,
  importAllData
};
