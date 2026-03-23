const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.projectRoot = __dirname;
config.watchFolders = [__dirname];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];
config.resolver.disableHierarchicalLookup = true;

config.resolver.extraNodeModules = {
  "@react-native-async-storage/async-storage": path.resolve(
    __dirname,
    "asyncStorageMock.js",
  ),
};

module.exports = config;
