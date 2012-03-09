var firmata = require('../lib/firmata');
var server = firmata.createServer(function(board){
	board.pinMode(2,board.MODES.OUTPUT);
    var isOn = false;
    setInterval(function(){
      console.log(isOn);
      if(isOn){
        board.digitalWrite(2,board.LOW); 
        isOn = false;
      } else {
        board.digitalWrite(2,board.HIGH);
        isOn = true;
      }
    },2000);
});
server.listen(3030,function(){
	console.log('listening');
});