"use strict";

const Emitter = require("events");

function Mock(path, options, openCallback) {
  this.isOpen = true;
  this.baudRate = 0;
  this.path = path;
}

Mock.prototype = Object.create(Emitter.prototype, {
  constructor: {
    value: Mock
  }
});

Mock.prototype.write = function (buffer) {
  // Tests are written to work with arrays not buffers
  // this shouldn't impact the data, just the container
  // This also should be changed in future test rewrites
  if (Buffer.isBuffer(buffer)) {
    buffer = Array.from(buffer);
  }

  this.lastWrite = buffer;
  this.emit("write", buffer);
};

let com;
let sp;
let stub = {
  SerialPort: Mock,
  list() {
    return Promise.resolve([]);
  },
};

try {
  /* istanbul ignore if */
  if (process.browser || parseFloat(process.versions.nw) >= 0.13) {
    com = require("browser-serialport");
  } else {
    /* istanbul ignore else */
    if (process.env.IS_TEST_MODE) {
      com = stub;
    } else {
      sp = require("serialport");
      com = {
        SerialPort: sp,
        list: sp.list,
      };
    }
  }
} catch (err) {}


/* istanbul ignore if */
if (com == null) {
  if (process.env.IS_TEST_MODE) {
    com = stub;
  } else {
    console.log("It looks like serialport didn't compile properly. This is a common problem and its fix is well documented here https://github.com/voodootikigod/node-serialport#to-install");
    console.log("The result of requiring the package is: ", sp);
    throw "Missing serialport dependency";
  }
}

module.exports = com;
