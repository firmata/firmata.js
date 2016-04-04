var Emitter = require("events").EventEmitter;

function Mock(path) {
  this.isClosed = false;
}

Mock.prototype = Object.create(Emitter.prototype, {
  constructor: {
    value: Mock
  }
});

Mock.prototype.write = function (buffer) {
  // Tests are written to work with arrays not buffers
  // this shouldn"t impact the data, just the container
  // This also should be changed in future test rewrites
  if (Buffer.isBuffer(buffer)) {
    buffer = Array.prototype.slice.call(buffer, 0);
  }

  this.lastWrite = buffer;
  this.emit("write", buffer);
};

Mock.prototype.close = function () {
  this.isClosed = true;
};


var stub = {
  SerialPort: Mock,
  list: function() {},
};

var com;

try {
  if (process.browser || parseFloat(process.versions.nw) >= 0.13) {
    com = require("browser-serialport");
  } else {
    com = global.IS_TEST_MODE ? stub : require("serialport");
  }
} catch (err) {}

if (com == null) {
  if (global.IS_TEST_MODE) {
    com = stub;
  } else {
    console.log("It looks like serialport didn't compile properly. This is a common problem and its fix is well documented here https://github.com/voodootikigod/node-serialport#to-install");
    throw "Missing serialport dependency";
  }
}

module.exports = com;
