const SerialPort = require("serialport");
const five = require("johnny-five");
const Firmata = require("../");

SerialPort.list().then(ports => {
  const device = ports.reduce((accum, item) => {
    if (item.manufacturer.indexOf("Arduino") === 0) {
      return item;
    }
    return accum;
  }, null);


  /*
    The following demonstrates using Firmata
    as an IO Plugin for Johnny-Five
   */

  const board = new five.Board({
    io: new Firmata(device.path)
  });

  board.on("ready", () => {
    const led = new five.Led(13);
    led.blink(500);
  });
});

