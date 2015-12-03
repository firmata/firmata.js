var Board = require("../");

Board.requestPort(function(error, port) {
  if (error) {
    console.log(error);
    return;
  }
  var board = new Board(port.comName);

  board.on("ready", function() {
    var a = 6;
    var b = 7;

    console.log("Ready.");

    this.pinMode(a, this.MODES.PWM);
    this.pinMode(b, this.MODES.OUTPUT);

    var states = {
      5: 0,
      8: 0
    };

    Object.keys(states).forEach(function(pin) {
      pin = +pin;
      this.pinMode(pin, this.MODES.INPUT);
      this.digitalRead(pin, function(value) {
        console.log("pin: %d value: %d", pin, value);
        if (states[pin] !== value) {
          states[pin] = value;
          this.digitalWrite(b, value);
        }
      });
    }, this);

    // var analogs = [0, 1, 2, 3, 4, 5];
    var analogs = [3];

    analogs.forEach(function(pin) {
      pin = +pin;
      this.pinMode(pin, this.MODES.ANALOG);
      this.analogRead(pin, function(value) {
        this.analogWrite(a, value >> 2);
      });
    }, this);

  });
});
