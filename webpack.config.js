const path = require('path');

/* eslint-disable no-template-curly-in-string */
/* eslint-disable no-useless-escape */

module.exports = {
  module: {
    rules: [ 
      { test: /\.css$/, use: 'css-loader' },
      { test: /\.html$/, use: 'html-loader' },],
    },
    devServer:{
      static:'./dist',
      hot:true,
    },
};
