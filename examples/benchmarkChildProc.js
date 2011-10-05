var qoper8 = require('qoper8');
var childProcess = qoper8.childProcess;

// Define your method that will process each incoming action
// Go wild with synchronous code to your heart's content!

var actionMethod = function(action) {
  //console.log("Action method: Process " + process.pid + ": action = " + JSON.stringify(action));
  var result = "method completed for " + process.pid + " at " + new Date().toLocaleTimeString();
  result = result + "; request sent was " + JSON.stringify(action);
  result = result + ' ; actionNo was ' + action.actionNo;
  return result;
};

childProcess.handler(actionMethod);
