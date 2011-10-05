var scheduler = require('qoper8');

// Try modifying the poolSize to see the effect to overall processing time

var params = {poolSize: 2, maxMsgLength: 8192, childProcessPath: '/home/rob/gdbwork/qoper8ChildProcess.js'};

scheduler.start(params, function() {
  console.log("started!!!");

  var startTime = new Date().getTime();

// Try modifying the number of requests to test the performance of Q-Oper8
  var maxRequests = 1000;

  var handler = function(actionObj, response, pid) {
    //console.log("** actionObj: " + JSON.stringify(actionObj));
    //console.log("** response: " + JSON.stringify(response));
    //console.log("** response: " + response);
    if (actionObj.action.no === maxRequests) {
      var now = new Date().getTime();
      console.log("Total elapsed time: " + (now - startTime)/1000);
    }
  };

  for (var i = 1; i < (maxRequests + 1); i++) {
    scheduler.addToQueue({action: {no: i}}, handler);
  }

});
