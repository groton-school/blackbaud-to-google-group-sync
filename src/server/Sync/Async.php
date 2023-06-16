<?php

namespace GrotonSchool\BlackbaudToGoogleGroupSync\Sync;

class Async
{
    public static function start(
        callable $output,
        string $contentType = 'application/json'
    ) {
        // https://stackoverflow.com/a/15273676
        ignore_user_abort(true);
        set_time_limit(0);
        if (session_id()) {
            session_write_close();
        }
        @ob_end_clean();
        ob_start();

        call_user_func($output);

        header("Content-Type: $contentType");
        header('Content-Length: ' . ob_get_length());
        header('Connection: close');
        ob_end_flush();
        @ob_flush();
        flush();
        fastcgi_finish_request();
    }

    public static function result(callable $result)
    {
        call_user_func($result);
        die();
    }

    public static function error(callable $error, int $code = 1)
    {
        call_user_func($error);
        die($code);
    }
}
