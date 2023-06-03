import * as Progress from './Progress';

export default function Sync() {
  const [event] = arguments;
  (event.target as HTMLButtonElement).disabled = true;
  fetch(`${process.env.URL}/sync`)
    .then((response) => response.json())
    .then((progress) =>
      Progress.display(progress, () => {
        (event.target as HTMLButtonElement).disabled = false;
      })
    );
}
