var util = require('util')
   ,events = require('events')
var MockSerialPort = function(path){
};
util.inherits(MockSerialPort,events.EventEmitter);
MockSerialPort.prototype.write = function(buffer){
	this.lastWrite = buffer;
};
module.exports.SerialPort = MockSerialPort;
