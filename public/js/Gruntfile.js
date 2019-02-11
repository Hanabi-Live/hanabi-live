module.exports = (grunt) => {
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),

        // "Browserify" the JavaScript (to convert Node-style imports to compatible browser code)
        browserify: {
            dist: {
                src: 'src/main.js',
                dest: 'main.bundled.js',
            },
        },

        // Transpile the JavaScript using Babel so that it will work in older browsers
        // (Babel options are configured in the ".babelrc" file)
        babel: {
            dist: {
                src: 'main.bundled.js',
                dest: 'main.transpiled.js',
            },
        },

        // Concatenate all of the JavaScript files together into the "main.js" file
        // Concatenate all of the CSS files together into the "main.css" file
        concat: {
            js: {
                src: 'main.transpiled.js',
                dest: 'main.js',
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

        // Compile and minify the final JavaScript with Google's Closure Compiler
        'closure-compiler': {
            build: {
                closurePath: 'node_modules/google-closure-compiler-java/compiler.jar',
                js: 'src/main.js',
                jsOutputFile: 'main.min.js',
                maxBuffer: 500,
                options: {
                    compilation_level: 'ADVANCED_OPTIMIZATIONS',
                    language_in: 'ECMASCRIPT5_STRICT',
                },
            },
        },

        // Minify the CSS
        cssmin: {
            options: {
                // clean-css only does level 1 optimizations by default
                // https://github.com/jakubpawlowicz/clean-css#optimization-levels
                level: 2,
            },
            target: {
                files: {
                    '../css/main.min.css': ['../css/main.css']
                },
            },
        },
    });
    grunt.loadNpmTasks('grunt-browserify');
    grunt.loadNpmTasks('grunt-babel');
    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-closure-compiler');
    grunt.loadNpmTasks('grunt-contrib-cssmin');
    grunt.registerTask('default', [
        'browserify',
        'babel',
        'concat',
        'closure-compiler',
        'cssmin',
    ]);
};
