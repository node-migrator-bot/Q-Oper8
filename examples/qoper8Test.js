var scheduler = require('qoper8');

// Try modifying the poolSize to see the effect to overall processing time

var params = {poolSize: 5};

scheduler.start(params, function() {
  console.log("started!!!");

  var startTime = new Date().getTime();

  var handler = function(actionObj, response) {
    console.log("This is the response handler: ");
    console.log("** action: " + JSON.stringify(actionObj));
    console.log("** response: " + JSON.stringify(response));
    var now = new Date().getTime();
    console.log("Total elapsed time: " + (now - startTime)/1000);
  };

// Try modifying the number of requests to test the performance of Q-Oper8

  var maxRequests = 5000;
  for (var i = 0; i < maxRequests; i++) {
    scheduler.addToQueue({action: i}, handler);
  }

});