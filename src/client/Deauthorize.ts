export default function Deauthorize() {
  fetch(`${URL}/deauthorize`)
    .then((response) => response.json())
    .then(() => window.location.reload());
}
