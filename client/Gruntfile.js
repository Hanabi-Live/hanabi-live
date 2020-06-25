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
          path.join(cssLibPath, 'fontawesome.min.css'), // For icons
          path.join(cssLibPath, 'solid.min.css'), // Additional Font Awesome styles
          path.join(cssLibPath, 'tippy.min.css'), // For tooltips
          path.join(cssLibPath, 'alpha.css'), // For the HTML5Up Alpha template
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
