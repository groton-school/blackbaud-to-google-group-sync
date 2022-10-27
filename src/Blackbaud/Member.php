<?php

namespace GrotonSchool\BlackbaudToGoogleGroupSync\Blackbaud;

class Member
{
    private string $email = "";

    private array $data;

    public function __construct(array $data)
    {
        $this->data = $data;
        foreach ($data["columns"] as $col) {
            switch ($col["name"]) {
                case "E-Mail":
                    $this->email = $col["value"];
                    break;
            }
        }
    }

    public function getEmail(): string
    {
        return $this->email;
    }
}
