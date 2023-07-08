# Blackbaud Advanced List Configuration

For the contents (members) of an advanced list to be synced successfully out of Blackbaud and into a Google Group, the following conditions must be met:

1. Either the user who authentorized the script to Blackbaud or the `Platform Manager` role must have access to the list.
2. The list must have a column named `E-mail`.
3. The list must be categorized as `Blackbaud to Google Group Sync`.
4. The description of the list must contain JSON-encoded parameters to the script.

## JSON Parameters

```js
{
  "email": string, // valid email address for existing Google group in the workspace
  "map-email-to": string // optional label of email column, defaults to "E-Mail"
  "update-name": boolean, // optional, defaults to `true`
  "delivery-settings": "ALL_MAIL"|"DAILY"|"DIGEST"|"DISABLED"|"NONE", // optional, defaults to "ALL_MAIL"
  "dangerously-purge-google-group-owners": boolean // optional, defaults to `false`
}
```

`delivery-settings` values determined by Google Admin SDK API [Directory Member endpoint](https://developers.google.com/admin-sdk/directory/reference/rest/v1/members#Member).
