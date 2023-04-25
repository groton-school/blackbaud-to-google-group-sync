<?php

$endpoint = @parse_url($_SERVER['REQUEST_URI'])['path'];
if (is_file(__DIR__ . $endpoint)) {
    require __DIR__ . $endpoint;
} elseif (
    is_readable(__DIR__ . '/../src/server/Workflows' . $endpoint . '.php')
) {
    require __DIR__ . '/../src/server/Workflows' . $endpoint . '.php';
} elseif (is_file(__DIR__ . $endpoint . '/index.html')) {
    require __DIR__ . $endpoint . '/index.html';
} else {
    http_response_code(404);
    exit('Not Found');
}
