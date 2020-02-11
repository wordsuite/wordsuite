HOW TO USE

Installation
1) Add the script tag to your site
```html
<script src="https://wordsuite.github.io/wordsuite/client.bundle.js"></script>
```

2) Create instance
Create a new Spell instance
```js
var spell = window.Spell('https://wordsuite.github.io/wordsuite/')
```

Usage
1) Is word in dictionary?
```js
spell.spell(input.value).then(console.log)

// {
//  "job": "spell",
//  "value": "testing",
//  "result": true
// }
```

2) Suggest corrections for unknown word
```js
spell.suggest(input.value).then(console.log)

// {
//   "job": "suggest",
//   "value": "testingx",
//   "result": [
//     "testing",
//     "testings",
//     "besting",
//     "jesting",
//     "nesting"
//   ]
// }
```

3) Get definition of word
```js
spell.define(input.value).then(console.log)

// {
//   "job": "define",
//   "value": "testing",
//   "result": {
//     "word": "testing",
//     "wordset_id": "a94dcf4488",
//     "meanings": [
//       {
//         "id": "d0feff1953",
//         "def": "the act of giving students or candidates a test (as by questions) to determine what they know or have learned",
//         "speech_part": "noun",
//         "synonyms": [
//           "examination"
//         ]
//       },
//       ...
//     ]
//   }
// }
```

4) Look up synonyms (alternative words)
```js
spell.alternative(input.value).then(console.log)

// {
//   "job": "alternative",
//   "value": "testing",
//   "result": [
//     "testing",
//     "R and D",
//     "analytic",
//     "control",
//     "control experiment",
//     "controlled experiment",
//     "cut and try",
//     "cut-and-try",
//     "empirical",
//     ...
//   ]
// }
```
