<?php

require __DIR__ . '/../../../vendor/autoload.php';

use Battis\LazySecrets\Secrets;

Secrets::set('BLACKBAUD_API_TOKEN', json_encode(null));

echo json_encode(['status' => 'deauthorized']);
