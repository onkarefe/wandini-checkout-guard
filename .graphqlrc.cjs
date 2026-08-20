const fs = require("node:fs");

function getConfig() {
  const config = { projects: {} };
  let extensions = [];
  try {
    extensions = fs.readdirSync("./extensions");
  } catch {
    // No extensions directory is valid while scaffolding.
  }
  for (const entry of extensions) {
    const extensionPath = "./extensions/" + entry;
    const schema = extensionPath + "/schema.graphql";
    if (!fs.existsSync(schema)) continue;
    config.projects[entry] = {
      schema,
      documents: [extensionPath + "/**/*.graphql"],
    };
  }
  return config;
}

module.exports = getConfig();
