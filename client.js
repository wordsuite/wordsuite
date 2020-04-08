var Spell = function (dataUrl) {
  if (dataUrl[dataUrl.length - 1] !== '/') {
    dataUrl = dataUrl + '/'
  }
  var myWorker = new Worker(dataUrl + 'worker.bundle.js');

  function spell (word) {
    return new Promise((resolve) => {
      myWorker.addEventListener('message', function(e) {
        var data = JSON.parse(e.data)

        if (data.value === word) {
          resolve(data)
        }
      })

      myWorker.postMessage(JSON.stringify({
        dataUrl,
        type: 'spell',
        value: word
      }));

    })
  }

  function suggest (word) {
    return new Promise((resolve) => {
      myWorker.onmessage = function(e) {
        var data = JSON.parse(e.data)
        if (data.value === word) {
          resolve(data)
        }
      }

      myWorker.postMessage(JSON.stringify({
        dataUrl,
        type: 'suggest',
        value: word
      }));

    })
  }

  function define (word) {
    return new Promise((resolve) => {
      myWorker.onmessage = function(e) {
        var data = JSON.parse(e.data)
        if (data.value === word) {
          resolve(data)
        }
      }

      myWorker.postMessage(JSON.stringify({
        dataUrl,
        type: 'define',
        value: word
      }));

    })
  }

  function alternative (word) {
    return new Promise((resolve) => {
      myWorker.onmessage = function(e) {
        var data = JSON.parse(e.data)
        if (data.value === word) {
          resolve(data)
        }
      }

      myWorker.postMessage(JSON.stringify({
        dataUrl,
        type: 'alternative',
        value: word
      }));

    })
  }
  return {
    spell,
    suggest,
    define,
    alternative
  }
}

if (module) {
  module.exports = {Spell}
}

if (window) {
  window.Spell = Spell
}