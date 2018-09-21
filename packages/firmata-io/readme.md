# Firmata-io

This is Firmata.js without a default `Transport`.

# Install

Install Firmata-io:

```sh
npm install firmata-io --save
```

Install a Transport: 


```sh
npm install serialport --save
```

## Transports

- Serialport
- Etherport
- TODO: @monteslu


# Basic Usage

```js
const Serialport = require("serialport");
const Firmata = require("firmata-io")(Serialport);

Firmata.requestPort((error, port) => {
  if (error) {
    console.log(error);
    return;
  }

  const board = new Firmata(port.comName);

  board.on("close", () => {
    // Unplug the board to see this event!
    console.log("Closed!");
  });
});
```
