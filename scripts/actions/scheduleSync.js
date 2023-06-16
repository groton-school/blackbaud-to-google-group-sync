import gcloud from '../lib/gcloud.js';

export default async function scheduleSync({
  scheduleName,
  scheduleCron,
  location
}) {
  gcloud.invoke(`services enable cloudscheduler.googleapis.com`);

  let schedule = gcloud.invoke(
    `scheduler jobs list --filter=appEngineHttpTarget.relativeUri=/sync --location=${location}`
  );
  schedule = schedule && schedule.shift();
  if (schedule) {
    gcloud.invoke(
      `scheduler jobs update app-engine ${schedule.name} --schedule="${scheduleCron}"`
    );
  } else {
    gcloud.invoke(
      `scheduler jobs create app-engine ${scheduleName} --schedule="${scheduleCron}" --relative-url="/sync"`
    );
  }
}
