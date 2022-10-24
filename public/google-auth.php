<?php

use Google\Auth\CredentialsLoader;
use Google\Auth\Middleware\AuthTokenMiddleware;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\ClientException;
use GuzzleHttp\HandlerStack;

require __DIR__ . "/../vendor/autoload.php";

$scopes = ["https://www.googleapis.com/auth/admin.directory.group"];

$creds = CredentialsLoader::makeCredentials(
    $scopes,
    json_decode($_ENV["GOOGLE_CREDENTIALS"], true)
);

$middleware = new AuthTokenMiddleware($creds);
$stack = HandlerStack::create();
$stack->push($middleware);

$client = new Client([
    "handler" => $stack,
    "auth" => "google_auth",
]);

echo "<pre>";
try {
    $response = $client->get(
        "https://admin.googleapis.com/admin/directory/v1/groups?domain=groton.org"
    );
    print_r($response->getBody()->getContents());
} catch (ClientException $e) {
    print_r(
        $e
            ->getResponse()
            ->getBody()
            ->getContents()
    );
}
