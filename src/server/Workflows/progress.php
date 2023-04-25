<?php

use Google\AppEngine\Api\Memcache\Memcached;

require __DIR__ . '/../../../vendor/autoload.php';

header('Content-Type', 'application/json');

$id = $_GET['id'] ?? false;
if ($id) {
    $cache = new Memcached();
    $progress = $cache->get($id);
    if ($progress) {
        echo $progress;
        exit();
    }
}
echo json_encode(['error' => 'unknown id']);
