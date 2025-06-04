<?php

namespace GrotonSchool\BlackbaudToGoogleGroupSync\Blackbaud;

use Exception;
use Google\AppEngine\Api\Memcache\Memcached;
use Battis\LazySecrets\Cache;
use League\OAuth2\Client\Token\AccessToken;
use GrotonSchool\OAuth2\Client\Provider\BlackbaudSKY;

class SKY
{
    // environment variables
    public const Bb_ACCESS_KEY = 'BLACKBAUD_ACCESS_KEY';
    public const Bb_CLIENT_ID = 'BLACKBAUD_CLIENT_ID';
    public const Bb_CLIENT_SECRET = 'BLACKBAUD_CLIENT_SECRET';
    public const Bb_REDIRECT_URL = 'BLACKBAUD_REDIRECT_URL';
    public const Bb_TOKEN = 'BLACKBAUD_API_TOKEN';

    // keys
    public const OAuth2_STATE = 'oauth2_state';
    public const Request_URI = 'request_uri';

    // oauth2 terms
    public const CODE = 'code';
    public const STATE = 'state';
    public const AUTHORIZATION_CODE = 'authorization_code';
    public const REFRESH_TOKEN = 'refresh_token';

    private static ?Memcached $cache = null;
    private static ?BlackbaudSKY $api = null;
    private static ?Cache $secrets = null;

    private const SEMAPHORE = 'semaphore';

    public static function api()
    {
        if (!self::$api) {
            self::$api = new BlackbaudSKY([
                BlackbaudSKY::ACCESS_KEY => self::secrets()->get(
                    self::Bb_ACCESS_KEY
                ),
                'clientId' => self::secrets()->get(self::Bb_CLIENT_ID),
                'clientSecret' => self::secrets()->get(self::Bb_CLIENT_SECRET),
                'redirectUri' => self::secrets()->get(self::Bb_REDIRECT_URL),
            ]);
        }
        return self::$api;
    }

    private static function secrets()
    {
        if (!self::$secrets) {
            self::$secrets = new Cache($_ENV['GOOGLE_CLOUD_PROJECT']);
        }
        return self::$secrets;
    }

    private static function cache()
    {
        if (!self::$cache) {
            self::$cache = new Memcached();
        }
        return self::$cache;
    }

    public static function getToken(
        $server,
        $session,
        $get,
        $interactive = true
    ) {
        while (self::cache()->get(self::SEMAPHORE)) {
            usleep(100);
        }
        self::cache()->set(self::SEMAPHORE, 'mine', 30);
        $cachedToken = self::secrets()->get(self::Bb_TOKEN, true);
        $token = $cachedToken ? new AccessToken($cachedToken) : null;

        // acquire a Bb SKY API access token
        if (empty($token)) {
            if ($interactive) {
                // interactively acquire a new Bb access token
                if (false === isset($get[self::CODE])) {
                    $authorizationUrl = self::api()->getAuthorizationUrl();
                    $session[self::OAuth2_STATE] = self::api()->getState();
                    // TODO wipe existing token?
                    self::cache()->set(
                        self::Request_URI,
                        $server['REQUEST_URI']
                    );
                    header("Location: $authorizationUrl");
                    exit();
                } elseif (
                    empty($get[self::STATE]) ||
                    (isset($session[self::OAuth2_STATE]) &&
                        $get[self::STATE] !== $session[self::OAuth2_STATE])
                ) {
                    if (isset($session[self::OAuth2_STATE])) {
                        unset($session[self::OAuth2_STATE]);
                    }

                    throw new Exception(
                        json_encode(['error' => 'invalid state'])
                    );
                } else {
                    $token = self::api()->getAccessToken(
                        self::AUTHORIZATION_CODE,
                        [
                            self::CODE => $get[self::CODE],
                        ]
                    );
                    self::secrets()->set(self::Bb_TOKEN, $token, 1);
                }
            } else {
                return null;
            }
        } elseif ($token->hasExpired()) {
            // use refresh token to get new Bb access token
            $newToken = self::api()->getAccessToken(self::REFRESH_TOKEN, [
                self::REFRESH_TOKEN => $token->getRefreshToken(),
            ]);
            // FIXME need to handle _not_ being able to refresh!
            self::secrets()->set(self::Bb_TOKEN, $newToken, 1);
            $token = $newToken;
        } else {
            self::api()->setAccessToken($token);
        }
        self::cache()->delete(self::SEMAPHORE);

        return $token;
    }

    public static function handleRedirect($server, $session, $get)
    {
        self::getToken($server, $session, $get);
        $uri = self::cache()->get(self::Request_URI) ?? '/';
        header("Location: $uri");
    }
}
