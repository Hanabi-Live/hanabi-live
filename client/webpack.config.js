// It is possible for the Webpack configuration to be written in TypeScript,
// but this will not work with the full range of options in "tsconfig.json"

// Imports
const SentryWebpackPlugin = require('@sentry/webpack-plugin');
const dotenv = require('dotenv');
const fs = require('fs');
const os = require('os');
const path = require('path');
const webpack = require('webpack');

// Constants
const outputPath = path.join(__dirname, 'webpack_output');
const inTravis = (
  typeof process.env.TRAVIS !== 'undefined'
  && process.env.TRAVIS === 'true'
);
const sentryTokenIsSet = (
  typeof process.env.SENTRY_AUTH_TOKEN !== 'undefined'
  && process.env.SENTRY_AUTH_TOKEN !== ''
);

// Read environment variables
dotenv.config({
  path: path.join(__dirname, '..', '.env'),
});

// Read the version
const versionPath = path.join(__dirname, '..', 'data', 'version.json');
if (!fs.existsSync(versionPath)) {
  throw new Error(`The version.json file does not exist at "${versionPath}".`);
}
const version = fs.readFileSync(versionPath).toString().trim();

// Constants
const filename = `main.${version}.min.js`;

// Clear out the output subdirectory, as it might contain old JavaScript bundles and old source maps
if (!process.env.WEBPACK_DEV_SERVER) {
  if (fs.existsSync(outputPath)) {
    const files = fs.readdirSync(outputPath);
    for (const file of files) {
      fs.unlinkSync(path.join(outputPath, file));
    }
  }
}

module.exports = {
  // The entry file to bundle
  entry: path.join(__dirname, 'src', 'main.ts'),

  // Where to put the bundled file
  output: {
    // By default, Webpack will output the file to a "dist" subdirectory
    path: outputPath,
    // (after WebPack is complete, a script will move the files to the "bundles" subdirectory)

    // We want to include the version number inside of the file name so that browsers will be forced
    // to retrieve the latest version (and not use a cached older version)
    filename,
  },

  resolve: {
    extensions: ['.js', '.ts', '.json'],
    symlinks: false, // Performance optimization
  },

  // Webpack will display a warning unless we specify the mode
  // Production mode minifies the resulting JavaScript, reducing the file size by a huge factor
  // However, production mode takes a lot longer to pack than development mode,
  // so we only enable it on the real web server so that we can have speedy development
  mode: os.hostname() === 'hanabi-live-server' ? 'production' : 'development',

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
      // All files with a ".js" extension (JavaScript libraries) need to import other source maps
      {
        test: /\.js$/,
        enforce: 'pre',
        use: ['source-map-loader'],
      },
    ],
  },

  plugins: [
    // ProvidePlugin automatically loads modules instead of having to import them everywhere
    // https://webpack.js.org/plugins/provide-plugin/
    new webpack.ProvidePlugin({
      // The codebase and the Tooltipster library uses "$" to invoke jQuery
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

  // Enable source maps for debugging purposes
  // (this will show the line number of the real file in the browser console)
  // Note that enabling source maps will not cause the end-user to download them unless they
  // actually open the developer tools in their browser
  // https://stackoverflow.com/questions/44315460/when-do-browsers-download-sourcemaps
  devtool: 'source-map',
};

if (!inTravis && sentryTokenIsSet) {
  if (module.exports.plugins === undefined) {
    throw new Error('There are no existing plugins to append to.');
  }
  module.exports.plugins.push(
    // In order for Sentry to use the source maps, we must use their custom Webpack plugin
    // This also uploads the packed file + source maps to Sentry
    // https://docs.sentry.io/platforms/javascript/sourcemaps/
    // (we don't want to upload anything in a development or testing environment)
    new SentryWebpackPlugin({
      // This must be the directory containing the source file and the source map
      include: outputPath,
      release: version,
    }),
  );
}
