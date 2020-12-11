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
const bundleFilename = `main.${version}.min.css`;

// Constants
const cssDir = path.join("..", "public", "css");
const cssLibDir = path.join(cssDir, "lib");
const gruntOutputDir = path.join(__dirname, "grunt_output");

module.exports = (grunt) => {
  grunt.initConfig({
    pkg: grunt.file.readJSON("package.json"),

    // Concatenate all of the CSS files together into the "main.css" file
    concat: {
      css: {
        src: [
          path.join(cssLibDir, "fontawesome.min.css"),
          path.join(cssLibDir, "solid.min.css"),
          path.join(cssLibDir, "tooltipster.bundle.min.css"),
          path.join(cssLibDir, "tooltipster-sideTip-shadow.min.css"),
          path.join(cssLibDir, "alpha.css"),
          path.join(cssDir, "hanabi.css"),
        ],
        dest: path.join(gruntOutputDir, "main.css"),
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
        src: path.join(gruntOutputDir, "main.css"),
        dest: path.join(gruntOutputDir, bundleFilename),
      },
      critical: {
        src: path.join(cssDir, "critical.css"),
        // We don't bother baking the version into the critical CSS filename like we do for the
        // normal CSS bundle because we do not typically re-create the critical CSS after every
        // single client change
        dest: path.join(cssDir, "critical.min.css"),
      },
    },

    // Generate critical CSS
    criticalcss: {
      custom: {
        options: {
          url: grunt.option("url"), // Pass the URL when running the task
          width: 1200,
          height: 900,
          filename: path.join(gruntOutputDir, bundleFilename),
          outputfile: path.join(cssDir, "critical.css"),
          buffer: 800 * 1024,
          ignoreConsole: false,
        },
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
