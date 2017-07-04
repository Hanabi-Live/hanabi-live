'use strict';

// Imports
const winston = require('winston');
const moment  = require('moment');

// Set up logging
module.exports = new (winston.Logger)({
    transports: [
      new (winston.transports.Console)({
          timestamp: function() {
              return moment().format('ddd MMM DD HH:mm:ss YYYY');
          },
          formatter: function(options) {
              let string = options.timestamp() + ' - ';
              string += options.level.toUpperCase() + ' - ';
              string += (options.message ? options.message : '');
              return string;
          },
      }),
    ]
});
