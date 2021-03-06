'use-strict';

const { Finder } = require('./finder.js');
const { printWelcome, update } = require('./utils.js');

printWelcome();
update();

const finder = new Finder();
finder.findAndBuild(process.argv);
