<?php

use Google\Client;
use Google\Service\Directory;

require_once __DIR__ . "/../vendor/autoload.php";

$delegatedAdmin = $_ENV["GOOGLE_DELEGATED_ADMIN"];
$appName = "Blackbaud to Google Group Sync";
$scopes = ["https://www.googleapis.com/auth/admin.directory.group"];
$authJSON = json_decode($_ENV["GOOGLE_CREDENTIALS"], true);

$client = new Client();
$client->setApplicationName($appName);
$client->setAuthConfig($authJSON);
$client->setSubject($delegatedAdmin);
$client->setScopes($scopes);
$client->setAccessType("offline");

$directory = new Directory($client);

try {
    print_r(
        $directory->groups->listGroups([
            "domain" => "groton.org",
            "maxResults" => 10,
        ])
    );
} catch (Exception $e) {
    print_r($e->getMessage());
}
