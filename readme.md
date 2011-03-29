#firmata.js
A Node library to interact with an arduino running the firmata protocol.
#Requirements
Node
Arduino running firmata (tested with v2.2)
#Usage
    var firmata = require('..lib/firmata');
    var board = new firmata.Board('path to usb',function(){
      //arduino is ready to communicate
    });  
View test folder for examples.
#Methods:
*board.digitalWrite(pin,value)*  
  Write an output to a digital pin.  pin is the number of the pin and the value is either board.HIGH or board.LOW  
  
*board.pinMode(pin,state)*  
  Set a mode for a pin.  pin is the number of the pin and state is one of the following.  board.INPUT, board.OUTPUT, board.PWM  
  
*board.analogWrite(pin,value)*  
  Write an output to a digital pin.  pin is the number of the pin and the value is between 0 and 255.  
  
*board.analogRead(pin,callback)*  
  Read an input for an analog pin.  Every time there is data on the pin the callback will be fired.  

