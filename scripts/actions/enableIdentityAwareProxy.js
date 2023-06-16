import { input } from '@inquirer/prompts';
import path from 'path';
import gcloud from '../lib/gcloud.js';
import { options } from '../lib/options.js';
import validators from '../lib/validators.js';

export default async function enableIdentityAwareProxy({
  projectName,
  supportEmail = undefined,
  users = undefined
}) {
  gcloud.invoke(`services enable iap.googleapis.com`);
  const project = gcloud.invoke(
    `projects list --filter=projectId=${gcloud.getProjectId()}`,
    false
  )[0];
  let brand = gcloud.invoke(
    `iap oauth-brands list --filter=name=projects/${project.projectNumber}/brands/${project.projectNumber}`
  );
  brand = brand && brand.shift();
  if (!brand) {
    supportEmail =
      supportEmail ||
      (await input({
        message: options.supportEmail.description,
        validate: validators.email,
        default: supportEmail
      }));
    brand = gcloud.invoke(
      `iap oauth-brands create --application_title="${projectName}" --support_email=${supportEmail}`
    ).name;
  }
  let oauth = gcloud.invoke(`iap oauth-clients list ${brand.name}`);
  oauth = oauth && oauth.shift();
  if (!oauth) {
    oauth = gcloud.invoke(
      `iap oauth-clients create ${brand} --display_name=IAP-App-Engine-app`
    );
  }
  gcloud.invoke(
    `iap web enable --resource-type=app-engine --oauth2-client-id=${path.basename(
      oauth.name
    )} --oauth2-client-secret=${oauth.secret}`
  );
  users = (
    await input({
      message: options.users.description,
      validate: (value) =>
        value
          .split(',')
          .map((val) => val.trim())
          .reduce(
            (cond, val) =>
              cond && validators.nonEmpty(val) && validators.email(val),
            true
          ) || 'all entries must be email addresses',
      default: users
    })
  )
    .split(',')
    .map((value) => value.trim());
  users.forEach((user) =>
    gcloud.invoke(
      `projects add-iam-policy-binding ${gcloud.getProjectId()} --member="user:${user}" --role="roles/iap.httpsResourceAccessor"`,
      false
    )
  );
}
