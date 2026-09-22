// apps/mobile/metro.config.js
//
// Monorepo-aware Metro config. Tells Metro to watch the whole pnpm
// workspace so edits to workspace packages (e.g. @crm/ui, @crm/core) are
// picked up, and to resolve node_modules from both the app and the root.

const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;