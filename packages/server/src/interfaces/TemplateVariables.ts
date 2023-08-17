export interface TemplateVariables {
  // From the `getTemplateVariables` function.
  projectName: string;
  isDev: boolean;
  version: number;

  // Needed by all templates.
  title: string;

  // Needed by the "main" template.
  domain?: string;
}
