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
  "update-name": boolean, // optional, defaults to `true`
  "dangerously-purge-google-group-owners": boolean // optional, defaults to `false`
}
```
