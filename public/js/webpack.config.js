const path = require('path');
const webpack = require('webpack');

module.exports = {
    // The entry file to bundle
    entry: path.join(__dirname, 'src', 'main.ts'),

    // Where to put the bundled file
    output: {
        path: __dirname, // By default, Webpack will output the file to a "dist" subdirectory
        filename: 'main.min.js',
        // Chrome caches source maps and will not update them even after a hard-refresh
        // Work around this by putting the epoch timestamp in the source map filename
        sourceMapFilename: `main.min.js.${new Date().getTime()}.map`,
    },

    resolve: {
        extensions: ['.js', '.ts', '.json'],
        symlinks: false, // Performance optimization
    },

    // Loaders are transformations that are applied on the source code of a module
    // https://webpack.js.org/concepts/loaders/
    module: {
        rules: [
            // All files with a ".ts" extension (TypeScript files) will be handled by "ts-loader"
            {
                test: /\.ts$/,
                include: path.join(__dirname, 'src'),
                loader: 'ts-loader',
            },
        ],
    },

    // Webpack will display a warning unless we specify the mode
    // Production mode minifies the resulting JavaScript
    mode: process.platform === 'win32' || process.platform === 'darwin' ? 'development' : 'production',

    plugins: [
        // ProvidePlugin automatically loads modules instead of having to import them everywhere
        // https://webpack.js.org/plugins/provide-plugin/
        new webpack.ProvidePlugin({
            $: 'jquery', // The Hanabi codebase and the Tooltipster library uses "$" to invoke jQuery
        }),
    ],

    // Ignore the warnings that recommend splitting up the codebase into separate bundles
    stats: {
        warningsFilter: [
            'The following asset(s) exceed the recommended size limit',
            'The following entrypoint(s) combined asset size exceeds the recommended limit',
            'You can limit the size of your bundles by using import() or require.ensure to lazy load some parts of your application.',
        ],
    },

    // Enable source maps for debugging purposes
    // (this will show the line number of the real file in the browser JavaScript console)
    devtool: 'source-map',
};
