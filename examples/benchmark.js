var scheduler = require('qoper8');

// Try modifying the poolSize to see the effect to overall processing time

var params = {poolSize: 5, trace: false};

scheduler.start(params, function(queue) {
  console.log("started!!!");

  var startTime = new Date().getTime();

// Try modifying the number of requests and batch addToQueue interval to test the performance of Q-Oper8
// Tweak these values to try to create a balance where the queue is fed at the same rate as it's consumed
  var maxQueue = 200;
  var interval = 24;


  var total = 0;

  var handler = function(actionObj, response) {
    total++;
    if (total % 10000 === 0) {
      var now = new Date().getTime();
      console.log(total + ": Total elapsed time: " + (now - startTime)/1000 + ": queue length " + queue.length);
    }
  };
  setInterval(function() {
    for (var i = 1; i < (maxQueue + 1); i++) {
      scheduler.addToQueue({action: i}, handler);
    }
  }, interval);
  

});
