import child from 'child_process';
import { rword } from 'rword';
import lib from './lib.js';

rword.load('big');

function createProjectId() {
  const word1 = rword.generate(1, {
    length: 4 + Math.floor(Math.random() * 7)
  });
  const word2 = rword.generate(1, {
    length: 4 + Math.floor(Math.random() * (30 - 8 - word1.length - 4))
  });
  return `${word1}-${word2}-${Math.floor(99999 + Math.random() * 900001)}`;
}

let projectId;
let flags;
let flagsWithProject;
function setProjectId(id, overrideFlags = '--quiet --format=json') {
  projectId = id;
  flags = overrideFlags;
  flagsWithProject = `${flags} --project=${projectId}`;
}
setProjectId(createProjectId());
let betaInstalled =
  invoke('components list --filter=id=beta', false)[0].state.name !=
  'Not Installed';

function invoke(command, withProjectId = true) {
  let actualFlags = flagsWithProject;
  if (withProjectId === null) {
    actualFlags = '';
  } else if (actualFlags === false) {
    actualFlags = flags;
  }
  const result = child.execSync(`gcloud ${command} ${actualFlags} `);
  try {
    return JSON.parse(result);
  } catch (e) {
    return result;
  }
}

function invokeBeta(command, withProjectId = true) {
  if (!betaInstalled) {
    console.log('Installing gcloud beta component');
    invoke('components install beta', false);
    betaInstalled = true;
  }
  return invoke(`beta ${command}`, withProjectId);
}

function createSecret(name, value, isPath = false) {
  if (isPath) {
    invoke(`secrets create ${name} --data-file=${value}`);
  } else {
    lib.exec(
      `echo "${value}" | gcloud secrets create ${name} --data-file=- ${flagsWithProject}`
    );
  }
}

export default {
  createProjectId,
  setProjectId,
  getProjectId: () => projectId,
  getFlags: () => flags,
  getFlagsWithProject: () => flagsWithProject,
  invoke,
  invokeBeta,
  secrets: {
    create: createSecret
  }
};
