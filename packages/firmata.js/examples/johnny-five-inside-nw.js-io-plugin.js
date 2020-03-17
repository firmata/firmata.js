/*
  This code is meant to be used inside a Chrome App or an NW.js-based project. By using 
  the chrome-apps-serialport module, it is no longer necessary to specifically recompile
  the native node-serialport module for the NW.js environment.
 */

const SerialPort = require("chrome-apps-serialport").SerialPort;
const Firmata = require("firmata-io")(SerialPort);
const five = require("johnny-five");

SerialPort.list().then(ports => {

  const device = ports.find(port => {
    return port.manufacturer && port.manufacturer.startsWith("Arduino")
  });

  const board = new five.Board({
    io: new Firmata(device.path)
  });

  board.on("ready", () => {
    console.log("Johnny-Five is ready!");
    const led = new five.Led(13);
    led.blink(500);
  });

});
