<?php

use GrotonSchool\BlackbaudToGoogleGroupSync\Blackbaud\SKY;

require __DIR__ . '/../../../vendor/autoload.php';

session_start();

SKY::handleRedirect($_SERVER, $_SESSION, $_GET);
