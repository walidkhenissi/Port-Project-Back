const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const {sequelize} = require('./models/index.js');
const app = express();
const PORT = 3000;
var morgan = require('morgan');
var session = require('express-session');
var ClusterStore = require('strong-cluster-connect-store')(session);
//global
tools = require('./utils/utils');
sequelizeAdapter = require('./utils/sequelizeAdapter');
moment = require("moment");
// local = require('moment/locale/fr');
// moment.locale('fr');
_ = require('lodash');
dbDateFormat = "YYYY-MM-DD";
dbDateTimeFormat = "YYYY-MM-DD HH:mm:ss";
productSalesAccountKey = "PRODUCT_SALES";
producerPaymentAccountKey = "PRODUCER_PAYMENT";
app.use(session({
   // store: new ClusterStore(),
    secret: 'keyboard cat',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,            // Le cookie est inaccessible via JavaScript
        secure: false,
        sameSite: 'lax',
        secure: false,             // `true` en production avec HTTPS
        maxAge: 1000 * 60 * 60 * 24  // 🔥 24 heures (au lieu de 1h)
    }

    }));


// Middleware
//app.use(bodyParser.json());
//app.use(cors());
//middlewares
app.use(morgan('dev'));
//        app.use(bodyParser.json());
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));

//end middlewares
app.use('*', cors({origin: true, credentials: true}));


app.use(express.static('./public'));
app.use(express.static('./files'));
//Generic controller
app.use('/generic', require('./controllers/GenericController'));

// // MySQL Connection
// const connection = mysql.createConnection({
//     host: 'localhost',
//     user: 'root',
//     password: 'port_application',
//     database: 'port_application',
// });
//
// connection.connect((err) => {
//     if (err) {
//         console.error('Error connecting to MySQL:', err);
//     } else {
//         console.log('Connected to MySQL');
//     }
// });

sequelize.sync({alter: true})
    .then(() => {
        console.log('Database synchronized successfully.');
    })
    .catch(err => {
        console.error('Error synchronizing database:', err);
    });

// Routes

// Merchant routes
app.use('/merchant', require('./controllers/merchant/merchantController.js'));

// Shipowner routes
app.use('/shipowner', require('./controllers/shipownerController'));

// Boat activity type routes
app.use('/boatActivity', require('./controllers/boat/boat.activity.type/boatActivityTypeController'));


// Boat routes
app.use('/boat', require('./controllers/boatController'));
//Commission routes
app.use('/commission', require('./controllers/commissionController'));
app.use('/commissionHistory', require('./controllers/commissionHistoryController'));
app.use('/beneficiary', require('./controllers/beneficiaryController'));
app.use('/commissionBeneficiary', require('./controllers/commissionBeneficiaryController'));
app.use('/commissionValueController', require('./controllers/commissionValueController'));
app.use('/article', require('./controllers/articleController'));
app.use('/sale', require('./controllers/saleController'));
app.use('/salesTransaction', require('./controllers/salesTransactionController'));
app.use('/balance', require('./controllers/balanceController'));
app.use('/beneficiaryBalance', require('./controllers/beneficiaryBalanceController'));
app.use('/boxesBalance', require('./controllers/boxesBalanceController'));
app.use('/boxesTransaction', require('./controllers/boxesTransactionController'));
app.use('/bank', require('./controllers/bankController'));
app.use('/payment', require('./controllers/paymentController'));
app.use('/salesTransactionPayment', require('./controllers/salesTransactionPaymentController'));
app.use('/salePayment', require('./controllers/salePaymentController'));
app.use('/cashTransaction', require('./controllers/cashTransactionController'));
// User routes
app.use('/auth', authRoutes);

// User registration
app.post('/addUser', async (req, res) => {
    const {username, password, email} = req.body;

    // Hash the password before storing it
    const hashedPassword = await bcrypt.hash(password, 10);

    const insertQuery = 'INSERT INTO users (username, password, email) VALUES (?, ?, ?)';

    connection.query(insertQuery, [username, hashedPassword, email], (err, results) => {
        if (err) {
            console.error('Error adding user to MySQL:', err);
            res.status(500).json({error: 'Internal Server Error'});
        } else {
            console.log('User added to MySQL:', results);
            res.status(201).json({message: 'User added successfully'});
        }
    });
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
