// Zod compiles its object parsers with `new Function` unless it is "jitless". The site's content
// security policy does not allow `eval`, so the browser would report a violation in the console
// when Zod tests for it. Zod reads this setting when it creates a schema, so each entry point
// imports this module before any other. A blank line after the import keeps Prettier from sorting
// it below the others.

import * as z from "zod";

z.config({ jitless: true });
