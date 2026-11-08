// Generates the critical CSS from the CSS bundle. Run "build-critical-css.sh" instead of running
// this directly.

const fs = require("node:fs");
const path = require("node:path");

// "set-version.sh" writes the version as an ES module, which Grunt cannot require.
const versionPath = path.join(__dirname, "../data/src/version.js");
const VERSION = /VERSION = "([^"]+)"/u.exec(
  fs.readFileSync(versionPath, "utf8"),
)?.[1];
if (VERSION === undefined) {
  throw new Error(`Failed to parse the client version from: ${versionPath}`);
}

const cssDir = path.resolve(__dirname, "..", "..", "public", "css");

module.exports = function Gruntfile(grunt) {
  grunt.initConfig({
    criticalcss: {
      custom: {
        options: {
          url: grunt.option("url"), // Pass the URL when running the task.
          width: 1200,
          height: 900,
          filename: path.join(cssDir, `main.${VERSION}.min.css`),
          outputfile: path.join(cssDir, "critical.css"),
          buffer: 800 * 1024,
          ignoreConsole: false,
        },
      },
    },
  });

  grunt.loadNpmTasks("grunt-criticalcss");

  grunt.registerTask("critical", ["criticalcss"]);
};
