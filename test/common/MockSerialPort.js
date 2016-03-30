function SerialPort(path) {
  this.isClosed = false;
}

SerialPort.prototype = Object.create(Emitter.prototype, {
  constructor: {
    value: SerialPort
  }
});

SerialPort.prototype.write = function (buffer) {
  // Tests are written to work with arrays not buffers
  // this shouldn"t impact the data, just the container
  // This also should be changed in future test rewrites
  if (Buffer.isBuffer(buffer)) {
    buffer = Array.prototype.slice.call(buffer, 0);
  }

  this.lastWrite = buffer;
  this.emit("write", buffer);
};

SerialPort.prototype.close = function () {
  this.isClosed = true;
};

module.exports.SerialPort = SerialPort;
module.exports.list = function(callback) {};
