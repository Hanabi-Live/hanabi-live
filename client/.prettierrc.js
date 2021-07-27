// This is the configuration file for Prettier, the auto-formatter
// https://prettier.io/docs/en/configuration.html
module.exports = {
  // https://prettier.io/docs/en/options.html#trailing-commas
  // The default is "es5" - Trailing commas where valid in ES5 (objects, arrays, etc.)
  // However, always having trailing commas is objectively better
  // The Airbnb style guide agrees:
  // https://github.com/airbnb/javascript#commas--dangling
  // Prettier itself also acknowledges Nik Graf's blog in their official blog:
  // https://prettier.io/blog/2020/03/21/2.0.0.html#change-default-value-for-trailingcomma-to-es5-6963httpsgithubcomprettierprettierpull6963-by-fiskerhttpsgithubcomfisker
  // https://medium.com/@nikgraf/why-you-should-enforce-dangling-commas-for-multiline-statements-d034c98e36f8
  // Prettier will change the default in the future:
  // https://github.com/prettier/prettier/issues/9369
  trailingComma: "all",
  endOfLine: "lf",
};
