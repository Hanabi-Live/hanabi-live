module.exports = (grunt) => {
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),

        // Concatenate all of the CSS files together into the "main.css" file
        concat: {
            css: {
                src: [
                    '../css/lib/fontawesome.min.css',
                    '../css/lib/solid.min.css',
                    '../css/lib/tooltipster.bundle.min.css',
                    '../css/lib/tooltipster-sideTip-shadow.min.css',
                    '../css/lib/alpha.css',
                    '../css/hanabi.css',
                ],
                dest: '../css/main.css',
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
                src: '../css/main.css',
                dest: '../css/main.min.css',
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
