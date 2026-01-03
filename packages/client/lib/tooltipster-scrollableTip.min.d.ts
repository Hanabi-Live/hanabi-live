// We create a stub ".d.ts" file to prevent the TypeScript warning of "This condition will always
// return 'false'." (This will appear even when we are not directly editing the file due to
// "enableProjectDiagnostics".)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const content: any;
export = content;
