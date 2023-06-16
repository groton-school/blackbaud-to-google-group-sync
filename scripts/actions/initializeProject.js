import { input } from '@inquirer/prompts';
import gcloud from '../lib/gcloud.js';
import { options } from '../lib/options.js';
import validators from '../lib/validators.js';

export default async function initializeProject({
  projectName,
  projectId = undefined
}) {
  projectName = await input({
    message: options.name.description,
    validate: validators.maxLength.bind(null, 30),
    default: projectName
  });
  gcloud.setProjectId(
    await input({
      message: options.project.description,
      validate: validators.maxLength.bind(null, 30),
      default: projectId || gcloud.getProjectId()
    })
  );
  return projectName;
}
