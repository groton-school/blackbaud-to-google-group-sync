<?php

namespace GrotonSchool\BlackbaudToGoogleGroupSync\Google;

use Battis\LazySecrets\Cache;
use Exception;
use Google\Client;

class Google
{
    const Google_DELEGATED_ADMIN = 'GOOGLE_DELEGATED_ADMIN';
    const Google_CREDENTIALS = 'GOOGLE_CREDENTIALS';

    private static ?Client $api = null;
    private static ?string $appName = null;

    public static function init(string $appName)
    {
        self::$appName = $appName;
    }

    public static function api()
    {
        if (!self::$api) {
            if (!self::$appName) {
                throw new Exception(
                    json_encode([
                        'error' => 'Google API client not initialized',
                    ])
                );
            }
            self::$api = new Client();
            $secrets = new Cache();
            self::$api->setApplicationName(self::$appName);
            self::$api->setAuthConfig(
                $secrets->get(self::Google_CREDENTIALS, true)
            );
            self::$api->setSubject($secrets->get(self::Google_DELEGATED_ADMIN));
            self::$api->setScopes([
                'https://www.googleapis.com/auth/admin.directory.group',
            ]);
            self::$api->setAccessType('offline');
        }
        return self::$api;
    }
}
