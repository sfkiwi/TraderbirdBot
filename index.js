const dotenv = require('dotenv');
dotenv.config();

const db = require('./db');

let run  = async () => {
  await db.sync();

  require('./telegram');
}

run();
