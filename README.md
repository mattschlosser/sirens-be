# Backend for Sirens

Simple script to alert users to why they heard sirens (fire trucks, in particiular) in the City of Edmonton. 

This recivies a pushManager subscription from the front-end and periodically checks the Edmonton database for recent fire events. When an event later becomes available in the Edmonton database (usually within 24-48 hours), and the event occured within five minutes of when the user heard the sirens, the user will get a push notification with information about the event. 

A demo is available at [i-hear-sirens.mattschlosser.me](https://i-hear-sirens.mattschlosser.me)


## Database schema (sqlite)
```sql
CREATE TABLE notifiers (id integer primary key autoincrement, subscription json, timestamp timestamp default current_timestamp, notified integer default 0, endpoint text);
```

## Installation

Easy as 1, 2, 3. 

0. Create an SQLite3 file `subs.db' and add the table above.

1. Install web-push and generate vapid keys

    ```
    npm i -g web-push
    web-push generate-vapid-keys
    ```

2. Put these keys in the `.env` file

    ```
    VAPID_PUBLIC=YOUR_VAPID_PUBLIC_KEY_HERE
    VAPID_PRIVATE=YOUR_VAPID_PRIVATE_KEY_HERE
    EMAIL=user@example.com
    ```

3. Start the server

    ```
    npm run
    ```

