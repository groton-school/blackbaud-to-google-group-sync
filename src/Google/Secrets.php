<?php

namespace GrotonSchool\BlackbaudToGoogleGroupSync\Google;

use Google\Cloud\SecretManager\V1\SecretManagerServiceClient;

class Secrets {
    private static ?SecretManagerServiceClient $client = null;

    private function __construct()
    {}

    private static function getClient(): SecretManagerServiceClient
    {
        if (self::$client === null) {
            self::$client = new SecretManagerServiceClient();
        }
        return self::$client;
    }

    public static function get(string $key, $version = 'latest')
    {
        return self::getClient()->accessSecretVersion("projects/{$_ENV['GOOGLE_CLOUD_PROJECT']}/secrets/$key/versions/$version")->getPayload()->getData();
    }
}
