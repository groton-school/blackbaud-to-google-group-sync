const content = document.querySelector('#content');
content &&
    (content.innerHTML = `
<h1>Blackbaud to Google Groups Sync</h1>
<ul>
    <li>
        <a href="sync.php">Sync</a>
    </li>
    <li>
        <a href="clear-cache.php">Clear Cache</a>
    </li>
</ul>
`);
