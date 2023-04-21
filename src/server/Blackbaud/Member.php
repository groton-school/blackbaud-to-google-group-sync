<?php

namespace GrotonSchool\BlackbaudToGoogleGroupSync\Blackbaud;

use Exception;

class Member
{
    private string $email = '';

    private array $data;

    public function __construct(array $data)
    {
        $this->data = $data;
        $email = false;
        foreach ($data['columns'] as $col) {
            switch ($col['name']) {
                case 'E-Mail':
                    if (key_exists('value', $col) && !empty($col['value'])) {
                        $this->email = $col['value'];
                        $email = true;
                    }
                    break;
            }
        }
        if (!$email) {
            throw new Exception('missing email');
        }
    }

    public function getEmail(): string
    {
        return $this->email;
    }
}
