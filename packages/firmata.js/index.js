"use strict";

const com = require("./lib/com");

module.exports = require("@firmata/firmata-io")(com.SerialPort);

