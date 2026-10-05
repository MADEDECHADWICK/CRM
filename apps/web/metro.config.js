// apps/web/metro.config.js
//
// Monorepo-aware Metro config, matching apps/mobile. Watch the whole pnpm
// workspace so edits to @crm/app, @crm/ui or @crm/core hot-reload here without
// a restart, and resolve node_modules from both the app and the root because
// pnpm's layout is not hoisted.

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