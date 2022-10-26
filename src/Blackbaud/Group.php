<?php

namespace GrotonSchool\BlackbaudToGoogleGroupSync\Blackbaud;

class Group
{
    private string $id;

    private string $name;

    private array $params = [];

    private array $data;

    public function __construct(array $data)
    {
        $this->name = $data["name"];
        $this->data = $data;
        if (preg_match("/(\{.*\})/", $data["description"], $matches)) {
            $this->params = json_decode($matches[1], true);
        }
    }

    public function getId(): string
    {
        return $this->id;
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function getParamEmail()
    {
        return $this->params["email"] ?: false;
    }
}
