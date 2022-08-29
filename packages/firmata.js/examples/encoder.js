const Board = require("../");

Board.requestPort((error, port) => {
  if (error) {
    console.log(error);
    return;
  }

  const board = new Board(port.path);

  board.on("ready", () => {

    board.encoderAttach({
      encoderNum: 1,
      encoderPin1: 2,
      encoderPin2: 4,
     });
  
    board.on('encoder-position-1', (event)=>{
      console.log(event);
    });
  
    board.encoderEnableReporting(true)
  
  });
  
});


