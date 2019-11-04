const fs = require('fs');

const stream = fs.createWriteStream('queries.txt', {flags: 'a'});

function logQuery(text, match) {
    const pre = match ? 'S' : 'F';
    stream.write(`${pre} ${text}\n`);
}

module.exports = logQuery;
