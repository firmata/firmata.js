var SerialPort = require("serialport");
var five = require("johnny-five");
var Firmata = require("../");

SerialPort.list(function(error, list) {
  var device = list.reduce(function(accum, item) {
    if (item.manufacturer.indexOf("Arduino") === 0) {
      return item;
    }
    return accum;
  }, null);


  /*
    The following demonstrates using Firmata
    as an IO Plugin for Johnny-Five
   */

  var board = new five.Board({
    io: new Firmata(device.comName)
  });

  board.on("ready", function() {
    var led = new five.Led(13);
    led.blink(500);
  });
});

