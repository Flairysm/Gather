const memoryStore = {};

module.exports = {
  default: {
    getItem: async (key) => memoryStore[key] ?? null,
    setItem: async (key, value) => { memoryStore[key] = value; },
    removeItem: async (key) => { delete memoryStore[key]; },
    mergeItem: async () => {},
    clear: async () => { Object.keys(memoryStore).forEach((k) => delete memoryStore[k]); },
    getAllKeys: async () => Object.keys(memoryStore),
    multiGet: async (keys) => keys.map((k) => [k, memoryStore[k] ?? null]),
    multiSet: async (pairs) => pairs.forEach(([k, v]) => { memoryStore[k] = v; }),
    multiRemove: async (keys) => keys.forEach((k) => { delete memoryStore[k]; }),
    multiMerge: async () => {},
  },
};
