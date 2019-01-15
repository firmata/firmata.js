"use strict";

const Emitter = require("events");

/* istanbul ignore next */
let list = function() {
  /* istanbul ignore next */
  return Promise.resolve([]);
};

class Stub extends Emitter {
  constructor(path/*, options, openCallback*/) {
    super();
    this.isOpen = true;
    this.baudRate = 0;
    this.path = path;
  }

  write(buffer) {
    // Tests are written to work with arrays not buffers
    // this shouldn't impact the data, just the container
    // This also should be changed in future test rewrites
    /* istanbul ignore else */
    if (Buffer.isBuffer(buffer)) {
      buffer = Array.from(buffer);
    }

    this.lastWrite = buffer;
    this.emit("write", buffer);
  }
}

// This trash is necessary for stubbing with sinon.
Stub.list = list;
Stub.SerialPort = Stub;

let com;
let error;
let SerialPort;
let stub = Stub;

try {
  /* istanbul ignore else */
  if (process.env.IS_TEST_MODE) {
    com = stub;
  } else {
    SerialPort = require("serialport");
    com = SerialPort;
  }
} catch (err) {
  error = err;
}


/* istanbul ignore if */
if (com == null) {
  if (process.env.IS_TEST_MODE) {
    com = stub;
  } else {
    console.log("It looks like serialport didn't compile properly. This is a common problem and its fix is well documented here https://github.com/voodootikigod/node-serialport#to-install");
    console.log(`The result of requiring the package is: ${SerialPort}`);
    console.log(error);
    throw "Missing serialport dependency";
  }
}

module.exports = com;
