module.exports = (grunt) => {
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),

        // "Browserify" the Hanabi JavaScript (to convert Node-style imports to compatible browser code)
        browserify: {
            dist: {
                src: 'src/main.js',
                dest: 'main.browserified.js',
            },
        },

        // Concatenate all of the JavaScript files together into the "main.js" file
        // Concatenate all of the CSS files together into the "main.css" file
        concat: {
            js: {
                src: [
                    'lib/jquery-3.3.1.min.js',
                    'lib/tooltipster.bundle.min.js',
                    'lib/tooltipster-scrollableTip.min.js',
                    'lib/kinetic-v5.1.1.min.js',
                    'lib/sha256.min.js',
                    'lib/skel.min.js',
                    'lib/alpha.js',
                    'main.browserified.js',
                ],
                dest: 'main.bundled.js',
            },
            css: {
                src: [
                    '../css/lib/fontawesome.min.css',
                    '../css/lib/solid.min.css',
                    '../css/lib/tooltipster.bundle.min.css',
                    '../css/lib/tooltipster-sideTip-shadow.min.css',
                    '../css/alpha.css',
                    '../css/hanabi.css',
                ],
                dest: '../css/main.css',
            },
        },

        // Transpile the JavaScript using Babel so that it will work in older browsers
        // (Babel options are configured in the ".babelrc" file)
        babel: {
            options: {
                // This is needed to tell Babel that we want it to do maximum transpilation
                // (so that it will work on every single browser)
                // https://babeljs.io/docs/en/babel-preset-env
                presets: ['@babel/preset-env'],

                // Babel assumes that JavaScript is ES6 modules by default, which is not the case here
                // https://stackoverflow.com/questions/34973442/how-to-stop-babel-from-transpiling-this-to-undefined-and-inserting-use-str
                sourceType: 'unambiguous',
            },
            dist: {
                src: 'main.bundled.js',
                dest: 'main.transpiled.js',
            },
        },

        // Compile and minify the final JavaScript with Google's Closure Compiler
        'closure-compiler': {
            dist: {
                src: 'main.transpiled.js',
                dest: 'main.min.js',
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
    grunt.loadNpmTasks('grunt-browserify');
    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-babel');
    // The Grunt plugin for the Google Closure Compiler is documented here:
    // https://github.com/google/closure-compiler-npm/blob/master/packages/google-closure-compiler/docs/grunt.md
    require('google-closure-compiler').grunt(grunt);
    grunt.loadNpmTasks('grunt-contrib-cssmin');
    grunt.registerTask('default', [
        'browserify',
        'concat',
        'babel',
        'closure-compiler',
        'cssmin',
    ]);
};
