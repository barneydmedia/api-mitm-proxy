const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const moment = require('moment');
const rp = require('request-promise-native');
const sqlite = require('sqlite');
const SQL = require('sql-template-strings');
let db;

async function main() {
    db = await sqlite.open('./database.sqlite', { Promise });
    console.log('DB connected');
    db.run(`
        CREATE TABLE IF NOT EXISTS url_cache (
            id INTEGER PRIMARY KEY, 
            url TEXT,
            response TEXT,
            created TEXT,
            updated TEXT
        );
    `);
    console.log('Migration Done');
}
main();

// var indexRouter = require('./routes/index');

var app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

process.on('unhandledRejection', (e, p) => {
    console.debug(e,p);
});

function blacklistHeaders(headers) {
    delete headers.host;
    delete headers['postman-token'];
    delete headers.remoteurl;
    delete headers['accept-encoding'];

    return headers;
}

app.use('/', async (req, res) => {
    const defaultHost = 'business.untappd.com';
    const remoteUrl = `https://${req.headers.remoteurl || defaultHost}${req.originalUrl}`;
    const storedCount = (await db.get(SQL`SELECT COUNT(url) as url_count FROM url_cache WHERE url = ${remoteUrl};`)).url_count;
    const now = moment().format('YYYY-MM-DDTHH-mm-ss');

    if (!storedCount) {
        let error = false;
        const headers = blacklistHeaders({...req.headers});
        const remReq = await rp({
            uri: remoteUrl,
            method: req.method,
            cache: 'no-cache',
            headers,
        }).catch(err => {
            debugger;
            res.status(err.statusCode).json(err)
            error = true;
        });

        if (error) return;
        console.log(`Inserting new response from ${remoteUrl} at ${now}`);
        await db.run(SQL`INSERT INTO url_cache (url, response, created, updated) VALUES (${remoteUrl}, ${remReq}, ${now}, ${now});`);
    } else {
        console.log(`Retrieving response from cache for ${remoteUrl} at ${now}`);
    }
    const storedRes = await db.get(SQL`SELECT response FROM url_cache WHERE url = ${remoteUrl};`);

    res.status(200).json(JSON.parse(storedRes.response));
});

module.exports = app;
