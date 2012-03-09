/* plugin for an led
 *
 */
var LED = function(board,pin){
	this.pin = pin;
	this.board = board;
	board.pinMode(pin,board.MODES.OUTPUT);
	this.isOn = false;
};
LED.prototype.on = function(){
	this.board.digitalWrite(this.pin,this.board.HIGH);
	this.isOn = true;
};
LED.prototype.off = function(){
	this.board.digitalWrite(this.pin,this.board.LOW);
	this.isOn = false;
};
LED.prototype.blink = function(interval){
	var self = this;
	this.currInterval = setInterval(function(){
		if(self.isOn){
			self.off();
		} else {
			self.on();
		}
	},interval);
};
LED.prototype.stopBlinking = function(){
	clearInterval(this.currInterval);	
	if(this.isOn){
		this.off();
	}
};
module.exports = function(board){
	console.log('hello');
	board.LED = LED.bind({},board);
};
