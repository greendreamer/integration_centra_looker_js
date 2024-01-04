const axios = require("axios");
const express = require("express");
const app = express()
const port = 5000

const {db, checktable} = require("./mysql-connector");

let is_fetch = true;
let is_end = false;

let start_date = new Date("2022-06-23 00:00:00");
let end_date = new Date("2023-12-11 23:59:59");
let end_id = 30;
let limit = 30;

const url = 'https://beyondmedals.centra.com/graphql';
/*
const rateLimits = `
{
    rateLimits {
      type
      intervalSeconds
      quota
      usedQuota
      remainingQuota
    }
}`;

const country = `
{
  countries {
    name
    continent
    isEU
    states {
      name
    }
  }
}`;

const orders = `
{
  orders(where: {createdAt: {from: "2022-06-23 00:00:00", to: "2023-12-11 23:59:59"}, storeType: DIRECT_TO_CONSUMER}, limit: 30, sort: [number_ASC]) {
    number
    createdAt
    updatedAt
    lines {
      quantity
      productName
      productVariantName
      productSize {
        id
        description
      }
      unitOriginalPrice {
        value
        currency {
          name
        }
      }
    }
  }
}`

const purchase = `
{
  purchaseOrder{
    id
  }
}
`
*/

const save_latest_date = (type) => {
  return new Promise(async (resolve, reject) => {
    db.query(`UPDATE latest SET latestDate="${sub_end_date}", latestId=${end_id} WHERE type="${type}"`, (err, ok) => {
      if (err) reject(err);
      if (ok) resolve("Success updating latest");
    })
  })
}

const check_table_start = (table) => {
  return new Promise(async (resolve, reject) => {
    try {
      await checktable(table); // check if table exist
      resolve();
    } catch(err) {
      console.log(`table "${table}" is NOT exist`); // if not, creating...
      switch(table) {
        case "orders": // orders table
        {
          db.query(`CREATE TABLE orders(
            id int AUTO_INCREMENT,
            orderNum int,
            createdAt datetime,
            updatedAt datetime,
            quantity int,
            productName varchar(50),
            productVariant varchar(50),
            productSize varchar(10),
            unitPrice float(2),
            taxPercent float(2),
            discountPercent float(2),
            currency varchar(10),
            PRIMARY KEY (id)
          )`, (err, ok) => {
            if (err) reject(err);
            else resolve("Success creating table `orders`");
          });
          break;
        }
        case "latest": // latest tabel check and create
        {
          console.log("latest");
          db.query(`CREATE TABLE latest(
            id int AUTO_INCREMENT,
            type varchar(50),
            latestDate datetime,
            latestId int,
            PRIMARY KEY(id)
          );`, (err, ok) => {
            if (!err) {
              db.query(`INSERT INTO latest(type, latestDate, latestId) VALUES ("orders", "2022-06-23 00:00:00", 30);`, (err, ok) =>{
                if (err) reject(err);
                else resolve("Success creating table `latest`");
              })
            }
          });
          break;
        }
      }
    }
  })
};

const save_order = async(query) => { // save orders with bunch of orders... 30 orders
  return new Promise((resolve, reject) => {
    db.query(`
    INSERT INTO orders(
      orderNum,
      createdAt,
      updatedAt,
      quantity,
      productName,
      productVariant,
      productSize,
      unitPrice,
      taxPercent,
      discountPercent,
      currency) VALUES ${query}`, (err, res) => {
        if (err) reject(err);
        else resolve(res);
    });
  })
}

