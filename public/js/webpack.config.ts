import SentryWebpackPlugin from '@sentry/webpack-plugin';
import * as fs from 'fs';
import * as path from 'path';
import * as webpack from 'webpack';

// Read the version
const versionPath = path.join(__dirname, 'src', 'data', 'version.json');
if (!fs.existsSync(versionPath)) {
    throw new Error(`The version.json file does not exist at "${versionPath}".`);
}
const version = fs.readFileSync(versionPath).toString();

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
    },

    resolve: {
        extensions: ['.js', '.ts', '.json'],
        symlinks: false, // Performance optimization
    },

    // Webpack will display a warning unless we specify the mode
    // Production mode minifies the resulting JavaScript
    mode: 'production',

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

        // Using the "@sentry/browser" package will cause the TypeScript source maps to get messed
        // up; we use the custom Sentry Webpack plugin to fix this
        // https://docs.sentry.io/platforms/javascript/sourcemaps/
        new SentryWebpackPlugin({
            include: path.join(__dirname, 'main.min.js'),
            release: version,
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
    // (this will show the line number of the real file in the browser console)
    // Note that enabling source maps will not cause the end-user to download them unless they
    // actually open the developer tools in their browser
    // https://stackoverflow.com/questions/44315460/when-do-browsers-download-sourcemaps
    devtool: 'source-map',
};

export default config;
