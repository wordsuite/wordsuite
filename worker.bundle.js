(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){

},{}],2:[function(require,module,exports){
(function (__dirname){
/* globals chrome: false */
/* globals __dirname: false */
/* globals require: false */
/* globals Buffer: false */
/* globals module: false */

/**
 * Typo is a JavaScript implementation of a spellchecker using hunspell-style 
 * dictionaries.
 */

var Typo;

(function () {
"use strict";

/**
 * Typo constructor.
 *
 * @param {String} [dictionary] The locale code of the dictionary being used. e.g.,
 *                              "en_US". This is only used to auto-load dictionaries.
 * @param {String} [affData]    The data from the dictionary's .aff file. If omitted
 *                              and Typo.js is being used in a Chrome extension, the .aff
 *                              file will be loaded automatically from
 *                              lib/typo/dictionaries/[dictionary]/[dictionary].aff
 *                              In other environments, it will be loaded from
 *                              [settings.dictionaryPath]/dictionaries/[dictionary]/[dictionary].aff
 * @param {String} [wordsData]  The data from the dictionary's .dic file. If omitted
 *                              and Typo.js is being used in a Chrome extension, the .dic
 *                              file will be loaded automatically from
 *                              lib/typo/dictionaries/[dictionary]/[dictionary].dic
 *                              In other environments, it will be loaded from
 *                              [settings.dictionaryPath]/dictionaries/[dictionary]/[dictionary].dic
 * @param {Object} [settings]   Constructor settings. Available properties are:
 *                              {String} [dictionaryPath]: path to load dictionary from in non-chrome
 *                              environment.
 *                              {Object} [flags]: flag information.
 *                              {Boolean} [asyncLoad]: If true, affData and wordsData will be loaded
 *                              asynchronously.
 *                              {Function} [loadedCallback]: Called when both affData and wordsData
 *                              have been loaded. Only used if asyncLoad is set to true. The parameter
 *                              is the instantiated Typo object.
 *
 * @returns {Typo} A Typo object.
 */

Typo = function (dictionary, affData, wordsData, settings) {
	settings = settings || {};

	this.dictionary = null;
	
	this.rules = {};
	this.dictionaryTable = {};
	
	this.compoundRules = [];
	this.compoundRuleCodes = {};
	
	this.replacementTable = [];
	
	this.flags = settings.flags || {}; 
	
	this.memoized = {};

	this.loaded = false;
	
	var self = this;
	
	var path;
	
	// Loop-control variables.
	var i, j, _len, _jlen;
	
	if (dictionary) {
		self.dictionary = dictionary;
		
		// If the data is preloaded, just setup the Typo object.
		if (affData && wordsData) {
			setup();
		}
		// Loading data for Chrome extentions.
		else if (typeof window !== 'undefined' && 'chrome' in window && 'extension' in window.chrome && 'getURL' in window.chrome.extension) {
			if (settings.dictionaryPath) {
				path = settings.dictionaryPath;
			}
			else {
				path = "typo/dictionaries";
			}
			
			if (!affData) readDataFile(chrome.extension.getURL(path + "/" + dictionary + "/" + dictionary + ".aff.txt"), setAffData);
			if (!wordsData) readDataFile(chrome.extension.getURL(path + "/" + dictionary + "/" + dictionary + ".dic.txt"), setWordsData);
		}
		else {
			if (settings.dictionaryPath) {
				path = settings.dictionaryPath;
			}
			else if (typeof __dirname !== 'undefined') {
				path = __dirname + '/dictionaries';
			}
			else {
				path = './dictionaries';
			}
			
			if (!affData) readDataFile(path + "/" + dictionary + "/" + dictionary + ".aff.txt", setAffData);
			if (!wordsData) readDataFile(path + "/" + dictionary + "/" + dictionary + ".dic.txt", setWordsData);
		}
	}
	
	function readDataFile(url, setFunc) {
		var response = self._readFile(url, null, settings.asyncLoad);
		
		if (settings.asyncLoad) {
			response.then(function(data) {
				setFunc(data);
			});
		}
		else {
			setFunc(response);
		}
	}

	function setAffData(data) {
		affData = data;

		if (wordsData) {
			setup();
		}
	}

	function setWordsData(data) {
		wordsData = data;

		if (affData) {
			setup();
		}
	}

	function setup() {
		self.rules = self._parseAFF(affData);
		
		// Save the rule codes that are used in compound rules.
		self.compoundRuleCodes = {};
		
		for (i = 0, _len = self.compoundRules.length; i < _len; i++) {
			var rule = self.compoundRules[i];
			
			for (j = 0, _jlen = rule.length; j < _jlen; j++) {
				self.compoundRuleCodes[rule[j]] = [];
			}
		}
		
		// If we add this ONLYINCOMPOUND flag to self.compoundRuleCodes, then _parseDIC
		// will do the work of saving the list of words that are compound-only.
		if ("ONLYINCOMPOUND" in self.flags) {
			self.compoundRuleCodes[self.flags.ONLYINCOMPOUND] = [];
		}
		
		self.dictionaryTable = self._parseDIC(wordsData);
		
		// Get rid of any codes from the compound rule codes that are never used 
		// (or that were special regex characters).  Not especially necessary... 
		for (i in self.compoundRuleCodes) {
			if (self.compoundRuleCodes[i].length === 0) {
				delete self.compoundRuleCodes[i];
			}
		}
		
		// Build the full regular expressions for each compound rule.
		// I have a feeling (but no confirmation yet) that this method of 
		// testing for compound words is probably slow.
		for (i = 0, _len = self.compoundRules.length; i < _len; i++) {
			var ruleText = self.compoundRules[i];
			
			var expressionText = "";
			
			for (j = 0, _jlen = ruleText.length; j < _jlen; j++) {
				var character = ruleText[j];
				
				if (character in self.compoundRuleCodes) {
					expressionText += "(" + self.compoundRuleCodes[character].join("|") + ")";
				}
				else {
					expressionText += character;
				}
			}
			
			self.compoundRules[i] = new RegExp(expressionText, "i");
		}
		
		self.loaded = true;
		
		if (settings.asyncLoad && settings.loadedCallback) {
			settings.loadedCallback(self);
		}
	}
	
	return this;
};

Typo.prototype = {
	/**
	 * Loads a Typo instance from a hash of all of the Typo properties.
	 *
	 * @param object obj A hash of Typo properties, probably gotten from a JSON.parse(JSON.stringify(typo_instance)).
	 */
	
	load : function (obj) {
		for (var i in obj) {
			if (obj.hasOwnProperty(i)) {
				this[i] = obj[i];
			}
		}
		
		return this;
	},
	
	/**
	 * Read the contents of a file.
	 * 
	 * @param {String} path The path (relative) to the file.
	 * @param {String} [charset="ISO8859-1"] The expected charset of the file
	 * @param {Boolean} async If true, the file will be read asynchronously. For node.js this does nothing, all
	 *        files are read synchronously.
	 * @returns {String} The file data if async is false, otherwise a promise object. If running node.js, the data is
	 *          always returned.
	 */
	
	_readFile : function (path, charset, async) {
		charset = charset || "utf8";
		
		if (typeof XMLHttpRequest !== 'undefined') {
			var promise;
			var req = new XMLHttpRequest();
			req.open("GET", path, async);
			
			if (async) {
				promise = new Promise(function(resolve, reject) {
					req.onload = function() {
						if (req.status === 200) {
							resolve(req.responseText);
						}
						else {
							reject(req.statusText);
						}
					};
					
					req.onerror = function() {
						reject(req.statusText);
					}
				});
			}
		
			if (req.overrideMimeType)
				req.overrideMimeType("text/plain; charset=" + charset);
		
			req.send(null);
			
			return async ? promise : req.responseText;
		}
		else if (typeof require !== 'undefined') {
			// Node.js
			var fs = require("fs");
			
			try {
				if (fs.existsSync(path)) {
					return fs.readFileSync(path, charset);
				}
				else {
					console.log("Path " + path + " does not exist.");
				}
			} catch (e) {
				console.log(e);
				return '';
			}
		}
	},
	
	/**
	 * Parse the rules out from a .aff file.
	 *
	 * @param {String} data The contents of the affix file.
	 * @returns object The rules from the file.
	 */
	
	_parseAFF : function (data) {
		var rules = {};
		
		var line, subline, numEntries, lineParts;
		var i, j, _len, _jlen;
		
		// Remove comment lines
		data = this._removeAffixComments(data);
		
		var lines = data.split(/\r?\n/);
		
		for (i = 0, _len = lines.length; i < _len; i++) {
			line = lines[i];
			
			var definitionParts = line.split(/\s+/);
			
			var ruleType = definitionParts[0];
			
			if (ruleType == "PFX" || ruleType == "SFX") {
				var ruleCode = definitionParts[1];
				var combineable = definitionParts[2];
				numEntries = parseInt(definitionParts[3], 10);
				
				var entries = [];
				
				for (j = i + 1, _jlen = i + 1 + numEntries; j < _jlen; j++) {
					subline = lines[j];
					
					lineParts = subline.split(/\s+/);
					var charactersToRemove = lineParts[2];
					
					var additionParts = lineParts[3].split("/");
					
					var charactersToAdd = additionParts[0];
					if (charactersToAdd === "0") charactersToAdd = "";
					
					var continuationClasses = this.parseRuleCodes(additionParts[1]);
					
					var regexToMatch = lineParts[4];
					
					var entry = {};
					entry.add = charactersToAdd;
					
					if (continuationClasses.length > 0) entry.continuationClasses = continuationClasses;
					
					if (regexToMatch !== ".") {
						if (ruleType === "SFX") {
							entry.match = new RegExp(regexToMatch + "$");
						}
						else {
							entry.match = new RegExp("^" + regexToMatch);
						}
					}
					
					if (charactersToRemove != "0") {
						if (ruleType === "SFX") {
							entry.remove = new RegExp(charactersToRemove  + "$");
						}
						else {
							entry.remove = charactersToRemove;
						}
					}
					
					entries.push(entry);
				}
				
				rules[ruleCode] = { "type" : ruleType, "combineable" : (combineable == "Y"), "entries" : entries };
				
				i += numEntries;
			}
			else if (ruleType === "COMPOUNDRULE") {
				numEntries = parseInt(definitionParts[1], 10);
				
				for (j = i + 1, _jlen = i + 1 + numEntries; j < _jlen; j++) {
					line = lines[j];
					
					lineParts = line.split(/\s+/);
					this.compoundRules.push(lineParts[1]);
				}
				
				i += numEntries;
			}
			else if (ruleType === "REP") {
				lineParts = line.split(/\s+/);
				
				if (lineParts.length === 3) {
					this.replacementTable.push([ lineParts[1], lineParts[2] ]);
				}
			}
			else {
				// ONLYINCOMPOUND
				// COMPOUNDMIN
				// FLAG
				// KEEPCASE
				// NEEDAFFIX
				
				this.flags[ruleType] = definitionParts[1];
			}
		}
		
		return rules;
	},
	
	/**
	 * Removes comment lines and then cleans up blank lines and trailing whitespace.
	 *
	 * @param {String} data The data from an affix file.
	 * @return {String} The cleaned-up data.
	 */
	
	_removeAffixComments : function (data) {
		// Remove comments
		// This used to remove any string starting with '#' up to the end of the line,
		// but some COMPOUNDRULE definitions include '#' as part of the rule.
		// I haven't seen any affix files that use comments on the same line as real data,
		// so I don't think this will break anything.
		data = data.replace(/^\s*#.*$/mg, "");
		
		// Trim each line
		data = data.replace(/^\s\s*/m, '').replace(/\s\s*$/m, '');
		
		// Remove blank lines.
		data = data.replace(/\n{2,}/g, "\n");
		
		// Trim the entire string
		data = data.replace(/^\s\s*/, '').replace(/\s\s*$/, '');
		
		return data;
	},
	
	/**
	 * Parses the words out from the .dic file.
	 *
	 * @param {String} data The data from the dictionary file.
	 * @returns object The lookup table containing all of the words and
	 *                 word forms from the dictionary.
	 */
	
	_parseDIC : function (data) {
		data = this._removeDicComments(data);
		
		var lines = data.split(/\r?\n/);
		var dictionaryTable = {};
		
		function addWord(word, rules) {
			// Some dictionaries will list the same word multiple times with different rule sets.
			if (!dictionaryTable.hasOwnProperty(word)) {
				dictionaryTable[word] = null;
			}
			
			if (rules.length > 0) {
				if (dictionaryTable[word] === null) {
					dictionaryTable[word] = [];
				}

				dictionaryTable[word].push(rules);
			}
		}
		
		// The first line is the number of words in the dictionary.
		for (var i = 1, _len = lines.length; i < _len; i++) {
			var line = lines[i];
			
			if (!line) {
				// Ignore empty lines.
				continue;
			}

			var parts = line.split("/", 2);
			
			var word = parts[0];

			// Now for each affix rule, generate that form of the word.
			if (parts.length > 1) {
				var ruleCodesArray = this.parseRuleCodes(parts[1]);
				
				// Save the ruleCodes for compound word situations.
				if (!("NEEDAFFIX" in this.flags) || ruleCodesArray.indexOf(this.flags.NEEDAFFIX) == -1) {
					addWord(word, ruleCodesArray);
				}
				
				for (var j = 0, _jlen = ruleCodesArray.length; j < _jlen; j++) {
					var code = ruleCodesArray[j];
					
					var rule = this.rules[code];
					
					if (rule) {
						var newWords = this._applyRule(word, rule);
						
						for (var ii = 0, _iilen = newWords.length; ii < _iilen; ii++) {
							var newWord = newWords[ii];
							
							addWord(newWord, []);
							
							if (rule.combineable) {
								for (var k = j + 1; k < _jlen; k++) {
									var combineCode = ruleCodesArray[k];
									
									var combineRule = this.rules[combineCode];
									
									if (combineRule) {
										if (combineRule.combineable && (rule.type != combineRule.type)) {
											var otherNewWords = this._applyRule(newWord, combineRule);
											
											for (var iii = 0, _iiilen = otherNewWords.length; iii < _iiilen; iii++) {
												var otherNewWord = otherNewWords[iii];
												addWord(otherNewWord, []);
											}
										}
									}
								}
							}
						}
					}
					
					if (code in this.compoundRuleCodes) {
						this.compoundRuleCodes[code].push(word);
					}
				}
			}
			else {
				addWord(word.trim(), []);
			}
		}
		
		return dictionaryTable;
	},
	
	
	/**
	 * Removes comment lines and then cleans up blank lines and trailing whitespace.
	 *
	 * @param {String} data The data from a .dic file.
	 * @return {String} The cleaned-up data.
	 */
	
	_removeDicComments : function (data) {
		// I can't find any official documentation on it, but at least the de_DE
		// dictionary uses tab-indented lines as comments.
		
		// Remove comments
		data = data.replace(/^\t.*$/mg, "");
		
		return data;
	},
	
	parseRuleCodes : function (textCodes) {
		if (!textCodes) {
			return [];
		}
		else if (!("FLAG" in this.flags)) {
			return textCodes.split("");
		}
		else if (this.flags.FLAG === "long") {
			var flags = [];
			
			for (var i = 0, _len = textCodes.length; i < _len; i += 2) {
				flags.push(textCodes.substr(i, 2));
			}
			
			return flags;
		}
		else if (this.flags.FLAG === "num") {
			return textCodes.split(",");
		}
	},
	
	/**
	 * Applies an affix rule to a word.
	 *
	 * @param {String} word The base word.
	 * @param {Object} rule The affix rule.
	 * @returns {String[]} The new words generated by the rule.
	 */
	
	_applyRule : function (word, rule) {
		var entries = rule.entries;
		var newWords = [];
		
		for (var i = 0, _len = entries.length; i < _len; i++) {
			var entry = entries[i];
			
			if (!entry.match || word.match(entry.match)) {
				var newWord = word;
				
				if (entry.remove) {
					newWord = newWord.replace(entry.remove, "");
				}
				
				if (rule.type === "SFX") {
					newWord = newWord + entry.add;
				}
				else {
					newWord = entry.add + newWord;
				}
				
				newWords.push(newWord);
				
				if ("continuationClasses" in entry) {
					for (var j = 0, _jlen = entry.continuationClasses.length; j < _jlen; j++) {
						var continuationRule = this.rules[entry.continuationClasses[j]];
						
						if (continuationRule) {
							newWords = newWords.concat(this._applyRule(newWord, continuationRule));
						}
						/*
						else {
							// This shouldn't happen, but it does, at least in the de_DE dictionary.
							// I think the author mistakenly supplied lower-case rule codes instead 
							// of upper-case.
						}
						*/
					}
				}
			}
		}
		
		return newWords;
	},
	
	/**
	 * Checks whether a word or a capitalization variant exists in the current dictionary.
	 * The word is trimmed and several variations of capitalizations are checked.
	 * If you want to check a word without any changes made to it, call checkExact()
	 *
	 * @see http://blog.stevenlevithan.com/archives/faster-trim-javascript re:trimming function
	 *
	 * @param {String} aWord The word to check.
	 * @returns {Boolean}
	 */
	
	check : function (aWord) {
		if (!this.loaded) {
			throw "Dictionary not loaded.";
		}
		
		// Remove leading and trailing whitespace
		var trimmedWord = aWord.replace(/^\s\s*/, '').replace(/\s\s*$/, '');
		
		if (this.checkExact(trimmedWord)) {
			return true;
		}
		
		// The exact word is not in the dictionary.
		if (trimmedWord.toUpperCase() === trimmedWord) {
			// The word was supplied in all uppercase.
			// Check for a capitalized form of the word.
			var capitalizedWord = trimmedWord[0] + trimmedWord.substring(1).toLowerCase();
			
			if (this.hasFlag(capitalizedWord, "KEEPCASE")) {
				// Capitalization variants are not allowed for this word.
				return false;
			}
			
			if (this.checkExact(capitalizedWord)) {
				return true;
			}
		}
		
		var lowercaseWord = trimmedWord.toLowerCase();
		
		if (lowercaseWord !== trimmedWord) {
			if (this.hasFlag(lowercaseWord, "KEEPCASE")) {
				// Capitalization variants are not allowed for this word.
				return false;
			}
			
			// Check for a lowercase form
			if (this.checkExact(lowercaseWord)) {
				return true;
			}
		}
		
		return false;
	},
	
	/**
	 * Checks whether a word exists in the current dictionary.
	 *
	 * @param {String} word The word to check.
	 * @returns {Boolean}
	 */
	
	checkExact : function (word) {
		if (!this.loaded) {
			throw "Dictionary not loaded.";
		}

		var ruleCodes = this.dictionaryTable[word];
		
		var i, _len;
		
		if (typeof ruleCodes === 'undefined') {
			// Check if this might be a compound word.
			if ("COMPOUNDMIN" in this.flags && word.length >= this.flags.COMPOUNDMIN) {
				for (i = 0, _len = this.compoundRules.length; i < _len; i++) {
					if (word.match(this.compoundRules[i])) {
						return true;
					}
				}
			}
		}
		else if (ruleCodes === null) {
			// a null (but not undefined) value for an entry in the dictionary table
			// means that the word is in the dictionary but has no flags.
			return true;
		}
		else if (typeof ruleCodes === 'object') { // this.dictionary['hasOwnProperty'] will be a function.
			for (i = 0, _len = ruleCodes.length; i < _len; i++) {
				if (!this.hasFlag(word, "ONLYINCOMPOUND", ruleCodes[i])) {
					return true;
				}
			}
		}

		return false;
	},
	
	/**
	 * Looks up whether a given word is flagged with a given flag.
	 *
	 * @param {String} word The word in question.
	 * @param {String} flag The flag in question.
	 * @return {Boolean}
	 */
	 
	hasFlag : function (word, flag, wordFlags) {
		if (!this.loaded) {
			throw "Dictionary not loaded.";
		}

		if (flag in this.flags) {
			if (typeof wordFlags === 'undefined') {
				wordFlags = Array.prototype.concat.apply([], this.dictionaryTable[word]);
			}
			
			if (wordFlags && wordFlags.indexOf(this.flags[flag]) !== -1) {
				return true;
			}
		}
		
		return false;
	},
	
	/**
	 * Returns a list of suggestions for a misspelled word.
	 *
	 * @see http://www.norvig.com/spell-correct.html for the basis of this suggestor.
	 * This suggestor is primitive, but it works.
	 *
	 * @param {String} word The misspelling.
	 * @param {Number} [limit=5] The maximum number of suggestions to return.
	 * @returns {String[]} The array of suggestions.
	 */
	
	alphabet : "",
	
	suggest : function (word, limit) {
		if (!this.loaded) {
			throw "Dictionary not loaded.";
		}

		limit = limit || 5;

		if (this.memoized.hasOwnProperty(word)) {
			var memoizedLimit = this.memoized[word]['limit'];

			// Only return the cached list if it's big enough or if there weren't enough suggestions
			// to fill a smaller limit.
			if (limit <= memoizedLimit || this.memoized[word]['suggestions'].length < memoizedLimit) {
				return this.memoized[word]['suggestions'].slice(0, limit);
			}
		}
		
		if (this.check(word)) return [];
		
		// Check the replacement table.
		for (var i = 0, _len = this.replacementTable.length; i < _len; i++) {
			var replacementEntry = this.replacementTable[i];
			
			if (word.indexOf(replacementEntry[0]) !== -1) {
				var correctedWord = word.replace(replacementEntry[0], replacementEntry[1]);
				
				if (this.check(correctedWord)) {
					return [ correctedWord ];
				}
			}
		}
		
		var self = this;
		self.alphabet = "abcdefghijklmnopqrstuvwxyz";
		
		/*
		if (!self.alphabet) {
			// Use the alphabet as implicitly defined by the words in the dictionary.
			var alphaHash = {};
			
			for (var i in self.dictionaryTable) {
				for (var j = 0, _len = i.length; j < _len; j++) {
					alphaHash[i[j]] = true;
				}
			}
			
			for (var i in alphaHash) {
				self.alphabet += i;
			}
			
			var alphaArray = self.alphabet.split("");
			alphaArray.sort();
			self.alphabet = alphaArray.join("");
		}
		*/
		
		/**
		 * Returns a hash keyed by all of the strings that can be made by making a single edit to the word (or words in) `words`
		 * The value of each entry is the number of unique ways that the resulting word can be made.
		 *
		 * @arg mixed words Either a hash keyed by words or a string word to operate on.
		 * @arg bool known_only Whether this function should ignore strings that are not in the dictionary.
		 */
		function edits1(words, known_only) {
			var rv = {};
			
			var i, j, _iilen, _len, _jlen, _edit;
			
			if (typeof words == 'string') {
				var word = words;
				words = {};
				words[word] = true;
			}

			for (var word in words) {
				for (i = 0, _len = word.length + 1; i < _len; i++) {
					var s = [ word.substring(0, i), word.substring(i) ];
				
					if (s[1]) {
						_edit = s[0] + s[1].substring(1);

						if (!known_only || self.check(_edit)) {
							if (!(_edit in rv)) {
								rv[_edit] = 1;
							}
							else {
								rv[_edit] += 1;
							}
						}
					}
					
					// Eliminate transpositions of identical letters
					if (s[1].length > 1 && s[1][1] !== s[1][0]) {
						_edit = s[0] + s[1][1] + s[1][0] + s[1].substring(2);

						if (!known_only || self.check(_edit)) {
							if (!(_edit in rv)) {
								rv[_edit] = 1;
							}
							else {
								rv[_edit] += 1;
							}
						}
					}

					if (s[1]) {
						for (j = 0, _jlen = self.alphabet.length; j < _jlen; j++) {
							// Eliminate replacement of a letter by itself
							if (self.alphabet[j] != s[1].substring(0,1)){
								_edit = s[0] + self.alphabet[j] + s[1].substring(1);

								if (!known_only || self.check(_edit)) {
									if (!(_edit in rv)) {
										rv[_edit] = 1;
									}
									else {
										rv[_edit] += 1;
									}
								}
							}
						}
					}

					if (s[1]) {
						for (j = 0, _jlen = self.alphabet.length; j < _jlen; j++) {
							_edit = s[0] + self.alphabet[j] + s[1];

							if (!known_only || self.check(_edit)) {
								if (!(_edit in rv)) {
									rv[_edit] = 1;
								}
								else {
									rv[_edit] += 1;
								}
							}
						}
					}
				}
			}
			
			return rv;
		}

		function correct(word) {
			// Get the edit-distance-1 and edit-distance-2 forms of this word.
			var ed1 = edits1(word);
			var ed2 = edits1(ed1, true);
			
			// Sort the edits based on how many different ways they were created.
			var weighted_corrections = ed2;
			
			for (var ed1word in ed1) {
				if (!self.check(ed1word)) {
					continue;
				}

				if (ed1word in weighted_corrections) {
					weighted_corrections[ed1word] += ed1[ed1word];
				}
				else {
					weighted_corrections[ed1word] = ed1[ed1word];
				}
			}
			
			var i, _len;

			var sorted_corrections = [];
			
			for (i in weighted_corrections) {
				if (weighted_corrections.hasOwnProperty(i)) {
					sorted_corrections.push([ i, weighted_corrections[i] ]);
				}
			}

			function sorter(a, b) {
				var a_val = a[1];
				var b_val = b[1];
				if (a_val < b_val) {
					return -1;
				} else if (a_val > b_val) {
					return 1;
				}
				// @todo If a and b are equally weighted, add our own weight based on something like the key locations on this language's default keyboard.
				return b[0].localeCompare(a[0]);
			}
			
			sorted_corrections.sort(sorter).reverse();

			var rv = [];

			var capitalization_scheme = "lowercase";
			
			if (word.toUpperCase() === word) {
				capitalization_scheme = "uppercase";
			}
			else if (word.substr(0, 1).toUpperCase() + word.substr(1).toLowerCase() === word) {
				capitalization_scheme = "capitalized";
			}
			
			var working_limit = limit;

			for (i = 0; i < Math.min(working_limit, sorted_corrections.length); i++) {
				if ("uppercase" === capitalization_scheme) {
					sorted_corrections[i][0] = sorted_corrections[i][0].toUpperCase();
				}
				else if ("capitalized" === capitalization_scheme) {
					sorted_corrections[i][0] = sorted_corrections[i][0].substr(0, 1).toUpperCase() + sorted_corrections[i][0].substr(1);
				}
				
				if (!self.hasFlag(sorted_corrections[i][0], "NOSUGGEST") && rv.indexOf(sorted_corrections[i][0]) == -1) {
					rv.push(sorted_corrections[i][0]);
				}
				else {
					// If one of the corrections is not eligible as a suggestion , make sure we still return the right number of suggestions.
					working_limit++;
				}
			}

			return rv;
		}
		
		this.memoized[word] = {
			'suggestions': correct(word),
			'limit': limit
		};

		return this.memoized[word]['suggestions'];
	}
};
})();

// Support for use as a node.js module.
if (typeof module !== 'undefined') {
	module.exports = Typo;
}

}).call(this,"/vendor/wordsuite/data/typo/typo")

},{"fs":1}],3:[function(require,module,exports){
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


},{"./data/typo/typo":2}]},{},[3])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvYnJvd3Nlci1yZXNvbHZlL2VtcHR5LmpzIiwidmVuZG9yL3dvcmRzdWl0ZS9kYXRhL3R5cG8vdHlwby90eXBvLmpzIiwidmVuZG9yL3dvcmRzdWl0ZS93b3JrZXIuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTs7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUMvOEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24oKXtmdW5jdGlvbiByKGUsbix0KXtmdW5jdGlvbiBvKGksZil7aWYoIW5baV0pe2lmKCFlW2ldKXt2YXIgYz1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlO2lmKCFmJiZjKXJldHVybiBjKGksITApO2lmKHUpcmV0dXJuIHUoaSwhMCk7dmFyIGE9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitpK1wiJ1wiKTt0aHJvdyBhLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsYX12YXIgcD1uW2ldPXtleHBvcnRzOnt9fTtlW2ldWzBdLmNhbGwocC5leHBvcnRzLGZ1bmN0aW9uKHIpe3ZhciBuPWVbaV1bMV1bcl07cmV0dXJuIG8obnx8cil9LHAscC5leHBvcnRzLHIsZSxuLHQpfXJldHVybiBuW2ldLmV4cG9ydHN9Zm9yKHZhciB1PVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmUsaT0wO2k8dC5sZW5ndGg7aSsrKW8odFtpXSk7cmV0dXJuIG99cmV0dXJuIHJ9KSgpIiwiIiwiLyogZ2xvYmFscyBjaHJvbWU6IGZhbHNlICovXG4vKiBnbG9iYWxzIF9fZGlybmFtZTogZmFsc2UgKi9cbi8qIGdsb2JhbHMgcmVxdWlyZTogZmFsc2UgKi9cbi8qIGdsb2JhbHMgQnVmZmVyOiBmYWxzZSAqL1xuLyogZ2xvYmFscyBtb2R1bGU6IGZhbHNlICovXG5cbi8qKlxuICogVHlwbyBpcyBhIEphdmFTY3JpcHQgaW1wbGVtZW50YXRpb24gb2YgYSBzcGVsbGNoZWNrZXIgdXNpbmcgaHVuc3BlbGwtc3R5bGUgXG4gKiBkaWN0aW9uYXJpZXMuXG4gKi9cblxudmFyIFR5cG87XG5cbihmdW5jdGlvbiAoKSB7XG5cInVzZSBzdHJpY3RcIjtcblxuLyoqXG4gKiBUeXBvIGNvbnN0cnVjdG9yLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBbZGljdGlvbmFyeV0gVGhlIGxvY2FsZSBjb2RlIG9mIHRoZSBkaWN0aW9uYXJ5IGJlaW5nIHVzZWQuIGUuZy4sXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZW5fVVNcIi4gVGhpcyBpcyBvbmx5IHVzZWQgdG8gYXV0by1sb2FkIGRpY3Rpb25hcmllcy5cbiAqIEBwYXJhbSB7U3RyaW5nfSBbYWZmRGF0YV0gICAgVGhlIGRhdGEgZnJvbSB0aGUgZGljdGlvbmFyeSdzIC5hZmYgZmlsZS4gSWYgb21pdHRlZFxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhbmQgVHlwby5qcyBpcyBiZWluZyB1c2VkIGluIGEgQ2hyb21lIGV4dGVuc2lvbiwgdGhlIC5hZmZcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZmlsZSB3aWxsIGJlIGxvYWRlZCBhdXRvbWF0aWNhbGx5IGZyb21cbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGliL3R5cG8vZGljdGlvbmFyaWVzL1tkaWN0aW9uYXJ5XS9bZGljdGlvbmFyeV0uYWZmXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIEluIG90aGVyIGVudmlyb25tZW50cywgaXQgd2lsbCBiZSBsb2FkZWQgZnJvbVxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICBbc2V0dGluZ3MuZGljdGlvbmFyeVBhdGhdL2RpY3Rpb25hcmllcy9bZGljdGlvbmFyeV0vW2RpY3Rpb25hcnldLmFmZlxuICogQHBhcmFtIHtTdHJpbmd9IFt3b3Jkc0RhdGFdICBUaGUgZGF0YSBmcm9tIHRoZSBkaWN0aW9uYXJ5J3MgLmRpYyBmaWxlLiBJZiBvbWl0dGVkXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFuZCBUeXBvLmpzIGlzIGJlaW5nIHVzZWQgaW4gYSBDaHJvbWUgZXh0ZW5zaW9uLCB0aGUgLmRpY1xuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaWxlIHdpbGwgYmUgbG9hZGVkIGF1dG9tYXRpY2FsbHkgZnJvbVxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaWIvdHlwby9kaWN0aW9uYXJpZXMvW2RpY3Rpb25hcnldL1tkaWN0aW9uYXJ5XS5kaWNcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgSW4gb3RoZXIgZW52aXJvbm1lbnRzLCBpdCB3aWxsIGJlIGxvYWRlZCBmcm9tXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFtzZXR0aW5ncy5kaWN0aW9uYXJ5UGF0aF0vZGljdGlvbmFyaWVzL1tkaWN0aW9uYXJ5XS9bZGljdGlvbmFyeV0uZGljXG4gKiBAcGFyYW0ge09iamVjdH0gW3NldHRpbmdzXSAgIENvbnN0cnVjdG9yIHNldHRpbmdzLiBBdmFpbGFibGUgcHJvcGVydGllcyBhcmU6XG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHtTdHJpbmd9IFtkaWN0aW9uYXJ5UGF0aF06IHBhdGggdG8gbG9hZCBkaWN0aW9uYXJ5IGZyb20gaW4gbm9uLWNocm9tZVxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbnZpcm9ubWVudC5cbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAge09iamVjdH0gW2ZsYWdzXTogZmxhZyBpbmZvcm1hdGlvbi5cbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAge0Jvb2xlYW59IFthc3luY0xvYWRdOiBJZiB0cnVlLCBhZmZEYXRhIGFuZCB3b3Jkc0RhdGEgd2lsbCBiZSBsb2FkZWRcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYXN5bmNocm9ub3VzbHkuXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHtGdW5jdGlvbn0gW2xvYWRlZENhbGxiYWNrXTogQ2FsbGVkIHdoZW4gYm90aCBhZmZEYXRhIGFuZCB3b3Jkc0RhdGFcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaGF2ZSBiZWVuIGxvYWRlZC4gT25seSB1c2VkIGlmIGFzeW5jTG9hZCBpcyBzZXQgdG8gdHJ1ZS4gVGhlIHBhcmFtZXRlclxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpcyB0aGUgaW5zdGFudGlhdGVkIFR5cG8gb2JqZWN0LlxuICpcbiAqIEByZXR1cm5zIHtUeXBvfSBBIFR5cG8gb2JqZWN0LlxuICovXG5cblR5cG8gPSBmdW5jdGlvbiAoZGljdGlvbmFyeSwgYWZmRGF0YSwgd29yZHNEYXRhLCBzZXR0aW5ncykge1xuXHRzZXR0aW5ncyA9IHNldHRpbmdzIHx8IHt9O1xuXG5cdHRoaXMuZGljdGlvbmFyeSA9IG51bGw7XG5cdFxuXHR0aGlzLnJ1bGVzID0ge307XG5cdHRoaXMuZGljdGlvbmFyeVRhYmxlID0ge307XG5cdFxuXHR0aGlzLmNvbXBvdW5kUnVsZXMgPSBbXTtcblx0dGhpcy5jb21wb3VuZFJ1bGVDb2RlcyA9IHt9O1xuXHRcblx0dGhpcy5yZXBsYWNlbWVudFRhYmxlID0gW107XG5cdFxuXHR0aGlzLmZsYWdzID0gc2V0dGluZ3MuZmxhZ3MgfHwge307IFxuXHRcblx0dGhpcy5tZW1vaXplZCA9IHt9O1xuXG5cdHRoaXMubG9hZGVkID0gZmFsc2U7XG5cdFxuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdFxuXHR2YXIgcGF0aDtcblx0XG5cdC8vIExvb3AtY29udHJvbCB2YXJpYWJsZXMuXG5cdHZhciBpLCBqLCBfbGVuLCBfamxlbjtcblx0XG5cdGlmIChkaWN0aW9uYXJ5KSB7XG5cdFx0c2VsZi5kaWN0aW9uYXJ5ID0gZGljdGlvbmFyeTtcblx0XHRcblx0XHQvLyBJZiB0aGUgZGF0YSBpcyBwcmVsb2FkZWQsIGp1c3Qgc2V0dXAgdGhlIFR5cG8gb2JqZWN0LlxuXHRcdGlmIChhZmZEYXRhICYmIHdvcmRzRGF0YSkge1xuXHRcdFx0c2V0dXAoKTtcblx0XHR9XG5cdFx0Ly8gTG9hZGluZyBkYXRhIGZvciBDaHJvbWUgZXh0ZW50aW9ucy5cblx0XHRlbHNlIGlmICh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJyAmJiAnY2hyb21lJyBpbiB3aW5kb3cgJiYgJ2V4dGVuc2lvbicgaW4gd2luZG93LmNocm9tZSAmJiAnZ2V0VVJMJyBpbiB3aW5kb3cuY2hyb21lLmV4dGVuc2lvbikge1xuXHRcdFx0aWYgKHNldHRpbmdzLmRpY3Rpb25hcnlQYXRoKSB7XG5cdFx0XHRcdHBhdGggPSBzZXR0aW5ncy5kaWN0aW9uYXJ5UGF0aDtcblx0XHRcdH1cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRwYXRoID0gXCJ0eXBvL2RpY3Rpb25hcmllc1wiO1xuXHRcdFx0fVxuXHRcdFx0XG5cdFx0XHRpZiAoIWFmZkRhdGEpIHJlYWREYXRhRmlsZShjaHJvbWUuZXh0ZW5zaW9uLmdldFVSTChwYXRoICsgXCIvXCIgKyBkaWN0aW9uYXJ5ICsgXCIvXCIgKyBkaWN0aW9uYXJ5ICsgXCIuYWZmLnR4dFwiKSwgc2V0QWZmRGF0YSk7XG5cdFx0XHRpZiAoIXdvcmRzRGF0YSkgcmVhZERhdGFGaWxlKGNocm9tZS5leHRlbnNpb24uZ2V0VVJMKHBhdGggKyBcIi9cIiArIGRpY3Rpb25hcnkgKyBcIi9cIiArIGRpY3Rpb25hcnkgKyBcIi5kaWMudHh0XCIpLCBzZXRXb3Jkc0RhdGEpO1xuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdGlmIChzZXR0aW5ncy5kaWN0aW9uYXJ5UGF0aCkge1xuXHRcdFx0XHRwYXRoID0gc2V0dGluZ3MuZGljdGlvbmFyeVBhdGg7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIGlmICh0eXBlb2YgX19kaXJuYW1lICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRwYXRoID0gX19kaXJuYW1lICsgJy9kaWN0aW9uYXJpZXMnO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdHBhdGggPSAnLi9kaWN0aW9uYXJpZXMnO1xuXHRcdFx0fVxuXHRcdFx0XG5cdFx0XHRpZiAoIWFmZkRhdGEpIHJlYWREYXRhRmlsZShwYXRoICsgXCIvXCIgKyBkaWN0aW9uYXJ5ICsgXCIvXCIgKyBkaWN0aW9uYXJ5ICsgXCIuYWZmLnR4dFwiLCBzZXRBZmZEYXRhKTtcblx0XHRcdGlmICghd29yZHNEYXRhKSByZWFkRGF0YUZpbGUocGF0aCArIFwiL1wiICsgZGljdGlvbmFyeSArIFwiL1wiICsgZGljdGlvbmFyeSArIFwiLmRpYy50eHRcIiwgc2V0V29yZHNEYXRhKTtcblx0XHR9XG5cdH1cblx0XG5cdGZ1bmN0aW9uIHJlYWREYXRhRmlsZSh1cmwsIHNldEZ1bmMpIHtcblx0XHR2YXIgcmVzcG9uc2UgPSBzZWxmLl9yZWFkRmlsZSh1cmwsIG51bGwsIHNldHRpbmdzLmFzeW5jTG9hZCk7XG5cdFx0XG5cdFx0aWYgKHNldHRpbmdzLmFzeW5jTG9hZCkge1xuXHRcdFx0cmVzcG9uc2UudGhlbihmdW5jdGlvbihkYXRhKSB7XG5cdFx0XHRcdHNldEZ1bmMoZGF0YSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0ZWxzZSB7XG5cdFx0XHRzZXRGdW5jKHJlc3BvbnNlKTtcblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiBzZXRBZmZEYXRhKGRhdGEpIHtcblx0XHRhZmZEYXRhID0gZGF0YTtcblxuXHRcdGlmICh3b3Jkc0RhdGEpIHtcblx0XHRcdHNldHVwKCk7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gc2V0V29yZHNEYXRhKGRhdGEpIHtcblx0XHR3b3Jkc0RhdGEgPSBkYXRhO1xuXG5cdFx0aWYgKGFmZkRhdGEpIHtcblx0XHRcdHNldHVwKCk7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gc2V0dXAoKSB7XG5cdFx0c2VsZi5ydWxlcyA9IHNlbGYuX3BhcnNlQUZGKGFmZkRhdGEpO1xuXHRcdFxuXHRcdC8vIFNhdmUgdGhlIHJ1bGUgY29kZXMgdGhhdCBhcmUgdXNlZCBpbiBjb21wb3VuZCBydWxlcy5cblx0XHRzZWxmLmNvbXBvdW5kUnVsZUNvZGVzID0ge307XG5cdFx0XG5cdFx0Zm9yIChpID0gMCwgX2xlbiA9IHNlbGYuY29tcG91bmRSdWxlcy5sZW5ndGg7IGkgPCBfbGVuOyBpKyspIHtcblx0XHRcdHZhciBydWxlID0gc2VsZi5jb21wb3VuZFJ1bGVzW2ldO1xuXHRcdFx0XG5cdFx0XHRmb3IgKGogPSAwLCBfamxlbiA9IHJ1bGUubGVuZ3RoOyBqIDwgX2psZW47IGorKykge1xuXHRcdFx0XHRzZWxmLmNvbXBvdW5kUnVsZUNvZGVzW3J1bGVbal1dID0gW107XG5cdFx0XHR9XG5cdFx0fVxuXHRcdFxuXHRcdC8vIElmIHdlIGFkZCB0aGlzIE9OTFlJTkNPTVBPVU5EIGZsYWcgdG8gc2VsZi5jb21wb3VuZFJ1bGVDb2RlcywgdGhlbiBfcGFyc2VESUNcblx0XHQvLyB3aWxsIGRvIHRoZSB3b3JrIG9mIHNhdmluZyB0aGUgbGlzdCBvZiB3b3JkcyB0aGF0IGFyZSBjb21wb3VuZC1vbmx5LlxuXHRcdGlmIChcIk9OTFlJTkNPTVBPVU5EXCIgaW4gc2VsZi5mbGFncykge1xuXHRcdFx0c2VsZi5jb21wb3VuZFJ1bGVDb2Rlc1tzZWxmLmZsYWdzLk9OTFlJTkNPTVBPVU5EXSA9IFtdO1xuXHRcdH1cblx0XHRcblx0XHRzZWxmLmRpY3Rpb25hcnlUYWJsZSA9IHNlbGYuX3BhcnNlRElDKHdvcmRzRGF0YSk7XG5cdFx0XG5cdFx0Ly8gR2V0IHJpZCBvZiBhbnkgY29kZXMgZnJvbSB0aGUgY29tcG91bmQgcnVsZSBjb2RlcyB0aGF0IGFyZSBuZXZlciB1c2VkIFxuXHRcdC8vIChvciB0aGF0IHdlcmUgc3BlY2lhbCByZWdleCBjaGFyYWN0ZXJzKS4gIE5vdCBlc3BlY2lhbGx5IG5lY2Vzc2FyeS4uLiBcblx0XHRmb3IgKGkgaW4gc2VsZi5jb21wb3VuZFJ1bGVDb2Rlcykge1xuXHRcdFx0aWYgKHNlbGYuY29tcG91bmRSdWxlQ29kZXNbaV0ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdGRlbGV0ZSBzZWxmLmNvbXBvdW5kUnVsZUNvZGVzW2ldO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRcblx0XHQvLyBCdWlsZCB0aGUgZnVsbCByZWd1bGFyIGV4cHJlc3Npb25zIGZvciBlYWNoIGNvbXBvdW5kIHJ1bGUuXG5cdFx0Ly8gSSBoYXZlIGEgZmVlbGluZyAoYnV0IG5vIGNvbmZpcm1hdGlvbiB5ZXQpIHRoYXQgdGhpcyBtZXRob2Qgb2YgXG5cdFx0Ly8gdGVzdGluZyBmb3IgY29tcG91bmQgd29yZHMgaXMgcHJvYmFibHkgc2xvdy5cblx0XHRmb3IgKGkgPSAwLCBfbGVuID0gc2VsZi5jb21wb3VuZFJ1bGVzLmxlbmd0aDsgaSA8IF9sZW47IGkrKykge1xuXHRcdFx0dmFyIHJ1bGVUZXh0ID0gc2VsZi5jb21wb3VuZFJ1bGVzW2ldO1xuXHRcdFx0XG5cdFx0XHR2YXIgZXhwcmVzc2lvblRleHQgPSBcIlwiO1xuXHRcdFx0XG5cdFx0XHRmb3IgKGogPSAwLCBfamxlbiA9IHJ1bGVUZXh0Lmxlbmd0aDsgaiA8IF9qbGVuOyBqKyspIHtcblx0XHRcdFx0dmFyIGNoYXJhY3RlciA9IHJ1bGVUZXh0W2pdO1xuXHRcdFx0XHRcblx0XHRcdFx0aWYgKGNoYXJhY3RlciBpbiBzZWxmLmNvbXBvdW5kUnVsZUNvZGVzKSB7XG5cdFx0XHRcdFx0ZXhwcmVzc2lvblRleHQgKz0gXCIoXCIgKyBzZWxmLmNvbXBvdW5kUnVsZUNvZGVzW2NoYXJhY3Rlcl0uam9pbihcInxcIikgKyBcIilcIjtcblx0XHRcdFx0fVxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRleHByZXNzaW9uVGV4dCArPSBjaGFyYWN0ZXI7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdFxuXHRcdFx0c2VsZi5jb21wb3VuZFJ1bGVzW2ldID0gbmV3IFJlZ0V4cChleHByZXNzaW9uVGV4dCwgXCJpXCIpO1xuXHRcdH1cblx0XHRcblx0XHRzZWxmLmxvYWRlZCA9IHRydWU7XG5cdFx0XG5cdFx0aWYgKHNldHRpbmdzLmFzeW5jTG9hZCAmJiBzZXR0aW5ncy5sb2FkZWRDYWxsYmFjaykge1xuXHRcdFx0c2V0dGluZ3MubG9hZGVkQ2FsbGJhY2soc2VsZik7XG5cdFx0fVxuXHR9XG5cdFxuXHRyZXR1cm4gdGhpcztcbn07XG5cblR5cG8ucHJvdG90eXBlID0ge1xuXHQvKipcblx0ICogTG9hZHMgYSBUeXBvIGluc3RhbmNlIGZyb20gYSBoYXNoIG9mIGFsbCBvZiB0aGUgVHlwbyBwcm9wZXJ0aWVzLlxuXHQgKlxuXHQgKiBAcGFyYW0gb2JqZWN0IG9iaiBBIGhhc2ggb2YgVHlwbyBwcm9wZXJ0aWVzLCBwcm9iYWJseSBnb3R0ZW4gZnJvbSBhIEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkodHlwb19pbnN0YW5jZSkpLlxuXHQgKi9cblx0XG5cdGxvYWQgOiBmdW5jdGlvbiAob2JqKSB7XG5cdFx0Zm9yICh2YXIgaSBpbiBvYmopIHtcblx0XHRcdGlmIChvYmouaGFzT3duUHJvcGVydHkoaSkpIHtcblx0XHRcdFx0dGhpc1tpXSA9IG9ialtpXTtcblx0XHRcdH1cblx0XHR9XG5cdFx0XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cdFxuXHQvKipcblx0ICogUmVhZCB0aGUgY29udGVudHMgb2YgYSBmaWxlLlxuXHQgKiBcblx0ICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIHBhdGggKHJlbGF0aXZlKSB0byB0aGUgZmlsZS5cblx0ICogQHBhcmFtIHtTdHJpbmd9IFtjaGFyc2V0PVwiSVNPODg1OS0xXCJdIFRoZSBleHBlY3RlZCBjaGFyc2V0IG9mIHRoZSBmaWxlXG5cdCAqIEBwYXJhbSB7Qm9vbGVhbn0gYXN5bmMgSWYgdHJ1ZSwgdGhlIGZpbGUgd2lsbCBiZSByZWFkIGFzeW5jaHJvbm91c2x5LiBGb3Igbm9kZS5qcyB0aGlzIGRvZXMgbm90aGluZywgYWxsXG5cdCAqICAgICAgICBmaWxlcyBhcmUgcmVhZCBzeW5jaHJvbm91c2x5LlxuXHQgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgZmlsZSBkYXRhIGlmIGFzeW5jIGlzIGZhbHNlLCBvdGhlcndpc2UgYSBwcm9taXNlIG9iamVjdC4gSWYgcnVubmluZyBub2RlLmpzLCB0aGUgZGF0YSBpc1xuXHQgKiAgICAgICAgICBhbHdheXMgcmV0dXJuZWQuXG5cdCAqL1xuXHRcblx0X3JlYWRGaWxlIDogZnVuY3Rpb24gKHBhdGgsIGNoYXJzZXQsIGFzeW5jKSB7XG5cdFx0Y2hhcnNldCA9IGNoYXJzZXQgfHwgXCJ1dGY4XCI7XG5cdFx0XG5cdFx0aWYgKHR5cGVvZiBYTUxIdHRwUmVxdWVzdCAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHZhciBwcm9taXNlO1xuXHRcdFx0dmFyIHJlcSA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuXHRcdFx0cmVxLm9wZW4oXCJHRVRcIiwgcGF0aCwgYXN5bmMpO1xuXHRcdFx0XG5cdFx0XHRpZiAoYXN5bmMpIHtcblx0XHRcdFx0cHJvbWlzZSA9IG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xuXHRcdFx0XHRcdHJlcS5vbmxvYWQgPSBmdW5jdGlvbigpIHtcblx0XHRcdFx0XHRcdGlmIChyZXEuc3RhdHVzID09PSAyMDApIHtcblx0XHRcdFx0XHRcdFx0cmVzb2x2ZShyZXEucmVzcG9uc2VUZXh0KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRyZWplY3QocmVxLnN0YXR1c1RleHQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XG5cdFx0XHRcdFx0cmVxLm9uZXJyb3IgPSBmdW5jdGlvbigpIHtcblx0XHRcdFx0XHRcdHJlamVjdChyZXEuc3RhdHVzVGV4dCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcblx0XHRcdGlmIChyZXEub3ZlcnJpZGVNaW1lVHlwZSlcblx0XHRcdFx0cmVxLm92ZXJyaWRlTWltZVR5cGUoXCJ0ZXh0L3BsYWluOyBjaGFyc2V0PVwiICsgY2hhcnNldCk7XG5cdFx0XG5cdFx0XHRyZXEuc2VuZChudWxsKTtcblx0XHRcdFxuXHRcdFx0cmV0dXJuIGFzeW5jID8gcHJvbWlzZSA6IHJlcS5yZXNwb25zZVRleHQ7XG5cdFx0fVxuXHRcdGVsc2UgaWYgKHR5cGVvZiByZXF1aXJlICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0Ly8gTm9kZS5qc1xuXHRcdFx0dmFyIGZzID0gcmVxdWlyZShcImZzXCIpO1xuXHRcdFx0XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRpZiAoZnMuZXhpc3RzU3luYyhwYXRoKSkge1xuXHRcdFx0XHRcdHJldHVybiBmcy5yZWFkRmlsZVN5bmMocGF0aCwgY2hhcnNldCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0Y29uc29sZS5sb2coXCJQYXRoIFwiICsgcGF0aCArIFwiIGRvZXMgbm90IGV4aXN0LlwiKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRjb25zb2xlLmxvZyhlKTtcblx0XHRcdFx0cmV0dXJuICcnO1xuXHRcdFx0fVxuXHRcdH1cblx0fSxcblx0XG5cdC8qKlxuXHQgKiBQYXJzZSB0aGUgcnVsZXMgb3V0IGZyb20gYSAuYWZmIGZpbGUuXG5cdCAqXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBkYXRhIFRoZSBjb250ZW50cyBvZiB0aGUgYWZmaXggZmlsZS5cblx0ICogQHJldHVybnMgb2JqZWN0IFRoZSBydWxlcyBmcm9tIHRoZSBmaWxlLlxuXHQgKi9cblx0XG5cdF9wYXJzZUFGRiA6IGZ1bmN0aW9uIChkYXRhKSB7XG5cdFx0dmFyIHJ1bGVzID0ge307XG5cdFx0XG5cdFx0dmFyIGxpbmUsIHN1YmxpbmUsIG51bUVudHJpZXMsIGxpbmVQYXJ0cztcblx0XHR2YXIgaSwgaiwgX2xlbiwgX2psZW47XG5cdFx0XG5cdFx0Ly8gUmVtb3ZlIGNvbW1lbnQgbGluZXNcblx0XHRkYXRhID0gdGhpcy5fcmVtb3ZlQWZmaXhDb21tZW50cyhkYXRhKTtcblx0XHRcblx0XHR2YXIgbGluZXMgPSBkYXRhLnNwbGl0KC9cXHI/XFxuLyk7XG5cdFx0XG5cdFx0Zm9yIChpID0gMCwgX2xlbiA9IGxpbmVzLmxlbmd0aDsgaSA8IF9sZW47IGkrKykge1xuXHRcdFx0bGluZSA9IGxpbmVzW2ldO1xuXHRcdFx0XG5cdFx0XHR2YXIgZGVmaW5pdGlvblBhcnRzID0gbGluZS5zcGxpdCgvXFxzKy8pO1xuXHRcdFx0XG5cdFx0XHR2YXIgcnVsZVR5cGUgPSBkZWZpbml0aW9uUGFydHNbMF07XG5cdFx0XHRcblx0XHRcdGlmIChydWxlVHlwZSA9PSBcIlBGWFwiIHx8IHJ1bGVUeXBlID09IFwiU0ZYXCIpIHtcblx0XHRcdFx0dmFyIHJ1bGVDb2RlID0gZGVmaW5pdGlvblBhcnRzWzFdO1xuXHRcdFx0XHR2YXIgY29tYmluZWFibGUgPSBkZWZpbml0aW9uUGFydHNbMl07XG5cdFx0XHRcdG51bUVudHJpZXMgPSBwYXJzZUludChkZWZpbml0aW9uUGFydHNbM10sIDEwKTtcblx0XHRcdFx0XG5cdFx0XHRcdHZhciBlbnRyaWVzID0gW107XG5cdFx0XHRcdFxuXHRcdFx0XHRmb3IgKGogPSBpICsgMSwgX2psZW4gPSBpICsgMSArIG51bUVudHJpZXM7IGogPCBfamxlbjsgaisrKSB7XG5cdFx0XHRcdFx0c3VibGluZSA9IGxpbmVzW2pdO1xuXHRcdFx0XHRcdFxuXHRcdFx0XHRcdGxpbmVQYXJ0cyA9IHN1YmxpbmUuc3BsaXQoL1xccysvKTtcblx0XHRcdFx0XHR2YXIgY2hhcmFjdGVyc1RvUmVtb3ZlID0gbGluZVBhcnRzWzJdO1xuXHRcdFx0XHRcdFxuXHRcdFx0XHRcdHZhciBhZGRpdGlvblBhcnRzID0gbGluZVBhcnRzWzNdLnNwbGl0KFwiL1wiKTtcblx0XHRcdFx0XHRcblx0XHRcdFx0XHR2YXIgY2hhcmFjdGVyc1RvQWRkID0gYWRkaXRpb25QYXJ0c1swXTtcblx0XHRcdFx0XHRpZiAoY2hhcmFjdGVyc1RvQWRkID09PSBcIjBcIikgY2hhcmFjdGVyc1RvQWRkID0gXCJcIjtcblx0XHRcdFx0XHRcblx0XHRcdFx0XHR2YXIgY29udGludWF0aW9uQ2xhc3NlcyA9IHRoaXMucGFyc2VSdWxlQ29kZXMoYWRkaXRpb25QYXJ0c1sxXSk7XG5cdFx0XHRcdFx0XG5cdFx0XHRcdFx0dmFyIHJlZ2V4VG9NYXRjaCA9IGxpbmVQYXJ0c1s0XTtcblx0XHRcdFx0XHRcblx0XHRcdFx0XHR2YXIgZW50cnkgPSB7fTtcblx0XHRcdFx0XHRlbnRyeS5hZGQgPSBjaGFyYWN0ZXJzVG9BZGQ7XG5cdFx0XHRcdFx0XG5cdFx0XHRcdFx0aWYgKGNvbnRpbnVhdGlvbkNsYXNzZXMubGVuZ3RoID4gMCkgZW50cnkuY29udGludWF0aW9uQ2xhc3NlcyA9IGNvbnRpbnVhdGlvbkNsYXNzZXM7XG5cdFx0XHRcdFx0XG5cdFx0XHRcdFx0aWYgKHJlZ2V4VG9NYXRjaCAhPT0gXCIuXCIpIHtcblx0XHRcdFx0XHRcdGlmIChydWxlVHlwZSA9PT0gXCJTRlhcIikge1xuXHRcdFx0XHRcdFx0XHRlbnRyeS5tYXRjaCA9IG5ldyBSZWdFeHAocmVnZXhUb01hdGNoICsgXCIkXCIpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGVudHJ5Lm1hdGNoID0gbmV3IFJlZ0V4cChcIl5cIiArIHJlZ2V4VG9NYXRjaCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFxuXHRcdFx0XHRcdGlmIChjaGFyYWN0ZXJzVG9SZW1vdmUgIT0gXCIwXCIpIHtcblx0XHRcdFx0XHRcdGlmIChydWxlVHlwZSA9PT0gXCJTRlhcIikge1xuXHRcdFx0XHRcdFx0XHRlbnRyeS5yZW1vdmUgPSBuZXcgUmVnRXhwKGNoYXJhY3RlcnNUb1JlbW92ZSAgKyBcIiRcIik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRcdFx0ZW50cnkucmVtb3ZlID0gY2hhcmFjdGVyc1RvUmVtb3ZlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcblx0XHRcdFx0XHRlbnRyaWVzLnB1c2goZW50cnkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdFxuXHRcdFx0XHRydWxlc1tydWxlQ29kZV0gPSB7IFwidHlwZVwiIDogcnVsZVR5cGUsIFwiY29tYmluZWFibGVcIiA6IChjb21iaW5lYWJsZSA9PSBcIllcIiksIFwiZW50cmllc1wiIDogZW50cmllcyB9O1xuXHRcdFx0XHRcblx0XHRcdFx0aSArPSBudW1FbnRyaWVzO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSBpZiAocnVsZVR5cGUgPT09IFwiQ09NUE9VTkRSVUxFXCIpIHtcblx0XHRcdFx0bnVtRW50cmllcyA9IHBhcnNlSW50KGRlZmluaXRpb25QYXJ0c1sxXSwgMTApO1xuXHRcdFx0XHRcblx0XHRcdFx0Zm9yIChqID0gaSArIDEsIF9qbGVuID0gaSArIDEgKyBudW1FbnRyaWVzOyBqIDwgX2psZW47IGorKykge1xuXHRcdFx0XHRcdGxpbmUgPSBsaW5lc1tqXTtcblx0XHRcdFx0XHRcblx0XHRcdFx0XHRsaW5lUGFydHMgPSBsaW5lLnNwbGl0KC9cXHMrLyk7XG5cdFx0XHRcdFx0dGhpcy5jb21wb3VuZFJ1bGVzLnB1c2gobGluZVBhcnRzWzFdKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRcblx0XHRcdFx0aSArPSBudW1FbnRyaWVzO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSBpZiAocnVsZVR5cGUgPT09IFwiUkVQXCIpIHtcblx0XHRcdFx0bGluZVBhcnRzID0gbGluZS5zcGxpdCgvXFxzKy8pO1xuXHRcdFx0XHRcblx0XHRcdFx0aWYgKGxpbmVQYXJ0cy5sZW5ndGggPT09IDMpIHtcblx0XHRcdFx0XHR0aGlzLnJlcGxhY2VtZW50VGFibGUucHVzaChbIGxpbmVQYXJ0c1sxXSwgbGluZVBhcnRzWzJdIF0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0Ly8gT05MWUlOQ09NUE9VTkRcblx0XHRcdFx0Ly8gQ09NUE9VTkRNSU5cblx0XHRcdFx0Ly8gRkxBR1xuXHRcdFx0XHQvLyBLRUVQQ0FTRVxuXHRcdFx0XHQvLyBORUVEQUZGSVhcblx0XHRcdFx0XG5cdFx0XHRcdHRoaXMuZmxhZ3NbcnVsZVR5cGVdID0gZGVmaW5pdGlvblBhcnRzWzFdO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRcblx0XHRyZXR1cm4gcnVsZXM7XG5cdH0sXG5cdFxuXHQvKipcblx0ICogUmVtb3ZlcyBjb21tZW50IGxpbmVzIGFuZCB0aGVuIGNsZWFucyB1cCBibGFuayBsaW5lcyBhbmQgdHJhaWxpbmcgd2hpdGVzcGFjZS5cblx0ICpcblx0ICogQHBhcmFtIHtTdHJpbmd9IGRhdGEgVGhlIGRhdGEgZnJvbSBhbiBhZmZpeCBmaWxlLlxuXHQgKiBAcmV0dXJuIHtTdHJpbmd9IFRoZSBjbGVhbmVkLXVwIGRhdGEuXG5cdCAqL1xuXHRcblx0X3JlbW92ZUFmZml4Q29tbWVudHMgOiBmdW5jdGlvbiAoZGF0YSkge1xuXHRcdC8vIFJlbW92ZSBjb21tZW50c1xuXHRcdC8vIFRoaXMgdXNlZCB0byByZW1vdmUgYW55IHN0cmluZyBzdGFydGluZyB3aXRoICcjJyB1cCB0byB0aGUgZW5kIG9mIHRoZSBsaW5lLFxuXHRcdC8vIGJ1dCBzb21lIENPTVBPVU5EUlVMRSBkZWZpbml0aW9ucyBpbmNsdWRlICcjJyBhcyBwYXJ0IG9mIHRoZSBydWxlLlxuXHRcdC8vIEkgaGF2ZW4ndCBzZWVuIGFueSBhZmZpeCBmaWxlcyB0aGF0IHVzZSBjb21tZW50cyBvbiB0aGUgc2FtZSBsaW5lIGFzIHJlYWwgZGF0YSxcblx0XHQvLyBzbyBJIGRvbid0IHRoaW5rIHRoaXMgd2lsbCBicmVhayBhbnl0aGluZy5cblx0XHRkYXRhID0gZGF0YS5yZXBsYWNlKC9eXFxzKiMuKiQvbWcsIFwiXCIpO1xuXHRcdFxuXHRcdC8vIFRyaW0gZWFjaCBsaW5lXG5cdFx0ZGF0YSA9IGRhdGEucmVwbGFjZSgvXlxcc1xccyovbSwgJycpLnJlcGxhY2UoL1xcc1xccyokL20sICcnKTtcblx0XHRcblx0XHQvLyBSZW1vdmUgYmxhbmsgbGluZXMuXG5cdFx0ZGF0YSA9IGRhdGEucmVwbGFjZSgvXFxuezIsfS9nLCBcIlxcblwiKTtcblx0XHRcblx0XHQvLyBUcmltIHRoZSBlbnRpcmUgc3RyaW5nXG5cdFx0ZGF0YSA9IGRhdGEucmVwbGFjZSgvXlxcc1xccyovLCAnJykucmVwbGFjZSgvXFxzXFxzKiQvLCAnJyk7XG5cdFx0XG5cdFx0cmV0dXJuIGRhdGE7XG5cdH0sXG5cdFxuXHQvKipcblx0ICogUGFyc2VzIHRoZSB3b3JkcyBvdXQgZnJvbSB0aGUgLmRpYyBmaWxlLlxuXHQgKlxuXHQgKiBAcGFyYW0ge1N0cmluZ30gZGF0YSBUaGUgZGF0YSBmcm9tIHRoZSBkaWN0aW9uYXJ5IGZpbGUuXG5cdCAqIEByZXR1cm5zIG9iamVjdCBUaGUgbG9va3VwIHRhYmxlIGNvbnRhaW5pbmcgYWxsIG9mIHRoZSB3b3JkcyBhbmRcblx0ICogICAgICAgICAgICAgICAgIHdvcmQgZm9ybXMgZnJvbSB0aGUgZGljdGlvbmFyeS5cblx0ICovXG5cdFxuXHRfcGFyc2VESUMgOiBmdW5jdGlvbiAoZGF0YSkge1xuXHRcdGRhdGEgPSB0aGlzLl9yZW1vdmVEaWNDb21tZW50cyhkYXRhKTtcblx0XHRcblx0XHR2YXIgbGluZXMgPSBkYXRhLnNwbGl0KC9cXHI/XFxuLyk7XG5cdFx0dmFyIGRpY3Rpb25hcnlUYWJsZSA9IHt9O1xuXHRcdFxuXHRcdGZ1bmN0aW9uIGFkZFdvcmQod29yZCwgcnVsZXMpIHtcblx0XHRcdC8vIFNvbWUgZGljdGlvbmFyaWVzIHdpbGwgbGlzdCB0aGUgc2FtZSB3b3JkIG11bHRpcGxlIHRpbWVzIHdpdGggZGlmZmVyZW50IHJ1bGUgc2V0cy5cblx0XHRcdGlmICghZGljdGlvbmFyeVRhYmxlLmhhc093blByb3BlcnR5KHdvcmQpKSB7XG5cdFx0XHRcdGRpY3Rpb25hcnlUYWJsZVt3b3JkXSA9IG51bGw7XG5cdFx0XHR9XG5cdFx0XHRcblx0XHRcdGlmIChydWxlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGlmIChkaWN0aW9uYXJ5VGFibGVbd29yZF0gPT09IG51bGwpIHtcblx0XHRcdFx0XHRkaWN0aW9uYXJ5VGFibGVbd29yZF0gPSBbXTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGRpY3Rpb25hcnlUYWJsZVt3b3JkXS5wdXNoKHJ1bGVzKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0XG5cdFx0Ly8gVGhlIGZpcnN0IGxpbmUgaXMgdGhlIG51bWJlciBvZiB3b3JkcyBpbiB0aGUgZGljdGlvbmFyeS5cblx0XHRmb3IgKHZhciBpID0gMSwgX2xlbiA9IGxpbmVzLmxlbmd0aDsgaSA8IF9sZW47IGkrKykge1xuXHRcdFx0dmFyIGxpbmUgPSBsaW5lc1tpXTtcblx0XHRcdFxuXHRcdFx0aWYgKCFsaW5lKSB7XG5cdFx0XHRcdC8vIElnbm9yZSBlbXB0eSBsaW5lcy5cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdHZhciBwYXJ0cyA9IGxpbmUuc3BsaXQoXCIvXCIsIDIpO1xuXHRcdFx0XG5cdFx0XHR2YXIgd29yZCA9IHBhcnRzWzBdO1xuXG5cdFx0XHQvLyBOb3cgZm9yIGVhY2ggYWZmaXggcnVsZSwgZ2VuZXJhdGUgdGhhdCBmb3JtIG9mIHRoZSB3b3JkLlxuXHRcdFx0aWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0dmFyIHJ1bGVDb2Rlc0FycmF5ID0gdGhpcy5wYXJzZVJ1bGVDb2RlcyhwYXJ0c1sxXSk7XG5cdFx0XHRcdFxuXHRcdFx0XHQvLyBTYXZlIHRoZSBydWxlQ29kZXMgZm9yIGNvbXBvdW5kIHdvcmQgc2l0dWF0aW9ucy5cblx0XHRcdFx0aWYgKCEoXCJORUVEQUZGSVhcIiBpbiB0aGlzLmZsYWdzKSB8fCBydWxlQ29kZXNBcnJheS5pbmRleE9mKHRoaXMuZmxhZ3MuTkVFREFGRklYKSA9PSAtMSkge1xuXHRcdFx0XHRcdGFkZFdvcmQod29yZCwgcnVsZUNvZGVzQXJyYXkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdFxuXHRcdFx0XHRmb3IgKHZhciBqID0gMCwgX2psZW4gPSBydWxlQ29kZXNBcnJheS5sZW5ndGg7IGogPCBfamxlbjsgaisrKSB7XG5cdFx0XHRcdFx0dmFyIGNvZGUgPSBydWxlQ29kZXNBcnJheVtqXTtcblx0XHRcdFx0XHRcblx0XHRcdFx0XHR2YXIgcnVsZSA9IHRoaXMucnVsZXNbY29kZV07XG5cdFx0XHRcdFx0XG5cdFx0XHRcdFx0aWYgKHJ1bGUpIHtcblx0XHRcdFx0XHRcdHZhciBuZXdXb3JkcyA9IHRoaXMuX2FwcGx5UnVsZSh3b3JkLCBydWxlKTtcblx0XHRcdFx0XHRcdFxuXHRcdFx0XHRcdFx0Zm9yICh2YXIgaWkgPSAwLCBfaWlsZW4gPSBuZXdXb3Jkcy5sZW5ndGg7IGlpIDwgX2lpbGVuOyBpaSsrKSB7XG5cdFx0XHRcdFx0XHRcdHZhciBuZXdXb3JkID0gbmV3V29yZHNbaWldO1xuXHRcdFx0XHRcdFx0XHRcblx0XHRcdFx0XHRcdFx0YWRkV29yZChuZXdXb3JkLCBbXSk7XG5cdFx0XHRcdFx0XHRcdFxuXHRcdFx0XHRcdFx0XHRpZiAocnVsZS5jb21iaW5lYWJsZSkge1xuXHRcdFx0XHRcdFx0XHRcdGZvciAodmFyIGsgPSBqICsgMTsgayA8IF9qbGVuOyBrKyspIHtcblx0XHRcdFx0XHRcdFx0XHRcdHZhciBjb21iaW5lQ29kZSA9IHJ1bGVDb2Rlc0FycmF5W2tdO1xuXHRcdFx0XHRcdFx0XHRcdFx0XG5cdFx0XHRcdFx0XHRcdFx0XHR2YXIgY29tYmluZVJ1bGUgPSB0aGlzLnJ1bGVzW2NvbWJpbmVDb2RlXTtcblx0XHRcdFx0XHRcdFx0XHRcdFxuXHRcdFx0XHRcdFx0XHRcdFx0aWYgKGNvbWJpbmVSdWxlKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGlmIChjb21iaW5lUnVsZS5jb21iaW5lYWJsZSAmJiAocnVsZS50eXBlICE9IGNvbWJpbmVSdWxlLnR5cGUpKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0dmFyIG90aGVyTmV3V29yZHMgPSB0aGlzLl9hcHBseVJ1bGUobmV3V29yZCwgY29tYmluZVJ1bGUpO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGZvciAodmFyIGlpaSA9IDAsIF9paWlsZW4gPSBvdGhlck5ld1dvcmRzLmxlbmd0aDsgaWlpIDwgX2lpaWxlbjsgaWlpKyspIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdHZhciBvdGhlck5ld1dvcmQgPSBvdGhlck5ld1dvcmRzW2lpaV07XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRhZGRXb3JkKG90aGVyTmV3V29yZCwgW10pO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcblx0XHRcdFx0XHRpZiAoY29kZSBpbiB0aGlzLmNvbXBvdW5kUnVsZUNvZGVzKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmNvbXBvdW5kUnVsZUNvZGVzW2NvZGVdLnB1c2god29yZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0YWRkV29yZCh3b3JkLnRyaW0oKSwgW10pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRcblx0XHRyZXR1cm4gZGljdGlvbmFyeVRhYmxlO1xuXHR9LFxuXHRcblx0XG5cdC8qKlxuXHQgKiBSZW1vdmVzIGNvbW1lbnQgbGluZXMgYW5kIHRoZW4gY2xlYW5zIHVwIGJsYW5rIGxpbmVzIGFuZCB0cmFpbGluZyB3aGl0ZXNwYWNlLlxuXHQgKlxuXHQgKiBAcGFyYW0ge1N0cmluZ30gZGF0YSBUaGUgZGF0YSBmcm9tIGEgLmRpYyBmaWxlLlxuXHQgKiBAcmV0dXJuIHtTdHJpbmd9IFRoZSBjbGVhbmVkLXVwIGRhdGEuXG5cdCAqL1xuXHRcblx0X3JlbW92ZURpY0NvbW1lbnRzIDogZnVuY3Rpb24gKGRhdGEpIHtcblx0XHQvLyBJIGNhbid0IGZpbmQgYW55IG9mZmljaWFsIGRvY3VtZW50YXRpb24gb24gaXQsIGJ1dCBhdCBsZWFzdCB0aGUgZGVfREVcblx0XHQvLyBkaWN0aW9uYXJ5IHVzZXMgdGFiLWluZGVudGVkIGxpbmVzIGFzIGNvbW1lbnRzLlxuXHRcdFxuXHRcdC8vIFJlbW92ZSBjb21tZW50c1xuXHRcdGRhdGEgPSBkYXRhLnJlcGxhY2UoL15cXHQuKiQvbWcsIFwiXCIpO1xuXHRcdFxuXHRcdHJldHVybiBkYXRhO1xuXHR9LFxuXHRcblx0cGFyc2VSdWxlQ29kZXMgOiBmdW5jdGlvbiAodGV4dENvZGVzKSB7XG5cdFx0aWYgKCF0ZXh0Q29kZXMpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0ZWxzZSBpZiAoIShcIkZMQUdcIiBpbiB0aGlzLmZsYWdzKSkge1xuXHRcdFx0cmV0dXJuIHRleHRDb2Rlcy5zcGxpdChcIlwiKTtcblx0XHR9XG5cdFx0ZWxzZSBpZiAodGhpcy5mbGFncy5GTEFHID09PSBcImxvbmdcIikge1xuXHRcdFx0dmFyIGZsYWdzID0gW107XG5cdFx0XHRcblx0XHRcdGZvciAodmFyIGkgPSAwLCBfbGVuID0gdGV4dENvZGVzLmxlbmd0aDsgaSA8IF9sZW47IGkgKz0gMikge1xuXHRcdFx0XHRmbGFncy5wdXNoKHRleHRDb2Rlcy5zdWJzdHIoaSwgMikpO1xuXHRcdFx0fVxuXHRcdFx0XG5cdFx0XHRyZXR1cm4gZmxhZ3M7XG5cdFx0fVxuXHRcdGVsc2UgaWYgKHRoaXMuZmxhZ3MuRkxBRyA9PT0gXCJudW1cIikge1xuXHRcdFx0cmV0dXJuIHRleHRDb2Rlcy5zcGxpdChcIixcIik7XG5cdFx0fVxuXHR9LFxuXHRcblx0LyoqXG5cdCAqIEFwcGxpZXMgYW4gYWZmaXggcnVsZSB0byBhIHdvcmQuXG5cdCAqXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSB3b3JkIFRoZSBiYXNlIHdvcmQuXG5cdCAqIEBwYXJhbSB7T2JqZWN0fSBydWxlIFRoZSBhZmZpeCBydWxlLlxuXHQgKiBAcmV0dXJucyB7U3RyaW5nW119IFRoZSBuZXcgd29yZHMgZ2VuZXJhdGVkIGJ5IHRoZSBydWxlLlxuXHQgKi9cblx0XG5cdF9hcHBseVJ1bGUgOiBmdW5jdGlvbiAod29yZCwgcnVsZSkge1xuXHRcdHZhciBlbnRyaWVzID0gcnVsZS5lbnRyaWVzO1xuXHRcdHZhciBuZXdXb3JkcyA9IFtdO1xuXHRcdFxuXHRcdGZvciAodmFyIGkgPSAwLCBfbGVuID0gZW50cmllcy5sZW5ndGg7IGkgPCBfbGVuOyBpKyspIHtcblx0XHRcdHZhciBlbnRyeSA9IGVudHJpZXNbaV07XG5cdFx0XHRcblx0XHRcdGlmICghZW50cnkubWF0Y2ggfHwgd29yZC5tYXRjaChlbnRyeS5tYXRjaCkpIHtcblx0XHRcdFx0dmFyIG5ld1dvcmQgPSB3b3JkO1xuXHRcdFx0XHRcblx0XHRcdFx0aWYgKGVudHJ5LnJlbW92ZSkge1xuXHRcdFx0XHRcdG5ld1dvcmQgPSBuZXdXb3JkLnJlcGxhY2UoZW50cnkucmVtb3ZlLCBcIlwiKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRcblx0XHRcdFx0aWYgKHJ1bGUudHlwZSA9PT0gXCJTRlhcIikge1xuXHRcdFx0XHRcdG5ld1dvcmQgPSBuZXdXb3JkICsgZW50cnkuYWRkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdG5ld1dvcmQgPSBlbnRyeS5hZGQgKyBuZXdXb3JkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdFxuXHRcdFx0XHRuZXdXb3Jkcy5wdXNoKG5ld1dvcmQpO1xuXHRcdFx0XHRcblx0XHRcdFx0aWYgKFwiY29udGludWF0aW9uQ2xhc3Nlc1wiIGluIGVudHJ5KSB7XG5cdFx0XHRcdFx0Zm9yICh2YXIgaiA9IDAsIF9qbGVuID0gZW50cnkuY29udGludWF0aW9uQ2xhc3Nlcy5sZW5ndGg7IGogPCBfamxlbjsgaisrKSB7XG5cdFx0XHRcdFx0XHR2YXIgY29udGludWF0aW9uUnVsZSA9IHRoaXMucnVsZXNbZW50cnkuY29udGludWF0aW9uQ2xhc3Nlc1tqXV07XG5cdFx0XHRcdFx0XHRcblx0XHRcdFx0XHRcdGlmIChjb250aW51YXRpb25SdWxlKSB7XG5cdFx0XHRcdFx0XHRcdG5ld1dvcmRzID0gbmV3V29yZHMuY29uY2F0KHRoaXMuX2FwcGx5UnVsZShuZXdXb3JkLCBjb250aW51YXRpb25SdWxlKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHQvKlxuXHRcdFx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0XHRcdC8vIFRoaXMgc2hvdWxkbid0IGhhcHBlbiwgYnV0IGl0IGRvZXMsIGF0IGxlYXN0IGluIHRoZSBkZV9ERSBkaWN0aW9uYXJ5LlxuXHRcdFx0XHRcdFx0XHQvLyBJIHRoaW5rIHRoZSBhdXRob3IgbWlzdGFrZW5seSBzdXBwbGllZCBsb3dlci1jYXNlIHJ1bGUgY29kZXMgaW5zdGVhZCBcblx0XHRcdFx0XHRcdFx0Ly8gb2YgdXBwZXItY2FzZS5cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdCovXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdFxuXHRcdHJldHVybiBuZXdXb3Jkcztcblx0fSxcblx0XG5cdC8qKlxuXHQgKiBDaGVja3Mgd2hldGhlciBhIHdvcmQgb3IgYSBjYXBpdGFsaXphdGlvbiB2YXJpYW50IGV4aXN0cyBpbiB0aGUgY3VycmVudCBkaWN0aW9uYXJ5LlxuXHQgKiBUaGUgd29yZCBpcyB0cmltbWVkIGFuZCBzZXZlcmFsIHZhcmlhdGlvbnMgb2YgY2FwaXRhbGl6YXRpb25zIGFyZSBjaGVja2VkLlxuXHQgKiBJZiB5b3Ugd2FudCB0byBjaGVjayBhIHdvcmQgd2l0aG91dCBhbnkgY2hhbmdlcyBtYWRlIHRvIGl0LCBjYWxsIGNoZWNrRXhhY3QoKVxuXHQgKlxuXHQgKiBAc2VlIGh0dHA6Ly9ibG9nLnN0ZXZlbmxldml0aGFuLmNvbS9hcmNoaXZlcy9mYXN0ZXItdHJpbS1qYXZhc2NyaXB0IHJlOnRyaW1taW5nIGZ1bmN0aW9uXG5cdCAqXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBhV29yZCBUaGUgd29yZCB0byBjaGVjay5cblx0ICogQHJldHVybnMge0Jvb2xlYW59XG5cdCAqL1xuXHRcblx0Y2hlY2sgOiBmdW5jdGlvbiAoYVdvcmQpIHtcblx0XHRpZiAoIXRoaXMubG9hZGVkKSB7XG5cdFx0XHR0aHJvdyBcIkRpY3Rpb25hcnkgbm90IGxvYWRlZC5cIjtcblx0XHR9XG5cdFx0XG5cdFx0Ly8gUmVtb3ZlIGxlYWRpbmcgYW5kIHRyYWlsaW5nIHdoaXRlc3BhY2Vcblx0XHR2YXIgdHJpbW1lZFdvcmQgPSBhV29yZC5yZXBsYWNlKC9eXFxzXFxzKi8sICcnKS5yZXBsYWNlKC9cXHNcXHMqJC8sICcnKTtcblx0XHRcblx0XHRpZiAodGhpcy5jaGVja0V4YWN0KHRyaW1tZWRXb3JkKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdFxuXHRcdC8vIFRoZSBleGFjdCB3b3JkIGlzIG5vdCBpbiB0aGUgZGljdGlvbmFyeS5cblx0XHRpZiAodHJpbW1lZFdvcmQudG9VcHBlckNhc2UoKSA9PT0gdHJpbW1lZFdvcmQpIHtcblx0XHRcdC8vIFRoZSB3b3JkIHdhcyBzdXBwbGllZCBpbiBhbGwgdXBwZXJjYXNlLlxuXHRcdFx0Ly8gQ2hlY2sgZm9yIGEgY2FwaXRhbGl6ZWQgZm9ybSBvZiB0aGUgd29yZC5cblx0XHRcdHZhciBjYXBpdGFsaXplZFdvcmQgPSB0cmltbWVkV29yZFswXSArIHRyaW1tZWRXb3JkLnN1YnN0cmluZygxKS50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XG5cdFx0XHRpZiAodGhpcy5oYXNGbGFnKGNhcGl0YWxpemVkV29yZCwgXCJLRUVQQ0FTRVwiKSkge1xuXHRcdFx0XHQvLyBDYXBpdGFsaXphdGlvbiB2YXJpYW50cyBhcmUgbm90IGFsbG93ZWQgZm9yIHRoaXMgd29yZC5cblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0XG5cdFx0XHRpZiAodGhpcy5jaGVja0V4YWN0KGNhcGl0YWxpemVkV29yZCkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdFxuXHRcdHZhciBsb3dlcmNhc2VXb3JkID0gdHJpbW1lZFdvcmQudG9Mb3dlckNhc2UoKTtcblx0XHRcblx0XHRpZiAobG93ZXJjYXNlV29yZCAhPT0gdHJpbW1lZFdvcmQpIHtcblx0XHRcdGlmICh0aGlzLmhhc0ZsYWcobG93ZXJjYXNlV29yZCwgXCJLRUVQQ0FTRVwiKSkge1xuXHRcdFx0XHQvLyBDYXBpdGFsaXphdGlvbiB2YXJpYW50cyBhcmUgbm90IGFsbG93ZWQgZm9yIHRoaXMgd29yZC5cblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0XG5cdFx0XHQvLyBDaGVjayBmb3IgYSBsb3dlcmNhc2UgZm9ybVxuXHRcdFx0aWYgKHRoaXMuY2hlY2tFeGFjdChsb3dlcmNhc2VXb3JkKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9LFxuXHRcblx0LyoqXG5cdCAqIENoZWNrcyB3aGV0aGVyIGEgd29yZCBleGlzdHMgaW4gdGhlIGN1cnJlbnQgZGljdGlvbmFyeS5cblx0ICpcblx0ICogQHBhcmFtIHtTdHJpbmd9IHdvcmQgVGhlIHdvcmQgdG8gY2hlY2suXG5cdCAqIEByZXR1cm5zIHtCb29sZWFufVxuXHQgKi9cblx0XG5cdGNoZWNrRXhhY3QgOiBmdW5jdGlvbiAod29yZCkge1xuXHRcdGlmICghdGhpcy5sb2FkZWQpIHtcblx0XHRcdHRocm93IFwiRGljdGlvbmFyeSBub3QgbG9hZGVkLlwiO1xuXHRcdH1cblxuXHRcdHZhciBydWxlQ29kZXMgPSB0aGlzLmRpY3Rpb25hcnlUYWJsZVt3b3JkXTtcblx0XHRcblx0XHR2YXIgaSwgX2xlbjtcblx0XHRcblx0XHRpZiAodHlwZW9mIHJ1bGVDb2RlcyA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdC8vIENoZWNrIGlmIHRoaXMgbWlnaHQgYmUgYSBjb21wb3VuZCB3b3JkLlxuXHRcdFx0aWYgKFwiQ09NUE9VTkRNSU5cIiBpbiB0aGlzLmZsYWdzICYmIHdvcmQubGVuZ3RoID49IHRoaXMuZmxhZ3MuQ09NUE9VTkRNSU4pIHtcblx0XHRcdFx0Zm9yIChpID0gMCwgX2xlbiA9IHRoaXMuY29tcG91bmRSdWxlcy5sZW5ndGg7IGkgPCBfbGVuOyBpKyspIHtcblx0XHRcdFx0XHRpZiAod29yZC5tYXRjaCh0aGlzLmNvbXBvdW5kUnVsZXNbaV0pKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0ZWxzZSBpZiAocnVsZUNvZGVzID09PSBudWxsKSB7XG5cdFx0XHQvLyBhIG51bGwgKGJ1dCBub3QgdW5kZWZpbmVkKSB2YWx1ZSBmb3IgYW4gZW50cnkgaW4gdGhlIGRpY3Rpb25hcnkgdGFibGVcblx0XHRcdC8vIG1lYW5zIHRoYXQgdGhlIHdvcmQgaXMgaW4gdGhlIGRpY3Rpb25hcnkgYnV0IGhhcyBubyBmbGFncy5cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRlbHNlIGlmICh0eXBlb2YgcnVsZUNvZGVzID09PSAnb2JqZWN0JykgeyAvLyB0aGlzLmRpY3Rpb25hcnlbJ2hhc093blByb3BlcnR5J10gd2lsbCBiZSBhIGZ1bmN0aW9uLlxuXHRcdFx0Zm9yIChpID0gMCwgX2xlbiA9IHJ1bGVDb2Rlcy5sZW5ndGg7IGkgPCBfbGVuOyBpKyspIHtcblx0XHRcdFx0aWYgKCF0aGlzLmhhc0ZsYWcod29yZCwgXCJPTkxZSU5DT01QT1VORFwiLCBydWxlQ29kZXNbaV0pKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH0sXG5cdFxuXHQvKipcblx0ICogTG9va3MgdXAgd2hldGhlciBhIGdpdmVuIHdvcmQgaXMgZmxhZ2dlZCB3aXRoIGEgZ2l2ZW4gZmxhZy5cblx0ICpcblx0ICogQHBhcmFtIHtTdHJpbmd9IHdvcmQgVGhlIHdvcmQgaW4gcXVlc3Rpb24uXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBmbGFnIFRoZSBmbGFnIGluIHF1ZXN0aW9uLlxuXHQgKiBAcmV0dXJuIHtCb29sZWFufVxuXHQgKi9cblx0IFxuXHRoYXNGbGFnIDogZnVuY3Rpb24gKHdvcmQsIGZsYWcsIHdvcmRGbGFncykge1xuXHRcdGlmICghdGhpcy5sb2FkZWQpIHtcblx0XHRcdHRocm93IFwiRGljdGlvbmFyeSBub3QgbG9hZGVkLlwiO1xuXHRcdH1cblxuXHRcdGlmIChmbGFnIGluIHRoaXMuZmxhZ3MpIHtcblx0XHRcdGlmICh0eXBlb2Ygd29yZEZsYWdzID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHR3b3JkRmxhZ3MgPSBBcnJheS5wcm90b3R5cGUuY29uY2F0LmFwcGx5KFtdLCB0aGlzLmRpY3Rpb25hcnlUYWJsZVt3b3JkXSk7XG5cdFx0XHR9XG5cdFx0XHRcblx0XHRcdGlmICh3b3JkRmxhZ3MgJiYgd29yZEZsYWdzLmluZGV4T2YodGhpcy5mbGFnc1tmbGFnXSkgIT09IC0xKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH0sXG5cdFxuXHQvKipcblx0ICogUmV0dXJucyBhIGxpc3Qgb2Ygc3VnZ2VzdGlvbnMgZm9yIGEgbWlzc3BlbGxlZCB3b3JkLlxuXHQgKlxuXHQgKiBAc2VlIGh0dHA6Ly93d3cubm9ydmlnLmNvbS9zcGVsbC1jb3JyZWN0Lmh0bWwgZm9yIHRoZSBiYXNpcyBvZiB0aGlzIHN1Z2dlc3Rvci5cblx0ICogVGhpcyBzdWdnZXN0b3IgaXMgcHJpbWl0aXZlLCBidXQgaXQgd29ya3MuXG5cdCAqXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSB3b3JkIFRoZSBtaXNzcGVsbGluZy5cblx0ICogQHBhcmFtIHtOdW1iZXJ9IFtsaW1pdD01XSBUaGUgbWF4aW11bSBudW1iZXIgb2Ygc3VnZ2VzdGlvbnMgdG8gcmV0dXJuLlxuXHQgKiBAcmV0dXJucyB7U3RyaW5nW119IFRoZSBhcnJheSBvZiBzdWdnZXN0aW9ucy5cblx0ICovXG5cdFxuXHRhbHBoYWJldCA6IFwiXCIsXG5cdFxuXHRzdWdnZXN0IDogZnVuY3Rpb24gKHdvcmQsIGxpbWl0KSB7XG5cdFx0aWYgKCF0aGlzLmxvYWRlZCkge1xuXHRcdFx0dGhyb3cgXCJEaWN0aW9uYXJ5IG5vdCBsb2FkZWQuXCI7XG5cdFx0fVxuXG5cdFx0bGltaXQgPSBsaW1pdCB8fCA1O1xuXG5cdFx0aWYgKHRoaXMubWVtb2l6ZWQuaGFzT3duUHJvcGVydHkod29yZCkpIHtcblx0XHRcdHZhciBtZW1vaXplZExpbWl0ID0gdGhpcy5tZW1vaXplZFt3b3JkXVsnbGltaXQnXTtcblxuXHRcdFx0Ly8gT25seSByZXR1cm4gdGhlIGNhY2hlZCBsaXN0IGlmIGl0J3MgYmlnIGVub3VnaCBvciBpZiB0aGVyZSB3ZXJlbid0IGVub3VnaCBzdWdnZXN0aW9uc1xuXHRcdFx0Ly8gdG8gZmlsbCBhIHNtYWxsZXIgbGltaXQuXG5cdFx0XHRpZiAobGltaXQgPD0gbWVtb2l6ZWRMaW1pdCB8fCB0aGlzLm1lbW9pemVkW3dvcmRdWydzdWdnZXN0aW9ucyddLmxlbmd0aCA8IG1lbW9pemVkTGltaXQpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMubWVtb2l6ZWRbd29yZF1bJ3N1Z2dlc3Rpb25zJ10uc2xpY2UoMCwgbGltaXQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRcblx0XHRpZiAodGhpcy5jaGVjayh3b3JkKSkgcmV0dXJuIFtdO1xuXHRcdFxuXHRcdC8vIENoZWNrIHRoZSByZXBsYWNlbWVudCB0YWJsZS5cblx0XHRmb3IgKHZhciBpID0gMCwgX2xlbiA9IHRoaXMucmVwbGFjZW1lbnRUYWJsZS5sZW5ndGg7IGkgPCBfbGVuOyBpKyspIHtcblx0XHRcdHZhciByZXBsYWNlbWVudEVudHJ5ID0gdGhpcy5yZXBsYWNlbWVudFRhYmxlW2ldO1xuXHRcdFx0XG5cdFx0XHRpZiAod29yZC5pbmRleE9mKHJlcGxhY2VtZW50RW50cnlbMF0pICE9PSAtMSkge1xuXHRcdFx0XHR2YXIgY29ycmVjdGVkV29yZCA9IHdvcmQucmVwbGFjZShyZXBsYWNlbWVudEVudHJ5WzBdLCByZXBsYWNlbWVudEVudHJ5WzFdKTtcblx0XHRcdFx0XG5cdFx0XHRcdGlmICh0aGlzLmNoZWNrKGNvcnJlY3RlZFdvcmQpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFsgY29ycmVjdGVkV29yZCBdO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdFxuXHRcdHZhciBzZWxmID0gdGhpcztcblx0XHRzZWxmLmFscGhhYmV0ID0gXCJhYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5elwiO1xuXHRcdFxuXHRcdC8qXG5cdFx0aWYgKCFzZWxmLmFscGhhYmV0KSB7XG5cdFx0XHQvLyBVc2UgdGhlIGFscGhhYmV0IGFzIGltcGxpY2l0bHkgZGVmaW5lZCBieSB0aGUgd29yZHMgaW4gdGhlIGRpY3Rpb25hcnkuXG5cdFx0XHR2YXIgYWxwaGFIYXNoID0ge307XG5cdFx0XHRcblx0XHRcdGZvciAodmFyIGkgaW4gc2VsZi5kaWN0aW9uYXJ5VGFibGUpIHtcblx0XHRcdFx0Zm9yICh2YXIgaiA9IDAsIF9sZW4gPSBpLmxlbmd0aDsgaiA8IF9sZW47IGorKykge1xuXHRcdFx0XHRcdGFscGhhSGFzaFtpW2pdXSA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdFxuXHRcdFx0Zm9yICh2YXIgaSBpbiBhbHBoYUhhc2gpIHtcblx0XHRcdFx0c2VsZi5hbHBoYWJldCArPSBpO1xuXHRcdFx0fVxuXHRcdFx0XG5cdFx0XHR2YXIgYWxwaGFBcnJheSA9IHNlbGYuYWxwaGFiZXQuc3BsaXQoXCJcIik7XG5cdFx0XHRhbHBoYUFycmF5LnNvcnQoKTtcblx0XHRcdHNlbGYuYWxwaGFiZXQgPSBhbHBoYUFycmF5LmpvaW4oXCJcIik7XG5cdFx0fVxuXHRcdCovXG5cdFx0XG5cdFx0LyoqXG5cdFx0ICogUmV0dXJucyBhIGhhc2gga2V5ZWQgYnkgYWxsIG9mIHRoZSBzdHJpbmdzIHRoYXQgY2FuIGJlIG1hZGUgYnkgbWFraW5nIGEgc2luZ2xlIGVkaXQgdG8gdGhlIHdvcmQgKG9yIHdvcmRzIGluKSBgd29yZHNgXG5cdFx0ICogVGhlIHZhbHVlIG9mIGVhY2ggZW50cnkgaXMgdGhlIG51bWJlciBvZiB1bmlxdWUgd2F5cyB0aGF0IHRoZSByZXN1bHRpbmcgd29yZCBjYW4gYmUgbWFkZS5cblx0XHQgKlxuXHRcdCAqIEBhcmcgbWl4ZWQgd29yZHMgRWl0aGVyIGEgaGFzaCBrZXllZCBieSB3b3JkcyBvciBhIHN0cmluZyB3b3JkIHRvIG9wZXJhdGUgb24uXG5cdFx0ICogQGFyZyBib29sIGtub3duX29ubHkgV2hldGhlciB0aGlzIGZ1bmN0aW9uIHNob3VsZCBpZ25vcmUgc3RyaW5ncyB0aGF0IGFyZSBub3QgaW4gdGhlIGRpY3Rpb25hcnkuXG5cdFx0ICovXG5cdFx0ZnVuY3Rpb24gZWRpdHMxKHdvcmRzLCBrbm93bl9vbmx5KSB7XG5cdFx0XHR2YXIgcnYgPSB7fTtcblx0XHRcdFxuXHRcdFx0dmFyIGksIGosIF9paWxlbiwgX2xlbiwgX2psZW4sIF9lZGl0O1xuXHRcdFx0XG5cdFx0XHRpZiAodHlwZW9mIHdvcmRzID09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdHZhciB3b3JkID0gd29yZHM7XG5cdFx0XHRcdHdvcmRzID0ge307XG5cdFx0XHRcdHdvcmRzW3dvcmRdID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yICh2YXIgd29yZCBpbiB3b3Jkcykge1xuXHRcdFx0XHRmb3IgKGkgPSAwLCBfbGVuID0gd29yZC5sZW5ndGggKyAxOyBpIDwgX2xlbjsgaSsrKSB7XG5cdFx0XHRcdFx0dmFyIHMgPSBbIHdvcmQuc3Vic3RyaW5nKDAsIGkpLCB3b3JkLnN1YnN0cmluZyhpKSBdO1xuXHRcdFx0XHRcblx0XHRcdFx0XHRpZiAoc1sxXSkge1xuXHRcdFx0XHRcdFx0X2VkaXQgPSBzWzBdICsgc1sxXS5zdWJzdHJpbmcoMSk7XG5cblx0XHRcdFx0XHRcdGlmICgha25vd25fb25seSB8fCBzZWxmLmNoZWNrKF9lZGl0KSkge1xuXHRcdFx0XHRcdFx0XHRpZiAoIShfZWRpdCBpbiBydikpIHtcblx0XHRcdFx0XHRcdFx0XHRydltfZWRpdF0gPSAxO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdHJ2W19lZGl0XSArPSAxO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFxuXHRcdFx0XHRcdC8vIEVsaW1pbmF0ZSB0cmFuc3Bvc2l0aW9ucyBvZiBpZGVudGljYWwgbGV0dGVyc1xuXHRcdFx0XHRcdGlmIChzWzFdLmxlbmd0aCA+IDEgJiYgc1sxXVsxXSAhPT0gc1sxXVswXSkge1xuXHRcdFx0XHRcdFx0X2VkaXQgPSBzWzBdICsgc1sxXVsxXSArIHNbMV1bMF0gKyBzWzFdLnN1YnN0cmluZygyKTtcblxuXHRcdFx0XHRcdFx0aWYgKCFrbm93bl9vbmx5IHx8IHNlbGYuY2hlY2soX2VkaXQpKSB7XG5cdFx0XHRcdFx0XHRcdGlmICghKF9lZGl0IGluIHJ2KSkge1xuXHRcdFx0XHRcdFx0XHRcdHJ2W19lZGl0XSA9IDE7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0cnZbX2VkaXRdICs9IDE7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoc1sxXSkge1xuXHRcdFx0XHRcdFx0Zm9yIChqID0gMCwgX2psZW4gPSBzZWxmLmFscGhhYmV0Lmxlbmd0aDsgaiA8IF9qbGVuOyBqKyspIHtcblx0XHRcdFx0XHRcdFx0Ly8gRWxpbWluYXRlIHJlcGxhY2VtZW50IG9mIGEgbGV0dGVyIGJ5IGl0c2VsZlxuXHRcdFx0XHRcdFx0XHRpZiAoc2VsZi5hbHBoYWJldFtqXSAhPSBzWzFdLnN1YnN0cmluZygwLDEpKXtcblx0XHRcdFx0XHRcdFx0XHRfZWRpdCA9IHNbMF0gKyBzZWxmLmFscGhhYmV0W2pdICsgc1sxXS5zdWJzdHJpbmcoMSk7XG5cblx0XHRcdFx0XHRcdFx0XHRpZiAoIWtub3duX29ubHkgfHwgc2VsZi5jaGVjayhfZWRpdCkpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGlmICghKF9lZGl0IGluIHJ2KSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRydltfZWRpdF0gPSAxO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHJ2W19lZGl0XSArPSAxO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChzWzFdKSB7XG5cdFx0XHRcdFx0XHRmb3IgKGogPSAwLCBfamxlbiA9IHNlbGYuYWxwaGFiZXQubGVuZ3RoOyBqIDwgX2psZW47IGorKykge1xuXHRcdFx0XHRcdFx0XHRfZWRpdCA9IHNbMF0gKyBzZWxmLmFscGhhYmV0W2pdICsgc1sxXTtcblxuXHRcdFx0XHRcdFx0XHRpZiAoIWtub3duX29ubHkgfHwgc2VsZi5jaGVjayhfZWRpdCkpIHtcblx0XHRcdFx0XHRcdFx0XHRpZiAoIShfZWRpdCBpbiBydikpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHJ2W19lZGl0XSA9IDE7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdFx0cnZbX2VkaXRdICs9IDE7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRcblx0XHRcdHJldHVybiBydjtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBjb3JyZWN0KHdvcmQpIHtcblx0XHRcdC8vIEdldCB0aGUgZWRpdC1kaXN0YW5jZS0xIGFuZCBlZGl0LWRpc3RhbmNlLTIgZm9ybXMgb2YgdGhpcyB3b3JkLlxuXHRcdFx0dmFyIGVkMSA9IGVkaXRzMSh3b3JkKTtcblx0XHRcdHZhciBlZDIgPSBlZGl0czEoZWQxLCB0cnVlKTtcblx0XHRcdFxuXHRcdFx0Ly8gU29ydCB0aGUgZWRpdHMgYmFzZWQgb24gaG93IG1hbnkgZGlmZmVyZW50IHdheXMgdGhleSB3ZXJlIGNyZWF0ZWQuXG5cdFx0XHR2YXIgd2VpZ2h0ZWRfY29ycmVjdGlvbnMgPSBlZDI7XG5cdFx0XHRcblx0XHRcdGZvciAodmFyIGVkMXdvcmQgaW4gZWQxKSB7XG5cdFx0XHRcdGlmICghc2VsZi5jaGVjayhlZDF3b3JkKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGVkMXdvcmQgaW4gd2VpZ2h0ZWRfY29ycmVjdGlvbnMpIHtcblx0XHRcdFx0XHR3ZWlnaHRlZF9jb3JyZWN0aW9uc1tlZDF3b3JkXSArPSBlZDFbZWQxd29yZF07XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0d2VpZ2h0ZWRfY29ycmVjdGlvbnNbZWQxd29yZF0gPSBlZDFbZWQxd29yZF07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdFxuXHRcdFx0dmFyIGksIF9sZW47XG5cblx0XHRcdHZhciBzb3J0ZWRfY29ycmVjdGlvbnMgPSBbXTtcblx0XHRcdFxuXHRcdFx0Zm9yIChpIGluIHdlaWdodGVkX2NvcnJlY3Rpb25zKSB7XG5cdFx0XHRcdGlmICh3ZWlnaHRlZF9jb3JyZWN0aW9ucy5oYXNPd25Qcm9wZXJ0eShpKSkge1xuXHRcdFx0XHRcdHNvcnRlZF9jb3JyZWN0aW9ucy5wdXNoKFsgaSwgd2VpZ2h0ZWRfY29ycmVjdGlvbnNbaV0gXSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0ZnVuY3Rpb24gc29ydGVyKGEsIGIpIHtcblx0XHRcdFx0dmFyIGFfdmFsID0gYVsxXTtcblx0XHRcdFx0dmFyIGJfdmFsID0gYlsxXTtcblx0XHRcdFx0aWYgKGFfdmFsIDwgYl92YWwpIHtcblx0XHRcdFx0XHRyZXR1cm4gLTE7XG5cdFx0XHRcdH0gZWxzZSBpZiAoYV92YWwgPiBiX3ZhbCkge1xuXHRcdFx0XHRcdHJldHVybiAxO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIEB0b2RvIElmIGEgYW5kIGIgYXJlIGVxdWFsbHkgd2VpZ2h0ZWQsIGFkZCBvdXIgb3duIHdlaWdodCBiYXNlZCBvbiBzb21ldGhpbmcgbGlrZSB0aGUga2V5IGxvY2F0aW9ucyBvbiB0aGlzIGxhbmd1YWdlJ3MgZGVmYXVsdCBrZXlib2FyZC5cblx0XHRcdFx0cmV0dXJuIGJbMF0ubG9jYWxlQ29tcGFyZShhWzBdKTtcblx0XHRcdH1cblx0XHRcdFxuXHRcdFx0c29ydGVkX2NvcnJlY3Rpb25zLnNvcnQoc29ydGVyKS5yZXZlcnNlKCk7XG5cblx0XHRcdHZhciBydiA9IFtdO1xuXG5cdFx0XHR2YXIgY2FwaXRhbGl6YXRpb25fc2NoZW1lID0gXCJsb3dlcmNhc2VcIjtcblx0XHRcdFxuXHRcdFx0aWYgKHdvcmQudG9VcHBlckNhc2UoKSA9PT0gd29yZCkge1xuXHRcdFx0XHRjYXBpdGFsaXphdGlvbl9zY2hlbWUgPSBcInVwcGVyY2FzZVwiO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSBpZiAod29yZC5zdWJzdHIoMCwgMSkudG9VcHBlckNhc2UoKSArIHdvcmQuc3Vic3RyKDEpLnRvTG93ZXJDYXNlKCkgPT09IHdvcmQpIHtcblx0XHRcdFx0Y2FwaXRhbGl6YXRpb25fc2NoZW1lID0gXCJjYXBpdGFsaXplZFwiO1xuXHRcdFx0fVxuXHRcdFx0XG5cdFx0XHR2YXIgd29ya2luZ19saW1pdCA9IGxpbWl0O1xuXG5cdFx0XHRmb3IgKGkgPSAwOyBpIDwgTWF0aC5taW4od29ya2luZ19saW1pdCwgc29ydGVkX2NvcnJlY3Rpb25zLmxlbmd0aCk7IGkrKykge1xuXHRcdFx0XHRpZiAoXCJ1cHBlcmNhc2VcIiA9PT0gY2FwaXRhbGl6YXRpb25fc2NoZW1lKSB7XG5cdFx0XHRcdFx0c29ydGVkX2NvcnJlY3Rpb25zW2ldWzBdID0gc29ydGVkX2NvcnJlY3Rpb25zW2ldWzBdLnRvVXBwZXJDYXNlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWxzZSBpZiAoXCJjYXBpdGFsaXplZFwiID09PSBjYXBpdGFsaXphdGlvbl9zY2hlbWUpIHtcblx0XHRcdFx0XHRzb3J0ZWRfY29ycmVjdGlvbnNbaV1bMF0gPSBzb3J0ZWRfY29ycmVjdGlvbnNbaV1bMF0uc3Vic3RyKDAsIDEpLnRvVXBwZXJDYXNlKCkgKyBzb3J0ZWRfY29ycmVjdGlvbnNbaV1bMF0uc3Vic3RyKDEpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdFxuXHRcdFx0XHRpZiAoIXNlbGYuaGFzRmxhZyhzb3J0ZWRfY29ycmVjdGlvbnNbaV1bMF0sIFwiTk9TVUdHRVNUXCIpICYmIHJ2LmluZGV4T2Yoc29ydGVkX2NvcnJlY3Rpb25zW2ldWzBdKSA9PSAtMSkge1xuXHRcdFx0XHRcdHJ2LnB1c2goc29ydGVkX2NvcnJlY3Rpb25zW2ldWzBdKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHQvLyBJZiBvbmUgb2YgdGhlIGNvcnJlY3Rpb25zIGlzIG5vdCBlbGlnaWJsZSBhcyBhIHN1Z2dlc3Rpb24gLCBtYWtlIHN1cmUgd2Ugc3RpbGwgcmV0dXJuIHRoZSByaWdodCBudW1iZXIgb2Ygc3VnZ2VzdGlvbnMuXG5cdFx0XHRcdFx0d29ya2luZ19saW1pdCsrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBydjtcblx0XHR9XG5cdFx0XG5cdFx0dGhpcy5tZW1vaXplZFt3b3JkXSA9IHtcblx0XHRcdCdzdWdnZXN0aW9ucyc6IGNvcnJlY3Qod29yZCksXG5cdFx0XHQnbGltaXQnOiBsaW1pdFxuXHRcdH07XG5cblx0XHRyZXR1cm4gdGhpcy5tZW1vaXplZFt3b3JkXVsnc3VnZ2VzdGlvbnMnXTtcblx0fVxufTtcbn0pKCk7XG5cbi8vIFN1cHBvcnQgZm9yIHVzZSBhcyBhIG5vZGUuanMgbW9kdWxlLlxuaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnKSB7XG5cdG1vZHVsZS5leHBvcnRzID0gVHlwbztcbn1cbiIsInZhciBUeXBvID0gcmVxdWlyZSgnLi9kYXRhL3R5cG8vdHlwbycpO1xuXG52YXIgd29yZHMgPSB7fVxudmFyIGRlZmluaXRpb25zID0ge31cbnZhciBkaWN0aW9uYXJ5cyA9IHt9XG5cbnNlbGYuYWRkRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIiwgYXN5bmMgZnVuY3Rpb24oZXZlbnQpIHtcbiAgdmFyIGRhdGEgPSBKU09OLnBhcnNlKGV2ZW50LmRhdGEpO1xuXG4gIHZhciBkYXRhVXJsID0gZGF0YS5kYXRhVXJsXG4gIGlmIChkYXRhVXJsW2RhdGFVcmwubGVuZ3RoIC0gMV0gIT09ICcvJykge1xuICAgIGRhdGFVcmwgPSBkYXRhVXJsICsgJy8nXG4gIH1cblxuICB2YXIgZGljdGlvbmFyeVBhdGhDYW5kaWRhdGUgPSBkYXRhVXJsICsgJ2RhdGEvdHlwby90eXBvL2RpY3Rpb25hcmllcydcbiAgaWYgKCFkaWN0aW9uYXJ5c1tkaWN0aW9uYXJ5UGF0aENhbmRpZGF0ZV0pIHtcbiAgICBkaWN0aW9uYXJ5c1tkaWN0aW9uYXJ5UGF0aENhbmRpZGF0ZV0gPSBuZXcgVHlwbyhcImVuX1VTXCIsIGZhbHNlLCBmYWxzZSwgeyBkaWN0aW9uYXJ5UGF0aDogZGljdGlvbmFyeVBhdGhDYW5kaWRhdGUgfSk7XG4gIH1cbiAgdmFyIGRpY3Rpb25hcnkgPSBkaWN0aW9uYXJ5c1tkaWN0aW9uYXJ5UGF0aENhbmRpZGF0ZV1cblxuICBpZiAoZGF0YS50eXBlID09PSAnc3BlbGwnKSB7XG4gICAgcmV0dXJuIHBvc3RNZXNzYWdlKEpTT04uc3RyaW5naWZ5KHtcbiAgICAgIGpvYjogJ3NwZWxsJyxcbiAgICAgIHZhbHVlOiBkYXRhLnZhbHVlLFxuICAgICAgcmVzdWx0OiBkaWN0aW9uYXJ5LmNoZWNrKGRhdGEudmFsdWUpXG4gICAgfSkpO1xuICB9XG5cbiAgaWYgKGRhdGEudHlwZSA9PT0gJ3N1Z2dlc3QnKSB7XG4gICAgcmV0dXJuIHBvc3RNZXNzYWdlKEpTT04uc3RyaW5naWZ5KHtcbiAgICAgIGpvYjogJ3N1Z2dlc3QnLFxuICAgICAgdmFsdWU6IGRhdGEudmFsdWUsXG4gICAgICByZXN1bHQ6IGRpY3Rpb25hcnkuc3VnZ2VzdChkYXRhLnZhbHVlKVxuICAgIH0pKTtcbiAgfVxuXG4gIGlmIChkYXRhLnR5cGUgPT09ICdkZWZpbmUnKSB7XG4gICAgaWYgKCFkZWZpbml0aW9uc1tkYXRhLnZhbHVlWzBdXSkge1xuICAgICAgZGVmaW5pdGlvbnNbZGF0YS52YWx1ZVswXV0gPSBmZXRjaChkYXRhLmRhdGFVcmwgKyAnZGF0YS93b3Jkc2V0L2RhdGEvJyArIGRhdGEudmFsdWVbMF0gKyAnLmpzb24nKVxuICAgICAgICAudGhlbihyZXNwb25zZSA9PiByZXNwb25zZS5qc29uKCkpXG4gICAgfVxuXG4gICAgdmFyIHJlc3VsdCA9IGF3YWl0IGRlZmluaXRpb25zW2RhdGEudmFsdWVbMF1dXG5cbiAgICByZXR1cm4gcG9zdE1lc3NhZ2UoSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgam9iOiAnZGVmaW5lJyxcbiAgICAgIHZhbHVlOiBkYXRhLnZhbHVlLFxuICAgICAgcmVzdWx0OiByZXN1bHRbZGF0YS52YWx1ZV1cbiAgICB9KSk7XG4gIH1cblxuICBpZiAoZGF0YS50eXBlID09PSAnYWx0ZXJuYXRpdmUnKSB7XG4gICAgaWYgKCF3b3Jkc1tkYXRhLnZhbHVlWzBdXSkge1xuICAgICAgd29yZHNbZGF0YS52YWx1ZVswXV0gPSBmZXRjaChkYXRhLmRhdGFVcmwgKyAnZGF0YS93b3Jkcy8nICsgZGF0YS52YWx1ZVswXSArICcudHh0JylcbiAgICAgICAgLnRoZW4ocmVzcG9uc2UgPT4gcmVzcG9uc2UudGV4dCgpKVxuICAgIH1cblxuICAgIHZhciB3b3JkTGlzdCA9IGF3YWl0IHdvcmRzW2RhdGEudmFsdWVbMF1dXG5cbiAgICB2YXIgcmVnZXggPSBuZXcgUmVnRXhwKCdeJyArIGRhdGEudmFsdWUgKyAnXFxcXCwoLio/KVxcJCcsICdnbScpXG4gICAgdmFyIHJlc3VsdCA9IHdvcmRMaXN0Lm1hdGNoKHJlZ2V4KVxuXG4gICAgcmV0dXJuIHBvc3RNZXNzYWdlKEpTT04uc3RyaW5naWZ5KHtcbiAgICAgIGpvYjogJ2FsdGVybmF0aXZlJyxcbiAgICAgIHZhbHVlOiBkYXRhLnZhbHVlLFxuICAgICAgcmVzdWx0OiByZXN1bHQgJiYgcmVzdWx0WzBdICYmIHJlc3VsdFswXS5zcGxpdCgnLCcpXG4gICAgfSkpO1xuICB9XG5cbiAgcG9zdE1lc3NhZ2UoSlNPTi5zdHJpbmdpZnkoe1xuICAgIHR5cGU6ICdlcnJvcicsXG4gICAgcmVzdWx0OiAnam9iIG5vdCBmb3VuZCdcbiAgfSkpXG59KTtcblxuIl19
