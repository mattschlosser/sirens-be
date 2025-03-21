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

webpush.setVapidDetails(
    `mailto:${process.env.EMAIL}`,
    vapidKeys.publicKey,
    vapidKeys.privateKey
)

/** @type {import("sqlite").Database} */
let db; 
open({
    filename: 'db/subs.db', 
    driver: sqlite3.Database
}).then(async con => {
    db = con;
    await db.run("CREATE TABLE IF NOT EXISTS notifiers (id integer primary key autoincrement, subscription json, timestamp timestamp default current_timestamp, notified integer default 0, endpoint text);");
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
});

/**
 * Returns a list of people who want to be notified, given a particular time
 */
async function getNearbyClicks(time) {
    return db.all("SELECT abs(strftime('%s', timestamp) - ?) as diff,  notifiers.* FROM notifiers where (strftime('%s', timestamp) - ?) < 300 and notified = 0", [time, time]);
}

/**
 * Given a list of items with reasons, filters out any reasons with invalid dates. 
 * 
 * We also sort the dates by 
 * 
 * @param {{dispatch_date: string, dispatch_time: string}[]} reasons 
 */
function filterValidDatesFromReasons(reasons) {
    const validDates = [];
    for (const i of reasons) {
        const d = new Date(`${i.dispatch_date} ${i.dispatch_time}`);
        if (!isNaN(d)) {
            validDates.push(i);
            i.date = d;
        }
    }
    return validDates;
}

/**
 * Given a date, checks the date for reasons
 * 
 * For each reason, we check the database if there is a 'click' within five minutes of that reason
 * and send a notification to the user who clicked.
 * 
 * @param {Date} date
 */
async function checkDateForReasons(date) {
    const year = date.getFullYear();
    const month = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][date.getMonth()]
    const day = ("0" + date.getDate()).slice(-2);
    // get the resource
    const url = `https://data.edmonton.ca/resource/7hsn-idqi.json?dispatch_date=${day}-${month}-${year}`;
    const res = await axios.get(url)
    // we have a list of dates now. 
    const validDates = filterValidDatesFromReasons(res.data);
    validDates.sort((a,b) => a.date - b.date);
    // now we want to search for events within 5 minutes and notify
    for (let date of validDates) {
        let subscriptions = await getNearbyClicks(date.date.getTime()/1000);
        for (let row of subscriptions) {
            let subscription = JSON.parse(row.subscription);
            if (subscription) {
                try {
                    await webpush.sendNotification(subscription, JSON.stringify(date))
                    await db.run("UPDATE notifiers SET notified = 1, reason = ?  where id = ?", [JSON.stringify(date), row.id]);
                } catch (e) {
                    await db.run("UPDATE notifiers sET notified = 2 where id = ?", row.id);
                    console.error(e);
                }
            } else {
                console.error(chalk.red("Something went wrong. Subscription was invalid"));
            }
        }
     }
}

// once a day, pull the data from edmonton, loop through
run = async () => {
    let date = new Date();
    // wait at least two days to ensure data is present
    date.setDate(date.getDate() - 1);
    checkDateForReasons(date);
}
const interval = setInterval(run, 1 * 60 * 60 * 1000)
run()
const server = app.listen(4000, () => console.log(chalk.greenBright("listening on 4ooo")));

/**
 * Stops all services
 */
const shutdown = async () => {
    console.log("Shutting down");
    await db.close();
    server.close((err) => {
        if (err) {
            console.error(err);
        }
    });
    clearInterval(interval);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
