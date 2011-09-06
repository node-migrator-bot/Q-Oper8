var scheduler = require('qoper8');

// Try modifying the poolSize to see the effect to overall processing time

var params = {poolSize: 2, trace: false};

scheduler.start(params, function() {
  console.log("started!!!");

  var startTime = new Date().getTime();

// Try modifying the number of requests to test the performance of Q-Oper8
  var maxRequests = 10000;

  var handler = function(actionObj, response) {
    //console.log("This is the response handler: ");
    //console.log("** action: " + JSON.stringify(actionObj));
    //console.log("** response: " + JSON.stringify(response));
    //console.log("** response: " + response);
    if (actionObj.action === maxRequests) {
      var now = new Date().getTime();
      console.log("Total elapsed time: " + (now - startTime)/1000);
    }
  };

  for (var i = 1; i < (maxRequests + 1); i++) {
    scheduler.addToQueue({action: i}, handler);
  }

});
