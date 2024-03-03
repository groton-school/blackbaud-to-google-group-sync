<?php

require __DIR__ . '/../../../vendor/autoload.php';

use Battis\LazySecrets\Cache;

$secrets = new Cache($_ENV['GOOGLE_CLOUD_PROJECT']);
$secrets->delete('BLACKBAUD_API_TOKEN', json_encode(null));

echo json_encode(['status' => 'deauthorized']);
