var firmata  = require('../lib/firmata.js')
  , express=require('express')
  , app = express.createServer()
  , board = new firmata.Board('/dev/ttyACM0',function(){
  console.log(board.pins);
  app.use(express.static(__dirname + '/public'));
  app.get('/on', function(req, res){
    board.digitalWrite(req.param('pin'), 1);
    res.send("on");
  });
  app.get('/off',function(req,res){
    board.digitalWrite(req.param('pin'), 0);
    res.send("off");
  });
  app.get('/pinmode',function(req,res){
    board.pinMode(req.param('pin'),board.OUTPUT);
    res.send("pinmode");
  });
  app.listen(3000);
  console.log('listening');
  board.pinMode(9,board.PWM);
  board.analogRead(0,function(data){
    if(data > 500){
      board.analogWrite(9,0);
    }else{
      board.analogWrite(9,255);
    }
  });
});
