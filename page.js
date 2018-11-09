'use strict';

const actions = require('./actions');
const Enquirer = require('enquirer');
const fs = require('fs');
const util = require('util');
const utils = require('./utils.js');

const DONT_ASK = 'Don\'t ask.';
const ANSWER_IS_NO = '';

class _Question {
  constructor(wireFrameName) {
    const wireframe = utils.WIREFRAMES[wireFrameName];
    for (let w in wireframe) {
      this[w] = wireframe[w];
    }
    this.name = wireFrameName;
    this.answer = null;
  }

  _isAnswerValid() {
    if (!this.pattern) { return true; }
    const regex = RegExp(this.pattern, 'g');
    const result = regex.exec(this.answer);
    if (!result) {

      return false;
    }
    return true;
  }

  async _prompt() {
    let enq = new Enquirer();
    let options = { message: this.question };
    if (this.default) {
      options.default = this.default;
    }
    enq.question(this.name, options);
    let tempAnswer = await enq.prompt(this.name);
    // Convert Enquirer answer to mdn-helper answer.
    this.answer = tempAnswer[this.name];
    if (!this._isAnswerValid()) {
      console.log(this.help);
      await this._prompt();
    }
  }

  async ask(forPage) {
    try {
      await this._prompt(this.text);
    } catch(e) {
      throw e;
    } finally {
      if (this.action) {
        await actions[this.action.name].run(forPage, this);
      }
      forPage.contents = forPage.contents.replace(this.token, this.answer);
    }

  }

  get text() {
    let text = "\n" + this.question;
    if (this.default) {
      text += (" (" + this.default + ")");
    }
    text += "\n";
    return text;
  }

  get token() {
    return "[[" + this.name + "]]";
  }
}

class _Questions {
  constructor(intro) {
    this.intro = intro;
    this.questions = new Object();
  }

  printIntro() {
    if (this.intro == '') { return; }
    console.log(this.intro);
  }

  set introMessage(message) {
    this.intro = message;
  }

  add(question, answer=null) {
    if (utils.WIREFRAMES[question] == DONT_ASK) { return; }
    if (!this.questions.hasOwnProperty(question)) {
      this.questions[question] = new _Question(question);
      this.questions[question].answer = answer;
    }
  }

  answer(question, answer) {
    this.questions[question].answer = answer;
  }

  needsAnswers() {
    console.log(this.questions);
    for (var p in this.questions) {
      if (this.questions[p].answer === null) { return true; }
    }
    return false;
  }
}

class _Page {
  constructor(name, type, sharedQuestions) {
    this.name = name;
    this.type = type;
    this.sharedQuestions = sharedQuestions;
    // The type and name if the interface are also a question.
    this.sharedQuestions.add(type, name);
    let introMessage = `\nQuestions for the ${this.name} ${this.type} page\n` + (`-`.repeat(80));
    this.questions = new _Questions(introMessage);
    this.questions.add(type, name);
    this.contents = utils.getTemplate(this.type.toLowerCase());
    const reg = RegExp(utils.TOKEN_RE, 'g');
    let matches;
    while ((matches = reg.exec(this.contents)) != null) {
      if (matches[0].startsWith('[[shared:')) {
        this.sharedQuestions.add(matches[1]);
      } else {
        this.questions.add(matches[1]);
      }
    }
  }

  async askQuestions(extraMessage) {
    if (this.sharedQuestions.needsAnswers()) {
      // extraMessage is proxy for whether this is a first call or
      // one generated by an action. Not ideal, but it's the best
      // currently available.
      if (extraMessage) {
        this.sharedQuestions.introMessage = "More shared questions found.\n" + (`-`.repeat(28))
      }
      await this._askQuestions(this.sharedQuestions);
    }
    if (this.questions.needsAnswers()) {
      if (extraMessage) {
        let len = extraMessage.length;
        extraMessage = extraMessage + '\n' + (`-`.repeat(len));
        this.questions.introMessage = extraMessage;
      }
      await this._askQuestions(this.questions);
    }
  }

  async _askQuestions(questionObject) {
    const questions = questionObject.questions;
    if (questionObject.needsAnswers()) {
      questionObject.printIntro();
    } else {
      return;
    }
    for (let q in questions) {
      if (questions[q].answer) { continue; }
      await questions[q].ask(this);
    }
  }

  render() {
    const reg = RegExp(utils.TOKEN_RE);
    let matches;
    let answer;
    while ((matches = reg.exec(this.contents)) != null) {
      if (matches[0].startsWith('[[shared:')) {
        answer = this.sharedQuestions.questions[matches[1]].answer;
      } else {
        answer = this.questions.questions[matches[1]].answer
      }
      if (answer == DONT_ASK) { continue; }
      if (answer === null) { continue; }
      this.contents = this.contents.replace(matches[0], answer);
    }
  }

  write() {
    this.render();
    let outFolder = utils.OUT + '/' + this.sharedQuestions.name + '/';
    if (!fs.existsSync(outFolder)) { fs.mkdirSync(outFolder); }
    let outPath = outFolder + this.sharedQuestions.name + "_" + this.name + "_" + this.type + ".html";
    fs.writeFileSync(outPath, this.contents);
  }
}

module.exports.Page = _Page;
module.exports.Questions = _Questions;