const get_orders = () => { // getting from Centra
  is_fetch = true;
  if (end_date.getTime() - start_date.getTime()< 3600000) { // less 1 hour of difference
    console.log("Too soon to update. Try in 1 hour.");
    return;
  }
  console.log(start_date.toISOString(), "-----", end_date.toISOString());
  let orders = `
  {
    orders(where: {createdAt: {from: "${start_date.toISOString()}", to: "${end_date.toISOString()}"}, storeType: DIRECT_TO_CONSUMER}, limit: ${limit}, sort: [number_ASC]) {
      number
      createdAt
      updatedAt
      lines {
        quantity
        productName
        productVariantName
        productSize {
          id
          description
        }
        unitOriginalPrice {
          value
          currency {
            name
          }
        }
        discountPercent
        taxPercent
      }
      shipments {
        totals {
          shipping {
            value
          }
          discounts {
            value
            currency {
              name
            }
          }
          taxAdded {
            value
          }
        }
      }
    }
  }`;

  axios.post(url, {query: orders}, { // get with POST
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': 'Bearer 68de15b0dbd39bda52aab5a4e8ced4d2'
    }
  })
  .then(async response => { // save in database
    if (!response.data["data"] || !response.data["data"]["orders"]) {// check response
      is_end = true;
      return;
    }

    console.log(response.data["data"]["orders"][0]["shipments"][0]["totals"]);

    let orders = response.data["data"]["orders"];
    if (!orders.length) { // save orders in mysql
      sub_end_date = end_date.toDateString();
      save_latest_date("orders")
      .then(res => console.log(res))
      .catch(err => console.log(err));
      return;
    } else {
      let rows = [];
      orders.forEach(o => { // make bunch of orders
        n = o['number'];
        c = o['createdAt'];
        u = o['updatedAt'];
        o['lines'].forEach((ol) => { // recombine orders
          rows.push({
            number: n,
            createdAt: c,
            updatedAt: u,
            quantity: ol['quantity'],
            productName: ol['productName'],
            productVariant: ol['productVariantName'],
            productSize: ol['productSize']['description'],
            unitPrice: ol['unitOriginalPrice']['value'],
            taxPercent: ol['taxPercent'],
            discountPercent: ol['discountPercent'],
            currency: ol['unitOriginalPrice']['currency']['name']
          });
        });
      });

      let query = "";
      rows.forEach(r => { // make query to save multi rows
        query += `(
          ${r["number"]},
          "${r["createdAt"]}",
          "${r["updatedAt"]}",
          ${r['quantity']},
          "${r['productName']}",
          "${r['productVariant']}",
          "${r['productSize']}",
          ${r['unitPrice']},
          ${r['taxPercent']},
          ${r['discountPercent']},
          "${r['currency']}"),`
      });
      query = query.slice(0, -1);

      end_num = orders[orders.length -1]["number"]; // sae latest data
      sub_end_date = orders[orders.length -1]["createdAt"];

      if (new Date(sub_end_date).getTime() - start_date.getTime() < 1000 || end_num <= end_id) {
        save_latest_date("orders")
        .then(res => console.log(res))
        .catch(err => console.log(err));
      } else {
        save_order(query)
        .then(res => {
          start_date = new Date(sub_end_date);
          end_id = end_num;
          is_fetch = false;

          save_latest_date("orders") // save latest index
          .then(res => {
            // setTimeout(get_orders, 2000);
          })
          .catch(err => console.log(err));
          
        });
      }
    }
  })
  .catch(err => console.error(err));  
}

const delete_table = (table) => { // delete table
  return new Promise((resolve, reject) => {
    db.query(`DROP TABLE ${table}`, (err, res) => {
      if (err) {
        console.log("Fail to delete", err.message);
        reject(err);
      }
      else {
        console.log("Success to delete"); 
        resolve(res);
      }
    });
  });
}

const update_orders = (req, res) => {
  db.query(`SELECT latestDate, latestId FROM latest WHERE type="orders"`, (err, r) => {
    start_date = new Date(r[0]["latestDate"]);
    end_id = r[0]["latestId"];
    end_date = new Date();
    
    get_orders();
  })
}

app.get("/delete/:tablename", (req, res) => {
  delete_table(req.params.tablename)
  .then(r => {
    res.send(`Success to delete or check ${req.params.tablename}`);
  }).catch(err => {
    res.send(`Fail to delete ${req.params.tablename}`);
  })
});

app.get("/check/:tablename", (req, res) => {
  check_table_start(req.params.tablename)
  .then(r => {
    res.send(`Success to create or check ${req.params.tablename}`);
  }).catch(err => {
    res.send(`Fail to create ${req.params.tablename}`);
  })
});

app.get('/get/orders', (req, res) => get_orders());

app.get('/update/orders', (req, res) => update_orders());

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
  get_orders();
})