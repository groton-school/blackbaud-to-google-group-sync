import * as Messages from '../Messages';
import './styles.scss';

type SyncResponse = {
  id: string;
  message: string;
  status: string;
  error?: string;
};

type ProgressId = string;
type ProgressResponse = {
  id: ProgressId;
  value?: number;
  max?: number;
  status: string | 'complete';
  children?: { [id: ProgressId]: ProgressResponse };
};

const container = document.querySelector('#progress') as HTMLDivElement;
const progressBars: { [id: ProgressId]: HTMLDivElement } = {};
let spinner: HTMLDivElement;
let completionCallback: undefined | (() => void);

export function display(
  { status, error }: SyncResponse,
  callback?: () => void
) {
  callback && (completionCallback = callback);
  if (error) {
    Messages.add({
      message: `<strong>Error:</strong ${error}`,
      dismissable: true,
      variant: 'danger'
    });
    return;
  }
  spinner = document.createElement('div');
  spinner.className = 'progress';
  spinner.role = 'progressbar';
  const bar = document.createElement('div');
  bar.className =
    'progress-bar progress-bar-striped progress-bar-animated overflow-visible';
  bar.style.width = '100%';
  spinner.append(bar);
  container.append(spinner);
  poll(status);
}

function create({ id, children = {} }: ProgressResponse) {
  const elt: HTMLDivElement = document.createElement('div');
  elt.className = 'progress';
  id && (elt.id = id);
  elt.role = 'progressbar';
  elt.ariaValueMin = '0';
  const bar: HTMLDivElement = document.createElement('div');
  bar.className =
    'progress-bar progress-bar-striped progress-bar-animated overflow-visible';
  bar.style.width = '100%';
  elt.append(bar);
  id && (progressBars[id] = elt);
  container.append(elt);
  for (const childId in children) {
    create(children[childId]);
  }
}

function update(progress: ProgressResponse) {
  const { id, status, value, max, children } = progress;
  if (!progressBars[id]) {
    create(progress);
  }
  const elt = progressBars[id];
  elt.dataset.live = 'yes';
  max && (elt.ariaValueMax = max.toString());
  if (value !== undefined) {
    elt.ariaValueNow = value.toString();
  } else {
    elt.removeAttribute('aria-value-now');
  }
  if (max !== undefined) {
    elt.ariaValueMax = max.toString();
  } else {
    elt.removeAttribute('aria-value-max');
  }
  const bar = elt.firstElementChild as HTMLDivElement;
  if (value !== undefined && max) {
    bar.style.width = `${(value * 100) / max}%`;
  } else {
    bar.style.width = '0%';
  }
  if (status) {
    bar.innerText = status;
  } else {
    bar.innerText = '';
  }
  for (const childId in children) {
    update(children[childId]);
  }
}

function prep() {
  for (const id in progressBars) {
    progressBars[id].dataset.live = 'no';
  }
}

function prune() {
  for (const id in progressBars) {
    if (progressBars[id].dataset.live == 'no') {
      progressBars[id].remove();
    }
  }
}

function poll(statusEndpoint: string, progress?: ProgressResponse) {
  if (progress) {
    spinner?.remove();
    prep();
    update(progress);
    prune();
  }
  if ((progress === undefined || progress.status) !== 'complete') {
    fetch(statusEndpoint)
      .then((response) => response.json())
      .then((progress: ProgressResponse) => poll(statusEndpoint, progress));
  } else {
    Messages.add({
      message: `<strong>Sync complete.</strong> ${Object.values(progressBars)[0].ariaValueMax
        } groups synced from Blackbaud to Google at ${new Date().toLocaleString()}.`,
      dismissable: true,
      variant: 'success'
    });
    container.innerHTML = '';
    if (completionCallback) {
      completionCallback();
      completionCallback = undefined;
    }
  }
}
