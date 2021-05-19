const express = require('express');
const cors = require('cors');
const chalk = require('chalk')
const app = express();
const sqlite3 = require('sqlite3');
const bodyParser = require('body-parser');
const { open } = require('sqlite');
const webpush = require('web-push')
const { config } = require('dotenv');
const { default: axios } = require('axios');
config();
app.use(cors());
app.use(bodyParser.json())

const vapidKeys = {
    publicKey: process.env.VAPID_PUBLIC,
    privateKey: process.env.VAPID_PRIVATE
}

console.log(vapidKeys);

webpush.setVapidDetails(
    `mailto:${process.env.EMAIL}`,
    vapidKeys.publicKey,
    vapidKeys.privateKey
)

let db; 
open({
    filename: 'subs.db', 
    driver: sqlite3.Database
}).then(con => {
    db = con;
    console.log(chalk.yellow("Database up"))
} );
app.post('/save-subscription', async (req, res) => {
    console.log(req.body);
    let i = await db.run("INSERT INTO notifiers (subscription) values (?)", JSON.stringify(req.body));
    console.log(i);
    res.json({message: 'success'})
});

process.on('SIGINT', () => {
    console.log("Shutting down");
    db.close();
    process.exit(0);
})

/**
 * Returns a list of people who want to be notified, given a particular time
 */
async function getNearbyClicks(time) {
    return db.all("SELECT abs(strftime('%s', timestamp) - ?) as diff,  notifiers.* FROM notifiers where (strftime('%s', timestamp) - ?) < 300 and notified = 0", [time, time]);
}

// once a day, pull the data from edmoton, loop through
run = () => {
    axios.get('https://data.edmonton.ca/resource/f2hf-du2d.json')
    // .then
    .then(async res => {

        let validDates = [];
        let lastd
        for (let i of res.data) {
            let d = new Date(`${i.dispatch_date} ${i.dispatch_time}`);
            if (lastd) {
                console.log(d - lastd);
            }
            lastd = d
            if (!isNaN(d)) {
                validDates.push(i);
                i.date = d;
            }
        }
        // we have a list of dates now. 
        validDates.sort((a,b) => a.date - b.date);
        // now we want to search for events within 5 minutes and notify
        for (let date of validDates) {
            let subscriptions = await getNearbyClicks(date.date.getTime()/1000);
            console.log(subscriptions);
            for (let row of subscriptions) {
                subscription = JSON.parse(row.subscription);
                if (subscription) {
                    try {
                        await webpush.sendNotification(subscription, JSON.stringify(date))
                        await db.run("UPDATE notifiers SET notified = 1 where id = ?", row.id);
                        console.log(row);
                    } catch (e) {
			await db.run("UPDATE notifiers sET notified = 2 where id = ?", row.id);
                        console.error(e);
                    }
                } else {
                    console.error(chalk.red("Something went wrong. Subscription was invalid"));
                }
            }
        }
    })
}
setInterval(run, 1 * 60 * 60 * 1000)
run()
app.listen(4000, () => console.log(chalk.greenBright("listening on 4ooo")));
