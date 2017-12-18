var Board = require("../");

Board.requestPort(function(error, port) {
  if (error) {
    console.log(error);
    return;
  }

  var board = new Board(port.comName);

  board.on("ready", function() {

    board.accelStepperConfig({
      deviceNum: 0,
      type: board.STEPPER.TYPE.DRIVER,
      stepPin: 5,
      directionPin: 6,
      enablePin: 2,
      invertPins: [2]
    });

    board.accelStepperSpeed(0, 400);
    board.accelStepperAcceleration(0, 100);
    board.accelStepperEnable(0, true);
    board.accelStepperStep(0, 200, function(position) {
      console.log("Current position: " + position);
    });

  });
});
