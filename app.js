const express = require('express');
const cors = require('cors');
const chalk = require('chalk')
const app = express();
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const bodyParser = require('body-parser');
const webpush = require('web-push')
const { config } = require('dotenv');
const { default: axios } = require('axios');
config();
app.use(cors());
app.use(bodyParser.json())
app.use(function (err, req, res, next) {
  console.error(err.stack)
  res.status(500).send('Something broke!')
})
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

app.get('/', (req, res) => {
  res.send("Hello World!");
});
app.post('/save-subscription', async (req, res) => {
    console.log(req.body);
    try {
        let i = await db.run("INSERT INTO notifiers (subscription, endpoint) values (?, ?)", [JSON.stringify(req.body), req.body.endpoint]);
        console.log(i);
        res.json({message: 'success'})
    } catch(e) {
        console.error(e);
    }
});
app.post('/recent', async (req, res) => {
    let i = await db.all("SELECT * FROM notifiers where endpoint = ? order by id desc", req.body.endpoint);
    for (let j of i) {
      if (j.reason) {
         j.reason = JSON.parse(j.reason);
      }
    }
    res.json(i);
})
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

// once a day, pull the data from edmonton, loop through
run = () => {
    let date = new Date();
    // wait at least two days to ensure data is present
    date.setDate(date.getDate() - 1);
    let year = date.getFullYear();
    let month = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][date.getMonth()]
    let day = ("0" + date.getDate()).slice(-2);
    // get the resource
    let url = `https://data.edmonton.ca/resource/7hsn-idqi.json?dispatch_date=${day}-${month}-${year}`;
    axios.get(url)
    // .then
    .then(async res => {
        let validDates = [];
        let lastd
        for (let i of res.data) {
            let d = new Date(`${i.dispatch_date} ${i.dispatch_time}`);
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
            // console.log(subscriptions);
            for (let row of subscriptions) {
                subscription = JSON.parse(row.subscription);
                if (subscription) {
                    try {
                        await webpush.sendNotification(subscription, JSON.stringify(date))
                        await db.run("UPDATE notifiers SET notified = 1, reason = ?  where id = ?", [JSON.stringify(date), row.id]);
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
