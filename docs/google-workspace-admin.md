# Google Workspace Admin

Instructions for delegating Google Group management permissions to the app

1. In Google Workspace Admin, go to Security/Access and data control/API controls and [Manage Domain Wide Delegation](https://admin.google.com/ac/owl/domainwidedelegation)
2. Add a new API client
3. The Client ID is the Service Account Unique ID provided by the setup script
4. The OAuth scope is `https://www.googleapis.com/auth/admin.directory.group`
5. Authorize
