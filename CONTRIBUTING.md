# Contributing to the Hanab Live Project

- With issues:

  - Use the search tool before opening a new issue.

- With pull requests:

  - We hang out in [the Discord server](https://discord.gg/FADvkJp) in the `#website-development` channel. Come say hi.
  - Your pull requests need to pass the linter. To set up the linter, read and follow the [installation instructions](docs/install.md).
  - Help me fix all these bugs and issues!

  # Creating a new variant

  - If your Variant adds new suits into the game, you can modify suits.json adding those new suits at the end of the file

  -Then find the file "getVariantDescriptions.ts" and look for "const variantDescriptions"

  - There you will find the variant functions in the order they were added to the game each with ... before them

  - Add your variant function or functions after the last ... line

  - Further down the file you will see the various Variant functions. Copy one of these functions as a function template so you know how the formatting will work. If your variant function is simple, I would recommend the getMixVariants() function to use as the template.

  - Paste the function template right before the function maxRequiredVariantEfficiency()

  - Modify the function name, as well as the entries Variant Name and Suits to match your added Variants and delete the excess entries. Be sure to save the file with Vscode so it follows prettier formatting rules.

  - Make a Github Commit after these files are changed and submit a pull request to Hanabi-Live:main. Do not edit the variants.txt or variants.json files directly

  - Run npm run create-variants-json in the commandline in the same directory as where you ran in Installation for Development and Running the Server Instructions in Install.md

  - Upload the generated files variants.json and variants.txt and make a new Github Commit.

  - Following the above steps should allow the pull request to run through with no formatting or monorepo errors.
