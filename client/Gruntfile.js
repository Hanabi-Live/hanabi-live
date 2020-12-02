/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-var-requires */

// Imports
const fs = require("fs");
const path = require("path");

// Read the version
const versionPath = path.join(__dirname, "..", "data", "version.json");
if (!fs.existsSync(versionPath)) {
  throw new Error(`The version.json file does not exist at "${versionPath}".`);
}
const version = fs.readFileSync(versionPath).toString().trim();

// Define the name of the final CSS file
// We want to include the version inside of the filename
// (as opposed to other solutions like using a version query string)
// This will:
// 1) allow proxies to cache the file properly
// 2) properly force a download of a new version in a reliable way
// https://www.alainschlesser.com/bust-cache-content-hash/
const filename = `main.${version}.min.css`;

// Constants
const cssPath = path.join("..", "public", "css");
const cssLibPath = path.join(cssPath, "lib");

module.exports = (grunt) => {
  grunt.initConfig({
    pkg: grunt.file.readJSON("package.json"),

    // Concatenate all of the CSS files together into the "main.css" file
    concat: {
      css: {
        src: [
          path.join(cssLibPath, "fontawesome.min.css"),
          path.join(cssLibPath, "solid.min.css"),
          path.join(cssLibPath, "tooltipster.bundle.min.css"),
          path.join(cssLibPath, "tooltipster-sideTip-shadow.min.css"),
          path.join(cssLibPath, "alpha.css"),
          path.join(cssPath, "hanabi.css"),
        ],
        dest: path.join(cssPath, "main.css"),
      },
    },

    // Minify the CSS
    cssmin: {
      options: {
        // clean-css only does level 1 optimizations by default
        // https://github.com/jakubpawlowicz/clean-css#optimization-levels
        level: 2,
      },
      main: {
        src: path.join(cssPath, "main.css"),
        dest: path.join(cssPath, filename),
      },
      critical: {
        src: path.join(cssPath, "critical.css"),
        // We don't bother baking the version into the critical CSS filename like we do for the
        // normal CSS bundle because we don't typically re-create the critical CSS after every
        // single client change
        dest: path.join(cssPath, "critical.min.css"),
      },
    },

    // Generate critical CSS
    criticalcss: {
      custom: {
        options: {
          url: grunt.option("url"), // Pass the URL when running the task
          width: 1200,
          height: 900,
          filename: path.join(cssPath, "main.min.css"),
          outputfile: path.join(cssPath, "critical.css"),
          buffer: 800 * 1024,
          ignoreConsole: false,
        },
      },
    },

    // Minify the CSS
    cssminCritical: {
      options: {
        // clean-css only does level 1 optimizations by default
        // https://github.com/jakubpawlowicz/clean-css#optimization-levels
        level: 2,
      },
      dist: {
        src: path.join(cssPath, "critical.css"),
        dest: path.join(cssPath, "critical.min.css"),
      },
    },
  });

  grunt.loadNpmTasks("grunt-contrib-concat");
  grunt.loadNpmTasks("grunt-contrib-cssmin");
  grunt.loadNpmTasks("grunt-criticalcss");

  grunt.registerTask("default", ["concat", "cssmin:main"]);

  // Generating critical CSS is slow and infrequent
  // Run manually when the CSS changes with "npx grunt critical --url=http://localhost"
  // and commit the resulting file (critical.min.css)
  grunt.registerTask("critical", [
    "concat",
    "cssmin:main",
    "criticalcss",
    "cssmin:critical",
  ]);
};
