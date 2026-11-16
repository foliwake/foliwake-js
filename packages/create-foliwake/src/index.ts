// create-foliwake: create a Foliwake site frontend. The command is `create-foliwake` (bin.ts); createProject is
// the same run without printing, for a wrapper that adds its own steps (the Foliwake CLI's `foliwake create`).
export {
  type CreateIO,
  type CreateResult,
  EXIT_CANCELLED,
  createProject,
  nextSteps,
  printResult,
  runCreate,
  shellWord,
} from './create.js';
export { type ProjectFile, projectFiles } from './files.js';
export {
  type CreateAnswers,
  type CreateRequest,
  CreateUsageError,
  DEFAULT_FOLDER,
  DEFAULT_TEMPLATE,
  TEMPLATES,
  type TemplateName,
  localSiteId,
} from './options.js';
export { LOCAL_SCHEMA_PATH, writeLocalSchema } from './schema.js';
export { projectProblems } from './validate.js';
