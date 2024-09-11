// @ts-check

import tseslint from "typescript-eslint"; // eslint-disable-line import-x/no-extraneous-dependencies
import { hanabiConfigBase } from "../../eslint.config.mjs";

export default tseslint.config(...hanabiConfigBase);
