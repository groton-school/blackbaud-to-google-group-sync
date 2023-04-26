<?php

namespace GrotonSchool\BlackbaudToGoogleGroupSync\Blackbaud;

use Battis\LazySecrets\Secrets;
use Exception;
use Google\AppEngine\Api\Memcache\Memcached;
use League\OAuth2\Client\Token\AccessToken;
use GrotonSchool\OAuth2\Client\Provider\BlackbaudSKY;

class SKY
{
    // environment variables
    const Bb_ACCESS_KEY = 'BLACKBAUD_ACCESS_KEY';
    const Bb_CLIENT_ID = 'BLACKBAUD_CLIENT_ID';
    const Bb_CLIENT_SECRET = 'BLACKBAUD_CLIENT_SECRET';
    const Bb_REDIRECT_URL = 'BLACKBAUD_REDIRECT_URL';

    // keys
    const Bb_TOKEN = 'blackbaud_token';
    const OAuth2_STATE = 'oauth2_state';
    const Request_URI = 'request_uri';

    // oauth2 terms
    const CODE = 'code';
    const STATE = 'state';
    const AUTHORIZATION_CODE = 'authorization_code';
    const REFRESH_TOKEN = 'refresh_token';

    private static ?Memcached $cache = null;
    private static ?BlackbaudSKY $api = null;

    public static function api()
    {
        if (!self::$api) {
            self::$api = new BlackbaudSKY([
                BlackbaudSKY::ACCESS_KEY => Secrets::get(self::Bb_ACCESS_KEY),
                'clientId' => Secrets::get(self::Bb_CLIENT_ID),
                'clientSecret' => Secrets::get(self::Bb_CLIENT_SECRET),
                'redirectUri' => Secrets::get(self::Bb_REDIRECT_URL),
            ]);
        }
        return self::$api;
    }

    private static function cache()
    {
        if (!self::$cache) {
            self::$cache = new Memcached();
        }
        return self::$cache;
    }

    public static function getToken($server, $session, $get)
    {
        // Blackbaud OAuth2 client

        // acquire a Bb SKY API access token
        /** @var AccessToken|null $token **/
        $token = self::cache()->get(self::Bb_TOKEN);
        if (empty($token)) {
            // interactively acquire a new Bb access token
            if (false === isset($get[self::CODE])) {
                $authorizationUrl = self::api()->getAuthorizationUrl();
                $session[self::OAuth2_STATE] = self::api()->getState();
                self::cache()->set(self::Bb_TOKEN, null);
                self::cache()->set(self::Request_URI, $server['REQUEST_URI']);
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

                throw new Exception(json_encode(['error' => 'invalid state']));
            } else {
                $token = self::api()->getAccessToken(self::AUTHORIZATION_CODE, [
                    self::CODE => $get[self::CODE],
                ]);
                self::cache()->set(self::Bb_TOKEN, $token);
            }
        } elseif ($token->hasExpired()) {
            // use refresh token to get new Bb access token
            $newToken = self::$api->getAccessToken(self::REFRESH_TOKEN, [
                self::REFRESH_TOKEN => $token->getRefreshToken(),
            ]);
            self::cache()->set(self::Bb_TOKEN, $newToken);
            $token = $newToken;
        } else {
            self::api()->setAccessToken($token);
        }

        return $token;
    }

    public static function handleRedirect($server, $session, $get)
    {
        self::getToken($server, $session, $get);
        $uri = self::cache()->get(self::Request_URI) ?? '/';
        header("Location: $uri");
    }
}
