import './styles.scss';

type SyncResponse = {
  id: string;
  message: string;
  status: string;
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

export const display = ({ status }: SyncResponse) => poll(status);

function create({ id, children = {} }: ProgressResponse) {
  const elt: HTMLDivElement = document.createElement('div');
  elt.className = 'progress';
  id && (elt.id = id);
  elt.role = 'progressbar';
  const bar: HTMLDivElement = document.createElement('div');
  bar.className = 'progress-bar overflow-visible';
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
  value !== undefined && (elt.ariaValueNow = value.toString());
  (value !== undefined || max) && (elt.ariaValueMin = '0');
  value !== undefined &&
    max &&
    ((elt.firstElementChild as HTMLDivElement).style.width = `${(value * 100) / max
      }%`);
  status && ((elt.firstElementChild as HTMLDivElement).innerText = status);
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
  prep();
  progress && update(progress);
  prune();
  if ((progress === undefined || progress.status) !== 'complete') {
    fetch(statusEndpoint)
      .then((response) => response.json())
      .then((progress: ProgressResponse) => poll(statusEndpoint, progress));
  }
}
