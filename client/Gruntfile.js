/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

// Imports
const path = require('path');

// Constants
const cssPath = path.join('..', 'public', 'css');
const cssLibPath = path.join(cssPath, 'lib');

module.exports = (grunt) => {
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    // Concatenate all of the CSS files together into the "main.css" file
    concat: {
      css: {
        src: [
          path.join(cssLibPath, 'fontawesome.min.css'),
          path.join(cssLibPath, 'solid.min.css'),
          path.join(cssLibPath, 'tooltipster.bundle.min.css'),
          path.join(cssLibPath, 'tooltipster-sideTip-shadow.min.css'),
          path.join(cssLibPath, 'alpha.css'),
          path.join(cssPath, 'hanabi.css'),
        ],
        dest: path.join(cssPath, 'main.css'),
      },
    },

    // Minify the CSS
    cssmin: {
      options: {
        // clean-css only does level 1 optimizations by default
        // https://github.com/jakubpawlowicz/clean-css#optimization-levels
        level: 2,
      },
      dist: {
        src: path.join(cssPath, 'main.css'),
        dest: path.join(cssPath, 'main.min.css'),
      },
    },
  });

  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-cssmin');
  grunt.registerTask('default', [
    'concat',
    'cssmin',
  ]);
};
