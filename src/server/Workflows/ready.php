<?php

use GrotonSchool\BlackbaudToGoogleGroupSync\Blackbaud\SKY;

require __DIR__ . '/../../../vendor/autoload.php';

session_start();
header('Content-Type', 'application/json');
echo json_encode([
    'ready' => !!SKY::getToken($_SERVER, $_SESSION, $_GET, false),
]);
