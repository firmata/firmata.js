var util = require("util"), events = require("events");

var MockSerialPort = function (path) {
  this.isClosed = false;
};

util.inherits(MockSerialPort, events.EventEmitter);

MockSerialPort.prototype.write = function (buffer) {
  // Tests are written to work with arrays not buffers
  // this shouldn"t impact the data, just the container
  // This also should be changed in future test rewrites
  if (Buffer.isBuffer(buffer)) {
    buffer = Array.prototype.slice.call(buffer, 0);
  }

  this.lastWrite = buffer;
  this.emit("write", buffer);
};

MockSerialPort.prototype.close = function () {
  this.isClosed = true;
};

module.exports.SerialPort = MockSerialPort;
