<?php

namespace GrotonSchool\BlackbaudToGoogleGroupSync\Blackbaud\SKY;

use Battis\LazySecrets\Secrets;
use Google\AppEngine\Api\Memcache\Memcached;
use League\OAuth2\Client\Token\AccessToken;
use GrotonSchool\OAuth2\Client\Provider\BlackbaudSKY;

class Token
{
    public static function get()
    {
        // connect to Memcached for cached tokens
        $cache = new Memcached();

        // Blackbaud OAuth2 client
        $sky = new BlackbaudSKY([
            BlackbaudSKY::ACCESS_KEY => Secrets::get(Bb_ACCESS_KEY),
            'clientId' => Secrets::get(Bb_CLIENT_ID),
            'clientSecret' => Secrets::get(Bb_CLIENT_SECRET),
            'redirectUri' => Secrets::get(Bb_REDIRECT_URL),
        ]);

        // acquire a Bb SKY API access token
        /** @var AccessToken|null $token **/
        $token = $cache->get(Bb_TOKEN);
        if (empty($token)) {
            // interactively acquire a new Bb access token
            if (false === isset($_GET[CODE])) {
                $authorizationUrl = $sky->getAuthorizationUrl();
                $_SESSION[OAuth2_STATE] = $sky->getState();
                $cache->set(Bb_TOKEN, null);
                header('Location: ' . $authorizationUrl);
                exit();
            } elseif (
                empty($_GET[STATE]) ||
                (isset($_SESSION[OAuth2_STATE]) &&
                    $_GET[STATE] !== $_SESSION[OAuth2_STATE])
            ) {
                if (isset($_SESSION[OAuth2_STATE])) {
                    unset($_SESSION[OAuth2_STATE]);
                }

                exit('Invalid state');
            } else {
                $token = $sky->getAccessToken(AUTHORIZATION_CODE, [
                    CODE => $_GET[CODE],
                ]);
                $cache->set(Bb_TOKEN, $token);
            }
        } elseif ($token->hasExpired()) {
            // use refresh token to get new Bb access token
            $newToken = $sky->getAccessToken(REFRESH_TOKEN, [
                REFRESH_TOKEN => $token->getRefreshToken(),
            ]);
            $cache->set(Bb_TOKEN, $newToken);
            $token = $newToken;
        } else {
            $sky->setAccessToken($token);
        }

        return $token;
    }
}
