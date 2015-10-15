require("es6-shim");

var semver = require("semver");
var spawn = require("child_process").spawn;
var sp = {
  version: "1.7.4",
  get atVersion() {
    return "serialport@" + sp.version;
  },
};

if (semver.gte(process.version, "3.0.0")) {
  sp.version = "latest";
}

var npm = spawn("npm", ["install", sp.atVersion]);

npm.stdout.on("data", function(data) {
  console.log(data.toString("utf8"));
});

npm.on("close", function(code) {
  if (code !== 0) {
    console.log("serialport installation failed. Error Code:", code);
  }
});
