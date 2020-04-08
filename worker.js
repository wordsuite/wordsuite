var Typo = require('./data/typo/typo');

var words = {}
var definitions = {}
var dictionarys = {}

self.addEventListener("message", async function(event) {
  var data = JSON.parse(event.data);

  var dataUrl = data.dataUrl
  if (dataUrl[dataUrl.length - 1] !== '/') {
    dataUrl = dataUrl + '/'
  }

  var dictionaryPathCandidate = dataUrl + 'data/typo/typo/dictionaries'
  if (!dictionarys[dictionaryPathCandidate]) {
    dictionarys[dictionaryPathCandidate] = new Typo("en_US", false, false, { dictionaryPath: dictionaryPathCandidate });
  }
  var dictionary = dictionarys[dictionaryPathCandidate]

  if (data.type === 'spell') {
    return postMessage(JSON.stringify({
      job: 'spell',
      value: data.value,
      result: dictionary.check(data.value)
    }));
  }

  if (data.type === 'suggest') {
    return postMessage(JSON.stringify({
      job: 'suggest',
      value: data.value,
      result: dictionary.suggest(data.value)
    }));
  }

  if (data.type === 'define') {
    if (!definitions[data.value[0]]) {
      definitions[data.value[0]] = fetch(data.dataUrl + 'data/wordset/data/' + data.value[0] + '.json')
        .then(response => response.json())
    }

    var result = await definitions[data.value[0]]

    return postMessage(JSON.stringify({
      job: 'define',
      value: data.value,
      result: result[data.value]
    }));
  }

  if (data.type === 'alternative') {
    if (!words[data.value[0]]) {
      words[data.value[0]] = fetch(data.dataUrl + 'data/words/' + data.value[0] + '.txt')
        .then(response => response.text())
    }

    var wordList = await words[data.value[0]]

    var regex = new RegExp('^' + data.value + '\\,(.*?)\$', 'gm')
    var result = wordList.match(regex)

    return postMessage(JSON.stringify({
      job: 'alternative',
      value: data.value,
      result: result && result[0] && result[0].split(',')
    }));
  }

  postMessage(JSON.stringify({
    type: 'error',
    result: 'job not found'
  }))
});

