import * as fs from 'fs';
import * as path from 'path';
import * as webpack from 'webpack';

// Constants
const epoch = new Date().getTime();

// Delete old source maps
const files = fs.readdirSync(__dirname);
for (const file of files) {
    const match = file.match(/main.min.js.\d+.map/g);
    if (match) {
        fs.unlinkSync(path.join(__dirname, file));
    }
}

const config: webpack.Configuration = {
    // The entry file to bundle
    entry: path.join(__dirname, 'src', 'main.ts'),

    // Where to put the bundled file
    output: {
        path: __dirname, // By default, Webpack will output the file to a "dist" subdirectory
        filename: 'main.min.js',
        // Chrome caches source maps and will not update them even after a hard-refresh
        // Work around this by putting the epoch timestamp in the source map filename
        sourceMapFilename: `main.min.js.${epoch}.map`,
    },

    resolve: {
        extensions: ['.js', '.ts', '.json'],
        symlinks: false, // Performance optimization
    },

    // Webpack will display a warning unless we specify the mode
    // Production mode minifies the resulting JavaScript
    mode: (
        process.platform === 'win32'
        || process.platform === 'darwin' ? 'development' : 'production'
    ),

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

    plugins: [
        // ProvidePlugin automatically loads modules instead of having to import them everywhere
        // https://webpack.js.org/plugins/provide-plugin/
        new webpack.ProvidePlugin({
            // The Hanabi codebase and the Tooltipster library uses "$" to invoke jQuery
            $: 'jquery',
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
};

export default config;
