// Imports
const winston = require('winston');
const moment = require('moment');

// Set up logging
module.exports = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({
            timestamp() {
                return moment().format('ddd MMM DD HH:mm:ss YYYY');
            },
            formatter: (options) => {
                let string = `${options.timestamp()} - `;
                string += `${options.level.toUpperCase()} - `;
                string += (options.message ? options.message : '');
                return string;
            },
        }),
    ],
});
