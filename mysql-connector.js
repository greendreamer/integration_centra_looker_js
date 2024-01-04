const mysql = require('mysql2');

const connection = mysql.createConnection({
  host: 'localhost', // IP address of your cloud SQL instance
  user: 'root', // your database username
  password: '', // your database password
  port: 3306,
  database: 'analytics' // your database name
});

connection.connect((err) => {
  if(err) {
    console.error('An error occurred while connecting to the DB')
    throw err;
  }
  console.log('Connected successfully');
});

const checktable = function(tablename) {
    let sql = 'SELECT * FROM ??;';
    return new Promise((resolve, reject) => {
        connection.query(sql,[tablename],(err, result) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(result);
            }
        });
    });
}

module.exports = {
    db: connection,
    checktable: checktable,
};
