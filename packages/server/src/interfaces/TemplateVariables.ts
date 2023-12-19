export interface TemplateVariables {
  // From the `getTemplateVariables` function.
  readonly projectName: string;
  readonly isDev: boolean;
  readonly version: number;

  // Needed by all templates.
  readonly title: string;

  // Needed by the "main" template.
  readonly domain?: string;
}
