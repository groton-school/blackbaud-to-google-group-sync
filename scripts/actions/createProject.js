import { confirm } from '@inquirer/prompts';
import cli from '../lib/cli.js';
import gcloud from '../lib/gcloud.js';

export default async function createProject({ projectName }) {
  const [project] = gcloud.invoke(
    `projects list --filter=projectId=${gcloud.getProjectId()}`
  );
  if (project) {
    if (
      !(await confirm({
        message: `(Re)configure existing project ${cli.value(
          project.projectId
        )}?`
      }))
    ) {
      throw new Error('must create or reuse project');
    }
  } else {
    let response = gcloud.invoke(
      `projects create --name="${projectName}" ${gcloud.getProjectId()}`,
      false
    );
    if (/error/i.test(response)) {
      throw new Error(response);
    }
  }
}
